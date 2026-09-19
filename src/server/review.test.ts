/**
 * The review queue's server side.
 *
 * What is being defended: that this surface cannot decide anything on the parent's behalf,
 * that a flag never becomes a decision, and that a mis-tap on a phone is recoverable. The
 * approval gate itself is tested in src/store/crate.test.ts — here we test that the surface
 * reports the gate honestly instead of swallowing it.
 *
 *   node --test src/server/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../store/db.ts";
import { addFlag, counts, ensureProfile, reject, setTracks, suggest, upsertAlbum, type AlbumInput } from "../store/crate.ts";
import { decide, releaseNow, reopen, wireReview } from "./review.ts";

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

/** Put an album in the queue, undecided. */
function offer(db: ReturnType<typeof store>, n: number, over: Partial<AlbumInput> = {}) {
  const a = album(n, over);
  upsertAlbum(db, a);
  suggest(db, a.uri, "similar", "test");
  return a;
}

test("the queue shows what is waiting, and nothing that is not", () => {
  const db = store();
  offer(db, 1);
  offer(db, 2);

  const out = wireReview(db, KID);
  assert.equal(out.pending.length, 2);
  assert.equal(out.rejected.length, 0);
  assert.equal(out.pending[0].artist, "Artist 1");
  assert.ok(out.pending[0].cover, "a sleeve is the whole interface; it must be wired");
});

test("flagged albums sort first and are never filtered out", () => {
  // §5, with the case that settles it: Burzum's Metal Archives themes read "Mythology,
  // Folklore, Odalism", so the most notorious record in the genre passes every automated
  // theme filter. Flags sort the queue. A person decides.
  const db = store();
  offer(db, 1);
  const flagged = offer(db, 2);
  addFlag(db, flagged.uri, "nsbm-theme", "metal-archives", "Themes: Mythology, Folklore");

  const out = wireReview(db, KID);
  assert.equal(out.pending.length, 2, "a flag must never remove a candidate from the queue");
  assert.equal(out.pending[0].uri, flagged.uri, "flagged first");
  assert.equal(out.pending[0].flags[0].kind, "nsbm-theme");
  assert.equal(out.pending[0].flags[0].source, "metal-archives");
});

test("unknown explicit is carried as null, not flattened to false", () => {
  // docs/research/03: absent means unknown, and unknown is NOT clean. The page draws the two
  // states differently and cannot do that if the wire collapses them.
  const db = store();
  offer(db, 1, { explicit: null });
  offer(db, 2, { explicit: true });

  const byUri = new Map(wireReview(db, KID).pending.map((c) => [c.uri, c]));
  assert.equal(byUri.get("qobuz://album/1")!.explicit, null);
  assert.equal(byUri.get("qobuz://album/2")!.explicit, true);
});

test("approving removes it from the queue and does not release it to the crate", () => {
  // Approval puts an album in the crate's FUTURE. release() decides when it appears, so a
  // dozen approvals on a Sunday still arrive one at a time.
  const db = store();
  const a = offer(db, 1);

  assert.deepEqual(decide(db, KID, a.uri, "approved"), { ok: true });
  assert.equal(wireReview(db, KID).pending.length, 0);
  assert.equal(counts(db, KID).waitingToRelease, 1);
  assert.equal(counts(db, KID).inCrate, 0, "approval is not release");
});

test("rejecting removes it from the queue and never reaches the crate", () => {
  const db = store();
  const a = offer(db, 1);

  assert.deepEqual(decide(db, KID, a.uri, "rejected"), { ok: true });
  const out = wireReview(db, KID);
  assert.equal(out.pending.length, 0);
  assert.equal(counts(db, KID).approved, 0);
  assert.equal(out.rejected.length, 1, "it must still be findable, or a mis-tap loses it");
});

test("the gate's refusal is reported to the parent, not swallowed", () => {
  // A parent who believes they approved something and did not is worse off than one who sees
  // the reason. This is the stale-tab and double-tap case.
  const db = store();
  const a = offer(db, 1);
  reject(db, a.uri);

  const out = decide(db, KID, a.uri, "approved");
  assert.equal(out.ok, false);
  assert.match(out.error ?? "", /every suggestion of it was rejected/);
  assert.equal(counts(db, KID).approved, 0, "and nothing may have slipped through");
});

test("an album that was never suggested cannot be approved through this surface", () => {
  // The gate is an architectural boundary, not a validation. Nothing may reach the crate
  // around it — including a hand-made POST to /api/review/decide.
  const db = store();
  const a = album(9);
  upsertAlbum(db, a);

  const out = decide(db, KID, a.uri, "approved");
  assert.equal(out.ok, false);
  assert.match(out.error ?? "", /never in the review queue/);
  assert.equal(counts(db, KID).approved, 0);
});

test("a mis-tapped rejection is recoverable, even from the same source that suggested it", () => {
  // The collision that a suggest()-based undo failed on, and that only showed up when the
  // real page was driven: the album is offered from "similar" and rejected, and the undo has
  // to bring back THAT candidacy rather than hope a different source is free.
  const db = store();
  const a = offer(db, 1);
  decide(db, KID, a.uri, "rejected");
  assert.equal(wireReview(db, KID).pending.length, 0);

  assert.deepEqual(reopen(db, a.uri), { ok: true });
  const out = wireReview(db, KID);
  assert.equal(out.pending.length, 1, "back in the queue");
  assert.equal(out.rejected.length, 0, "and no longer listed as turned down");

  assert.deepEqual(decide(db, KID, a.uri, "approved"), { ok: true });
  assert.equal(counts(db, KID).approved, 1);
});

test("reopening twice is harmless, and the second one says it did nothing", () => {
  const db = store();
  const a = offer(db, 1);
  decide(db, KID, a.uri, "rejected");

  assert.equal(reopen(db, a.uri).ok, true);
  const second = reopen(db, a.uri);
  assert.equal(second.ok, false, "honest rather than a silent success");
  assert.equal(wireReview(db, KID).pending.length, 1, "and the queue is still right");
});

test("undo never drags an approved album back out of the crate", () => {
  // Undo is for a rejection. Taking an album back is withdraw(), which works differently and
  // leaves the slot empty forever rather than re-flowing the positions after it.
  const db = store();
  const a = offer(db, 1);
  decide(db, KID, a.uri, "approved");

  assert.equal(reopen(db, a.uri).ok, false);
  assert.equal(counts(db, KID).approved, 1, "still approved");
  assert.equal(wireReview(db, KID).pending.length, 0, "and not back in the queue");
});

test("an album still open from another source is not listed as rejected", () => {
  // One album can arrive from several sources and each is its own row. A rejection from one
  // must not erase the fact that another source also found it.
  const db = store();
  const a = offer(db, 1);                       // source: similar
  suggest(db, a.uri, "chart", "another source");
  reject(db, a.uri);
  suggest(db, a.uri, "request", "asked for");   // a fresh, open candidacy

  const out = wireReview(db, KID);
  assert.equal(out.pending.length, 1);
  assert.equal(out.rejected.length, 0, "it is not turned down while a candidacy is open");
});

test("a track list is shown when it was cached, and its absence is not an error", () => {
  const db = store();
  const withTracks = offer(db, 1);
  const without = offer(db, 2);
  setTracks(db, withTracks.uri, [
    { n: 1, title: "First", uri: "qobuz://track/1" },
    { n: 2, title: "Second", uri: "qobuz://track/2" },
  ]);

  const byUri = new Map(wireReview(db, KID).pending.map((c) => [c.uri, c]));
  assert.equal(byUri.get(withTracks.uri)!.tracks.length, 2);
  assert.equal(byUri.get(withTracks.uri)!.tracks[0].title, "First");
  assert.deepEqual(byUri.get(without.uri)!.tracks, [], "empty is normal, not a failure");
});

test("an album with no artwork still reviews, with a null cover", () => {
  // counts().invisible exists because an untagged album is invisible in a cover-art
  // interface. The review queue is where that gets caught, so it must not hide it.
  const db = store();
  offer(db, 1, { coverProxyId: null });
  const c = wireReview(db, KID).pending[0];
  assert.equal(c.cover, null, "the page draws a shape, not a hole");
  assert.equal(c.artist, "Artist 1");
});

test("a tag-less artist renders as an em dash rather than an empty line", () => {
  const db = store();
  offer(db, 1, { artist: "" });
  assert.equal(wireReview(db, KID).pending[0].artist, "—");
});

/* ── pushing a release to the grid ─────────────────────────────────── */

test("approved albums appear as waiting, in the order they will be released", () => {
  // The parent is shown this list before pressing "release now", so it has to agree with what
  // release() actually does. Same ORDER BY, deliberately.
  const db = store();
  const a = offer(db, 1), b = offer(db, 2), c = offer(db, 3);
  for (const x of [a, b, c]) decide(db, KID, x.uri, "approved");

  const out = wireReview(db, KID);
  assert.deepEqual(out.waiting.map((w) => w.uri), [a.uri, b.uri, c.uri]);
  assert.ok(out.waiting[0].cover, "the parent picks these out by sleeve, like everything else");
});

test("releasing one puts exactly one on the grid and leaves the rest waiting", () => {
  const db = store();
  const a = offer(db, 1), b = offer(db, 2);
  decide(db, KID, a.uri, "approved");
  decide(db, KID, b.uri, "approved");

  const out = releaseNow(db, KID, 1);
  assert.equal(out.ok, true);
  assert.equal(out.released.length, 1);
  assert.equal(out.released[0].position, 0, "the first album takes position 0");
  assert.equal(counts(db, KID).inCrate, 1);
  assert.equal(counts(db, KID).waitingToRelease, 1);
});

test("the reported position is the real one, read back from the store", () => {
  // The position is the number he presses, and it can never be changed afterwards. Reporting
  // a guessed one would be a lie the parent cannot check.
  const db = store();
  for (let i = 1; i <= 3; i++) decide(db, KID, offer(db, i).uri, "approved");

  const out = releaseNow(db, KID, 3);
  assert.deepEqual(out.released.map((r) => r.position), [0, 1, 2]);

  const rows = db.prepare(
    `SELECT position FROM approved WHERE profile_id = ? AND position IS NOT NULL ORDER BY position`,
  ).all(KID) as { position: number }[];
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
});

test("releasing more than is waiting releases what there is", () => {
  // "Slipp alle" sends a big number rather than counting on the client.
  const db = store();
  decide(db, KID, offer(db, 1).uri, "approved");

  const out = releaseNow(db, KID, 99);
  assert.equal(out.released.length, 1);
  assert.equal(counts(db, KID).waitingToRelease, 0);
});

test("releasing with nothing waiting is a no-op, not an error", () => {
  const db = store();
  const out = releaseNow(db, KID, 1);
  assert.equal(out.ok, true);
  assert.deepEqual(out.released, []);
});

test("a manual release counts as the day's release", () => {
  // A release is a release. Pressing the button before the morning job runs means the morning
  // job does not also fire — the honest behaviour rather than a special case.
  const db = store();
  decide(db, KID, offer(db, 1).uri, "approved");
  decide(db, KID, offer(db, 2).uri, "approved");
  releaseNow(db, KID, 1);

  const last = db.prepare(
    `SELECT MAX(released_at) AS at FROM approved WHERE profile_id = ?`,
  ).get(KID) as { at: string | null };
  assert.ok(last.at, "released_at is stamped, which is what the trickle reads");
  assert.equal(new Date(last.at!).toDateString(), new Date().toDateString());
});

test("a manual release cannot reach past the gate", () => {
  // It releases what was APPROVED. There is no path from here to an album nobody reviewed.
  const db = store();
  offer(db, 1);   // suggested, never approved
  const out = releaseNow(db, KID, 10);
  assert.deepEqual(out.released, []);
  assert.equal(counts(db, KID).inCrate, 0);
});
