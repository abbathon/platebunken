/**
 * The curation schedule.
 *
 *   node --test src/server/
 *
 * These tests never reach the network: `curateImpl` is injected, because what is being tested
 * is WHEN the worker runs, not what it finds. The worker's own behaviour is covered in
 * src/curate/curate.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../store/db.ts";
import { ensureProfile } from "../store/crate.ts";
import { claimCuration, curationDue, lastCurationAt, runCuration, CURATE_HOUR } from "./curation.ts";
import type { CurateReport } from "../curate/worker.ts";

const KID = "child_a";
const ALL_ON = { listenbrainz: true, deezer: true };

function store() {
  const db = openStore(":memory:");
  ensureProfile(db, KID, "child A");
  return db;
}

const at = (iso: string) => new Date(iso);
const empty = (): CurateReport => ({
  disabled: [], noDeezerMatch: [], crateArtists: 0, resolved: 0, unresolved: [],
  neighbours: 0, alreadyHave: 0, searched: 0, candidates: [],
  skippedNoArtwork: 0, skippedKnown: 0, skippedWrongArtist: 0, skippedDuplicate: 0,
});

/** A worker stand-in that records its calls instead of curating. */
function spy(report: () => CurateReport = empty) {
  const calls: unknown[] = [];
  const impl = async (_db: unknown, _client: unknown, opts: unknown) => {
    calls.push(opts);
    return report();
  };
  return { calls, impl: impl as never };
}

const client = async () => ({}) as never;

test("nothing runs before the hour, however long it has been", () => {
  // A container restarted at two in the morning must not start a few hundred paced outbound
  // requests at two in the morning.
  const d = curationDue(at("2026-09-20T02:00:00"), null, true);
  assert.equal(d.run, false);
  assert.equal(d.reason, "too early");
});

test("at most one run a calendar day", () => {
  const d = curationDue(at("2026-09-20T22:00:00"), at("2026-09-20T03:00:00"), true);
  assert.equal(d.run, false);
  assert.equal(d.reason, "already today");
});

test("the day rolls over and it is due again", () => {
  const d = curationDue(at("2026-09-21T03:00:00"), at("2026-09-20T03:00:00"), true);
  assert.equal(d.run, true);
  assert.equal(d.reason, "due");
});

test("every source switched off means there is nothing to run", () => {
  // Not an error and not a silent no-op: the parent turned them off, and the reason says so.
  const d = curationDue(at("2026-09-20T09:00:00"), null, false);
  assert.equal(d.run, false);
  assert.equal(d.reason, "switched off");
});

test("a source that is designed but not built does not keep curation alive", async () => {
  const db = store();
  const w = spy();

  // The stored settings carry `lastfm` and `charts` as well, and `lastfm` DEFAULTS TO TRUE.
  // Counting the raw settings object would mean the parent could never switch curation off:
  // a source nothing implements would vote for it forever.
  const report = await runCuration(db, client, {
    profileId: KID,
    sources: { listenbrainz: false, lastfm: true, deezer: false, charts: false } as never,
    now: () => at("2026-09-20T09:00:00"), onLog: () => {}, curateImpl: w.impl,
  });

  assert.equal(report, null);
  assert.equal(w.calls.length, 0);
});

test("a first run on a fresh store is due as soon as the hour has passed", () => {
  const d = curationDue(at("2026-09-20T09:00:00"), null, true);
  assert.equal(d.run, true);
});

test("the last run survives a restart, because it is in the store and not in memory", () => {
  const db = store();
  assert.equal(lastCurationAt(db, KID), null);

  claimCuration(db, KID, at("2026-09-20T03:00:00Z"));

  assert.equal(lastCurationAt(db, KID)?.toISOString(), "2026-09-20T03:00:00.000Z");
});

test("a due check runs the worker, with write on and the parent's sources", async () => {
  const db = store();
  const w = spy();

  const report = await runCuration(db, client, {
    profileId: KID, sources: ALL_ON, maxSuggestions: 7,
    now: () => at("2026-09-20T09:00:00"), onLog: () => {}, curateImpl: w.impl,
  });

  assert.ok(report);
  assert.equal(w.calls.length, 1);
  assert.deepEqual(w.calls[0], {
    profileId: KID, write: true, sources: ALL_ON, maxSuggestions: 7,
    onLog: (w.calls[0] as { onLog: unknown }).onLog,
  });
});

test("a second check the same day does not run the worker again", async () => {
  const db = store();
  const w = spy();
  const opts = {
    profileId: KID, sources: ALL_ON, onLog: () => {},
    now: () => at("2026-09-20T09:00:00"), curateImpl: w.impl,
  };

  await runCuration(db, client, opts);
  await runCuration(db, client, { ...opts, now: () => at("2026-09-20T23:00:00") });

  assert.equal(w.calls.length, 1);
});

test("the run is claimed before it starts, so two overlapping checks cannot both curate", async () => {
  const db = store();
  // A real run takes minutes and the check fires every half hour. Two interleaved runs would
  // double every paced request to MusicBrainz and Metal Archives.
  let started = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const impl = (async () => { started++; await held; return empty(); }) as never;

  const opts = {
    profileId: KID, sources: ALL_ON, onLog: () => {},
    now: () => at("2026-09-20T09:00:00"), curateImpl: impl,
  };
  const first = runCuration(db, client, opts);
  const second = await runCuration(db, client, opts);

  assert.equal(started, 1);
  assert.equal(second, null, "the second check must decline while the first is still running");
  release();
  await first;
});

test("a worker that throws is reported, not propagated into the caller's interval", async () => {
  const db = store();
  const logs: string[] = [];
  const impl = (async () => { throw new Error("ListenBrainz Labs is down"); }) as never;

  const report = await runCuration(db, client, {
    profileId: KID, sources: ALL_ON, now: () => at("2026-09-20T09:00:00"),
    onLog: (m) => logs.push(m), curateImpl: impl,
  });

  // A failed curation must not take down the server serving the crate he already has.
  assert.equal(report, null);
  assert.ok(logs.some((l) => /run failed.*Labs is down/.test(l)), logs.join("\n"));
});

test("a connection that cannot be made is reported the same way", async () => {
  const db = store();
  const logs: string[] = [];
  const dead = async () => { throw new Error("MA is unreachable"); };

  const report = await runCuration(db, dead as never, {
    profileId: KID, sources: ALL_ON, now: () => at("2026-09-20T09:00:00"),
    onLog: (m) => logs.push(m), curateImpl: spy().impl,
  });

  assert.equal(report, null);
  assert.ok(logs.some((l) => /unreachable/.test(l)), logs.join("\n"));
});

test("the hour it will not run before is in the small hours, not during his day", () => {
  // If this ever becomes an afternoon, the run competes with the child actually using the
  // crate over the same WebSocket.
  assert.ok(CURATE_HOUR >= 1 && CURATE_HOUR <= 5);
});
