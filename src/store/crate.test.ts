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
  addFlag, approve, counts, crate, ensureProfile, getAlbum,
  reject, release, reviewQueue, suggest, upsertAlbum, withdraw,
  type AlbumInput,
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

/** Suggest and approve in one step, for tests about what happens after the gate. */
function admit(db: ReturnType<typeof store>, n: number, over: Partial<AlbumInput> = {}) {
  const a = album(n, over);
  upsertAlbum(db, a);
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
  suggest(db, a.uri, "similar", "Artist 9");
  suggest(db, a.uri, "chart", "NO top 50");
  approve(db, KID, a.uri);
  approve(db, KID, a.uri);
  release(db, KID, 10);

  assert.equal(crate(db, KID).length, 1);
  assert.equal(counts(db, KID).pending, 0, "approving settles every pending source for that album");
});
