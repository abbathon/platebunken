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
import { config, canPlay } from "./config.ts";
import { createApp } from "./app.ts";
import { closeMa, restoreTarget } from "./speaker.ts";
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
    console.warn(`  ! the crate is EMPTY. Nothing has been approved and released yet — run db:seed.`);
  }
  if (c.invisible > 0) {
    console.warn(`  ! ${c.invisible} approved albums have no artwork; in a cover-art interface those are invisible albums.`);
  }
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

server.listen(config.port, config.host, () => {
  announce();
  trickle();
  setInterval(trickle, CHECK_INTERVAL_MS).unref();
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
