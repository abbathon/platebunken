# Brand

The mark is **the crate**: sleeve edges packed on a shelf, and one pulled out and turned to face
you — a square with the record knocked out of it. That is both what flipping through a crate
actually shows you and what this product is: cover art, chosen by looking.

The first draft drew five fat bars and read as a shelf of **books**, which is exactly what a
nine-unit-wide edge on a sixty-four box is. A real sleeve seen edge-on is nearer a tenth of that,
so the edges are 3.5 units and there are five of them, and the faced sleeve carries the signal
that thin lines alone cannot.

The trade is real and worth knowing: thin edges merge below about 24 px. What survives at 16 is
the silhouette — a block of lines, then a square with a hole. The hole closes first and the square
outlives it, which is the right way round.

| File | Use |
|---|---|
| `mark.svg` | The mark alone, `currentColor`, no field. Use this anywhere the surrounding theme should reach it. |
| `logo.svg` | Horizontal lockup, mark + wordmark, `currentColor`. |
| `favicon.svg` | The mark on an amber field, colours **baked** — a favicon renders outside the page and inherits nothing from it. |
| `favicon.ico` | 16/32/48 PNGs in an ICO container. Only for the tab. |
| `icon-*.png` | Rasters at 16, 32, 48, 180 (apple-touch) and 512. |

## Rules

- **The mark sits small at the top of the child's screens**, beside the way in to settings. An
  earlier rule here said it never appeared on any surface he touches; the parent reversed that.
  What it protected still holds: no splash, no boot screen, nothing that delays him.
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

See PRODUCT.md, *Brand Commitments*. Short version: **Platebunken**, "the record stack". It was
briefly **Platebaren**, after the record shop in Tromsø, and changed back — the shop stays the
inspiration rather than the name, which also means nobody has to ask whose it is.
