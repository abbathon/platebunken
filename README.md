<img src="brand/logo.svg" alt="Platebunken" height="46">

A record crate for a pre-reader.

A locked-down appliance that recreates discovering music by flipping through physical album
covers — a grid of cover art on a screen in a child's bedroom. Tap a cover, the record plays.
No text to read, no search, no menus, no way out.

It does four things: **browse, play, volume, skip.** It refuses the fifth.

## Status

The crate, the now-playing screen, the approved-set store and the server that joins them are
built. The page reads the approved set and nothing else — there is no path from the library to
the screen that does not pass through a person. See [`PRODUCT.md`](PRODUCT.md) for product truth
and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical design.

Not done: the crate has never been seeded (`npm run db:seed -- --write`), and nothing in this
project has ever made a sound.

## Shape

```
Home Assistant host        Music Assistant (Qobuz + NAS + Sonos), MQTT
        │
Docker host                platebunken-server (SQLite, curation, admin, MQTT)
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

npm run db:seed          # dry run — what seeding the crate from the seed playlist would do
npm run db:seed -- --write
```

`npm run smoke -- --play` starts real music on a real speaker in a child's bedroom. Do not run
it without asking.

## Deploying it

On the Docker host, from a checkout of this repo:

```
git clone … && cd platebunken
cp .env.example .env && $EDITOR .env
docker compose up -d --build
```

`compose.yml` builds from source rather than pulling a published image, which is the right
trade for one private host: there is no registry to run, no tag to keep in step with the repo,
and the thing that is deployed is the commit that is checked out. Publishing a multi-arch image
so that `docker compose up -d` needs no source at all is a public-release step, not this one.

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

Five documents, every claim cited to a primary source, everything unverifiable marked as such.

- [`docs/research/01-backend-sources-sonos.md`](docs/research/01-backend-sources-sonos.md) — Music Assistant internals, Sonos control, Qobuz
- [`docs/research/02-prior-art-kiosk-ui.md`](docs/research/02-prior-art-kiosk-ui.md) — kids' music players, cover-art UIs, Linux kiosk, child UX
- [`docs/research/03-discovery-and-filtering.md`](docs/research/03-discovery-and-filtering.md) — similar-artist APIs, AI-slop and NSBM filtering, acquisition
- [`docs/research/04-pedagogy.md`](docs/research/04-pedagogy.md) — numerals, literacy, and what not to teach
- [`docs/research/05-klipsch-local-audio.md`](docs/research/05-klipsch-local-audio.md) — local audio path, volume ceiling

## Configuration

All environment-specific values live in `.env`, which is gitignored. Copy `.env.example` and
fill it in.

**No personal data belongs in this repository** — no names, no real room labels, no Home
Assistant entity IDs, no tokens, no addresses. The child's room is `KID_ROOM` throughout.

## Name

*Platebunken* — Norwegian for "the record stack". Earlier working name: `metalkid`.
