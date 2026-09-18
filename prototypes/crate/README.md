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

`?theme=natt|vikingtid|romfart`, or Shift + ↑↓, or the button in the top-right bar. Themes are
chrome only — background, frame, buttons — and never touch the artwork. They live in
`src/theme/themes.ts`, which is pure data and outlives this prototype. See ARCHITECTURE.md §4.6
for what a theme is not allowed to do.

The selected sleeve's frame is themed: a ring, optional corner ornaments, and a settle that
arrives from the direction the hand moved. Show the child all three in a minute and watch which
one he reacts to — that is what the switcher is for.

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
