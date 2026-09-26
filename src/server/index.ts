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
import { lookup } from "node:dns/promises";
import { openStore } from "../store/db.ts";
import { ensureProfile, counts } from "../store/crate.ts";
import { CHECK_INTERVAL_MS, runTrickle } from "./trickle.ts";
import { CURATE_HOUR, runCuration } from "./curation.ts";
import { BACKUP_HOUR, existingBackups, backupDir, runBackup } from "./backup.ts";
import { enabledSources } from "../curate/worker.ts";
import { sweepTracks } from "./tracks.ts";
import { config } from "./config.ts";
import { createApp } from "./app.ts";
import { canPlay, closeMa, ma, restoreTarget, target } from "./speaker.ts";
import { load as loadSettings, save as saveSettings } from "./settings.ts";

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
   * Albums the child cannot reach because their number line is not cached yet.
   *
   * Both numbers should be zero within half an hour of a boot with MA up — `tracks()` below
   * fills them in. A number that stays is a real fault, and the two are different faults: a
   * held-back album is one the parent approved and has not seen appear, a silent slot is a
   * position already spent on a record the crate is drawing as empty.
   */
  if (c.heldForTracks > 0) {
    console.warn(`  ! ${c.heldForTracks} approved albums have no track list yet and will not be released until they do.`);
  }
  if (c.silentSlots > 0) {
    console.warn(`  ! ${c.silentSlots} albums hold a crate position with no track list; their slots draw EMPTY until it arrives.`);
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
    // `target()`, not config.playerId: the parent's stored choice is the speaker that will
    // actually be used, and printing the env var here made the boot log disagree with the
    // settings screen — on a deployment where the env var is empty by design, it printed
    // nothing at all and looked like a missing value.
    console.log(`  speaker  ${target()} via ${config.ma.baseUrl}, ceiling ${config.volume.ceiling}/100`);
  } else if (!config.ma.host || !config.ma.token) {
    console.warn(`  ! no MA_HOST or MA_TOKEN: the crate will run SILENT.`);
  } else {
    // The common and correct state on a fresh deployment, so it must not read as a fault.
    console.warn(`  ! no speaker chosen yet: the crate will run SILENT until one is picked at`);
    console.warn(`    /admin → Høyttaler. PLAYER_ID_PRIMARY sets the default; it may stay empty.`);
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
 * The number line, filled in for anything missing one (`tracks.ts`).
 *
 * Shares the same half-hourly wake-up as the rest. Until this existed only `pb seed` ever
 * cached a track list, so every album approved at /admin reached the crate unplayable — the
 * child saw a cover, opened it, and got an English error message. It is the retry behind
 * both the approval fast path in `app.ts` and the curation worker.
 *
 * The ONE scheduled job the trickle waits for — see `wake()`. Everything else here is
 * fire-and-forget; this is not, because an album cannot be released until its tracks are
 * cached. `sweepTracks` never throws, so awaiting it cannot block the release.
 */
async function tracks(): Promise<void> {
  if (!config.ma.host || !config.ma.token) return;
  await sweepTracks(db, ma, { profileId: config.profile.id });
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

/**
 * Can this container actually resolve the Music Assistant host?
 *
 * A name that resolves on the machine the `.env` was written on and not inside the container
 * is a deployment that boots clean, serves the crate, and fails one job a day forever. That is
 * exactly what happened on the first real deployment: `MA_HOST` was copied from a developer's
 * `.env` as `homeassistant.local`, which is mDNS. A bridge-networked container has no mDNS
 * resolver — `nsswitch.conf` is `files myhostname dns` — so every curation run failed with
 * ENOTFOUND, the review queue would have drained as the parent approved, and nothing would
 * have refilled it. The symptom arrives weeks later and points nowhere near the cause.
 *
 * So resolve it once, at boot, where an operator is already reading. Asynchronous and never
 * fatal: a DNS server that is slow to answer must not delay the child's crate, and a name that
 * cannot be resolved right now is a warning, not a reason to refuse to serve music that is
 * already in the store.
 */
async function checkMaReachable(): Promise<void> {
  const host = config.ma.host;
  if (!host) return;                                   // already warned about by announce()
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return;      // a literal address resolves itself
  try {
    await lookup(host);
    if (host.endsWith(".local")) {
      console.warn(`  ! MA_HOST "${host}" is an mDNS name. It resolves here now, but mDNS is not`);
      console.warn(`    guaranteed in a container — prefer an IP address or a real DNS record.`);
    }
  } catch {
    console.warn(`  ! MA_HOST "${host}" does not resolve from inside this container.`);
    if (host.endsWith(".local")) {
      console.warn(`    ".local" is mDNS, and a bridge-networked container has no mDNS resolver.`);
    }
    console.warn(`    Curation will fail every day and the review queue will never refill.`);
    console.warn(`    Use an IP address, or a name this container's DNS can answer for.`);
  }
}

/**
 * Fill in the chosen speaker's NAME for a store written before names were kept.
 *
 * The crate shows which speaker it is playing to, and it reads that from the store rather than
 * asking Music Assistant — the child's page is not allowed to ask MA what exists (§4.6). Any
 * deployment that picked its speaker before this existed has the id and no label, and would
 * show "no speaker" while happily playing to one. Once, at boot, and never fatal.
 */
async function backfillPlayerName(): Promise<void> {
  const s = loadSettings(db);
  if (!s.playerId || s.playerName) return;
  try {
    const name = (await ma()).player(s.playerId)?.name;
    if (name) {
      saveSettings(db, { playerName: name });
      console.log(`  speaker  named "${name}" for the crate's now-playing panel`);
    }
  } catch { /* MA unreachable at boot is normal; the next restart tries again. */ }
}

/**
 * One wake-up: fill in missing track lists, then release, then curate, then back up.
 *
 * The sweep runs BEFORE the trickle and the trickle waits for it, which is the one ordering
 * in here that is load-bearing. `release()` will not give a position to an album with no
 * cached track list, so a trickle that ran first would decide there was nothing to release
 * and then sit out the rest of the day — the release is once daily, so getting the order
 * wrong costs twenty-four hours per album rather than one wake-up.
 *
 * `sweepTracks` never throws, so the trickle runs whether or not Music Assistant answered.
 * Curation and backup are independent of both and do not wait.
 */
function wake(): void {
  void tracks().then(trickle);
  curation();
  backup();
}

server.listen(config.port, config.host, () => {
  announce();
  void checkMaReachable();
  void backfillPlayerName();
  wake();
  setInterval(wake, CHECK_INTERVAL_MS).unref();
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
