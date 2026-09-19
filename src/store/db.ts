/**
 * Opening the store. Zero dependencies: `node:sqlite` is built in from Node 22.5 and this
 * project already runs on 26. A kiosk that must survive a decade should not carry a native
 * addon it has to rebuild on every Node upgrade.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS } from "./schema.ts";

export const DEFAULT_DB_PATH = "./data/platebunken.sqlite";

/**
 * Open the store and bring it up to the current schema. Safe to call repeatedly.
 *
 * Pass ":memory:" for tests. WAL is on because the curation worker writes while the kiosk
 * reads, and the child must never wait on a lock to see his covers.
 */
export function openStore(path = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

/**
 * Copy the whole store to `path`, consistently, while it is open and being written to.
 *
 * **Never `cp` a live database.** This one runs in WAL mode, so a plain file copy takes the
 * main file and leaves whatever has not been checkpointed yet in the `-wal` sidecar beside
 * it. It does not error and the result opens fine — it is just an older database than the one
 * you copied. A copy taken this way during deployment read 16 albums and 0 pending when the
 * real store had 46 and 30, and nothing anywhere said so.
 *
 * `VACUUM INTO` is SQLite's own answer: one transaction-consistent, already-compacted file,
 * safe to take from a running process. It applies to every backup of this product forever.
 *
 * The path is a bound parameter rather than interpolated SQL. That is not only injection
 * hygiene: the quoting needed to inline a path into `VACUUM INTO '...'` is exactly what made
 * the runbook's version of this an unreadable one-liner nobody could check.
 *
 * Refuses an existing target — a backup that silently overwrote yesterday's would be a backup
 * schedule that keeps exactly one copy. The check is ours rather than SQLite's because
 * SQLite's depends on what the file happens to contain: an old backup gives "output file
 * already exists", but any other file gives "file is not a database", which reads like the
 * SOURCE is corrupt and sends an operator to check the crate at the worst possible moment.
 */
export function backupTo(db: DatabaseSync, path: string): void {
  if (existsSync(path)) {
    throw new Error(`${path} already exists; back up to a new file rather than over an old one.`);
  }
  mkdirSync(dirname(path), { recursive: true });
  db.prepare("VACUUM INTO ?").run(path);
}

/** Apply any migrations the file has not seen, in order, each in its own transaction. */
export function migrate(db: DatabaseSync): number {
  const at = () => Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  const from = at();
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]!);
      // user_version takes no bound parameter, and v is a loop index, not input.
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${v + 1} failed: ${(e as Error).message}`, { cause: e });
    }
  }
  return at() - from;
}
