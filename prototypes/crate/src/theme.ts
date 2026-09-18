// PROTOTYPE glue for the theme system. The themes themselves live in src/theme/themes.ts,
// which is pure data and outlives this prototype; only the DOM work belongs here.
import { THEMES, cornerSvg, themeById, themeVars, type Theme } from "../../../src/theme/themes.ts";

export { THEMES, type Theme };

/**
 * On the kiosk this comes from config, set by the parent. In the prototype it is a query
 * parameter so a theme can be tried in front of the child in two seconds — which is the
 * only way to find out whether he actually wants vikings.
 */
export const currentTheme = (): Theme => themeById(new URLSearchParams(location.search).get("theme"));

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
}

/**
 * The frame that marks the selected sleeve.
 *
 * It sits outside the artwork and never over it: the cover is the interface, and a theme is
 * only ever the room the cover hangs in. Corners are four placed ornaments rather than one
 * stretched SVG, so knotwork stays knotwork at any tile size.
 *
 * Every frame is rendered, not just the focused one. That is deliberate — re-rendering the
 * grid on each keypress means a CSS transition has nothing to transition from, so the settle
 * is a keyframe animation that runs when a frame first appears as focused.
 */
export function frameEl(t: Theme): HTMLElement {
  const corner = cornerSvg(t);
  const corners = corner
    ? (["tl", "tr", "bl", "br"] as const).map((c) => `<i class="frame__c frame__c--${c}">${corner}</i>`).join("")
    : "";
  const div = document.createElement("div");
  div.className = "frame";
  div.setAttribute("aria-hidden", "true");
  if (t.frame.breath) div.dataset.breath = "1";
  div.innerHTML = corners;
  return div;
}

/**
 * Where the selection came from, so the frame travels in the direction the hand moved.
 * Motion tied to input is feedback; motion that runs on its own is a visualiser.
 */
export function setEntryDirection(slot: HTMLElement, dx: number, dy: number, px = 26): void {
  slot.style.setProperty("--from-x", `${-dx * px}px`);
  slot.style.setProperty("--from-y", `${-dy * px}px`);
}
