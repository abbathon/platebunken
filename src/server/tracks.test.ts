/**
 * The rule this file defends: **an album with no number line is never put in front of the
 * child.**
 *
 *   node --test src/server/
 *
 * It is written because the product shipped without it. Only `pb seed` ever cached a track
 * list, so every album the parent approved at /admin reached the crate with none — sixteen
 * seeded albums that worked and eleven approved ones that did not. Tapping one of those
 * covers gave a four-year-old pre-reader an English sentence about Music Assistant.
 *
 * Three things hold the rule, and each is tested here:
 *   - `release()` will not spend a permanent position on a trackless album  (store)
 *   - `wireCrate` draws an already-released one as an empty slot             (crate.ts)
 *   - `sweepTracks` fills the list in, after which both undo themselves      (this module)
 *
 * The MassClient is a stand-in. What is being tested is which albums are asked about, in
 * what order, and what the store looks like afterwards — none of which needs a socket.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../store/db.ts";
import {
  approve, counts, crate, ensureProfile, heldForTracks, release, setTracks, suggest,
  tracks, upsertAlbum, waitingToRelease, withdraw, type AlbumInput,
} from "../store/crate.ts";
import type { MassClient } from "../ma/client.ts";
import type { Track } from "../ma/types.ts";
import { cacheOne, sweepTracks, tracklessAlbums } from "./tracks.ts";
import { wireCrate } from "./crate.ts";

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

const maTrack = (a: number, n: number): Track => ({
  item_id: `t${a}-${n}`, uri: `qobuz://track/${a}-${n}`, name: `Track ${n}`,
  track_number: n, metadata: {},
} as Track);

/**
 * A Music Assistant that answers from a map, and records what it was asked.
 *
 * `asked` is the point of it: the sweep's ORDER is a product decision — a released album is
 * invisible to the child right now, so it is asked about before a candidate nobody has even
 * reviewed — and order is only observable from here.
 */
function fakeMa(answers: Record<string, Track[]>) {
  const asked: string[] = [];
  const client = {
    async albumTracks(itemId: string) {
      asked.push(itemId);
      const t = answers[itemId];
      if (!t) throw new Error(`no track list for ${itemId}`);
      return t;
    },
  } as unknown as MassClient;
  return { asked, ma: async () => client };
}

/** Suggested and approved, with no tracks: the state every /admin ✓ used to produce. */
function approveTrackless(db: ReturnType<typeof store>, n: number) {
  const a = album(n);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", "test");
  approve(db, KID, a.uri);
  return a;
}

/* ── the store refuses to spend a position ─────────────────────────────── */

test("an approved album with no track list is not released", () => {
  const db = store();
  approveTrackless(db, 1);

  assert.deepEqual(release(db, KID, 10), [], "nothing takes a position");
  assert.equal(counts(db, KID).inCrate, 0);
  assert.equal(counts(db, KID).heldForTracks, 1);
  assert.equal(counts(db, KID).waitingToRelease, 0, "held back is not the same as waiting");
});

test("a held-back album does not consume the position of the one behind it", () => {
  // The rule that makes holding back safe at all. If a trackless album took position 0 and
  // was merely hidden, the next record would land at 1 and the crate would open with a gap
  // that nothing can ever fill — and positions are append-only, so it would be permanent.
  const db = store();
  approveTrackless(db, 1);
  const b = album(2);
  upsertAlbum(db, b);
  setTracks(db, b.uri, [{ n: 1, title: "B1" }]);
  suggest(db, b.uri, "similar", "test");
  approve(db, KID, b.uri);

  const out = release(db, KID, 10);
  assert.deepEqual(out.map((a) => a.uri), [b.uri]);
  assert.equal(crate(db, KID)[0]!.position, 0, "the crate still starts at zero");
});

test("the release order is kept: a held-back album goes first once its tracks arrive", () => {
  // Approval order is the release order, and holding an album back must not cost it its
  // place. It waits, and it is still first when it is finally releasable.
  const db = store();
  const a = approveTrackless(db, 1);
  const b = album(2);
  upsertAlbum(db, b);
  setTracks(db, b.uri, [{ n: 1, title: "B1" }]);
  suggest(db, b.uri, "similar", "test");
  approve(db, KID, b.uri);

  release(db, KID, 1);                                    // b, at position 0
  setTracks(db, a.uri, [{ n: 1, title: "A1" }]);
  const out = release(db, KID, 1);                        // now a

  assert.deepEqual(out.map((x) => x.uri), [a.uri]);
  assert.deepEqual(heldForTracks(db, KID), []);
});

test("waitingToRelease promises only what release will actually produce", () => {
  // These two must agree: the parent is shown `waiting` and then presses "release now".
  const db = store();
  approveTrackless(db, 1);
  const b = album(2);
  upsertAlbum(db, b);
  setTracks(db, b.uri, [{ n: 1, title: "B1" }]);
  suggest(db, b.uri, "similar", "test");
  approve(db, KID, b.uri);

  assert.deepEqual(waitingToRelease(db, KID).map((x) => x.uri), [b.uri]);
  assert.deepEqual(heldForTracks(db, KID).map((x) => x.uri), ["qobuz://album/1"]);
});

/* ── the crate hides what slipped through before the rule existed ──────── */

test("an album already released without tracks is drawn as an empty slot", () => {
  // Eleven of these existed in the real store when this was found. The slot is spent and
  // permanent, so the album cannot be moved out of the way — it is hidden in place, exactly
  // as a withdrawn album is, and every position after it stays where the child memorised it.
  const db = store();
  const a = approveTrackless(db, 1);
  const b = album(2);
  upsertAlbum(db, b);
  setTracks(db, b.uri, [{ n: 1, title: "B1" }]);
  suggest(db, b.uri, "similar", "test");
  approve(db, KID, b.uri);
  // Reach past release()'s own guard, which is what the old code path effectively did.
  db.prepare(`UPDATE approved SET position = 0, released_at = ? WHERE profile_id = ? AND uri = ?`)
    .run(new Date().toISOString(), KID, a.uri);
  release(db, KID, 1);

  const wire = wireCrate(db, KID);
  assert.equal(wire.slots.length, 2);
  assert.equal(wire.slots[0]!.album, null, "no cover for a record that opens onto nothing");
  assert.equal(wire.slots[1]!.album!.uri, b.uri);
  assert.equal(wire.slots[1]!.position, 1, "and the one behind it has not moved");
  assert.equal(counts(db, KID).silentSlots, 1);
});

test("the hidden album reappears in its own slot the moment its tracks arrive", () => {
  const db = store();
  const a = approveTrackless(db, 1);
  db.prepare(`UPDATE approved SET position = 0, released_at = ? WHERE profile_id = ? AND uri = ?`)
    .run(new Date().toISOString(), KID, a.uri);
  assert.equal(wireCrate(db, KID).slots[0]!.album, null);

  setTracks(db, a.uri, [{ n: 1, title: "A1" }, { n: 2, title: "A2" }]);

  const slot = wireCrate(db, KID).slots[0]!;
  assert.equal(slot.position, 0, "the same position it always had");
  assert.equal(slot.album!.uri, a.uri);
  assert.equal(slot.album!.tracks.length, 2);
  assert.equal(counts(db, KID).silentSlots, 0);
});

/* ── the sweep ─────────────────────────────────────────────────────────── */

test("the sweep asks about the crate first, then the waiting, then the queue", () => {
  const db = store();
  // A candidate nobody has decided on.
  const pending = album(3);
  upsertAlbum(db, pending);
  suggest(db, pending.uri, "similar", "test");
  // Approved and waiting.
  approveTrackless(db, 2);
  // Released, and invisible to the child right now — the most urgent of the three.
  const released = approveTrackless(db, 1);
  db.prepare(`UPDATE approved SET position = 0, released_at = ? WHERE profile_id = ? AND uri = ?`)
    .run(new Date().toISOString(), KID, released.uri);

  assert.deepEqual(
    tracklessAlbums(db, KID).map((a) => a.itemId),
    ["1", "2", "3"],
  );
});

test("a rejected candidate is never asked about", () => {
  // Nothing should spend a request on an album that is not on its way anywhere.
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  assert.deepEqual(tracklessAlbums(db, KID), [], "an album nobody suggested is not in scope");
});

test("a withdrawn album is never asked about", () => {
  const db = store();
  const a = approveTrackless(db, 1);
  db.prepare(`UPDATE approved SET position = 0, released_at = ? WHERE profile_id = ? AND uri = ?`)
    .run(new Date().toISOString(), KID, a.uri);
  withdraw(db, KID, a.uri);

  assert.deepEqual(tracklessAlbums(db, KID), [], "the parent took that record back");
});

test("a sweep fills in what it can and leaves the rest for the next one", async () => {
  const db = store();
  approveTrackless(db, 1);
  approveTrackless(db, 2);
  const { ma, asked } = fakeMa({ "1": [maTrack(1, 1), maTrack(1, 2)] });

  const report = await sweepTracks(db, ma, { profileId: KID, onLog: () => {} });

  assert.deepEqual(asked, ["1", "2"]);
  assert.deepEqual(report, { asked: 2, filled: 1, empty: 0, failed: 1 });
  assert.equal(tracks(db, "qobuz://album/1").length, 2);
  assert.equal(tracks(db, "qobuz://album/2").length, 0);
  assert.equal(counts(db, KID).waitingToRelease, 1, "album 1 can be released now");
  assert.equal(counts(db, KID).heldForTracks, 1, "album 2 still cannot");
});

test("an album Music Assistant answers about with nothing is not an error and is retried", async () => {
  // Distinct from a failure on purpose: MA syncs, so "no tracks today" is not "no tracks".
  // The album keeps its place in the next sweep rather than being written off.
  const db = store();
  approveTrackless(db, 1);
  const { ma } = fakeMa({ "1": [] });

  const report = await sweepTracks(db, ma, { profileId: KID, onLog: () => {} });

  assert.deepEqual(report, { asked: 1, filled: 0, empty: 1, failed: 0 });
  assert.equal(tracklessAlbums(db, KID).length, 1, "still on the list for next time");
});

test("a sweep with Music Assistant unreachable does nothing and does not throw", async () => {
  const db = store();
  approveTrackless(db, 1);
  const ma = async (): Promise<MassClient> => { throw new Error("ECONNREFUSED"); };

  const report = await sweepTracks(db, ma, { profileId: KID, onLog: () => {} });

  assert.deepEqual(report, { asked: 0, filled: 0, empty: 0, failed: 0 });
  assert.equal(counts(db, KID).heldForTracks, 1, "the album is untouched, not lost");
});

test("the sweep does no work at all when every album has its tracks", async () => {
  const db = store();
  const a = album(1);
  upsertAlbum(db, a);
  setTracks(db, a.uri, [{ n: 1, title: "A1" }]);
  suggest(db, a.uri, "similar", "test");
  approve(db, KID, a.uri);
  const { ma, asked } = fakeMa({});

  const report = await sweepTracks(db, ma, { profileId: KID, onLog: () => {} });

  assert.deepEqual(asked, [], "not even a connection is opened");
  assert.equal(report.asked, 0);
});

test("the sweep is bounded, so one run cannot flood Music Assistant", async () => {
  const db = store();
  for (let n = 1; n <= 6; n++) approveTrackless(db, n);
  const { ma, asked } = fakeMa({});

  await sweepTracks(db, ma, { profileId: KID, limit: 2, onLog: () => {} });

  assert.equal(asked.length, 2);
});

/* ── the approval fast path ────────────────────────────────────────────── */

test("cacheOne fills one album in, so a ✓ is releasable without waiting for a sweep", async () => {
  const db = store();
  const a = approveTrackless(db, 1);
  const { ma } = fakeMa({ "1": [maTrack(1, 1), maTrack(1, 2), maTrack(1, 3)] });

  assert.equal(await cacheOne(db, ma, a.uri, () => {}), 3);
  assert.equal(counts(db, KID).waitingToRelease, 1);
  assert.deepEqual(release(db, KID, 1).map((x) => x.uri), [a.uri]);
});

test("cacheOne on an unreachable Music Assistant reports nothing rather than throwing", async () => {
  // It is called fire-and-forget from the decide route: a rejection here would be unhandled,
  // and the decision it follows has already been recorded and must stand.
  const db = store();
  const a = approveTrackless(db, 1);
  const ma = async (): Promise<MassClient> => { throw new Error("ECONNREFUSED"); };

  assert.equal(await cacheOne(db, ma, a.uri, () => {}), 0);
  assert.equal(counts(db, KID).heldForTracks, 1);
});

test("cacheOne on a uri the store has never heard of is a no-op", async () => {
  const db = store();
  const { ma, asked } = fakeMa({});
  assert.equal(await cacheOne(db, ma, "qobuz://album/404", () => {}), 0);
  assert.deepEqual(asked, []);
});
