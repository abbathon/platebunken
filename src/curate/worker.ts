/**
 * The curation worker. Fills the review queue; decides nothing.
 *
 *   crate artists ─▶ MusicBrainz id ─▶ Labs neighbours ─▶ Qobuz albums ─▶ annotate ─▶ suggest()
 *
 * ARCHITECTURE.md §5, §12.7. Everything it produces lands in `candidate` as undecided, where
 * the parent sees it at /admin. **It never calls `approve()`**, and the store would refuse it
 * anyway — the gate is a boundary, not a step in this pipeline.
 *
 * ## Where the albums come from, and a correction to §5
 *
 * §5 says "match against the MA library". Checked live on 2026-09-19, that produces nothing:
 * `music/search` with `library_only: true` returns **0 albums** for the artists Labs suggests,
 * because the household's library is the NAS via Jellyfin and these records are not in it. The
 * albums that can actually be played come from the Qobuz catalogue, which is what the rest of
 * §5 means by "Qobuz is the primary source and albums stream".
 *
 * So the worker searches the catalogue, not the library. **The catalogue search is fuzzy and
 * matches on title as well as artist** — searching "In Flames" returns *Ruelle — Up In Flames*
 * and *The Weeknd — Dancing In The Flames* — so every result is filtered on the artist name
 * before it is allowed anywhere near the queue. That filter is not a nicety: without it the
 * parent's queue fills with records by people they never asked about.
 *
 * ## What it refuses to do
 *
 * - No auto-rejection, ever. A theme hit is a `flag` row and a sort order.
 * - No album without artwork. An untagged album is invisible in a cover-art interface, and
 *   `counts().invisible` exists to catch the ones already in the crate — there is no reason
 *   to add more on purpose. It is the one filter here, and it is about the interface, not
 *   about the music.
 * - Nothing already known. An album the parent has already decided on never comes back.
 */
import type { DatabaseSync } from "node:sqlite";
import type { MassClient } from "../ma/client.ts";
import type { Album } from "../ma/types.ts";
import {
  addFlag, cacheGet, cachePut, cacheStale, crateArtists, fromMassAlbum, knownUris, suggest, upsertAlbum,
} from "../store/crate.ts";
import { foldName, resolveArtistMbid, sameArtist, similarArtists, type Fetcher, type Neighbour } from "./sources.ts";
import { fetchThemeRoster, indexRoster, themeHitsFor, THEME_TERMS, type ThemeBand } from "./themes.ts";

/** Roster freshness. Research 03 says monthly; the rosters move slowly and the crawl is slow. */
export const ROSTER_MAX_AGE_DAYS = 30;
/** An artist's MBID does not change. Re-checked seasonally only so a null can be retried. */
export const MBID_MAX_AGE_DAYS = 90;
/** Neighbour lists are a dataset that is rebuilt occasionally, not a live feed. */
export const SIMILAR_MAX_AGE_DAYS = 30;

export interface CurateOptions {
  profileId: string;
  /** How many neighbours of each crate artist to consider. */
  neighboursPerArtist?: number;
  /** How many albums to take from each neighbour. */
  albumsPerArtist?: number;
  /** Ceiling on how many albums one run may add to the queue. Ten seconds a day, not ten minutes. */
  maxSuggestions?: number;
  /** false runs every lookup and writes nothing. */
  write?: boolean;
  fetchImpl?: Fetcher;
  onLog?: (message: string) => void;
}

export interface CurateReport {
  crateArtists: number;
  resolved: number;
  unresolved: string[];
  neighbours: number;
  /** Neighbours skipped because the crate already has them. */
  alreadyHave: number;
  searched: number;
  candidates: { uri: string; artist: string; title: string; flags: string[] }[];
  skippedNoArtwork: number;
  skippedKnown: number;
  skippedWrongArtist: number;
}

/**
 * Round-robin across the crate's artists: everyone's favourite, then everyone's second.
 *
 * Pure and exported because the first version of this was a single global sort by Labs score,
 * and it was wrong in a way that no error could show. Labs' score is NOT normalised across
 * artists, so the household's one mainstream act outscored all of its metal and the review
 * queue came back as Queen, The Beatles, Madonna, Daft Punk and Coldplay. The worker "worked"
 * the whole time.
 *
 * A score is only comparable between neighbours of the SAME artist. Taking each crate artist's
 * best before anyone's second is what makes the queue look like the crate.
 */
export function interleaveBySeed<T>(bySeed: ReadonlyMap<string, readonly T[]>, limit: number): T[] {
  const out: T[] = [];
  const lists = [...bySeed.values()];
  const deepest = Math.max(0, ...lists.map((l) => l.length));

  for (let depth = 0; depth < deepest && out.length < limit; depth++) {
    for (const list of lists) {
      if (out.length >= limit) break;
      const item = list[depth];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}

/**
 * Album candidates for one artist, filtered to things this product can actually show.
 *
 * Exported because the artist filter is the part most likely to be wrong in a way nobody
 * notices — a queue full of near-misses looks like a working worker.
 */
export function usableAlbums(results: readonly Album[], artist: string, limit: number): Album[] {
  const out: Album[] = [];
  for (const a of results) {
    if (!a.artists?.some((x) => sameArtist(x.name, artist))) continue;
    if (!a.metadata?.images?.some((i) => i.proxy_id)) continue;   // invisible in a cover UI
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

/** Load every theme roster, from cache when it is fresh enough. */
async function rosters(
  db: DatabaseSync,
  opts: { write: boolean; fetchImpl: Fetcher; log: (m: string) => void },
): Promise<Map<string, ReadonlyMap<string, ThemeBand>>> {
  const out = new Map<string, ReadonlyMap<string, ThemeBand>>();

  for (const { term, approxBands } of THEME_TERMS) {
    let bands = cacheGet<ThemeBand[]>(db, "theme_roster", term)?.value;

    if (!bands || cacheStale(db, "theme_roster", term, ROSTER_MAX_AGE_DAYS)) {
      try {
        opts.log(`[curate] fetching Metal Archives roster: ${term} (crawl-delay 3s per page)`);
        const result = await fetchThemeRoster(term, opts.fetchImpl);
        bands = result.bands;
        /**
         * Compare the SERVER's count against the documented one, not the filtered count.
         *
         * The first version compared `bands.length` and cried wolf immediately: "Fascism"
         * reported 31 against a documented 513. Both numbers were right and they measure
         * different things — research 03's figures are `iTotalRecords`, which is the
         * server's SUBSTRING match and therefore full of anti-fascists, while ours is what
         * survives exact-token filtering. A large drop between them is the filter working,
         * which is the whole point of it. Only the server's own total can say whether the
         * endpoint still behaves as documented.
         */
        if (result.total < approxBands * 0.5) {
          opts.log(`[curate] ! "${term}": Metal Archives reports ${result.total} bands, expected around ` +
                   `${approxBands}. Check docs/research/03 §3.1 — the endpoint may have changed.`);
        }
        opts.log(`[curate]   ${term}: ${result.total} matched the substring, ${bands.length} carry the exact theme`);
        if (opts.write) cachePut(db, "theme_roster", term, bands);
      } catch (e) {
        // Annotations are advisory. Losing them degrades the sort order of the queue; it must
        // never stop the queue being filled.
        opts.log(`[curate] ! roster "${term}" unavailable: ${(e as Error).message}`);
        bands = bands ?? [];
      }
    }
    out.set(term, indexRoster(bands));
  }
  return out;
}

export async function curate(
  db: DatabaseSync,
  client: MassClient,
  opts: CurateOptions,
): Promise<CurateReport> {
  const neighboursPerArtist = opts.neighboursPerArtist ?? 12;
  const albumsPerArtist = opts.albumsPerArtist ?? 2;
  const maxSuggestions = opts.maxSuggestions ?? 24;
  const write = opts.write ?? false;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.onLog ?? ((m: string) => console.log(m));

  const report: CurateReport = {
    crateArtists: 0, resolved: 0, unresolved: [], neighbours: 0, alreadyHave: 0,
    searched: 0, candidates: [], skippedNoArtwork: 0, skippedKnown: 0, skippedWrongArtist: 0,
  };

  const themeIndex = await rosters(db, { write, fetchImpl, log });

  const seeds = crateArtists(db, opts.profileId);
  report.crateArtists = seeds.length;
  const have = new Set(seeds.map((a) => a.toLowerCase()));
  const known = knownUris(db);

  // ── crate artists -> neighbours ────────────────────────────────────
  /**
   * Neighbours grouped by the crate artist that produced them.
   *
   * Grouped rather than pooled because Labs' score is NOT normalised across artists. The first
   * version ranked one global pool by raw score, and the result was a review queue of Queen,
   * The Beatles, Madonna, Daft Punk and Coldplay: the household's one mainstream artist has
   * orders of magnitude more listeners than its metal, so his neighbours outscored everything
   * else and Amon Amarth, Finntroll and Dunderbeist contributed nothing at all.
   *
   * A score is only comparable against other neighbours of the SAME artist, so the queue is
   * built by taking each crate artist's best, then each one's second best, and so on.
   */
  const bySeed = new Map<string, { n: Neighbour; via: string }[]>();
  /** Folded neighbour name -> best score seen, so one artist is not queued twice. */
  const bestScore = new Map<string, number>();
  for (const artist of seeds) {
    let mbid = cacheGet<string | null>(db, "artist_mbid", artist)?.value ?? null;
    if (cacheStale(db, "artist_mbid", artist, MBID_MAX_AGE_DAYS)) {
      try {
        mbid = (await resolveArtistMbid(artist, fetchImpl))?.mbid ?? null;
        if (write) cachePut(db, "artist_mbid", artist, mbid);
      } catch (e) {
        log(`[curate] ! MusicBrainz lookup failed for ${artist}: ${(e as Error).message}`);
        continue;
      }
    }
    if (!mbid) { report.unresolved.push(artist); continue; }
    report.resolved++;

    let neighbours = cacheGet<Neighbour[]>(db, "similar", mbid)?.value;
    if (!neighbours || cacheStale(db, "similar", mbid, SIMILAR_MAX_AGE_DAYS)) {
      try {
        neighbours = await similarArtists(mbid, fetchImpl);
        if (write) cachePut(db, "similar", mbid, neighbours);
      } catch (e) {
        log(`[curate] ! neighbours failed for ${artist}: ${(e as Error).message}`);
        neighbours = [];
      }
    }

    const mine: { n: Neighbour; via: string }[] = [];
    for (const n of neighbours.slice(0, neighboursPerArtist)) {
      const key = foldName(n.name);
      if (have.has(n.name.toLowerCase())) { report.alreadyHave++; continue; }
      // Suggested by two crate artists is a stronger signal, but it is still one artist: keep
      // the stronger sighting and drop the weaker rather than queueing it twice.
      if ((bestScore.get(key) ?? -1) >= n.score) continue;
      bestScore.set(key, n.score);
      mine.push({ n, via: artist });
    }
    bySeed.set(artist, mine.sort((a, b) => b.n.score - a.n.score));
  }

  const ranked = interleaveBySeed(bySeed, maxSuggestions * 3);
  report.neighbours = ranked.length;

  // ── neighbours -> albums that can actually be shown ────────────────
  for (const { n, via } of ranked) {
    if (report.candidates.length >= maxSuggestions) break;

    let results: Album[];
    try {
      // library_only is false on purpose: the library has none of these. See the header.
      const found = await client.command<{ albums?: Album[] }>("music/search", {
        search_query: n.name, media_types: ["album"], limit: 10, library_only: false,
      });
      results = found?.albums ?? [];
      report.searched++;
    } catch (e) {
      log(`[curate] ! search failed for ${n.name}: ${(e as Error).message}`);
      continue;
    }

    // Counted separately so a run that produces nothing says WHY: a fuzzy search that matched
    // other people, or real matches with no cover art.
    const byThisArtist = results.filter((a) => a.artists?.some((x) => sameArtist(x.name, n.name)));
    report.skippedWrongArtist += results.length - byThisArtist.length;
    report.skippedNoArtwork += byThisArtist.filter((a) => !a.metadata?.images?.some((i) => i.proxy_id)).length;

    for (const a of usableAlbums(results, n.name, albumsPerArtist)) {
      if (known.has(a.uri)) { report.skippedKnown++; continue; }
      if (report.candidates.length >= maxSuggestions) break;

      const input = fromMassAlbum(a);
      const hits = themeHitsFor(n.name, themeIndex);

      if (write) {
        upsertAlbum(db, input);
        suggest(db, a.uri, "similar", `liker ${via}`);
        for (const h of hits) {
          // The detail carries the verbatim themes string and the band's own page, so the
          // parent can check the claim rather than take the flag's word for it.
          addFlag(db, a.uri, "nsbm-theme", "metal-archives",
            `${h.band.themes} — ${h.band.url}`);
        }
        // An artist with no MusicBrainz identity at all is one of the AI-slop signals in §5.
        // Advisory, like everything else here, and often just an obscure band.
        if (!a.metadata?.images?.length) addFlag(db, a.uri, "no-artwork", "curate", null);
      }

      known.add(a.uri);
      report.candidates.push({
        uri: a.uri, artist: a.artists?.[0]?.name ?? n.name, title: a.name,
        flags: hits.map((h) => `nsbm-theme:${h.term}`),
      });
    }
  }

  return report;
}
