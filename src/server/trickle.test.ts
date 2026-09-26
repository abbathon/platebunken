/**
 * The new shelf.
 *
 * This decides the one moment an approved album becomes real to the child — a position, which
 * is his only index into his music. It gets exactly one chance a day to be right, so a bug
 * here is invisible for twenty-four hours and then either hands him nothing or hands him
 * everything at once.
 *
 * The clock is injected, because the two things worth testing are both boundaries: the release
 * hour and the local-day rollover.
 *
 *   node --test src/server/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../store/db.ts";
import { approve, counts, ensureProfile, setTracks, suggest, upsertAlbum, type AlbumInput } from "../store/crate.ts";
import { localDate, runTrickle, trickleDue, RELEASE_HOUR } from "./trickle.ts";

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
 * Approve n albums, leaving them waiting for release.
 *
 * Each gets a track list. `release()` skips an album that has none — a crate position is
 * permanent, so it is never spent on a record that would open onto nothing — and every test
 * in this file is about WHEN a release happens, not about that rule.
 */
function approveMany(db: ReturnType<typeof store>, n: number) {
  for (let i = 1; i <= n; i++) {
    const a = album(i);
    upsertAlbum(db, a);
    setTracks(db, a.uri, [{ n: 1, title: `Track 1 of ${i}` }]);
    suggest(db, a.uri, "similar", "test");
    approve(db, KID, a.uri);
  }
}

/** A local-time Date, so the tests read as wall-clock rather than as UTC arithmetic. */
const at = (iso: string) => new Date(iso);

test("nothing is released before the morning", () => {
  // A container restarted at two in the morning must not hand him a new record at two in the
  // morning. §4.1: the shelf changes while he is asleep.
  const early = at("2026-09-20T05:59:00");
  assert.deepEqual(trickleDue(early, null, 5), { release: false, reason: "too early" });

  const morning = at("2026-09-20T06:00:00");
  assert.equal(trickleDue(morning, null, 5).release, true);
  assert.equal(new Date("2026-09-20T06:00:00").getHours(), RELEASE_HOUR, "the fixture matches the constant");
});

test("at most one release a day", () => {
  // Not "every N hours". A record appearing while he is looking at the grid is a
  // notification, and this product does not notify a four-year-old.
  const morning = at("2026-09-20T07:00:00");
  const laterSameDay = at("2026-09-20T19:00:00");

  assert.equal(trickleDue(morning, null, 5).release, true);
  assert.deepEqual(
    trickleDue(laterSameDay, morning, 5),
    { release: false, reason: "already today" },
  );
});

test("the next morning is due again", () => {
  const yesterday = at("2026-09-20T07:00:00");
  const today = at("2026-09-21T07:00:00");
  assert.equal(trickleDue(today, yesterday, 5).release, true);
});

test("the boundary is the local calendar day, not twenty-four hours", () => {
  // Released late yesterday, checked early-ish today: less than 24h apart, but a different
  // day, so it is due. A 24-hour rule would drift the release later every single day.
  const lateYesterday = at("2026-09-20T23:30:00");
  const thisMorning = at("2026-09-21T07:00:00");

  assert.ok(thisMorning.getTime() - lateYesterday.getTime() < 24 * 3600_000);
  assert.equal(trickleDue(thisMorning, lateYesterday, 5).release, true);
});

test("nothing waiting is not a release", () => {
  assert.deepEqual(trickleDue(at("2026-09-20T09:00:00"), null, 0), {
    release: false, reason: "nothing waiting",
  });
});

test("localDate is the process's own day, formatted for comparison not for reading", () => {
  assert.match(localDate(at("2026-09-20T07:00:00")), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(localDate(at("2026-09-20T00:30:00")), localDate(at("2026-09-20T23:30:00")));
  assert.notEqual(localDate(at("2026-09-20T23:30:00")), localDate(at("2026-09-21T00:30:00")));
});

/* ── against a real store ──────────────────────────────────────────── */

test("a release moves exactly the day's allowance into the crate", () => {
  const db = store();
  approveMany(db, 5);
  assert.equal(counts(db, KID).inCrate, 0, "approval is not release");
  assert.equal(counts(db, KID).waitingToRelease, 5);

  const out = runTrickle(db, {
    profileId: KID, perDay: 1, waiting: 5,
    now: () => at("2026-09-20T07:00:00"), onLog: () => {},
  });

  assert.equal(out.length, 1);
  assert.equal(counts(db, KID).inCrate, 1);
  assert.equal(counts(db, KID).waitingToRelease, 4, "the rest still wait");
});

test("a second run the same day releases nothing", () => {
  // This is the case the half-hourly check hits forty-seven times a day.
  const db = store();
  approveMany(db, 5);
  const opts = { profileId: KID, perDay: 1, waiting: 5, onLog: () => {} };

  runTrickle(db, { ...opts, now: () => at("2026-09-20T07:00:00") });
  const second = runTrickle(db, { ...opts, waiting: 4, now: () => at("2026-09-20T07:30:00") });

  assert.deepEqual(second, []);
  assert.equal(counts(db, KID).inCrate, 1);
});

test("a dozen approvals on a Sunday still arrive one at a time", () => {
  // §4.1, stated as a test. The whole reason position is assigned at release.
  const db = store();
  approveMany(db, 12);

  for (let day = 20; day <= 24; day++) {
    runTrickle(db, {
      profileId: KID, perDay: 1, waiting: counts(db, KID).waitingToRelease,
      now: () => at(`2026-09-${day}T08:00:00`), onLog: () => {},
    });
  }
  assert.equal(counts(db, KID).inCrate, 5, "five mornings, five records");
  assert.equal(counts(db, KID).waitingToRelease, 7);
});

test("positions stay contiguous from zero as the trickle runs", () => {
  // The child's index into his music. A gap here would be a slot he walks to and finds empty.
  const db = store();
  approveMany(db, 3);
  for (let day = 20; day <= 22; day++) {
    runTrickle(db, {
      profileId: KID, perDay: 1, waiting: counts(db, KID).waitingToRelease,
      now: () => at(`2026-09-${day}T08:00:00`), onLog: () => {},
    });
  }
  const rows = db.prepare(
    `SELECT position FROM approved WHERE profile_id = ? AND position IS NOT NULL ORDER BY position`,
  ).all(KID) as { position: number }[];
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
});

test("a per-day setting below one still releases one", () => {
  // A zero in the settings table must not silently stop the shelf forever. Turning the trickle
  // off is not a thing the settings screen offers, and it should not be reachable by accident.
  const db = store();
  approveMany(db, 3);
  const out = runTrickle(db, {
    profileId: KID, perDay: 0, waiting: 3,
    now: () => at("2026-09-20T08:00:00"), onLog: () => {},
  });
  assert.equal(out.length, 1);
});

test("an empty crate with nothing approved is a quiet no-op", () => {
  const db = store();
  assert.deepEqual(
    runTrickle(db, { profileId: KID, perDay: 1, waiting: 0, now: () => at("2026-09-20T08:00:00"), onLog: () => {} }),
    [],
  );
  assert.equal(counts(db, KID).inCrate, 0);
});
