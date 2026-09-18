// PROTOTYPE — three crates on one route, switchable with ?variant=A|B|C.
// Question: does browsing feel like flipping records, and can a 4-year-old drive it?
import { loadLibrary, seedCount, type Album } from "./library";
import { coverSvg } from "./cover";

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
type View = { name: "crate" } | { name: "playing"; album: Album; track: number };
const state = {
  view: { name: "crate" } as View,
  page: 0,          // A
  cursor: 0,        // B and C, and the focused album in A
  focusTrack: 1,    // focused row in the track list
  playing: false,
  volume: 3,        // of 7 blocks
};

const PER_PAGE = 9;
const COLS = 3;

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
  for (const a of ALBUMS) {
    if (!a.cover) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = a.cover.sm;
  }
}
warmCovers();

const app = document.getElementById("app")!;
const variant = (): "A" | "B" | "C" =>
  (new URLSearchParams(location.search).get("variant") ?? "A").toUpperCase() as "A" | "B" | "C";

const el = (html: string): HTMLElement => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
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

const coverEl = (a: Album, onPlay: (a: Album) => void, which: "sm" | "lg" = "sm"): HTMLElement => {
  const b = el(`<button class="cover" aria-label="${esc(a.artist)} – ${esc(a.title)}">${art(a, which)}</button>`);
  withImageFallback(b, a);
  b.addEventListener("click", () => onPlay(a));
  return b;
};

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
const play = (album: Album, track = 1) => {
  state.view = { name: "playing", album, track };
  state.focusTrack = track;
  state.playing = true;
  render();
};
const goHome = () => { state.view = { name: "crate" }; render(); };

// ── A · Vegg — 9 covers, tap any one. Position is the index. ─────
function wall(): HTMLElement {
  const per = PER_PAGE, pages = Math.ceil(ALBUMS.length / per);
  // The page follows the focused album, so arrow keys flip pages without a separate concept.
  state.page = Math.floor(state.cursor / per);
  const root = el(`<section class="stage wall"><div class="wall__grid"></div>
    <div class="wall__foot"></div></section>`);
  const grid = root.querySelector(".wall__grid")!;
  ALBUMS.slice(state.page * per, state.page * per + per).forEach((a, i) => {
    const cell = coverEl(a, play);
    if (state.page * per + i === state.cursor) cell.dataset.focus = "1";
    grid.append(cell);
  });

  const foot = root.querySelector(".wall__foot")!;
  const prev = el(`<button class="btn btn--lg" aria-label="Forrige side">${ICON.left}</button>`);
  const next = el(`<button class="btn btn--lg" aria-label="Neste side">${ICON.right}</button>`);
  prev.toggleAttribute("disabled", state.page === 0);
  next.toggleAttribute("disabled", state.page >= pages - 1);
  prev.addEventListener("click", () => { moveCursor(-per); });
  next.addEventListener("click", () => { moveCursor(per); });
  const pips = el(`<div class="pips">${Array.from({ length: pages },
    (_, i) => `<span class="pip" data-on="${i === state.page ? 1 : 0}"></span>`).join("")}</div>`);
  foot.append(prev, pips, next);
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
    if (d === 0) cell.dataset.focus = "1";
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
    if (i === state.cursor) cell.dataset.focus = "1";
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

// ── now playing — shared by all three ────────────────────────────
function nowPlaying(album: Album, track: number): HTMLElement {
  const root = el(`<section class="stage np">
    <div class="np__art"><div class="cover" id="np-art" style="cursor:default">${art(album, "lg")}</div></div>
    <div class="np__side">
      <div>
        <h1 class="np__artist">${esc(album.artist.toUpperCase())}</h1>
        <p class="np__album">${esc(album.title)}${album.year ? ` · ${album.year}` : ""}</p>
      </div>
      <ol class="tracks"></ol>
      <div class="transport"></div>
    </div></section>`);

  withImageFallback(root.querySelector("#np-art") as HTMLElement, album);

  const list = root.querySelector(".tracks")!;
  if (album.tracks.length === 0) {
    list.append(el(`<li class="tracks__none">Music Assistant returned no tracks for this album.</li>`));
  }
  album.tracks.forEach((t) => {
    const row = el(`<li><button class="track" aria-current="${t.n === track}" data-focus="${t.n === state.focusTrack ? 1 : 0}">
      <span class="track__n">${t.n}</span><span class="track__t">${esc(t.title)}</span></button></li>`);
    row.querySelector("button")!.addEventListener("click", () => {
      state.view = { name: "playing", album, track: t.n }; state.playing = true; render();
    });
    list.append(row);
  });

  const tp = root.querySelector(".transport")!;
  const pp = el(`<button class="btn btn--lg btn--play" aria-label="${state.playing ? "Pause" : "Spill"}">${state.playing ? ICON.pause : ICON.play}</button>`);
  pp.addEventListener("click", () => { state.playing = !state.playing; render(); });
  const skip = el(`<button class="btn btn--lg" aria-label="Neste spor">${ICON.next}</button>`);
  skip.addEventListener("click", () => {
    const n = Math.min(album.tracks.length, track + 1);
    state.view = { name: "playing", album, track: n }; render();
  });
  const vol = el(`<div class="vol"></div>`);
  const down = el(`<button class="btn" aria-label="Lavere">${ICON.minus}</button>`);
  const up   = el(`<button class="btn" aria-label="Høyere">${ICON.plus}</button>`);
  const blocks = () => el(`<div class="vol__blocks">${Array.from({ length: 7 },
    (_, i) => `<span class="vol__b" data-on="${i < state.volume ? 1 : 0}"></span>`).join("")}</div>`);
  down.addEventListener("click", () => { state.volume = Math.max(0, state.volume - 1); render(); });
  up.addEventListener("click",   () => { state.volume = Math.min(7, state.volume + 1); render(); }); // ceiling is silent
  vol.append(down, blocks(), up);
  tp.append(pp, skip, vol);
  return root;
}

// ── switcher: obviously not part of the design being judged ──────
const NAMES = { A: "Vegg · the wall", B: "Bunken · the stack", C: "Hylla · the shelf" };

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
    <span>${cur} (${NAMES[cur]}) · ${src}</span><button aria-label="Next variant">→</button></div>`);
  bar.children[0].addEventListener("click", () => hopVariant(-1));
  bar.children[2].addEventListener("click", () => hopVariant(1));
  return bar;
}

// ── keyboard: the primary input ───────────────────────────────────
//
// A keypress cannot miss, which matters more here than anywhere else: measured tap
// accuracy on an intended target at ages 4-6 is about 57%. Four arrows map onto a grid
// without reading, and Enter is unambiguous. Mouse and touch keep working alongside.
//
//   ← ↑ → ↓   move            Enter / Space  play        Esc  back to the crate
//   + / -     volume          Shift + ← →    switch prototype variant

function clampCursor(n: number): number {
  return Math.max(0, Math.min(ALBUMS.length - 1, n));
}

function moveCursor(delta: number): void {
  const next = clampCursor(state.cursor + delta);
  if (next === state.cursor) return;   // silent at the ends: no error, nothing happens
  state.cursor = next;
  render();
}

function setVolume(delta: number): void {
  state.volume = Math.max(0, Math.min(7, state.volume + delta));
  render();
}

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName ?? "";
  if (/^(INPUT|TEXTAREA)$/.test(tag)) return;

  // Variant switching is prototype chrome, so it gets out of the child's way.
  if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    hopVariant(e.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  const v = variant();
  const playing = state.view.name === "playing";

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      playing ? setVolume(-1) : moveCursor(-1);
      return;
    case "ArrowRight":
      e.preventDefault();
      playing ? setVolume(1) : moveCursor(1);
      return;
    case "ArrowUp":
      e.preventDefault();
      if (playing) moveTrack(-1);
      else moveCursor(v === "A" ? -COLS : -1);
      return;
    case "ArrowDown":
      e.preventDefault();
      if (playing) moveTrack(1);
      else moveCursor(v === "A" ? COLS : 1);
      return;
    case "Enter":
    case " ":
      e.preventDefault();
      if (playing) {
        const { album } = state.view as { album: Album };
        state.view = { name: "playing", album, track: state.focusTrack };
        state.playing = true;
      } else {
        play(ALBUMS[state.cursor]);
        return;
      }
      render();
      return;
    case "Escape":
    case "Backspace":
      e.preventDefault();
      if (playing) goHome();
      return;
    case "+": case "=":
      e.preventDefault(); setVolume(1); return;
    case "-": case "_":
      e.preventDefault(); setVolume(-1); return;
  }
}

function moveTrack(delta: number): void {
  if (state.view.name !== "playing") return;
  const n = state.view.album.tracks.length;
  if (n === 0) return;
  state.focusTrack = Math.max(1, Math.min(n, state.focusTrack + delta));
  render();
  document.querySelector('.track[data-focus="1"]')?.scrollIntoView({ block: "nearest" });
}

addEventListener("keydown", onKey);

function render() {
  app.replaceChildren();
  if (state.view.name === "playing") {
    app.append(nowPlaying(state.view.album, state.view.track));
    const home = el(`<button class="btn home" aria-label="Tilbake til bunken">${ICON.home}</button>`);
    home.addEventListener("click", goHome);
    app.append(home);
  } else {
    app.append({ A: wall, B: stack, C: shelf }[variant()]());
  }
  app.append(switcher());
}
render();
