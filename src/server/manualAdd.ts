/**
 * The parent asking for one specific album, by name.
 *
 * `candidate.source` has allowed `'request'` since schema v1, but nothing ever produced one —
 * every album a parent has seen at /admin came from the seed playlist or from
 * `curate/worker.ts` guessing at what the child's crate implies. This is the third way in,
 * and it still goes through the same gate: `requestAlbum` only ever calls `suggest()`, so the
 * album lands in the review queue undecided and `approve()` is still the only door into the
 * crate. §5's boundary does not move for this.
 *
 * Search-then-request rather than one round trip, because a name alone is ambiguous and the
 * parent needs to see the cover before confirming this is the release they meant — a lesson
 * paid for directly: two different Qobuz uris for "Ramones — Ramones" and for "Ozzy Osbourne —
 * No More Tears" each reached the review queue as if new, one of them weeks after the parent
 * had already approved a different uri for the same record. `releaseKey` (`curate/worker.ts`)
 * is what recognises that here too, so a manual request cannot recreate the bug the automatic
 * worker was just fixed for.
 */
import type { DatabaseSync } from "node:sqlite";
import type { MassClient } from "../ma/client.ts";
import type { Album } from "../ma/types.ts";
import {
  approvedReleases, fromMassAlbum, knownReleases, setTracks, suggest, upsertAlbum, type AlbumInput,
} from "../store/crate.ts";
import { releaseKey } from "../curate/worker.ts";
import { coverPath } from "../ma/images.ts";

export interface WireSearchResult {
  uri: string;
  provider: string;
  itemId: string;
  artist: string;
  title: string;
  year: number | null;
  explicit: boolean | null;
  coverProxyId: string | null;
  cover: { sm: string; lg: string } | null;
  /**
   * A different uri for a release this store has already written down — approved, pending or
   * rejected. Advisory only: the parent has seen the cover and may still mean this exact one.
   */
  known: boolean;
}

/** A phone screen, not a library browser. Enough to recognise the right cover, no more. */
const MAX_RESULTS = 12;

/**
 * What Qobuz has for a name the parent typed.
 *
 * Same call and the same artwork rule as `curate/worker.ts` (an album with no cover is
 * invisible in a cover-art interface) — but no artist filter, because here the parent chose
 * the query on purpose and is about to choose the album on purpose too.
 */
export async function searchCatalogue(db: DatabaseSync, client: MassClient, query: string): Promise<WireSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const found = await client.command<{ albums?: Album[] }>("music/search", {
    search_query: q, media_types: ["album"], limit: 20, library_only: false,
  });

  const known = new Set(knownReleases(db).map((r) => releaseKey(r.artist, r.title)));
  const seen = new Set<string>();
  const out: WireSearchResult[] = [];

  for (const a of found?.albums ?? []) {
    if (!a.metadata?.images?.some((i) => i.proxy_id)) continue;
    const input = fromMassAlbum(a);
    const key = releaseKey(input.artist, input.title);
    if (seen.has(key)) continue; // the same release from two catalogue listings in one search
    seen.add(key);
    out.push({
      uri: input.uri,
      provider: input.provider,
      itemId: input.itemId,
      artist: input.artist,
      title: input.title,
      year: input.year ?? null,
      explicit: input.explicit ?? null,
      coverProxyId: input.coverProxyId ?? null,
      cover: input.coverProxyId
        ? { sm: coverPath(input.coverProxyId, 256, 2), lg: coverPath(input.coverProxyId, 512, 2) }
        : null,
      known: known.has(key),
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export interface RequestResult {
  ok: boolean;
  error?: string;
}

/**
 * Put the album the parent picked into the review queue, cached with its track list rather
 * than after it — the same fix, and the same reason, as `curate/worker.ts`: an album that
 * reaches the crate with no cached number line opens onto nothing for a pre-reader.
 *
 * Refuses only when this exact release is already in the crate, under any uri — a position is
 * permanent, so spending a second one on the same record is never the parent's actual intent.
 * Anything short of that (pending, rejected, or genuinely new) is let through: `suggest()` is
 * idempotent and a person is about to look at this card regardless.
 */
export async function requestAlbum(
  db: DatabaseSync,
  client: MassClient,
  profileId: string,
  input: AlbumInput,
): Promise<RequestResult> {
  const key = releaseKey(input.artist, input.title);
  if (approvedReleases(db, profileId).some((r) => releaseKey(r.artist, r.title) === key)) {
    return { ok: false, error: "Albumet er allerede i bunken." };
  }

  upsertAlbum(db, input);
  try {
    const tracks = await client.albumTracks(input.itemId, input.provider);
    if (tracks.length) {
      setTracks(db, input.uri, tracks.map((t, i) => ({ n: t.track_number ?? i + 1, title: t.name, uri: t.uri ?? null })));
    }
  } catch (e) {
    // Not fatal: `tracks.ts`'s half-hourly sweep retries, same as a worker suggestion would.
    console.warn(`[request] no track list for ${input.artist} — ${input.title}: ${(e as Error).message}`);
  }
  suggest(db, input.uri, "request", "Lagt til manuelt fra /admin");
  return { ok: true };
}
