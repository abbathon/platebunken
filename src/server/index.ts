/**
 * platebunken-server. ARCHITECTURE.md §3, deployed as a Docker image per §3.1.
 *
 *   node --env-file=.env src/server/index.ts     # development
 *   docker compose up -d                         # the kiosk
 *
 * It serves the built page AND the API from one process, holds the SQLite store, and owns the
 * only Music Assistant credential in the system. The laptop in the bedroom holds no state:
 * destroy it, swap in another, lose nothing.
 *
 * No build step. Node strips the types, so the container runs this file directly — which also
 * means no `dist/` of compiled server code to get out of step with the source. (Only the PAGE
 * is built, by Vite, because a browser cannot do the same.)
 */
import { createServer } from "node:http";
import { openStore } from "../store/db.ts";
import { ensureProfile, counts } from "../store/crate.ts";
import { CHECK_INTERVAL_MS, runTrickle } from "./trickle.ts";
import { CURATE_HOUR, runCuration } from "./curation.ts";
import { BACKUP_HOUR, existingBackups, backupDir, runBackup } from "./backup.ts";
import { enabledSources } from "../curate/worker.ts";
import { config, canPlay } from "./config.ts";
import { createApp } from "./app.ts";
import { closeMa, ma, restoreTarget } from "./speaker.ts";
import { load as loadSettings } from "./settings.ts";

const db = openStore(config.databasePath);
ensureProfile(db, config.profile.id, config.profile.label);

// The speaker the parent last chose. Without this the output reverted to PLAYER_ID_PRIMARY on
// every restart, which with a container means every redeploy.
restoreTarget(loadSettings(db).playerId);

const server = createServer(createApp(db));

/**
 * What is true at boot, said once, where an operator will see it.
 *
 * Every line here is something that has cost time when it was wrong, and each is invisible
 * from inside the running system: a volume ceiling that quietly defaulted, an empty crate
 * that looks to a four-year-old exactly like all his music being gone, a container that
 * starts fine and cannot play because the token was never passed in.
 */
function announce(): void {
  const c = counts(db, config.profile.id);
  console.log(`platebunken-server  http://${config.host}:${config.port}`);
  console.log(`  store    ${config.databasePath}`);
  console.log(`  page     ${config.publicDir}`);
  console.log(`  crate    ${c.inCrate} albums, ${c.waitingToRelease} waiting to release, ${c.pending} in the review queue`);
  if (c.inCrate === 0) {
    console.warn(`  ! the crate is EMPTY. Nothing has been approved and released yet — run \`pb seed --write\`.`);
  }
  if (c.invisible > 0) {
    console.warn(`  ! ${c.invisible} approved albums have no artwork; in a cover-art interface those are invisible albums.`);
  }
  /**
   * The curation schedule, said at boot for the same reason as everything else here: the
   * previous version of this was a command on a developer's laptop, and the way that failed
   * was an empty review queue weeks later with nothing anywhere saying why.
   */
  const on = Object.entries(enabledSources(loadSettings(db).sources)).filter(([, v]) => v).map(([k]) => k);
  if (on.length) {
    console.log(`  curate   daily after ${String(CURATE_HOUR).padStart(2, "0")}:00 local, from ${on.join(" + ")}`);
  } else {
    console.warn(`  ! every suggestion source is off in Settings → Kilder; the review queue will not refill.`);
  }
  /**
   * The backup schedule and what is already kept. Said at boot because a backup nobody has
   * seen is a backup nobody has checked, and the failure mode of a silently-stopped backup is
   * that it is believed in right up until it is needed.
   */
  const kept = existingBackups(backupDir(config.databasePath));
  const keep = config.backupKeep;
  console.log(
    `  backup   daily after ${String(BACKUP_HOUR).padStart(2, "0")}:00 local, ` +
    `keeping ${keep === 0 ? "every one" : `the last ${keep}`}` +
    (kept.length ? `; newest ${kept[kept.length - 1]}, ${kept.length} on disk` : `; none yet`),
  );
  if (canPlay()) {
    console.log(`  speaker  ${config.playerId} via ${config.ma.baseUrl}, ceiling ${config.volume.ceiling}/100`);
  } else {
    console.warn(`  ! no MA_HOST, MA_TOKEN or PLAYER_ID_PRIMARY: the crate will run SILENT.`);
  }
  if (!process.env.VOLUME_CEILING) {
    console.warn(`  ! VOLUME_CEILING is not set; defaulting to ${config.volume.ceiling}. It is a hearing-safety`);
    console.warn(`    limit and must come from an SPL measurement at the pillow, not from this default.`);
  }
}

/**
 * The new shelf (§4.1).
 *
 * Checked at boot and then every half hour, because the process is expected to run for weeks
 * and a daily job that only runs at startup is a daily job that runs once. `runTrickle` decides
 * whether anything is actually due; almost every call is a no-op and says nothing.
 *
 * `unref()` so this timer never holds the process open during shutdown — the crate is mid-write
 * often enough that an extra half hour of SIGTERM is a real cost.
 */
function trickle(): void {
  const c = counts(db, config.profile.id);
  const s = loadSettings(db);
  const out = runTrickle(db, {
    profileId: config.profile.id,
    perDay: s.tricklePerDay,
    waiting: c.waitingToRelease,
  });
  if (out.length) {
    console.log(`[trickle] the crate is now ${counts(db, config.profile.id).inCrate} albums`);
  }
}

/**
 * Keeping the review queue full (§5, `curation.ts`).
 *
 * Shares the trickle's half-hourly wake-up rather than adding a second timer: both are one
 * indexed read that almost always decides to do nothing, and one interval is one thing to
 * reason about when a scheduled job does not fire.
 *
 * Deliberately not awaited. A curation run takes minutes of paced outbound requests, and
 * nothing — not the page, not the trickle, not shutdown — may wait on it. `runCuration` never
 * throws, so there is no rejection to lose.
 */
function curation(): void {
  // Curation needs the catalogue, not a speaker: it asks MA for albums and never plays one.
  // `canPlay()` is the wrong test here — a deployment with no PLAYER_ID_PRIMARY runs silent
  // on purpose (§10) and should still keep the parent's review queue full.
  if (!config.ma.host || !config.ma.token) return;
  void runCuration(db, ma, {
    profileId: config.profile.id,
    sources: loadSettings(db).sources,
    maxSuggestions: config.curate.maxSuggestions,
  });
}

/**
 * The crate backs itself up (§3.1, `backup.ts`).
 *
 * Shares the same half-hourly wake-up as the other two. Synchronous and quick — the store is
 * hundreds of kilobytes — so unlike curation there is nothing to await and nothing to overlap.
 */
function backup(): void {
  runBackup(db, { databasePath: config.databasePath, keep: config.backupKeep });
}

server.listen(config.port, config.host, () => {
  announce();
  trickle();
  curation();
  backup();
  setInterval(() => { trickle(); curation(); backup(); }, CHECK_INTERVAL_MS).unref();
});

/**
 * Shut down on a signal rather than being killed.
 *
 * `docker stop` sends SIGTERM and waits ten seconds. Without this the default is no handler,
 * the process runs until the timeout and is then SIGKILLed mid-write — and the file being
 * written is the child's crate. WAL makes that survivable; closing properly makes it a
 * non-event.
 */
let closing = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    if (closing) process.exit(1);   // a second Ctrl-C means now
    closing = true;
    console.log(`\n${sig} — closing`);
    server.close(() => {
      closeMa();
      db.close();
      process.exit(0);
    });
    // Do not wait forever on a held-open keep-alive connection from the kiosk's browser.
    setTimeout(() => { closeMa(); db.close(); process.exit(0); }, 5000).unref();
  });
}
