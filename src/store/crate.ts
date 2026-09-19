/**
 * The approved set — the only thing the child's crate is ever allowed to read from.
 *
 * The gate, stated once: an album reaches the crate only by being suggested, then approved.
 * `approve()` refuses an album that was never in the queue, so there is no function in this
 * module that can put music in front of the child without a person having seen it first.
 * That is ARCHITECTURE.md §5's "architectural boundary, not a setting", made literal.
 */
import type { DatabaseSync } from "node:sqlite";
import type { Album } from "../ma/types.ts";
import { coverProxyId } from "../ma/images.ts";

export type CandidateSource = "seed" | "similar" | "chart" | "request";

export interface AlbumInput {
  uri: string;
  provider: string;
  itemId: string;
  artist: string;
  title: string;
  year?: number | null;
  mbid?: string | null;
  coverProxyId?: string | null;
  /** undefined and null both mean unknown. Never pass false for "no warning present". */
  explicit?: boolean | null;
}

export interface StoredAlbum {
  uri: string;
  provider: string;
  itemId: string;
  artist: string;
  title: string;
  year: number | null;
  mbid: string | null;
  coverProxyId: string | null;
  explicit: boolean | null;
}

/**
 * One slot in the crate. `album` is null for a withdrawn slot, which renders as an empty
 * tile — callers must not compact this array. The gap is the point: it is what keeps every
 * position after it exactly where the child left it.
 */
export interface CrateSlot {
  position: number;
  album: StoredAlbum | null;
}

export interface QueueEntry {
  album: StoredAlbum;
  source: CandidateSource;
  sourceDetail: string | null;
  suggestedAt: string;
  flags: { kind: string; detail: string | null; source: string }[];
}

const now = () => new Date().toISOString();
const bool = (v: boolean | null | undefined) => (v === null || v === undefined ? null : v ? 1 : 0);

const toAlbum = (r: Record<string, unknown>): StoredAlbum => ({
  uri: r.uri as string,
  provider: r.provider as string,
  itemId: r.item_id as string,
  artist: r.artist as string,
  title: r.title as string,
  year: (r.year as number | null) ?? null,
  mbid: (r.mbid as string | null) ?? null,
  coverProxyId: (r.cover_proxy_id as string | null) ?? null,
  explicit: r.explicit === null || r.explicit === undefined ? null : r.explicit === 1,
});

/** Music Assistant's album shape, narrowed to what the store keeps. */
export function fromMassAlbum(a: Album): AlbumInput {
  return {
    uri: a.uri,
    provider: a.provider ?? "library",
    itemId: a.item_id,
    // "[unknown]" — brackets included — is what a tag-less rip comes through as.
    artist: a.artists?.[0]?.name ?? "",
    title: a.name,
    year: a.year ?? null,
    coverProxyId: coverProxyId(a),
    explicit: a.metadata?.explicit ?? null,
  };
}

export function ensureProfile(db: DatabaseSync, id: string, label: string): void {
  db.prepare(
    `INSERT INTO profile (id, label, created_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label`,
  ).run(id, label, now());
}

/**
 * Record an album we know about. This is not approval and does not touch the crate.
 * Re-running keeps first_seen and refreshes the metadata, so a later beets pass that
 * finally gives an album artwork updates it in place without disturbing its position.
 */
export function upsertAlbum(db: DatabaseSync, a: AlbumInput): void {
  db.prepare(
    `INSERT INTO album (uri, provider, item_id, artist, title, year, mbid, cover_proxy_id, explicit, first_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       provider = excluded.provider, item_id = excluded.item_id,
       artist = excluded.artist, title = excluded.title, year = excluded.year,
       mbid = COALESCE(excluded.mbid, album.mbid),
       cover_proxy_id = excluded.cover_proxy_id,
       explicit = COALESCE(excluded.explicit, album.explicit)`,
  ).run(
    a.uri, a.provider, a.itemId, a.artist, a.title,
    a.year ?? null, a.mbid ?? null, a.coverProxyId ?? null, bool(a.explicit), now(),
  );
}

export function getAlbum(db: DatabaseSync, uri: string): StoredAlbum | null {
  const r = db.prepare(`SELECT * FROM album WHERE uri = ?`).get(uri) as Record<string, unknown> | undefined;
  return r ? toAlbum(r) : null;
}

/** Put an album into the review queue. Idempotent per (album, source). */
export function suggest(
  db: DatabaseSync,
  uri: string,
  source: CandidateSource,
  sourceDetail: string | null = null,
): void {
  db.prepare(
    `INSERT INTO candidate (uri, source, source_detail, suggested_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(uri, source) DO NOTHING`,
  ).run(uri, source, sourceDetail, now());
}

/** Advisory only. Nothing in this module reads flags to make a decision. */
export function addFlag(db: DatabaseSync, uri: string, kind: string, source: string, detail: string | null = null): void {
  db.prepare(
    `INSERT INTO flag (uri, kind, detail, source) VALUES (?, ?, ?, ?)
     ON CONFLICT(uri, kind) DO UPDATE SET detail = excluded.detail, source = excluded.source`,
  ).run(uri, kind, detail, source);
}

/** What the parent sees on their phone. Flagged albums first — sorted, never filtered. */
export function reviewQueue(db: DatabaseSync, limit = 50): QueueEntry[] {
  const rows = db.prepare(
    `SELECT c.source, c.source_detail, c.suggested_at, a.*
       FROM candidate c JOIN album a ON a.uri = c.uri
      WHERE c.decision IS NULL
      ORDER BY (SELECT COUNT(*) FROM flag f WHERE f.uri = c.uri) DESC, c.suggested_at ASC
      LIMIT ?`,
  ).all(limit) as Record<string, unknown>[];
  const flags = db.prepare(`SELECT kind, detail, source FROM flag WHERE uri = ?`);
  return rows.map((r) => ({
    album: toAlbum(r),
    source: r.source as CandidateSource,
    sourceDetail: (r.source_detail as string | null) ?? null,
    suggestedAt: r.suggested_at as string,
    flags: flags.all(r.uri as string) as { kind: string; detail: string | null; source: string }[],
  }));
}

/**
 * The gate. Approving does not release: the album is in the crate's future, not yet in the
 * crate. `release()` decides when it appears, so a dozen approvals on a Sunday still arrive
 * one at a time.
 *
 * Throws if the album was never suggested. That refusal is the boundary — it is why no
 * caller can reach the child's crate by inserting an album directly.
 */
export function approve(db: DatabaseSync, profileId: string, uri: string): void {
  const rows = db.prepare(`SELECT decision FROM candidate WHERE uri = ?`).all(uri) as { decision: string | null }[];
  if (!rows.length) throw new Error(`Refusing to approve ${uri}: it was never in the review queue.`);

  /**
   * A rejection is a decision, and approving past it is not "changing your mind" — it is two
   * records disagreeing. Without this the UPDATE below is a no-op (it matches only undecided
   * rows) while the INSERT still queues the album for the crate, leaving `candidate` saying
   * rejected and `approved` saying otherwise. The album then appears in front of the child.
   *
   * Found by probing the gate before building /admin on top of it, which is precisely the
   * caller that produces this: a stale phone tab, a double tap, a back button.
   *
   * An album may arrive from several sources and each is its own row (see schema v1), so the
   * test is whether ANY candidacy is still open or already approved. To genuinely change your
   * mind, `suggest()` it again — that is a new candidacy, and it is visible as one.
   */
  if (!rows.some((r) => r.decision === null || r.decision === "approved")) {
    throw new Error(`Refusing to approve ${uri}: every suggestion of it was rejected. Suggest it again first.`);
  }
  const t = now();
  db.exec("BEGIN");
  try {
    db.prepare(`UPDATE candidate SET decision = 'approved', decided_at = ? WHERE uri = ? AND decision IS NULL`).run(t, uri);
    db.prepare(
      `INSERT INTO approved (profile_id, uri, approved_at) VALUES (?, ?, ?)
       ON CONFLICT(profile_id, uri) DO NOTHING`,
    ).run(profileId, uri, t);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * Withdraw a rejection, putting the album back in the queue.
 *
 * This is the parent's undo on /admin, and it is deliberately NOT `suggest()` again. Two
 * reasons, the first found by driving the real page:
 *
 *   - `suggest` is ON CONFLICT DO NOTHING and `source` is constrained to four values, so
 *     re-suggesting an album that was already rejected from that same source is a silent
 *     no-op. The undo button did nothing at all, and said it had worked.
 *   - `suggest` must never resurrect a rejection, because the curation worker calls it every
 *     day. If it did, every album the parent has ever turned down would come back forever.
 *
 * So reopening is its own verb, called only by a person who is undoing themselves. It clears
 * the rejection rather than recording a competing candidacy: a rejected row sitting beside an
 * open one is two records disagreeing, which is the same fault this module refuses elsewhere.
 *
 * An APPROVED candidacy is never touched — undo is for a rejection, not for taking an album
 * back out of the crate. That is `withdraw()`, and it works differently on purpose.
 */
export function reopenRejected(db: DatabaseSync, uri: string): boolean {
  const out = db.prepare(
    `UPDATE candidate SET decision = NULL, decided_at = NULL
      WHERE uri = ? AND decision = 'rejected'`,
  ).run(uri);
  return Number(out.changes) > 0;
}

/** Rejection closes the queue entries. It never touches an already-approved album. */
export function reject(db: DatabaseSync, uri: string): void {
  db.prepare(`UPDATE candidate SET decision = 'rejected', decided_at = ? WHERE uri = ? AND decision IS NULL`)
    .run(now(), uri);
}

/**
 * The last albums turned down, newest first.
 *
 * Exists because `approve()` refuses to reach past a rejection, which makes a mis-tapped ✗ on
 * a phone unrecoverable unless something shows what was just rejected. The way back is a NEW
 * candidacy — `suggest()` again — so the decision that was taken stays on the record and the
 * change of mind is visible as its own row rather than as an edit.
 *
 * Only albums with no open or approved candidacy are listed: one still in the queue from
 * another source has not actually been turned down.
 */
export function recentlyRejected(db: DatabaseSync, limit = 10): QueueEntry[] {
  const rows = db.prepare(
    `SELECT c.source, c.source_detail, c.decided_at AS suggested_at, a.*
       FROM candidate c JOIN album a ON a.uri = c.uri
      WHERE c.decision = 'rejected'
        AND NOT EXISTS (
          SELECT 1 FROM candidate o
           WHERE o.uri = c.uri AND (o.decision IS NULL OR o.decision = 'approved'))
      GROUP BY c.uri
      ORDER BY c.decided_at DESC
      LIMIT ?`,
  ).all(limit) as Record<string, unknown>[];
  const flags = db.prepare(`SELECT kind, detail, source FROM flag WHERE uri = ?`);
  return rows.map((r) => ({
    album: toAlbum(r),
    source: r.source as CandidateSource,
    sourceDetail: (r.source_detail as string | null) ?? null,
    suggestedAt: r.suggested_at as string,
    flags: flags.all(r.uri as string) as { kind: string; detail: string | null; source: string }[],
  }));
}

/**
 * Release up to `limit` approved albums into the crate, oldest approval first, assigning
 * each the next position. Call it once a day with NEW_SHELF_TRICKLE_PER_DAY; call it with
 * the full count when seeding the initial crate, where there is nothing to trickle into.
 *
 * Returns the albums that became visible.
 */
export function release(db: DatabaseSync, profileId: string, limit: number): StoredAlbum[] {
  if (limit <= 0) return [];
  const due = db.prepare(
    // rowid breaks the tie, not uri: a batch approved inside the same millisecond must
    // enter the crate in the order the parent approved it, not in alphabetical order.
    `SELECT uri FROM approved WHERE profile_id = ? AND position IS NULL
      ORDER BY approved_at ASC, rowid ASC LIMIT ?`,
  ).all(profileId, limit) as { uri: string }[];
  if (due.length === 0) return [];

  const t = now();
  const out: StoredAlbum[] = [];
  db.exec("BEGIN");
  try {
    // Never MAX(position)+1 off a compacted set: withdrawn slots keep their numbers, so the
    // next position must always be past the highest ever issued.
    let next = Number(
      (db.prepare(`SELECT COALESCE(MAX(position) + 1, 0) AS n FROM approved WHERE profile_id = ?`)
        .get(profileId) as { n: number }).n,
    );
    const set = db.prepare(`UPDATE approved SET position = ?, released_at = ? WHERE profile_id = ? AND uri = ?`);
    for (const { uri } of due) {
      set.run(next++, t, profileId, uri);
      out.push(getAlbum(db, uri)!);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return out;
}

/**
 * The crate, in order, gaps included. Index N of the returned array is position N; a slot
 * whose album is null was withdrawn and must stay empty.
 */
export function crate(db: DatabaseSync, profileId: string): CrateSlot[] {
  const rows = db.prepare(
    `SELECT p.position, a.*, p.withdrawn_at
       FROM approved p JOIN album a ON a.uri = p.uri
      WHERE p.profile_id = ? AND p.position IS NOT NULL
      ORDER BY p.position ASC`,
  ).all(profileId) as Record<string, unknown>[];

  const slots: CrateSlot[] = [];
  for (const r of rows) {
    const position = Number(r.position);
    // Defensive: a hole here would mean a position was issued and its row lost, which the
    // triggers forbid. Render it as empty rather than letting the array index drift.
    while (slots.length < position) slots.push({ position: slots.length, album: null });
    slots.push({ position, album: r.withdrawn_at ? null : toAlbum(r) });
  }
  return slots;
}

/** Take an album back. The slot stays, and stays empty, forever. */
export function withdraw(db: DatabaseSync, profileId: string, uri: string): void {
  db.prepare(`UPDATE approved SET withdrawn_at = ? WHERE profile_id = ? AND uri = ? AND withdrawn_at IS NULL`)
    .run(now(), profileId, uri);
}

export interface Counts {
  albums: number;
  pending: number;
  approved: number;
  inCrate: number;
  withdrawn: number;
  waitingToRelease: number;
  /** Approved albums with no artwork. In a cover-art interface these are invisible albums. */
  invisible: number;
}

export function counts(db: DatabaseSync, profileId: string): Counts {
  const one = (sql: string, ...args: (string | number)[]) =>
    Number((db.prepare(sql).get(...args) as { n: number }).n);
  return {
    albums: one(`SELECT COUNT(*) AS n FROM album`),
    pending: one(`SELECT COUNT(*) AS n FROM candidate WHERE decision IS NULL`),
    approved: one(`SELECT COUNT(*) AS n FROM approved WHERE profile_id = ?`, profileId),
    inCrate: one(`SELECT COUNT(*) AS n FROM approved WHERE profile_id = ? AND position IS NOT NULL AND withdrawn_at IS NULL`, profileId),
    withdrawn: one(`SELECT COUNT(*) AS n FROM approved WHERE profile_id = ? AND withdrawn_at IS NOT NULL`, profileId),
    waitingToRelease: one(`SELECT COUNT(*) AS n FROM approved WHERE profile_id = ? AND position IS NULL`, profileId),
    invisible: one(
      `SELECT COUNT(*) AS n FROM approved p JOIN album a ON a.uri = p.uri
        WHERE p.profile_id = ? AND a.cover_proxy_id IS NULL`, profileId),
  };
}

/* ── The number line, and what has been played ─────────────────────────── */

export interface TrackInput {
  n: number;
  title: string;
  /** `play_media`'s documented `start_item`. Null means the two-command fallback. */
  uri?: string | null;
}

export interface StoredTrack {
  n: number;
  title: string;
  uri: string | null;
}

/**
 * Replace an album's track list.
 *
 * Replace, not merge: a re-tag that drops a bonus track must drop it here too, or the number
 * line grows a number that plays nothing. This is the one place in the store where old rows
 * are deleted, and it is safe precisely because tracks are cached from Music Assistant rather
 * than owned here — unlike a crate position, which the triggers refuse to let anyone touch.
 */
export function setTracks(db: DatabaseSync, albumUri: string, tracks: readonly TrackInput[]): void {
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM track WHERE album_uri = ?`).run(albumUri);
    const ins = db.prepare(`INSERT INTO track (album_uri, n, title, uri) VALUES (?, ?, ?, ?)`);
    // Last write wins on a duplicate number rather than throwing: a malformed tag must not
    // be able to fail a seed run, and a duplicate n is a tagging bug, not a store bug.
    const seen = new Set<number>();
    for (const t of tracks) {
      if (seen.has(t.n)) continue;
      seen.add(t.n);
      ins.run(albumUri, t.n, t.title, t.uri ?? null);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function tracks(db: DatabaseSync, albumUri: string): StoredTrack[] {
  return (db.prepare(`SELECT n, title, uri FROM track WHERE album_uri = ? ORDER BY n ASC`)
    .all(albumUri) as Record<string, unknown>[])
    .map((r) => ({ n: Number(r.n), title: r.title as string, uri: (r.uri as string | null) ?? null }));
}

/** Every album's tracks in one query, keyed by uri. The crate endpoint sends the lot. */
export function allTracks(db: DatabaseSync, profileId: string): Map<string, StoredTrack[]> {
  const rows = db.prepare(
    `SELECT t.album_uri, t.n, t.title, t.uri
       FROM track t JOIN approved p ON p.uri = t.album_uri
      WHERE p.profile_id = ? AND p.position IS NOT NULL AND p.withdrawn_at IS NULL
      ORDER BY t.album_uri, t.n ASC`,
  ).all(profileId) as Record<string, unknown>[];
  const out = new Map<string, StoredTrack[]>();
  for (const r of rows) {
    const uri = r.album_uri as string;
    let list = out.get(uri);
    if (!list) out.set(uri, (list = []));
    list.push({ n: Number(r.n), title: r.title as string, uri: (r.uri as string | null) ?? null });
  }
  return out;
}

/**
 * He played a record. Appended, never counted in place.
 *
 * Silently ignores an album that is not in this profile's crate. The page is the caller and
 * principle 4 says a failure there must not reach the child — but more than that, an album
 * outside the crate has no business appearing on a shelf, and a shelf is the only thing this
 * log feeds. The gate holds on the way in *and* on the way back out.
 */
export function recordPlay(
  db: DatabaseSync,
  profileId: string,
  uri: string,
  trackN?: number | null,
): boolean {
  const inCrate = db.prepare(
    `SELECT 1 FROM approved WHERE profile_id = ? AND uri = ? AND position IS NOT NULL AND withdrawn_at IS NULL`,
  ).get(profileId, uri);
  if (!inCrate) return false;
  // A track number that is not a positive integer is stored as unknown rather than coerced.
  // Null is not zero here: an invented track 1 would invent a favourite nobody played.
  const n = Number.isInteger(trackN) && (trackN as number) > 0 ? (trackN as number) : null;
  db.prepare(`INSERT INTO play (profile_id, uri, played_at, track_n) VALUES (?, ?, ?, ?)`)
    .run(profileId, uri, now(), n);
  return true;
}

/**
 * How many deliberate plays a track needs before it is marked at all.
 *
 * Three, because one is an accident and two is a coincidence. An album played straight through
 * once gives every track a single play, and marking all of them would say nothing — a mark
 * that is always on is a mark he stops seeing.
 */
export const FAVOURITE_MIN_PLAYS = 3;

/**
 * And how far behind the album's best-loved track a track may fall and still be marked.
 *
 * Half. The question a mark answers is "which ones do you keep coming back to", and on an
 * album where he plays track 7 ten times and everything else twice, only 7 is an honest
 * answer. Two tracks at 8 and 10 are both honest answers.
 */
export const FAVOURITE_SHARE_OF_TOP = 0.5;

/**
 * The tracks he keeps choosing, per album.
 *
 * Derived from behaviour and never declared. The product does four things and refuses the
 * fifth — there is no "like" button, there must not be one, and a mark he could chase would
 * turn listening into a game with a score. This is only ever a description of what he already
 * did, which is why it is safe to show him.
 *
 * Returns album uri -> the set of track numbers to mark. An album with no qualifying track is
 * absent rather than present-and-empty, so callers cannot accidentally render an empty mark.
 */
export function favouriteTracks(db: DatabaseSync, profileId: string): Map<string, Set<number>> {
  const rows = db.prepare(
    `SELECT uri, track_n, COUNT(*) AS plays
       FROM play
      WHERE profile_id = ? AND track_n IS NOT NULL
      GROUP BY uri, track_n`,
  ).all(profileId) as Record<string, unknown>[];

  const byAlbum = new Map<string, { n: number; plays: number }[]>();
  for (const r of rows) {
    const uri = r.uri as string;
    let list = byAlbum.get(uri);
    if (!list) byAlbum.set(uri, (list = []));
    list.push({ n: Number(r.track_n), plays: Number(r.plays) });
  }

  const out = new Map<string, Set<number>>();
  for (const [uri, tracks] of byAlbum) {
    const top = Math.max(...tracks.map((t) => t.plays));
    const marked = tracks
      .filter((t) => t.plays >= FAVOURITE_MIN_PLAYS && t.plays >= top * FAVOURITE_SHARE_OF_TOP)
      .map((t) => t.n);
    if (marked.length) out.set(uri, new Set(marked));
  }
  return out;
}

/* ── settings that outlive a reboot ────────────────────────────────────── */

/**
 * Read every stored setting. Values are JSON; a row that will not parse is skipped rather
 * than thrown, because one corrupt setting must not stop the crate from rendering.
 */
export function settings(db: DatabaseSync): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of db.prepare(`SELECT key, value FROM setting`).all() as Record<string, unknown>[]) {
    try {
      out[r.key as string] = JSON.parse(r.value as string);
    } catch {
      console.warn(`[store] setting ${r.key} is not valid JSON; ignoring it`);
    }
  }
  return out;
}

/** Write settings. Only the keys passed are touched; anything else keeps its value. */
export function setSettings(db: DatabaseSync, patch: Record<string, unknown>): void {
  const stmt = db.prepare(
    `INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const t = now();
  db.exec("BEGIN");
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      stmt.run(k, JSON.stringify(v), t);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * Distinct albums, most recently played first. Feeds the *recent* shelf.
 *
 * rowid breaks the tie, not uri. played_at is an ISO string with millisecond resolution, and
 * two plays can land in the same millisecond — a held Enter key does exactly that. Ordering on
 * the timestamp alone then leaves SQLite free to return either, so the shelf reshuffles on
 * reload for no reason the child can see. rowid is the order they actually happened in.
 */
export function recentlyPlayed(db: DatabaseSync, profileId: string, limit: number): string[] {
  return (db.prepare(
    `SELECT uri, MAX(played_at) AS last, MAX(rowid) AS seq FROM play WHERE profile_id = ?
      GROUP BY uri ORDER BY last DESC, seq DESC LIMIT ?`,
  ).all(profileId, limit) as { uri: string }[]).map((r) => r.uri);
}

/**
 * Most played first. Feeds the *most-played* shelf.
 *
 * A tie breaks on the more recent play, not on uri: two albums played twice each should put
 * the one he reached for today in front, and alphabetical order would be an arbitrary answer
 * that never changes. rowid breaks a tie in the timestamp itself, for the reason in
 * `recentlyPlayed` — without it a shelf of equally-played albums reshuffles on every reload.
 */
export function mostPlayed(db: DatabaseSync, profileId: string, limit: number): { uri: string; plays: number }[] {
  return (db.prepare(
    `SELECT uri, COUNT(*) AS plays, MAX(played_at) AS last, MAX(rowid) AS seq FROM play WHERE profile_id = ?
      GROUP BY uri ORDER BY plays DESC, last DESC, seq DESC LIMIT ?`,
  ).all(profileId, limit) as Record<string, unknown>[])
    .map((r) => ({ uri: r.uri as string, plays: Number(r.plays) }));
}
