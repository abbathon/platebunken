/**
 * ListenBrainz submission.
 *
 * Consumes the `Listen` records `src/ma/listens.ts` produces and posts them to
 * `POST /1/submit-listens`. Nothing else in the system talks to ListenBrainz.
 *
 * ## What goes, and what does not
 *
 * **Both deliberate and auto-advanced listens are submitted.** Scrobbling answers *what was
 * heard*; the favourite marks answer *what he chose*. They are different questions over the
 * same stream, and conflating them would either under-report the listening or invent
 * favourites out of autoplay. `listens.ts` keeps them distinct precisely so both can be right.
 *
 * **Loved feedback is never submitted.** `POST /1/feedback/recording-feedback` exists, and
 * this product will not call it. Nothing here lets the child declare a favourite — favourites
 * are *derived* from play counts — so submitting one would be putting a synthetic opinion in
 * someone else's name on a public account. ARCHITECTURE.md §5, and the product does four
 * things and refuses the fifth.
 *
 * ## The account, and what is public
 *
 * Verified against primary sources on 2026-09-19 (docs/research/07):
 *
 * **ListenBrainz has no private listens and has never had them.** It is a deliberate design
 * decision, not a missing feature — listens are CC0 and are published in weekly public data
 * dumps. There is no hidden mode to switch on.
 *
 * The operator's decision, taken with that on the table: submit under a **generic household
 * account**, never one identifying the child, and **never reference the account anywhere in
 * this repository** — the repo may be made public, and naming the account here would relink
 * what the generic account exists to separate. So the token lives in `.env` beside `MA_TOKEN`
 * and the username is never needed: the token identifies the account to the API.
 */
import type { Listen } from "../ma/listens.ts";

const ENDPOINT = "https://api.listenbrainz.org/1/submit-listens";

/**
 * A real User-Agent is required by the API docs, and a vague one is how a client gets banned
 * when it misbehaves. No hostname, no household detail: this string is public on every request.
 */
export const USER_AGENT = "platebunken/1.0 (https://github.com/abbathon/platebunken)";

/**
 * "Never make more than ONE call per second" — the ListenBrainz API docs, verbatim. This is a
 * floor between calls, not an average, and a four-year-old playing records cannot possibly
 * generate enough listens to feel it.
 */
export const MIN_INTERVAL_MS = 1100;

/**
 * How many unsent listens to hold when ListenBrainz or the WAN is away.
 *
 * Bounded, because the alternative is a container that grows until it is killed. The oldest
 * are dropped first: a listen from three days ago that still has not gone is worth less than
 * the one that just happened, and neither is worth an OOM.
 */
export const MAX_PENDING = 500;

/** The submission payload, as the API defines it. Exported so the tests can read it. */
export interface SubmitBody {
  listen_type: "single";
  payload: {
    listened_at: number;
    track_metadata: {
      artist_name: string;
      track_name: string;
      release_name?: string;
      additional_info: {
        duration_ms?: number;
        media_player: string;
        submission_client: string;
      };
    };
  }[];
}

/**
 * Whether this listen may be submitted at all.
 *
 * Three independent reasons to decline, and none of them is an error:
 *   - it did not meet the threshold (a skip is not a listen)
 *   - MA never resolved the item, so there is no artist or title to send. Splitting the
 *     display string would be a guess, and a guess here writes a wrong name to a permanent
 *     public record.
 */
export function submittable(listen: Listen): boolean {
  return listen.completed && Boolean(listen.artist) && Boolean(listen.trackName);
}

/** Pure, so the exact wire shape is testable without a network. */
export function bodyFor(listen: Listen): SubmitBody {
  return {
    listen_type: "single",
    payload: [
      {
        // Seconds, and the moment playback STARTED — not when it finished. The server's clock
        // is the one used: the Docker host has WAN and NTP, the kiosk's clock is not synced
        // and is deliberately not in this path.
        listened_at: Math.floor(listen.startedAt.getTime() / 1000),
        track_metadata: {
          artist_name: listen.artist!,
          track_name: listen.trackName!,
          ...(listen.albumName ? { release_name: listen.albumName } : {}),
          additional_info: {
            ...(listen.durationSec ? { duration_ms: Math.round(listen.durationSec * 1000) } : {}),
            media_player: "Music Assistant",
            submission_client: "platebunken",
          },
        },
      },
    ],
  };
}

export interface ScrobblerOptions {
  /** From `.env`. Absent disables submission entirely rather than failing loudly. */
  token: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onLog?: (message: string) => void;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A serial, rate-limited, retrying submitter.
 *
 * Deep on purpose: callers hand it a `Listen` and never learn that there is a queue, a spacing
 * rule, a retry policy or an HTTP status behind it. `submit()` does not throw and does not
 * block the caller — a scrobble that fails must never affect what the child hears, which is
 * principle 4 restated for a network this product does not control.
 */
export function createScrobbler(opts: ScrobblerOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? wait;
  const now = opts.now ?? Date.now;
  const log = opts.onLog ?? ((m: string) => console.log(m));
  const enabled = Boolean(opts.token);

  const queue: Listen[] = [];
  let draining: Promise<void> | null = null;
  let lastCallAt = 0;
  let dropped = 0;

  async function post(listen: Listen): Promise<"ok" | "retry" | "drop"> {
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Token ${opts.token}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(bodyFor(listen)),
      });
    } catch (e) {
      // The WAN is down, or DNS is. Keep it and try again later.
      log(`[scrobble] unreachable: ${(e as Error).message}`);
      return "retry";
    }

    if (res.ok) return "ok";

    if (res.status === 429) {
      const resetIn = Number(res.headers.get("X-RateLimit-Reset-In") ?? "") || 2;
      log(`[scrobble] rate limited, waiting ${resetIn}s`);
      await sleep(resetIn * 1000);
      return "retry";
    }

    // 401 means the token is wrong or expired. Retrying that forever is a way to get banned,
    // so it is dropped and said out loud — the only person who can fix it reads the log.
    if (res.status === 401) {
      log("[scrobble] 401: the ListenBrainz token is missing or invalid. Submission disabled until fixed.");
      return "drop";
    }

    // 400 is a payload this client built wrong. Retrying cannot fix it.
    if (res.status === 400) {
      log(`[scrobble] 400: rejected "${listen.name}". Not retrying.`);
      return "drop";
    }

    log(`[scrobble] HTTP ${res.status}, will retry`);
    return "retry";
  }

  async function drain(): Promise<void> {
    while (queue.length) {
      const since = now() - lastCallAt;
      if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);

      const listen = queue[0];
      lastCallAt = now();
      const outcome = await post(listen);

      if (outcome === "retry") {
        // Left at the head of the queue. Stop draining rather than spinning: the next listen
        // to arrive restarts it, and a bedroom speaker produces one every few minutes.
        return;
      }
      queue.shift();
      if (outcome === "ok") log(`[scrobble] ${listen.artist} — ${listen.trackName}`);
    }
  }

  return {
    /** Fire and forget. Never throws, never blocks the caller, never affects playback. */
    submit(listen: Listen): void {
      if (!enabled || !submittable(listen)) return;

      if (queue.length >= MAX_PENDING) {
        queue.shift();
        dropped++;
        if (dropped % 50 === 1) log(`[scrobble] backlog full, dropped ${dropped} oldest listens`);
      }
      queue.push(listen);

      if (!draining) {
        draining = drain().catch((e) => log(`[scrobble] drain failed: ${(e as Error).message}`))
          .finally(() => { draining = null; });
      }
    },

    /** Unsent listens. Exposed for the parent's settings screen and for the tests. */
    get pending(): number { return queue.length; },
    get enabled(): boolean { return enabled; },

    /** Wait for the current drain, so a test or a shutdown can settle. */
    async settle(): Promise<void> { await draining; },
  };
}

export type Scrobbler = ReturnType<typeof createScrobbler>;
