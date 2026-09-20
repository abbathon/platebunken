<img src="brand/logo-amber.svg" alt="Platebunken" height="46">

A record vault for a pre-reader.

The aim is to provide an environment for discovering music, through album covers, giving the child "ownership" and emotional investment to the music and artists.

Developed using Claude Code as a tool.

## What it is

A grid of album covers on a screen in a child's bedroom. Tap a cover, the record plays. No text
to read, no search, no menus, no way out. It does four things — **browse, play, volume, skip** —
and refuses the fifth.

Music comes from [Music Assistant](https://music-assistant.io/). Albums reach the child only
after a parent has approved them, from a review queue on their phone.

[`PRODUCT.md`](PRODUCT.md) is what it is for, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) how
it works and why, and [`docs/DEPLOY.md`](docs/DEPLOY.md) is the full runbook.

## Requirements

- A running **Music Assistant** instance — developed against 2.9.9, API schema 31 — with at
  least one music provider and one player.
- A host with Docker and the Compose plugin.
- A screen for the child: anything that runs Chromium in kiosk mode. `ansible/` configures an
  old laptop.

## Install

Two files on the host; the image carries everything else.

```bash
mkdir -p /opt/platebunken && cd /opt/platebunken
curl -O https://raw.githubusercontent.com/abbathon/platebunken/main/compose.yml
curl -o .env https://raw.githubusercontent.com/abbathon/platebunken/main/.env.example
chmod 600 .env
$EDITOR .env
```

`.env.example` documents every key. The ones with no sensible default:

| Key | |
|---|---|
| `MA_HOST` | Music Assistant's address |
| `MA_TOKEN` | a long-lived token for a non-admin MA user |
| `PLAYER_ID_PRIMARY` | the player to send music to |
| `SEED_PLAYLIST_ID` | a playlist you built by hand; it becomes the starting crate |
| `VOLUME_CEILING` | a hearing-safety limit — measure it at the child's pillow |
| `TZ` | the household's timezone; a new album arrives each morning, local time |
| `PLATEBUNKEN_PORT` | the host port. Check it is free first |

Then start it:

```bash
docker compose pull && docker compose up -d
docker compose logs -f
curl -fsS http://localhost:8080/healthz    # {"ok":true,"canPlay":true}
```

The boot log states the store path, how many albums are in the crate, how many are waiting to
be released, and whether it can play at all.

## Fill the crate

A fresh install has an empty crate. Build one from the seed playlist:

```bash
docker compose exec platebunken pb seed            # dry run, writes nothing
docker compose exec platebunken pb seed --write
```

The playlist's order becomes the crate's order permanently, so run the dry run first.

After that the review queue fills itself daily, a parent approves at `/admin` behind `GATE_PIN`,
and one approved album is released onto the grid each morning. To fill the queue immediately:

```bash
docker compose exec platebunken pb curate --write
```

## Back up

The named volume `platebunken-crate` is the only thing here worth keeping. It holds which albums
the child owns and which **position** each sits in; positions are append-only and are the only
index a pre-reader has into his own music.

```bash
docker compose exec platebunken pb backup /tmp/backup.sqlite
docker cp platebunken:/tmp/backup.sqlite ./platebunken-$(date +%F).sqlite
```

Use that and never `cp` — the database runs in WAL mode, and a file copy opens cleanly while
being silently out of date.

> [!WARNING]
> **`docker compose down -v` destroys the crate.** The `-v` removes that volume. Everything
> else rebuilds from the image in thirty seconds.

## Upgrade and roll back

```bash
PLATEBUNKEN_TAG=0.2.1 docker compose up -d     # a specific release
docker compose pull && docker compose up -d    # newest release
```

`:latest` follows the newest semver tag, never `main`. To build on the host instead of pulling,
add `-f compose.build.yml`.

## Develop

```bash
git clone https://github.com/abbathon/platebunken && cd platebunken
npm install
cp .env.example .env && $EDITOR .env

npm run dev          # server + Vite, proxied
npm test
npm run typecheck
npm run pb           # curate, seed and backup against ./data
```

There are no runtime dependencies — the store is `node:sqlite`, the server is `node:http`, and
the runtime image carries no `node_modules`.

`npm run smoke -- --play` starts real music on a real speaker.

## Licence

[MIT](LICENSE).

The three bundled typefaces are **not** MIT. Andika, Archivo and Lexend are each under the
[SIL Open Font License 1.1](src/ui/public/fonts/OFL.txt), which ships beside them in
`src/ui/public/fonts/` and is served at `/fonts/OFL.txt` by any running instance.

There are no runtime dependencies, so nothing else is redistributed. The build-time tools —
TypeScript, Vite and `@types/node` — are Apache-2.0 and MIT respectively and are not part of
the image.

Album metadata and artwork come from whatever providers your own Music Assistant is configured
with. Suggestions come from [ListenBrainz](https://listenbrainz.org/),
[MusicBrainz](https://musicbrainz.org/), [Deezer](https://developers.deezer.com/) and
[Metal Archives](https://www.metal-archives.com/); each is queried under its own terms and
rate limits, and none of their data is redistributed here.

## Name

*Platebunken* — Norwegian for "the record stack".
