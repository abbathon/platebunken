# Brand

The mark is **the crate**: sleeves packed on a shelf, one pulled out and tipped forward mid-flip.
A pun and a description at once — *baren* is the bar, and these are bars — and the tipped sleeve
is the flip the whole product imitates. It is also what stops the mark reading as a bar chart.

Three uprights rather than five, because anything finer turns to mush in a browser tab.

| File | Use |
|---|---|
| `mark.svg` | The mark alone, `currentColor`, no field. Use this anywhere the surrounding theme should reach it. |
| `logo.svg` | Horizontal lockup, mark + wordmark, `currentColor`. |
| `favicon.svg` | The mark on an amber field, colours **baked** — a favicon renders outside the page and inherits nothing from it. |
| `favicon.ico` | 16/32/48 PNGs in an ICO container. Only for the tab. |
| `icon-*.png` | Rasters at 16, 32, 48, 180 (apple-touch) and 512. |

## Rules

- **The logo never appears in the child's interface.** There is no splash, no boot screen and no
  branding on any surface he touches — PRODUCT.md rules out all three. It lives on the browser
  tab, the parent's admin app, and the repo.
- `mark.svg` and `logo.svg` are `currentColor` and must stay that way. `favicon.svg` is the one
  that bakes colour, and it bakes amber on near-black so it holds against a light tab strip and a
  dark one alike.
- `logo.svg` sets its wordmark as live text in Archivo. Without that font it falls back to the
  system sans and the logo is slightly different. If that ever matters, convert this one file to
  outlines — do not start self-hosting a font for a mark that appears on two surfaces.

## Regenerating the rasters

The PNGs and the ICO are built from `favicon.svg` by rendering it in Chromium; there is no image
library in this project and no reason to add one. The script lives in the commit that introduced
them — it opens `favicon.svg` at each size, screenshots with a transparent background, then packs
16/32/48 into an ICO by hand (header, directory, PNG payloads).

`prototypes/crate/public/` holds **copies** of `favicon.svg`, `favicon.ico` and `icon-180.png`:
Vite serves that directory's root and cannot reach outside it. Copy them across again if the mark
changes.

## Where the name comes from

See PRODUCT.md, *Brand Commitments*. Short version: **Platebaren**, "the record bar", after the
record shop in Tromsø. The name is borrowed, not licensed, which is worth revisiting before this
repo or the product reaches anyone outside the house.
