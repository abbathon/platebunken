/**
 * The parent asking for one specific album by name (`server/manualAdd.ts`).
 *
 *   node --test src/server/
 *
 * Two rules this defends:
 *   - a request never bypasses the gate: it only ever calls `suggest()`
 *   - a request for something already in the crate is refused, even under a different uri —
 *     the exact live bug ("Ramones — Ramones" and "Ozzy Osbourne — No More Tears" each
 *     reaching the review queue a second time, under a new Qobuz uri, after the parent had
 *     already approved and released the first one) that `curate/worker.ts`'s `releaseKey`
 *     exists to catch, here on the manual path instead of the automatic one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../store/db.ts";
import { approve, ensureProfile, reviewQueue, suggest, upsertAlbum, type AlbumInput } from "../store/crate.ts";
import type { MassClient } from "../ma/client.ts";
import type { Album, Track } from "../ma/types.ts";
import { requestAlbum, searchCatalogue } from "./manualAdd.ts";

const KID = "child_a";

function store() {
  const db = openStore(":memory:");
  ensureProfile(db, KID, "child A");
  return db;
}

const album = (n: number, overrides: Partial<AlbumInput> = {}): AlbumInput => ({
  uri: `qobuz://album/${n}`, provider: "qobuz", itemId: String(n),
  artist: `Artist ${n}`, title: `Album ${n}`, year: 1990 + n, coverProxyId: `cover-${n}`,
  ...overrides,
});

const image = { type: "thumb" as const, path: "x", provider: "qobuz", remotely_accessible: true, proxy_id: "p" };

const searchResult = (n: number, overrides: Partial<Album> = {}): Album => ({
  item_id: String(n), provider: "qobuz", uri: `qobuz://album/${n}`, name: `Album ${n}`, version: "",
  artists: [{ item_id: `a${n}`, name: `Artist ${n}` }],
  metadata: { images: [image] },
  ...overrides,
});

/** A Music Assistant that answers `music/search` from a fixed list and `albumTracks` from a map. */
function fakeMa(albums: Album[], trackAnswers: Record<string, Track[]> = {}) {
  return {
    async command(cmd: string) {
      assert.equal(cmd, "music/search");
      return { albums };
    },
    async albumTracks(itemId: string) {
      return trackAnswers[itemId] ?? [];
    },
  } as unknown as MassClient;
}

/* ── searchCatalogue ──────────────────────────────────────────────── */

test("an album with no artwork does not appear in search results", () => {
  const db = store();
  const client = fakeMa([searchResult(1, { metadata: {} }), searchResult(2)]);
  return searchCatalogue(db, client, "test").then((out) => {
    assert.deepEqual(out.map((r) => r.title), ["Album 2"]);
  });
});

test("the same release from two catalogue listings is shown once", () => {
  const db = store();
  const client = fakeMa([
    searchResult(1),
    { ...searchResult(1), uri: "qobuz://album/1-remaster", item_id: "1-remaster" },
  ]);
  return searchCatalogue(db, client, "test").then((out) => {
    assert.equal(out.length, 1);
  });
});

test("a release already known under a different uri is flagged, not hidden", () => {
  const db = store();
  upsertAlbum(db, album(1));
  const client = fakeMa([{ ...searchResult(1), uri: "qobuz://album/1-different-pressing" }]);
  return searchCatalogue(db, client, "test").then((out) => {
    assert.equal(out.length, 1);
    assert.equal(out[0].known, true);
  });
});

/* ── requestAlbum ─────────────────────────────────────────────────── */

test("a request lands in the review queue as source 'request', undecided", () => {
  const db = store();
  const client = fakeMa([], { "1": [{ item_id: "t1", uri: "qobuz://track/1", name: "Track 1", track_number: 1, metadata: {} } as Track] });
  return requestAlbum(db, client, KID, album(1)).then((out) => {
    assert.equal(out.ok, true);
    const q = reviewQueue(db);
    assert.equal(q.length, 1);
    assert.equal(q[0].source, "request");
    assert.equal(q[0].album.uri, "qobuz://album/1");
  });
});

test("a request is refused for a release already in the crate, even under a different uri", () => {
  const db = store();
  const inCrate = album(1);
  upsertAlbum(db, inCrate);
  suggest(db, inCrate.uri, "similar", "test");
  approve(db, KID, inCrate.uri);

  const client = fakeMa([]);
  const differentPressing = album(1, { uri: "qobuz://album/1-different-pressing", itemId: "1b" });
  return requestAlbum(db, client, KID, differentPressing).then((out) => {
    assert.equal(out.ok, false);
    assert.match(out.error ?? "", /allerede/);
    assert.equal(reviewQueue(db).length, 0, "must not have queued a second copy of it");
  });
});
