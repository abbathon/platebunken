/**
 * Encyclopaedia Metallum's `Themes` field, as an advisory annotation.
 *
 * **Nothing in this file rejects anything.** It attaches a flag, the flag sorts the review
 * queue, and a person decides. ARCHITECTURE.md §5 gives the case that settles why, and it is
 * not a hypothetical: Burzum's Metal Archives themes read "Mythology, Folklore, Odalism", so
 * the single most notorious act in the genre passes every automated theme filter ever written.
 * Assume roughly 70% recall and design the surface around a human, which /admin is.
 *
 * Two findings from docs/research/03 §3.1 shape everything here:
 *
 *   - **NSBM is not a genre on Metal Archives.** `genre=NSBM` returns zero. Ideology lives in
 *     `Themes` and nowhere else, so any design that filters on genre strings catches nothing.
 *   - **The themes filter is a substring match server-side.** Asking for `Racism` returns
 *     bands themed *Anti-racism*, and asking for `Fascism` mostly returns *anti*-fascists.
 *     So the server's answer is a candidate list, and the real test is done here, on the
 *     themes string it returns, with exact tokens.
 *
 * There is no official API. The site's own DataTables endpoint returns JSON, robots.txt
 * permits `/search/` and `/bands/` and sets **Crawl-delay: 3**, which `RATE.metalArchives`
 * honours. The roster is fetched monthly and cached in the store, not asked per album.
 */
import { paced, RATE, USER_AGENT, foldName, type Fetcher } from "./sources.ts";

/**
 * The theme tokens worth pulling a roster for.
 *
 * Each is matched as an EXACT token against a band's themes, which is what keeps
 * "Anti-racism" out of the `Racism` roster — the token is "Anti-racism", and it is not equal
 * to "Racism". That is the whole mechanism, and it is why `exclusive` is not a list of
 * negations to maintain.
 *
 * Counts beside each are live from 2026-09-18 (research 03) and are here so a future run that
 * returns wildly different numbers is visibly wrong rather than quietly empty.
 */
export const THEME_TERMS: readonly { term: string; approxBands: number }[] = [
  { term: "National Socialism", approxBands: 1256 },
  { term: "Nationalism", approxBands: 542 },
  { term: "Fascism", approxBands: 513 },
  { term: "Racism", approxBands: 256 },
  { term: "White supremacy", approxBands: 69 },
  { term: "Nazism", approxBands: 50 },
  { term: "Aryan", approxBands: 20 },
];

/** The site returns a fixed page size regardless of what is asked for. Observed: 200. */
export const PAGE_SIZE = 200;

export interface ThemeBand {
  band: string;
  /** The band's page, so the parent can check the claim themselves. */
  url: string;
  /** The full themes string, verbatim, so the flag can show what actually triggered it. */
  themes: string;
  genre: string;
  country: string;
}

/**
 * Split a Metal Archives themes string into comparable tokens.
 *
 * The field is human-written and inconsistent: comma separated, sometimes with a slash,
 * sometimes with a parenthetical qualifier ("Racism (early)"), sometimes with a trailing
 * "(later)" on the whole string. Qualifiers are stripped because "Racism (early)" is still
 * Racism, and the parent is shown the raw string regardless.
 */
export function themeTokens(themes: string): string[] {
  return themes
    .split(/[,;/]/)
    .map((t) => t.replace(/\([^)]*\)/g, "").trim())
    .filter(Boolean);
}

/**
 * Whether a themes string carries a term as its own token.
 *
 * Exact, case-insensitive, token-wise. "Anti-racism" does not match "Racism"; "Racism" does.
 * This is the single test that makes the server's substring results usable.
 */
export function hasTheme(themes: string, term: string): boolean {
  const want = term.toLowerCase();
  return themeTokens(themes).some((t) => t.toLowerCase() === want);
}

/**
 * One row of the DataTables response.
 *
 * `aaData` rows are arrays of HTML fragments, not objects:
 *   [ "<a href='…/bands/Name/123'>Name</a>  <!-- score -->", genre, country, themes, year ]
 *
 * Returns null for a row that does not parse rather than throwing: this is an advisory
 * annotation source, and one malformed row must not take down a curation run.
 */
export function parseRosterRow(row: unknown): ThemeBand | null {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [linkHtml, genre, country, themes] = row.map((c) => String(c ?? ""));

  const href = /href="([^"]+)"/.exec(linkHtml)?.[1] ?? "";
  // The anchor text is the band name; strip tags and the trailing "<!-- score -->" comment.
  const band = linkHtml.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "").trim();
  if (!band || !href) return null;

  return { band, url: href, themes: themes.trim(), genre: genre.trim(), country: country.trim() };
}

/**
 * Fetch every band Metal Archives lists under one theme term.
 *
 * Paginated with `iDisplayStart` because the page size is fixed server-side — asking for five
 * returns two hundred. Each page waits out the crawl delay. Rows are filtered with `hasTheme`
 * on the way out, which is where the anti-* entries the server included are dropped.
 */
export interface RosterResult {
  /** What Metal Archives itself reported, BEFORE exact-token filtering. */
  total: number;
  /** What survived `hasTheme` — the bands actually themed with this term. */
  bands: ThemeBand[];
}

export async function fetchThemeRoster(
  term: string,
  fetchImpl: Fetcher = fetch,
  maxPages = 12,
): Promise<RosterResult> {
  const out: ThemeBand[] = [];
  let start = 0;
  let total = 0;

  for (let page = 0; page < maxPages && (page === 0 || start < total); page++) {
    await paced("metal-archives", RATE.metalArchives);
    const url =
      "https://www.metal-archives.com/search/ajax-advanced/searching/bands/" +
      `?bandName=&themes=${encodeURIComponent(term)}&sEcho=1` +
      `&iDisplayStart=${start}&iDisplayLength=${PAGE_SIZE}`;

    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Metal Archives returned HTTP ${res.status} for "${term}"`);

    const data = (await res.json()) as { iTotalRecords?: number; aaData?: unknown[] };
    total = Number(data.iTotalRecords ?? 0);
    const rows = data.aaData ?? [];
    if (!rows.length) break;

    for (const r of rows) {
      const parsed = parseRosterRow(r);
      // The server matched on a substring; this is where Anti-racism stops being Racism.
      if (parsed && hasTheme(parsed.themes, term)) out.push(parsed);
    }
    start += rows.length;
  }
  return { total, bands: out };
}

/** Roster rows keyed by folded band name, for matching against a candidate artist. */
export function indexRoster(bands: readonly ThemeBand[]): Map<string, ThemeBand> {
  const index = new Map<string, ThemeBand>();
  for (const b of bands) {
    const key = foldName(b.band);
    if (key && !index.has(key)) index.set(key, b);
  }
  return index;
}

export interface ThemeHit {
  term: string;
  band: ThemeBand;
}

/** Every theme term whose roster lists this artist. Advisory. Never a decision. */
export function themeHitsFor(
  artist: string,
  rosters: ReadonlyMap<string, ReadonlyMap<string, ThemeBand>>,
): ThemeHit[] {
  const key = foldName(artist);
  const hits: ThemeHit[] = [];
  for (const [term, index] of rosters) {
    const band = index.get(key);
    if (band) hits.push({ term, band });
  }
  return hits;
}
