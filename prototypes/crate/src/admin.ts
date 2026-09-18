// PROTOTYPE — the parent's settings, on the device.
//
// This is the one surface in the product that is made of text, so it is the one that has to be
// bilingual: PRODUCT.md commits to Norwegian and English on every parent surface from the start,
// and the child's UI carries no text, which means this section is what that commitment is about.
//
// Nothing here persists. A prototype must not depend on persistence, and on the kiosk every one
// of these lands in `.env`, the store, or an MQTT topic Home Assistant owns — never in the page.
import { THEMES, type Theme } from "./theme";
import { NUMERAL_FACES } from "../../../src/theme/fonts.ts";

/**
 * **This is a child gate, not security.** Four digits compared in front-end JavaScript stops a
 * four-year-old and nobody else. The actual boundary is elsewhere and always was: the kiosk
 * lockdown (§8), and the fact that no credential for Music Assistant, Qobuz or the store is ever
 * in this page. Do not let this grow into something anyone is asked to trust.
 */
const PROTOTYPE_PIN = "1234";

export type Lang = "nb" | "en";

export interface Settings {
  lang: Lang;
  theme: string;
  numeralFace: string;
  volumeCeiling: number;
  volumeStart: number;
  output: "wired" | "network";
  sources: { listenbrainz: boolean; lastfm: boolean; deezer: boolean; charts: boolean };
  tricklePerDay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "nb",
  theme: "natt",
  numeralFace: "archivo",
  volumeCeiling: 50,
  volumeStart: 15,
  output: "wired",
  sources: { listenbrainz: true, lastfm: true, deezer: true, charts: false },
  tricklePerDay: 1,
};

type Dict = Record<string, [nb: string, en: string]>;
const STRINGS: Dict = {
  title:        ["Innstillinger", "Settings"],
  locked:       ["Tast inn kode", "Enter code"],
  wrong:        ["Feil kode", "Wrong code"],
  close:        ["Lukk", "Close"],
  tabSound:     ["Lyd", "Sound"],
  tabSources:   ["Kilder", "Sources"],
  tabShelves:   ["Hyller", "Shelves"],
  tabLook:      ["Utseende", "Appearance"],
  tabLang:      ["Språk", "Language"],
  ceiling:      ["Volumtak", "Volume ceiling"],
  ceilingHelp:  ["Håndheves oppstrøms for alt barnet kan nå. Kalibreres med lydmåler ved puten — mål 75 dBA.",
                 "Enforced upstream of anything the child can reach. Calibrated with an SPL meter at the pillow — target 75 dBA."],
  startVol:     ["Startvolum", "Starting volume"],
  output:       ["Utgang", "Output"],
  outWired:     ["Kablet høyttaler", "Wired speaker"],
  outNetwork:   ["Nettverkshøyttaler", "Network speaker"],
  outputHelp:   ["To uavhengige veier med ulike feilmoduser. Den kablede overlever at nettet faller.",
                 "Two independent paths with different failure modes. The wired one survives the network going down."],
  curation:     ["Forslagskilder", "Suggestion sources"],
  curationHelp: ["Forslag havner alltid i kø for godkjenning. Ingenting når barnet uten at et menneske har sett det.",
                 "Suggestions always land in the review queue. Nothing reaches the child without a person having seen it."],
  charts:       ["Lister (Norge, Europa)", "Charts (Norway, Europe)"],
  chartsHelp:   ["Den eneste kilden som ikke er avledet av det forelderen allerede liker.",
                 "The only source that is not derived from what the parent already likes."],
  trickle:      ["Nye plater per dag", "New albums per day"],
  trickleHelp:  ["Godkjente plater slippes på drypp, så det nesten alltid er en grunn til å gå bort og se.",
                 "Approved albums are released on a trickle, so there is nearly always a reason to walk over and look."],
  theme:        ["Tema", "Theme"],
  themeHelp:    ["Standardtemaet. Barnet kan bytte selv med knappene til venstre.",
                 "The default theme. The child can switch it himself with the discs on the left."],
  numerals:     ["Tallskrift", "Numeral face"],
  numeralsHelp: ["Sporlisten er 64 px tall et barn lærer å lese. Prøv begge foran ham før du bestemmer.",
                 "The track list is 64px numerals a child is learning to read. Try both in front of him before deciding."],
  language:     ["Språk på foreldreflatene", "Language on the parent surfaces"],
  langHelp:     ["Barnets grensesnitt har ingen tekst, så dette gjelder bare her og i varslinger.",
                 "The child's interface carries no text, so this governs only this screen and notifications."],
  notStored:    ["Ingenting lagres i prototypen. På kiosken havner dette i .env, databasen eller Home Assistant.",
                 "Nothing is stored in the prototype. On the kiosk these land in .env, the store, or Home Assistant."],
};

const t = (k: string, lang: Lang) => STRINGS[k]?.[lang === "nb" ? 0 : 1] ?? k;

const el = (html: string): HTMLElement => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface AdminContext {
  settings: Settings;
  unlocked: boolean;
  tab: string;
  themes: readonly Theme[];
  onUnlock: (ok: boolean) => void;
  onTab: (tab: string) => void;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

/** The PIN pad. On-screen digits, because §8's kiosk has a numeric keypad and no letters. */
function gate(ctx: AdminContext): HTMLElement {
  const lang = ctx.settings.lang;
  const root = el(`<section class="stage admin admin--gate">
    <div class="gate">
      <div class="gate__label">${esc(t("locked", lang))}</div>
      <div class="gate__dots"></div>
      <div class="gate__pad"></div>
    </div>
  </section>`);
  let entry = "";
  const dots = root.querySelector(".gate__dots")!;
  const paint = (bad = false) => {
    dots.replaceChildren();
    dots.classList.toggle("gate__dots--bad", bad);
    for (let i = 0; i < 4; i++) dots.append(el(`<span class="gate__dot" data-on="${i < entry.length ? 1 : 0}"></span>`));
  };
  const press = (d: string) => {
    if (entry.length >= 4) return;
    entry += d;
    paint();
    if (entry.length === 4) {
      const ok = entry === PROTOTYPE_PIN;
      setTimeout(() => { if (!ok) { entry = ""; paint(true); } ctx.onUnlock(ok); }, 160);
    }
  };
  const pad = root.querySelector(".gate__pad")!;
  for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""]) {
    if (!d) { pad.append(el(`<span></span>`)); continue; }
    const b = el(`<button class="btn gate__key" aria-label="${d}">${d}</button>`);
    b.addEventListener("click", () => press(d));
    pad.append(b);
  }
  paint();
  return root;
}

const row = (label: string, help: string, control: HTMLElement): HTMLElement => {
  const r = el(`<div class="set">
    <div class="set__text"><div class="set__label">${esc(label)}</div>${help ? `<p class="set__help">${esc(help)}</p>` : ""}</div>
    <div class="set__control"></div>
  </div>`);
  r.querySelector(".set__control")!.append(control);
  return r;
};

function choice<T extends string | number>(
  options: { value: T; label: string }[], current: T, onPick: (v: T) => void,
): HTMLElement {
  const g = el(`<div class="chips" role="group"></div>`);
  for (const o of options) {
    const b = el(`<button class="chip" aria-pressed="${o.value === current}">${esc(o.label)}</button>`);
    if (o.value === current) b.dataset.on = "1";
    b.addEventListener("click", () => onPick(o.value));
    g.append(b);
  }
  return g;
}

function slider(value: number, min: number, max: number, onSet: (n: number) => void): HTMLElement {
  const wrap = el(`<div class="slider"><input type="range" min="${min}" max="${max}" value="${value}" aria-label="${value}"><output>${value}</output></div>`);
  const input = wrap.querySelector("input")!;
  const out = wrap.querySelector("output")!;
  input.addEventListener("input", () => { out.textContent = input.value; });
  input.addEventListener("change", () => onSet(Number(input.value)));
  return wrap;
}

function toggle(label: string, on: boolean, onSet: (v: boolean) => void): HTMLElement {
  const b = el(`<button class="chip" aria-pressed="${on}">${esc(label)}</button>`);
  if (on) b.dataset.on = "1";
  b.addEventListener("click", () => onSet(!on));
  return b;
}

function panel(ctx: AdminContext): HTMLElement {
  const s = ctx.settings, lang = s.lang;
  const tabs = [
    ["sound", t("tabSound", lang)],
    ["sources", t("tabSources", lang)],
    ["shelves", t("tabShelves", lang)],
    ["look", t("tabLook", lang)],
    ["lang", t("tabLang", lang)],
  ] as const;

  const root = el(`<section class="stage admin">
    <header class="admin__head">
      <h1 class="admin__title">${esc(t("title", lang))}</h1>
      <button class="btn admin__close" aria-label="${esc(t("close", lang))}">✕</button>
    </header>
    <div class="admin__body"><nav class="admin__tabs"></nav><div class="admin__pane"></div></div>
    <p class="admin__foot">${esc(t("notStored", lang))}</p>
  </section>`);

  root.querySelector(".admin__close")!.addEventListener("click", ctx.onClose);
  const nav = root.querySelector(".admin__tabs")!;
  for (const [id, label] of tabs) {
    const b = el(`<button class="admin__tab" aria-pressed="${id === ctx.tab}">${esc(label)}</button>`);
    if (id === ctx.tab) b.dataset.on = "1";
    b.addEventListener("click", () => ctx.onTab(id));
    nav.append(b);
  }

  const pane = root.querySelector(".admin__pane")!;
  const set = ctx.onChange;

  if (ctx.tab === "sound") {
    pane.append(row(t("ceiling", lang), t("ceilingHelp", lang), slider(s.volumeCeiling, 10, 100, (n) => set({ volumeCeiling: n }))));
    pane.append(row(t("startVol", lang), "", slider(s.volumeStart, 0, 60, (n) => set({ volumeStart: n }))));
    pane.append(row(t("output", lang), t("outputHelp", lang), choice(
      [{ value: "wired" as const, label: t("outWired", lang) }, { value: "network" as const, label: t("outNetwork", lang) }],
      s.output, (v) => set({ output: v }))));
  } else if (ctx.tab === "sources") {
    const g = el(`<div class="chips"></div>`);
    g.append(toggle("ListenBrainz", s.sources.listenbrainz, (v) => set({ sources: { ...s.sources, listenbrainz: v } })));
    g.append(toggle("Last.fm", s.sources.lastfm, (v) => set({ sources: { ...s.sources, lastfm: v } })));
    g.append(toggle("Deezer", s.sources.deezer, (v) => set({ sources: { ...s.sources, deezer: v } })));
    pane.append(row(t("curation", lang), t("curationHelp", lang), g));
    pane.append(row(t("charts", lang), t("chartsHelp", lang),
      toggle(s.sources.charts ? "På / On" : "Av / Off", s.sources.charts, (v) => set({ sources: { ...s.sources, charts: v } }))));
  } else if (ctx.tab === "shelves") {
    pane.append(row(t("trickle", lang), t("trickleHelp", lang),
      choice([0, 1, 2, 3].map((n) => ({ value: n, label: String(n) })), s.tricklePerDay, (v) => set({ tricklePerDay: v }))));
  } else if (ctx.tab === "look") {
    pane.append(row(t("theme", lang), t("themeHelp", lang), choice(
      ctx.themes.map((th) => ({ value: th.id, label: th.label })), s.theme, (v) => set({ theme: v }))));
    pane.append(row(t("numerals", lang), t("numeralsHelp", lang), choice(
      NUMERAL_FACES.map((f) => ({ value: f.id, label: f.label })), s.numeralFace, (v) => set({ numeralFace: v }))));
    const face = NUMERAL_FACES.find((f) => f.id === s.numeralFace)!;
    pane.append(el(`<div class="numeral-preview">
      <div class="numeral-preview__digits">1234567890</div>
      <p class="numeral-preview__note">${esc(face.note)}</p>
    </div>`));
  } else {
    pane.append(row(t("language", lang), t("langHelp", lang), choice(
      [{ value: "nb" as const, label: "Norsk" }, { value: "en" as const, label: "English" }],
      s.lang, (v) => set({ lang: v }))));
  }

  return root;
}

export const adminView = (ctx: AdminContext): HTMLElement => (ctx.unlocked ? panel(ctx) : gate(ctx));
export { THEMES };
