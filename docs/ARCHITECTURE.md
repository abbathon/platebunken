# Platebunken — design

> A record crate for a pre-reader. Browse album covers, put one on, hear it in your own room.

Name: **Platebunken** (Norwegian, *the record stack*). Earlier working name `metalkid`; briefly
`Platebaren`, after the record shop in Tromsø, and changed back. The mark and the naming note are
in `brand/` and PRODUCT.md.

**Privacy rule, absolute:** no child's name, no real room labels, no Home Assistant entity IDs,
no tokens, no IPs anywhere in this repository. Everything environment-specific lives in `.env`
(gitignored) with placeholders in `.env.example`. The child's room is `KID_ROOM` throughout.

---

## 1. What this is

A locked-down appliance that recreates discovering music by flipping through physical album
covers. A grid of cover art on a screen in the child's bedroom; tap a cover, the record plays.
No text to read, no search, no menus, no settings, no way out.

**Primary user:** one child, age 4, pre-reader, Norwegian-speaking.
**Success, in six months:** he plays music without asking, and at least once a month plays
something nobody put in front of him.

**Non-goals.** Not a learning app. Not a streaming client. Not a tablet. Not a general-purpose
computer. It does four things and refuses the fifth.

---

## 2. Principles

1. **Reliability is the feature.** A beautiful thing that fails is worse than a plain thing that
   works. (The 2024 Sonos app rewrite is the cautionary tale in this exact product category.)
2. **The child never sees an error.** Failures render as a quiet, sleepy state; the parent gets
   the notification.
3. **Nothing he has memorised ever moves.** Spatial position is how a pre-reader navigates.
4. **The device never asks him a question.** No quiz, no prompt, no reward, no streak — not
   optional, not behind a parent gate. Evidence: expected tangible rewards undermine children's
   intrinsic motivation (*d* = −0.28 to −0.40).
5. **Silence is a feature.** When a record ends it ends, which is what sends him back to the crate.
6. **The approval gate is an architectural boundary,** not a filter setting. No code path can put
   an album in front of the child that the parent has not seen.
7. **The laptop is disposable.** All state lives on the server. Destroy the laptop, swap in
   another, lose nothing.

---

## 3. Architecture

```
┌────────────────────────── HA host ───────────────────────────┐
│  Music Assistant        library + playback engine            │
│    ├── Qobuz provider           (quality 6 = CD 44.1/16)     │
│    ├── Jellyfin provider        → NAS                        │
│    ├── Sonos (S2) provider      → KID_ROOM Play:1 + others   │
│    └── squeezelite provider     → the laptop (see §7.2)      │
│  MQTT broker                                                 │
└──────────────────────────────────────────────────────────────┘
                     ▲ ws (MA API) + mqtt — dialled out
┌──────────────── Docker host (the existing VM) ───────────────┐
│  platebunken-server     one image, one container  (§3.1)     │
│    ├── static           the built page, served by this proc  │
│    ├── SQLite           → a volume. The one thing here that  │
│    │                      has to outlive the container.      │
│    ├── MA client        WebSocket, persistent                │
│    ├── curation worker  suggestions → review queue           │
│    ├── admin API        parent's phone                       │
│    └── MQTT             HA discovery: controls + state       │
└──────────────────────────────────────────────────────────────┘
                     ▲ http — one port, dialled in
┌───────────────────── old laptop, KID_ROOM ───────────────────┐
│  Debian 13 → XFCE on X11 → Chromium --kiosk         (§8)     │
│    ├── platebunken-ui    vanilla TS, built, holds no state   │
│    └── squeezelite       an MA player on the analog jack     │
│  Audio out → Klipsch R-14PM (wired) │ Sonos Play:1 (LAN)     │
└──────────────────────────────────────────────────────────────┘
```

**Why Music Assistant.** It is the only backend where every requirement is a first-party feature:
a merged, de-duplicated Qobuz + NAS library; a LAN-local Sonos provider needing no cloud, no port
forwarding and no Sonos developer registration; a documented token-authenticated API with a
generated OpenAPI spec (`:8095/api-docs`); and a per-player `max_volume` that MA **re-clamps when
changed externally** — which nothing in the Sonos protocol offers.

**Why MA stays on the HA host.** MA sits in the audio path. If it ran on the laptop, a closed lid
or a yanked power cable would stop the music mid-song. On the server, the laptop can die and the
record keeps playing (on the Sonos path).

**Why not the alternatives.** Sonos' own Control API is cloud-only, OAuth-gated, cannot express
"browse a library", and caps favourites at 70 with no API to create one. Navidrome is unnecessary —
MA already serves sized thumbnails at `/imageproxy/<id>?size=N`. `node-sonos-http-api` is dormant
(last commit 2025-03-22, last tagged release 2017). Roon costs $15/month and wants a newer machine.
Full comparison in `research/01`.

**Verified deployment.** MA **2.9.9, API schema 31**, running as a Home Assistant add-on.
Music providers enabled: `qobuz`, `jellyfin` (which is where the NAS library actually comes
from — not the filesystem provider), `builtin`, `radiobrowser`, `podcast_index`. Metadata:
`musicbrainz`, `coverartarchive`, `theaudiodb`, `fanarttv`, `itunes_artwork`, `wikipedia`,
`lrclib`, and `lastfm_recommendations` — the last is worth reusing for curation rather than
calling Last.fm directly.
The authoritative command reference is that server's own `/api-docs/commands.json` — 238
commands — not any GitHub branch. Every command this app calls was confirmed present there.

**Client auth.** A dedicated non-admin MA user with `library.read` + `queues.control` +
`players.control` only. `auth/token/create` has `required_role: null`, so that user can mint
its own long-lived token once logged in; no admin account needs to be involved. **The long-lived token expires in 365 days** — the docs claim ten years,
the code says otherwise. Diarise it.

### 3.1 Where the server runs, and what it ships as

**A Docker image, on the Docker host that already exists. This has now been reversed twice** —
first the diagram above put `platebunken-server` on the HA host, then a Proxmox LXC was chosen,
and both are superseded. Neither is a bad answer; the image is a better one, for three reasons.

- **The host already exists.** A dedicated Docker VM is running and is already patched, backed up
  and remembered. An LXC is one more machine to do all three to, forever, for one small Node
  process.
- **An image is the only artifact a stranger can use.** If this ever goes public, the whole
  install is `docker compose up -d` — the same shape Music Assistant itself ships as
  (`research/01` §1.1), so the one thing a prospective user already has running is the one thing
  they need. A Proxmox LXC is a Proxmox-only artifact. And it is not even a real fork: an LXC
  would have meant building the image anyway and running Docker inside the container, which buys
  a layer of nothing.
- **The image is the deployment.** Rebuild from a tag, roll back to a tag. An LXC's state is
  whatever was last done to it by hand.

**Still not on the laptop.** Unchanged and not up for discussion: *the laptop holds no state.
Destroy it, swap in another, lose nothing.* The store holds the child's crate **positions**, and
a kiosk laptop in a bedroom is exactly the machine you reimage without thinking about it.

**The store is a volume, and that is the entire backup story.** Everything else in the container
is rebuilt from the image and is worth nothing. The SQLite file is worth everything: it is
append-only and it is what the child has memorised. So `docker compose down -v` is the one
command that destroys the product — say that in the README rather than assuming nobody will type
it. The volume is backed up on the Docker host's own schedule; nothing bespoke.

**Bridge networking, not host.** The server dials *out* to MA's WebSocket and to the MQTT broker,
and is dialled *in* on exactly one port. Nothing in it needs mDNS or SSDP. Music Assistant needs
`network_mode: host` because Sonos discovery does — **do not copy that here**; it is the obvious
cargo-cult and it hands a small Node process the whole host's network namespace for no gain.

**No credential is ever in the image.** The MA token and the MQTT password arrive through
`env_file:` at run time. Never `ENV` in the Dockerfile and never a `COPY` of `.env`: a layer is
public the moment the image is, and `docker history` reads it back. The image itself must be
publishable without redacting anything — that is the test.

**Multi-stage, non-root, and it serves its own page.** Build stage runs `vite build` and `tsc`;
runtime stage is a slim Node base carrying `dist/` and production deps only, running as a
non-root user, with a `HEALTHCHECK` that asks the app rather than the port. The page is static
files served by the same process that serves `/api/*`, so the page's origin and its API's origin
are the same one and there is no CORS story, no second container and no reverse proxy required
to make development match production.

**The secure-origin trap, and what to do about it.** §9 wants a Workbox service worker with
`navigator.storage.persist()` so artwork survives a reboot, and §8 keeps the Chromium profile
non-ephemeral for the same reason: warm covers are what stop a held-down arrow key showing black
squares. But a page served from another host over plain `http://` **is not a secure origin**, so
on this deployment there is no service worker and no persistent cover cache at all. Two ways out:

| | What it costs | Verdict |
|---|---|---|
| `--unsafely-treat-insecure-origin-as-secure=http://<host>:<port>` in the kiosk's Chromium flags | One Ansible variable. It is a flag on the client, so the server carries nothing | **Take this now.** Legitimate on a single-target kiosk on a LAN you own |
| TLS in the stack — a reverse proxy with an internal CA, trusted through Chromium policy | A certificate distribution story this LAN does not have, and the kiosk has no WAN so ACME needs DNS-01 | **The public-release answer**, not today's |

Decide this deliberately, because it bites late and quietly: the cache simply never persists, and
the symptom is intermittent black tiles on a cold boot, months from now, on the one machine
nobody wants to debug.

---

## 4. The child's interface

**Keyboard first.** Arrow keys and Enter are the primary input; mouse and touch work
alongside. The reason is measured rather than aesthetic: tap accuracy on an intended static
target at ages 4–6 is about **57%**, while a keypress cannot miss. Four arrows map onto a
grid without reading, and Enter is unambiguous.

```
← ↑ → ↓   move / flip     Enter   play        Space   play / pause
+ / −     volume          Esc     back to the crate      *   next theme
```

In the crate, **← and → never wrap onto the next row.** They walk the row, and crossing the
edge of the 3×3 **flips the page** — which is the riffling motion the whole thing is
imitating. The flip keeps the same row and lands on the opposite column, so the hand's
sense of position survives it. ↑↓ move within the page and stop at its edges. Movement
stops silently at the ends of the crate: no error, nothing happens.

On the now-playing view ←→ are volume, and ↑↓ open the **number line** (§4.2) and then walk
it; Enter plays the focused track. **Space is play/pause everywhere.**

**Volume lives in one place, on every screen** — vertical, on the left rail under the theme
discs, louder up. It was first in the now-playing transport, so the crate took the keys and
showed nothing; then it flashed a readout that appeared and vanished. Both were wrong the same
way: a four-year-old learns a control by where it is, and a control that moves with the screen,
or is nowhere until you touch it, is several controls rather than one. At the ceiling the
blocks sit full and do not move, which says *that is all there is* without a word.

**Volume keys are accepted from several sources** — `+`/`−`, `NumpadAdd`/`NumpadSubtract`,
the media keys, and PageUp/PageDown — so the final controller does not dictate the code.
On a Norwegian layout `+` and `−` are both unshifted single keys.

The selected sleeve is unmistakable — it lifts, takes an accent ring, and the rest of the
crate dims. Subtle focus styling is for people who already know what focus is.

Four verbs, plus two toggles. Nothing else exists.

| Verb | Rendering |
|---|---|
| Browse | Arrow keys, or tap a cover in the crate |
| Play / pause | One large button |
| Volume | Two large buttons + a row of filled blocks |
| Skip | One large button, forward only |
| *Shuffle, repeat* | Two toggles, now-playing view only |

### 4.1 The crate

- A fixed page of covers with **page flip**, never infinite scroll. Crate-digging was flipping,
  not scrolling, and a crate has an end.
- **The flip is visible.** Nine sleeves sweep in from the side the hand moved towards, column by
  column, nearest edge first. Instant replacement made a new page indistinguishable from a
  redraw, which threw away the one moment the whole interface is imitating. A flip landing on
  top of the previous one is a *scrub*, not a flip — he is holding the key down to travel — and
  cuts straight through, because replaying the sweep would leave the crate permanently
  half-faded while he moves.
- **Append-only order.** New albums are appended, never inserted. Position `2-3` is the same album
  forever.
- **An arrow on each side of the covers, pointing the way it takes you.** This replaced two
  things: a row of one pip per page, and then a pair of crate-depth rails that stood where the
  arrows stand now.

  The pips had to go because the crate is append-only and fed by a curation worker — twelve of
  them needs exactly the two things PRODUCT.md measured him as unable to do, counting past a
  subitizing range of 2.8 and comparing ordinal positions at 0.66 accuracy. The depth rails
  that replaced them were honest, a quantity seen rather than counted, but honest is not the
  bar: they still asked him to work out what they meant, and all they ever meant was *there is
  more that way*. An arrow says it outright.

  The arrows **vanish** at the ends of the crate rather than greying out — nothing that way,
  nothing to press, the same silent stop the arrow keys make, said in the same place. They are
  laid out beside the grid rather than pinned to the window, so they stay next to the covers at
  any width instead of drifting into the margin or onto them.
- **The sleeve a record is currently coming from is marked** with a solid bar beneath it —
  never a ring, so it cannot be confused with the selection frame, and never over the artwork.
  He plays something, wanders off and comes back; he is four and will not be holding which one
  it was. This is the return half of §4.4's home target.
- **No text the child needs.** Cover art only — with one line in the bottom gutter naming the
  selected album's artist, title and year. It is not for him: he cannot read it and never needs
  to, because the frame already says what is selected and this only ever agrees with the frame.
  Same move as the track titles in §4.2 — small, dim, non-functional, there for whoever is
  standing next to him. It keeps its height when it has nothing to say, so the crate above it
  never shifts, and it sits centred and clear of the page-flip buttons at either edge.
- Separate shelves — **new**, **recent**, **most-played** — are *additional surfaces*, never
  reorderings of the crate. **Built**, as four fixed slots on a right-hand rail: the crate
  itself, then the three shelves. Each shelf is capped at one page and keeps its own cursor, so
  leaving the crate to look at what is new and coming back does not cost him his place.

  `recent` and `most-played` are built from what he played and from nothing else — there is no
  separate tracking. `new` is the tail of the crate reversed, which is exact rather than
  approximate: the crate is append-only, so the last albums added are the newest by
  construction, and the trickle decides what has arrived.

  **A shelf with nothing on it keeps its slot and goes inert** rather than disappearing. A rail
  that grew as shelves filled would move marks he had already learned, and spatial position is
  the only index a pre-reader has. A dim, visibly different slot is a worse control than a live
  one and a far better one than a rail that rearranges itself.
- A **new** album appears on the new shelf, released on a trickle (a steady drip even if a dozen
  were approved at once) so there is nearly always a reason to walk over and look.

### 4.2 The album view

The track list, rendered as a number line — the best-evidenced pedagogic feature in the design.

- **One vertical column**, evenly spaced, top to bottom. Never a wheel, arc, ring, carousel or
  grid: the linear geometry carries the measured effect, not the numerals.
- Rows **≥ 96 px** tall, full width (above the 76 px floor, because adjacent rows mean a miss lands
  on a neighbour).
- Numeral **left**, ≥ 64 px, plain high-contrast sans, **tabular figures** so the column reads
  straight. **The face is chosen against this job and nothing else** (`src/theme/fonts.ts`): it is
  the only place in his interface where typography does real work, and Archivo — which arrived
  with the first prototype and was never argued for — has condensed digits and a `1` lighter than
  every other numeral, which in a number line makes the first numeral he meets read as a divider.
  Andika (SIL, drawn for beginning readers) and Lexend are the candidates. Switchable in settings
  and with `?font=`, so the answer comes from watching him rather than from judgement. **Production
  must self-host the winner** — the kiosk has no WAN.
- **True track numbers, 1…n.** No truncation, no renumbering. Accuracy is what makes it learnable.
- Track title small and dim to the right — for the parent, ignorable by the child, non-functional.
- Tapping a row plays from that track. This is *play* aimed at a smaller object, not a new verb.
- Playing row marked by a **solid block of colour**. Not a pulse, not a glow, not an animation.
- **No dots or pips** beside numerals: mean subitizing range at 42–57 months is 2.8. The row's
  position in the column already *is* the magnitude cue.
- **Never require an ordinal comparison.** Only 26% of 4-year-olds can order the digits 1–6.

### 4.3 Now playing

- Cover near-fullscreen, square, uncropped, no text overlaid.
- Band name **once**, large, centred, plain capitals — below the art, never a control.
- **The track list is here and always visible**, beside the cover. It was briefly a screen of
  its own opened with ↑↓, which was wrong twice over: a four-year-old has no reason to guess
  that a key opens something, and the list is most of what this screen is for. The cover gives
  up some size for it. ↑↓ walk the list; there is nothing to open.
- **Skipping past the last track is the end of the record, not a dead press.** The screen goes
  back to the crate with the finished album still selected. Principle 3 says silence is a
  feature — a record stops, and that is what sends him back to the crate — and that only works
  if the screen goes with him. Sitting on a stopped now-playing screen makes an ending look
  like a failure, and he has no way to tell the two apart. He lands where choosing happens,
  and the selection is the only record he has of what he just heard. On the kiosk the trigger
  is Music Assistant reporting an empty queue; the behaviour is the same function.
- **The host owns blanking, not the app.** The display is always on, blanks after a period, then
  powers down — `xset s blank` + `xset dpms` on the Debian kiosk. The app implements no idle
  timer, no dim, no screensaver, no clock and no visualiser.
- Music keeps playing while the screen is off, because playback lives in Music Assistant and not
  in the page. The browser therefore holds no wake lock and never fights the host's blanking —
  a free consequence of §3's decision to keep the laptop a stateless UI.
- **Do not install a screensaver program, and never a locking one.** X's own blanking hands the
  waking keypress on to the page, so the first press both lights the screen and does what he
  meant; a screensaver or lock swallows it, and a press that does nothing is exactly the
  disappointment principle 1 is about. UNVERIFIED on this hardware — confirm during kiosk setup.

### 4.4 Getting home

A permanent home target in the same corner forever, plus a quiet auto-return to the crate after
inactivity. **No back button** — "back" is a stack concept and he does not have one.

### 4.5 Hard interaction rules

- Minimum **76 px** for every control (NN/g children's guidance ≈ 2 cm; nearly double WCAG AAA).
- **Assume half of taps miss.** Measured success on a static intended target at ages 4–6 is **57%**.
  A miss must be harmless and a retry instant.
- **No long-press anywhere the child needs it** — 20% success at this age. It is therefore a good
  hidden *parent* gesture.
- No pinch, no precise drag, nothing timed, no two-handed gestures.
- **Dead zones along the screen edges** — children press with the full finger pad, at an angle,
  often several fingers at once.
- **No destructive action exists.** No delete, no settings, no queue editing. Undo is not a concept
  he holds, and a confirmation dialog is useless to someone who cannot read it.
- **No boot, no splash, no loading state, no empty state.** Instant time-to-music.

### 4.6 The top bar, and settings on the device

The mark sits small and centred at the top of the child's screens, with a menu button beside it.
An earlier version of this document said the logo never appeared on any surface he touches; the
parent reversed that. What that rule protected still holds — no splash, no boot screen, nothing
that delays him.

**The menu button is deliberately below the 76 px floor**, at 44. That floor exists so the child
can hit the controls he needs; this is the one control he must not hit, and the same reasoning
that sets a minimum for the others sets a maximum for this one. A stray press still costs
nothing: it opens a keypad he cannot pass, and Esc, the close target and an idle return all lead
back out.

**The gate is a child gate, not security.** Four digits compared in front-end JavaScript stops a
four-year-old and nobody else. The real boundary is unchanged and elsewhere: the kiosk lockdown
(§8), and the fact that no credential for Music Assistant, Qobuz or the store is ever in the
page. Nothing should grow behind this gate that anyone is asked to trust it with.

**Settings are the one surface in the product made of text**, which makes them the surface
PRODUCT.md's Norwegian-and-English commitment is actually about. Sound (volume ceiling, starting
volume, output path), Sources (which suggestion sources feed the queue, charts among them),
Shelves (the new-shelf trickle), Appearance (default theme, numeral face) and Language. On the
kiosk each of these lands in `.env`, the store, or an MQTT topic Home Assistant owns — never in
the page. The review queue itself stays on the phone (§6): it is a ten-second-a-day job done
somewhere else, not something to stand in a bedroom doing.

### 4.7 Themes

A four-year-old who is currently deep into vikings should be able to have a viking record
player. `src/theme/themes.ts` holds the themes as pure data; the prototype renders them.

A theme is bounded hard, because PRODUCT.md is explicit that the product's visual world must not
compete with the covers it displays:

1. **Chrome only.** Background, frame, buttons, page furniture. A theme never overlays, tints,
   crops, filters or decorates the artwork. The sleeve is untouchable — and that includes the
   procedural fallback cover, which stands in for album art and so is not a theme surface.
2. **The child sets it, and the parent sets the default.** Three discs, top-left, in every crate
   variant, forever — and `*` on the keyboard does the same thing. This is a fifth verb, and the
   smallest one that exists: the device looks different and nothing else changes.

   It is a picker, not a question, and the difference is structural. **There is no mode.**
   Nothing opens, nothing closes, nothing waits for an answer, and there is no state in which
   the crate is unavailable. No text, ever: each disc wears its own theme's background, ring and
   accent, so it shows what it does. It lives in the **edge dead zone** of §4.5 — and it is the
   ideal occupant, because it is the one control in this product where a stray palm press costs
   nothing at all, so a miss there is free. Its position never changes, so it never disturbs
   what he has memorised.
3. **A theme carries no spatial information.** No position, no layout, no target size, no key
   mapping. That is precisely what makes themes the *one* thing in this product that can be
   changed freely: switching from `natt` to `vikingtid` cannot move anything he has memorised,
   because a theme holds nothing that could move. A test enforces it.
4. **Motion has a floor and a reason.** The frame settles when a key is pressed and arrives from
   the direction the hand moved; that part is a reply. The **tracer** — a light running the
   frame's perimeter — is not a reply, and it is here because a frame should look alive rather
   than like a box. It is bounded instead of banned: only on the selected sleeve, never on the
   now-playing screen he leaves running, and **never faster than `TRACER_FLOOR_MS` (1800 ms)**.
   That floor is the one rule in the theme module with a person on the other end of it — a
   bright moving edge forty centimetres from a four-year-old's face, for as long as he is
   choosing, is not a style decision. It is derived and deliberately conservative rather than
   quoted from a standard, and a test enforces it.

   Under `prefers-reduced-motion` the tracer disappears and the ring goes **solid** in its
   place. Losing the animation must never cost him the selection.

**A theme is three things, not a palette.** Colour alone was the first attempt and it failed the
only test that matters: a four-year-old who is into vikings looked at it and saw an orange dot.

- **An emblem.** A longship, a ringed planet, a moon. `0 0 64 64`, `currentColor`, and it has to
  survive being drawn at 40px, because that is its size on the picker disc — the one graphic in
  the product a pre-reader has to recognise on sight. Silhouettes, not line art. The longship
  took three drafts: stripes and short prow posts read as a basket, then as a crown, before
  separation fixed it — posts out at the edges, a solid sail well inside them, air between the
  two. Detail is what a 40px drawing cannot spend.
- **A backdrop, and it moves.** The theme's world, filling the space the covers do not, at a few
  percent opacity, scaled to cover and cropped. This is the only surface where a theme may be
  more than chrome, and it is allowed precisely because it can never compete with artwork: it
  sits behind everything and covers are opaque. `MOTIF_MAX_OPACITY` keeps it a texture rather
  than a picture. `natt` has none, which is that theme's whole argument.

  The waves wave — three lines drifting at three speeds, with a ship riding them; the starfield
  twinkles in three groups out of phase and a ring turns. Motion is declared by tagging elements
  with a small shared vocabulary (`MOTIF_MOTION`), with the timings in the stylesheet so
  `prefers-reduced-motion` is honoured in one place. A test greps both directions, because a
  class-name typo would fail silently as a backdrop that simply never moves.

  **`MOTIF_DRIFT_FLOOR_MS` is 6000.** This is the largest moving surface in the product, in a
  bedroom, at night, behind the record he is trying to choose. Slow enough and it is weather;
  quick enough and it is a visualiser. A drifting path must also be drawn from `-90` well past
  the right edge: it is shifted a whole 80-unit wave period and still has to cover the viewBox
  at both ends of the cycle, or the sea grows a seam. Tested.
- **A plate shape.** Round, shield, hex — the silhouette of every chrome button. It is painted
  on two clipped layers *inside* the control and never as a `clip-path` on the control itself,
  because that would clip the hit area along with the picture. §4.5 puts a hard 76 px floor
  under every target. **A theme may change what a control looks like; it may never change what
  it is possible to hit.** A test greps the stylesheet to keep it that way.

**The selected sleeve.** Four layers: a static ring (dim but solid — the legibility floor), the
tracer, corner ornaments, a halo. The lift and the focus state live on the slot rather than the
cover, so the frame travels with the sleeve instead of peeling off it. Corner ornaments are four
placed SVGs, never one stretched frame — the tile size is viewport-derived, and knotwork
stretched to a non-square tile stops being knotwork.

The tracer is a conic gradient masked to the ring, driven by an `@property` angle. A plain custom
property interpolates as a string and would jump rather than sweep. **UNVERIFIED on the kiosk
hardware:** this repaints one element continuously for as long as the crate is on screen, and
whether the host powering the display down also stops that work is a question for the laptop, not
for a doc. Measure it during kiosk setup alongside the touch and fling checks (§12).

Three themes ship: `natt` (the default; least visual world, most album art), `vikingtid` (carved
oak, iron and ember), and `romfart` (deep space). The third exists so the second is a system
rather than a special case — the older child will want his own.

`src/theme/themes.test.ts` asserts the contrast floors per theme: body text at AAA, the play
button's label on the accent at AA, and the selection ring against the background. The child
cannot read, so the ring is the only thing telling him which sleeve is live, and a theme author
picking pretty colours must not be able to take that away.

The *visual* system beyond this — type, spacing, the rest — is `DESIGN.md`, owned by the
`impeccable` skill. This section owns only the rules a theme may not break.

---

## 5. Curation

```
seed playlist ──▶ similar-artist lookup ──▶ annotate ──▶ REVIEW QUEUE ──▶ parent ──▶ crate
   (parent)        ListenBrainz Labs        advisory      (SQLite)        approves    (append)
                   Last.fm / Deezer          flags
```

**Sources.** ListenBrainz Labs `similar-artists` (no key, MBID-native), Last.fm `artist.getSimilar`,
Deezer `/artist/{id}/related`. MA also ships a `lastfm_recommendations` provider and a local Sonic
Analysis provider (CLAP embeddings) worth trying.
**Spotify is unavailable** — Related Artists and Recommendations were restricted to pre-existing
extended-quota apps on 2024-11-27. A key registered today is permanently blocked. Do not design
around it.

**Annotations are advisory. Nothing is ever auto-rejected.**

| Flag | Source | Note |
|---|---|---|
| NSBM / National Socialism themes | Encyclopaedia Metallum `themes` (`Crawl-delay: 3`) | Substring match — `Fascism` mostly returns *anti*-fascist bands |
| Likely AI-generated | no MBID, no Discogs releases, absurd release cadence, label allowlist | >50% of Deezer's daily uploads were AI as of June 2026 |
| Explicit | Qobuz `parental_warning` → MA `metadata.explicit` | Displayed, carries no weight |

**Why the human gate is mandatory, not belt-and-braces:** Burzum's Metal Archives themes read
*"Mythology, Folklore, Odalism…"*. The single most notorious case in the genre sails straight
through any automated theme filter. Automation sorts the queue; it does not decide.

**Label blocklists:** only encode labels documented by SPLC/Bellingcat-grade sources. An
unsourced accusation is defamatory.

**Acquisition.** Qobuz is the primary source and albums stream. Permanent local copies come from
the parent's existing *arr stack; the admin app offers a hand-off rather than downloading anything
itself. Qobuz's ToS licenses streaming *"without authorization to download"*. Cover art target
1000 px is comfortable (`beets`: `minwidth: 1000`, `enforce_ratio: no` — *Master of Puppets* is
2500×2200).

### 5.1 The store

`src/store/` — SQLite via Node's built-in `node:sqlite`. No dependency: a kiosk expected to run
for a decade should not carry a native addon that needs rebuilding on every Node upgrade.

Five tables. `album` is everything we know of; `candidate` is the review queue; `flag` holds
advisory annotations; `approved` is the crate. The gate is a function that refuses:
`approve()` throws on an album that was never suggested, so no code path can reach the child's
crate without a person having seen the album first.

**Two invariants are database triggers, not application code.** A rule that lives only in a
function is a rule the next code path walks around.

- A `position` may be filled once, from `NULL`, and never changes again.
- Rows in `approved` are never deleted.

**Position is assigned at release, not at approval.** Approving puts an album in the crate's
future; the trickle (§4.1) decides when it arrives. A dozen approvals on a Sunday still reach
the child one at a time.

**A withdrawn album leaves its slot empty forever.** The parent can take an album back, but the
crate must not flow up into the gap — that would move every position after it, which is
principle 2. One empty tile is cheap. Re-flowing costs the child everything he has memorised.

**`approved` is keyed by profile.** There is one profile today. There is a second child, seven
years older, and the schema exists now because adding it later would mean renumbering an
append-only structure, which the triggers correctly refuse. The child's UI never mentions it and
never asks who is using the device.

**Album identity.** `uri` is the Music Assistant handle and the thing we play, but a `library://`
uri is a row id in MA's own database. `artist`, `title` and `mbid` are stored alongside it so an
approved album can be re-resolved if that library is ever rebuilt. Losing an approved album
silently is worse than any duplicate.

**Seeding is the one automatic approval,** and the justification is narrow: the parent built the
seed playlist by hand, so the playlist *is* the act of approval. `scripts/db-seed.ts` reads the
playlist twice and refuses to write if the two reads disagree — a provider playlist can return a
partial answer while MA is still syncing, and a partial read would freeze a wrong order into an
append-only crate.

`npm test` covers the invariants above. They are the part of this system where a regression is
invisible until it has already cost the child his map of his own music.

---

## 6. Parent surfaces

- **Admin web app** (phone): the review queue — cover, artist, preview, annotations, ✓ / ✗.
  Ten seconds a day.
- **Home Assistant via MQTT discovery**: volume ceiling, allowed rooms, enable/disable, now
  playing, listening statistics, health. Presets are HA scenes — the app owns no schedule.
- **HA is the control surface, never a dependency in the playback path.** Music must not fail
  because HA is restarting.
- Notifications: Qobuz auth expired, MA token nearing its 365 days, speaker unreachable, long
  listening session.

---

## 7. Audio out

Two independent paths with different failure modes. Built one at a time; Klipsch likely primary.

**A — Klipsch R-14PM**, wired to the laptop over **USB** (class-compliant, no driver, better than
the laptop's own headphone DAC). No Sonos dependency and no LAN-API risk.
**B — Sonos Play:1** over the network. Survives the laptop dying.

### 7.1 The knob is not a child control

The R-14PM's `VOLUME/SOURCE` control is on the **rear panel**, on the same face as the mains inlet
and speaker terminals — there is no front-baffle control at all. It is also **push-to-cycle-source**,
so a child turning it eventually changes the input and gets silence.

So it is not a play control; it is the **calibrated hardware ceiling**, set once with an SPL meter
and then left alone. Klipsch publishes a maximum of **103 dB @ 1 m**, which is why this matters.

The child-reachable physical control is the **IR remote**. The manual publishes the full IR hex
code table (e.g. `USB Source Select` = `0x02FD 48B7`), so an HA IR blaster can force the input back
and wind the volume down — a recovery path, and an automation hook. The front LED encodes source
(**white = USB**), which is a rule a four-year-old can learn.

### 7.2 The laptop as a Music Assistant player

**As of the Ansible work this is not yet true.** Music Assistant knows no player on the laptop:
the providers in play are `sonos`, `chromecast`, `airplay`, `sendspin` and the universal
players, and `PLAYER_ID_PRIMARY` is a Sonos Play:1. Two separate things must both hold before
the laptop has an output at all — **squeezelite running** (`ansible/roles/audio`) and **the
slimproto provider enabled in Music Assistant**, which is a toggle on the HA host that Ansible
cannot reach. The parent's settings screen says so rather than showing a list with a missing
row.

squeezelite is the chosen mechanism over snapcast (a server/client pair for one speaker in one
room) and over MA's `sendspin` browser player (which would put playback back inside the page
that §3 deliberately moved it out of, and die with Chromium). It also takes the ALSA device as
an argument, which is what makes "phono out" a setting rather than a rewiring: the built-in
analog jack and the USB Klipsch are two device names, and `--tags audio-list` prints both.

>  **Verified on the running server.** Both `sendspin` and `local_audio` are present and
> **enabled** as player providers on 2.9.9 — along with `sonos`, `airplay`, `chromecast`,
> `dlna`, `snapcast`, `universal_group`, `sync_group` and `universal_player`. So the
> recommendation below is available today.
>
> (An earlier note here claimed the opposite, reasoning from their absence in
> `/api-docs/commands.json`. That was invalid: providers are not commands. List them with
> `config/providers`, not the command reference.)

MA's old `builtin_player` is gone; the browser web player is now a **Sendspin** client over a
WebRTC DataChannel. It is fully targetable with volume 0–100 and gets lossless FLAC on a LAN
desktop browser — but **whether it survives a page reload is unverified**, and the provider has
explicit disconnect handling. That is a real risk for a kiosk that reloads on crash.

**Use the Local Audio App (`sendspin-cli`) in Docker**, not the browser tab. It self-discovers over
mDNS, outputs straight to ALSA, persists volume in `/data/state`, reopens a vanished ALSA device
mid-stream, and exposes `SENDSPIN_HOOK_START` for re-asserting the mixer on every stream. Decisively:
it lets the **kiosk browser user have no `/dev/snd` access at all**. Fallback: Squeezelite (the only
`stable`-stage option, declares `GAPLESS_PLAYBACK`).

Do **not** use `local_audio` (retired, tombstoned) or `snapcast` (marked `unmaintained`).

### 7.3 The volume ceiling, in three layers

1. **ALSA `softvol` with a `max_dB` ceiling** on the laptop, below anything the child can reach.
   Gotcha: softvol itself needs control-device write access, so the player and the browser must run
   as **different users** — which is also what keeps `/dev/snd` away from the kiosk.
2. **A systemd timer re-asserts the mixer**, plus `SENDSPIN_HOOK_START` on every stream.
3. **MA's per-player `max_volume`**, which is a **rescale, not a clamp** — logical 0→min, 100→max —
   so the child sees a full-range control whose top is safe. `_enforce_volume_limits` additionally
   corrects changes made externally.

Recommendation: **do not run PipeWire at all** on a single-purpose old laptop. Also set
`usbcore.autosuspend=-1`.

### 7.4 Calibration

**Enable MA volume normalisation first** (default −14 LUFS) or the calibration measures nothing
repeatable. Then set the rear knob with an SPL meter at the pillow.

There is **no published standard for loudspeakers in a child's bedroom.** EN 50332 and ITU-T H.870
genuinely do not transfer — they are defined into an ear-simulator coupler that does not exist here.
The working target is **75 dBA at the pillow**, derived from NIOSH 85 dBA/8 h with a 3 dB exchange
rate. That number is derived, not quoted, and should be treated as such.

### 7.5 Open, needs an empirical test

The R-14PM's auto-on, auto-standby and input/volume memory behaviour across a power cycle is
undocumented — and an appliance that wakes on the wrong input gives the child silence. Likewise the
Sendspin web player's reload survival. `research/05` §6.5 lists six such items; each is a short test.

---

## 8. Kiosk

Debian → **XFCE** (X11) → autologin → Chromium `--kiosk --app=`, configured by `ansible/`.

**This reverses greetd + cage on Wayland**, which is what this section said until the machine
was actually built. The parent built it on XFCE, and the machine wins over the plan. The
reversal pays for itself: §4.3 puts display blanking on the host via `xset s blank` + `xset
dpms`, and **`xset` is X11-only** — under cage there would have been no `xset` to run, and the
blanking argument that section rests on had no implementation. It also settles the Wayland vs
X11 question §12 left open for the touch-quality test: it is X11.

What is kept from the cage plan: Chromium restarting always with **no start rate limit**, the
`exited_cleanly` patch, no incognito, and the udev input lock. XFCE costs a desktop session
this product does not use; it buys a surface to debug the machine from, which matters while it
is still being built. Revisit only if that session proves to cost something measurable.

- **Open question — keyboard-first conflicts with the input lock.** The plan was a
  `LIBINPUT_IGNORE_DEVICE="1"` udev rule on the keyboard and trackpad, which is the real
  lock; browser flags are cosmetic. But arrows and Enter are now the primary input, so the
  keyboard cannot simply be disabled. A laptop keyboard is also ~80 keys of which 6 matter,
  and several of the rest are escape hatches (Ctrl+Alt+F1, Alt+Tab, Super).
  - **Preferred: a USB numeric keypad, ~€15.** With NumLock off it emits exactly what this
    app needs and nothing else: `8 4 6 2` are the arrow keys, `Enter` is a double-height
    key, and `+`/`−` are oversized in their own column. No letters, no Ctrl/Alt/Super, no
    function keys, **no route to a TTY**. The laptop keyboard stays disabled at the udev
    level and the lock is unchanged.
  - **Fallback: remap at evdev level** so the built-in keyboard emits only those keycodes.
    Weaker, since it is software standing between a four-year-old and a TTY.
- The trackpad rule is unaffected and still applies.
- `cage` without `-s`: VT switching off by default.
- `HandleLidSwitch=ignore`, `NAutoVTs=0`, `ReserveVT=0`, sleep targets masked.
- `Restart=always` **and `StartLimitIntervalSec=0`** — start rate-limiting is on by default and
  will permanently give up after ~5 rapid restarts.
- Patch `exited_cleanly`/`exit_type` in Chromium's Preferences on each launch, then make it
  read-only; the flags for this were removed from source.
- `--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation`.
  Policies: `DeveloperToolsAvailability: 2`, `URLBlocklist: ["*"]` + `URLAllowlist`.
- **Never incognito** — it wipes the cover cache every reboot.
- Parent's way in: **SSH + Tailscale.** There is no key combo; the keyboard is disabled.
- **No screensaver and no locker** — purged, not disabled, so a desktop update cannot bring one
  back. XFCE's own power manager is told not to blank either: two things owning blanking means
  neither is predictable, and §4.3 gives the job to `xset`.

**Configuration is Ansible** (`ansible/`), run from the dev Mac. Four roles — base, network,
audio, kiosk. `inventory.yml` and `group_vars/kiosk.yml` hold the hostname, address, SSID and
PSK and are gitignored; the repo carries only the `.example` templates.

**The address is a DHCP reservation on the router, not a static address on the host.** The
router stays the single source of truth for the subnet, and a mistyped gateway cannot lock
anyone out of a headless machine in a bedroom. The one thing that makes that work lives in
`roles/network`: **`cloned-mac-address=permanent`**. NetworkManager randomises the WiFi MAC per
connection by default, and a reservation keyed to a MAC then never matches — the machine takes
a lease under a new identity each time and silently gets a different address. It presents as a
broken reservation and cannot be fixed from the router. The parent's settings screen shows the
reserved address next to the one the machine actually has, because a mismatch is otherwise
invisible.

**UniFi:** the kiosk gets **zero WAN access**. Allow LAN to the MA host and the speakers, deny
internet outright. Stronger than allowlisting cloud domains, and it is why the cloud Sonos API was
never an option.

---

## 9. Frontend

**Vanilla TypeScript + Vite.** Six components and four verbs; a framework is overhead carried for
a decade. Design passes via the Impeccable skills.

- **No virtualization library.** `content-visibility: auto` + `contain-intrinsic-size` (~7× initial
  render win) suffices below a couple of thousand covers.
- **Artwork lives at `metadata.images[]`, not a top-level field**, and each entry carries a
  `proxy_id`. Use `/imageproxy/<proxy_id>` and nothing else: the raw `path` is the source
  provider's own URL, can embed that provider's API key, and is flagged
  `remotely_accessible: false` — the kiosk may not even be able to reach it.
- **`explicit` lives at `metadata.explicit`**, and is frequently absent. Absent means
  unknown, never clean.
- **Request the smallest imageproxy size that covers the tile.** MA resizes to a fixed allowlist
  only — `{0, 80, 160, 256, 512, 1024}` — and rejects anything else, so "exactly the tile size" is
  not available. Never CSS-downscale a full cover: at ~4 bytes per decoded pixel that is where an
  old laptop dies.
- WebP or JPEG. **Not AVIF, not JPEG XL.**
- `loading="lazy" decoding="async"`; `Image.decode()` to pre-warm the next row.
- Workbox service worker, cache-first for art, `navigator.storage.persist()`. **Needs a secure
  origin, and the server is on another host over plain http, so by default there is neither.**
  §3.1 has the two ways out and which one to take now. Do not leave this to be discovered by a
  cold boot with black tiles in it.
- Single-target kiosk, so Chromium-only CSS is fair game: `scroll-snap`, `animation-timeline: view()`.

---

## 10. Failure behaviour

| Failure | Child sees | Parent gets |
|---|---|---|
| Speaker grouped away in the Sonos app | nothing — ungroup, then play | — |
| Speaker taken by another source | nothing — `play_media` resets the session | — |
| MA unreachable | sleepy crate, covers from cache | HA notification |
| Qobuz down / auth expired | local albums still play | HA notification |
| Chromium crash | ~2 s black, then the crate | HA notification if repeated |
| Laptop dies | Sonos path keeps playing | HA notification |

Speaker recovery: hold a persistent `/ws` connection, never poll, maintain player state from
`PLAYER_UPDATED`. Before playing, if `synced_to` is set call `players/cmd/ungroup` first. Treat
`PlayerCommandFailed` as "retry once after ungrouping". An abandoned Sonos-app session self-heals
after 60 s.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Sonos gates the LAN API.** Its Platform ToS §2(b) licenses LAN APIs *"solely for internal evaluation and testing"*; July 2025 firmware added a Connection Security → Authentication toggle. The Play:1 has **no AirPlay 2**, so that path has no middle rung. | High impact, unknown probability. 2026 has been quiet. | The Klipsch path is the real hedge. Never hardcode the target player. |
| Qobuz credentials throttled or broken (undocumented API, shared credentials, 2 req/s) | Medium | Register own `app_id`/`app_secret` if still possible; NAS files are the floor |
| MA token expires at 365 days | Certain | Diarise; alert at 30 days |
| MA in the audio path — laptop or server sleeps | Medium | Disable suspend; mains power |
| Volume ceiling mis-calibrated | **Safety** | SPL meter at the pillow; cap in software, not on the knob |
| Scope creep into a screen device | High, insidious | Four verbs. Silence at album end. Screen off at night. |

---

## 12. Build order

Development happens on macOS; the Linux laptop is a deployment target, not a dev machine.

1. MA client — connect, list albums, play one to `KID_ROOM`. Prove the whole path end to end.
2. The crate: cover grid, page flip, tap to play. **Done** — wiring it to the store (4) is
   what remains. **The crate is the wall**: three variants were prototyped and the parent chose
   A, so B (the stack) and C (the shelf) are deleted rather than kept as options. A prototype
   that still carries the alternatives after the decision is one nobody trusts the decision of.
3. Now playing: cover, transport, volume blocks, dim. **Done.**
4. SQLite + approved-set model; the crate reads from it. **Done** (`src/store/`, §5.1) — the
   store and the gate exist and are tested; wiring the prototype crate to it is part of step 2.
5. Album view: the number-line track list. **Done** — §4.2, reached with ↑↓ from now playing.
6. Admin app + review queue.
7. Curation worker: seed → suggestions → annotations → queue.
8. MQTT discovery to HA.
9. Kiosk image, lockdown, UniFi rules. **Mostly done** — `ansible/` builds the laptop end to end
   and has been applied for real; the UniFi rules and the second door (Tailscale, §8) are not.
10. Klipsch path, volume ceiling, SPL calibration.

Ship 1–3 and put it in his room. Everything after that is improvement; those three are the product.

**The gate between "done" and "in his room" is the server** — §3's `platebunken-server`, deployed
as a Docker image per §3.1. Steps 2, 3 and 5 are built and run under `vite dev` against a dev-only
plugin standing in for it. That plugin is `apply: "serve"`: it does not exist in a build, so there
is a built page today that calls `/api/speaker/*` and nothing that answers. Items 4, 6, 7 and 8
all land inside that same process. It is one piece of work and everything else queues behind it.

**Wayland vs X11 is settled: X11.** It was left open here pending a touch-and-fling test on the
actual laptop; §8 was rewritten the other way round instead, because XFCE on X11 is what was
built and because §4.3's blanking plan is `xset`, which under cage had no implementation at all.
Verify touch and fling quality in Chromium on the laptop anyway — it is still the
least-documented part of the stack — but it no longer decides anything.

---

## 13. Research

| Doc | Subject |
|---|---|
| `research/01-backend-sources-sonos.md` | Music Assistant internals, Sonos control, Qobuz |
| `research/02-prior-art-kiosk-ui.md` | Kids' players, cover-art UIs, Linux kiosk, child UX |
| `research/03-discovery-and-filtering.md` | Similar-artist APIs, AI-slop and NSBM filtering, acquisition |
| `research/04-pedagogy.md` | Numerals, literacy, and what not to teach |
| `research/05-klipsch-local-audio.md` | Klipsch R-14PM, local audio path, volume ceiling |

All claims are cited to primary sources; items that could not be verified are marked UNVERIFIED.
