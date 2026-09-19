/**
 * Deezer's related-artists graph, as a second opinion.
 *
 * Keyless, unauthenticated, no registration — verified live 2026-09-19, and again the same day
 * against this crate's own artists. It exists here because ListenBrainz Labs is one dataset and
 * one dataset is a single point of failure for the only thing that fills the review queue.
 *
 * It also answers a *differently shaped* question, which is the real reason. Research 03 §1.7:
 * Deezer's neighbourhood "stays inside melodic/power metal instead of drifting toward extreme
 * subgenres". For a crate a four-year-old browses, that shape is worth more than raw recall.
 * Confirmed here: Finntroll returns Ensiferum, Korpiklaani, Equilibrium, Månegarm, Eluveitie.
 *
 * ## The trap this file is built around
 *
 * **Deezer has no MBIDs and its search does not disambiguate.** Ask for an artist by name and
 * you get the best string match, with no score and no way to tell a different band with the
 * same name from the one you meant. That is not theoretical — it happened on the first run:
 *
 *   "Dumdum Boys"  ->  id 272625, "Dum Dum Boys"
 *   related        ->  Alex Chilton, The Prisoners, Union Carbide Productions
 *
 * The crate's DumDum Boys are a Norwegian rock band whose neighbours are Raga Rockers and
 * deLillos. That id is a garage/power-pop act sharing the name. Nothing about the response
 * says so — it is a 200 with plausible data, and every album it produced would have been by
 * strangers.
 *
 * So identity here is **strict**: the folded names must be equal, and a near miss is a miss.
 * `foldName` already collapses diacritics, punctuation and a leading "the", so this rejects
 * "Dum Dum Boys" vs "Dumdum Boys" on the space, which is exactly the outcome wanted — losing a
 * legitimate match costs a few suggestions, and accepting a wrong one puts a stranger's records
 * in front of a child.
 *
 * Research 03 also warns Deezer is not a documented-stable contract and has broken without
 * announcement before. It is a corroborating source: every failure here is caught and the run
 * continues on Labs alone.
 */
import { foldName, paced, USER_AGENT, type Fetcher, type Neighbour } from "./sources.ts";

/** No published quota and no X-RateLimit headers (verified). Self-throttle. */
export const DEEZER_INTERVAL_MS = 1100;

const API = "https://api.deezer.com";

async function getJson(url: string, fetchImpl: Fetcher): Promise<any> {
  await paced("deezer", DEEZER_INTERVAL_MS);
  const res = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Deezer returned HTTP ${res.status}`);
  const body = await res.json();
  // Deezer reports errors as HTTP 200 with an `error` object. A thrown error here is caught by
  // the caller and the run continues without this source.
  if (body?.error) throw new Error(`Deezer: ${JSON.stringify(body.error).slice(0, 120)}`);
  return body;
}

/**
 * The Deezer id for an artist, or null.
 *
 * Null rather than a best guess — see the header — but among EXACT name matches, the most
 * followed one wins.
 *
 * That second rule is not a nicety. Deezer's catalogue is full of duplicate artist entries
 * with identical names, and its relevance order does not put the real one first. Searching
 * "Queen" returns five exact matches, and the first is id 268175642: seven followers, two
 * albums, and **zero related artists**. The canonical Queen is id 412, with 12.8 million
 * followers and a real neighbourhood. Taking the first match meant Queen, Dio and Michael
 * Jackson all silently contributed nothing — reported as "no Deezer match", which was true
 * and completely misleading.
 *
 * `nb_fan` separates them cleanly and needs no extra request: the search response already
 * carries it.
 */
export async function deezerArtistId(
  name: string,
  fetchImpl: Fetcher = fetch,
): Promise<{ id: number; name: string; fans: number } | null> {
  const url = `${API}/search/artist?q=${encodeURIComponent(name)}&limit=10`;
  const body = await getJson(url, fetchImpl);
  const want = foldName(name);

  let best: { id: number; name: string; fans: number } | null = null;
  for (const a of (body?.data ?? []) as { id: number; name: string; nb_fan?: number }[]) {
    if (!a?.id || typeof a.name !== "string" || foldName(a.name) !== want) continue;
    const fans = Number(a.nb_fan ?? 0);
    if (!best || fans > best.fans) best = { id: a.id, name: a.name, fans };
  }
  return best;
}

/**
 * Artists Deezer considers related, best first.
 *
 * `score` is `nb_fan`, Deezer's own popularity count. It is NOT comparable with ListenBrainz
 * Labs' score — different scale, different meaning — which is why the worker interleaves the
 * two lists rather than merging and sorting them. Comparing them directly is the same mistake
 * that filled the queue with Queen and The Beatles.
 *
 * `mbid` is empty: Deezer does not carry MusicBrainz ids. Nothing downstream needs one — the
 * album lookup searches Music Assistant by name — but it is left visible rather than faked.
 */
export async function deezerRelated(
  name: string,
  fetchImpl: Fetcher = fetch,
  limit = 12,
): Promise<Neighbour[]> {
  const found = await deezerArtistId(name, fetchImpl);
  if (!found) return [];

  const body = await getJson(`${API}/artist/${found.id}/related?limit=${limit}`, fetchImpl);
  return ((body?.data ?? []) as { id: number; name: string; nb_fan?: number }[])
    .filter((a) => a?.name)
    .map((a) => ({ mbid: "", name: a.name, score: Number(a.nb_fan ?? 0) }));
}
