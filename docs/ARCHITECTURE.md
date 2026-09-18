# Platebunken — design

> A record crate for a pre-reader. Browse album covers, put one on, hear it in your own room.

Working name: **Platebunken** (Norwegian, *the record stack*). Earlier working name: `metalkid`.

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
│    ├── Filesystem provider      → NAS                        │
│    ├── Sonos (S2) provider      → KID_ROOM Play:1 + others   │
│    └── local player provider    → the laptop (see §7)        │
│                                                              │
│  platebunken-server     Node/TS, small                       │
│    ├── SQLite           the crate: approvals, counts, shelves│
│    ├── MA client        WebSocket, persistent                │
│    ├── curation worker  suggestions → review queue           │
│    ├── admin API        parent's phone                       │
│    └── MQTT             HA discovery: controls + state       │
└──────────────────────────────────────────────────────────────┘
                              │ ws + http
┌───────────────────── old laptop, KID_ROOM ───────────────────┐
│  Debian minimal → greetd → cage → Chromium --kiosk           │
│    └── platebunken-ui    vanilla TS + Vite, no state         │
│  Audio out → Klipsch R-14PM (wired)                          │
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

**Client auth.** A dedicated non-admin MA user with `library.read` + `queues.control` +
`players.control` only. **The long-lived token expires in 365 days** — the docs claim ten years,
the code says otherwise. Diarise it.

---

## 4. The child's interface

Four verbs, plus two toggles. Nothing else exists.

| Verb | Rendering |
|---|---|
| Browse | Tap a cover in the crate |
| Play / pause | One large button |
| Volume | Two large buttons + a row of filled blocks |
| Skip | One large button, forward only |
| *Shuffle, repeat* | Two toggles, now-playing view only |

### 4.1 The crate

- A fixed page of covers with **page flip**, never infinite scroll. Crate-digging was flipping,
  not scrolling, and a crate has an end.
- **Append-only order.** New albums are appended, never inserted. Position `2-3` is the same album
  forever.
- **No text.** Cover art only.
- Separate shelves — **new**, **recent**, **most-played** — are *additional surfaces*, never
  reorderings of the crate.
- A **new** album appears on the new shelf, released on a trickle (a steady drip even if a dozen
  were approved at once) so there is nearly always a reason to walk over and look.

### 4.2 The album view

The track list, rendered as a number line — the best-evidenced pedagogic feature in the design.

- **One vertical column**, evenly spaced, top to bottom. Never a wheel, arc, ring, carousel or
  grid: the linear geometry carries the measured effect, not the numerals.
- Rows **≥ 96 px** tall, full width (above the 76 px floor, because adjacent rows mean a miss lands
  on a neighbour).
- Numeral **left**, ≥ 64 px, plain high-contrast sans, **tabular figures** so the column reads straight.
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
- After ~10 s the screen dims. **At night it goes fully off**, with music still playable: he must
  be able to start a record in the dark without lighting the room.
- Any input wakes it. No screensaver, no clock, no visualiser.

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

Debian minimal → greetd `[initial_session]` → **cage** → Chromium `--kiosk --app=`.

- The real lock is a **`LIBINPUT_IGNORE_DEVICE="1"` udev rule on the keyboard and trackpad.**
  Browser flags are cosmetic.
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

**UniFi:** the kiosk gets **zero WAN access**. Allow LAN to the MA host and the speakers, deny
internet outright. Stronger than allowlisting cloud domains, and it is why the cloud Sonos API was
never an option.

---

## 9. Frontend

**Vanilla TypeScript + Vite.** Six components and four verbs; a framework is overhead carried for
a decade. Design passes via the Impeccable skills.

- **No virtualization library.** `content-visibility: auto` + `contain-intrinsic-size` (~7× initial
  render win) suffices below a couple of thousand covers.
- **Request thumbnails at exactly the tile size** from MA's imageproxy. Never CSS-downscale a full
  cover — at ~4 bytes per decoded pixel that is where an old laptop dies.
- WebP or JPEG. **Not AVIF, not JPEG XL.**
- `loading="lazy" decoding="async"`; `Image.decode()` to pre-warm the next row.
- Workbox service worker, cache-first for art, `navigator.storage.persist()`. Needs a secure
  origin — serve from localhost or a local TLS cert.
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
2. The crate: cover grid, page flip, tap to play. Hard-coded album list.
3. Now playing: cover, transport, volume blocks, dim.
4. SQLite + approved-set model; the crate reads from it.
5. Album view: the number-line track list.
6. Admin app + review queue.
7. Curation worker: seed → suggestions → annotations → queue.
8. MQTT discovery to HA.
9. Kiosk image, lockdown, UniFi rules.
10. Klipsch path, volume ceiling, SPL calibration.

Ship 1–3 and put it in his room. Everything after that is improvement; those three are the product.

**Before the kiosk image is final** (step 9), verify touch and fling quality in Chromium on the
actual Linux laptop. It is the least-documented part of the stack and decides Wayland vs X11.
It does not block development, but it must not be discovered late.

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
