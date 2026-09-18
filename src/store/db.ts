/**
 * Opening the store. Zero dependencies: `node:sqlite` is built in from Node 22.5 and this
 * project already runs on 26. A kiosk that must survive a decade should not carry a native
 * addon it has to rebuild on every Node upgrade.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS } from "./schema.ts";

export const DEFAULT_DB_PATH = "./data/platebaren.sqlite";

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
