/**
 * The number line, fetched once and cached.
 *
 * ## What was broken
 *
 * Only `src/store/seed.ts` ever called `setTracks`. The curation worker wrote the album row
 * and the candidacy and stopped there, so **every album that reached the crate through
 * /admin arrived with no tracks at all** — sixteen seeded albums with a number line, eleven
 * approved ones without. Opening one of those showed the child an English sentence saying
 * Music Assistant returned no tracks, on a screen built for a four-year-old who cannot read.
 *
 * Worse than the sentence: a position is permanent (schema v1, `approved_position_set_once`).
 * Releasing a trackless album spends one of the child's memorised slots on a record that
 * opens onto nothing, and no later fix can move it.
 *
 * ## Why here and not at open
 *
 * Schema v2 already answers this: asking MA for an album's tracks when the child opens it
 * fails exactly when §10 says it must not. "MA unreachable" is supposed to mean a sleepy
 * crate with covers from cache, not an album that opens onto nothing. So the fetch happens
 * ahead of time, on the parent's side of the gate, and the child's page still reads SQLite
 * and only SQLite.
 *
 * ## Why a sweep and not one call at approval
 *
 * Approval is the obvious moment and it is not sufficient: MA can be down at exactly that
 * second, a candidate suggested today is approved tomorrow, and eleven albums are already in
 * the crate without tracks. A sweep heals all three, is idempotent, and costs one indexed
 * query when there is nothing to do. `app.ts` also kicks it on approval, because the parent
 * is standing there and the round trip is a LAN hop.
 */
import type { DatabaseSync } from "node:sqlite";
import type { MassClient } from "../ma/client.ts";
import { setTracks } from "../store/crate.ts";

/**
 * How many albums one sweep will ask about.
 *
 * The sweep shares the half-hourly wake-up in `index.ts`, so this is a rate as much as a
 * batch: twenty-five albums an hour against a service on the same LAN. It is a ceiling for
 * the first run after this landed — fifty pending candidates and eleven stuck in the crate —
 * not a number the steady state ever reaches.
 */
export const SWEEP_LIMIT = 25;

/** A breath between calls, so a sweep cannot look like a flood to Music Assistant. */
const PACE_MS = 150;

export interface TracklessAlbum {
  uri: string;
  provider: string;
  itemId: string;
  artist: string;
  title: string;
  /** 0 in the crate now, 1 approved and waiting, 2 still in the review queue. */
  rank: number;
}

/**
 * Albums with no track rows, most urgent first.
 *
 * The order is the whole design of this query. An album already released is invisible to the
 * child right now (see `wireCrate`), so it is asked about first. One approved and waiting is
 * holding up the trickle. A pending candidate only wants its number line drawn on the review
 * card, which is a nicety and goes last.
 *
 * Withdrawn albums are excluded rather than ranked last: the parent took that record back,
 * and nothing should spend a request on it.
 */
export function tracklessAlbums(db: DatabaseSync, profileId: string, limit = SWEEP_LIMIT): TracklessAlbum[] {
  const rows = db.prepare(
    `SELECT a.uri, a.provider, a.item_id, a.artist, a.title,
            CASE WHEN p.position IS NOT NULL THEN 0
                 WHEN p.uri IS NOT NULL THEN 1
                 ELSE 2 END AS rank
       FROM album a
       LEFT JOIN approved p
         ON p.uri = a.uri AND p.profile_id = ? AND p.withdrawn_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM track t WHERE t.album_uri = a.uri)
        AND (p.uri IS NOT NULL
             OR EXISTS (SELECT 1 FROM candidate c WHERE c.uri = a.uri AND c.decision IS NULL))
      ORDER BY rank ASC, a.first_seen ASC
      LIMIT ?`,
  ).all(profileId, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    uri: r.uri as string,
    provider: r.provider as string,
    itemId: r.item_id as string,
    artist: r.artist as string,
    title: r.title as string,
    rank: Number(r.rank),
  }));
}

/**
 * Ask Music Assistant for one album's tracks and cache them. Returns how many were stored.
 *
 * `track_number ?? i + 1` mirrors the seed exactly: an untagged rip still gets a straight
 * 1..n line rather than a column of gaps, because the geometry is what carries the meaning
 * (§4.2) and a missing numeral is worse than an assumed one.
 *
 * The track's own uri is `play_media`'s `start_item`, which is what makes "start this record
 * at track 7" one command instead of a play followed by a jump.
 */
export async function cacheTracks(
  db: DatabaseSync,
  client: MassClient,
  album: Pick<TracklessAlbum, "uri" | "provider" | "itemId">,
): Promise<number> {
  const raw = await client.albumTracks(album.itemId, album.provider);
  const list = raw.map((t, i) => ({ n: t.track_number ?? i + 1, title: t.name, uri: t.uri ?? null }));
  if (list.length) setTracks(db, album.uri, list);
  return list.length;
}

/**
 * One album, by uri, right now. Never throws.
 *
 * The fast path for a ✓ at /admin: the parent is standing there, Music Assistant is one LAN
 * hop away, and getting the track list inside the second means the album is releasable by
 * the time they look at the shelf. Everything it misses — MA down, an album that arrives
 * from the worker and is approved tomorrow — the sweep picks up.
 */
export async function cacheOne(
  db: DatabaseSync,
  ma: () => Promise<MassClient>,
  uri: string,
  onLog: (message: string) => void = (m) => console.log(m),
): Promise<number> {
  const row = db.prepare(`SELECT uri, provider, item_id FROM album WHERE uri = ?`).get(uri) as
    | { uri: string; provider: string; item_id: string }
    | undefined;
  if (!row) return 0;
  try {
    return await cacheTracks(db, await ma(), { uri: row.uri, provider: row.provider, itemId: row.item_id });
  } catch (e) {
    onLog(`[tracks] ! ${uri}: ${(e as Error).message}`);
    return 0;
  }
}

export interface SweepReport {
  asked: number;
  filled: number;
  /** MA answered, and answered with nothing. Not an error, and not a reason to stop. */
  empty: number;
  failed: number;
}

export interface SweepOptions {
  profileId: string;
  limit?: number;
  onLog?: (message: string) => void;
}

/**
 * One sweep. Never throws.
 *
 * An album MA cannot answer for stays trackless, stays out of the crate, and is asked about
 * again on the next wake-up. That is deliberate: MA syncs, and an album with no tracks today
 * can have them tomorrow. The cost of being wrong in this direction is one LAN request every
 * half hour; the cost of giving up is a record the child can never open.
 *
 * A failure to reach MA at all stops the sweep rather than walking the whole list into the
 * same error — there is one connection and it is already known to be down.
 */
export async function sweepTracks(
  db: DatabaseSync,
  ma: () => Promise<MassClient>,
  opts: SweepOptions,
): Promise<SweepReport> {
  const log = opts.onLog ?? ((m: string) => console.log(m));
  const report: SweepReport = { asked: 0, filled: 0, empty: 0, failed: 0 };

  const todo = tracklessAlbums(db, opts.profileId, opts.limit ?? SWEEP_LIMIT);
  if (todo.length === 0) return report;

  let client: MassClient;
  try {
    client = await ma();
  } catch (e) {
    log(`[tracks] ! no contact with Music Assistant: ${(e as Error).message}`);
    return report;
  }

  for (const a of todo) {
    report.asked++;
    try {
      const n = await cacheTracks(db, client, a);
      if (n > 0) {
        report.filled++;
        // Said out loud for a released album: this is the moment a cover the child could see
        // but not open becomes a record he can play.
        if (a.rank === 0) log(`[tracks] ${a.artist} — ${a.title}: ${n} tracks, now playable`);
      } else {
        report.empty++;
        log(`[tracks] ? ${a.artist} — ${a.title}: Music Assistant knows of no tracks`);
      }
    } catch (e) {
      report.failed++;
      log(`[tracks] ! ${a.artist} — ${a.title}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  if (report.filled) log(`[tracks] filled ${report.filled} of ${report.asked} album track lists`);
  return report;
}
