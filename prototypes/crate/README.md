# PROTOTYPE — the crate

**Throwaway.** Answers one question: *does browsing feel like flipping through records,
and can a 4-year-old drive it with either a mouse or a finger?*

Three structurally different crates, switchable with `?variant=`:

| Key | Name | Primary affordance | Targets per screen |
|---|---|---|---|
| `A` | Vegg (the wall) | Tap any cover directly | 9 covers + 2 flips |
| `B` | Bunken (the stack) | Flip one cover at a time, then play | 3 |
| `C` | Hylla (the shelf) | Slide a strip, play the focused cover | 1 + slide |

Run: `npm run prototype`. Arrow keys drive the crate; Shift + ←→ switches variant.

## Themes

`?theme=natt|vikingtid|romfart`, the three discs top-left, `*`, or the button in the top-right
bar. The discs and `*` are the real control — they are in the child's crate. Each theme is an
emblem, a backdrop and a plate shape as well as a palette — chrome only, never the artwork. They live in
`src/theme/themes.ts`, which is pure data and outlives this prototype. See ARCHITECTURE.md §4.6
for what a theme is not allowed to do.

The selected sleeve's frame is themed: a static ring, a light running its perimeter, corner
ornaments, and a settle that arrives from the direction the hand moved. Tracer speed is per
theme and floored at 1800 ms; `prefers-reduced-motion` removes it and makes the ring solid.

Flipping a page sweeps the nine new sleeves in from the side you moved towards. Holding the key
down suppresses it — that is a scrub, not a flip.

The backdrop moves: waves drift at three speeds with a ship riding them, stars twinkle out of
phase. `prefers-reduced-motion` stops all of it, and the backdrop carries no information, so
nothing is lost with it.

A line in the bottom gutter names the selected album's artist, title and year. Not for the
child — the frame is what tells him what is selected — but useful for whoever is next to him.

Crate depth runs down both sides: sleeve edges showing how much is behind you and how much is
ahead, as thickness rather than as a countable row of pips. The playing sleeve carries a solid
bar beneath it. Volume shows a readout wherever you press it. Skipping past the last track ends
the record and returns you to the crate with that album selected.

Crate tiles load the 1024px render on HiDPI screens: the 512 is short of what a 2x display asks
of a ~374px tile, and soft covers are the one thing this product cannot afford.

Show the child all three themes in a minute and watch which one he reaches for.

## Data

```
npm run snapshot     # dump the real library to public/library.json
npm run prototype
```

The page loads `library.json` if it is there and falls back to the mock set if not, so it
always runs. The bottom bar says which it is showing. The snapshot is **gitignored** — it
is a dump of a private music library.

The prototype holds no token. `snapshot.ts` uses the Node client, and cover URLs point at
MA's imageproxy, which serves unauthenticated — so real artwork renders with no credential
in the page. Never use the raw `path` from `metadata.images[]`: it is the source provider's
own URL, embeds that provider's API key, and may be unreachable from the kiosk.

Albums with no artwork in MA fall back to a procedural cover rather than a broken tile, so
the gaps in the library stay visible. That matters: in a cover-art interface, an untagged
album is an invisible album.

**Not production.** No error handling, no tests, no persistence. The font loads from
Google Fonts, which the real kiosk cannot do — production must self-host.
