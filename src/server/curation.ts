/**
 * Keeping the review queue full, without anybody remembering to.
 *
 * The curation worker (`src/curate/worker.ts`) suggests; the parent decides at /admin; the
 * trickle releases. The middle step has always had a person in it and always will — §5's gate
 * is an architectural boundary, not a setting. **What did not have a person in it, and should
 * not have, is the first step.**
 *
 * Before this, the only way to run the worker was `npm run curate -- --write` from a developer's
 * checkout, and `scripts/` does not ship in the image. So on the real deployment the queue
 * drained as the parent approved and nothing refilled it — a failure that surfaces weeks later
 * as "there is nothing left to review" and whose cause is not remotely obvious from there.
 * Shipping a CLI in the image makes refilling POSSIBLE; it does not make it HAPPEN, and a
 * maintenance step that depends on someone remembering has exactly the failure mode above.
 *
 * So this is the trickle's shape, applied to the other end of the pipeline: an in-process
 * daily check, deciding for itself whether anything is due. `runCuration` and the `pb curate`
 * command are two adapters over one worker — automatic and manual, exactly as `release()` has
 * the trickle and the parent's "Slipp én nå" button.
 *
 * **It still decides nothing.** Everything it produces lands in `candidate` as undecided. A
 * scheduled curation cannot put music in front of the child; `approve()` refuses.
 */
import type { DatabaseSync } from "node:sqlite";
import type { MassClient } from "../ma/client.ts";
import { cacheGet, cachePut } from "../store/crate.ts";
import { curate, enabledSources, type CurateOptions, type CurateReport } from "../curate/worker.ts";
import { localDate } from "./trickle.ts";

/**
 * Not before this hour, local time.
 *
 * Three in the morning, for two reasons that both point the same way. The run makes a few
 * hundred paced outbound requests — MusicBrainz at 1.1s, Metal Archives at its published
 * 3s crawl-delay — and doing that at night is the polite version of being a good citizen of
 * somebody else's free API. And it means the queue the parent finds on their phone in the
 * morning was filled overnight rather than while they were looking at it.
 */
export const CURATE_HOUR = 3;

/** Where the last run is recorded. See `lastCurationAt` for why this table is the right one. */
const CACHE_KIND = "curate_run";

export interface CurationDecision {
  run: boolean;
  reason: "switched off" | "too early" | "already today" | "due";
}

/**
 * When curation last ran for this profile, or null if it never has.
 *
 * Kept in the worker's own cache table, whose contract is that every row can be dropped and
 * refetched. That holds exactly: drop this row and the next check curates, which is what a
 * refetch means here. It is deliberately NOT derived from the newest candidate's timestamp —
 * a run that finds nothing new leaves no candidate behind, and would then look forever like
 * a run that never happened.
 */
export function lastCurationAt(db: DatabaseSync, profileId: string): Date | null {
  const row = cacheGet<string>(db, CACHE_KIND, profileId);
  if (!row?.value) return null;
  const at = new Date(row.value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Claim today's run.
 *
 * Stamped BEFORE the worker starts, not after, and that ordering is the overlap guard: a run
 * takes minutes, the check fires every half hour, and two interleaved runs would double every
 * paced request to MusicBrainz and Metal Archives. The cost of claiming first is that a run
 * which dies half way does not retry until tomorrow — which is the cheaper failure, because
 * nothing downstream is waiting on it and the log says what happened.
 */
export function claimCuration(db: DatabaseSync, profileId: string, at: Date): void {
  cachePut(db, CACHE_KIND, profileId, at.toISOString());
}

/**
 * Whether a curation run is due, and why not when it is not.
 *
 * Pure, and takes the clock, because the two boundaries that matter — the hour and the day
 * rollover — each get one chance a day to be right and a bug in either is invisible for 24
 * hours. The trickle learned this the same way.
 */
export function curationDue(
  now: Date,
  lastRun: Date | null,
  enabled: boolean,
  curateHour = CURATE_HOUR,
): CurationDecision {
  if (!enabled) return { run: false, reason: "switched off" };
  if (now.getHours() < curateHour) return { run: false, reason: "too early" };
  if (lastRun && localDate(lastRun) === localDate(now)) {
    return { run: false, reason: "already today" };
  }
  return { run: true, reason: "due" };
}

export interface CurationOptions {
  profileId: string;
  /** Every suggestion source switched off means there is nothing for a run to do. */
  sources: CurateOptions["sources"];
  maxSuggestions?: number;
  now?: () => Date;
  onLog?: (message: string) => void;
  curateHour?: number;
  /** Injected so a test of the SCHEDULE never reaches MusicBrainz. */
  curateImpl?: typeof curate;
}

/**
 * Run one check, and curate if it is due.
 *
 * Returns the report when it ran and null when it did not — almost every call is a no-op and
 * says nothing. **Never throws into the caller's interval:** a failed curation must not take
 * down the server that is serving the crate the child already has. That is the same rule as
 * `runTrickle`, and for the same reason.
 */
export async function runCuration(
  db: DatabaseSync,
  client: () => Promise<MassClient>,
  opts: CurationOptions,
): Promise<CurateReport | null> {
  const now = (opts.now ?? (() => new Date()))();
  const log = opts.onLog ?? ((m: string) => console.log(m));
  /**
   * Asked through `enabledSources`, which is the one place that decides which sources the
   * worker actually has. The stored settings also carry `lastfm` and `charts` — designed,
   * not built — and `lastfm` defaults to true, so counting the raw settings object would
   * make "the parent switched everything off" a state this could never observe.
   */
  const enabled = Object.values(enabledSources(opts.sources)).some(Boolean);

  const decision = curationDue(now, lastCurationAt(db, opts.profileId), enabled, opts.curateHour);
  if (!decision.run) return null;

  claimCuration(db, opts.profileId, now);

  try {
    const run = opts.curateImpl ?? curate;
    const report = await run(db, await client(), {
      profileId: opts.profileId,
      write: true,
      sources: opts.sources,
      maxSuggestions: opts.maxSuggestions,
      onLog: log,
    });
    const n = report.candidates.length;
    log(
      n === 0
        ? `[curate] nothing new to suggest today (${report.searched} artists searched)`
        : `[curate] ${n} new albums in the review queue`,
    );
    return report;
  } catch (e) {
    // Loud, because the symptom of a curation that silently stopped is an empty review queue
    // noticed weeks later — the exact failure this whole module exists to remove.
    log(`[curate] ! run failed: ${(e as Error).message}`);
    return null;
  }
}
