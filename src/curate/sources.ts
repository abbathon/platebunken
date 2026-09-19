/**
 * Where suggestions come from: MusicBrainz for identity, ListenBrainz Labs for neighbours.
 *
 * Both were verified live on 2026-09-19 against the real services. Two traps are load-bearing
 * and are the reason this file exists rather than two inline fetches:
 *
 *   - **Labs returns `[]` for an MBID it does not know, not an error.** A wrong id and an
 *     artist with no neighbours are indistinguishable, so identity has to be resolved through
 *     MusicBrainz first and a miss has to be reported as a miss.
 *   - **The `algorithm` parameter is mandatory and undocumented in prose.** There is no
 *     default. Omit it and the call fails; get it wrong and you get `[]` again.
 *
 * Both services are free, unauthenticated and run by a non-profit. MusicBrainz asks for no
 * more than one request per second and a real User-Agent, and this file honours that rather
 * than relying on the caller to remember — see `RATE`.
 *
 * docs/research/03-discovery-and-filtering.md §1.3 and §1.4.
 */

/** Public on every request. No hostname, no household detail. */
export const USER_AGENT = "platebunken/1.0 (https://github.com/abbathon/platebunken)";

/**
 * The exact algorithm string the Labs endpoint requires.
 *
 * Copied from the Labs web UI for `similar-artists`, which is the only place it is written
 * down. It encodes the dataset parameters, so changing it changes which neighbours come back;
 * it is a constant rather than a setting because nothing in this product can evaluate a
 * different one.
 */
export const LABS_ALGORITHM =
  "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30";

/** MusicBrainz: "no more than one request per second". A floor, not an average. */
export const RATE = { musicbrainz: 1100, labs: 300, metalArchives: 3000 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One queue per host, so two callers cannot together exceed a service's rate. */
const lastCall = new Map<string, number>();
export async function paced(host: string, minIntervalMs: number): Promise<void> {
  const since = Date.now() - (lastCall.get(host) ?? 0);
  if (since < minIntervalMs) await sleep(minIntervalMs - since);
  lastCall.set(host, Date.now());
}

export interface Neighbour {
  mbid: string;
  name: string;
  /** Labs' own similarity score. Higher is closer; the scale is not normalised. */
  score: number;
}

/**
 * Fold a name to something two services can be compared on.
 *
 * Diacritics go because "Nattfödd" and "Nattfodd" are the same record, punctuation goes
 * because "Mr. Pimp-Lotion" and "Mr Pimp Lotion" are the same act, and a leading "the" goes
 * because catalogues disagree about it constantly. Deliberately NOT used to merge anything in
 * the store — it is only ever used to decide whether a search result is the artist we asked
 * for, which is a question with a person waiting behind it.
 */
export function foldName(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Whether a search result is actually by the artist we asked about. */
export const sameArtist = (a: string, b: string): boolean => foldName(a) === foldName(b);

export interface Fetcher {
  (url: string, init?: RequestInit): Promise<Response>;
}

async function getJson(url: string, fetchImpl: Fetcher): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

/**
 * An artist name to its MusicBrainz id, or null.
 *
 * Returns null rather than a best guess. A wrong MBID here does not fail loudly — it produces
 * a confidently empty neighbour list, or worse, somebody else's neighbours, and the parent
 * would have no way of telling. The score threshold is what stops "Dio" matching a covers band
 * nobody meant.
 */
export async function resolveArtistMbid(
  name: string,
  fetchImpl: Fetcher = fetch,
  minScore = 90,
): Promise<{ mbid: string; name: string } | null> {
  await paced("musicbrainz", RATE.musicbrainz);
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=5&fmt=json`;
  const data = (await getJson(url, fetchImpl)) as { artists?: { id: string; name: string; score: number }[] };

  for (const a of data.artists ?? []) {
    if (a.score < minScore) break;            // the list is score-ordered
    if (sameArtist(a.name, name)) return { mbid: a.id, name: a.name };
  }
  return null;
}

/**
 * The neighbours of one artist, best first.
 *
 * An empty array is a real answer — plenty of artists have no neighbours in the dataset — and
 * is returned as such. The caller distinguishes "no neighbours" from "never looked" by whether
 * it got here at all.
 */
export async function similarArtists(mbid: string, fetchImpl: Fetcher = fetch): Promise<Neighbour[]> {
  await paced("labs", RATE.labs);
  const url =
    `https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${encodeURIComponent(mbid)}` +
    `&algorithm=${encodeURIComponent(LABS_ALGORITHM)}`;
  const data = await getJson(url, fetchImpl);

  // Verified shape: a flat array of {artist_mbid, name, score}. Some Labs endpoints wrap their
  // result in an outer array, so unwrap defensively rather than trusting one observation.
  const rows = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : (data as unknown[]);
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => r as { artist_mbid?: string; name?: string; artist_name?: string; score?: number })
    .filter((r) => r.artist_mbid && (r.name ?? r.artist_name))
    .map((r) => ({ mbid: r.artist_mbid!, name: (r.name ?? r.artist_name)!, score: Number(r.score ?? 0) }));
}
