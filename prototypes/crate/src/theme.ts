// PROTOTYPE glue for the theme system. The themes themselves live in src/theme/themes.ts,
// which is pure data and outlives this prototype; only the DOM work belongs here.
import { THEMES, cornerSvg, themeById, themeVars, type Theme } from "../../../src/theme/themes.ts";

export { THEMES, type Theme };

/** On the kiosk the starting theme comes from config; here it is a query parameter. */
export const themeFromUrl = (): Theme => themeById(new URLSearchParams(location.search).get("theme"));

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
}

/**
 * The frame that marks the selected sleeve.
 *
 * It sits outside the artwork and never over it: the cover is the interface, and a theme is
 * only ever the room the cover hangs in. Four layers, in this order:
 *
 *   1. a static ring, dim but solid — the legibility floor, and all that is left when motion
 *      is off, because selection must survive every setting;
 *   2. the tracer, a light running the perimeter, speed set per theme and floored in themes.ts;
 *   3. corner ornaments, four placed SVGs so knotwork stays knotwork at any tile size;
 *   4. a soft halo.
 *
 * Every slot renders a frame, not just the focused one. That is deliberate — re-rendering the
 * grid on each keypress means a CSS transition has nothing to transition from, so the settle
 * is a keyframe animation that runs when a frame first appears as focused.
 */
export function frameEl(t: Theme): HTMLElement {
  const div = document.createElement("div");
  div.className = "frame";
  div.setAttribute("aria-hidden", "true");

  if (t.frame.tracerMs > 0) {
    const rail = document.createElement("span");
    rail.className = "frame__rail";
    div.append(rail);
  }

  const corner = cornerSvg(t);
  if (corner) {
    div.insertAdjacentHTML("beforeend",
      (["tl", "tr", "bl", "br"] as const).map((c) => `<i class="frame__c frame__c--${c}">${corner}</i>`).join(""));
  }
  return div;
}

/**
 * Where the selection came from, so the frame travels in the direction the hand moved.
 * Motion tied to input is feedback; motion that runs on its own has to earn its place.
 */
export function setEntryDirection(slot: HTMLElement, dx: number, dy: number, px = 26): void {
  slot.style.setProperty("--from-x", `${-dx * px}px`);
  slot.style.setProperty("--from-y", `${-dy * px}px`);
}

/**
 * The theme picker, in the child's crate.
 *
 * PRODUCT.md says the device never asks the child a question, and a picker looks like one. It
 * is built so it is not:
 *
 * - **No mode.** Three discs, always visible, always in the same corner. Nothing opens, nothing
 *   closes, nothing waits for an answer. There is no state in which the crate is unavailable.
 * - **No text**, ever. Each disc is its own theme's colours — the thing it does, shown.
 * - **In the dead zone.** §4.5 puts dead zones along the screen edges because children press
 *   with the whole finger pad. The theme picker is the ideal occupant: it is the one control
 *   in this product where a stray press costs nothing at all, so a miss here is free.
 * - **Fixed forever.** Top-left, in every crate variant, clear of the page-flip buttons. It
 *   never moves, so it never disturbs what he has memorised.
 *
 * It is a fifth verb, and the smallest possible one: the device looks different and nothing
 * else changes.
 */
export function themePicker(current: Theme, onPick: (t: Theme) => void): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "picker";
  nav.setAttribute("aria-label", "Tema");
  for (const t of THEMES) {
    const b = document.createElement("button");
    b.className = "picker__dot";
    b.type = "button";
    b.setAttribute("aria-label", t.label);
    b.setAttribute("aria-pressed", String(t.id === current.id));
    if (t.id === current.id) b.dataset.on = "1";
    // The disc wears the theme rather than describing it: its background, its ring, its accent.
    b.style.setProperty("--dot-bg", t.tokens.bg);
    b.style.setProperty("--dot-ring", t.tokens["frame-ring"]);
    b.style.setProperty("--dot-glow", t.tokens.glow);
    b.addEventListener("click", () => onPick(t));
    nav.append(b);
  }
  return nav;
}
