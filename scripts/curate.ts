/**
 * Fill the review queue.
 *
 *   node --env-file=.env scripts/curate.ts            # dry run, writes nothing
 *   node --env-file=.env scripts/curate.ts --write
 *
 * Reads the crate's own artists, asks ListenBrainz Labs who sits next to them, finds those
 * artists' albums in the Qobuz catalogue through Music Assistant, annotates them against
 * Encyclopaedia Metallum's themes rosters, and calls `suggest()`.
 *
 * It never approves anything and the store would refuse it if it tried. Everything it produces
 * waits for a person at /admin — ARCHITECTURE.md §5, §12.7.
 *
 * The first run with --write is slow and that is deliberate: it pulls seven Metal Archives
 * rosters at the site's own Crawl-delay of 3 seconds a page. They are cached for a month
 * afterwards, so the daily run is quick.
 */
import { MassClient } from "../src/ma/client.ts";
import { openStore } from "../src/store/db.ts";
import { counts } from "../src/store/crate.ts";
import { load as loadSettings } from "../src/server/settings.ts";
import { curate } from "../src/curate/worker.ts";

const write = process.argv.includes("--write");
const profileId = process.env.PROFILE_ID ?? "child_a";

if (!process.env.MA_HOST || !process.env.MA_TOKEN) {
  console.error("MA_HOST and MA_TOKEN are required. See .env.example.");
  process.exit(1);
}

const db = openStore(process.env.DATABASE_PATH ?? "./data/platebunken.sqlite");
const client = new MassClient({
  baseUrl: `http://${process.env.MA_HOST}:${process.env.MA_PORT ?? 8095}`,
  token: process.env.MA_TOKEN,
});
await client.connect();

const settings = loadSettings(db);

const report = await curate(db, client, {
  profileId,
  write,
  // Settings → Kilder. The toggles used to be stored and read by nothing.
  sources: settings.sources,
  maxSuggestions: Number(process.env.CURATE_MAX ?? "") || 24,
});

console.log("");
if (report.disabled.length) {
  console.log(`sources switched off: ${report.disabled.join(", ")}`);
}
console.log(`crate artists        ${report.crateArtists}`);
console.log(`  resolved to MBID   ${report.resolved}`);
if (report.unresolved.length) console.log(`  not on MusicBrainz  ${report.unresolved.join(", ")}`);
console.log(`neighbours found     ${report.neighbours}  (${report.alreadyHave} already in the crate)`);
console.log(`artists searched     ${report.searched}`);
console.log(`  wrong artist       ${report.skippedWrongArtist}  (fuzzy search, filtered out)`);
console.log(`  no artwork         ${report.skippedNoArtwork}`);
console.log(`  already known      ${report.skippedKnown}`);
console.log("");

if (!report.candidates.length) {
  console.log("nothing new to suggest.");
} else {
  console.log(`${write ? "suggested" : "WOULD suggest"} ${report.candidates.length} albums:`);
  for (const c of report.candidates) {
    const flags = c.flags.length ? `   ⚑ ${c.flags.join(", ")}` : "";
    console.log(`   ${c.artist} — ${c.title}${flags}`);
  }
}

if (!write) {
  console.log("\nDRY RUN — nothing written. Re-run with --write.");
} else {
  const c = counts(db, profileId);
  console.log(`\ncrate: ${c.inCrate} albums, ${c.waitingToRelease} approved and waiting, ${c.pending} in the review queue`);
}

client.close();
process.exit(0);
