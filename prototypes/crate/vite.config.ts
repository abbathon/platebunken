import { defineConfig, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import { MassClient } from "../../src/ma/client.ts";

/**
 * `.env` read by hand, because `vite prototypes/crate` roots the dev server here and Node is
 * not started with `--env-file`. Same file the scripts use; nothing is ever written to it.
 */
const ENV = (() => {
  try { return readFileSync(new URL("../../.env", import.meta.url), "utf8"); } catch { return ""; }
})();
const env = (k: string, fallback = ""): string =>
  ENV.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() || fallback;

const maBaseUrl = () => `http://${env("MA_HOST", "localhost")}:${env("MA_PORT", "8095")}`;

/**
 * The speaker endpoint — a stand-in for `platebunken-server` (ARCHITECTURE.md §3), collapsed
 * into the dev server so the crate can drive a real speaker before that server exists.
 *
 * The shape is the one the real thing will have, and the reason is the one that will not
 * change: **the page never holds a credential.** The token lives in this Node process, the
 * page posts a uri, and Music Assistant is asked exactly the two runtime questions §5.1
 * allows it — *give me this cover* (the imageproxy passthrough below) and *play this uri*.
 * It is never asked what it has got; that answer belongs to the store.
 *
 * Dev only. `apply: "serve"` keeps it out of any build.
 */
function speaker(): Plugin {
  let client: MassClient | null = null;
  let connecting: Promise<MassClient> | null = null;

  /**
   * The output player, overridable at runtime from the parent's settings screen.
   *
   * .env holds the default; a change made on the device lives in this process only. On the
   * kiosk it belongs in the store (§4.6) — settings never live in the page, and the page is
   * not what is being changed here either: the server is.
   */
  let targetOverride: string | null = null;
  const target = () => targetOverride ?? env("PLAYER_ID_PRIMARY");
  const num = (k: string, d: number) => { const n = Number(env(k, String(d))); return Number.isFinite(n) ? n : d; };
  const ceiling = () => Math.max(0, Math.min(100, num("VOLUME_CEILING", 50)));
  const startVolume = () => Math.max(0, Math.min(ceiling(), num("VOLUME_START", 15)));

  async function ma(): Promise<MassClient> {
    if (client) return client;
    if (!connecting) {
      const c = new MassClient({ baseUrl: maBaseUrl(), token: env("MA_TOKEN") });
      // The client reconnects itself, so one connection is cached for the session. A failed
      // first connect clears the latch, so the next request tries again rather than sticking.
      connecting = c.connect().then(() => (client = c), (e) => { connecting = null; throw e; });
    }
    return connecting;
  }

  /**
   * The child's 0..steps blocks, in MA's 0..100 units, clamped to the ceiling.
   *
   * This is where VOLUME_CEILING stops being decoration. Full blocks means exactly the
   * ceiling and nothing above it exists, which is what §4.3's "that is all there is"
   * describes — and it is a hearing-safety requirement (PRODUCT.md), not a preference.
   */
  const levelFor = (step: unknown, steps: unknown): number | null => {
    const s = Number(step), n = Number(steps);
    if (!Number.isFinite(s) || !Number.isFinite(n) || n <= 0) return null;
    return Math.max(0, Math.min(ceiling(), Math.round((Math.max(0, Math.min(n, s)) / n) * ceiling())));
  };

  const body = (req: IncomingMessage): Promise<any> =>
    new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 8192) req.destroy(); });
      req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
      req.on("error", () => resolve({}));
    });

  const send = (res: ServerResponse, code: number, payload: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  };

  return {
    name: "platebunken-speaker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/speaker", async (req, res, next) => {
        const route = (req.url ?? "/").split("?")[0]!.replace(/\/$/, "") || "/";

        if (route === "/config" && req.method === "GET") {
          return send(res, 200, {
            configured: Boolean(target() && env("MA_TOKEN") && env("MA_HOST")),
            ceiling: ceiling(),
            start: startVolume(),
          });
        }
        /**
         * The players the parent may choose between. This is the ONE place Music Assistant is
         * asked what it has got, and it is a parent surface behind the keypad — never the
         * child's crate, whose contents come from the store and nowhere else (§5.1).
         */
        if (route === "/players" && req.method === "GET") {
          try {
            const c = await ma();
            const chosen = target();
            const players = c.players
              .filter((p) => p.available && p.type !== "group")
              .map((p) => ({
                id: p.player_id,
                name: p.name,
                provider: p.provider,
                model: p.device_info?.model ?? null,
                current: p.player_id === chosen,
              }))
              .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
            return send(res, 200, { players });
          } catch (e) {
            return send(res, 502, { error: (e as Error).message, players: [] });
          }
        }

        /**
         * The machine this is served from. `expected` is the address reserved for the kiosk on
         * the router; `addresses` is what the host actually has. Showing both is the point —
         * a mismatch is how you find out a DHCP reservation never took, and it is invisible
         * from anywhere else.
         */
        if (route === "/device" && req.method === "GET") {
          const nets = networkInterfaces();
          const addresses = Object.values(nets).flat()
            .filter((n): n is NonNullable<typeof n> => !!n && n.family === "IPv4" && !n.internal)
            .map((n) => n.address);
          const expected = env("KIOSK_IP") || null;
          return send(res, 200, {
            hostname: hostname(),
            addresses,
            expected,
            matches: expected ? addresses.includes(expected) : null,
            maHost: env("MA_HOST"),
          });
        }

        if (req.method !== "POST") return next();

        const player = target();
        if (!player) return send(res, 503, { error: "PLAYER_ID_PRIMARY is not set in .env" });

        try {
          const c = await ma();
          const payload = await body(req);

          switch (route) {
            case "/play": {
              /**
               * Volume BEFORE audio, always, and a failure to set it stops the play.
               *
               * The speaker is shared: it can be sitting at whatever level the last person
               * to use it left it at, and the first thing a record does here is arrive in a
               * child's bedroom. Starting the music and correcting the volume afterwards
               * means the loud moment still happens. So this is not best-effort.
               */
              // Validate before touching the room. A malformed request must not move a real
              // speaker's volume on its way to being rejected.
              const uri = String(payload.uri ?? "");
              if (!uri) return send(res, 400, { error: "no album uri" });

              const level = levelFor(payload.step, payload.steps) ?? startVolume();
              await c.setVolume(player, level);

              const startUri = payload.startUri ? String(payload.startUri) : undefined;
              await c.playAlbum(player, uri, startUri);

              // No track uri in the snapshot yet, so a track other than the first needs the
              // second round trip. `start_item` above is the path once snapshots carry them.
              const index = Number(payload.startIndex);
              if (!startUri && Number.isFinite(index) && index > 0) {
                await c.playIndex(player, index).catch(() => {});
              }
              return send(res, 200, { ok: true, level });
            }
            case "/target": {
              const id = String(payload.playerId ?? "");
              const c2 = await ma();
              if (!c2.player(id)) return send(res, 400, { error: "unknown player" });
              targetOverride = id;
              console.log(`[speaker] output switched to ${id}`);
              return send(res, 200, { ok: true, id });
            }
            case "/playpause":
              await c.playPause(player);
              return send(res, 200, { ok: true });
            case "/next":
              await c.next(player);
              return send(res, 200, { ok: true });
            case "/volume": {
              const level = levelFor(payload.step, payload.steps);
              if (level === null) return send(res, 400, { error: "step and steps required" });
              await c.setVolume(player, level);
              return send(res, 200, { ok: true, level });
            }
            default:
              return next();
          }
        } catch (e) {
          // Loud here, silent in the page: principle 4 says the child never sees an error,
          // and whoever is running the dev server is the one who can act on it.
          console.error(`[speaker] ${route}: ${(e as Error).message}`);
          return send(res, 502, { error: (e as Error).message });
        }
      });
    },
  };
}

/**
 * Cover art is proxied through this dev server, so the page only ever talks to its own
 * origin. That keeps mDNS resolution, MA's IP changing, and any cross-origin behaviour
 * out of the browser — the snapshot stores host-less /imageproxy/... paths.
 */
// Single-target kiosk: one known Chromium on one known machine. No browser matrix.
export default defineConfig({
  base: "./",
  plugins: [speaker()],
  build: { target: "es2022" },
  esbuild: { target: "es2022" },
  server: { host: true, proxy: { "/imageproxy": { target: maBaseUrl(), changeOrigin: true } } },
});
