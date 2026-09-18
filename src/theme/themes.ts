/**
 * Themes — the chrome around the covers, and nothing else.
 *
 * A four-year-old who is currently deep into vikings should be able to have a viking record
 * player. That is worth building. But PRODUCT.md is explicit that "album art is the interface,
 * so the product's visual world must not compete with the covers it displays", so a theme is
 * bounded hard:
 *
 *  1. **Chrome only.** Background, frame, buttons, page furniture. A theme never overlays,
 *     tints, crops, filters or decorates the artwork. The sleeve is untouchable.
 *  2. **The parent sets it.** The child's device never asks him a question (PRODUCT.md), so
 *     there is no theme picker in the crate. It is config, later an admin-app setting.
 *  3. **A theme carries no spatial information.** It changes no position, no layout, no target
 *     size, no key mapping. That is what makes themes the one thing in this product that can be
 *     changed freely: switching from `natt` to `vikingtid` cannot move anything he has
 *     memorised, because a theme holds nothing to move.
 *  4. **Motion is a reply, not a performance.** The frame reacts when he presses a key. A ring
 *     that pulses on its own in a dark bedroom is a night-light and a visualiser, both of which
 *     §4.3 rules out. `breath` exists for themes where slow drift is the point, defaults off,
 *     and yields to `prefers-reduced-motion`.
 *
 * This module is pure data. It touches no DOM, so it survives the prototype it is first used in.
 */

/** Every token every theme must define. The completeness test is the point of the list. */
export const TOKENS = [
  "ink", "ink-dim",
  "bg", "bg-raised", "bg-sunk",
  "edge",
  "glow", "glow-deep",
  "on-glow", "on-glow-dim",
  "frame-ring", "frame-orn", "frame-halo",
  "focus-soft",
] as const;

export type TokenName = (typeof TOKENS)[number];

export interface FrameSpec {
  /**
   * Corner ornament for the selected sleeve, drawn once for the TOP-LEFT corner in a
   * `0 0 32 32` viewBox and mirrored into the other three. `currentColor` throughout, so it
   * takes `frame-orn` without the theme restating it.
   *
   * Corners are placed, never stretched: a frame drawn as one scaled SVG would distort its
   * knotwork the moment a tile is not square-ish, and the crate's tile size is viewport-derived.
   */
  corner: string | null;
  /** Rendered size of each corner ornament, px. */
  cornerPx: number;
  /** Thickness of the ring itself, px. */
  ringPx: number;
  /** Gap between sleeve edge and ring, px. Keeps the frame off the art. */
  offsetPx: number;
  /** Duration of the settle when the selection lands, ms. 0 disables it. */
  settleMs: number;
  /** Free-running halo drift. See rule 4 — leave this off for a bedroom. */
  breath: boolean;
}

export interface Theme {
  id: string;
  /** Parent-facing, Norwegian. Never shown to the child; there is no text in his UI. */
  label: string;
  /** One line on what it is for, for the admin app. */
  note: string;
  tokens: Record<TokenName, string>;
  frame: FrameSpec;
}

/**
 * Carved knotwork: two nested brackets, a trefoil interlace at the elbow, two rivets.
 * Stroked rather than filled so it stays legible at 34px and does not read as a blob.
 */
const KNOTWORK = `
<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M32 2.6H10.5A7.9 7.9 0 0 0 2.6 10.5V32"/>
  <path d="M32 9.6H14A4.4 4.4 0 0 0 9.6 14V32"/>
  <path d="M6.4 6.4a5.4 5.4 0 0 1 7.6 0 5.4 5.4 0 0 1-7.6 7.6 5.4 5.4 0 0 1 0-7.6Z"/>
</g>
<circle cx="21.5" cy="6.1" r="1.6" fill="currentColor"/>
<circle cx="6.1" cy="21.5" r="1.6" fill="currentColor"/>`;

/** A thin rule and a four-point star. Sparse on purpose: space is mostly empty. */
const STARBURST = `
<path d="M32 3.2H6.4A3.2 3.2 0 0 0 3.2 6.4V32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
<path d="M11 4.4 12.5 9.5 17.6 11 12.5 12.5 11 17.6 9.5 12.5 4.4 11 9.5 9.5Z" fill="currentColor"/>`;

export const THEMES: readonly Theme[] = [
  {
    id: "natt",
    label: "Natt",
    note: "The default. Least visual world, most album art. Start here.",
    tokens: {
      "ink": "#f4f1ea", "ink-dim": "#a49e93",
      "bg": "#0a0a0c", "bg-raised": "#141317", "bg-sunk": "#050506",
      "edge": "#2a2830",
      "glow": "#ffb84d", "glow-deep": "#7a4a06",
      "on-glow": "#17120a", "on-glow-dim": "#4a3a12",
      "frame-ring": "#ffb84d", "frame-orn": "#ffb84d", "frame-halo": "rgb(255 184 77 / 0.10)",
      "focus-soft": "#241f14",
    },
    // No ornament at all: this theme's whole argument is that the covers carry the room.
    frame: { corner: null, cornerPx: 0, ringPx: 6, offsetPx: 6, settleMs: 150, breath: false },
  },
  {
    id: "vikingtid",
    label: "Vikingtid",
    note: "Carved oak, iron and ember. For a child who is currently deep into vikings.",
    tokens: {
      "ink": "#f3ecdd", "ink-dim": "#9d9183",
      "bg": "#0b0a08", "bg-raised": "#17130d", "bg-sunk": "#050403",
      "edge": "#3b2f21",
      "glow": "#e4552b", "glow-deep": "#6d2410",
      "on-glow": "#190a04", "on-glow-dim": "#5e2a14",
      "frame-ring": "#e4552b", "frame-orn": "#d8a24a", "frame-halo": "rgb(228 85 43 / 0.12)",
      "focus-soft": "#2a150c",
    },
    // Slower and heavier than natt: the frame should land like a lid, not a blink.
    frame: { corner: KNOTWORK, cornerPx: 34, ringPx: 6, offsetPx: 8, settleMs: 200, breath: false },
  },
  {
    id: "romfart",
    label: "Romfart",
    note: "Deep space. Proves a theme is a system, not a special case. Its drift is opt-in.",
    tokens: {
      "ink": "#eef1ff", "ink-dim": "#949cb8",
      "bg": "#05060d", "bg-raised": "#101426", "bg-sunk": "#02030a",
      "edge": "#242a4a",
      "glow": "#5ce1e6", "glow-deep": "#0d5b60",
      "on-glow": "#031516", "on-glow-dim": "#10474a",
      "frame-ring": "#5ce1e6", "frame-orn": "#b9c6ff", "frame-halo": "rgb(92 225 230 / 0.12)",
      "focus-soft": "#0c2b2d",
    },
    // The one theme with breath on, so the flag is exercised rather than theoretical.
    // For a bedroom I would still turn it off; see rule 4.
    frame: { corner: STARBURST, cornerPx: 30, ringPx: 5, offsetPx: 7, settleMs: 140, breath: true },
  },
];

export const DEFAULT_THEME_ID = "natt";

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

/** The theme as CSS custom properties, ready to set on an element. Pure: no DOM here. */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const t of TOKENS) vars[`--${t}`] = theme.tokens[t];
  vars["--frame-ring-w"] = `${theme.frame.ringPx}px`;
  vars["--frame-offset"] = `${theme.frame.offsetPx}px`;
  vars["--frame-corner"] = `${theme.frame.cornerPx}px`;
  vars["--frame-settle"] = `${theme.frame.settleMs}ms`;
  return vars;
}

/** The corner ornament as a standalone SVG string, or "" for themes that have none. */
export function cornerSvg(theme: Theme): string {
  if (!theme.frame.corner) return "";
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${theme.frame.corner}</svg>`;
}
