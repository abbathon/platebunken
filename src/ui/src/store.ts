/**
 * The page's side of the store. This file replaced `library.ts`, and the difference is the
 * whole point of the change.
 *
 * `library.ts` fetched `public/library.json` — a snapshot of the **whole** music library —
 * and filtered it on a `seed` boolean, which meant the approval gate in `src/store/` was
 * tested, correct, and called by nothing. Its error path was worse: any fetch failure fell
 * back to a hardcoded mock set of twenty albums nobody had approved, several of which nobody
 * would. On the kiosk a briefly-unreachable store would have put those in front of the child.
 *
 * **There is no fallback here.** A failure throws, and the page renders §10's sleepy state
 * and retries. An empty crate is a bad screen; the wrong albums is a broken promise.
 */
export type Cover = { sm: string; lg: string };

export type Track = {
  n: number;
  title: string;
  uri: string | null;
  /** A track he keeps choosing. Derived from the play log — the algorithmic mark. */
  favourite: boolean;
  /** A track he was told is a favourite, through a tap or from admin — the manual mark. */
  favouriteManual: boolean;
};

export type Album = {
  /** The album's identity everywhere in the page. It is the Music Assistant uri. */
  id: string;
  /** The same value, named for what it is where it is sent to a speaker. */
  uri: string;
  artist: string;
  title: string;
  year: number | null;
  /** null means unknown. Absent is never clean (docs/research/03). */
  explicit: boolean | null;
  cover: Cover | null;
  /** Only used when `cover` is null — the procedural fallback needs a stable seed. */
  hue: number;
  mark: number;
  tracks: Track[];
};

/**
 * The crate as the page holds it.
 *
 * `slots` may contain nulls and **must not be compacted**. A null is a withdrawn album, and
 * its empty tile is what keeps every position after it exactly where the child left it. The
 * gap is the feature; closing it would move his whole map of his own music by one.
 */
export type Crate = {
  slots: (Album | null)[];
  new: Album[];
  recent: Album[];
  played: Album[];
};

/**
 * Stable pseudo-random seed from an id, so an artless album looks the same every load.
 *
 * FNV-1a plus a full avalanche mix. A naive `h * 31 + c` is not enough here: MA's library
 * item ids are short sequential integers, so neighbouring albums produced neighbouring hues
 * and an identical mark every time. The whole point of the fallback is that two untagged
 * albums must not look like the same record.
 */
function seed(id: string): { hue: number; mark: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return { hue: h % 360, mark: (h >>> 8) % 20 };
}

const toAlbum = (a: any): Album => ({
  id: a.uri,
  uri: a.uri,
  artist: a.artist || "—",
  title: a.title,
  year: a.year ?? null,
  explicit: a.explicit ?? null,
  cover: a.cover ?? null,
  ...seed(a.uri),
  tracks: (a.tracks ?? []).map((t: any) => ({
    n: t.n, title: t.title, uri: t.uri ?? null,
    favourite: !!t.favourite, favouriteManual: !!t.favouriteManual,
  })),
});

export async function loadCrate(): Promise<Crate> {
  const res = await fetch("/api/crate", { cache: "no-store" });
  if (!res.ok) throw new Error(`crate: ${res.status}`);
  const data = await res.json();

  const slots: (Album | null)[] = (data.slots ?? []).map((s: any) => (s.album ? toAlbum(s.album) : null));

  // The shelves arrive as uris into the crate, never as albums of their own: an album cannot
  // reach a shelf without being in the crate, so the gate holds on the way out too.
  const byUri = new Map<string, Album>();
  for (const a of slots) if (a) byUri.set(a.uri, a);
  const pick = (uris: string[]) => uris.map((u) => byUri.get(u)).filter((a): a is Album => !!a);

  return {
    slots,
    new: pick(data.shelves?.new ?? []),
    recent: pick(data.shelves?.recent ?? []),
    played: pick(data.shelves?.played ?? []),
  };
}

/**
 * Tell the store he played a record. Fire-and-forget: the shelves are worth having and not
 * worth a visible failure, and principle 4 says the child never sees an error. A lost play is
 * one album slightly out of order on a shelf.
 */
export function recordPlay(uri: string, track?: number): void {
  void fetch("/api/played", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The track number is what makes a favourite possible: it records which track he CHOSE,
    // not merely that the album was on.
    body: JSON.stringify({ uri, track }),
  }).catch((e) => console.warn(`[played] ${(e as Error).message}`));
}

/**
 * Set or clear a manual like. Fire-and-forget, like `recordPlay` — the caller already updates
 * its own in-memory copy optimistically, and a lost write here is a mark that reverts on the
 * next crate fetch, not a broken screen.
 */
export function recordFavourite(uri: string, track: number, on: boolean): void {
  void fetch("/api/favourite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri, track, on }),
  }).catch((e) => console.warn(`[favourite] ${(e as Error).message}`));
}

/* ── settings ──────────────────────────────────────────────────────────── */

/**
 * Settings, from the server.
 *
 * They used to live only in page memory, so a kiosk that reboots nightly forgot the theme, the
 * language and the numeral face every morning. `volumeCeiling` and `volumeStart` arrive as
 * facts rather than controls: they are hearing-safety values set from an SPL measurement at
 * the pillow, so they belong to the deployment's `.env`, not to a screen behind a gate that
 * stops a four-year-old and nobody else.
 */
export async function loadSettings(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch (e) {
    console.warn(`[settings] ${(e as Error).message}`);
    return null;
  }
}

/**
 * Save a change. Fire-and-forget, like everything else the page sends: a setting that fails to
 * persist is a setting that is wrong tomorrow, which is a bad day for the parent and a
 * non-event for the child. Principle 4 — no failure here reaches him.
 */
export function saveSettings(patch: Record<string, unknown>): void {
  void fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }).catch((e) => console.warn(`[settings] ${(e as Error).message}`));
}

/* ── the cover cache ───────────────────────────────────────────────────── */

/**
 * Register the service worker, and ask for storage that survives eviction.
 *
 * Both are best-effort and neither can fail visibly. On a plain-http origin served from another
 * host there is NO service worker — the browser simply refuses, `navigator.serviceWorker` is
 * undefined, and the page carries on with Chromium's ordinary evictable disk cache. That is the
 * secure-origin trap in ARCHITECTURE.md §3.1, and the way out on the kiosk is the
 * `--unsafely-treat-insecure-origin-as-secure` flag the Ansible role sets.
 *
 * `persist()` is what stops the browser evicting the covers under storage pressure. It returns
 * false rather than throwing when the browser declines, and false is survivable: warm covers
 * become likely rather than guaranteed.
 */
export function enableCoverCache(): void {
  if (!("serviceWorker" in navigator)) {
    console.info("[sw] no service worker on this origin — covers fall back to the HTTP cache");
    return;
  }
  void navigator.serviceWorker.register("/sw.js").then(
    async () => {
      const persisted = await navigator.storage?.persist?.();
      if (persisted === false) console.info("[sw] storage is not persistent; covers may be evicted");

      /**
       * Tell the worker what this build's files are called.
       *
       * Vite fingerprints them, so the worker cannot know the names and there is no manifest.
       * The page does know: they are its own script and stylesheet elements. Without this the
       * cached shell was the document alone and an offline reload only worked because Chromium
       * happened to still hold the assets in its evictable HTTP cache — which is to say it
       * worked by luck.
       */
      await navigator.serviceWorker.ready;
      // Array.from, not spread: tsconfig targets a lib where NodeListOf has no Symbol.iterator.
      const scripts = Array.from(document.querySelectorAll("script[src]"))
        .map((el) => (el as HTMLScriptElement).src);
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[as="font"]'))
        .map((el) => (el as HTMLLinkElement).href);
      const urls = [...scripts, ...links].filter((u) => u.startsWith(location.origin));

      navigator.serviceWorker.controller?.postMessage({ type: "precache", urls });
    },
    (e) => console.warn(`[sw] ${(e as Error).message}`),
  );
}
