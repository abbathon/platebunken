/**
 * Every environment value this process reads, resolved once, at boot.
 *
 * Read once rather than per request because a container's environment cannot change while it
 * runs, and because a value read in three places is a value that disagrees with itself in
 * one of them. The one exception is the output player, which the parent can change at runtime
 * (§4.6) — that lives in `speaker.ts`, which owns it.
 *
 * `.env` is never read by this file. In development Node is started with `--env-file=.env`;
 * in the container the values arrive through compose's `env_file:`, and **never through a
 * Dockerfile `ENV` or a COPY of .env** — a layer is public the moment the image is, and
 * `docker history` reads it back. ARCHITECTURE.md §3.1.
 */
const str = (k: string, fallback = ""): string => (process.env[k] ?? "").trim() || fallback;

/**
 * An integer from the environment, or the fallback.
 *
 * The empty-string check is not defensive padding, it is the bug: `Number("")` is **0**, not
 * NaN, so an `isFinite` guard alone quietly turns every unset variable into zero. That set
 * VOLUME_CEILING to 0 and MA_PORT to 0 on a container started without a full `.env` — the
 * first fails silent, the second fails weird, and neither says why.
 */
export function intFrom(raw: string, fallback: number): number {
  if (!raw.trim()) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const int = (k: string, fallback: number): number => intFrom(process.env[k] ?? "", fallback);

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * The volume ceiling, in MA's 0-100 units.
 *
 * This is a hearing-safety requirement and not a preference (PRODUCT.md), so a missing or
 * malformed value must not read as "no limit". It falls back to 50 and clamps to 0..100, and
 * `index.ts` says so at boot loudly enough that nobody deploys past it by accident.
 */
export const VOLUME_CEILING = clamp(int("VOLUME_CEILING", 50), 0, 100);

export const config = {
  port: int("PORT", 8080),
  /** 0.0.0.0 in a container: the port is published by the runtime, not chosen here. */
  host: str("HOST", "0.0.0.0"),

  ma: {
    host: str("MA_HOST"),
    port: int("MA_PORT", 8095),
    token: str("MA_TOKEN"),
    get baseUrl() { return `http://${this.host}:${this.port}`; },
  },

  /** The default output. The parent can change it at runtime; this is where it starts. */
  playerId: str("PLAYER_ID_PRIMARY"),

  volume: {
    ceiling: VOLUME_CEILING,
    start: clamp(int("VOLUME_START", 15), 0, VOLUME_CEILING),
  },

  profile: {
    id: str("PROFILE_ID", "child_a"),
    label: str("PROFILE_LABEL", "child_a"),
  },

  databasePath: str("DATABASE_PATH", "./data/platebunken.sqlite"),

  /**
   * Where the built page lives. A path rather than a bundle: `vite build` writes it and this
   * process serves it, so there is exactly one origin and no CORS story to get wrong.
   */
  publicDir: str("PUBLIC_DIR", "./dist/public"),

  /** Shown in the parent's Device tab so a failed DHCP reservation is visible somewhere. */
  kioskIp: str("KIOSK_IP") || null,
} as const;

/**
 * Whether this process can actually play anything. False leaves the crate silent rather than
 * half-wired: the page renders, the covers are there, and Enter does nothing audible. That is
 * a deliberately better failure than a crate that looks broken.
 */
export const canPlay = (): boolean => Boolean(config.ma.host && config.ma.token && config.playerId);
