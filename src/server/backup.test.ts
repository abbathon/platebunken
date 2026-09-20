/**
 * The scheduled backup.
 *
 *   node --test src/server/
 *
 * These use a real store on disk rather than ":memory:", because the thing being tested is a
 * file appearing beside another file with the right name and the right contents — none of
 * which exists for an in-memory database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "../store/db.ts";
import { approve, counts, ensureProfile, release, suggest, upsertAlbum, type AlbumInput } from "../store/crate.ts";
import {
  BACKUP_HOUR, backupDir, backupDue, backupName, existingBackups, prune, runBackup,
} from "./backup.ts";
import { CURATE_HOUR } from "./curation.ts";

const KID = "child_a";
const at = (iso: string) => new Date(iso);

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "platebunken-backup-"));
  test.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const album = (n: number): AlbumInput => ({
  uri: `qobuz://album/${n}`, provider: "qobuz", itemId: String(n),
  artist: `Artist ${n}`, title: `Album ${n}`, year: 1990 + n, coverProxyId: `cover-${n}`,
});

/** A store on disk with albums in the crate and candidates pending. */
function live(dir: string) {
  const databasePath = join(dir, "platebunken.sqlite");
  const db = openStore(databasePath);
  ensureProfile(db, KID, "child A");
  for (let n = 1; n <= 4; n++) {
    const a = album(n);
    upsertAlbum(db, a);
    suggest(db, a.uri, "seed", "test");
    approve(db, KID, a.uri);
  }
  release(db, KID, 3);
  return { db, databasePath };
}

const seed = (dir: string, dates: string[]) => {
  const d = join(dir, "backup");
  mkdirSync(d, { recursive: true });
  for (const date of dates) writeFileSync(join(d, backupName(date)), "x");
  return d;
};

test("nothing runs before the hour", () => {
  const d = backupDue(at("2026-09-20T03:30:00"), []);
  assert.equal(d.run, false);
  assert.equal(d.reason, "too early");
});

test("at most one backup a calendar day", () => {
  const d = backupDue(at("2026-09-20T23:00:00"), ["2026-09-19", "2026-09-20"]);
  assert.equal(d.run, false);
  assert.equal(d.reason, "already today");
});

test("the day rolls over and it is due again", () => {
  assert.equal(backupDue(at("2026-09-21T04:00:00"), ["2026-09-20"]).run, true);
});

test("the backup runs after curation, so it contains the day's suggestions", () => {
  // Backing up an hour BEFORE the only job that changes the database would make every backup
  // a day stale in the one table that moves.
  assert.ok(BACKUP_HOUR > CURATE_HOUR, `BACKUP_HOUR (${BACKUP_HOUR}) must be after CURATE_HOUR (${CURATE_HOUR})`);
});

test("a due check writes a dated backup beside the store", () => {
  const dir = scratch();
  const { db, databasePath } = live(dir);
  const before = counts(db, KID);

  const out = runBackup(db, {
    databasePath, keep: 7, now: () => at("2026-09-20T09:00:00"), onLog: () => {},
  });

  assert.ok(out);
  assert.equal(out.path, join(backupDir(databasePath), "platebunken-2026-09-20.sqlite"));
  assert.ok(out.bytes > 0);

  // It is a real database with the real contents, not a zero-byte file that looks like one.
  const copy = new DatabaseSync(out.path, { readOnly: true });
  assert.equal((copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  const inCrate = Number((copy.prepare(
    `SELECT COUNT(*) AS n FROM approved WHERE profile_id = ? AND position IS NOT NULL`,
  ).get(KID) as { n: number }).n);
  assert.equal(inCrate, before.inCrate);
  copy.close();
  db.close();
});

test("a second check the same day writes nothing", () => {
  const dir = scratch();
  const { db, databasePath } = live(dir);
  const opts = { databasePath, keep: 7, now: () => at("2026-09-20T09:00:00"), onLog: () => {} };

  assert.ok(runBackup(db, opts));
  // backupTo refuses to overwrite, so a second run must DECLINE rather than error.
  assert.equal(runBackup(db, opts), null);
  assert.equal(readdirSync(backupDir(databasePath)).length, 1);
  db.close();
});

test("the files are the record, so a restored volume is not re-backed-up", () => {
  const dir = scratch();
  // No marker anywhere; the directory alone says today is done.
  seed(dir, ["2026-09-20"]);
  const { db, databasePath } = live(dir);

  const out = runBackup(db, {
    databasePath, keep: 7, now: () => at("2026-09-20T09:00:00"), onLog: () => {},
  });

  assert.equal(out, null);
  db.close();
});

test("only the newest `keep` survive", () => {
  const dir = scratch();
  const d = seed(dir, [
    "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14",
  ]);

  const pruned = prune(d, 3);

  assert.deepEqual(pruned, ["2026-09-10", "2026-09-11"]);
  assert.deepEqual(existingBackups(d), ["2026-09-12", "2026-09-13", "2026-09-14"]);
});

test("a run prunes as well as writes, so the volume cannot fill", () => {
  const dir = scratch();
  seed(dir, ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]);
  const { db, databasePath } = live(dir);

  const out = runBackup(db, {
    databasePath, keep: 3, now: () => at("2026-09-20T09:00:00"), onLog: () => {},
  });

  assert.ok(out);
  // A full volume is a store that cannot be written and a crate that cannot be read.
  assert.deepEqual(existingBackups(backupDir(databasePath)), ["2026-09-18", "2026-09-19", "2026-09-20"]);
  db.close();
});

test("keep: 0 prunes nothing rather than deleting everything", () => {
  const dir = scratch();
  const d = seed(dir, ["2026-09-18", "2026-09-19"]);

  // Misreading this as "keep none" would delete the backups it was asked to retain.
  assert.deepEqual(prune(d, 0), []);
  assert.equal(existingBackups(d).length, 2);
});

test("files that are not backups are left alone", () => {
  const dir = scratch();
  const d = seed(dir, ["2026-09-19"]);
  writeFileSync(join(d, "notes.txt"), "x");
  writeFileSync(join(d, "platebunken.sqlite"), "x");

  prune(d, 0);
  assert.deepEqual(existingBackups(d), ["2026-09-19"]);
  assert.ok(existsSync(join(d, "notes.txt")));
  assert.ok(existsSync(join(d, "platebunken.sqlite")), "the store itself must never be pruned");
});

test("a failure is reported, not thrown into the caller's interval", () => {
  const dir = scratch();
  const { db, databasePath } = live(dir);
  const logs: string[] = [];

  // The destination exists as a directory, so the write cannot succeed.
  mkdirSync(join(backupDir(databasePath), backupName("2026-09-20")), { recursive: true });

  const out = runBackup(db, {
    databasePath, keep: 7, now: () => at("2026-09-20T09:00:00"), onLog: (m) => logs.push(m),
  });

  // A failed backup must not take down the server serving the crate he already has.
  assert.equal(out, null);
  assert.ok(logs.some((l) => /\[backup] ! failed/.test(l)), logs.join("\n"));
  db.close();
});
