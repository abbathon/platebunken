// PROTOTYPE data loader. Prefers the real snapshot (npm run snapshot); falls back to the
// mock set so the prototype still runs with no Music Assistant in reach.
import { ALBUMS as MOCK, type Album as MockAlbum } from "./albums";

export type Cover = { sm: string; lg: string };
export type Album = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  explicit: boolean | null;
  cover: Cover | null;
  /** Only used when `cover` is null — the procedural fallback needs a stable seed. */
  hue: number;
  mark: number;
  tracks: { n: number; title: string }[];
};

/**
 * Stable pseudo-random seed from an id, so an artless album looks the same every load.
 *
 * FNV-1a plus a full avalanche mix. A naive `h * 31 + c` is not enough here: MA's library
 * item ids are short sequential integers, so neighbouring albums produced neighbouring
 * hues and an identical mark every time. The whole point of the fallback is that two
 * untagged albums must not look like the same record.
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

const fromMock = (a: MockAlbum): Album => ({
  id: a.id, artist: a.artist, title: a.title, year: a.year, explicit: null,
  cover: null, hue: a.hue, mark: a.mark,
  tracks: a.tracks.map((t) => ({ n: t.n, title: t.title })),
});

export type Library = { albums: Album[]; source: "live" | "mock"; generatedAt?: string };

export async function loadLibrary(): Promise<Library> {
  try {
    const res = await fetch("./library.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const albums: Album[] = data.albums.map((a: any) => ({
      id: a.id,
      artist: a.artist || "—",
      title: a.title,
      year: a.year ?? null,
      explicit: a.explicit ?? null,
      cover: a.cover ?? null,
      ...seed(a.id),
      tracks: a.tracks?.length ? a.tracks : [],
    }));
    return { albums, source: "live", generatedAt: data.generatedAt };
  } catch {
    return { albums: MOCK.map(fromMock), source: "mock" };
  }
}
