/**
 * The crate, as the page receives it.
 *
 * This is the wiring the project waited on. Before it, `prototypes/crate` (now `src/ui`) fetched a snapshot
 * of the **whole library** and filtered it on a boolean, and `src/store/`'s approval gate —
 * tested, and correct — was never called by anything. Worse, the page's error path fell back
 * to a hardcoded mock set, so a briefly-unreachable store put twenty albums nobody had
 * approved in front of the child. Both are gone: the only source of albums is the store, and
 * the store's only way in is `approve()`, which refuses anything that was not reviewed.
 *
 * Music Assistant is not consulted here at all. The crate must render with MA switched off —
 * that is §10's "MA unreachable: sleepy crate, covers from cache", and it is only possible
 * because everything the page needs to *draw* an album lives in SQLite. MA is asked for the
 * cover bytes and for playback, and for nothing else.
 */
import type { DatabaseSync } from "node:sqlite";
import {
  allTracks, counts, crateAlphabetical, favouriteTracks, manualFavourites, mostPlayed,
  newlyReleased, recentlyPlayed, type StoredAlbum,
} from "../store/crate.ts";
import { coverPath } from "../ma/images.ts";

/**
 * One page of the crate is nine sleeves, and both shelves show at most one page. A shelf you
 * can get lost in is just a second crate (§4.1).
 */
const SHELF_SIZE = 9;

/** The crate tile at 2x. `sm` is what the grid loads, `lg` what a HiDPI screen needs. */
const cover = (proxyId: string | null) =>
  proxyId ? { sm: coverPath(proxyId, 160, 2), lg: coverPath(proxyId, 512, 2) } : null;

export interface WireTrack {
  n: number;
  title: string;
  uri: string | null;
  /**
   * A track he keeps choosing. Derived from the play log, never declared — the ALGORITHMIC
   * mark. The page draws a mark beside it; the mark never reorders anything.
   */
  favourite: boolean;
  /**
   * A track he was told is a favourite — the MANUAL mark, set through a tap on the kiosk's own
   * trackpad or by a parent. A deliberate, later override of the "never declared" rule above;
   * kept as a second field rather than folded into `favourite` so the page can draw the two
   * differently and neither can be mistaken for the other.
   */
  favouriteManual: boolean;
}

export interface WireAlbum {
  /** The MA handle. It is the album's identity here and the only thing ever sent to play. */
  uri: string;
  artist: string;
  title: string;
  year: number | null;
  /** null means unknown, and unknown is never clean (docs/research/03). */
  explicit: boolean | null;
  /** null means MA knows of no artwork: the page draws a procedural sleeve, not a hole. */
  cover: { sm: string; lg: string } | null;
  tracks: WireTrack[];
}

export interface WireSlot {
  /**
   * A plain sequential index into `slots` — the grid's display order, alphabetical by artist
   * (docs/ARCHITECTURE.md §4.1). No longer the database `position`: that value is still
   * assigned append-only and still permanent (§5.1), it has just stopped being what the child
   * sees. Nothing on the page reads this as anything but an array index.
   */
  position: number;
  album: WireAlbum;
}

export interface WireCrate {
  slots: WireSlot[];
  /**
   * The *new*, *recent* and *most-played* shelves, as uris into `slots`. Sent as order rather
   * than as albums so an album cannot arrive on a shelf without being in the crate first — the
   * gate holds on the way out as well as on the way in. `new` is server-computed from the
   * permanent internal release position (`newlyReleased`), not from the crate's own now-
   * alphabetical array order — see §4.1.
   */
  shelves: { new: string[]; recent: string[]; played: string[] };
  /** For the parent's settings screen. The child's interface never shows a number. */
  counts: ReturnType<typeof counts>;
}

const wire = (a: StoredAlbum, tracks: WireTrack[]): WireAlbum => ({
  uri: a.uri,
  // "[unknown]" — brackets included — is how a tag-less rip arrives. An em dash is a better
  // thing for the caption to say, and the caption is not for the child anyway.
  artist: a.artist || "—",
  title: a.title,
  year: a.year,
  explicit: a.explicit,
  cover: cover(a.coverProxyId),
  tracks,
});

export function wireCrate(db: DatabaseSync, profileId: string): WireCrate {
  const tracksByUri = allTracks(db, profileId);
  const favourites = favouriteTracks(db, profileId);
  const manual = manualFavourites(db, profileId);

  /**
   * An album with no number line is not shown at all.
   *
   * Until `src/server/tracks.ts` existed, only the seed cached tracks — so every album
   * approved at /admin landed here with none, and opening one told a four-year-old in
   * English that Music Assistant had returned no tracks. `release()` now refuses to place a
   * trackless album in the first place, so this only ever covers the ones released before
   * that rule existed — and it heals itself, because the moment the sweep caches the tracks
   * the album simply appears in its alphabetical place. Under alphabetical order there is no
   * fixed slot to leave empty for it, so it is filtered out rather than drawn as a gap.
   */
  const slots: WireSlot[] = crateAlphabetical(db, profileId)
    .map((a): WireSlot | null => {
      const stored = tracksByUri.get(a.uri) ?? [];
      if (stored.length === 0) return null;
      const fav = favourites.get(a.uri);
      const man = manual.get(a.uri);
      const tracks = stored.map((t) => ({
        ...t, favourite: fav?.has(t.n) ?? false, favouriteManual: man?.has(t.n) ?? false,
      }));
      return { position: 0, album: wire(a, tracks) };
    })
    .filter((s): s is WireSlot => !!s)
    .map((s, i) => ({ ...s, position: i }));

  return {
    slots,
    shelves: {
      new: newlyReleased(db, profileId, SHELF_SIZE),
      recent: recentlyPlayed(db, profileId, SHELF_SIZE),
      played: mostPlayed(db, profileId, SHELF_SIZE).map((p) => p.uri),
    },
    counts: counts(db, profileId),
  };
}
