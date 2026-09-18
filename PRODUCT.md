# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: vanilla TypeScript + Vite, no UI framework. The product is roughly six screens and
four verbs; a framework would be overhead carried for a decade. It is a single-target kiosk
(one known Chromium on one known machine), so Chromium-only CSS is fair game and cross-browser
Baseline compatibility is irrelevant. Deliberately no virtualization library: `content-visibility:
auto` + `contain-intrinsic-size` is sufficient below a couple of thousand covers.

## Users

**Primary: one child, age 4, pre-reader, Norwegian-speaking.** He uses this alone, unsupervised,
in his own bedroom, whenever he wants — including early mornings and after bedtime. He cannot
read, cannot type, and cannot search. He has no concept of "back", "undo", "settings", "output
device", or "file". He navigates by remembering where things are on screen.

Measured constraints that govern every decision:
- Tapping an intended static target succeeds **57%** of the time at ages 4–6. Tap-and-hold: 20%.
- Children press with the full finger pad, at an angle, often with several fingers landing at once.
- Trackpad competence typically arrives around age 6.
- 4½-year-olds identify the numeral "12" at ceiling accuracy, but cannot compare two numerals
  (0.66 on "which is more, 11 or 19?", barely above chance).
- Only 26% of 4-year-olds can order the digits 1–6.

**Secondary: the parent.** Reviews suggested albums on a phone, roughly ten seconds a day, and
maintains the appliance remotely over SSH. Never present in the child's flow.

## Product Purpose

Recreate the experience of discovering music by flipping through a physical stack of album covers
— the way the parent discovered music in the 1990s — for a child too young to read.

The product is a record crate, not a music player. Browsing *is* the feature. Playback is the
reward for browsing.

**Success, at six months:** the child plays music without asking anyone, and at least once a month
plays something nobody put in front of him.

**Explicit non-goals.** Not a learning app. Not a streaming client. Not a tablet. Not a
general-purpose computer. Not a screen to look at — the screen exists to help you choose, then
gets out of the way.

## Positioning

Commercial children's audio (Yoto, Toniebox, Hörbert) sells "screen-free" as its differentiator,
while Yoto's own product ships *browse-artwork-and-choose* as its core interaction — rendered at
16×16 pixels so it can never become video. This product takes the same interaction and gives it
the resolution album art deserves, then applies the discipline the 16×16 constraint was
substituting for: four verbs, silence at the end of a record, and a screen that goes dark while
music plays.

What no neighbouring product can copy: the library is a **parent-curated crate drawn from a real
streaming catalogue**, growing by parental approval rather than by purchase of a physical token or
by an algorithm. Discovery is real, and the fence is a person.

## Operating Context

- An old laptop, permanently powered, in the child's bedroom, running a locked-down Chromium
  kiosk with keyboard and trackpad disabled at the udev level. No WAN access; LAN only.
- Audio output to powered monitors wired to the laptop, and/or a network speaker in the same room.
- Music Assistant on a separate always-on host holds the library and does playback; the laptop is
  a stateless UI that can be destroyed and replaced.
- The parent's surfaces are a phone web app and Home Assistant.
- Used in a dark bedroom at night as well as in daylight.

## Capabilities and Constraints

**The child's verbs, complete:** browse, play/pause, volume, skip forward. Plus shuffle and repeat
as toggles on the now-playing view only. Nothing else exists — no delete, no settings, no queue
editing, no search, no track-back.

**Hard interaction constraints:**
- Minimum **76 px** (≈2 cm) for every control — NN/g children's guidance, nearly double WCAG AAA.
- No text anywhere the child must read to operate the device.
- No pinch, no precise drag, nothing timed, no two-handed gestures, no long-press for anything the
  child needs.
- Dead zones along screen edges where no critical action fires.
- The crate is **append-only**: nothing the child has memorised ever moves.
- No boot, no splash, no loading state, no empty state.
- The device never asks the child a question — no quiz, prompt, reward, streak or progress, not
  optional and not behind a parent gate.

**Undecided:** whether mouse or touch is the primary input. Both will be prototyped; NN/g research
argues for touch at this age, the parent wants mouse as a deliberate skill.

## Brand Commitments

Name: **Platebunken** (Norwegian, "the record stack"). Earlier working name `metalkid`, retired for
being genre-specific and age-limited.

The household listens to metal and Norwegian hip-hop. Album art is the interface, so the product's
visual world must not compete with the covers it displays.

**Localisation: Norwegian and English on all surfaces**, from the start. The child's UI carries no
text, so this governs the admin app and notifications.

## Evidence on Hand

Five research documents in `docs/research/`, ~4,700 lines, every claim cited to a primary source
with unverifiable items explicitly marked UNVERIFIED. They cover Music Assistant internals and
Sonos control, prior art and Linux kiosk lockdown, discovery APIs and content filtering, early-years
pedagogy, and the local audio path.

There is **no existing UI, no logo, no brand assets, and no incumbent visual world.** There are no
users yet, no usage data, no testimonials. Nothing may be fabricated in place of these.

## Product Principles

1. **Reliability is the feature.** A beautiful thing that fails is worse than a plain thing that
   works. For a four-year-old, a device that disappoints twice is a device that gets abandoned.
2. **Nothing he has memorised ever moves.** Spatial position is the only index a pre-reader has.
3. **Silence is a feature.** A record ends and stops, which is what sends him back to the crate.
   Endless autoplay is the mechanism that dissolves album relationships.
4. **The child never sees an error.** Failures render as a quiet sleepy state; the parent gets the
   notification.
5. **The approval gate is an architectural boundary, not a setting.** No code path can put an album
   in front of the child that the parent has not seen.

## Accessibility & Inclusion

The primary user is a pre-literate four-year-old operating alone, which is a stricter constraint
than any published accessibility standard.

- **76 px minimum touch targets**, above WCAG 2.2 AAA's 44 px.
- **Zero text dependency** in the child's interface.
- **Assume half of all taps miss.** Every miss must be harmless and every retry instant.
- **No reliance on colour alone**, no timed interactions, no gestures requiring fine motor control.
- **Hearing safety is a design requirement, not a preference.** The volume ceiling is enforced in
  software upstream of any control the child can reach, and calibrated with an SPL meter at the
  child's pillow. No published standard covers loudspeakers in a child's bedroom; the working
  target is 75 dBA at the pillow, derived from NIOSH 85 dBA/8 h with a 3 dB exchange rate and
  labelled as derived rather than quoted.
