/**
 * The new shelf, one record at a time.
 *
 * ARCHITECTURE.md §4.1: approved albums are released on a trickle "so there is nearly always a
 * reason to walk over and look". Approval puts an album in the crate's *future*; this is what
 * moves it into the crate. `release()` assigns the position, and a position is the child's only
 * index into his music — so this is the moment an album becomes real to him.
 *
 * **Before this existed the loop was open.** `approve()` wrote a row with `position = NULL`,
 * the grid reads `WHERE position IS NOT NULL`, and the only caller of `release()` in the whole
 * system was `scripts/db-seed.ts`. Pressing ✓ at /admin put an album in a queue that nothing
 * drained: `waitingToRelease` climbed and the crate never changed. `tricklePerDay` had been a
 * stored setting with no consumer since the day it was added.
 *
 * Two rules, both from §4.1 and neither negotiable by a setting:
 *
 *   - **At most one release a day.** Not "every N hours": the point is that the shelf changes
 *     while he is asleep, so the crate he wakes up to is different from the one he left. A
 *     record appearing while he is looking at the grid is a notification, and this product
 *     does not notify a four-year-old.
 *   - **In the morning, local time.** The container sets `TZ=Europe/Oslo` precisely because
 *     "the new shelf arrives in the morning" is a statement about the child's morning and not
 *     about UTC.
 */
import type { DatabaseSync } from "node:sqlite";
import { release, type StoredAlbum } from "../store/crate.ts";

/**
 * Not before this hour, local time.
 *
 * Six is early enough that it has always happened before he is up, and late enough that a
 * container restarted at two in the morning does not hand him a new record at two in the
 * morning.
 */
export const RELEASE_HOUR = 6;

/** How often the running process wakes up to check. Cheap: it is one indexed query. */
export const CHECK_INTERVAL_MS = 30 * 60_000;

/**
 * The local calendar date of an instant, as YYYY-MM-DD.
 *
 * `sv-SE` is used for its format, not its locale — it is the one built-in locale that renders
 * ISO-ordered dates, which makes this a string comparison rather than date arithmetic. The
 * process timezone is what decides the boundary, which is why the image sets TZ.
 */
export function localDate(at: Date): string {
  return at.toLocaleDateString("sv-SE");
}

/** The most recent release, or null if nothing has ever been released. */
export function lastReleaseAt(db: DatabaseSync, profileId: string): Date | null {
  const row = db.prepare(
    `SELECT MAX(released_at) AS at FROM approved WHERE profile_id = ? AND released_at IS NOT NULL`,
  ).get(profileId) as { at: string | null } | undefined;
  return row?.at ? new Date(row.at) : null;
}

export interface TrickleDecision {
  release: boolean;
  reason: "too early" | "already today" | "nothing waiting" | "due";
}

/**
 * Whether a release is due, and why not when it is not.
 *
 * Pure, and takes the clock, so the two boundaries that actually matter — the hour and the day
 * rollover — can be tested without waiting for either. Both have exactly one chance a day to be
 * right, and a bug in either is invisible for 24 hours.
 */
export function trickleDue(
  now: Date,
  lastRelease: Date | null,
  waiting: number,
  releaseHour = RELEASE_HOUR,
): TrickleDecision {
  if (waiting <= 0) return { release: false, reason: "nothing waiting" };
  if (now.getHours() < releaseHour) return { release: false, reason: "too early" };
  if (lastRelease && localDate(lastRelease) === localDate(now)) {
    return { release: false, reason: "already today" };
  }
  return { release: true, reason: "due" };
}

export interface TrickleOptions {
  profileId: string;
  perDay: number;
  waiting: number;
  now?: () => Date;
  onLog?: (message: string) => void;
}

/**
 * Run one check, and release if it is due.
 *
 * Returns what became visible — empty is the normal answer on almost every call. Never throws
 * into the caller's interval: a failed release must not take down the server that is serving
 * the crate he already has.
 */
export function runTrickle(db: DatabaseSync, opts: TrickleOptions): StoredAlbum[] {
  const now = (opts.now ?? (() => new Date()))();
  const log = opts.onLog ?? ((m: string) => console.log(m));

  const decision = trickleDue(now, lastReleaseAt(db, opts.profileId), opts.waiting);
  if (!decision.release) return [];

  try {
    // The SAME clock that decided the release is due stamps it, so the next check compares
    // like with like. See the note on release().
    const out = release(db, opts.profileId, Math.max(1, opts.perDay), now.toISOString());
    for (const a of out) log(`[trickle] released: ${a.artist} — ${a.title}`);
    return out;
  } catch (e) {
    log(`[trickle] ! release failed: ${(e as Error).message}`);
    return [];
  }
}
