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
  tracks: { n: number; title: string; uri: string | null }[];
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
  tracks: (a.tracks ?? []).map((t: any) => ({ n: t.n, title: t.title, uri: t.uri ?? null })),
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
    recent: pick(data.shelves?.recent ?? []),
    played: pick(data.shelves?.played ?? []),
  };
}

/**
 * Tell the store he played a record. Fire-and-forget: the shelves are worth having and not
 * worth a visible failure, and principle 4 says the child never sees an error. A lost play is
 * one album slightly out of order on a shelf.
 */
export function recordPlay(uri: string): void {
  void fetch("/api/played", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri }),
  }).catch((e) => console.warn(`[played] ${(e as Error).message}`));
}
