// The parent's settings, on the device.
//
// This is the one surface in the product that is made of text, so it is the one that has to be
// bilingual: PRODUCT.md commits to Norwegian and English on every parent surface from the start,
// and the child's UI carries no text, which means this section is what that commitment is about.
//
// These persist in the store now, through /api/settings. On the kiosk every one
// of these lands in `.env`, the store, or an MQTT topic Home Assistant owns — never in the page.
import { THEMES, type Theme } from "./theme";
import { NUMERAL_FACES } from "../../theme/fonts.ts";
import { MARKS, markById, type MarkId } from "./marks";

/**
 * **This is a child gate, not security.** Four digits compared in front-end JavaScript stops a
 * four-year-old and nobody else. The actual boundary is elsewhere and always was: the kiosk
 * lockdown (§8), and the fact that no credential for Music Assistant, Qobuz or the store is ever
 * in this page. Do not let this grow into something anyone is asked to trust.
 *
 * The digits come from the server (`GATE_PIN`), so this screen and the review queue at /admin
 * cannot drift to different codes. The fallback is for a page served by an older server.
 */
const GATE_PIN_FALLBACK = "1234";

export type Lang = "nb" | "en";

export interface Settings {
  lang: Lang;
  theme: string;
  numeralFace: string;
  /** Which shape marks a track he keeps choosing — the algorithmic mark. See marks.ts. */
  favouriteMark: MarkId;
  /** Which shape marks a track he was told is a favourite — the manual mark. */
  manualFavouriteMark: MarkId;
  /** Marks off entirely — some children chase a mark, and this is the way back out. */
  favouritesShown: boolean;
  /**
   * Read-only, and sent by the server. It is a hearing-safety limit set from an SPL
   * measurement at the pillow, so it lives in the deployment's .env and not behind a
   * four-digit gate. This screen used to show a local default of 50 whatever the server
   * actually enforced, which is worse than showing nothing.
   */
  volumeCeiling: number;
  volumeStart: number;
  sources: { listenbrainz: boolean; lastfm: boolean; deezer: boolean; charts: boolean };
  /** The chosen speaker's display name, cached server-side when it was picked. */
  playerName?: string | null;
  /** Which of those the server can actually act on. Absent means assume all, for old servers. */
  sourcesAvailable?: Partial<Record<"listenbrainz" | "lastfm" | "deezer" | "charts", boolean>>;
  /** The child gate's digits, from the server so the two parent surfaces share one code. */
  gatePin?: string;
  tricklePerDay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "nb",
  theme: "natt",
  numeralFace: "archivo",
  favouriteMark: "heart",
  manualFavouriteMark: "bolt",
  favouritesShown: true,
  volumeCeiling: 50,
  volumeStart: 15,
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
  favMark:      ["Merke for yndlingsspor", "Favourite track mark"],
  favMarkHelp:  ["Spor han velger igjen og igjen får et merke i tallrekka. Utledet av hva han faktisk spiller — det finnes ingen «lik»-knapp, og det skal det ikke gjøre. Merket flytter aldri noe.",
                 "Tracks he chooses again and again get a mark in the number line. Derived from what he actually plays \u2014 there is no 'like' button and there must not be one. The mark never moves anything."],
  favOff:       ["Vis merker", "Show marks"],
  ceilingRO:    ["Settes ved utrulling, fra lydmåling ved puten. Endres i .env.",
                 "Set at deploy time from an SPL measurement at the pillow. Change it in .env."],
  tabLang:      ["Språk", "Language"],
  ceiling:      ["Volumtak", "Volume ceiling"],
  ceilingHelp:  ["Håndheves oppstrøms for alt barnet kan nå. Kalibreres med lydmåler ved puten — mål 75 dBA.",
                 "Enforced upstream of anything the child can reach. Calibrated with an SPL meter at the pillow — target 75 dBA."],
  startVol:     ["Startvolum", "Starting volume"],
  tabDevice:    ["Enhet", "Device"],
  speaker:      ["Høyttaler", "Speaker"],
  speakerHelp:  ["Hvor musikken kommer ut. To uavhengige veier med ulike feilmoduser: nettverkshøyttaleren overlever at laptopen dør, den kablede overlever at nettet faller.",
                 "Where the music comes out. Two independent paths with different failure modes: the network speaker survives the laptop dying, the wired one survives the network going down."],
  speakerNone:  ["Fant ingen spillere. Music Assistant svarer ikke.",
                 "No players found. Music Assistant is not answering."],
  speakerWait:  ["Henter spillere …", "Fetching players …"],
  speakerOn:    ["Aktiv nå", "Active now"],
  speakerPick:  ["Ingen høyttaler er valgt ennå — trykk på en for å velge. Uten den er krata stum.",
                 "No speaker is selected yet — tap one to choose. Without it the crate is silent."],
  laptopMissing:["Laptopen dukker ikke opp før squeezelite kjører OG slimproto er slått på i Music Assistant.",
                 "The laptop will not appear until squeezelite is running AND slimproto is enabled in Music Assistant."],
  devIp:        ["IP-adresse", "IP address"],
  devServer:    ["Tjener", "Server"],
  devIpHelp:    ["Reservert på ruteren, ikke satt på maskinen — ruteren eier subnettet. Stemmer ikke adressen, tok ikke reservasjonen.",
                 "Reserved on the router, not set on the machine — the router owns the subnet. If the address does not match, the reservation did not take."],
  devIpOk:      ["Stemmer med reservasjonen", "Matches the reservation"],
  devIpBad:     ["Stemmer IKKE med reservasjonen", "Does NOT match the reservation"],
  devMa:        ["Music Assistant", "Music Assistant"],
  curation:     ["Forslagskilder", "Suggestion sources"],
  curationHelp: ["Forslag havner alltid i kø for godkjenning. Ingenting når barnet uten at et menneske har sett det.",
                 "Suggestions always land in the review queue. Nothing reaches the child without a person having seen it."],
  notBuilt:     ["Ikke bygget", "Not built"],
  notBuiltHelp: ["Bare kildene som er bygget kan skrus av og på. De andre står her fordi de er planlagt — de gjør ingenting ennå.",
                 "Only the sources that exist can be switched. The others are listed because they are planned; they do nothing yet."],
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
  notStored:    ["Lagres i databasen. Volumtaket settes ved utrulling og kan ikke endres her.",
                 "Stored in the database. The volume ceiling is set at deploy time and cannot be changed here."],
};

const t = (k: string, lang: Lang) => STRINGS[k]?.[lang === "nb" ? 0 : 1] ?? k;

const el = (html: string): HTMLElement => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** One output Music Assistant offers. `name` is a room label — runtime only, never stored. */
export interface PlayerOption {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  current: boolean;
}

/** The machine the interface is being served from. */
export interface DeviceInfo {
  hostname: string;
  client: string | null;
  serverAddresses: string[];
  expected: string | null;
  matches: boolean | null;
  maHost: string;
}

export interface AdminContext {
  settings: Settings;
  unlocked: boolean;
  tab: string;
  themes: readonly Theme[];
  /** null while still loading; an empty array means MA answered with nothing. */
  players: PlayerOption[] | null;
  device: DeviceInfo | null;
  onPickPlayer: (id: string) => void;
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
      const ok = entry === (ctx.settings.gatePin || GATE_PIN_FALLBACK);
      setTimeout(() => { if (!ok) { entry = ""; paint(true); } ctx.onUnlock(ok); }, 160);
    }
  };
  const pad = root.querySelector(".gate__pad")!;
  for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""]) {
    if (!d) { pad.append(el(`<span></span>`)); continue; }
    // The digit is wrapped in its own span, not a bare text node: `.btn::after` is an
    // absolutely-positioned face layer that otherwise paints over in-flow text with no
    // z-index to lift it above it — the same bug already fixed for `.btn svg`, see style.css.
    const b = el(`<button class="btn gate__key" aria-label="${d}"><span class="gate__key-digit">${d}</span></button>`);
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

/**
 * A source the server cannot act on yet.
 *
 * Drawn as a fact rather than a control: no press state, no click handler, and disabled so it
 * cannot be tabbed into and flipped. The alternative — a toggle that stores a value nothing
 * reads — is exactly the bug this screen is being fixed for.
 */
function unavailable(label: string, note: string): HTMLElement {
  const b = el(`<button class="chip" disabled aria-disabled="true" title="${esc(note)}">${esc(label)}</button>`);
  b.dataset.unavailable = "1";
  return b;
}

/**
 * Which speaker the music comes out of.
 *
 * A list rather than chips: Music Assistant answers with every player on the network, and a
 * dozen of them wrap into an unreadable block. Grouped by provider so the Sonos speakers sit
 * together and the laptop — once squeezelite is running — is obvious by not being one.
 */
function playerPicker(ctx: AdminContext): HTMLElement {
  const lang = ctx.settings.lang;
  const wrap = el(`<div class="players"></div>`);
  if (ctx.players === null) {
    wrap.append(el(`<p class="set__help">${esc(t("speakerWait", lang))}</p>`));
    return wrap;
  }
  if (ctx.players.length === 0) {
    wrap.append(el(`<p class="set__help">${esc(t("speakerNone", lang))}</p>`));
    return wrap;
  }
  /**
   * Say when nothing is chosen, rather than showing a list with nothing marked.
   *
   * An unmarked list is indistinguishable from a list whose marker is too subtle to see, and
   * the first person to use this could not tell which speaker was active. It is also the
   * state a fresh deployment starts in — `PLAYER_ID_PRIMARY` is deliberately empty until the
   * volume ceiling is measured — so it is the FIRST thing a parent meets, not an edge case.
   */
  if (!ctx.players.some((p) => p.current)) {
    wrap.append(el(`<p class="set__help set__help--warn">${esc(t("speakerPick", lang))}</p>`));
  }

  for (const p of ctx.players) {
    const b = el(`<button class="player" aria-pressed="${p.current}">
      <span class="player__text">
        <span class="player__name">${esc(p.name)}</span>
        <span class="player__meta">${esc(p.provider)}${p.model ? ` · ${esc(p.model)}` : ""}</span>
      </span>
      <span class="player__now">${esc(t("speakerOn", lang))}</span>
    </button>`);
    if (p.current) {
      b.dataset.on = "1";
      // The selected speaker can be anywhere in a list this long. Put it in front of them.
      queueMicrotask(() => b.scrollIntoView({ block: "nearest" }));
    }
    b.addEventListener("click", () => ctx.onPickPlayer(p.id));
    wrap.append(b);
  }
  // The laptop is not a player until two separate things are true, and neither is visible
  // from this screen. Say so here rather than leaving the parent hunting for a missing row.
  if (!ctx.players.some((p) => p.provider === "slimproto")) {
    wrap.append(el(`<p class="set__help">${esc(t("laptopMissing", lang))}</p>`));
  }
  return wrap;
}

/**
 * The machine itself. Read-only — nothing here is a control.
 *
 * The address is the useful part: it is reserved on the router rather than set on the host,
 * so the only way to know the reservation actually took is to compare what was reserved with
 * what the machine has. That comparison exists nowhere else, and its absence is invisible.
 */
function devicePane(ctx: AdminContext): HTMLElement {
  const lang = ctx.settings.lang;
  const d = ctx.device;
  const pane = el(`<div class="device"></div>`);
  if (!d) {
    pane.append(el(`<p class="set__help">—</p>`));
    return pane;
  }
  const line = (label: string, value: string, state?: "ok" | "bad") =>
    el(`<div class="set">
      <div class="set__text"><div class="set__label">${esc(label)}</div></div>
      <div class="set__control"><span class="device__value"${state ? ` data-state="${state}"` : ""}>${esc(value)}</span></div>
    </div>`);

  // The address that matters is THIS machine's — the one showing the page — not the server's.
  // The server moved to the Docker host, and its own address is a bridge address that has
  // nothing to do with the kiosk's reservation. The request came from here, so the server
  // reads it off the connection.
  pane.append(line(t("devIp", lang), d.client ?? "—", d.matches === null ? undefined : d.matches ? "ok" : "bad"));
  if (d.expected) {
    pane.append(el(`<p class="set__help">${esc(t("devIpHelp", lang))}</p>`));
    pane.append(el(`<p class="set__help">${esc(d.expected)} — ${esc(d.matches ? t("devIpOk", lang) : t("devIpBad", lang))}</p>`));
  }
  pane.append(line(t("devServer", lang), `${d.hostname}${d.serverAddresses.length ? ` · ${d.serverAddresses.join(", ")}` : ""}`));
  pane.append(line(t("devMa", lang), d.maHost || "—"));
  return pane;
}

function panel(ctx: AdminContext): HTMLElement {
  const s = ctx.settings, lang = s.lang;
  const tabs = [
    ["sound", t("tabSound", lang)],
    ["sources", t("tabSources", lang)],
    ["shelves", t("tabShelves", lang)],
    ["look", t("tabLook", lang)],
    ["device", t("tabDevice", lang)],
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
    // A fact, not a control. The slider that used to be here read 50 no matter what the
    // server enforced, which made the one safety number in the product the least trustworthy
    // thing on the screen.
    pane.append(row(t("ceiling", lang), t("ceilingHelp", lang),
      el(`<span class="device__value">${s.volumeCeiling}</span>`)));
    pane.append(el(`<p class="set__help">${esc(t("ceilingRO", lang))}</p>`));
    pane.append(row(t("startVol", lang), "", el(`<span class="device__value">${s.volumeStart}</span>`)));
    pane.append(row(t("speaker", lang), t("speakerHelp", lang), playerPicker(ctx)));
  } else if (ctx.tab === "sources") {
    /**
     * Only the sources the server can actually act on are controls. The rest are drawn as
     * "not built yet", because a toggle that stores a value nothing reads is a lie the parent
     * has no way of catching — and this screen has now shipped two of those.
     *
     * `sourcesAvailable` comes from the server, so this list cannot drift from what the
     * curation worker really does.
     */
    const can = s.sourcesAvailable ?? { listenbrainz: true, lastfm: true, deezer: true, charts: true };
    const notYet = t("notBuilt", lang);
    const g = el(`<div class="chips"></div>`);
    const src = (key: "listenbrainz" | "lastfm" | "deezer", label: string) =>
      can[key] === false
        ? unavailable(label, notYet)
        : toggle(label, s.sources[key], (v) => set({ sources: { ...s.sources, [key]: v } }));

    g.append(src("listenbrainz", "ListenBrainz"));
    g.append(src("lastfm", "Last.fm"));
    g.append(src("deezer", "Deezer"));
    pane.append(row(t("curation", lang), t("curationHelp", lang), g));
    if (Object.values(can).some((v) => v === false)) {
      pane.append(el(`<p class="set__help">${esc(t("notBuiltHelp", lang))}</p>`));
    }
    pane.append(row(t("charts", lang), t("chartsHelp", lang),
      can.charts === false
        ? unavailable(t("notBuilt", lang), notYet)
        : toggle(s.sources.charts ? "På / On" : "Av / Off", s.sources.charts,
            (v) => set({ sources: { ...s.sources, charts: v } }))));
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

    // The favourite mark. Shown as the shapes themselves rather than a list of names: the
    // parent is choosing a picture, and a row of words is not the thing being chosen.
    pane.append(row(t("favOff", lang), "",
      toggle(s.favouritesShown ? "På / On" : "Av / Off", s.favouritesShown, (v) => set({ favouritesShown: v }))));
    if (s.favouritesShown) {
      const picker = el(`<div class="marks"></div>`);
      for (const m of MARKS) {
        const name = m.label[lang === "nb" ? 0 : 1];
        const b = el(`<button class="marks__opt" aria-pressed="${m.id === s.favouriteMark}" aria-label="${esc(name)}">
          <span class="marks__glyph">${m.svg ?? `<span class="marks__bar"></span>`}</span>
          <span class="marks__name">${esc(name)}</span>
        </button>`);
        if (m.id === s.favouriteMark) b.dataset.on = "1";
        b.addEventListener("click", () => set({ favouriteMark: m.id }));
        picker.append(b);
      }
      pane.append(row(t("favMark", lang), t("favMarkHelp", lang), picker));
      pane.append(el(`<p class="set__help">${esc(markById(s.favouriteMark).note[lang === "nb" ? 0 : 1])}</p>`));
    }
  } else if (ctx.tab === "device") {
    pane.append(devicePane(ctx));
  } else {
    pane.append(row(t("language", lang), t("langHelp", lang), choice(
      [{ value: "nb" as const, label: "Norsk" }, { value: "en" as const, label: "English" }],
      s.lang, (v) => set({ lang: v }))));
  }

  return root;
}

export const adminView = (ctx: AdminContext): HTMLElement => (ctx.unlocked ? panel(ctx) : gate(ctx));
export { THEMES };
