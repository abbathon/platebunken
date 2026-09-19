/**
 * Dump the real library to a static file the prototype can load.
 *
 *   node --env-file=.env scripts/snapshot.ts
 *
 * The prototype is a browser page and must not hold a token, so it reads a snapshot
 * instead of talking to Music Assistant. Cover URLs point at MA's imageproxy, which
 * serves unauthenticated — so the page renders real artwork with no credential in it.
 *
 * The output is gitignored: it is a dump of someone's private library.
 */
import { MassClient } from "../src/ma/client.ts";
import { coverPath, coverProxyId } from "../src/ma/images.ts";
import type { Album } from "../src/ma/types.ts";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = `http://${process.env.MA_HOST}:${process.env.MA_PORT ?? 8095}`;
const client = new MassClient({ baseUrl, token: process.env.MA_TOKEN! });
await client.connect();

const albums = await client.albums({ limit: 500 });
console.log(`${albums.length} albums in library`);

/**
 * The seed playlist is the curation starting point: albums the parent has already picked.
 * Its albums are merged into the crate and tagged, so the prototype shows the real shape
 * of the thing — a curated set sitting inside a bigger library.
 */
const seedUris = new Set<string>();
const seedAlbums: Album[] = [];
if (process.env.SEED_PLAYLIST_ID) {
  const id = process.env.SEED_PLAYLIST_ID;
  const provider = process.env.SEED_PLAYLIST_PROVIDER ?? "qobuz";
  try {
    const pl = await client.command<any>("music/playlists/get", {
      item_id: id, provider_instance_id_or_domain: provider,
    });
    const tracks = await client.command<any[]>("music/playlists/playlist_tracks", {
      item_id: id, provider_instance_id_or_domain: provider,
    });
    const seen = new Map<string, Album>();
    for (const t of tracks) {
      const al = t.album;
      if (al?.uri && !seen.has(al.uri)) seen.set(al.uri, { ...al, artists: t.artists ?? al.artists });
    }
    for (const [uri, al] of seen) {
      seedUris.add(uri);
      if (!albums.some((a) => a.uri === uri)) seedAlbums.push(al as Album);
    }
    console.log(`seed playlist: ${tracks.length} tracks, ${seen.size} albums (${seedAlbums.length} not already in library)`);
  } catch (e) {
    console.log(`seed playlist could not be read: ${(e as Error).message}`);
  }
}

const out = [];
let noArt = 0, noArtist = 0;

for (const a of [...albums, ...seedAlbums] as Album[]) {
  const proxy = coverProxyId(a);
  if (!proxy) noArt++;
  const artist = a.artists?.[0]?.name ?? "";
  // Tag-less rips come through as the literal string "[unknown]", brackets included.
  if (!artist || /unknown/i.test(artist)) noArtist++;

  let tracks: { n: number; title: string }[] = [];
  const provider = a.provider ?? "library";
  try {
    const raw = await client.albumTracks(a.item_id, provider);
    tracks = raw
      // The track uri is what play_media's `start_item` takes, so starting an album at
      // track 7 is one command rather than a play followed by a jump.
      .map((t, i) => ({ n: t.track_number ?? i + 1, title: t.name, uri: t.uri ?? null }))
      .sort((x, y) => x.n - y.n);
  } catch {
    // An album whose tracks won't load is exactly the kind of thing the crate must
    // survive, so record it as empty rather than dropping the album.
  }

  out.push({
    id: a.item_id,
    uri: a.uri,
    artist,
    title: a.name,
    year: a.year ?? null,
    explicit: a.metadata?.explicit ?? null,
    // Host-less, so the page fetches through its own origin via the dev-server proxy.
    cover: proxy ? { sm: coverPath(proxy, 160, 2), lg: coverPath(proxy, 512, 2) } : null,
    seed: seedUris.has(a.uri),
    tracks,
  });
  process.stdout.write(`\r  fetched ${out.length}/${albums.length}`);
}

await mkdir("prototypes/crate/public", { recursive: true });
await writeFile(
  "prototypes/crate/public/library.json",
  JSON.stringify({ generatedAt: new Date().toISOString(), count: out.length, seedCount: out.filter((a) => a.seed).length, albums: out }, null, 2),
);

console.log(`\n\nwrote prototypes/crate/public/library.json`);
console.log(`  ${noArt} albums with no artwork  (invisible in a cover-art interface)`);
console.log(`  ${noArtist} albums with no artist tag`);
const noTracks = out.filter((a) => a.tracks.length === 0).length;
console.log(`  ${noTracks} albums whose tracks did not load`);
client.close();
process.exit(0);
