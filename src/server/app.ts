/**
 * The routes. Six of them, plus the static page and the cover passthrough.
 *
 * Boundaries this file exists to hold, from ARCHITECTURE.md §5.1:
 *   /api/crate            the store, and only the store. Never Music Assistant.
 *   /admin, /api/review   the parent's review queue (§6). The ONLY way into the crate.
 *   /api/speaker/play     a uri the page already had. Never a search, never a browse.
 *   /api/speaker/players  the one call that asks MA what it has got — a PARENT surface.
 *   /imageproxy/*         cover bytes, so the page only ever talks to its own origin.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { hostname, networkInterfaces } from "node:os";
import { config, maConfigured } from "./config.ts";
import { body, json, routeOf } from "./http.ts";
import { staticServer } from "./static.ts";
import { wireCrate } from "./crate.ts";
import { recordPlay, setManualFavourite } from "../store/crate.ts";
import { save, wireSettings } from "./settings.ts";
import { decide, recommend, releaseNow, reopen, wireReview } from "./review.ts";
import { adminHtml } from "./admin.ts";
import { cacheOne } from "./tracks.ts";
import * as speaker from "./speaker.ts";

/**
 * A failure reaching Music Assistant is a 502 and a log line, never an exception that takes
 * the process down. The page treats every speaker call as fire-and-forget (principle 4: the
 * child never sees an error), so the only person this message can reach is the parent, and
 * the only place they will look is the log.
 */
function maFailed(res: ServerResponse, route: string, e: unknown): void {
  const message = (e as Error).message;
  console.error(`[speaker] ${route}: ${message}`);
  json(res, 502, { error: message });
}

export function createApp(db: DatabaseSync) {
  const serveStatic = staticServer(config.publicDir);
  const profileId = config.profile.id;

  /* ── the parent's Device tab ───────────────────────────────────────────
   * `expected` is the address reserved for the kiosk on the router. A DHCP reservation that
   * silently failed presents as a machine that works today and is unreachable after the next
   * lease, and it is invisible from anywhere else — including from the router, which will
   * happily show a reservation that nothing is honouring.
   *
   * The address compared against it is the **client's**, not this host's. When the server ran
   * inside the Vite dev server it was on the laptop, so its own interfaces were the kiosk's;
   * now it is a container on the Docker host and its own address is a bridge address that has
   * nothing to do with the reservation. But the request in hand came FROM the kiosk, so
   * `remoteAddress` is the one number actually worth comparing — and it stays right wherever
   * this process is moved to next.
   */
  function device(req: IncomingMessage) {
    const serverAddresses = Object.values(networkInterfaces()).flat()
      .filter((n): n is NonNullable<typeof n> => !!n && n.family === "IPv4" && !n.internal)
      .map((n) => n.address);

    // Node reports an IPv4 client on a dual-stack socket as ::ffff:10.0.0.5.
    const client = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "") || null;
    const expected = config.kioskIp;

    return {
      hostname: hostname(),
      /** The machine looking at this page — the kiosk, when the kiosk is looking. */
      client,
      /** This server's own addresses. Informational: on the Docker host, a bridge address. */
      serverAddresses,
      expected,
      matches: expected && client ? client === expected : null,
      maHost: config.ma.host,
    };
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const route = routeOf(req.url);
    const method = req.method ?? "GET";

    try {
      /* ── health ──────────────────────────────────────────────────────
       * Asks the app, not the port. A container whose socket is open but whose store will not
       * open is a container that must not be reported healthy — it will serve an empty crate,
       * which looks to a four-year-old exactly like all his music being gone.
       */
      if (route === "/healthz") {
        db.prepare("SELECT 1").get();
        return json(res, 200, { ok: true, canPlay: speaker.canPlay() });
      }

      /* ── the crate ───────────────────────────────────────────────────── */
      if (route === "/api/crate" && method === "GET") {
        return json(res, 200, wireCrate(db, profileId));
      }

      /**
       * He played a record. The *recent* and *most-played* shelves are built from this log and
       * from nothing else — there is no separate tracking, because what he played is what he
       * played. `recordPlay` refuses an album that is not in this profile's crate, so the
       * approval gate holds on the way back out too.
       */
      if (route === "/api/played" && method === "POST") {
        const payload = await body(req);
        const uri = String(payload.uri ?? "");
        if (!uri) return json(res, 400, { error: "no album uri" });
        // The track number is what makes a favourite possible. It is optional on the wire so
        // that a caller which genuinely does not know one records the album play regardless.
        const trackN = Number(payload.track);
        return json(res, 200, {
          ok: recordPlay(db, profileId, uri, Number.isFinite(trackN) ? trackN : null),
        });
      }

      /**
       * A manual like, child-facing, no gate. Same shape as `/api/played`: a preference, not
       * a decision, so a malformed or failed request is a 400/500, never a reason to touch
       * anything else on the page. `setManualFavourite` gates on crate membership itself, so
       * this route does not need to check that a second time.
       */
      if (route === "/api/favourite" && method === "POST") {
        const payload = await body(req);
        const uri = String(payload.uri ?? "");
        const trackN = Number(payload.track);
        if (!uri || !Number.isInteger(trackN)) return json(res, 400, { ok: false, error: "uri and track required" });
        if (typeof payload.on !== "boolean") return json(res, 400, { ok: false, error: "on must be a boolean" });
        return json(res, 200, { ok: setManualFavourite(db, profileId, uri, trackN, payload.on) });
      }

      /* ── the review queue (§6) ────────────────────────────────────────
       * A parent surface, on a phone, once a day. It is the only path into the child's
       * crate, and the gate it goes through is `approve()` in the store — not anything here.
       */
      if (route === "/admin" && (method === "GET" || method === "HEAD")) {
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        // Never cached. The queue is the whole point of the page, and a phone showing
        // yesterday's copy would have the parent deciding on albums already decided.
        res.setHeader("cache-control", "no-store");
        // This page is not for the child's browser and not for anyone's index.
        res.setHeader("x-robots-tag", "noindex, nofollow");
        res.setHeader("referrer-policy", "no-referrer");
        return void res.end(method === "HEAD" ? "" : adminHtml(config.gatePin));
      }

      if (route === "/api/review" && method === "GET") {
        return json(res, 200, wireReview(db, profileId));
      }

      /**
       * Put approved albums on the grid now instead of waiting for the morning.
       *
       * The parent overriding the trickle on purpose. Same `release()` the trickle uses, so
       * positions come from one place; and it stamps the day, so the automatic release will
       * not also fire today.
       */
      if (route === "/api/review/release" && method === "POST") {
        const payload = await body(req);
        const count = payload.count === undefined ? 1 : Number(payload.count);
        return json(res, 200, releaseNow(db, profileId, count));
      }

      if (route === "/api/review/decide" && method === "POST") {
        const payload = await body(req);
        const uri = String(payload.uri ?? "");
        const decision = String(payload.decision ?? "");
        if (!uri) return json(res, 400, { ok: false, error: "no album uri" });
        if (decision !== "approved" && decision !== "rejected") {
          return json(res, 400, { ok: false, error: "decision must be approved or rejected" });
        }
        const out = decide(db, profileId, uri, decision);
        /**
         * Fetch the number line now, while the parent is standing here.
         *
         * `release()` will not give a position to an album whose tracks are not cached, so
         * without this a ✓ would put the album in a queue that only the half-hourly sweep
         * drains. Deliberately not awaited and deliberately not part of `decide()`: the
         * decision is recorded whether or not Music Assistant answers, and `review.ts` does
         * not talk to MA at all — the sweep is the retry, this is only the fast path.
         */
        if (out.ok && decision === "approved" && maConfigured()) {
          void cacheOne(db, speaker.ma, uri);
        }
        // 200 either way: `ok:false` with a reason is the page's own error path, and a
        // rejected decision is a normal answer rather than a broken request.
        return json(res, 200, out);
      }

      if (route === "/api/review/reopen" && method === "POST") {
        const payload = await body(req);
        const uri = String(payload.uri ?? "");
        if (!uri) return json(res, 400, { ok: false, error: "no album uri" });
        return json(res, 200, reopen(db, uri));
      }

      if (route === "/api/review/recommend" && method === "POST") {
        const payload = await body(req);
        const uri = String(payload.uri ?? "");
        if (!uri) return json(res, 400, { ok: false, error: "no album uri" });
        if (typeof payload.recommended !== "boolean") {
          return json(res, 400, { ok: false, error: "recommended must be a boolean" });
        }
        return json(res, 200, recommend(db, profileId, uri, payload.recommended));
      }

      /* ── settings ─────────────────────────────────────────────────────── */
      if (route === "/api/settings" && method === "GET") {
        return json(res, 200, wireSettings(db));
      }

      if (route === "/api/settings" && method === "PUT") {
        const patch = await body(req);
        // The speaker is a setting like any other, but it also has to take effect NOW rather
        // than at the next boot, so the write and the live switch happen together.
        if (typeof patch.playerId === "string" && patch.playerId) {
          const named = await speaker.setTarget(patch.playerId).catch(() => null);
          patch.playerName = named;
          if (!named) {
            return json(res, 400, { error: "unknown player" });
          }
        }
        save(db, patch);
        // Return the whole settled state, not an echo of the patch: the store validates on the
        // way out, so this is what the page will actually get next time it asks.
        return json(res, 200, wireSettings(db));
      }

      /* ── the speaker ─────────────────────────────────────────────────── */
      if (route === "/api/speaker/config" && method === "GET") {
        return json(res, 200, {
          configured: speaker.canPlay(),
          ceiling: config.volume.ceiling,
          start: config.volume.start,
        });
      }

      if (route === "/api/speaker/device" && method === "GET") {
        return json(res, 200, device(req));
      }

      if (route === "/api/speaker/players" && method === "GET") {
        // Say what is actually wrong. Without this the parent's settings screen reports
        // "Invalid URL" from the URL constructor, which is true and useless: the answer they
        // need is that MA_HOST and MA_TOKEN were never passed to the container.
        if (!config.ma.host || !config.ma.token) {
          return json(res, 503, { error: "MA_HOST or MA_TOKEN is not configured", players: [] });
        }
        try {
          return json(res, 200, { players: await speaker.players() });
        } catch (e) {
          console.error(`[speaker] players: ${(e as Error).message}`);
          return json(res, 502, { error: (e as Error).message, players: [] });
        }
      }

      /**
       * Choosing the output, deliberately OUTSIDE the gate below.
       *
       * This was inside it, and that was a deadlock: the gate refuses when no player is
       * selected, and this is the only route that can select one. A deployment with an empty
       * `PLAYER_ID_PRIMARY` — the correct state until the volume ceiling is measured — could
       * therefore never be given a speaker at all. The settings screen showed the list,
       * the tap appeared to work because the page updates itself optimistically, the server
       * answered 503, and the choice was gone on the next load.
       *
       * It needs MA reachable, not a player already chosen. `setTarget` validates the id
       * against MA's own player list, so this cannot store a speaker that does not exist.
       */
      if (route === "/api/speaker/target" && method === "POST") {
        if (!maConfigured()) {
          return json(res, 503, { error: "MA_HOST or MA_TOKEN is not configured" });
        }
        const payload = await body(req);
        const id = String(payload.playerId ?? "");
        let name: string | null;
        try {
          name = await speaker.setTarget(id);
          if (!name) return json(res, 400, { error: "unknown player" });
        } catch (e) {
          return maFailed(res, route, e);
        }
        // Persist both, so the choice AND its label survive the next redeploy.
        save(db, { playerId: id, playerName: name });
        return json(res, 200, { ok: true, id, name });
      }

      if (route.startsWith("/api/speaker/") && method === "POST") {
        if (!speaker.canPlay()) {
          return json(res, 503, { error: "no player selected, or MA host/token not configured" });
        }
        const payload = await body(req);
        try {
          switch (route) {
            case "/api/speaker/play": {
              // Validate before touching the room. A malformed request must not move a real
              // speaker's volume on its way to being rejected.
              const uri = String(payload.uri ?? "");
              if (!uri) return json(res, 400, { error: "no album uri" });
              const level = await speaker.play({
                uri,
                step: payload.step,
                steps: payload.steps,
                startIndex: payload.startIndex,
                startUri: payload.startUri ? String(payload.startUri) : undefined,
              });
              return json(res, 200, { ok: true, level });
            }
            case "/api/speaker/volume": {
              const level = await speaker.setVolume(payload.step, payload.steps);
              if (level === null) return json(res, 400, { error: "step and steps required" });
              return json(res, 200, { ok: true, level });
            }
            case "/api/speaker/playpause":
              await speaker.playPause();
              return json(res, 200, { ok: true });
            case "/api/speaker/next":
              await speaker.next();
              return json(res, 200, { ok: true });
            case "/api/speaker/previous":
              await speaker.previous();
              return json(res, 200, { ok: true });
          }
        } catch (e) {
          return maFailed(res, route, e);
        }
      }

      /* ── cover art ───────────────────────────────────────────────────── */
      if (route.startsWith("/imageproxy/") && method === "GET") {
        return await proxyCover(req, res);
      }

      /* ── the page ────────────────────────────────────────────────────── */
      if (method === "GET" || method === "HEAD") {
        if (await serveStatic(route, res)) return;
        // Single page, no client-side router: anything else is genuinely not here. Do NOT
        // fall back to index.html — a typo'd asset path silently returning HTML is how a
        // missing font takes a week to find.
      }

      return json(res, 404, { error: "not found" });
    } catch (e) {
      console.error(`[http] ${method} ${route}: ${(e as Error).message}`);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
    }
  };
}

/**
 * Cover bytes, passed through from Music Assistant.
 *
 * The page only ever talks to its own origin, which keeps mDNS resolution, MA's address
 * changing and every cross-origin behaviour out of the browser. The snapshot and the store
 * both hold host-less `/imageproxy/...` paths for exactly this reason.
 *
 * MA's imageproxy serves unauthenticated, so no credential is involved — but the size is
 * validated anyway rather than forwarded blind, because this port is open on a LAN and a
 * passthrough that forwards an arbitrary query string is a passthrough to somebody else's
 * server. MA resizes to a fixed allowlist only: {0, 80, 160, 256, 512, 1024}.
 */
async function proxyCover(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const id = url.pathname.slice("/imageproxy/".length);
  const size = url.searchParams.get("size") ?? "512";

  if (!id || !/^[A-Za-z0-9_.:%-]+$/.test(id) || !["0", "80", "160", "256", "512", "1024"].includes(size)) {
    return json(res, 400, { error: "bad cover request" });
  }

  const upstream = `${config.ma.baseUrl}/imageproxy/${id}?size=${size}`;
  let r: Response;
  try {
    r = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    // A cover that will not load is not an error the child can see: the page falls back to a
    // procedural sleeve, so a hole in the crate never appears. Log it and move on.
    console.warn(`[cover] ${id}: ${(e as Error).message}`);
    return json(res, 502, { error: "cover unavailable" });
  }

  if (!r.ok || !r.body) return json(res, r.status === 404 ? 404 : 502, { error: "cover unavailable" });

  res.statusCode = 200;
  res.setHeader("content-type", r.headers.get("content-type") ?? "image/jpeg");
  /**
   * Cache covers hard. A proxy id names one image and MA never reissues it for a different
   * one, so this is safe — and without a service worker (§3.1, the secure-origin trap) the
   * browser's own disk cache is the ONLY thing standing between a held-down arrow key and a
   * grid of black squares after a reboot.
   */
  res.setHeader("cache-control", "public, max-age=2592000, immutable");
  Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}
