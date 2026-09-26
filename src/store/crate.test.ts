/**
 * These tests are about invariants, not coverage. Each one names the product rule it
 * defends, because in a year the reason will matter more than the assertion.
 *
 *   node --test src/store/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "./db.ts";
import {
  addFlag, approve, counts, crate, crateAlphabetical, ensureProfile, getAlbum, heldForTracks,
  manualFavourites, newlyReleased, reject, release, reopenRejected, reviewQueue,
  setManualFavourite, setRecommended, setTracks, suggest, upsertAlbum, waitingToRelease,
  withdraw, type AlbumInput,
} from "./crate.ts";

const KID = "child_a";

function store() {
  const db = openStore(":memory:");
  ensureProfile(db, KID, "child A");
  return db;
}

const album = (n: number, over: Partial<AlbumInput> = {}): AlbumInput => ({
  uri: `qobuz://album/${n}`,
  provider: "qobuz",
  itemId: String(n),
  artist: `Artist ${n}`,
  title: `Album ${n}`,
  year: 1990 + n,
  coverProxyId: `cover-${n}`,
  ...over,
});

/**
 * Suggest and approve in one step, for tests about what happens after the gate.
 *
 * The track list is part of admitting an album, not decoration on it: `release()` refuses to
 * give a permanent crate position to an album with no cached number line, because a position
 * spent on a record that opens onto nothing can never be reclaimed. A test that wants to see
 * what the crate does with an album has to give it one. `heldForTracks` is where the other
 * case is tested on purpose.
 */
function admit(db: ReturnType<typeof store>, n: number, over: Partial<AlbumInput> = {}) {
  const a = album(n, over);
  upsertAlbum(db, a);
  setTracks(db, a.uri, [{ n: 1, title: `Track 1 of ${n}` }, { n: 2, title: `Track 2 of ${n}` }]);
  suggest(db, a.uri, "similar", "test");
  approve(db, KID, a.uri);
  return a;
}

test("the gate: an album that was never in the queue cannot be approved", () => {
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  assert.throws(() => approve(db, KID, a.uri), /never in the review queue/);
  assert.equal(crate(db, KID).length, 0);
});

test("approval does not release: the crate is empty until the trickle runs", () => {
  const db = store();
  admit(db, 1);
  admit(db, 2);
  assert.equal(crate(db, KID).length, 0);
  assert.equal(counts(db, KID).waitingToRelease, 2);

  const out = release(db, KID, 1);
  assert.equal(out.length, 1);
  assert.equal(crate(db, KID).length, 1);
  assert.equal(counts(db, KID).waitingToRelease, 1);
});

test("release is oldest-approval-first and assigns consecutive positions", () => {
  const db = store();
  for (const n of [1, 2, 3]) admit(db, n);
  release(db, KID, 3);
  assert.deepEqual(
    crate(db, KID).map((s) => [s.position, s.album?.uri]),
    [[0, "qobuz://album/1"], [1, "qobuz://album/2"], [2, "qobuz://album/3"]],
  );
});

test("withdrawing an album leaves an empty slot and moves nothing after it", () => {
  const db = store();
  for (const n of [1, 2, 3]) admit(db, n);
  release(db, KID, 3);

  withdraw(db, KID, "qobuz://album/2");

  const slots = crate(db, KID);
  assert.equal(slots.length, 3, "the slot survives the album");
  assert.equal(slots[1]!.album, null, "the withdrawn slot renders empty");
  assert.equal(slots[2]!.album?.uri, "qobuz://album/3");
  assert.equal(slots[2]!.position, 2, "position 2 is still position 2 — principle 2");
});

test("a position issued to a withdrawn album is never handed out again", () => {
  const db = store();
  for (const n of [1, 2]) admit(db, n);
  release(db, KID, 2);
  withdraw(db, KID, "qobuz://album/2");

  admit(db, 3);
  const [fresh] = release(db, KID, 1);
  const slots = crate(db, KID);
  assert.equal(fresh!.uri, "qobuz://album/3");
  assert.equal(slots.at(-1)!.position, 2, "the new album lands past the gap, not in it");
  assert.equal(slots[1]!.album, null);
});

test("the database itself refuses to move a released position", () => {
  const db = store();
  admit(db, 1);
  release(db, KID, 1);
  assert.throws(
    () => db.prepare(`UPDATE approved SET position = 7 WHERE profile_id = ? AND uri = ?`).run(KID, "qobuz://album/1"),
    /append-only/,
  );
});

test("the database itself refuses to delete from the crate", () => {
  const db = store();
  admit(db, 1);
  release(db, KID, 1);
  assert.throws(() => db.prepare(`DELETE FROM approved WHERE profile_id = ?`).run(KID), /append-only/);
});

test("two profiles keep independent position lines", () => {
  const db = store();
  ensureProfile(db, "child_b", "child B");
  const a = album(1);
  upsertAlbum(db, a);
  setTracks(db, a.uri, [{ n: 1, title: "One" }]);
  suggest(db, a.uri, "seed");
  approve(db, KID, a.uri);
  approve(db, "child_b", a.uri);

  admit(db, 2);
  release(db, KID, 2);
  release(db, "child_b", 2);

  assert.deepEqual(crate(db, KID).map((s) => s.album?.uri), ["qobuz://album/1", "qobuz://album/2"]);
  assert.deepEqual(crate(db, "child_b").map((s) => s.album?.uri), ["qobuz://album/1"]);
});

test("unknown explicit stays unknown and is never coerced to clean", () => {
  const db = store();
  const a = album(1, { explicit: undefined });
  upsertAlbum(db, a);
  assert.equal(getAlbum(db, a.uri)!.explicit, null);

  upsertAlbum(db, album(1, { explicit: true }));
  assert.equal(getAlbum(db, a.uri)!.explicit, true);

  // A later sync that has lost the field must not erase what we learned.
  upsertAlbum(db, album(1, { explicit: null }));
  assert.equal(getAlbum(db, a.uri)!.explicit, true);
});

test("a later metadata pass can give an album artwork without disturbing its position", () => {
  const db = store();
  admit(db, 1, { coverProxyId: null });
  release(db, KID, 1);
  assert.equal(counts(db, KID).invisible, 1);

  upsertAlbum(db, album(1, { coverProxyId: "cover-1", title: "Album 1 (Remastered)" }));

  const slots = crate(db, KID);
  assert.equal(slots[0]!.position, 0);
  assert.equal(slots[0]!.album!.coverProxyId, "cover-1");
  assert.equal(slots[0]!.album!.title, "Album 1 (Remastered)");
  assert.equal(counts(db, KID).invisible, 0);
});

test("flags sort the queue and never filter it", () => {
  const db = store();
  for (const n of [1, 2]) { upsertAlbum(db, album(n)); suggest(db, album(n).uri, "similar", "test"); }
  addFlag(db, "qobuz://album/2", "nsbm", "metal-archives", "themes: Odalism");

  const q = reviewQueue(db);
  assert.equal(q.length, 2, "a flagged album is still shown to the parent");
  assert.equal(q[0]!.album.uri, "qobuz://album/2", "flagged first");
  assert.equal(q[0]!.flags[0]!.kind, "nsbm");
});

test("rejection closes the queue entry and keeps the album out of the crate", () => {
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  suggest(db, a.uri, "chart", "NO top 50");
  reject(db, a.uri);

  assert.equal(reviewQueue(db).length, 0);
  assert.equal(release(db, KID, 10).length, 0);
  assert.equal(crate(db, KID).length, 0);
});

test("the same album arriving from a second source does not duplicate the crate slot", () => {
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  setTracks(db, a.uri, [{ n: 1, title: "One" }]);
  suggest(db, a.uri, "similar", "Artist 9");
  suggest(db, a.uri, "chart", "NO top 50");
  approve(db, KID, a.uri);
  approve(db, KID, a.uri);
  release(db, KID, 10);

  assert.equal(crate(db, KID).length, 1);
  assert.equal(counts(db, KID).pending, 0, "approving settles every pending source for that album");
});

test("the gate: an album that was rejected cannot be approved past the rejection", () => {
  // Without this guard the UPDATE matches nothing (it only touches undecided rows) while the
  // INSERT still queues the album, leaving `candidate` saying rejected and `approved` saying
  // otherwise — and the album reaching the child. /admin is the caller that produces it: a
  // stale phone tab, a double tap, a back button.
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", "test");
  reject(db, a.uri);

  assert.throws(() => approve(db, KID, a.uri), /every suggestion of it was rejected/);
  assert.equal(counts(db, KID).approved, 0, "nothing may have been queued for the crate");
  assert.equal(crate(db, KID).length, 0);
});

test("suggest() never resurrects a rejection, however many times the worker runs", () => {
  // The curation worker calls suggest() every day. If a repeat suggestion reopened a
  // rejected album, every record the parent has ever turned down would come back forever.
  const db = store();
  const a = album(2);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", "first pass");
  reject(db, a.uri);

  suggest(db, a.uri, "similar", "the worker, the next morning");
  assert.equal(reviewQueue(db).length, 0, "it must stay out of the queue");
  assert.throws(() => approve(db, KID, a.uri), /every suggestion of it was rejected/);
});

test("reopenRejected is the undo, and it works even when the source already suggested it", () => {
  // This is the case that a suggest()-based undo silently failed: suggest is ON CONFLICT DO
  // NOTHING and there are only four legal sources, so an album already rejected from that
  // same source never came back. The button reported success and the album stayed gone.
  const db = store();
  const a = album(2);
  upsertAlbum(db, a);
  suggest(db, a.uri, "request", "the parent asked for it");
  reject(db, a.uri);

  assert.equal(reopenRejected(db, a.uri), true);
  assert.equal(reviewQueue(db).length, 1, "back in the queue");
  approve(db, KID, a.uri);
  assert.equal(counts(db, KID).approved, 1);
});

test("reopening something that was not rejected reports that it did nothing", () => {
  const db = store();
  const a = album(4);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", null);
  assert.equal(reopenRejected(db, a.uri), false, "an open candidacy is not an undo");

  approve(db, KID, a.uri);
  assert.equal(reopenRejected(db, a.uri), false, "and undo never takes an album back out");
  assert.equal(counts(db, KID).approved, 1);
});

test("approving twice is idempotent, not an error", () => {
  // A double tap on a phone must not be a failure the parent has to interpret.
  const db = store();
  const a = album(3);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", null);
  approve(db, KID, a.uri);
  approve(db, KID, a.uri);
  assert.equal(counts(db, KID).approved, 1);
});

/* ── the manual "like" ───────────────────────────────────────────────────
 * A later, deliberate override of "there is no like button and there must not be one" — see
 * favouriteTracks's comment. These tests are about the mechanism, not the product decision.
 */

test("a manual like can be set and cleared, and only shows up for its own profile", () => {
  const db = store();
  const a = admit(db, 1);
  release(db, KID, 1);
  ensureProfile(db, "child_b", "child B");

  assert.equal(setManualFavourite(db, KID, a.uri, 1, true), true);
  assert.deepEqual(manualFavourites(db, KID).get(a.uri), new Set([1]));
  assert.equal(manualFavourites(db, "child_b").has(a.uri), false, "not this profile's like");

  assert.equal(setManualFavourite(db, KID, a.uri, 1, false), true);
  assert.equal(manualFavourites(db, KID).has(a.uri), false, "cleared, not left as an empty set");
});

test("the gate holds on manual likes too: an album not in the crate cannot be liked", () => {
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", null);
  approve(db, KID, a.uri);   // approved, but not released — no track list

  assert.equal(setManualFavourite(db, KID, a.uri, 1, true), false);
  assert.equal(manualFavourites(db, KID).size, 0);
});

/* ── the parent's "recommend to child" ───────────────────────────────────
 * Album-level, a different actor and granularity from the manual like above. It only ever
 * changes which unreleased row release() picks next.
 */

test("a recommended album releases before an earlier, non-recommended one", () => {
  const db = store();
  const a = admit(db, 1);   // approved first
  const b = admit(db, 2);   // approved second
  assert.equal(setRecommended(db, KID, b.uri, true), true);

  const out = release(db, KID, 1);
  assert.deepEqual(out.map((x) => x.uri), [b.uri], "recommended jumps the FIFO queue");
  assert.deepEqual(waitingToRelease(db, KID).map((x) => x.uri), [a.uri]);
});

test("recommending a released album does nothing — there is no queue order left to change", () => {
  const db = store();
  const a = admit(db, 1);
  release(db, KID, 1);
  assert.equal(setRecommended(db, KID, a.uri, true), false);
});

test("waitingToRelease and heldForTracks both say which albums are recommended", () => {
  const db = store();
  const waiting = admit(db, 1);
  setRecommended(db, KID, waiting.uri, true);
  const held = album(2);
  upsertAlbum(db, held);
  suggest(db, held.uri, "similar", null);
  approve(db, KID, held.uri);   // held: no track list
  setRecommended(db, KID, held.uri, true);

  assert.equal(waitingToRelease(db, KID)[0]!.recommended, true);
  assert.equal(heldForTracks(db, KID)[0]!.recommended, true);
});

/* ── the alphabetical grid, and the "new" shelf it broke ─────────────────
 * §4.1's deliberate reversal: the crate's DISPLAY order is alphabetical by artist now.
 * `crate()` above is untouched and still position-ordered — these are the two new,
 * independent reads of the same rows.
 */

test("crateAlphabetical sorts by artist, not by release position", () => {
  const db = store();
  admit(db, 1, { artist: "Zebra" });
  admit(db, 2, { artist: "Abba" });
  release(db, KID, 2);   // Zebra released first, at position 0; Abba at position 1

  assert.deepEqual(crateAlphabetical(db, KID).map((a) => a.artist), ["Abba", "Zebra"]);
});

test("crateAlphabetical excludes withdrawn and still-trackless albums, with no gap left behind", () => {
  const db = store();
  const kept = admit(db, 1, { artist: "Kept" });
  const gone = admit(db, 2, { artist: "Gone" });
  release(db, KID, 2);
  withdraw(db, KID, gone.uri);

  assert.deepEqual(crateAlphabetical(db, KID).map((a) => a.uri), [kept.uri]);
});

test("newlyReleased is newest-first by position, independent of alphabetical display order", () => {
  const db = store();
  admit(db, 1, { artist: "Zebra" });   // released first: position 0
  admit(db, 2, { artist: "Abba" });    // released second: position 1
  release(db, KID, 2);

  // Alphabetically Abba comes first, but it is the NEWER release, so it must lead here too.
  assert.deepEqual(newlyReleased(db, KID, 10), ["qobuz://album/2", "qobuz://album/1"]);
});
