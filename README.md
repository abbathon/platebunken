<img src="brand/logo.svg" alt="Platebaren" height="46">

A record crate for a pre-reader.

A locked-down appliance that recreates discovering music by flipping through physical album
covers — a grid of cover art on a screen in a child's bedroom. Tap a cover, the record plays.
No text to read, no search, no menus, no way out.

It does four things: **browse, play, volume, skip.** It refuses the fifth.

## Status

The crate, the now-playing screen and the approved-set store are built; the prototype is at
`prototypes/crate`, the store at `src/store`. See [`PRODUCT.md`](PRODUCT.md) for product truth and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical design.

## Shape

```
Home Assistant host        Music Assistant (Qobuz + NAS + Sonos)
                           platebaren-server (SQLite, curation, admin, MQTT)
        │
old laptop in the bedroom  Chromium kiosk → platebaren-ui
                           audio out → powered monitors
```

The laptop holds no state. Destroy it, swap in another, lose nothing.

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

*Platebaren* — Norwegian for "the record stack". Earlier working name: `metalkid`.
