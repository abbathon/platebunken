/**
 * The review queue, as the parent's phone receives it.
 *
 * ARCHITECTURE.md §6: cover, artist, preview, annotations, ✓ / ✗. Ten seconds a day. It is the
 * only way anything reaches the child's crate, and `approve()` in the store is what enforces
 * that — this module is the surface, never the gate. Nothing here may insert an album, and
 * nothing here may decide one on the parent's behalf.
 *
 * **Annotations are advisory and nothing is ever auto-rejected.** §5 gives the case that
 * settles it: Burzum's Metal Archives themes read "Mythology, Folklore, Odalism", so the most
 * notorious record in the genre passes every automated theme filter. Flags sort the queue —
 * `reviewQueue()` orders by flag count — and a person decides. This module must never gain a
 * rule that turns a flag into a decision.
 *
 * Music Assistant is not consulted. Same reason as `crate.ts`: everything needed to *draw* a
 * candidate is already in SQLite, so the queue reviews fine with MA switched off.
 */
import type { DatabaseSync } from "node:sqlite";
import {
  approve, heldForTracks, recentlyRejected, reject, release, reopenRejected, reviewQueue, tracks,
  waitingToRelease, type QueueEntry, type StoredAlbum,
} from "../store/crate.ts";
import { coverPath } from "../ma/images.ts";

/** A phone, held in one hand. Bigger than the crate tile, smaller than a desktop hero. */
const cover = (proxyId: string | null) =>
  proxyId ? { sm: coverPath(proxyId, 256, 2), lg: coverPath(proxyId, 512, 2) } : null;

export interface WireFlag {
  kind: string;
  detail: string | null;
  source: string;
}

export interface WireCandidate {
  uri: string;
  artist: string;
  title: string;
  year: number | null;
  /** null means unknown, and unknown is never clean (docs/research/03). */
  explicit: boolean | null;
  cover: { sm: string; lg: string } | null;
  source: string;
  sourceDetail: string | null;
  at: string;
  /** Advisory. Sorted on, never filtered on, and never acted on without a person. */
  flags: WireFlag[];
  /** Cached at suggestion time when the worker had them; empty is normal, not an error. */
  tracks: { n: number; title: string }[];
}

const wire = (db: DatabaseSync, e: QueueEntry): WireCandidate => ({
  uri: e.album.uri,
  artist: e.album.artist || "—",
  title: e.album.title,
  year: e.album.year,
  explicit: e.album.explicit,
  cover: cover(e.album.coverProxyId),
  source: e.source,
  sourceDetail: e.sourceDetail,
  at: e.suggestedAt,
  flags: e.flags,
  tracks: tracks(db, e.album.uri).map((t) => ({ n: t.n, title: t.title })),
});

/** An approved album on its way to the crate, but not there yet. */
export interface WireWaiting {
  uri: string;
  artist: string;
  title: string;
  cover: { sm: string; lg: string } | null;
}

export interface WireReview {
  pending: WireCandidate[];
  /**
   * Approved, waiting for a position. In the exact order the trickle will release them, so
   * the parent can see what "release now" is about to put in front of the child.
   */
  waiting: WireWaiting[];
  /**
   * Approved, but not releasable yet: Music Assistant has not given up a track list, and
   * `release()` will not spend a permanent crate position on an album that opens onto
   * nothing. Sent so the parent is never left wondering why a ✓ produced no record — the
   * answer is "it is coming", and the page says so.
   */
  held: WireWaiting[];
  /**
   * The way back from a mis-tapped ✗. `approve()` refuses to reach past a rejection, so
   * without this a wrong tap on a phone loses the album silently and for good.
   */
  rejected: WireCandidate[];
}

const wireWaiting = (a: StoredAlbum): WireWaiting => ({
  uri: a.uri,
  artist: a.artist || "—",
  title: a.title,
  cover: cover(a.coverProxyId),
});

export function wireReview(db: DatabaseSync, profileId: string): WireReview {
  return {
    pending: reviewQueue(db).map((e) => wire(db, e)),
    waiting: waitingToRelease(db, profileId).map(wireWaiting),
    held: heldForTracks(db, profileId).map(wireWaiting),
    rejected: recentlyRejected(db, 10).map((e) => wire(db, e)),
  };
}

export interface ReleaseResult {
  ok: boolean;
  released: { artist: string; title: string; position: number }[];
  error?: string;
}

/**
 * Put approved albums on the grid now, rather than waiting for the morning.
 *
 * The trickle (§4.1) exists so the shelf changes while he is asleep and there is nearly always
 * a reason to walk over and look. This is the parent overriding that on purpose, which is
 * theirs to do — they are the authority the whole product is built around.
 *
 * It deliberately goes through the same `release()` as the trickle, so positions come from one
 * place and stay append-only. It also stamps `released_at`, which means a manual release
 * counts as the day's release and the automatic one will not fire again today. That is the
 * honest behaviour rather than a special case: a release is a release.
 */
export function releaseNow(db: DatabaseSync, profileId: string, count: number): ReleaseResult {
  const n = Math.max(1, Math.min(Number.isFinite(count) ? Math.trunc(count) : 1, 50));
  try {
    const out = release(db, profileId, n);
    // Read the positions back rather than assuming: release() is the only thing that knows
    // what number each album actually got.
    const placed = out.map((a) => {
      const row = db.prepare(`SELECT position FROM approved WHERE profile_id = ? AND uri = ?`)
        .get(profileId, a.uri) as { position: number } | undefined;
      return { artist: a.artist || "—", title: a.title, position: Number(row?.position ?? -1) };
    });
    return { ok: true, released: placed };
  } catch (e) {
    return { ok: false, released: [], error: (e as Error).message };
  }
}

export type Decision = "approved" | "rejected";

export interface DecideResult {
  ok: boolean;
  /** What to tell the parent when it did not go through. Never shown to the child. */
  error?: string;
}

/**
 * Record one decision.
 *
 * Both outcomes are idempotent from the caller's side — a phone on a flaky connection retries,
 * and a double tap is a tap. What is NOT allowed is reaching past a decision already taken:
 * the store throws, and that throw is reported rather than swallowed, because a parent who
 * thinks they approved something and did not is worse off than one who sees an error.
 */
export function decide(db: DatabaseSync, profileId: string, uri: string, decision: Decision): DecideResult {
  try {
    if (decision === "approved") approve(db, profileId, uri);
    else reject(db, uri);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Put a rejected album back in the queue — the parent undoing themselves.
 *
 * This was first built as `suggest()` again, on the theory that a change of mind should be a
 * new candidacy rather than an edit. Driving the real page showed that silently does nothing:
 * `suggest` is ON CONFLICT DO NOTHING and there are only four legal sources, so an album
 * already rejected from that source never comes back. The button reported success and the
 * album stayed gone — the worst of both.
 *
 * `reopenRejected` is therefore its own verb in the store, and `suggest` deliberately keeps
 * its no-op behaviour so the daily curation worker can never resurrect a rejection.
 */
export function reopen(db: DatabaseSync, uri: string): DecideResult {
  try {
    if (!reopenRejected(db, uri)) {
      return { ok: false, error: "Albumet var ikke avvist, så det er ingenting å angre." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
