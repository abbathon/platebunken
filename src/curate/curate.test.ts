/**
 * The curation worker's judgement, without a network.
 *
 * Three things here decide what a parent is asked to look at, and each one is wrong in a way
 * that is invisible from the outside if it breaks:
 *
 *   - the artist filter, because a queue full of near-misses looks like a working worker
 *   - the theme token test, because it is the only thing separating "Racism" from
 *     "Anti-racism", and getting it backwards would flag exactly the wrong bands
 *   - the roster row parser, because it reads HTML fragments out of a JSON array
 *
 *   node --test src/curate/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldName, sameArtist, similarArtists, LABS_ALGORITHM } from "./sources.ts";
import { themeTokens, hasTheme, parseRosterRow, indexRoster, themeHitsFor, THEME_TERMS } from "./themes.ts";
import { usableAlbums, interleaveBySeed, enabledSources } from "./worker.ts";
import { SOURCE_AVAILABLE } from "../server/settings.ts";
import type { Album } from "../ma/types.ts";

/* ── name folding ──────────────────────────────────────────────────── */

test("names fold across the differences catalogues actually disagree about", () => {
  assert.equal(foldName("Nattfödd"), foldName("Nattfodd"), "diacritics");
  assert.equal(foldName("Mr. Pimp-Lotion"), foldName("Mr Pimp Lotion"), "punctuation");
  assert.equal(foldName("The Dumdum Boys"), foldName("Dumdum Boys"), "a leading the");
  assert.equal(foldName("AC/DC"), foldName("ac dc"), "a slash");
  assert.equal(foldName("Emerson, Lake & Palmer"), foldName("Emerson Lake and Palmer"), "ampersand");
});

test("folding does not merge artists who are genuinely different", () => {
  assert.notEqual(foldName("Dio"), foldName("Dio Brando"));
  assert.notEqual(foldName("Sabaton"), foldName("Sabbath"));
  assert.equal(sameArtist("In Flames", "In Flames"), true);
  assert.equal(sameArtist("In Flames", "Ruelle"), false);
});

/* ── the artist filter ─────────────────────────────────────────────── */

const album = (artist: string, name: string, withArt = true): Album => ({
  item_id: name, provider: "qobuz", uri: `qobuz://album/${name}`, name, version: "",
  artists: [{ item_id: artist, name: artist }],
  metadata: withArt ? { images: [{ type: "thumb", path: "x", provider: "qobuz", remotely_accessible: true, proxy_id: "p" }] } : {},
});

test("a fuzzy catalogue search is filtered down to the artist actually asked for", () => {
  // Verified live: searching "In Flames" on this household's MA returns Ruelle's "Up In
  // Flames" and The Weeknd's "Dancing In The Flames". Without this filter the parent's queue
  // fills with records by people nobody asked about.
  const results = [
    album("In Flames", "Foregone"),
    album("Ruelle", "Up In Flames"),
    album("The Weeknd", "Dancing In The Flames"),
    album("In Flames", "I, the Mask"),
  ];
  const out = usableAlbums(results, "In Flames", 10);
  assert.deepEqual(out.map((a) => a.name), ["Foregone", "I, the Mask"]);
});

test("an album with no artwork is not suggested", () => {
  // An untagged album is invisible in a cover-art interface. counts().invisible exists to
  // catch the ones already in the crate; there is no reason to add more deliberately.
  const out = usableAlbums([album("Dio", "Holy Diver", false), album("Dio", "The Last In Line")], "Dio", 10);
  assert.deepEqual(out.map((a) => a.name), ["The Last In Line"]);
});

test("the per-artist limit is honoured", () => {
  const many = ["a", "b", "c", "d"].map((n) => album("Dio", n));
  assert.equal(usableAlbums(many, "Dio", 2).length, 2);
});

/* ── theme tokens ──────────────────────────────────────────────────── */

test("anti-racism is not racism", () => {
  // The single most important assertion in this file. Metal Archives' themes filter is a
  // SUBSTRING match server-side, so asking for "Racism" returns anti-racist bands too, and
  // "Fascism" mostly returns anti-fascists. Exact-token matching here is what fixes it.
  assert.equal(hasTheme("Anti-racism, Unity, Metal", "Racism"), false);
  assert.equal(hasTheme("Hatred, Racism, War", "Racism"), true);
  assert.equal(hasTheme("Anti-fascism, Politics", "Fascism"), false);
  assert.equal(hasTheme("Fascism, War", "Fascism"), true);
  assert.equal(hasTheme("Anti-nationalism", "Nationalism"), false);
});

test("a parenthetical qualifier does not hide a theme", () => {
  assert.deepEqual(themeTokens("Racism (early), Nature (later)"), ["Racism", "Nature"]);
  assert.equal(hasTheme("Racism (early), Nature", "Racism"), true);
});

test("themes split on the separators the field actually uses", () => {
  assert.deepEqual(themeTokens("War, Death; Satan / Occultism"), ["War", "Death", "Satan", "Occultism"]);
  assert.deepEqual(themeTokens(""), []);
});

test("matching is case-insensitive but still token-exact", () => {
  assert.equal(hasTheme("national socialism, war", "National Socialism"), true);
  assert.equal(hasTheme("Socialism, Solidarity", "National Socialism"), false,
    "a shorter token must not match a longer term");
});

test("the Burzum case: a clean themes string is not a clean band", () => {
  // ARCHITECTURE.md §5. This is why nothing here is allowed to auto-reject, and the test
  // exists so nobody later mistakes the absence of a flag for a verdict.
  const burzumThemes = "Mythology, Folklore, Odalism, Depression, Nature";
  for (const { term } of THEME_TERMS) {
    assert.equal(hasTheme(burzumThemes, term), false);
  }
  // Every automated filter passes it. Only the parent catches this one.
});

/* ── roster parsing ────────────────────────────────────────────────── */

test("a roster row is read out of its HTML fragments", () => {
  const row = [
    '<a href="https://www.metal-archives.com/bands/Example_Band/12345">Example Band</a>  <!-- 5.13 -->',
    "Black Metal", "Norway", "Nature, Paganism", "1994",
  ];
  const parsed = parseRosterRow(row);
  assert.equal(parsed?.band, "Example Band");
  assert.equal(parsed?.url, "https://www.metal-archives.com/bands/Example_Band/12345");
  assert.equal(parsed?.themes, "Nature, Paganism");
  assert.equal(parsed?.country, "Norway");
});

test("a malformed roster row is skipped, not thrown on", () => {
  // Annotations are advisory. One bad row must never take down a curation run.
  assert.equal(parseRosterRow(null), null);
  assert.equal(parseRosterRow(["no link here", "Genre", "Country", "Themes"]), null);
  assert.equal(parseRosterRow(["too", "short"]), null);
});

test("an artist is matched against the roster through the same folding as everything else", () => {
  const roster = indexRoster([
    { band: "Exämple Bänd", url: "u", themes: "National Socialism", genre: "g", country: "c" },
  ]);
  const rosters = new Map([["National Socialism", roster]]);

  assert.equal(themeHitsFor("Example Band", rosters).length, 1, "diacritics must not hide a hit");
  assert.equal(themeHitsFor("Someone Else", rosters).length, 0);
});

test("a hit carries the verbatim themes string and the band's own page", () => {
  // The parent has to be able to check the claim rather than take the flag's word for it —
  // §5: an unsourced accusation is defamatory.
  const roster = indexRoster([
    { band: "B", url: "https://www.metal-archives.com/bands/B/1", themes: "National Socialism, War", genre: "g", country: "c" },
  ]);
  const hit = themeHitsFor("B", new Map([["National Socialism", roster]]))[0];
  assert.equal(hit.band.themes, "National Socialism, War");
  assert.match(hit.band.url, /metal-archives\.com\/bands\//);
});

/* ── the Labs trap ─────────────────────────────────────────────────── */

test("an unknown MBID yields no neighbours rather than an error", () => {
  // Labs answers 200 with [] for an id it does not know, so a wrong id and a genuinely
  // isolated artist look identical. Identity is resolved through MusicBrainz first for
  // exactly this reason.
  const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => [] })) as unknown as typeof fetch;
  return similarArtists("not-a-real-mbid", fetchImpl).then((out) => {
    assert.deepEqual(out, []);
  });
});

test("the Labs algorithm parameter is sent, because there is no default", () => {
  let seen = "";
  const fetchImpl = (async (url: any) => {
    seen = String(url);
    return { ok: true, status: 200, json: async () => [] };
  }) as unknown as typeof fetch;

  return similarArtists("5b687684-ad34-4a9f-b425-0e7aa81fbd38", fetchImpl).then(() => {
    assert.ok(seen.includes(encodeURIComponent(LABS_ALGORITHM)), "omitting it fails the call");
    assert.ok(seen.includes("5b687684"), "and the mbid goes in the query, not the path");
  });
});

test("neighbours are read whether Labs wraps the array or not", () => {
  const flat = [{ artist_mbid: "m1", name: "One", score: 10 }];
  const wrapped = [[{ artist_mbid: "m2", name: "Two", score: 20 }]];

  const impl = (payload: unknown) =>
    (async () => ({ ok: true, status: 200, json: async () => payload })) as unknown as typeof fetch;

  return Promise.all([similarArtists("a", impl(flat)), similarArtists("b", impl(wrapped))]).then(([f, w]) => {
    assert.deepEqual(f, [{ mbid: "m1", name: "One", score: 10 }]);
    assert.deepEqual(w, [{ mbid: "m2", name: "Two", score: 20 }]);
  });
});

/* ── queue fairness ────────────────────────────────────────────────── */

test("the queue takes everyone's best before anyone's second", () => {
  // The bug this exists to prevent, verified against the real services: ranking one global
  // pool by Labs score produced a review queue of Queen, The Beatles, Madonna, Daft Punk and
  // Coldplay for a crate that is mostly metal. Labs' score is not normalised across artists,
  // so the household's one mainstream act outscored all of its metal — and nothing errored.
  const bySeed = new Map<string, string[]>([
    ["Michael Jackson", ["Queen", "The Beatles", "Madonna"]],   // scores in the thousands
    ["Amon Amarth", ["In Flames", "Arch Enemy"]],               // scores an order lower
    ["Finntroll", ["Korpiklaani"]],
  ]);

  assert.deepEqual(interleaveBySeed(bySeed, 10), [
    "Queen", "In Flames", "Korpiklaani",   // everyone's best
    "The Beatles", "Arch Enemy",           // then everyone's second
    "Madonna",                             // then what is left
  ]);
});

test("a crate artist with no neighbours does not hold up the others", () => {
  const bySeed = new Map<string, string[]>([
    ["A", []],
    ["B", ["b1", "b2"]],
  ]);
  assert.deepEqual(interleaveBySeed(bySeed, 10), ["b1", "b2"]);
});

test("the limit is honoured, and an empty crate yields an empty queue", () => {
  const bySeed = new Map<string, string[]>([["A", ["a1", "a2", "a3"]], ["B", ["b1", "b2"]]]);
  assert.deepEqual(interleaveBySeed(bySeed, 3), ["a1", "b1", "a2"]);
  assert.deepEqual(interleaveBySeed(new Map(), 10), []);
});

/* ── the Sources toggles ───────────────────────────────────────────── */

test("an absent sources setting does not silently disable curation", () => {
  // The parent turning a source off is a decision. A missing key is not, and must not read
  // as one — that would be a worker that quietly stops suggesting anything, forever, with no
  // error and nothing in the queue to notice.
  assert.equal(enabledSources(undefined).listenbrainz, true);
  assert.equal(enabledSources({}).listenbrainz, true);
  assert.equal(enabledSources({ listenbrainz: true }).listenbrainz, true);
  assert.equal(enabledSources({ listenbrainz: false }).listenbrainz, false);
});

test("every source the settings screen offers is one the server can act on", () => {
  // The bug this whole change is about: Settings → Kilder shipped four toggles, all stored,
  // none read. A toggle that changes nothing is a lie the parent has no way of catching, so
  // the server publishes what it can actually do and the page renders that.
  const claimed = Object.entries(SOURCE_AVAILABLE).filter(([, on]) => on).map(([k]) => k);
  assert.deepEqual(claimed, ["listenbrainz"],
    "flip a source to available in the same commit that implements it, never before");
});
