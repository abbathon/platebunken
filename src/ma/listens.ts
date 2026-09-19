/**
 * What is actually playing, and what actually finished.
 *
 * `client.ts` reports raw queue state: a full PlayerQueue, several times per transition, with
 * no memory. That is the wrong shape for every caller. Three features need the same three
 * answers — *what is on now*, *what just finished*, and *did he choose it or did it just come
 * next* — and if each derived them from raw events there would be three copies of the same
 * state machine, each wrong in a different way.
 *
 * So this is the seam. Queue events in, `Listen` records out. Callers learn one type and one
 * callback; everything about MA's event cadence, duplicate payloads, pause arithmetic and
 * track-transition detection stays in here.
 *
 *   ARCHITECTURE.md §7   (audio path)
 *   ARCHITECTURE.md §10  (recovery: grouped away, taken by another source)
 *   src/store/schema.ts  (migration v3, on why deliberate and auto-advance stay separate)
 *
 * **Nothing here writes to the store and nothing here talks to ListenBrainz.** It reports; the
 * caller decides. That is what makes the whole thing testable without a database, a speaker or
 * a network — which matters, because the alternative is testing it by playing music in a
 * child's bedroom.
 */
import type { PlayerQueue, QueueItem } from "./types.ts";

/**
 * A track that played, as this system understands it.
 *
 * `trackUri` is the identity and may be null: a radio stream or a provider hiccup can leave a
 * QueueItem with a display name and no resolved media item. Callers must handle that rather
 * than assume — the store's own `recordPlay` already refuses an unknown album, and this type
 * is deliberately honest enough to let it.
 */
export interface Listen {
  /** The album this track belongs to, when MA resolved one. */
  albumUri: string | null;
  trackUri: string | null;
  /** MA's display string, "Artist - Title". Never parse it; it is for logs and the screen. */
  name: string;
  /**
   * The real title and release, from the resolved media item rather than split out of `name`.
   *
   * These exist because ListenBrainz wants `track_name` and `release_name` as separate simple
   * strings, and splitting the display string on " - " is wrong for any artist with a hyphen
   * in the name. Null when MA has not resolved the item — submit nothing rather than a guess.
   */
  trackName: string | null;
  albumName: string | null;
  /** The numeral the child pressed, when known. Null is NOT track 1 — see schema.ts v3. */
  trackNumber: number | null;
  artist: string | null;
  durationSec: number | null;
  /** Server clock. The Docker host has WAN and NTP; the kiosk does not, and is not in this path. */
  startedAt: Date;
  /** Seconds spent in `playing`. Paused time is not heard time. */
  heardSec: number;
  /** Met the submission threshold below. A skipped track is still a Listen, just not complete. */
  completed: boolean;
  /**
   * He chose this track, rather than it arriving because the previous one ended.
   *
   * The favourite derivation counts deliberate plays ONLY, and that is the entire basis of
   * the feature: a four-year-old who walks back to the screen to press 7 again is telling you
   * something that autoplay never could. Folding these together would quietly turn "his
   * favourites" into "whatever is early on the records he likes".
   */
  deliberate: boolean;
}

/**
 * The submission threshold, from the ListenBrainz and Last.fm convention: a listen counts once
 * it has run for four minutes, or for half the track, whichever comes first — and tracks under
 * 30 seconds never count.
 *
 * These are not tuning knobs. They are what every other scrobbling client uses, and matching
 * them is what keeps this household's listen history comparable with everyone else's.
 */
export const COMPLETE_AFTER_SEC = 240;
export const COMPLETE_SHARE = 0.5;
export const MIN_TRACK_SEC = 30;

export function isComplete(heardSec: number, durationSec: number | null): boolean {
  if (durationSec !== null && durationSec < MIN_TRACK_SEC) return false;
  if (heardSec >= COMPLETE_AFTER_SEC) return true;
  // A track of unknown length cannot be judged by share, so only the four-minute rule applies.
  if (durationSec === null) return false;
  return heardSec >= durationSec * COMPLETE_SHARE;
}

export interface ListenTrackerOptions {
  /** Only this queue is followed. A player_id and its own queue_id are the same string. */
  queueId: string;
  /** Called once per track that ended, in order. Never called for a track still playing. */
  onListen: (listen: Listen) => void;
  /** Injectable for tests. Milliseconds, as `Date.now`. */
  now?: () => number;
}

/** What is on right now — the honest answer, for the now-playing screen. */
export interface NowPlaying {
  albumUri: string | null;
  trackUri: string | null;
  name: string;
  trackName: string | null;
  albumName: string | null;
  trackNumber: number | null;
  artist: string | null;
  durationSec: number | null;
  playing: boolean;
  deliberate: boolean;
}

type Open = {
  itemId: string;
  item: QueueItem;
  startedAtMs: number;
  deliberate: boolean;
  /** Accumulated seconds in `playing`, excluding the segment currently running. */
  heardSec: number;
  /** When the current playing segment began, or null while paused. */
  runningSinceMs: number | null;
};

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function describe(item: QueueItem) {
  const media = item.media_item ?? null;
  return {
    albumUri: media?.album?.uri ?? null,
    trackUri: media?.uri ?? null,
    name: item.name,
    trackName: media?.name ?? null,
    albumName: media?.album?.name ?? null,
    trackNumber: asNumber(media?.track_number),
    artist: media?.artists?.[0]?.name ?? null,
    // QueueItem.duration is seconds and is the one MA actually buffered; the media item's is
    // the catalogue value. They disagree on some providers, and the queue's is the truth.
    durationSec: asNumber(item.duration) ?? asNumber(media?.duration),
  };
}

export function createListenTracker(opts: ListenTrackerOptions) {
  const now = opts.now ?? Date.now;
  let open: Open | null = null;
  /**
   * Armed by `expectDeliberate()` immediately before the server issues a play command, and
   * spent by the next track that opens.
   *
   * Attribution comes from the fact that THIS server issued the command, not from a timing
   * window against what the page said. The server is the only thing that knows for certain,
   * and a window would misattribute exactly when it matters most: the child pressing a new
   * track a second before the old one ended.
   */
  let deliberateArmed = false;

  function close(at: number): void {
    if (!open) return;
    const finished = open;
    open = null;
    const heardSec = finished.heardSec + (finished.runningSinceMs === null ? 0 : (at - finished.runningSinceMs) / 1000);
    const d = describe(finished.item);
    opts.onListen({
      ...d,
      startedAt: new Date(finished.startedAtMs),
      heardSec: Math.round(heardSec),
      completed: isComplete(heardSec, d.durationSec),
      deliberate: finished.deliberate,
    });
  }

  return {
    /**
     * Arm the next track as a deliberate choice.
     *
     * Call this immediately BEFORE issuing a play command, not after: MA can report the new
     * queue faster than the command's own reply comes back, and arming afterwards would
     * attribute the child's own choice to autoplay.
     */
    expectDeliberate(): void {
      deliberateArmed = true;
    },

    /**
     * Feed one queue event. Idempotent: MA sends the same payload under two event names for a
     * single change, and a repeat must not close or reopen anything.
     */
    observe(q: PlayerQueue): void {
      if (q.queue_id !== opts.queueId) return;
      const at = now();
      const item = q.current_item;
      const itemId = item?.queue_item_id ?? null;
      const playing = q.state === "playing";

      // Nothing on: whatever was open has ended. Covers stop, the end of the last track, and
      // §10's "the speaker was taken by another source" — from here they are the same event.
      if (!item || !itemId) {
        close(at);
        return;
      }

      if (open && open.itemId === itemId) {
        // Same track. The only thing that can have changed is whether it is running.
        if (playing && open.runningSinceMs === null) {
          open.runningSinceMs = at;
        } else if (!playing && open.runningSinceMs !== null) {
          open.heardSec += (at - open.runningSinceMs) / 1000;
          open.runningSinceMs = null;
        }
        // Keep the freshest copy: MA fills in the resolved media_item a beat after the item
        // first appears, so the second payload often carries the uri the first one lacked.
        open.item = item;
        return;
      }

      // A different track. The previous one is finished, whatever it was.
      close(at);
      open = {
        itemId,
        item,
        startedAtMs: at,
        deliberate: deliberateArmed,
        heardSec: 0,
        runningSinceMs: playing ? at : null,
      };
      deliberateArmed = false;
    },

    /**
     * What is on, or null. This is what the now-playing screen should read instead of echoing
     * what the child pressed — that guess goes wrong the moment track 1 ends.
     */
    current(): NowPlaying | null {
      if (!open) return null;
      return { ...describe(open.item), playing: open.runningSinceMs !== null, deliberate: open.deliberate };
    },

    /**
     * End the open listen now — on shutdown, or when MA goes away.
     *
     * A listen that is open when the process dies is a listen that never happened, and on a
     * container that redeploys often that is a real loss. Closing it early under-counts the
     * tail rather than dropping the whole record.
     */
    flush(): void {
      close(now());
    },
  };
}

export type ListenTracker = ReturnType<typeof createListenTracker>;
