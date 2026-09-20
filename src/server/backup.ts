/**
 * The crate backs itself up.
 *
 * ARCHITECTURE.md §3.1: the store is a volume and that is the entire backup story. Everything
 * else in the stack rebuilds from the image in thirty seconds; the SQLite file is append-only
 * and is what the child has memorised.
 *
 * ## Why this is scheduled rather than a command
 *
 * `pb backup` shipped first, and shipping a command makes backing up POSSIBLE — it does not
 * make it HAPPEN. That is the same argument this project already accepted for curation
 * (`curation.ts`), and the crate is a worse thing to lose than a review queue. A maintenance
 * step that depends on someone remembering fails the same way every time: silently, and only
 * discovered at the moment it was needed.
 *
 * ## Where it writes, and why that is not circular
 *
 * Into the volume, beside the store. Backing the volume up *into itself* protects against the
 * failure that actually happens — a bad migration, a mistaken `withdraw`, a corrupted write,
 * a wrong `pb seed` — and not against losing the volume. Losing the volume is the host's
 * problem and DEPLOY.md §6 says so: the host backs the volume up on its own schedule, and
 * because these files live inside it, whatever the host already does now captures point-in-time
 * copies for free, with no second thing to configure.
 *
 * The alternative — writing somewhere outside the volume — means a bind mount, a path that
 * differs per host, and a `read_only: true` container that has to be given somewhere else to
 * write. That is three new ways to be misconfigured in exchange for protection the host is
 * already responsible for.
 */
import type { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { backupTo } from "../store/db.ts";
import { localDate } from "./trickle.ts";

/**
 * Not before this hour, local time.
 *
 * After the curation run at 03:00, so the day's backup contains the day's suggestions rather
 * than yesterday's. A backup taken an hour before the only thing that changes the database
 * would be a backup that is always one day stale in the one table that moves.
 */
export const BACKUP_HOUR = 4;

/** `platebunken-YYYY-MM-DD.sqlite`. Sorts chronologically as a string, which is why the date leads. */
const NAME = /^platebunken-(\d{4}-\d{2}-\d{2})\.sqlite$/;

export const backupName = (date: string) => `platebunken-${date}.sqlite`;

/** Default location: beside the store, inside the volume. */
export const backupDir = (databasePath: string) => join(dirname(databasePath), "backup");

/**
 * The dates already backed up, newest last.
 *
 * Read from the directory rather than from a stored marker, because the files ARE the record.
 * A marker can disagree with reality — restore a volume from last week and a marker would
 * claim today is done — and this cannot.
 */
export function existingBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    // A regular file, not merely a matching name. Anything else wearing the name of today's
    // backup — a directory, a stale mount point — would otherwise be counted as a backup
    // that exists, and the day would be skipped without one being taken.
    .filter((f) => NAME.test(f) && statSync(join(dir, f)).isFile())
    .map((f) => NAME.exec(f)![1]!)
    .sort();
}

export interface BackupDecision {
  run: boolean;
  reason: "too early" | "already today" | "due";
}

/**
 * Whether a backup is due. Pure, and takes the clock: the hour and the day rollover each get
 * one chance a day to be right, and a bug in either is invisible for 24 hours.
 */
export function backupDue(
  now: Date,
  done: readonly string[],
  backupHour = BACKUP_HOUR,
): BackupDecision {
  if (now.getHours() < backupHour) return { run: false, reason: "too early" };
  if (done.includes(localDate(now))) return { run: false, reason: "already today" };
  return { run: true, reason: "due" };
}

/**
 * Delete all but the newest `keep` backups. Returns what was removed.
 *
 * Pruning is not an optimisation here. The crate is small — hundreds of kilobytes — but the
 * volume is the one thing in this stack that must never fill up, because a full volume is a
 * store that cannot be written and a crate that cannot be read.
 */
export function prune(dir: string, keep: number): string[] {
  const all = existingBackups(dir);
  const doomed = keep > 0 ? all.slice(0, Math.max(0, all.length - keep)) : [];
  for (const date of doomed) rmSync(join(dir, backupName(date)), { force: true });
  return doomed;
}

export interface BackupOptions {
  databasePath: string;
  /** How many daily backups to keep. */
  keep: number;
  dir?: string;
  now?: () => Date;
  backupHour?: number;
  onLog?: (message: string) => void;
}

export interface BackupResult {
  path: string;
  bytes: number;
  pruned: string[];
}

/**
 * Run one check, and back up if it is due.
 *
 * Returns null when nothing was due — almost every call. **Never throws into the caller's
 * interval:** a failed backup must not take down the server that is serving the crate, which
 * would turn "today's backup is missing" into "the child's music is gone".
 */
export function runBackup(db: DatabaseSync, opts: BackupOptions): BackupResult | null {
  const now = (opts.now ?? (() => new Date()))();
  const log = opts.onLog ?? ((m: string) => console.log(m));
  const dir = opts.dir ?? backupDir(opts.databasePath);

  if (!backupDue(now, existingBackups(dir), opts.backupHour).run) return null;

  try {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, backupName(localDate(now)));
    backupTo(db, path);

    const bytes = statSync(path).size;
    const pruned = prune(dir, opts.keep);
    log(
      `[backup] ${path} (${bytes} bytes)` +
      (pruned.length ? `, pruned ${pruned.length} older than the last ${opts.keep}` : ""),
    );
    return { path, bytes, pruned };
  } catch (e) {
    // Loud. A backup that has been silently failing is worse than one that was never set up,
    // because the second is known and the first is believed in.
    log(`[backup] ! failed: ${(e as Error).message}`);
    return null;
  }
}
