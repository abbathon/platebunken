/**
 * `pb` — the maintenance verbs, inside the image.
 *
 *   docker compose exec platebunken pb curate --write
 *   docker compose exec platebunken pb seed --write
 *   docker compose exec platebunken pb backup /data/backup-2026-09-19.sqlite
 *
 * ## Why this file exists
 *
 * These verbs used to be `scripts/curate.ts` and `scripts/db-seed.ts`, and **`scripts/` does
 * not ship in the image.** The consequence was not "a missing convenience": it was that the
 * moment the container became the live deployment, the only reachable copy of these commands
 * ran on a developer's laptop against `./data/platebunken.sqlite` — a stale copy that is no
 * longer the product. The review queue on the real deployment could never be refilled, and
 * the symptom would have been noticed weeks later as an empty queue with no obvious cause.
 *
 * The fix is not documentation. Everything here reads `DATABASE_PATH`, which inside the
 * container already points at the volume that holds the child's crate — **correct by
 * construction rather than by remembering**, which is the entire point of moving them.
 *
 * ## What is NOT here
 *
 * `serve` is the container's `CMD` and stays a direct `node src/server/index.ts`, so the
 * server is PID 1 and gets SIGTERM itself rather than through a dispatcher.
 *
 * `release` is not here either, though it was proposed. `release()` already has two real
 * adapters — the daily trickle and the parent's "Slipp én nå" button at /admin — and nothing
 * varies across a third. Every verb in this help text is something an operator has to learn;
 * a command that duplicates a button the parent already has does not earn that.
 *
 * ## The shape
 *
 * Each command is an ADAPTER and nothing else: parse argv, resolve config, build the
 * dependency, call one module, print. No rule lives in this file. That is what went wrong in
 * `scripts/db-seed.ts`, which held the read-twice guard — the thing protecting the one
 * irreversible write in the product — in a place nothing could test and nothing could call.
 */
import { MassClient } from "./ma/client.ts";
import type { Track } from "./ma/types.ts";
import { backupTo, openStore } from "./store/db.ts";
import { counts, crate } from "./store/crate.ts";
import { seedCrate, type SeedSource } from "./store/seed.ts";
import { curate } from "./curate/worker.ts";
import { config, maConfigured } from "./server/config.ts";
import { load as loadSettings } from "./server/settings.ts";

const USAGE = `platebunken maintenance

  pb curate [--write]        fill the review queue; decides nothing
  pb seed   [--write]        build the crate from the parent's seed playlist
  pb backup <path>           a consistent copy of the store, safe from a running server

Without --write, curate and seed do every lookup and change nothing.
The store is ${config.databasePath} (DATABASE_PATH).
`;

const argv = process.argv.slice(2);
const verb = argv[0];
const write = argv.includes("--write");

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/**
 * Connect to Music Assistant, or say which key is missing.
 *
 * Both reading verbs need it, and neither can do anything useful without it — unlike the
 * server, which deliberately runs silent rather than refusing to start.
 */
async function connect(): Promise<MassClient> {
  if (!config.ma.host || !config.ma.token) {
    die("MA_HOST and MA_TOKEN are required. See .env.example.");
  }
  const client = new MassClient({ baseUrl: config.ma.baseUrl, token: config.ma.token });
  await client.connect();
  return client;
}

async function cmdCurate(): Promise<void> {
  const db = openStore(config.databasePath);
  const client = await connect();
  const settings = loadSettings(db);

  const report = await curate(db, client, {
    profileId: config.profile.id,
    write,
    // Settings → Kilder. The toggles used to be stored and read by nothing.
    sources: settings.sources,
    maxSuggestions: config.curate.maxSuggestions,
  });

  console.log("");
  if (report.disabled.length) console.log(`sources switched off: ${report.disabled.join(", ")}`);
  console.log(`crate artists        ${report.crateArtists}`);
  console.log(`  resolved to MBID   ${report.resolved}`);
  if (report.unresolved.length) console.log(`  not on MusicBrainz  ${report.unresolved.join(", ")}`);
  if (report.noDeezerMatch.length) console.log(`  no exact Deezer match  ${report.noDeezerMatch.join(", ")}`);
  console.log(`neighbours found     ${report.neighbours}  (${report.alreadyHave} already in the crate)`);
  console.log(`artists searched     ${report.searched}`);
  console.log(`  wrong artist       ${report.skippedWrongArtist}  (fuzzy search, filtered out)`);
  console.log(`  no artwork         ${report.skippedNoArtwork}`);
  console.log(`  already known      ${report.skippedKnown}`);
  console.log(`  duplicate release  ${report.skippedDuplicate}`);
  // Not cosmetic: an album with no track list cannot be released, so this line is the
  // difference between suggestions that will reach the crate and suggestions that will queue.
  console.log(`track lists          ${report.withTracks} cached, ${report.noTracks} missing`);
  console.log("");

  if (!report.candidates.length) {
    console.log("nothing new to suggest.");
  } else {
    console.log(`${write ? "suggested" : "WOULD suggest"} ${report.candidates.length} albums:`);
    for (const c of report.candidates) {
      const flags = c.flags.length ? `   ⚑ ${c.flags.join(", ")}` : "";
      console.log(`   [${c.from.padEnd(12)}] ${c.artist} — ${c.title}${flags}`);
    }
  }

  if (!write) {
    console.log("\nDRY RUN — nothing written. Re-run with --write.");
  } else {
    const c = counts(db, config.profile.id);
    console.log(`\ncrate: ${c.inCrate} albums, ${c.waitingToRelease} approved and waiting, ${c.pending} in the review queue`);
  }

  client.close();
  db.close();
}

async function cmdSeed(): Promise<void> {
  if (!config.seed.playlistId) {
    die("SEED_PLAYLIST_ID is not set. See .env.example.");
  }
  const db = openStore(config.databasePath);
  const client = await connect();

  /**
   * The seed module's port, fulfilled by Music Assistant.
   *
   * `playlistTracks` is a fresh command each call, deliberately: `seedCrate` reads it twice
   * and compares, and a memoised answer would silently disable the guard that stops a
   * partial playlist being frozen into an append-only crate.
   */
  const source: SeedSource = {
    playlistTracks: () =>
      client.command<Track[]>("music/playlists/playlist_tracks", {
        item_id: config.seed.playlistId,
        provider_instance_id_or_domain: config.seed.provider,
      }),
    albumTracks: (itemId, provider) => client.albumTracks(itemId, provider),
  };

  const report = await seedCrate(db, source, {
    profileId: config.profile.id,
    profileLabel: config.profile.label,
    write,
  });

  if (!report.ok) {
    client.close();
    db.close();
    die(`\n${report.error}`);
  }

  if (write) {
    console.log(`\nreleased ${report.released} albums into the crate`);
  } else {
    console.log(`\nDRY RUN — nothing written. Re-run with --write.`);
  }
  console.log(`  ${report.fresh} new, ${report.already} already in the crate`);
  if (report.noArtwork) {
    console.log(`  ${report.noArtwork} with no artwork — invisible in a cover-art interface; run the beets pass`);
  }
  if (report.noTracks) {
    console.log(`  ${report.noTracks} with no track list — HELD BACK, not released: an album with no number`);
    console.log(`    line opens onto nothing. The server retries every half hour and releases them then.`);
  }

  const c = report.counts;
  console.log(`\ncrate: ${c.inCrate} albums, ${c.waitingToRelease} approved and waiting, ${c.pending} in the review queue`);
  const slots = crate(db, config.profile.id);
  if (slots.length) {
    const w = String(slots.length - 1).length;
    for (const s of slots.slice(0, 5)) {
      console.log(`  ${String(s.position).padStart(w)}  ${s.album ? `${s.album.artist} — ${s.album.title}` : "(withdrawn, slot kept empty)"}`);
    }
    if (slots.length > 5) console.log(`  ${"…".padStart(w)}  and ${slots.length - 5} more`);
  }

  client.close();
  db.close();
}

/**
 * A copy of the crate that is safe to take while the server is running.
 *
 * The reasoning lives in `backupTo`, next to the code, rather than in a runbook: a `cp` of
 * this database is silently incomplete, and a runbook is not where that belongs.
 *
 * Inside the container the only writable paths are the volume and tmpfs `/tmp` — compose sets
 * `read_only: true` — so a backup goes to `/data/...` or `/tmp/...` and is then `docker cp`'d
 * off the host.
 */
function cmdBackup(): void {
  const target = argv.find((a) => a !== verb && !a.startsWith("--"));
  if (!target) die("pb backup needs a destination path, e.g. pb backup /data/backup.sqlite");

  const db = openStore(config.databasePath);
  const c = counts(db, config.profile.id);
  try {
    backupTo(db, target!);
  } catch (e) {
    db.close();
    die(`backup failed: ${(e as Error).message}`);
  }
  // Say what is IN it. A backup nobody has counted is a backup nobody has checked.
  console.log(`${target}`);
  console.log(`  ${c.inCrate} albums in the crate, ${c.waitingToRelease} waiting to release, ${c.pending} in the review queue`);
  db.close();
}

switch (verb) {
  case "curate":
    await cmdCurate();
    break;
  case "seed":
    await cmdSeed();
    break;
  case "backup":
    cmdBackup();
    break;
  case "--help":
  case "-h":
  case "help":
  case undefined:
    console.log(USAGE);
    if (!maConfigured()) console.log("note: MA_HOST or MA_TOKEN is unset — curate and seed both need them.\n");
    break;
  default:
    die(`unknown command: ${verb}\n\n${USAGE}`);
}

// The MA client holds an open WebSocket and the store holds a file handle; both are closed
// above, but a reconnect timer can still be pending. Exit deliberately rather than hanging.
process.exit(0);
