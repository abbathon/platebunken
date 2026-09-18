/**
 * Build the initial crate from the parent's seed playlist.
 *
 *   node --env-file=.env scripts/db-seed.ts          # dry run, changes nothing
 *   node --env-file=.env scripts/db-seed.ts --write
 *
 * The seed playlist is the one place in this system where approval is automatic, and the
 * justification is narrow: the parent built that playlist by hand, so the playlist *is* the
 * act of approval. Every other source — similar-artist, charts, the older child's requests —
 * goes through the queue in scripts/ that do not exist yet. Do not widen this.
 *
 * The order of the playlist becomes the order of the crate, permanently. Position 2-3 is the
 * same album for the next decade, so this script refuses to guess.
 */
import { MassClient } from "../src/ma/client.ts";
import { fromMassAlbum, approve, counts, crate, ensureProfile, release, suggest, upsertAlbum } from "../src/store/crate.ts";
import { openStore } from "../src/store/db.ts";

const write = process.argv.includes("--write");
const profileId = process.env.PROFILE_ID ?? "child_a";
const profileLabel = process.env.PROFILE_LABEL ?? profileId;

const playlistId = process.env.SEED_PLAYLIST_ID;
if (!playlistId) {
  console.error("SEED_PLAYLIST_ID is not set. See .env.example.");
  process.exit(1);
}
const provider = process.env.SEED_PLAYLIST_PROVIDER ?? "qobuz";

const client = new MassClient({
  baseUrl: `http://${process.env.MA_HOST}:${process.env.MA_PORT ?? 8095}`,
  token: process.env.MA_TOKEN!,
});
await client.connect();

const readPlaylist = () =>
  client.command<any[]>("music/playlists/playlist_tracks", {
    item_id: playlistId, provider_instance_id_or_domain: provider,
  });

/**
 * A provider playlist can return a partial answer while MA is still syncing it — one read
 * during development gave 3 tracks and a later one gave 17. Seeding from a partial read
 * would fix a wrong order into an append-only structure, so read twice and require
 * agreement rather than trusting the first answer.
 */
const first = await readPlaylist();
await new Promise((r) => setTimeout(r, 4000));
const second = await readPlaylist();
if (first.length !== second.length) {
  console.error(
    `Playlist is still syncing: ${first.length} tracks, then ${second.length}. ` +
    `Seeding now would freeze a partial order into an append-only crate. Re-run shortly.`,
  );
  client.close();
  process.exit(1);
}

// First appearance in the playlist wins: that is the order the parent put them in.
const albums = new Map<string, any>();
for (const t of second) {
  const al = t.album;
  if (al?.uri && !albums.has(al.uri)) albums.set(al.uri, { ...al, artists: t.artists ?? al.artists });
}
console.log(`seed playlist: ${second.length} tracks -> ${albums.size} albums`);

const db = openStore();
ensureProfile(db, profileId, profileLabel);

const before = counts(db, profileId);
if (before.inCrate > 0) {
  console.log(`crate already holds ${before.inCrate} albums; new seed albums will be APPENDED, never inserted.`);
}

let fresh = 0, already = 0, noArt = 0;
for (const [uri, raw] of albums) {
  const a = fromMassAlbum(raw);
  if (!a.coverProxyId) noArt++;
  const known = db.prepare(`SELECT 1 FROM approved WHERE profile_id = ? AND uri = ?`).get(profileId, uri);
  if (known) { already++; continue; }
  fresh++;
  if (!write) continue;
  upsertAlbum(db, a);
  suggest(db, uri, "seed", "seed playlist");
  approve(db, profileId, uri);
}

if (write) {
  // The seed does not trickle. There is no crate yet for a new album to stand out against,
  // and a child cannot wait a fortnight for his own record collection to arrive.
  const released = release(db, profileId, albums.size);
  console.log(`\nreleased ${released.length} albums into the crate`);
} else {
  console.log(`\nDRY RUN — nothing written. Re-run with --write.`);
}

console.log(`  ${fresh} new, ${already} already in the crate`);
if (noArt) console.log(`  ${noArt} with no artwork — invisible in a cover-art interface; run the beets pass`);

const after = counts(db, profileId);
console.log(`\ncrate: ${after.inCrate} albums, ${after.waitingToRelease} approved and waiting, ${after.pending} in the review queue`);
const slots = crate(db, profileId);
if (slots.length) {
  const w = String(slots.length - 1).length;
  for (const s of slots.slice(0, 5)) {
    console.log(`  ${String(s.position).padStart(w)}  ${s.album ? `${s.album.artist} — ${s.album.title}` : "(withdrawn, slot kept empty)"}`);
  }
  if (slots.length > 5) console.log(`  ${"…".padStart(w)}  and ${slots.length - 5} more`);
}

db.close();
client.close();
process.exit(0);
