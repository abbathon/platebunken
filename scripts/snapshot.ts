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
import { coverProxyId, coverUrl } from "../src/ma/images.ts";
import type { Album } from "../src/ma/types.ts";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = `http://${process.env.MA_HOST}:${process.env.MA_PORT ?? 8095}`;
const client = new MassClient({ baseUrl, token: process.env.MA_TOKEN! });
await client.connect();

const albums = await client.albums({ limit: 500 });
console.log(`${albums.length} albums in library`);

const out = [];
let noArt = 0, noArtist = 0;

for (const a of albums as Album[]) {
  const proxy = coverProxyId(a);
  if (!proxy) noArt++;
  const artist = a.artists?.[0]?.name ?? "";
  // Tag-less rips come through as the literal string "[unknown]", brackets included.
  if (!artist || /unknown/i.test(artist)) noArtist++;

  let tracks: { n: number; title: string }[] = [];
  try {
    const raw = await client.albumTracks(a.item_id, a.provider ?? "library");
    tracks = raw
      .map((t, i) => ({ n: t.track_number ?? i + 1, title: t.name }))
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
    cover: proxy ? { sm: coverUrl(baseUrl, proxy, 160, 2), lg: coverUrl(baseUrl, proxy, 512, 2) } : null,
    tracks,
  });
  process.stdout.write(`\r  fetched ${out.length}/${albums.length}`);
}

await mkdir("prototypes/crate/public", { recursive: true });
await writeFile(
  "prototypes/crate/public/library.json",
  JSON.stringify({ generatedAt: new Date().toISOString(), count: out.length, albums: out }, null, 2),
);

console.log(`\n\nwrote prototypes/crate/public/library.json`);
console.log(`  ${noArt} albums with no artwork  (invisible in a cover-art interface)`);
console.log(`  ${noArtist} albums with no artist tag`);
const noTracks = out.filter((a) => a.tracks.length === 0).length;
console.log(`  ${noTracks} albums whose tracks did not load`);
client.close();
process.exit(0);
