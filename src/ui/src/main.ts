// The crate — the child's interface.
//
// This began as three crates on one route: A the wall, B the stack, C the shelf. The question
// was which one a four-year-old could actually drive. It is answered — **A, the wall** — so B
// and C are gone rather than kept around as options. A codebase that still carries the
// alternatives after the decision is one nobody trusts the decision of.
import { enableCoverCache, loadCrate, loadSettings, recordPlay, saveSettings, type Album, type Crate } from "./store";
import { markSvg } from "./marks";
import { coverSvg } from "./cover";
import { THEMES, applyTheme, emblemSvg, frameEl, setEntryDirection, themeFromUrl, themePicker, type Theme } from "./theme";
import { DEFAULT_SETTINGS, adminView, type Settings } from "./admin";
import { numeralFace, numeralVars } from "../../theme/fonts.ts";
import { speaker, speakerConfig, speakerPlayers, deviceInfo,
  type PlayerOption, type DeviceInfo } from "./speaker";

// ── icons: drawn, one weight, never glyphs or emoji ──────────────
const ICON = {
  play:  `<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>`,
  next:  `<svg viewBox="0 0 24 24"><path d="M6 5.5v13a1 1 0 0 0 1.53.85L16 13.9V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.1L7.53 4.65A1 1 0 0 0 6 5.5Z"/></svg>`,
  left:  `<svg viewBox="0 0 24 24"><path d="M15.2 3.8 7 12l8.2 8.2 1.6-1.6L10.2 12l6.6-6.6z"/></svg>`,
  right: `<svg viewBox="0 0 24 24"><path d="m8.8 3.8 8.2 8.2-8.2 8.2-1.6-1.6L13.8 12 7.2 5.4z"/></svg>`,
  home:  `<svg viewBox="0 0 24 24"><path d="M4 9.5 12 3l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>`,
  menu:  `<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z"/></svg>`,
  // The mark, small. brand/mark.svg is the source; this is its geometry inlined so the page
  // needs no asset and the mark takes the theme's colour.
  logo:  `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><rect x="3" y="50" width="58" height="4.5" rx="1.5"/><rect x="5" y="17" width="3.5" height="33" rx="1"/><rect x="10.5" y="17" width="3.5" height="33" rx="1"/><rect x="16" y="17" width="3.5" height="33" rx="1"/><rect x="21.5" y="17" width="3.5" height="33" rx="1"/><rect x="27" y="17" width="3.5" height="33" rx="1"/><path fill-rule="evenodd" transform="rotate(-6 34 50)" d="M34 23h27v27H34z M47.5 29.9a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2z"/></g></svg>`,
  minus: `<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg>`,
  // Shelf marks. Learned by position first and shape second, never by name.
  crate: `<svg viewBox="0 0 24 24"><path d="M3 5h3v14H3zM8 5h3v14H8zM13 5h3v14h-3zM18.2 5.6l2.6.8-3.9 12.6-2.6-.8z"/></svg>`,
  star:  `<svg viewBox="0 0 24 24"><path d="m12 2 2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.3 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5z"/></svg>`,
  again: `<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 7.5 10.6l-1.9-.7A6 6 0 1 1 12 6v3l4.5-4L12 1z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 21S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.6C20.5 15.4 12 21 12 21Z"/></svg>`,
  plus:  `<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>`,
};

// ── state. What is on screen; never what is true. ───────────────────
//
// This block used to say "in memory only; this must not depend on persistence." That
// stopped being true when the crate started coming from the store: what he owns, where it
// sits and what he has played are all persisted now, and none of them are in here. What is
// left is genuinely screen state — which shelf, which cursor, which page — and losing it on
// a reload costs him nothing he had memorised.
//
// `now` is what is PLAYING. `view` is what is ON SCREEN. They were one thing, which meant the
// crate had no way to know a record was running and could not mark the sleeve it came from —
// and a four-year-old who walks away and comes back does not hold that in his head.
type View = { name: "crate" } | { name: "playing" } | { name: "admin" };
type Shelf = "crate" | "new" | "recent" | "played";

const state = {
  view: { name: "crate" } as View,
  now: null as { album: Album; track: number } | null,
  /** Which surface is showing. Shelves are ADDITIONAL surfaces, never reorderings (§4.1). */
  shelf: "crate" as Shelf,
  /**
   * A cursor per shelf. Leaving the crate to look at the new shelf and coming back must not
   * cost him his place — position is the only index he has.
   */
  cursors: { crate: 0, new: 0, recent: 0, played: 0 } as Record<Shelf, number>,

  // The recent and most-played shelves used to live here, in page memory, and reset on every
  // reload. They are the store's now: `CRATE.recent` and `CRATE.played`, built from the play
  // log, so they survive the nightly reboot that used to empty them.
  page: 0,          // A
  cursor: 0,        // B and C, and the focused album in A
  focusTrack: 1,    // focused row in the number line
  playing: false,
  volume: 3,        // of 7 blocks

  // Direction of the last move, so the selection frame arrives from where the hand came.
  from: { x: 0, y: 0 },
  lastPage: 0,      // the page the crate was showing on the previous render
  lastFlipAt: 0,    // timestamp of the last page flip, to tell a deliberate flip from a scrub
  settings: { ...DEFAULT_SETTINGS } as Settings,
  admin: { unlocked: false, tab: "sound" },
  /** Parent-surface data, fetched only when the settings screen opens. null = not loaded. */
  players: null as PlayerOption[] | null,
  device: null as DeviceInfo | null,
};

const PER_PAGE = 9;
const COLS = 3;
const VOL_STEPS = 7;

/**
 * The crate, from the store and from nowhere else.
 *
 * `null` means the store could not be reached, and the page renders §10's sleepy state and
 * keeps trying. There is deliberately no fallback data: the old loader fell back to a mock
 * set of twenty albums nobody had approved, which on the kiosk would have put them in front
 * of the child the first time the server hiccuped. An empty screen is a bad moment. The wrong
 * albums is the one failure this whole product is built to prevent.
 */
let CRATE: Crate | null = null;

/**
 * Consecutive failures. The last known crate is held through the first few, because the
 * commonest reason this call fails is a deploy: the container restarts, three fetches miss,
 * and it is back. A screen that blinks to sleep every time the server is redeployed is a
 * worse screen than one that waits — the covers are already warm and he may not even look up.
 *
 * Three misses is about thirty seconds. Past that it is not a restart, and the sleepy state is
 * the honest answer.
 */
let misses = 0;

async function fetchCrate(): Promise<void> {
  try {
    CRATE = await loadCrate();
    misses = 0;
  } catch (e) {
    misses++;
    console.warn(`[crate] ${(e as Error).message} (miss ${misses})`);
    if (misses >= 3) CRATE = null;
  }
}

await fetchCrate();

/**
 * Keep trying, quietly, forever.
 *
 * The kiosk boots before the server is necessarily up, and a child standing in front of a
 * sleepy screen cannot press reload — there is no reload, and there is no keyboard shortcut
 * that reaches one. Ten seconds is often enough that a server coming back is a ten-second
 * wait, and rare enough to be invisible.
 */
const asleep = () => !CRATE || CRATE.slots.length === 0;

setInterval(() => {
  const was = asleep();
  void fetchCrate().then(() => {
    // Only redraw on the transition, in either direction. A re-render mid-flip interrupts the
    // riffle, and a re-render while he is choosing moves the frame under his hand.
    if (was === asleep()) return;
    if (!asleep()) warmCovers();
    render();
  });
}, 10_000);

/**
 * The speaker, if there is one. `configured: false` (no player, host or token in .env) leaves
 * the page silent rather than half-wired.
 *
 * The starting volume comes from .env, mapped into blocks, so what he sees on the rail before
 * he has touched anything is what the room will actually do. VOLUME_CEILING is enforced on the
 * server; the blocks are only ever a fraction of it.
 */
/**
 * Covers that survive a reboot. §9 wants this and §3.1 explains why it might not exist: on a
 * plain-http origin from another host the browser refuses a service worker outright, and warm
 * covers are the only thing standing between a held-down arrow key and a grid of black squares.
 */
enableCoverCache();

const SPEAKER = await speakerConfig();

/**
 * Settings, from the store.
 *
 * They used to start from a hardcoded default every load, so a kiosk that reboots nightly
 * forgot the theme, the language and the numeral face every morning — and the volume ceiling
 * shown here was a local 50 whatever the server actually enforced, which made the one
 * safety-critical number in the product the least trustworthy thing on the screen.
 */
{
  const stored = await loadSettings();
  if (stored) state.settings = { ...state.settings, ...(stored as Partial<Settings>) };
}

if (SPEAKER?.configured && SPEAKER.ceiling > 0) {
  state.volume = Math.max(0, Math.min(VOL_STEPS, Math.round((SPEAKER.start / SPEAKER.ceiling) * VOL_STEPS)));
}

/**
 * Everything the crate holds, gaps included.
 *
 * `?all=1` is gone with the snapshot it belonged to. There is no "whole library" left to fall
 * back to — the store holds the approved set and nothing else, so the crate IS the curated set
 * by construction rather than by a filter that anyone could remove later.
 */
const slots = (): (Album | null)[] => CRATE?.slots ?? [];
const albums = (): Album[] => slots().filter((a): a is Album => !!a);

/**
 * Warm every sleeve into the browser cache up front, small size first.
 * The crate must never show a black square: a child navigating with a held-down arrow key
 * moves faster than the network, and an empty tile is indistinguishable from a broken one.
 * On the kiosk this becomes a service worker doing the same thing across reboots.
 */
function warmCovers(): void {
  const which = tileSize();
  for (const a of albums()) {
    if (!a.cover) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = a.cover[which];
  }
}
warmCovers();

// The theme is chrome only: background, frame, buttons. It never touches the artwork, and
// it carries no position, so changing it cannot move anything the child has memorised.
// That is what makes it safe to hand him the switch.
let THEME = themeFromUrl();
applyTheme(THEME);

/**
 * The numeral face, applied as custom properties the track list reads.
 *
 * `?font=` is here so they can be flipped in front of the child in seconds; the parent's real
 * control is in settings, under Appearance. All three faces are self-hosted (public/fonts/),
 * because the kiosk has no WAN — a webfont link worked on every machine except the one the
 * face is being chosen for.
 */
function applyNumeralFace(id: string): void {
  for (const [k, v] of Object.entries(numeralVars(numeralFace(id)))) {
    document.documentElement.style.setProperty(k, v);
  }
}
state.settings.numeralFace = numeralFace(new URLSearchParams(location.search).get("font")).id;
applyNumeralFace(state.settings.numeralFace);

function setTheme(t: Theme): void {
  if (t.id === THEME.id) return;
  THEME = t;
  applyTheme(t);
  // replaceState, not a reload: the crate must not blink, and he must not lose his place.
  const u = new URL(location.href);
  u.searchParams.set("theme", t.id);
  history.replaceState(null, "", u);
  render();
}

/**
 * The shelves — §4.1.
 *
 * "Separate shelves — new, recent, most-played — are *additional surfaces*, never reorderings
 * of the crate." That is the whole rule. The crate's own order is append-only and untouchable;
 * a shelf is a different window onto the same albums, with its own order and its own cursor.
 *
 * Each shelf is capped at one page. A shelf you can get lost in is just a second crate, and
 * the point of a shelf is that it is a short answer to a question — what is new, what did I
 * just play, what do I play most.
 *
 * `new` is the tail of the crate reversed, which is exact rather than approximate: the crate
 * is append-only, so the last albums added are the newest by construction, and the trickle
 * decides what has arrived.
 *
 * *recent* and *most-played* now come from the store, not from page memory. They used to reset
 * on every reload, which on a kiosk that reboots nightly meant both were empty every morning —
 * a rail slot that is permanently inert teaches nothing except that it does not work.
 */
const SHELF_SIZE = PER_PAGE;

function shelfAlbums(shelf: Shelf): (Album | null)[] {
  switch (shelf) {
    // The crate keeps its gaps. A withdrawn slot stays empty forever, which is what holds
    // every position after it exactly where he memorised it.
    case "crate":
      return slots();
    // The shelves do not: a gap there names nothing and answers no question.
    case "new":
      return albums().slice(-SHELF_SIZE).reverse();
    case "recent":
      return CRATE?.recent ?? [];
    case "played":
      return CRATE?.played ?? [];
  }
}

/**
 * The shelf rail: which surface he is looking at.
 *
 * Four fixed slots, right edge, every screen, forever. A shelf with nothing on it keeps its
 * slot and goes inert rather than disappearing — a rail that grows as shelves fill would move
 * the marks he has already learned, and spatial position is the only index a pre-reader has.
 * A dim, visibly different slot is a worse control than a live one and a far better one than
 * a rail that rearranges itself.
 */
const SHELVES: { id: Shelf; icon: string; label: string }[] = [
  { id: "crate",  icon: ICON.crate, label: "Bunken" },
  { id: "new",    icon: ICON.star,  label: "Nytt" },
  { id: "recent", icon: ICON.again, label: "Nylig spilt" },
  { id: "played", icon: ICON.heart, label: "Mest spilt" },
];

function shelfRail(): HTMLElement {
  const rail = el(`<nav class="rail rail--right" aria-label="Hyller"></nav>`);
  for (const sh of SHELVES) {
    const empty = shelfAlbums(sh.id).every((a) => !a);
    const b = el(`<button class="btn shelf-btn" aria-label="${sh.label}" aria-pressed="${sh.id === state.shelf}">${sh.icon}</button>`);
    if (sh.id === state.shelf) b.dataset.on = "1";
    if (empty) { b.dataset.empty = "1"; b.toggleAttribute("disabled", true); }
    else b.addEventListener("click", () => setShelf(sh.id));
    rail.append(b);
  }
  return rail;
}

/**
 * What the crate is currently showing. Everything downstream reads this.
 *
 * It may contain nulls — see `shelfAlbums`. Callers must render a null as an empty tile and
 * must never compact the array.
 */
const shown = (): (Album | null)[] => shelfAlbums(state.shelf);

function setShelf(next: Shelf): void {
  if (next === state.shelf) return;
  state.cursors[state.shelf] = state.cursor;
  state.shelf = next;
  state.cursor = Math.min(state.cursors[next], Math.max(0, shelfAlbums(next).length - 1));
  state.lastPage = Math.floor(state.cursor / PER_PAGE);
  state.from = { x: 0, y: 0 };
  state.view = { name: "crate" };
  render();
}

const app = document.getElementById("app")!;

const el = (html: string): HTMLElement => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
/**
 * The crate tile is about 374 CSS px wide, so the 512 px `sm` render is short of the ~748
 * device pixels a 2x screen asks for and the sleeve goes soft — in a product whose entire
 * argument is that album art deserves the resolution. The kiosk laptop is 1x and unaffected,
 * but anything shown to him on a retina screen is not.
 */
// A function declaration, not a const: warmCovers() runs at module top level, above this
// point, and a const here would be in its temporal dead zone.
function tileSize(): "sm" | "lg" { return devicePixelRatio > 1 ? "lg" : "sm"; }

const art = (a: Album, which: "sm" | "lg"): string =>
  a.cover
    // NOT lazy. Holding an arrow key outruns lazy loading and leaves black squares where
    // sleeves should be. Only nine are on screen and they are already in the warm cache.
    ? `<img src="${a.cover[which]}" alt="" decoding="async" draggable="false">`
    : coverSvg(a); // no artwork in MA — the gap should be visible, not a broken tile

/**
 * A cover whose image fails to load falls back to the procedural one rather than leaving a
 * blank tile. The kiosk has no WAN and MA can be mid-restart; a hole in the crate is worse
 * than a plain sleeve, because a hole is not tappable and the child cannot report a bug.
 */
function withImageFallback(host: HTMLElement, a: Album): void {
  const img = host.querySelector("img");
  if (!img) return;
  img.addEventListener("error", () => { host.innerHTML = coverSvg(a); host.dataset.artFailed = "1"; }, { once: true });
}

/**
 * A sleeve in its slot. The slot, not the button, carries focus and the lift, so the frame
 * travels with the cover instead of peeling off it.
 */
const coverEl = (a: Album, onPlay: (a: Album) => void, which: "sm" | "lg" = tileSize()): HTMLElement => {
  const b = el(`<button class="cover" aria-label="${esc(a.artist)} – ${esc(a.title)}">${art(a, which)}</button>`);
  withImageFallback(b, a);
  b.addEventListener("click", () => onPlay(a));
  const slot = el(`<div class="slot"></div>`);
  slot.append(b, frameEl(THEME));
  /**
   * The sleeve a record is currently coming from.
   *
   * He plays something, wanders off, comes back — and until now the crate told him nothing
   * about which one was running. He is four; he will not be holding it. A solid bar under the
   * sleeve, never a ring, so it cannot be confused with the selection frame, and never over
   * the artwork. §4.2 marks the playing track the same way and for the same reason: a solid
   * block of colour, not a pulse, not a glow, not an animation.
   */
  if (state.now?.album.id === a.id) slot.dataset.nowPlaying = "1";
  return slot;
};

/**
 * A withdrawn album's slot.
 *
 * §5.1: "A withdrawn album leaves its slot empty forever." The parent can take a record back,
 * but the crate must not flow up into the gap — that would move every position after it, and
 * spatial position is the only index a pre-reader has. One empty tile is cheap; re-flowing
 * costs him everything he has memorised.
 *
 * So it is drawn as a slot, not skipped: the frame still travels through it, it still takes a
 * press, and the press does nothing. It reads as a record that is out, which is exactly what
 * it is — the same thing an empty sleeve in a real crate tells you.
 */
const emptySlot = (): HTMLElement => {
  const slot = el(`<div class="slot slot--empty"><div class="cover cover--empty" aria-hidden="true"></div></div>`);
  slot.append(frameEl(THEME));
  return slot;
};

/**
 * What is selected, in words, along the bottom edge.
 *
 * Deliberately not for the child. He cannot read it and never needs to — the frame tells him
 * what is selected, and this only ever agrees with the frame. It is the same move the album
 * view already makes with track titles: small, dim, off to one side, and non-functional, so it
 * is there for whoever is standing next to him without asking anything of him.
 *
 * It lives in the bottom gutter, which §4.5 keeps clear of critical actions anyway, and it is
 * always rendered even when empty so the line below the crate never changes height.
 */
function caption(a: Album | null | undefined): HTMLElement {
  const bar = el(`<p class="caption" aria-hidden="true"></p>`);
  if (!a) return bar;
  bar.append(el(`<span class="caption__artist">${esc(a.artist.toUpperCase())}</span>`));
  bar.append(el(`<span class="caption__title">${esc(a.title)}</span>`));
  if (a.year) bar.append(el(`<span class="caption__year">${a.year}</span>`));
  return bar;
}

/**
 * The top bar: the mark, and the way in to the parent's settings.
 *
 * PRODUCT.md said the logo never appears in the child's interface — no splash, no boot screen,
 * no branding on any surface he touches. The parent overruled that, so it is here and the rule
 * is rewritten rather than left contradicting the code.
 *
 * The menu button is deliberately BELOW the 76px floor, at 44. That floor exists so the child
 * can hit the controls he needs; this is the one control he must not hit, and the same logic
 * that sets a minimum for the others sets a maximum for this. A stray press still costs
 * nothing — it opens a keypad he cannot pass, with the home target he already knows sitting in
 * its usual corner, and an idle return behind that.
 */
function topbar(): HTMLElement {
  // Mark and wordmark as one lockup, sharing a colour and an opacity so they read as a single
  // object rather than a picture next to a word. He cannot read it; it is not for him.
  const bar = el(`<div class="topbar"><span class="topbar__logo">${ICON.logo}<span class="topbar__word">Platebunken</span></span>
    <button class="topbar__menu" aria-label="Innstillinger / Settings">${ICON.menu}</button></div>`);
  bar.querySelector(".topbar__menu")!.addEventListener("click", openAdmin);
  return bar;
}

function openAdmin(): void {
  state.admin = { unlocked: false, tab: state.admin.tab };
  state.view = { name: "admin" };
  render();
  // Asked for once the screen is open, never at boot: this is the one call that asks Music
  // Assistant what it has got, and it belongs to the parent's surface, not the child's.
  loadParentData();
}

function loadParentData(): void {
  state.players = null;
  void Promise.all([speakerPlayers(), deviceInfo()]).then(([players, device]) => {
    state.players = players;
    state.device = device;
    if (state.view.name === "admin") render();
  });
}

/** Mark a slot selected and tell its frame which way the hand just moved. */
function focusSlot(slot: HTMLElement): void {
  slot.dataset.focus = "1";
  setEntryDirection(slot, state.from.x, state.from.y);
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
const play = (album: Album | null | undefined, track = 1) => {
  // An empty slot. He pressed Enter on a withdrawn album's gap, which is a real thing to do
  // and must cost nothing: no sound, no error, no screen change. Silence is an answer.
  if (!album) return;
  /**
   * The only two things Music Assistant is ever asked at runtime are "give me this cover" and
   * "play this uri" (§5.1). This is the second one.
   */
  if (SPEAKER?.configured) {
    const t = album.tracks.find((x) => x.n === track);
    speaker.play(album.uri, state.volume, VOL_STEPS, Math.max(0, track - 1), t?.uri ?? undefined);
  }
  /**
   * The recent and most-played shelves are built from this and from nothing else. There is no
   * separate tracking: what he played is what he played.
   *
   * The optimistic local update keeps the shelves right for this session even if the write
   * does not land; the store is what makes them right tomorrow morning.
   */
  recordPlay(album.uri, track);
  if (CRATE) {
    CRATE.recent = [album, ...CRATE.recent.filter((a) => a.uri !== album.uri)].slice(0, SHELF_SIZE);
  }
  state.now = { album, track };
  state.focusTrack = track;
  state.playing = true;
  state.view = { name: "playing" };
  render();
};

const goHome = () => { state.view = { name: "crate" }; render(); };

/**
 * The record ended.
 *
 * Principle 3 says silence is a feature: a record stops, and that is what sends him back to
 * the crate. That only works if the screen goes with him. Staying on a stopped now-playing
 * screen makes an ending look like a failure, and he has no way to tell the two apart.
 *
 * So: back to the crate, with the album that just finished still selected. He lands exactly
 * where choosing happens, and the selection is the only record he has of what he just heard.
 *
 * Here it is reached by skipping past the last track. On the kiosk it is whatever Music
 * Assistant reports when the queue runs out — the same function, a different trigger.
 */
function endOfRecord(): void {
  const done = state.now?.album;
  state.now = null;
  state.playing = false;
  if (done) {
    const i = shown().findIndex((a) => a?.id === done.id);
    if (i >= 0) { state.cursor = i; state.from = { x: 0, y: 0 }; }
  }
  state.view = { name: "crate" };
  render();
}

/**
 * §10, and principle 4: **the child never sees an error.**
 *
 * The store is unreachable — the server is restarting, the network is out, the container is
 * being deployed. He is four, standing in front of a screen, and every honest thing this
 * screen could tell him is a thing he cannot read and could not act on.
 *
 * So it sleeps. The theme's own emblem, dim, breathing slowly; no text, no code, no spinner
 * (a spinner is a promise, and this makes none). The rails stay where they always are because
 * they are on every screen forever and a rail that vanishes is a rail he has to relearn. The
 * page retries in the background and the crate simply appears when it can.
 *
 * What it must never do is show him something else. The loader this replaced fell back to a
 * mock set of twenty albums nobody had approved — on the kiosk, one server hiccup and they
 * were in front of him.
 */
function sleeping(): HTMLElement {
  return el(`<section class="stage sleeping" aria-hidden="true">
    <div class="sleeping__emblem">${emblemSvg(THEME)}</div>
  </section>`);
}

// ── A · Vegg — 9 covers, tap any one. Position is the index. ─────
function wall(): HTMLElement {
  const list = shown();
  const per = PER_PAGE, pages = Math.max(1, Math.ceil(list.length / per));
  // The page follows the focused album, so arrow keys flip pages without a separate concept.
  state.page = Math.floor(state.cursor / per);

  /**
   * The riffle. A flipped page does not appear, it arrives: nine sleeves sweep in from the
   * side the hand moved towards, column by column, nearest edge first. Flipping WAS the
   * physical act this whole thing imitates, and until now it happened instantly, which made
   * a new page indistinguishable from a redraw.
   *
   * A flip landing on top of the previous one is a scrub, not a flip — he is holding the key
   * down to get somewhere. Replaying the riffle then would leave the crate permanently
   * half-faded while he travels, so a scrub just cuts.
   */
  const flipped = state.page !== state.lastPage;
  const dir = state.page > state.lastPage ? 1 : -1;
  const at = performance.now();
  const scrubbing = flipped && at - state.lastFlipAt < 260;
  if (flipped) state.lastFlipAt = at;
  state.lastPage = state.page;

  const root = el(`<section class="stage wall">
    <div class="wall__row"><div class="wall__grid"></div></div>
  </section>`);
  const grid = root.querySelector(".wall__grid") as HTMLElement;
  if (flipped && !scrubbing) grid.dataset.flip = dir > 0 ? "right" : "left";
  list.slice(state.page * per, state.page * per + per).forEach((a, i) => {
    const cell = a ? coverEl(a, play) : emptySlot();
    // Column order, counted from the edge the page is coming in from.
    const col = i % COLS;
    cell.style.setProperty("--d", String(dir > 0 ? COLS - 1 - col : col));
    if (state.page * per + i === state.cursor) focusSlot(cell);
    grid.append(cell);
  });

  /**
   * The flip arrows, beside the crate and pointing the way they take you.
   *
   * They replaced two things at once: a pair of buttons parked in the bottom corners, and the
   * crate-depth rails that stood where these do now. The rails were honest — thickness you see
   * rather than count — but honest is not the bar. He is four, and an arrow on the left edge
   * pointing left is the most direct statement this interface can make. A stack of sleeve
   * edges asks him to work out what it means. It only ever meant "there is more that way".
   *
   * They still go to nothing at the ends of the crate, which is what keeps the silent stop
   * legible rather than merely dead — that part of the rails was worth keeping.
   *
   * Laid out beside the grid rather than pinned to the window, so they sit next to the covers
   * at any width instead of drifting out into the margin or onto them.
   */
  const row = root.querySelector(".wall__row")!;
  const prev = el(`<button class="btn btn--lg flip" aria-label="Forrige side">${ICON.left}</button>`);
  const next = el(`<button class="btn btn--lg flip" aria-label="Neste side">${ICON.right}</button>`);
  prev.toggleAttribute("disabled", state.page === 0);
  next.toggleAttribute("disabled", state.page >= pages - 1);
  prev.addEventListener("click", () => { moveCursor(-per); });
  next.addEventListener("click", () => { moveCursor(per); });
  row.prepend(prev);
  row.append(next);
  return root;
}

// ── now playing ─────────────────────────────────────────────────
//
// Cover, band name, and the track list — visible, not behind a key. It was moved to a screen
// of its own and reached with up or down, which was wrong twice over: a four-year-old has no
// reason to guess that a key opens something, and the list is most of what the screen is FOR.
// If it is worth having it is worth showing.
//
// §4.3 asked for a near-fullscreen cover and no list. That was written before anyone watched a
// child use it. The list stays; the cover gives up some size for it.
function nowPlaying(album: Album, track: number): HTMLElement {
  const root = el(`<section class="stage np">
    <div class="np__art"><div class="cover" id="np-art">${art(album, "lg")}</div></div>
    <div class="np__side">
      <h1 class="np__artist">${esc(album.artist.toUpperCase())}</h1>
      <ol class="tracks" data-marks="${state.settings.favouritesShown ? 1 : 0}"></ol>
      <div class="transport"></div>
    </div>
  </section>`);
  withImageFallback(root.querySelector("#np-art") as HTMLElement, album);

  // The number line — §4.2. One straight, evenly spaced column. The geometry carries the
  // measured effect, not the numerals, so this is never a wheel, arc, ring, carousel or grid.
  // True track numbers, 1..n, no truncation and no renumbering: accuracy is what makes it
  // learnable. No pips beside the numerals — subitizing range at 42-57 months is 2.8, and the
  // row's position in the column already is the magnitude cue.
  const list = root.querySelector(".tracks")!;
  if (album.tracks.length === 0) {
    list.append(el(`<li class="tracks__none">Music Assistant returned no tracks for this album.</li>`));
  }
  for (const t of album.tracks) {
    /**
     * The mark for a track he keeps choosing — §4.2's number line, and nothing else about it
     * changes. It is drawn AFTER the title, at the quiet end of the row, so the numeral still
     * leads and the column still reads as a straight evenly-spaced line. It never reorders and
     * never reflows: an album he has played to death looks exactly like one he has not, except
     * that two of the rows carry a small shape.
     *
     * Derived, never declared. There is no "like" button and there must not be one — the
     * product does four things and refuses the fifth, and a mark he could chase would turn
     * listening into a game with a score.
     */
    const fav = t.favourite && state.settings.favouritesShown
      ? `<span class="track__fav">${markSvg(state.settings.favouriteMark)}</span>`
      : "";
    const row = el(`<li><button class="track" aria-current="${t.n === track}" data-focus="${t.n === state.focusTrack ? 1 : 0}">
      <span class="track__n">${t.n}</span><span class="track__t">${esc(t.title)}</span>${fav}</button></li>`);
    row.querySelector("button")!.addEventListener("click", () => play(album, t.n));
    list.append(row);
  }

  const tp = root.querySelector(".transport")!;
  const pp = el(`<button class="btn btn--lg btn--play" aria-label="${state.playing ? "Pause" : "Spill"}">${state.playing ? ICON.pause : ICON.play}</button>`);
  pp.addEventListener("click", () => { togglePlay(); });
  const skip = el(`<button class="btn btn--lg" aria-label="Neste spor">${ICON.next}</button>`);
  skip.addEventListener("click", () => skipTrack(album, track));
  tp.append(pp, skip);
  return root;
}

/** Play/pause, everywhere. The page's own state stays authoritative for what is drawn. */
function togglePlay(): void {
  state.playing = !state.playing;
  if (SPEAKER?.configured) speaker.playPause();
  render();
}

/** Skip forward. Past the last track is not a dead press — it is the end of the record. */
function skipTrack(album: Album, track: number): void {
  if (SPEAKER?.configured) speaker.next();
  if (track >= album.tracks.length) { endOfRecord(); return; }
  state.now = { album, track: track + 1 };
  state.focusTrack = track + 1;
  render();
}

/**
 * Volume, in one place, on every screen.
 *
 * It used to live in the now-playing transport, so the crate took the keys and showed nothing;
 * a later fix flashed a readout that appeared and vanished. Both were wrong for the same
 * reason: a four-year-old learns a control by where it is, and a control that moves with the
 * screen — or is nowhere until you touch it — is several controls, not one.
 *
 * Vertical, on the left rail under the theme discs. Louder is up: the only mapping he can
 * already be assumed to hold, and it costs nothing to honour.
 */
function volume(): HTMLElement {
  const vol = el(`<div class="vol" role="group" aria-label="Lyd"></div>`);
  const up   = el(`<button class="btn" aria-label="Høyere">${ICON.plus}</button>`);
  const down = el(`<button class="btn" aria-label="Lavere">${ICON.minus}</button>`);
  up.addEventListener("click", () => setVolume(1));
  down.addEventListener("click", () => setVolume(-1));
  vol.append(up, volumeBlocks(), down);
  return vol;
}

const volumeBlocks = (): HTMLElement =>
  el(`<div class="vol__blocks">${Array.from({ length: VOL_STEPS },
    (_, i) => `<span class="vol__b" data-on="${i < state.volume ? 1 : 0}"></span>`).join("")}</div>`);

// ── development readout: not part of the design being judged ──
/** Step to the next theme. Backs both the picker's keyboard route and the dev bar. */
function hopTheme(d: number): void {
  const i = (THEMES.findIndex((t) => t.id === THEME.id) + d + THEMES.length) % THEMES.length;
  setTheme(THEMES[i]!);
}

/**
 * The development readout. It can no longer say "mock data", because there is no mock data —
 * the only source of albums is the approved set, and when that cannot be reached the screen
 * says so by being asleep rather than by quietly showing something else.
 */
function switcher(): HTMLElement {
  const gaps = slots().length - albums().length;
  const src = !CRATE
    ? "store unreachable"
    : `${albums().length} in the crate${gaps ? ` · ${gaps} withdrawn` : ""}`;
  const bar = el(`<div class="switch"><span>${src}</span>
    <button class="switch__theme" aria-label="Next theme">${THEME.label}</button></div>`);
  bar.children[1].addEventListener("click", () => hopTheme(1));
  return bar;
}

// ── keyboard: the primary input ───────────────────────────────────
//
// A keypress cannot miss, which matters more here than anywhere else: measured tap
// accuracy on an intended target at ages 4-6 is about 57%. Four arrows map onto a grid
// without reading, and Enter is unambiguous. Mouse and touch keep working alongside.
//
//   ← ↑ → ↓   move            Enter / Space  play        Esc  back to the crate
//   + / -     volume          *              next theme (his key; picker discs do the same)

function clampCursor(n: number): number {
  return Math.max(0, Math.min(shown().length - 1, n));
}

function moveCursor(delta: number): void {
  const next = clampCursor(state.cursor + delta);
  if (next === state.cursor) return;   // silent at the ends: no error, nothing happens
  state.from = { x: Math.sign(delta), y: 0 };
  state.cursor = next;
  render();
}

/**
 * Grid movement for the 3x3 wall.
 *
 * Left and right FLIP THE PAGE rather than wrapping onto the next row — that is the
 * riffling motion the crate is imitating, and it means a whole new set of nine sleeves
 * appears with one key. Up and down move within the page and stop at its edges.
 *
 * Flipping keeps the cursor in the same row and puts it on the opposite column, so the
 * hand's sense of position survives the flip.
 */
function moveGrid(dx: number, dy: number): void {
  const page = Math.floor(state.cursor / PER_PAGE);
  const slot = state.cursor % PER_PAGE;
  const row = Math.floor(slot / COLS);
  const col = slot % COLS;
  const lastPage = Math.max(0, Math.ceil(shown().length / PER_PAGE) - 1);

  if (dy !== 0) {
    const nextRow = row + dy;
    if (nextRow < 0 || nextRow >= COLS) return;             // stop at the top and bottom
    state.from = { x: 0, y: dy };
    state.cursor = clampCursor(page * PER_PAGE + nextRow * COLS + col);
    render();
    return;
  }

  const nextCol = col + dx;
  if (nextCol >= 0 && nextCol < COLS) {
    const target = page * PER_PAGE + row * COLS + nextCol;
    if (target >= shown().length) return;                   // past the end of the last page
    state.from = { x: dx, y: 0 };
    state.cursor = target;
    render();
    return;
  }

  // Off the edge: flip a page and land on the opposite column, same row.
  const nextPage = page + dx;
  if (nextPage < 0 || nextPage > lastPage) return;          // silent at the ends of the crate
  const landingCol = dx > 0 ? 0 : COLS - 1;
  state.from = { x: dx, y: 0 };
  state.cursor = clampCursor(nextPage * PER_PAGE + row * COLS + landingCol);
  render();
}

/**
 * Volume, from anywhere.
 *
 * The crate used to accept these keys and show nothing — the blocks only existed on the now
 * playing view — so pressing + in the crate changed the state and moved nothing on screen. A
 * press that appears to do nothing is exactly the disappointment principle 1 is about, and
 * volume is one of the four verbs, so he will press it here.
 *
 * At the ceiling the blocks render full and do not move, which says "that is all there is"
 * without a word. Silence there would be indistinguishable from a broken key.
 */
function setVolume(delta: number): void {
  const next = Math.max(0, Math.min(VOL_STEPS, state.volume + delta));
  if (next === state.volume) { render(); return; }   // at the ceiling: full blocks, no command
  state.volume = next;
  if (SPEAKER?.configured) speaker.volume(state.volume, VOL_STEPS);
  render();
}

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName ?? "";
  if (/^(INPUT|TEXTAREA)$/.test(tag)) return;

  // Theme switching from the keyboard is dev chrome; the discs are the real control.
  if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    hopTheme(e.key === "ArrowUp" ? -1 : 1);
    return;
  }

  // The child's own theme key, the keyboard twin of the picker discs. On the numeric keypad
  // recommended in §8, NumLock off leaves `*` doing nothing else, and it reaches no letter,
  // no modifier and no TTY.
  if (e.key === "*" || e.code === "NumpadMultiply") {
    e.preventDefault();
    if (state.view.name === "crate") hopTheme(1);
    return;
  }

  const where = state.view.name;
  const now = state.now;

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      if (where === "crate") moveGrid(-1, 0);
      else setVolume(-1);                       // left and right are volume once a record is on
      return;
    case "ArrowRight":
      e.preventDefault();
      if (where === "crate") moveGrid(1, 0);
      else setVolume(1);
      return;
    case "ArrowUp":
    case "ArrowDown": {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (where === "crate") { moveGrid(0, d); return; }
      // The list is already on screen, so these just walk it. Nothing to open.
      moveTrack(d);
      return;
    }
    case "Enter":
      e.preventDefault();
      if (where === "crate") play(shown()[state.cursor]);
      else if (now) play(now.album, state.focusTrack);
      return;
    case " ":
      // Space is play/pause everywhere, the way every media player has worked forever.
      e.preventDefault();
      if (where === "crate") play(shown()[state.cursor]);
      else togglePlay();
      return;
    case "Escape":
    case "Backspace":
      e.preventDefault();
      if (where !== "crate") goHome();
      return;
  }

  // Settings takes no other key: its own controls are the only way through it, and the arrow
  // keys must not steer the crate underneath a screen the child cannot read.
  if (state.view.name === "admin") {
    if (/^[0-9]$/.test(e.key)) return;
    e.preventDefault();
    return;
  }

  // Volume, across layouts. On a Norwegian keyboard "+" and "-" are both unshifted keys,
  // so e.key matches directly; NumpadAdd/Subtract and the media keys cover a keypad and
  // anything with dedicated volume buttons. Whichever the final hardware has, it works.
  if (VOL_UP.has(e.key) || VOL_UP.has(e.code)) { e.preventDefault(); setVolume(1); return; }
  if (VOL_DOWN.has(e.key) || VOL_DOWN.has(e.code)) { e.preventDefault(); setVolume(-1); return; }
}

const VOL_UP = new Set(["+", "=", "NumpadAdd", "AudioVolumeUp", "PageUp"]);
const VOL_DOWN = new Set(["-", "_", "NumpadSubtract", "AudioVolumeDown", "PageDown"]);

function moveTrack(delta: number): void {
  const n = state.now?.album.tracks.length ?? 0;
  if (n === 0) return;
  state.focusTrack = Math.max(1, Math.min(n, state.focusTrack + delta));
  render();
  document.querySelector('.track[data-focus="1"]')?.scrollIntoView({ block: "nearest" });
}

addEventListener("keydown", onKey);

function render() {
  app.replaceChildren();
  const now = state.now;

  if (state.view.name === "admin") {
    app.append(adminView({
      settings: state.settings,
      unlocked: state.admin.unlocked,
      tab: state.admin.tab,
      themes: THEMES,
      onUnlock: (ok) => { if (ok) { state.admin.unlocked = true; render(); } },
      onTab: (tab) => { state.admin.tab = tab; render(); },
      players: state.players,
      device: state.device,
      onPickPlayer: (id) => {
        speaker.setTarget(id);
        // Reflect it immediately; the next fetch confirms it from the server.
        state.players = state.players?.map((p) => ({ ...p, current: p.id === id })) ?? null;
        render();
      },
      onClose: goHome,
      onChange: (patch) => {
        state.settings = { ...state.settings, ...patch };
        // Straight to the store. Settings that only lived here were settings the kiosk forgot
        // on its next reboot, which for a machine that reboots nightly is every morning.
        saveSettings(patch as Record<string, unknown>);
        if (patch.theme) setTheme(THEMES.find((t) => t.id === patch.theme) ?? THEME);
        if (patch.numeralFace) applyNumeralFace(patch.numeralFace);
        if (patch.volumeCeiling !== undefined) state.volume = Math.min(state.volume, VOL_STEPS);
        render();
      },
    }));
  } else if (state.view.name === "playing" && now) {
    app.append(nowPlaying(now.album, now.track));
  } else if (!CRATE || albums().length === 0) {
    /**
     * No crate, no wall. Not an empty grid: an empty grid reads as "your music is gone",
     * which is the single worst thing this screen can say to him.
     *
     * "Unreachable" and "nothing approved yet" are one screen on purpose. They are different
     * problems for the parent and the same non-event for the child, and the parent finds out
     * from the server's boot log, which says the crate is empty in as many words.
     */
    app.append(sleeping());
  } else {
    app.append(wall());
    // Now playing prints the artist large already; repeating it small underneath it would
    // just be the screen talking to itself.
    app.append(caption(shown()[state.cursor]));
  }

  /**
   * The two rails. They are on EVERY screen, in the same place, always.
   *
   * Left is the device: which theme, how loud. Right is which surface he is looking at. Both
   * live in the edge dead zones of §4.5, which is where controls belong when a stray palm
   * press on them costs nothing — and neither of these can destroy anything.
   */
  // The bar is on the child's screens only: settings has its own header and its own way out.
  if (state.view.name !== "admin") {
    app.append(topbar());
    const left = el(`<div class="rail rail--left"></div>`);
    left.append(themePicker(THEME, setTheme), volume());
    app.append(left, shelfRail());
  }

  // Settings has its own close, in its own header, and Esc. The child's home target would be a
  // third way out of a screen he should not be on, sitting on top of the footnote.
  if (state.view.name === "playing") {
    const home = el(`<button class="btn home" aria-label="Tilbake til bunken">${ICON.home}</button>`);
    home.addEventListener("click", goHome);
    app.append(home);
  }

  // Prototype chrome, and settings is a parent surface: it would sit on the close button.
  if (state.view.name !== "admin") app.append(switcher());
}
render();
