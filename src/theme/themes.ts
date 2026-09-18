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
 *  4. **Motion has a floor and a reason.** The frame settles when he presses a key, arriving from
 *     the direction his hand moved — that part is a reply. The tracer running its perimeter is
 *     not a reply, and it is here because the parent asked for a frame that is alive rather than
 *     a box. It is bounded instead of banned: only on the selected sleeve, never on the screen
 *     he leaves playing, never faster than `TRACER_FLOOR_MS`, and gone entirely under
 *     `prefers-reduced-motion`, which also restores a solid ring so selection survives it.
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
  /**
   * Period of the light that runs the frame's perimeter, ms. 0 turns it off.
   *
   * **Never below TRACER_FLOOR_MS.** This is a bright moving edge roughly forty centimetres
   * from a small child's face, for as long as he is choosing. Slow enough and it is a lit
   * object; fast enough and it is a flicker. There is no published guidance for this exact
   * case, so the floor is derived and deliberately conservative, and a test enforces it.
   */
  tracerMs: number;
}

/** See FrameSpec.tracerMs. Derived, not quoted from a standard. */
export const TRACER_FLOOR_MS = 1800;

/**
 * A theme's own mark: a longship, a ringed planet, a moon. `0 0 64 64`, `currentColor`, and it
 * has to survive being drawn at 40px, because that is the size it appears at on the picker disc.
 *
 * This is the part a pre-reader actually uses. He cannot read "Vikingtid" and an orange dot does
 * not mean vikings to anyone; a longship does. The emblem is how he picks.
 */
export type Emblem = string;

/**
 * The backdrop. Fills the space the covers do not, behind everything, at a few percent opacity.
 *
 * This is where a theme is allowed to be a world rather than a palette — and it is the only
 * place, because it is the one surface that never competes with artwork: covers are opaque and
 * sit on top of it. `MOTIF_MAX_OPACITY` keeps it a texture rather than a picture.
 */
export interface Motif {
  /** `0 0 240 120`, `currentColor`, drawn to be cropped — it is scaled to cover. */
  svg: string;
  opacity: number;
}

/** The shape of a chrome button's plate. Decorative only: see §4.6 on why it never clips
 *  the button itself, which stays a full 76px box whatever shape is painted on it. */
export type Plate = "round" | "shield" | "hex";

/** Backdrops above this stop being texture and start being a picture behind the covers. */
export const MOTIF_MAX_OPACITY = 0.08;

export interface Theme {
  id: string;
  /** Parent-facing, Norwegian. Never shown to the child; there is no text in his UI. */
  label: string;
  /** One line on what it is for, for the admin app. */
  note: string;
  tokens: Record<TokenName, string>;
  frame: FrameSpec;
  emblem: Emblem;
  motif: Motif;
  plate: Plate;
}

/** A plain corner bracket with a notch. The quietest ornament: two lines and a cut. */
const BRACKET = `
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">
  <path d="M32 1H5.5A4.5 4.5 0 0 0 1 5.5V32"/>
  <path d="M32 7.5H12"/>
  <path d="M7.5 32V12"/>
</g>`;

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


// ── emblems ──────────────────────────────────────────────────────────────────
// Silhouettes, not line drawings. At 40px on a picker disc a stroked drawing turns to mush,
// and this is the one graphic in the product a pre-reader has to recognise on sight.

/**
 * A longship.
 *
 * The first draft put the sail down on the deck with four narrow bars and short prow curls, and
 * at 40px it read as a basket. What makes the silhouette a viking ship is the pair of stern and
 * prow posts curling high above the hull, and a sail that is plainly a sail — clear of the deck,
 * with gaps you can see. That is the whole design brief for this shape: it has to survive being
 * small, on a disc, for someone who cannot read the word underneath it.
 *
 * The second draft kept the stripes and lost anyway: the posts and the sail occupied the same
 * band, so they merged into one mass and it read as a crown. What works is separation — posts
 * out at the edges, a solid sail well inside them, and air between the two. Stripes are detail
 * a 40px drawing cannot spend.
 */
const SHIP = `
<g fill="currentColor">
  <path d="M5 40h54c-3 10-13 16-27 16S8 50 5 40Z"/>
  <path d="M5 40C0 30 1 19 9 12l4 5C7 22 6.5 30 10.5 40Z"/>
  <path d="M59 40c5-10 4-21-4-28l-4 5c6 5 6.5 13 2.5 23Z"/>
  <rect x="30.5" y="10" width="3" height="30"/>
  <rect x="20" y="16" width="24" height="18"/>
</g>`;

/** A ringed planet and a star. */
const PLANET = `
<g fill="currentColor">
  <circle cx="28" cy="32" r="15"/>
  <path d="M50 10.5 52.2 17l6.5 2.2-6.5 2.2L50 28l-2.2-6.6-6.5-2.2 6.5-2.2Z"/>
</g>
<ellipse cx="28" cy="34" rx="27" ry="8" fill="none" stroke="currentColor" stroke-width="3.2"
         transform="rotate(-20 28 34)"/>`;

/** A crescent and a star: the quietest possible mark, which is this theme's whole argument. */
const MOON = `
<g fill="currentColor">
  <path d="M39 5a27 27 0 1 0 20 45A22.5 22.5 0 0 1 39 5Z"/>
  <path d="M18 8 20 14l6 2-6 2-2 6-2-6-6-2 6-2Z"/>
</g>`;

// ── motifs ───────────────────────────────────────────────────────────────────
// Drawn to be cropped: these are scaled to cover the screen at a few percent opacity, so
// composition matters less than even texture. Covers are opaque and sit on top of them.

/** Waves, with a ship riding them. */
const SEA = `
<g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
  <path d="M-10 88q20-14 40 0t40 0 40 0 40 0 40 0 40 0"/>
  <path d="M-10 102q20-14 40 0t40 0 40 0 40 0 40 0 40 0"/>
  <path d="M-10 116q20-14 40 0t40 0 40 0 40 0 40 0 40 0"/>
</g>
<g fill="currentColor" transform="translate(86 22) scale(0.9)">${SHIP}</g>`;

/** A starfield and the edge of something large. */
const STARS = (() => {
  // Deterministic: a fixed lattice jittered by an integer hash, so the field is even and the
  // file does not change between builds.
  const dots: string[] = [];
  for (let i = 0; i < 64; i++) {
    const h = (i * 2654435761) >>> 0;
    const x = ((i % 16) * 15 + (h % 13)).toFixed(0);
    const y = (Math.floor(i / 16) * 30 + ((h >>> 8) % 27)).toFixed(0);
    const r = (0.9 + ((h >>> 16) % 5) * 0.42).toFixed(2);
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}"/>`);
  }
  return `<g fill="currentColor">${dots.join("")}</g>
<circle cx="238" cy="14" r="52" fill="none" stroke="currentColor" stroke-width="2.5"/>
<ellipse cx="238" cy="16" rx="76" ry="16" fill="none" stroke="currentColor" stroke-width="2"
         transform="rotate(-18 238 16)"/>`;
})();

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
    frame: { corner: BRACKET, cornerPx: 26, ringPx: 5, offsetPx: 6, settleMs: 150, tracerMs: 4200 },
    emblem: MOON,
    // No backdrop at all. This theme's argument is that the covers carry the room, and a
    // backdrop would be arguing with itself.
    motif: { svg: "", opacity: 0 },
    plate: "round",
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
    // Slower and heavier than natt: the frame should land like a lid, not a blink, and the
    // light travelling its edge should read as an ember crawling along carved oak.
    frame: { corner: KNOTWORK, cornerPx: 34, ringPx: 6, offsetPx: 8, settleMs: 200, tracerMs: 5200 },
    emblem: SHIP,
    motif: { svg: SEA, opacity: 0.055 },
    plate: "shield",
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
    // The fastest tracer of the three, still well above the floor.
    frame: { corner: STARBURST, cornerPx: 30, ringPx: 5, offsetPx: 7, settleMs: 140, tracerMs: 2600 },
    emblem: PLANET,
    motif: { svg: STARS, opacity: 0.06 },
    plate: "hex",
  },
];

/**
 * Plate shapes, as clip paths.
 *
 * These are painted on a layer *inside* the button, never applied to the button itself: a
 * clip-path on the control would clip its hit area too, and §4.5 puts a hard 76px floor under
 * every target because measured tap accuracy at this age is 57%. A theme may change what a
 * control looks like. It may never change what it is possible to hit.
 */
const PLATE_CLIP: Record<Plate, string> = {
  round: "circle(50%)",
  shield: "polygon(0% 0%, 100% 0%, 100% 58%, 50% 100%, 0% 58%)",
  hex: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
};

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
  vars["--frame-tracer"] = `${theme.frame.tracerMs}ms`;
  vars["--motif-opacity"] = String(theme.motif.opacity);
  vars["--btn-plate"] = PLATE_CLIP[theme.plate];
  return vars;
}

/** The corner ornament as a standalone SVG string, or "" for themes that have none. */
export function cornerSvg(theme: Theme): string {
  if (!theme.frame.corner) return "";
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${theme.frame.corner}</svg>`;
}

/** The theme's mark. The thing he points at when he wants vikings. */
export function emblemSvg(theme: Theme): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${theme.emblem}</svg>`;
}

/** The backdrop, scaled to cover and cropped. "" for themes that have none. */
export function motifSvg(theme: Theme): string {
  if (!theme.motif.svg) return "";
  return `<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" `
    + `focusable="false">${theme.motif.svg}</svg>`;
}
