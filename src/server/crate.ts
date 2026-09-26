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
  allTracks, counts, crate, favouriteTracks, mostPlayed, recentlyPlayed, type StoredAlbum,
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
   * A track he keeps choosing. Derived from the play log, never declared — there is no "like"
   * button and there must not be one, because the product does four things and refuses the
   * fifth. The page draws a mark beside it; the mark never reorders anything.
   */
  favourite: boolean;
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
  position: number;
  /**
   * null is a withdrawn slot and renders as an empty tile. **The page must not compact this
   * array.** The gap is the point: it is what keeps every position after it exactly where the
   * child left it, which is principle 2 and the reason the crate is append-only at all.
   */
  album: WireAlbum | null;
}

export interface WireCrate {
  slots: WireSlot[];
  /**
   * The *recent* and *most-played* shelves, as uris into `slots`. Sent as order rather than
   * as albums so an album cannot arrive on a shelf without being in the crate first — the
   * gate holds on the way out as well as on the way in.
   */
  shelves: { recent: string[]; played: string[] };
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

  const slots = crate(db, profileId).map((s): WireSlot => {
    if (!s.album) return { position: s.position, album: null };
    const stored = tracksByUri.get(s.album.uri) ?? [];

    /**
     * An album with no number line is not shown at all.
     *
     * Until `src/server/tracks.ts` existed, only the seed cached tracks — so every album
     * approved at /admin landed here with none, and opening one told a four-year-old in
     * English that Music Assistant had returned no tracks. A record that opens onto a
     * sentence he cannot read is worse than no record.
     *
     * It becomes an EMPTY SLOT, which is the same thing a withdrawn album becomes, and for
     * the same reason: the position is spent and permanent, so hiding the album must not be
     * allowed to move anything after it. `release()` now refuses to place a trackless album
     * in the first place, so this path only ever covers the ones released before that rule
     * existed — and it heals itself, because the moment the sweep caches the tracks the
     * cover appears in the slot it always had.
     */
    if (stored.length === 0) return { position: s.position, album: null };

    const fav = favourites.get(s.album.uri);
    const tracks = stored.map((t) => ({ ...t, favourite: fav?.has(t.n) ?? false }));
    return { position: s.position, album: wire(s.album, tracks) };
  });

  return {
    slots,
    shelves: {
      recent: recentlyPlayed(db, profileId, SHELF_SIZE),
      played: mostPlayed(db, profileId, SHELF_SIZE).map((p) => p.uri),
    },
    counts: counts(db, profileId),
  };
}
