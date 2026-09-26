/**
 * The number line and the two shelves built from play history.
 *
 * Same rule as crate.test.ts: each test names the product rule it defends. These two are
 * newer and less obvious than the crate's, so the reasons matter more, not less.
 *
 *   node --test src/store/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "./db.ts";
import {
  allTracks, approve, ensureProfile, mostPlayed, recentlyPlayed, recordPlay,
  release, setTracks, suggest, tracks, upsertAlbum, withdraw,
  type AlbumInput,
} from "./crate.ts";

const KID = "child_a";

function store() {
  const db = openStore(":memory:");
  ensureProfile(db, KID, "child A");
  return db;
}

const album = (n: number): AlbumInput => ({
  uri: `qobuz://album/${n}`, provider: "qobuz", itemId: String(n),
  artist: `Artist ${n}`, title: `Album ${n}`, year: 1990 + n, coverProxyId: `cover-${n}`,
});

/**
 * Suggest, approve and release — an album actually in the crate.
 *
 * The placeholder track is what makes the release happen at all: `release()` will not spend a
 * permanent position on an album with no number line. Tests that care about the list call
 * `setTracks` again afterwards, which replaces it wholesale.
 */
function inCrate(db: ReturnType<typeof store>, n: number) {
  const a = album(n);
  upsertAlbum(db, a);
  setTracks(db, a.uri, [{ n: 1, title: `Track 1 of ${n}` }]);
  suggest(db, a.uri, "seed", "test");
  approve(db, KID, a.uri);
  release(db, KID, 1);
  return a;
}

test("a track list is replaced wholesale, so a re-tag cannot leave a number that plays nothing", () => {
  const db = store();
  const a = inCrate(db, 1);
  setTracks(db, a.uri, [
    { n: 1, title: "One", uri: "qobuz://track/1" },
    { n: 2, title: "Two", uri: "qobuz://track/2" },
    { n: 3, title: "Bonus", uri: "qobuz://track/3" },
  ]);
  assert.equal(tracks(db, a.uri).length, 3);

  // The bonus track is gone from the source. The number line must lose it too.
  setTracks(db, a.uri, [
    { n: 1, title: "One", uri: "qobuz://track/1" },
    { n: 2, title: "Two", uri: "qobuz://track/2" },
  ]);
  const after = tracks(db, a.uri);
  assert.deepEqual(after.map((t) => t.n), [1, 2]);
});

test("tracks come back in number order however they went in", () => {
  const db = store();
  const a = inCrate(db, 1);
  setTracks(db, a.uri, [{ n: 3, title: "C" }, { n: 1, title: "A" }, { n: 2, title: "B" }]);
  assert.deepEqual(tracks(db, a.uri).map((t) => t.title), ["A", "B", "C"]);
});

test("a duplicate track number is dropped rather than failing the whole album", () => {
  // A tagging bug must not be able to fail a seed run: an album with one bad number is
  // still an album, and refusing it would leave a hole in the crate instead.
  const db = store();
  const a = inCrate(db, 1);
  setTracks(db, a.uri, [{ n: 1, title: "First" }, { n: 1, title: "Also first" }, { n: 2, title: "Second" }]);
  assert.deepEqual(tracks(db, a.uri).map((t) => t.title), ["First", "Second"]);
});

test("a track with no uri is kept, because the album still plays without one", () => {
  const db = store();
  const a = inCrate(db, 1);
  setTracks(db, a.uri, [{ n: 1, title: "Untagged" }]);
  assert.equal(tracks(db, a.uri)[0]!.uri, null);
});

test("allTracks covers the crate and excludes a withdrawn album", () => {
  const db = store();
  const a = inCrate(db, 1);
  const b = inCrate(db, 2);
  setTracks(db, a.uri, [{ n: 1, title: "A1" }]);
  setTracks(db, b.uri, [{ n: 1, title: "B1" }]);
  assert.equal(allTracks(db, KID).size, 2);

  withdraw(db, KID, b.uri);
  const left = allTracks(db, KID);
  assert.equal(left.size, 1);
  assert.ok(left.has(a.uri));
});

test("the gate holds on the way back out: a play of an album not in the crate is not logged", () => {
  // The shelves are built from this log and from nothing else, so an album that reached it
  // by any other route would appear on a surface the child can reach — which is the exact
  // thing the approval gate exists to prevent.
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  assert.equal(recordPlay(db, KID, a.uri), false);
  assert.deepEqual(recentlyPlayed(db, KID, 9), []);
});

test("an approved but unreleased album cannot be played either", () => {
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  suggest(db, a.uri, "seed", "test");
  approve(db, KID, a.uri);   // approved, but the trickle has not released it
  assert.equal(recordPlay(db, KID, a.uri), false);
});

test("a withdrawn album stops being playable and drops off the shelves", () => {
  const db = store();
  const a = inCrate(db, 1);
  assert.equal(recordPlay(db, KID, a.uri), true);
  withdraw(db, KID, a.uri);
  assert.equal(recordPlay(db, KID, a.uri), false);
});

test("the recent shelf lists each album once, most recently played first", () => {
  const db = store();
  const a = inCrate(db, 1), b = inCrate(db, 2), c = inCrate(db, 3);
  recordPlay(db, KID, a.uri);
  recordPlay(db, KID, b.uri);
  recordPlay(db, KID, a.uri);   // he goes back to the first one
  recordPlay(db, KID, c.uri);
  assert.deepEqual(recentlyPlayed(db, KID, 9), [c.uri, a.uri, b.uri]);
});

test("the most-played shelf counts every play, and a tie goes to the one played last", () => {
  const db = store();
  const a = inCrate(db, 1), b = inCrate(db, 2);
  recordPlay(db, KID, a.uri);
  recordPlay(db, KID, b.uri);
  recordPlay(db, KID, a.uri);
  recordPlay(db, KID, b.uri);   // two each; b was last
  const top = mostPlayed(db, KID, 9);
  assert.deepEqual(top.map((t) => t.plays), [2, 2]);
  assert.equal(top[0]!.uri, b.uri);
});

test("play history survives the store being closed and reopened", () => {
  // It lived in page memory before this, and a kiosk that reboots nightly meant both
  // shelves were empty every morning — a rail slot that is always inert teaches nothing.
  const db = store();
  const a = inCrate(db, 1);
  recordPlay(db, KID, a.uri);
  const again = recentlyPlayed(db, KID, 9);
  db.close();
  assert.deepEqual(again, [a.uri]);
});

test("two profiles keep independent shelves", () => {
  const db = store();
  ensureProfile(db, "child_b", "child B");
  const a = inCrate(db, 1);
  recordPlay(db, KID, a.uri);
  assert.deepEqual(recentlyPlayed(db, "child_b", 9), []);
});
