/**
 * The seed is the one place in this product where approval is automatic, and the one write
 * that cannot be taken back: a position is append-only and the triggers refuse to renumber.
 * So these tests are about what the seed must REFUSE to do, not about coverage.
 *
 *   node --test src/store/
 *
 * Every one of these rules lived in scripts/db-seed.ts, where the only way to exercise it was
 * to run the script against a live Music Assistant and watch. That is why they had no tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "./db.ts";
import { counts, crate, tracks } from "./crate.ts";
import { seedCrate, type SeedSource } from "./seed.ts";
import type { Track } from "../ma/types.ts";

const KID = "child_a";

const store = () => openStore(":memory:");

/** A playlist entry as `music/playlists/playlist_tracks` returns it: a track carrying its album. */
function entry(album: number, n = 1): Track {
  return {
    item_id: `t${album}-${n}`,
    uri: `qobuz://track/${album}-${n}`,
    name: `Track ${n}`,
    track_number: n,
    album: { item_id: String(album), name: `Album ${album}`, uri: `qobuz://album/${album}` },
    artists: [{ item_id: `a${album}`, name: `Artist ${album}` }],
    metadata: {
      images: [{
        type: "thumb", path: `/cover/${album}`, proxy_id: `cover-${album}`,
        provider: "qobuz", remotely_accessible: false,
      }],
    },
  } as Track;
}

/** An album's own track list, as `music/albums/album_tracks` returns it. */
const albumTrack = (album: number, n: number): Track => ({
  item_id: `t${album}-${n}`,
  uri: `qobuz://track/${album}-${n}`,
  name: `Track ${n}`,
  track_number: n,
  metadata: {},
} as Track);

/**
 * A stand-in for Music Assistant that answers from a script.
 *
 * `reads` is the successive answers to `playlistTracks()` — which is the whole point of the
 * port: the guard below is about what happens when the SECOND answer differs from the first,
 * and that is unreachable through a client that talks to a real server.
 */
function source(reads: Track[][], albums: Record<string, Track[]> = {}): SeedSource & { calls: number } {
  return {
    calls: 0,
    async playlistTracks() {
      const i = Math.min(this.calls++, reads.length - 1);
      return reads[i]!;
    },
    async albumTracks(itemId: string) {
      const t = albums[itemId];
      if (!t) throw new Error(`no track list for ${itemId}`);
      return t;
    },
  };
}

/** Never actually wait four seconds in a test. The delay is the source's business, not ours. */
const run = (db: ReturnType<typeof store>, src: SeedSource, over = {}) =>
  seedCrate(db, src, { profileId: KID, write: true, wait: async () => {}, onLog: () => {}, ...over });

test("a playlist that is still syncing is refused, and nothing is written", async () => {
  const db = store();
  // Three tracks, then seventeen. Observed during development: MA answers from a partial
  // sync and the second read is the real one. Seeding from the first would freeze a wrong
  // order into an append-only structure.
  const partial = [entry(1), entry(2), entry(3)];
  const full = [...partial, ...Array.from({ length: 14 }, (_, i) => entry(i + 4))];

  const report = await run(db, source([partial, full]));

  assert.equal(report.ok, false);
  assert.match(report.error ?? "", /syncing/i);
  assert.equal(counts(db, KID).inCrate, 0, "a refused seed must not half-write a crate");
});

test("two reads that agree are trusted, and the crate is seeded", async () => {
  const db = store();
  const list = [entry(1), entry(2)];

  const report = await run(db, source([list, list]));

  assert.equal(report.ok, true);
  assert.equal(report.albums, 2);
  assert.equal(counts(db, KID).inCrate, 2);
});

test("the playlist is read twice even when the first answer looks complete", async () => {
  const db = store();
  const src = source([[entry(1)], [entry(1)]]);

  await run(db, src);

  assert.equal(src.calls, 2, "reading once is the bug this guard exists to prevent");
});

test("the parent's order is the crate's order, and an album's first appearance wins", async () => {
  const db = store();
  // Album 2 appears again at the end. The crate must keep it at the position its FIRST
  // track gave it: the parent's ordering is the product, not a detail.
  const list = [entry(1, 1), entry(2, 1), entry(1, 2), entry(3, 1), entry(2, 2)];

  await run(db, source([list, list]));

  const slots = crate(db, KID);
  assert.deepEqual(slots.map((s) => s.album?.title), ["Album 1", "Album 2", "Album 3"]);
  assert.deepEqual(slots.map((s) => s.position), [0, 1, 2]);
});

test("the seed does not trickle: every album is in the crate at once", async () => {
  const db = store();
  const list = Array.from({ length: 6 }, (_, i) => entry(i + 1));

  const report = await run(db, source([list, list]));

  // A child cannot wait a fortnight for his own record collection to arrive, and there is no
  // existing crate for a new record to stand out against. §4.1's trickle starts after this.
  assert.equal(report.released, 6);
  assert.equal(counts(db, KID).waitingToRelease, 0);
});

test("a dry run reads everything and writes nothing", async () => {
  const db = store();
  const list = [entry(1), entry(2)];

  const report = await run(db, source([list, list], { "1": [albumTrack(1, 1)] }), { write: false });

  assert.equal(report.ok, true);
  assert.equal(report.albums, 2, "a dry run must still report what it WOULD do");
  assert.equal(counts(db, KID).albums, 0);
  assert.equal(counts(db, KID).inCrate, 0);
});

test("re-seeding appends and never renumbers what the child already has", async () => {
  const db = store();
  const first = [entry(1), entry(2)];
  await run(db, source([first, first]));

  // The parent adds a record to the front of their playlist. The crate must not reshuffle:
  // position 0 is the only index a pre-reader has into his own music.
  const second = [entry(9), ...first];
  const report = await run(db, source([second, second]));

  assert.equal(report.fresh, 1);
  assert.equal(report.already, 2);
  const slots = crate(db, KID);
  assert.deepEqual(slots.map((s) => s.album?.title), ["Album 1", "Album 2", "Album 9"]);
});

test("an album whose track list will not load still enters the crate", async () => {
  const db = store();
  const list = [entry(1), entry(2)];

  // Album 2's tracks throw. The record plays from its own uri; what is missing is the
  // number line, not the album.
  const report = await run(db, source([list, list], { "1": [albumTrack(1, 1), albumTrack(1, 2)] }));

  assert.equal(report.ok, true);
  assert.equal(report.noTracks, 1);
  assert.equal(counts(db, KID).inCrate, 2);
  assert.equal(tracks(db, "qobuz://album/1").length, 2);
  assert.equal(tracks(db, "qobuz://album/2").length, 0);
});

test("a re-seed refreshes the number line of an album already in the crate", async () => {
  const db = store();
  const list = [entry(1)];
  await run(db, source([list, list]));
  assert.equal(tracks(db, "qobuz://album/1").length, 0);

  // Backfills albums seeded before tracks were stored, and picks up a re-tag. The tracks are
  // the one part of an album allowed to change; its position never is.
  await run(db, source([list, list], { "1": [albumTrack(1, 1), albumTrack(1, 2)] }));

  assert.equal(tracks(db, "qobuz://album/1").length, 2);
  assert.equal(crate(db, KID)[0]?.position, 0);
});

test("a playlist entry with no album is skipped rather than seeding a nameless record", async () => {
  const db = store();
  const orphan = { ...entry(5), album: null } as Track;
  const list = [entry(1), orphan];

  const report = await run(db, source([list, list]));

  assert.equal(report.albums, 1);
  assert.equal(counts(db, KID).inCrate, 1);
});
