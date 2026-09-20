<img src="brand/logo.svg" alt="Platebunken" height="46">

A record vault for a pre-reader.

The aim is to provide an enviroment for discovering music, trough album covers, giving the child "ownership" and emotional investment to the music and artists.

Developed using Claude Code as a tool.

## AI-slop:

A locked-down appliance that recreates discovering music by flipping through physical album
covers — a grid of cover art on a screen in a child's bedroom. Tap a cover, the record plays.
No text to read, no search, no menus, no way out.

It does four things: **browse, play, volume, skip.** It refuses the fifth.

## Status

The crate, the now-playing screen, the approved-set store and the server that joins them are
built. The page (`src/ui`) reads the approved set and nothing else — there is no path from the
library to the screen that does not pass through a person. Settings persist, the numeral faces
are self-hosted, and a service worker keeps covers warm across reboots. See
[`PRODUCT.md`](PRODUCT.md) for product truth and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the technical design.

The review queue fills itself: the curation worker runs daily inside the container and suggests,
and a person at `/admin` decides. Nothing reaches the child any other way.

Not done: **nothing in this project has ever made a sound.**

## Shape

```
Home Assistant host        Music Assistant (Qobuz + NAS + Sonos), MQTT
        │
Docker host                platebunken-server (SQLite, curation, admin)
        │                  one image; the store is a volume
old laptop in the bedroom  Chromium kiosk → platebunken-ui
                           audio out → powered monitors, or a Sonos on the LAN
```

The laptop holds no state. Destroy it, swap in another, lose nothing. The server ships as a
Docker image so that installing it is `docker compose up -d` — see ARCHITECTURE.md §3.1 for why,
and for the one command that would destroy the thing worth keeping.

## Running it

```
cp .env.example .env && $EDITOR .env

npm run dev              # server + vite, proxied, opens a browser
npm test                 # the invariants: the gate, the crate, the volume ceiling
npm run typecheck

npm run pb               # the maintenance verbs: curate, seed, backup
npm run db:seed          # dry run — what seeding the crate from the seed playlist would do
npm run db:seed -- --write
```

`pb` is the same entrypoint that ships inside the image, so what is run here against
`./data/platebunken.sqlite` is exactly what runs there against the volume. On the host it is
`docker compose exec platebunken pb <verb>` — see [`docs/DEPLOY.md`](docs/DEPLOY.md).

`npm run smoke -- --play` starts real music on a real speaker in a child's bedroom. Do not run
it without asking.

## Deploying it

On the Docker host. No checkout is needed — the image carries the application, and only two
files live on the host:

```
/opt/platebunken/compose.yml     # copied from this repo
/opt/platebunken/.env            # never from this repo. Real values. chmod 600.

docker compose pull && docker compose up -d
```

`compose.yml` **pulls** a published multi-arch image rather than building it;
`.github/workflows/image.yml` builds it on every push to `main` and every `v*` tag. ARCHITECTURE.md §3.1: *the
image is the deployment — rebuild from a tag, roll back to a tag.* A host that compiles its own
copy cannot roll back to anything, because what it ran was whatever that host happened to build
that day. To build on the host anyway, for a day when the registry is unreachable, add
`-f compose.build.yml`.

The maintenance verbs run inside that container against the real volume:

```
docker compose exec platebunken pb curate --write    # refill the review queue
docker compose exec platebunken pb backup /tmp/backup.sqlite
```

One image, one container. It serves the built page and the API from one process, holds the
SQLite store and owns the only Music Assistant credential; the laptop in the bedroom holds no
state. There are **no runtime dependencies** — the store is `node:sqlite`, the server is
`node:http` — so the runtime image carries no `node_modules` at all, and everything this repo
adds on top of the Alpine base is about 300 kB.

**`docker compose down -v` is the one command that destroys the product.** The `-v` removes the
named volume, and that volume is the child's crate: which albums he owns and, far more
importantly, which position each one sits in. Those positions are append-only, the database
refuses to renumber them, and they are the only index a pre-reader has into his own music.
Everything else rebuilds from the image in thirty seconds.

`ansible/` configures the kiosk laptop. ARCHITECTURE.md §3.1 covers the deployment decisions and
§8 the lockdown.

## Research

Seven documents, every claim cited to a primary source, everything unverifiable marked as such.

- [`docs/research/01-backend-sources-sonos.md`](docs/research/01-backend-sources-sonos.md) — Music Assistant internals, Sonos control, Qobuz
- [`docs/research/02-prior-art-kiosk-ui.md`](docs/research/02-prior-art-kiosk-ui.md) — kids' music players, cover-art UIs, Linux kiosk, child UX
- [`docs/research/03-discovery-and-filtering.md`](docs/research/03-discovery-and-filtering.md) — similar-artist APIs, AI-slop and NSBM filtering, acquisition
- [`docs/research/04-pedagogy.md`](docs/research/04-pedagogy.md) — numerals, literacy, and what not to teach
- [`docs/research/05-klipsch-local-audio.md`](docs/research/05-klipsch-local-audio.md) — local audio path, volume ceiling
- [`docs/research/06-queue-events-and-listens.md`](docs/research/06-queue-events-and-listens.md) — Music Assistant queue events, verified live
- [`docs/research/07-listenbrainz-scrobbling.md`](docs/research/07-listenbrainz-scrobbling.md) — scrobbling, and the privacy answer

## Configuration

All environment-specific values live in `.env`, which is gitignored. Copy `.env.example` and
fill it in.

**No personal data belongs in this repository** — no names, no real room labels, no Home
Assistant entity IDs, no tokens, no addresses. The child's room is `KID_ROOM` throughout.

## Name

*Platebunken* — Norwegian for "the record stack". Earlier working name: `metalkid`.
