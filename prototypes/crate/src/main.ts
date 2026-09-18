// PROTOTYPE — three crates on one route, switchable with ?variant=A|B|C.
// Question: does browsing feel like flipping records, and can a 4-year-old drive it?
import { loadLibrary, seedCount, type Album } from "./library";
import { coverSvg } from "./cover";
import { THEMES, applyTheme, frameEl, setEntryDirection, themeFromUrl, themePicker, type Theme } from "./theme";

// ── icons: drawn, one weight, never glyphs or emoji ──────────────
const ICON = {
  play:  `<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>`,
  next:  `<svg viewBox="0 0 24 24"><path d="M6 5.5v13a1 1 0 0 0 1.53.85L16 13.9V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.1L7.53 4.65A1 1 0 0 0 6 5.5Z"/></svg>`,
  left:  `<svg viewBox="0 0 24 24"><path d="M15.2 3.8 7 12l8.2 8.2 1.6-1.6L10.2 12l6.6-6.6z"/></svg>`,
  right: `<svg viewBox="0 0 24 24"><path d="m8.8 3.8 8.2 8.2-8.2 8.2-1.6-1.6L13.8 12 7.2 5.4z"/></svg>`,
  home:  `<svg viewBox="0 0 24 24"><path d="M4 9.5 12 3l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>`,
  minus: `<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg>`,
  plus:  `<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>`,
};

// ── state. In memory only; a prototype must not depend on persistence. ──
//
// `now` is what is PLAYING. `view` is what is ON SCREEN. They were one thing, which meant the
// crate had no way to know a record was running and could not mark the sleeve it came from —
// and a four-year-old who walks away and comes back does not hold that in his head.
type View = { name: "crate" } | { name: "playing" } | { name: "tracks" };
const state = {
  view: { name: "crate" } as View,
  now: null as { album: Album; track: number } | null,
  page: 0,          // A
  cursor: 0,        // B and C, and the focused album in A
  focusTrack: 1,    // focused row in the number line
  playing: false,
  volume: 3,        // of 7 blocks
  /** When volume last changed, so the crate can show a readout and then let it go. */
  volumeAt: 0,
  // Direction of the last move, so the selection frame arrives from where the hand came.
  from: { x: 0, y: 0 },
  lastPage: 0,      // the page the crate was showing on the previous render
  lastFlipAt: 0,    // timestamp of the last page flip, to tell a deliberate flip from a scrub
};

const PER_PAGE = 9;
const COLS = 3;
const VOL_STEPS = 7;
/** How long the crate shows a volume readout after a change, ms. */
const VOL_FLASH_MS = 1700;

const lib = await loadLibrary();

/**
 * The crate is the CURATED set, not the library. Default to the seed playlist only —
 * a library browsed at random contains covers no one approved, which is exactly what the
 * approval gate exists to prevent. `?all=1` shows everything, for working on the grid.
 */
const showAll = new URLSearchParams(location.search).has("all");
const curated = lib.albums.filter((a) => a.seed);
const ALBUMS = showAll || curated.length === 0 ? lib.albums : curated;

/**
 * Warm every sleeve into the browser cache up front, small size first.
 * The crate must never show a black square: a child navigating with a held-down arrow key
 * moves faster than the network, and an empty tile is indistinguishable from a broken one.
 * On the kiosk this becomes a service worker doing the same thing across reboots.
 */
function warmCovers(): void {
  const which = tileSize();
  for (const a of ALBUMS) {
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

const app = document.getElementById("app")!;
const variant = (): "A" | "B" | "C" =>
  (new URLSearchParams(location.search).get("variant") ?? "A").toUpperCase() as "A" | "B" | "C";

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
function caption(a: Album | undefined): HTMLElement {
  const bar = el(`<p class="caption" aria-hidden="true"></p>`);
  if (!a) return bar;
  bar.append(el(`<span class="caption__artist">${esc(a.artist.toUpperCase())}</span>`));
  bar.append(el(`<span class="caption__title">${esc(a.title)}</span>`));
  if (a.year) bar.append(el(`<span class="caption__year">${a.year}</span>`));
  return bar;
}

/** Mark a slot selected and tell its frame which way the hand just moved. */
function focusSlot(slot: HTMLElement): void {
  slot.dataset.focus = "1";
  setEntryDirection(slot, state.from.x, state.from.y);
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
const play = (album: Album, track = 1) => {
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
    const i = ALBUMS.findIndex((a) => a.id === done.id);
    if (i >= 0) { state.cursor = i; state.from = { x: 0, y: 0 }; }
  }
  state.view = { name: "crate" };
  render();
}

// ── A · Vegg — 9 covers, tap any one. Position is the index. ─────
function wall(): HTMLElement {
  const per = PER_PAGE, pages = Math.ceil(ALBUMS.length / per);
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

  const root = el(`<section class="stage wall"><div class="wall__grid"></div>
    <div class="wall__foot"></div></section>`);
  const grid = root.querySelector(".wall__grid") as HTMLElement;
  if (flipped && !scrubbing) grid.dataset.flip = dir > 0 ? "right" : "left";
  ALBUMS.slice(state.page * per, state.page * per + per).forEach((a, i) => {
    const cell = coverEl(a, play);
    // Column order, counted from the edge the page is coming in from.
    const col = i % COLS;
    cell.style.setProperty("--d", String(dir > 0 ? COLS - 1 - col : col));
    if (state.page * per + i === state.cursor) focusSlot(cell);
    grid.append(cell);
  });

  /**
   * How much crate is behind you and how much is ahead, as thickness rather than as a count.
   *
   * This replaced a row of one pip per page. Two pips was fine; the crate is append-only and
   * fed by a curation worker, so at a hundred albums it is a row of twelve dots — and reading
   * that needs exactly the two things PRODUCT.md measured him as unable to do: counting past a
   * subitizing range of 2.8, and comparing ordinal positions at 0.66 accuracy. §4.2 already
   * bans pips beside the track numerals for this reason; the crate had inherited none of it.
   *
   * A stack of sleeve edges seen side-on is the same information as a quantity you can see
   * rather than count, it is what the physical object actually looks like, and it goes to
   * nothing at either end — which is also what makes the silent stop legible instead of dead.
   */
  const total = ALBUMS.length;
  const behind = state.page * per;
  const ahead = Math.max(0, total - (state.page + 1) * per);
  const depth = (side: "before" | "after", n: number) =>
    el(`<div class="depth depth--${side}" aria-hidden="true"><i style="--fill:${((n / total) * 100).toFixed(1)}%"></i></div>`);
  root.prepend(depth("before", behind));
  root.append(depth("after", ahead));

  const foot = root.querySelector(".wall__foot")!;
  const prev = el(`<button class="btn btn--lg" aria-label="Forrige side">${ICON.left}</button>`);
  const next = el(`<button class="btn btn--lg" aria-label="Neste side">${ICON.right}</button>`);
  prev.toggleAttribute("disabled", state.page === 0);
  next.toggleAttribute("disabled", state.page >= pages - 1);
  prev.addEventListener("click", () => { moveCursor(-per); });
  next.addEventListener("click", () => { moveCursor(per); });
  foot.append(prev, next);
  return root;
}

// ── B · Bunken — one cover forward, the rest fanned behind. ──────
function stack(): HTMLElement {
  const root = el(`<section class="stage stack"><div class="stack__deck"></div>
    <div class="stack__foot"></div></section>`);
  const deck = root.querySelector(".stack__deck")!;
  for (let d = 3; d >= 0; d--) {
    const a = ALBUMS[(state.cursor + d) % ALBUMS.length];
    const card = el(`<div class="stack__card"></div>`);
    // Peek above, like sleeves leaning back in a crate. The fan IS the metaphor.
    card.style.transform = `translateY(${-d * 58}px) scale(${1 - d * 0.045})`;
    card.style.filter = d ? `brightness(${1 - d * 0.14}) saturate(${1 - d * 0.12})` : "none";
    card.style.zIndex = String(10 - d);
    card.style.pointerEvents = d ? "none" : "auto";
    const cell = coverEl(a, play);
    if (d === 0) focusSlot(cell);
    card.append(cell);
    deck.append(card);
  }
  const foot = root.querySelector(".stack__foot")!;
  const back = el(`<button class="btn btn--lg" aria-label="Forrige plate">${ICON.left}</button>`);
  const fwd  = el(`<button class="btn btn--lg" aria-label="Neste plate">${ICON.right}</button>`);
  const go   = el(`<button class="btn btn--lg btn--play" aria-label="Spill">${ICON.play}</button>`);
  back.addEventListener("click", () => { state.cursor = (state.cursor - 1 + ALBUMS.length) % ALBUMS.length; render(); });
  fwd.addEventListener("click",  () => { state.cursor = (state.cursor + 1) % ALBUMS.length; render(); });
  go.addEventListener("click",   () => play(ALBUMS[state.cursor % ALBUMS.length]));
  foot.append(back, go, fwd);
  return root;
}

// ── C · Hylla — a sliding strip; the centred cover is the live one. ──
function shelf(): HTMLElement {
  const root = el(`<section class="stage shelf"><div class="shelf__rail"></div>
    <div class="shelf__foot"></div></section>`);
  const rail = root.querySelector(".shelf__rail") as HTMLElement;
  ALBUMS.forEach((a, i) => {
    const near = Math.min(2, Math.abs(i - state.cursor));
    const slot = el(`<div class="shelf__slot" data-near="${near}" data-focus="${i === state.cursor ? 1 : 0}"></div>`);
    const cell = coverEl(a, (al) => (i === state.cursor ? play(al) : (state.cursor = i, render())));
    if (i === state.cursor) focusSlot(cell);
    slot.append(cell);
    rail.append(slot);
  });
  queueMicrotask(() => {
    const t = rail.children[state.cursor] as HTMLElement;
    rail.scrollTo({ left: t.offsetLeft - (rail.clientWidth - t.clientWidth) / 2, behavior: "instant" as ScrollBehavior });
  });
  const go = el(`<button class="btn btn--lg btn--play" aria-label="Spill">${ICON.play}</button>`);
  go.addEventListener("click", () => play(ALBUMS[state.cursor]));
  root.querySelector(".shelf__foot")!.append(go);
  return root;
}

// ── now playing — §4.3 ───────────────────────────────────────────
//
// Cover near-fullscreen, uncropped, nothing over it. The band name once, below the art,
// never a control. Four verbs underneath and nothing else.
//
// This used to be a two-column split with a scrolling track list beside the cover, which is a
// desktop music player: roughly sixty percent text, aimed at someone who cannot read. The
// track list is a screen of its own now (§4.2), reached deliberately with up or down.
function nowPlaying(album: Album, track: number): HTMLElement {
  const root = el(`<section class="stage np">
    <div class="np__art"><div class="cover" id="np-art" style="cursor:default">${art(album, "lg")}</div></div>
    <h1 class="np__artist">${esc(album.artist.toUpperCase())}</h1>
    <div class="transport"></div>
  </section>`);
  withImageFallback(root.querySelector("#np-art") as HTMLElement, album);

  const tp = root.querySelector(".transport")!;
  const pp = el(`<button class="btn btn--lg btn--play" aria-label="${state.playing ? "Pause" : "Spill"}">${state.playing ? ICON.pause : ICON.play}</button>`);
  pp.addEventListener("click", () => { state.playing = !state.playing; render(); });
  const skip = el(`<button class="btn btn--lg" aria-label="Neste spor">${ICON.next}</button>`);
  skip.addEventListener("click", () => skipTrack(album, track));
  tp.append(pp, skip, volume());
  return root;
}

/** Skip forward. Past the last track is not a dead press — it is the end of the record. */
function skipTrack(album: Album, track: number): void {
  if (track >= album.tracks.length) { endOfRecord(); return; }
  state.now = { album, track: track + 1 };
  state.focusTrack = track + 1;
  render();
}

/** The volume control: two large buttons and a row of filled blocks. */
function volume(): HTMLElement {
  const vol = el(`<div class="vol"></div>`);
  const down = el(`<button class="btn" aria-label="Lavere">${ICON.minus}</button>`);
  const up   = el(`<button class="btn" aria-label="Høyere">${ICON.plus}</button>`);
  down.addEventListener("click", () => setVolume(-1));
  up.addEventListener("click", () => setVolume(1));
  vol.append(down, volumeBlocks(), up);
  return vol;
}

const volumeBlocks = (): HTMLElement =>
  el(`<div class="vol__blocks">${Array.from({ length: VOL_STEPS },
    (_, i) => `<span class="vol__b" data-on="${i < state.volume ? 1 : 0}"></span>`).join("")}</div>`);

// ── the album view — §4.2, the number line ───────────────────────
//
// One straight, evenly spaced vertical column. The geometry is what carries the measured
// effect, not the numerals, so this is never a wheel, arc, ring, carousel or grid. True track
// numbers, 1..n, no truncation and no renumbering: accuracy is what makes it learnable. No
// pips beside the numerals — mean subitizing range at 42-57 months is 2.8, and the row's
// position in the column already is the magnitude cue.
function trackList(album: Album, playingTrack: number | null): HTMLElement {
  const root = el(`<section class="stage tracks-view"><ol class="tracks"></ol></section>`);
  const list = root.querySelector(".tracks")!;
  if (album.tracks.length === 0) {
    list.append(el(`<li class="tracks__none">Music Assistant returned no tracks for this album.</li>`));
    return root;
  }
  for (const t of album.tracks) {
    const row = el(`<li><button class="track" aria-current="${t.n === playingTrack}" data-focus="${t.n === state.focusTrack ? 1 : 0}">
      <span class="track__n">${t.n}</span><span class="track__t">${esc(t.title)}</span></button></li>`);
    row.querySelector("button")!.addEventListener("click", () => play(album, t.n));
    list.append(row);
  }
  return root;
}

// ── switcher: obviously not part of the design being judged ──────
const NAMES = { A: "Vegg · the wall", B: "Bunken · the stack", C: "Hylla · the shelf" };

/** Step to the next theme. Backs both the picker's keyboard route and the prototype bar. */
function hopTheme(d: number): void {
  const i = (THEMES.findIndex((t) => t.id === THEME.id) + d + THEMES.length) % THEMES.length;
  setTheme(THEMES[i]!);
}

function hopVariant(d: number): void {
  const keys = ["A", "B", "C"] as const;
  const i = (keys.indexOf(variant()) + d + keys.length) % keys.length;
  const u = new URL(location.href);
  u.searchParams.set("variant", keys[i]);
  history.replaceState(null, "", u);
  state.view = { name: "crate" };
  render();
}
function switcher(): HTMLElement {
  const keys = ["A", "B", "C"] as const;
  const cur = variant();
  const src = lib.source !== "live"
    ? "mock data"
    : showAll
      ? `${ALBUMS.length} albums · WHOLE LIBRARY, not curated`
      : `${ALBUMS.length} curated`;
  const bar = el(`<div class="switch"><button aria-label="Previous variant">←</button>
    <span>${cur} (${NAMES[cur]}) · ${src}</span><button aria-label="Next variant">→</button>
    <button class="switch__theme" aria-label="Next theme">${THEME.label}</button></div>`);
  bar.children[0].addEventListener("click", () => hopVariant(-1));
  bar.children[2].addEventListener("click", () => hopVariant(1));
  bar.children[3].addEventListener("click", () => hopTheme(1));
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
//                             Shift + ← →    switch prototype variant

function clampCursor(n: number): number {
  return Math.max(0, Math.min(ALBUMS.length - 1, n));
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
  const lastPage = Math.max(0, Math.ceil(ALBUMS.length / PER_PAGE) - 1);

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
    if (target >= ALBUMS.length) return;                    // past the end of the last page
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
  state.volume = Math.max(0, Math.min(VOL_STEPS, state.volume + delta));
  state.volumeAt = performance.now();
  render();
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(render, VOL_FLASH_MS + 40);
}
let volumeTimer: ReturnType<typeof setTimeout>;

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName ?? "";
  if (/^(INPUT|TEXTAREA)$/.test(tag)) return;

  // Variant and theme switching are prototype chrome, so they get out of the child's way.
  if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    hopVariant(e.key === "ArrowLeft" ? -1 : 1);
    return;
  }
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

  const v = variant();
  const where = state.view.name;
  const now = state.now;

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      if (where === "crate") { v === "A" ? moveGrid(-1, 0) : moveCursor(-1); }
      else setVolume(-1);                       // left and right are volume once a record is on
      return;
    case "ArrowRight":
      e.preventDefault();
      if (where === "crate") { v === "A" ? moveGrid(1, 0) : moveCursor(1); }
      else setVolume(1);
      return;
    case "ArrowUp":
    case "ArrowDown": {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (where === "crate") { v === "A" ? moveGrid(0, d) : moveCursor(d); return; }
      // Up and down walk the number line. From now playing they open it: §4 treats the track
      // line as part of that view, reached by the same keys that then move within it.
      if (where === "playing" && now) { state.view = { name: "tracks" }; render(); return; }
      moveTrack(d);
      return;
    }
    case "Enter":
      e.preventDefault();
      if (where === "crate") play(ALBUMS[state.cursor]);
      else if (where === "tracks" && now) play(now.album, state.focusTrack);
      else if (now) { state.playing = true; render(); }
      return;
    case " ":
      // Space is play/pause everywhere, the way every media player has worked forever.
      e.preventDefault();
      if (where === "crate") play(ALBUMS[state.cursor]);
      else { state.playing = !state.playing; render(); }
      return;
    case "Escape":
    case "Backspace":
      e.preventDefault();
      if (where !== "crate") goHome();
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

  if (state.view.name === "playing" && now) {
    app.append(nowPlaying(now.album, now.track));
  } else if (state.view.name === "tracks" && now) {
    app.append(trackList(now.album, state.playing ? now.track : null));
  } else {
    app.append({ A: wall, B: stack, C: shelf }[variant()]());
    // In the crate only. Now playing has the home target in the same corner, and a screen that
    // is about to go dark is not a place to offer choices.
    app.append(themePicker(THEME, setTheme));
    // Now playing prints the artist large already; repeating it small underneath it would
    // just be the screen talking to itself.
    app.append(caption(ALBUMS[state.cursor]));
  }

  if (state.view.name !== "crate") {
    const home = el(`<button class="btn home" aria-label="Tilbake til bunken">${ICON.home}</button>`);
    home.addEventListener("click", goHome);
    app.append(home);
  }

  // The volume readout, wherever he is. On now playing the blocks are permanent; in the crate
  // and the number line they appear on change and let themselves go.
  if (state.view.name !== "playing" && performance.now() - state.volumeAt < VOL_FLASH_MS) {
    const flash = el(`<div class="vol-flash" aria-hidden="true"></div>`);
    flash.append(volumeBlocks());
    app.append(flash);
  }

  app.append(switcher());
}
render();
