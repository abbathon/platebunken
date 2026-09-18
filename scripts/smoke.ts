/**
 * End-to-end smoke test: is the whole chain real?
 *
 *   node --env-file=.env scripts/smoke.ts              # look only
 *   node --env-file=.env scripts/smoke.ts --play       # actually play something
 *
 * Proves, in order: the server is reachable, the token authenticates, the library
 * returns albums, cover art resolves, and an album plays on the target speaker.
 */
import { MassClient } from "../src/ma/client.ts";
import { coverUrl } from "../src/ma/images.ts";

const baseUrl = process.env.MA_HOST?.startsWith("http")
  ? process.env.MA_HOST
  : `http://${process.env.MA_HOST}:${process.env.MA_PORT ?? 8095}`;
const token = process.env.MA_TOKEN;
const target = process.env.PLAYER_ID_PRIMARY;
const doPlay = process.argv.includes("--play");

if (!process.env.MA_HOST || !token) {
  console.error("Missing MA_HOST or MA_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);

// 1 — unauthenticated reachability, before we risk the token on a wrong host
console.log(`\nMusic Assistant at ${baseUrl}\n`);
try {
  const info = await (await fetch(new URL("/info", baseUrl))).json();
  ok(`reachable — v${info.server_version}, schema ${info.schema_version} (floor ${info.min_supported_schema_version})`);
} catch {
  bad(`not reachable. Check MA_HOST, and that the kiosk VLAN can see it.`);
  process.exit(1);
}

const client = new MassClient({
  baseUrl,
  token,
  onPlayerUpdate: (p) => doPlay && console.log(`    · ${p.name}: ${p.playback_state} vol=${p.volume_level}`),
});

// 2 — authenticate
try {
  await client.connect();
  ok("authenticated");
} catch (e) {
  bad(`authentication failed: ${(e as Error).message}`);
  process.exit(1);
}

// 3 — players
const players = client.players.filter((p) => p.available);
ok(`${players.length} available players`);
for (const p of players.slice(0, 12)) {
  const flags = [p.synced_to && "synced", p.active_group && "grouped"].filter(Boolean).join(" ");
  console.log(`    ${p.player_id.padEnd(38)} ${p.name}${flags ? `  [${flags}]` : ""}`);
}

// 4 — library
const albums = await client.albums({ limit: 8 });
if (albums.length === 0) bad("library returned no albums — is a provider configured?");
else ok(`library returned albums (showing ${albums.length})`);
for (const a of albums) {
  const artist = a.artists?.[0]?.name ?? "?";
  const warn = a.explicit === true ? " [explicit]" : a.explicit === undefined ? " [explicit: unknown]" : "";
  console.log(`    ${artist} — ${a.name}${warn}`);
}

// 5 — artwork
const withArt = albums.find((a) => a.image);
if (withArt?.image) ok(`cover art resolves: ${coverUrl(baseUrl, withArt.image, 256, 2)}`);
else bad("no album carried an image id — check the metadata provider");

// 6 — playback
if (doPlay) {
  if (!target) {
    bad("PLAYER_ID_PRIMARY not set, so nothing was played");
  } else if (!albums[0]) {
    bad("no album to play");
  } else {
    console.log(`\n  playing "${albums[0].name}" on ${target} …`);
    try {
      await client.playAlbum(target, albums[0].uri);
      ok("play_media accepted — listen to the room");
      await new Promise((r) => setTimeout(r, 6000));
    } catch (e) {
      bad(`playback failed: ${(e as Error).message}`);
    }
  }
} else {
  console.log("\n  (pass --play to actually start music)");
}

client.close();
console.log("");
process.exit(0);
