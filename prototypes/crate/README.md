# PROTOTYPE — the crate

It began as three crates on one route — A the wall, B the stack, C the shelf — to answer one
question: *does browsing feel like flipping through records, and can a four-year-old drive it?*

**Answered: A, the wall.** B and C are deleted rather than kept as options. A prototype that
still carries the alternatives after the decision is one nobody trusts the decision of.

Run: `npm run prototype`.

## What is on screen

- **The crate.** Nine covers, page flip, an arrow on each side pointing the way it takes you.
  The arrows vanish at the ends rather than greying out.
- **The left rail, on every screen.** Three theme discs, then volume — vertical, louder up.
  One control, one place, always.
- **The right rail, on every screen.** Four fixed slots: the crate, then the *new*, *recent* and
  *most-played* shelves. A shelf with nothing on it keeps its slot and goes inert; a rail that
  grew as shelves filled would move marks he had already learned.
- **Now playing.** Cover, band name, and the track list beside it as a number line — always
  visible, not behind a key. Skipping past the last track ends the record and returns to the
  crate with that album selected.
- **A line in the bottom gutter** naming the selected album's artist, title and year. Not for
  the child; useful for whoever is next to him.

```
← ↑ → ↓   move / flip     Enter  play        Space  play / pause
+ / −     volume          Esc    back to the crate      *  next theme
```

## Data

```
npm run snapshot     # dump the real library to public/library.json
npm run prototype
```

The page loads `library.json` if it is there and falls back to the mock set if not, so it always
runs. The bottom bar says which it is showing. `?all=1` shows the whole library rather than the
curated set, for working on the grid. The snapshot is **gitignored** — it is a dump of a private
music library.

The prototype holds no token. `snapshot.ts` uses the Node client, and cover URLs point at MA's
imageproxy, which serves unauthenticated — so real artwork renders with no credential in the
page. Never use the raw `path` from `metadata.images[]`: it is the source provider's own URL,
embeds that provider's API key, and may be unreachable from the kiosk.

Crate tiles load the 1024px render on HiDPI screens: the 512 is short of what a 2x display asks
of a ~374px tile, and soft covers are the one thing this product cannot afford.

Albums with no artwork in MA fall back to a procedural cover rather than a broken tile, so the
gaps in the library stay visible. In a cover-art interface an untagged album is an invisible one.

## Themes

`?theme=natt|vikingtid|romfart`, the three discs on the left rail, or `*`. Each theme is an
emblem, a backdrop and a plate shape as well as a palette — chrome only, never the artwork. They
live in `src/theme/themes.ts`, which is pure data and outlives this prototype. ARCHITECTURE.md
§4.6 says what a theme is not allowed to do.

The backdrop moves: waves drift at three speeds with a ship riding them, stars twinkle out of
phase. `prefers-reduced-motion` stops all of it, and the backdrop carries no information, so
nothing is lost with it.

Show the child all three in a minute and watch which one he reaches for.

**Not production.** No error handling, no tests, no persistence. The font loads from Google
Fonts, which the real kiosk cannot do — production must self-host.
