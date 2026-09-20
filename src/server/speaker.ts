/**
 * Everything this process does to Music Assistant.
 *
 * The rule that does not change: **the page never holds a credential.** The token lives here,
 * the page posts a uri, and MA is asked exactly the two runtime questions §5.1 allows — *give
 * me this cover* (the imageproxy passthrough in `app.ts`) and *play this uri*. It is never
 * asked what it has got. That answer belongs to the store, and the approval gate is the only
 * way into the store.
 *
 * The one exception is `players()`, which asks MA what output devices exist. That is a parent
 * surface behind the keypad (§4.6) and never reaches the child's crate.
 *
 * Ported from the dev-only Vite plugin that stood in for this file. There is no second copy
 * now: `vite dev` proxies to this server, so what is developed against is what ships.
 */
import { MassClient } from "../ma/client.ts";
import { createListenTracker, type Listen, type ListenTracker, type NowPlaying } from "../ma/listens.ts";
import { createScrobbler } from "./scrobble.ts";
import { config, maConfigured } from "./config.ts";

let client: MassClient | null = null;
let connecting: Promise<MassClient> | null = null;

/**
 * The output player, overridable at runtime from the parent's settings screen.
 *
 * This used to be process memory, which meant the speaker the parent chose reverted to
 * `PLAYER_ID_PRIMARY` on every container restart — and with a container that is every
 * redeploy. It is a stored setting now; `index.ts` restores it at boot and `app.ts` writes it
 * when it changes. `.env` remains the answer when nothing has ever been chosen.
 */
let targetOverride: string | null = null;

export const target = (): string => targetOverride ?? config.playerId;

/**
 * Put back a target chosen in an earlier run. Not validated against MA here: this runs at
 * boot, MA may not be reachable yet, and a speaker that is merely switched off must not be
 * silently forgotten. `setTarget` does validate, because there a person is watching.
 */
export function restoreTarget(playerId: string | null): void {
  targetOverride = playerId;
}

/**
 * What is actually playing on the chosen speaker.
 *
 * Rebuilt whenever the target changes, because a tracker follows exactly one queue and a
 * half-finished record on the old speaker is not a listen on the new one. `null` until the
 * first connection: there is no queue to follow before there is a client.
 */
let tracker: ListenTracker | null = null;
let trackedQueue: string | null = null;

/**
 * Listens are LOGGED, not yet stored.
 *
 * The page still posts `/api/played` when the child presses a track, and that is still the
 * only writer to the play log. Turning this into the writer instead is the right end state —
 * the server knows whether playback actually started and the page only knows what was
 * pressed — but it is a switchover, not an addition: running both would double-count every
 * deliberate play and halve the threshold for a favourite.
 *
 * It waits on evidence rather than on confidence. Nothing in this project has ever made a
 * sound, so no one has yet seen a real track transition. When one has been watched end to
 * end, add migration v4 (a `deliberate` column on `play`, defaulting to 1 — every existing
 * row came from a press), point the favourite derivation at it, and retire `/api/played`.
 */
const scrobbler = createScrobbler({ token: config.listenbrainz.token });

function onListen(listen: Listen): void {
  const how = listen.deliberate ? "chose" : "auto";
  const of = listen.durationSec ? `/${listen.durationSec}s` : "";
  console.log(
    `[listen] ${how} ${listen.trackNumber ?? "?"} ${listen.name} ` +
    `${listen.heardSec}s${of} ${listen.completed ? "complete" : "partial"}`,
  );
  // Fire and forget, by contract: it never throws and never blocks. A scrobble that fails
  // must not be able to affect what the child hears.
  scrobbler.submit(listen);
}

/** For the parent's settings screen: is submission on, and is anything stuck? */
export const scrobbleStatus = () => ({ enabled: scrobbler.enabled, pending: scrobbler.pending });

function trackerFor(queueId: string): ListenTracker {
  if (tracker && trackedQueue === queueId) return tracker;
  // The old tracker's open listen is real and already happened: close it before dropping it.
  tracker?.flush();
  trackedQueue = queueId;
  tracker = createListenTracker({ queueId, onListen });
  return tracker;
}

/** What is on now, or null. The now-playing screen's honest answer. */
export function nowPlaying(): NowPlaying | null {
  return tracker?.current() ?? null;
}

export async function ma(): Promise<MassClient> {
  if (client) return client;
  if (!connecting) {
    const c = new MassClient({
      baseUrl: config.ma.baseUrl,
      token: config.ma.token,
      // The only reason the server ever learns that track 2 started when track 1 ended.
      onQueueUpdate: (q) => trackerFor(target()).observe(q),
    });
    // The client reconnects itself, so one connection is cached for the life of the process.
    // A failed first connect clears the latch so the next request tries again rather than
    // sticking — an MA that was restarting when this container started must not poison it.
    connecting = c.connect().then(() => (client = c), (e) => { connecting = null; throw e; });
  }
  return connecting;
}

export function closeMa(): void {
  // Flush first: a listen still open when the process goes down is a listen that never
  // happened, and on a container that redeploys often that is a real loss.
  tracker?.flush();
  tracker = null;
  trackedQueue = null;
  client?.close();
  client = null;
  connecting = null;
}

/**
 * The child's 0..steps blocks, in MA's 0..100 units, clamped to the ceiling.
 *
 * This is where VOLUME_CEILING stops being decoration. Full blocks means exactly the ceiling
 * and nothing above it exists, which is what §4.3's "that is all there is" describes — and it
 * is a hearing-safety requirement (PRODUCT.md), not a preference.
 *
 * Pure, exported and tested, because it is the one function here whose failure is measured in
 * decibels at a four-year-old's pillow rather than in a log line.
 */
export function levelFor(step: unknown, steps: unknown, ceiling = config.volume.ceiling): number | null {
  const s = Number(step), n = Number(steps);
  if (!Number.isFinite(s) || !Number.isFinite(n) || n <= 0) return null;
  const blocks = Math.max(0, Math.min(n, s));
  return Math.max(0, Math.min(ceiling, Math.round((blocks / n) * ceiling)));
}

export interface PlayerOption {
  id: string; name: string; provider: string; model: string | null; current: boolean;
}

/**
 * The players the parent may choose between.
 *
 * Filtered on `type !== "group"`, NOT on the provider domain. MA wraps protocol players in a
 * Universal Player, so the laptop's squeezelite player reports `provider: "universal_player"`
 * and a domain filter misses it entirely. That cost most of an hour and three wrong theories.
 */
export async function players(): Promise<PlayerOption[]> {
  const c = await ma();
  const chosen = target();
  return c.players
    .filter((p) => p.available && p.type !== "group")
    .map((p) => ({
      id: p.player_id,
      name: p.name,
      provider: p.provider,
      model: p.device_info?.model ?? null,
      current: p.player_id === chosen,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

export async function setTarget(playerId: string): Promise<boolean> {
  const c = await ma();
  if (!c.player(playerId)) return false;
  targetOverride = playerId;
  console.log(`[speaker] output switched to ${playerId}`);
  return true;
}

export interface PlayRequest {
  uri: string;
  step: unknown;
  steps: unknown;
  startIndex?: unknown;
  startUri?: string;
}

/**
 * Start a record.
 *
 * **Volume BEFORE audio, always, and a failure to set it stops the play.** The speaker is
 * shared: it can be sitting at whatever level the last person to use it left it at, and the
 * first thing a record does here is arrive in a child's bedroom. Starting the music and
 * correcting the volume afterwards means the loud moment still happened. So this is not
 * best-effort, and the `await` order below is the whole point of the function.
 */
export async function play(req: PlayRequest): Promise<number> {
  const player = target();
  const c = await ma();

  const level = levelFor(req.step, req.steps) ?? config.volume.start;
  await c.setVolume(player, level);

  // BEFORE the command, not after. MA can report the new queue faster than the command's own
  // reply comes back, and arming afterwards would credit the child's own choice to autoplay.
  trackerFor(player).expectDeliberate();
  await c.playAlbum(player, req.uri, req.startUri);

  // Only reached for an album whose tracks carry no uri — an unseeded or partially tagged
  // record. `start_item` above is one command; this is a play followed by a jump, and the
  // brief burst of the wrong track is exactly why it is the fallback and not the path.
  const index = Number(req.startIndex);
  if (!req.startUri && Number.isFinite(index) && index > 0) {
    await c.playIndex(player, index).catch(() => {});
  }
  return level;
}

export async function setVolume(step: unknown, steps: unknown): Promise<number | null> {
  const level = levelFor(step, steps);
  if (level === null) return null;
  await (await ma()).setVolume(target(), level);
  return level;
}

export const playPause = async () => { await (await ma()).playPause(target()); };
export const next = async () => { await (await ma()).next(target()); };

/**
 * Whether this process can actually play anything right now.
 *
 * **Asks `target()`, not `config.playerId`,** and that distinction was a real bug: a
 * deployment with an empty `PLAYER_ID_PRIMARY` — which is the correct state until the volume
 * ceiling comes from an SPL measurement at the pillow — reported `canPlay:false` forever, no
 * matter which speaker the parent picked. The choice was stored, restored at boot and shown
 * in the settings screen, and the one function deciding whether to allow audio never looked
 * at it.
 *
 * False leaves the crate silent rather than half-wired: the page renders, the covers are
 * there, and Enter does nothing audible. That is a deliberately better failure than a crate
 * that looks broken.
 *
 * The decision is split out as `playable` so it can be tested across all four combinations
 * without an environment to juggle — the same reason `levelFor` and `trickleDue` are pure.
 */
export const playable = (maReady: boolean, player: string): boolean => maReady && Boolean(player);

export const canPlay = (): boolean => playable(maConfigured(), target());
