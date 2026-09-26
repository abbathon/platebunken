/**
 * Opening and copying the store.
 *
 *   node --test src/store/
 *
 * The backup tests exist because the failure they describe is silent. A `cp` of a live WAL
 * database produces a file that opens, passes an integrity check and is simply out of date —
 * there is no error to notice and no moment at which anyone finds out except the one where
 * the crate is being restored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupTo, openStore } from "./db.ts";
import { approve, counts, ensureProfile, release, setTracks, suggest, upsertAlbum, type AlbumInput } from "./crate.ts";

const KID = "child_a";

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "platebunken-db-"));
  test.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const album = (n: number): AlbumInput => ({
  uri: `qobuz://album/${n}`, provider: "qobuz", itemId: String(n),
  artist: `Artist ${n}`, title: `Album ${n}`, year: 1990 + n, coverProxyId: `cover-${n}`,
});

/** A store on disk, in WAL, with albums in the crate and candidates still pending. */
function live(dir: string) {
  const path = join(dir, "platebunken.sqlite");
  const db = openStore(path);
  ensureProfile(db, KID, "child A");
  for (let n = 1; n <= 5; n++) {
    const a = album(n);
    upsertAlbum(db, a);
    // A number line, or `release()` below places nothing: a crate position is permanent and
    // is never spent on an album that would open onto an empty track list.
    setTracks(db, a.uri, [{ n: 1, title: `Track 1 of ${n}` }]);
    suggest(db, a.uri, "seed", "test");
    approve(db, KID, a.uri);
  }
  release(db, KID, 3);
  for (let n = 6; n <= 8; n++) {
    const a = album(n);
    upsertAlbum(db, a);
    suggest(db, a.uri, "similar", "test");
  }
  return { db, path };
}

test("a backup taken from a live store sees everything the live store sees", () => {
  const dir = scratch();
  const { db } = live(dir);
  const before = counts(db, KID);
  assert.ok(before.inCrate > 0 && before.pending > 0, "the fixture has to have unflushed writes to be a test");

  const out = join(dir, "backup.sqlite");
  backupTo(db, out);

  // Opened read-only and WITHOUT migrating, so this asserts about the copied bytes rather
  // than about anything openStore might repair on the way in.
  const copy = new DatabaseSync(out, { readOnly: true });
  const inCrate = Number((copy.prepare(
    `SELECT COUNT(*) AS n FROM approved WHERE profile_id = ? AND position IS NOT NULL`,
  ).get(KID) as { n: number }).n);
  const pending = Number((copy.prepare(
    `SELECT COUNT(*) AS n FROM candidate WHERE decided_at IS NULL`,
  ).get() as { n: number }).n);

  assert.equal(inCrate, before.inCrate);
  assert.equal(pending, before.pending);
  copy.close();
  db.close();
});

test("a backup is a complete database, not a fragment needing its -wal sidecar", () => {
  const dir = scratch();
  const { db } = live(dir);
  const out = join(dir, "backup.sqlite");
  backupTo(db, out);
  db.close();

  const copy = new DatabaseSync(out, { readOnly: true });
  const check = (copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string });
  assert.equal(check.integrity_check, "ok");
  // The schema version travels with it: a restored crate must not be re-migrated from zero.
  assert.ok(Number((copy.prepare("PRAGMA user_version").get() as { user_version: number }).user_version) > 0);
  copy.close();
});

test("backing up over an existing file is refused, and says so in words", () => {
  const dir = scratch();
  const { db } = live(dir);
  const out = join(dir, "backup.sqlite");
  writeFileSync(out, "yesterday's backup");

  // Overwriting silently would turn a backup schedule into a single rolling copy.
  assert.throws(() => backupTo(db, out), /already exists/);
  db.close();
});

test("a backup into a directory that does not exist yet creates it", () => {
  const dir = scratch();
  const { db } = live(dir);
  const out = join(dir, "nested", "deeper", "backup.sqlite");

  backupTo(db, out);

  const copy = new DatabaseSync(out, { readOnly: true });
  assert.equal((copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  copy.close();
  db.close();
});
