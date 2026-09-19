/**
 * Building the initial crate from the parent's seed playlist.
 *
 * The seed playlist is the one place in this system where approval is automatic, and the
 * justification is narrow: **the parent built that playlist by hand, so the playlist IS the
 * act of approval.** Every other source — similar-artist, charts, the older child's requests —
 * goes through the review queue at /admin. Do not widen this.
 *
 * The order of the playlist becomes the order of the crate, permanently. Position 2 is the
 * same album for the next decade, and it is the only index a pre-reader has into his own
 * music, so this module refuses to guess rather than seeding from an answer it is unsure of.
 *
 * ## Why this is a module and not a script
 *
 * It was a script — `scripts/db-seed.ts` — and `scripts/` does not ship in the image. That
 * made the rules below reachable only from a developer's checkout, pointed at a developer's
 * copy of the store rather than at the deployed volume, and testable only by running them
 * against a live Music Assistant and watching the output. The guard that protects the one
 * irreversible write in the product had no test at all.
 *
 * ## Why a port rather than a MassClient
 *
 * `SeedSource` is two methods wide because that is all seeding needs, and because the rule
 * that matters most here — two reads, and they must agree — is a rule about what a source
 * ANSWERS. A fake that answers three tracks and then seventeen is one object; arranging for
 * a real Music Assistant to be caught mid-sync is not arrangeable at all. It also keeps this
 * file free of a runtime dependency on `src/ma`, which is the same reason `crate.ts` imports
 * only the Album type from there.
 */
import type { DatabaseSync } from "node:sqlite";
import type { Album, Track } from "../ma/types.ts";
import {
  approve, counts, ensureProfile, fromMassAlbum, release, setTracks, suggest, upsertAlbum,
  type Counts,
} from "./crate.ts";

/**
 * Where the seed playlist comes from.
 *
 * `playlistTracks` is called more than once by design — see `SETTLE_MS` — so an implementation
 * must actually re-read rather than memoise the first answer.
 */
export interface SeedSource {
  /** The seed playlist, in the parent's order, as tracks carrying their albums. */
  playlistTracks(): Promise<Track[]>;
  /**
   * One album's own track list. May reject: an album whose tracks will not load still belongs
   * in the crate, because it plays from its own uri and what is missing is the number line.
   */
  albumTracks(itemId: string, provider: string): Promise<Track[]>;
}

/**
 * How long to leave between the two playlist reads.
 *
 * Long enough for an in-progress provider sync to move, short enough that an operator does
 * not think it has hung. Four seconds is what caught the 3-then-17 case in development.
 */
export const SETTLE_MS = 4000;

export interface SeedOptions {
  profileId: string;
  profileLabel?: string;
  /** false runs every read and writes nothing. */
  write?: boolean;
  settleMs?: number;
  /** Injected so tests do not wait four real seconds for a rule about disagreement. */
  wait?: (ms: number) => Promise<void>;
  onLog?: (message: string) => void;
}

export interface SeedReport {
  /** false means nothing was written and `error` says why. Never a partial seed. */
  ok: boolean;
  error?: string;
  /** Tracks in the playlist, and the distinct albums they resolved to. */
  playlistTracks: number;
  albums: number;
  /** Albums not already in this profile's crate, and albums that were. */
  fresh: number;
  already: number;
  /** Seeded with no artwork — invisible in a cover-art interface. Run the beets pass. */
  noArtwork: number;
  /** Seeded with an empty number line. The album plays; its numerals are missing. */
  noTracks: number;
  /** How many albums the seed put on the grid. Zero on a dry run. */
  released: number;
  /** The crate as it stands after the run. */
  counts: Counts;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Seed the crate, or refuse to.
 *
 * Returns a report rather than exiting: the decision to stop the process belongs to the
 * adapter, and a caller inside the server must not be able to be killed by a seed run.
 */
export async function seedCrate(
  db: DatabaseSync,
  source: SeedSource,
  opts: SeedOptions,
): Promise<SeedReport> {
  const write = opts.write ?? false;
  const wait = opts.wait ?? sleep;
  const log = opts.onLog ?? ((m: string) => console.log(m));
  const profileId = opts.profileId;

  ensureProfile(db, profileId, opts.profileLabel ?? profileId);

  const empty = (over: Partial<SeedReport>): SeedReport => ({
    ok: true, playlistTracks: 0, albums: 0, fresh: 0, already: 0,
    noArtwork: 0, noTracks: 0, released: 0, counts: counts(db, profileId), ...over,
  });

  /**
   * Read twice, and require agreement.
   *
   * A provider playlist can return a PARTIAL answer while Music Assistant is still syncing
   * it — one read during development gave 3 tracks and a later one gave 17. Seeding from a
   * partial read would freeze a wrong order into an append-only structure, which is the one
   * mistake in this product that cannot be undone. Length is the check because it is the
   * thing that was observed to change; a playlist that is stable in length is stable.
   */
  const first = await source.playlistTracks();
  await wait(opts.settleMs ?? SETTLE_MS);
  const second = await source.playlistTracks();
  if (first.length !== second.length) {
    return empty({
      ok: false,
      error:
        `Playlist is still syncing: ${first.length} tracks, then ${second.length}. ` +
        `Seeding now would freeze a partial order into an append-only crate. Re-run shortly.`,
      playlistTracks: second.length,
    });
  }

  // First appearance in the playlist wins: that is the order the parent put them in. An
  // album's later tracks must not be able to move it.
  const albums = new Map<string, Album>();
  for (const t of second) {
    const al = t.album as Album | null | undefined;
    if (al?.uri && !albums.has(al.uri)) {
      albums.set(al.uri, { ...al, artists: t.artists ?? al.artists } as Album);
    }
  }
  log(`seed playlist: ${second.length} tracks -> ${albums.size} albums`);

  const before = counts(db, profileId);
  if (before.inCrate > 0) {
    log(`crate already holds ${before.inCrate} albums; new seed albums will be APPENDED, never inserted.`);
  }

  let fresh = 0, already = 0, noArtwork = 0, noTracks = 0;
  const known = db.prepare(`SELECT 1 FROM approved WHERE profile_id = ? AND uri = ?`);

  for (const [uri, raw] of albums) {
    const a = fromMassAlbum(raw);
    if (!a.coverProxyId) noArtwork++;
    const seen = Boolean(known.get(profileId, uri));
    if (seen) already++; else fresh++;

    /**
     * The number line, cached into the store.
     *
     * Refreshed even for an album already in the crate, so a re-run backfills albums seeded
     * before tracks were stored and picks up a re-tag. Tracks are the only part of an album
     * allowed to change — its position never is.
     *
     * The track uri is what `play_media`'s `start_item` takes, so starting an album at track
     * 7 is one command rather than a play followed by a jump.
     */
    let list: { n: number; title: string; uri: string | null }[] = [];
    try {
      const raw = await source.albumTracks(a.itemId, a.provider);
      list = raw.map((t, i) => ({ n: t.track_number ?? i + 1, title: t.name, uri: t.uri ?? null }));
    } catch (e) {
      log(`  ! no track list for ${a.artist} — ${a.title}: ${(e as Error).message}`);
    }
    if (list.length === 0) noTracks++;

    if (!write) continue;
    upsertAlbum(db, a);
    if (list.length) setTracks(db, uri, list);
    if (seen) continue;
    suggest(db, uri, "seed", "seed playlist");
    approve(db, profileId, uri);
  }

  /**
   * The seed does not trickle.
   *
   * §4.1 releases one album a day so there is nearly always a reason to walk over and look —
   * but that needs an existing crate for the new record to stand out against, and a child
   * cannot wait a fortnight for his own record collection to arrive. The trickle starts
   * after this.
   */
  const released = write ? release(db, profileId, albums.size).length : 0;

  return {
    ok: true,
    playlistTracks: second.length,
    albums: albums.size,
    fresh, already, noArtwork, noTracks, released,
    counts: counts(db, profileId),
  };
}
