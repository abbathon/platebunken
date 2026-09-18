# PROTOTYPE — the crate

**Throwaway.** Answers one question: *does browsing feel like flipping through records,
and can a 4-year-old drive it with either a mouse or a finger?*

Three structurally different crates, switchable with `?variant=`:

| Key | Name | Primary affordance | Targets per screen |
|---|---|---|---|
| `A` | Vegg (the wall) | Tap any cover directly | 9 covers + 2 flips |
| `B` | Bunken (the stack) | Flip one cover at a time, then play | 3 |
| `C` | Hylla (the shelf) | Slide a strip, play the focused cover | 1 + slide |

Run: `npm run prototype`. Arrow keys or the bottom bar switch variants.

Mock data only — no Music Assistant, no network at runtime. Covers are generated
procedurally so the prototype runs offline and ships no one else's artwork; they are
deliberately high-contrast and distinct, which is what the child actually navigates by.

**Not production.** No error handling, no tests, no persistence. The font loads from
Google Fonts, which the real kiosk cannot do — production must self-host.
