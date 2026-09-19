# The crate — the child's interface

The screen in the bedroom. Crate, now playing, the number line, four shelves, two rails, three
themes, and the parent's settings behind a keypad. Build order §12 items 1–3 — *"those three are
the product"* — are here.

It began as three crates on one route: A the wall, B the stack, C the shelf, asking whether
browsing feels like flipping through records and whether a four-year-old can drive it.
**Answered: A, the wall.** B and C are deleted rather than kept as options; a prototype that
still carries the alternatives after the decision is one nobody trusts the decision of.

That question is closed, so this is no longer a prototype in anything but its path. What it is
*not yet* is listed under [What is missing](#what-is-missing) — precisely, with the thing that
retires each one. That list is the honest version of the sentence that used to sit at the bottom
of this file reading *"Not production."*

```
npm run dev              # src/server/ + vite, opens a browser   (`npm run prototype` is an alias)
```

It no longer runs on its own. The page reads `/api/crate` from `src/server/`, which holds the
store — that is the point of the change, not an inconvenience of it.

## What is on screen

- **The crate.** Nine covers, page flip, an arrow on each side pointing the way it takes you.
  The arrows **vanish** at the ends rather than greying out — nothing that way, nothing to press.
- **The sleeve a record is coming from** carries a solid bar beneath it. Never a ring, so it
  cannot be confused with the selection frame, and never over the artwork. He plays something,
  wanders off, comes back; he is four and will not be holding which one it was.
- **The left rail, on every screen.** Three theme discs, then volume — vertical, louder up.
  One control, one place, always.
- **The right rail, on every screen.** Four fixed slots: the crate, then the *new*, *recent* and
  *most-played* shelves. A shelf with nothing on it keeps its slot and goes inert; a rail that
  grew as shelves filled would move marks he had already learned.
- **Now playing.** Cover, band name, and the track list beside it as a number line — always
  visible, not behind a key. Skipping past the last track is the end of the record, not a dead
  press: the screen returns to the crate with that album still selected.
- **A line in the bottom gutter** naming the selected album's artist, title and year. Not for the
  child; useful for whoever is next to him. It keeps its height when empty so the crate never
  shifts.

```
← ↑ → ↓   move / flip     Enter  play        Space  play / pause
+ / −     volume          Esc    back to the crate      *  next theme
```

← and → never wrap onto the next row: they walk the row, and crossing the edge of the 3×3 flips
the page. Movement stops silently at the ends — no error, nothing happens.

## Settings

The mark sits at the top centre with a menu button beside it; the code is **1234**. That is a
child gate and not security — four digits in front-end JavaScript stops a four-year-old and
nobody else, and the page holds no credential for anything. The real boundary is the kiosk
lockdown (§8) and the fact that no token is ever in the page. Nothing should grow behind this
gate that anyone is asked to trust it with.

Sound, Sources, Shelves, Appearance and Language, in Norwegian or English. On the kiosk each of
these lands in `.env`, the store, or an MQTT topic Home Assistant owns — never in the page.

**Appearance is where the numeral face lives.** The track list is 64 px numerals a child is
learning to read, and it is the one place in his interface where the typeface does real work.
`?font=archivo|andika|lexend` switches it too, so both can be put in front of him in seconds.

## Data

**The only source of albums is the approved set.** The page fetches `/api/crate`, which
`src/server/` builds from `src/store/` — and `src/store/`'s only way in is `approve()`, which
throws on an album that was never reviewed. The crate asks the store what albums exist, and asks
Music Assistant exactly two things: *give me this cover* and *play this uri*. Never *what have
you got*.

This is the change the file used to be waiting for. What it replaced is worth writing down,
because the failure mode was not obvious: the page fetched `public/library.json` — a snapshot of
the **whole** library — filtered it on a `seed` boolean, and **fell back to a hardcoded mock set
on any error**. Twenty albums nobody had approved, several of which nobody would, one fetch
failure away from the child. The mock set is deleted rather than disabled. A fallback that exists
is a fallback that fires.

`slots` may contain nulls and **callers must not compact it**. A null is a withdrawn album; its
empty tile is what keeps every position after it exactly where the child left it.

```
npm run db:seed          # dry run: what seeding the store from the seed playlist would do
npm run db:seed -- --write
```

`?all=1` is gone with the snapshot it belonged to: there is no "whole library" left to show.
`npm run snapshot` still exists, but it only feeds design work now — nothing reads its output.

The page holds no token. Cover URLs point at MA's `/imageproxy/<proxy_id>`, which serves
unauthenticated, and they are stored **host-less** so the dev server proxies them through the
page's own origin. **Never use the raw `path` from `metadata.images[]`**: it is the source
provider's own URL, embeds that provider's API key, and is flagged `remotely_accessible: false`.
The proxy accepts only `{0,80,160,256,512,1024}`.

Crate tiles load the 1024 px render on HiDPI screens: the 512 is short of what a 2× display asks
of a ~374 px tile, and soft covers are the one thing this product cannot afford. Covers are warmed
at startup rather than lazy-loaded, because a held-down arrow key outruns lazy loading and an
empty tile is indistinguishable from a broken one.

Albums with no artwork fall back to a **procedural cover** rather than a broken tile, so the gaps
in the library stay visible. In a cover-art interface an untagged album is an invisible album.

## Themes

`?theme=natt|vikingtid|romfart`, the three discs on the left rail, or `*`. Each theme is an
emblem, a backdrop and a plate shape as well as a palette — **chrome only, never the artwork**,
and it carries no position, so changing it cannot move anything he has memorised. That is what
makes it safe to hand him the switch. They live in `src/theme/themes.ts`, which is pure data with
22 tests. ARCHITECTURE.md §4.7 says what a theme is not allowed to do.

The backdrop moves: waves drift at three speeds with a ship riding them, stars twinkle out of
phase. `prefers-reduced-motion` stops all of it, and the backdrop carries no information, so
nothing is lost with it.

Show the child all three in a minute and watch which one he reaches for.

## What is missing

Not caveats — a work list. Each line names the thing that retires it.

| Missing | Consequence | Retired by |
|---|---|---|
| ~~Reads the library, not the approved set~~ | — | **Done.** `/api/crate`, and the mock set deleted |
| ~~No error handling~~ | — | **Done.** §10's sleepy state, after three missed fetches |
| ~~Play history resets on reload~~ | — | **Done.** The `play` log in the store (§5.1) |
| **Settings do not persist** | Theme, language and numeral face are still in page memory, so the kiosk forgets them on every reboot | The store, or `.env` — §4.6 says which value belongs where, and nothing has been written yet |
| **No tests in this directory** | Every visual regression here has been invisible to the type checker | Screenshotting it in Chromium is what is actually used; that is a habit, not a test |
| **Google Fonts in `index.html`** | **The kiosk has no WAN.** The numeral face will not load on the device it was chosen for | Self-hosting the faces as subset `woff2` — all three, not just the winner, so the comparison can be run in the room it matters in |
| **No service worker** | Covers are cached only by Chromium's own disk cache, and a page that reloads while the server is away shows Chromium's error screen | Workbox + `navigator.storage.persist()`, once the origin counts as secure — ARCHITECTURE.md §3.1 |
| **The name `prototypes/`** | The directory disclaims the product that lives in it | The parent's call: promote to `src/ui/`, or rewrite. Not moved until they say so |

## Paid for already — do not rediscover these

Found the expensive way in this code, and true of this CSS specifically.

- **`clip-path` on a control clips its hit area.** Themed button shapes are painted on two layers
  *inside* the button. A test greps the stylesheet to keep it that way, because §4.5's 76 px floor
  dies silently otherwise.
- **A percentage height needs a definite containing block.** A centred grid row is not one;
  elements laid out that way computed to 0×0.
- **`transform` and `translate` are separate properties.** The page riffle animates `translate`,
  because the focused slot holds its lift in `transform` and animating that would end by
  flattening the lift.
- **A repeating `q…t…t` path's period is two segments, not one.** The drifting waves shift by 80
  units, not 40, and must be drawn from −90 well past the right edge or the sea grows a seam.
- **A `const` used by a top-level call sits in its own temporal dead zone.** `tileSize` threw on
  load until it became a function declaration.
- **`str.replace` that does not match fails silently.** Assert before writing.
- **Screenshot it in Chromium before believing it works.** Three visual bugs this session passed
  the type checker.
