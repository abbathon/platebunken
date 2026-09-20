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
   * The seed playlist — the parent's hand-built starting point for the crate (§5).
   *
   * Read here rather than in the command that uses it. It used to be read straight out of
   * `process.env` inside `scripts/db-seed.ts`, which is how it came to be left out of the
   * deployed `.env` entirely: a key nothing in the server reads looks script-only right up
   * until the script becomes a command inside the container.
   */
  seed: {
    playlistId: str("SEED_PLAYLIST_ID"),
    provider: str("SEED_PLAYLIST_PROVIDER", "qobuz"),
  },

  /**
   * How many daily backups of the crate to keep in the volume, beside the store.
   *
   * A week by default: long enough that a mistake made on a Friday is still recoverable on a
   * Monday, short enough that a volume nobody watches cannot fill with them. 0 keeps every
   * backup forever, which is a choice and not a mistake — see `prune`.
   */
  backupKeep: int("BACKUP_KEEP", 7),

  curate: {
    /**
     * Ceiling on how many albums one curation run may add to the queue. Ten seconds a day at
     * /admin, not ten minutes — the queue is reviewed by a parent on a phone, and a run that
     * adds two hundred candidates is a run that stops the queue being reviewed at all.
     */
    maxSuggestions: int("CURATE_MAX", 24),
  },

  /**
   * Where the built page lives. A path rather than a bundle: `vite build` writes it and this
   * process serves it, so there is exactly one origin and no CORS story to get wrong.
   */
  publicDir: str("PUBLIC_DIR", "./dist/public"),

  /** Shown in the parent's Device tab so a failed DHCP reservation is visible somewhere. */
  kioskIp: str("KIOSK_IP") || null,

  /**
   * The four digits in front of the parent surfaces — the settings screen on the device, and
   * the review queue at /admin.
   *
   * **A child gate, not security**, and it must not be mistaken for one: it is compared in
   * front-end JavaScript and it is readable by anyone who opens the page source. It stops a
   * four-year-old. The real boundaries are elsewhere and always were — the kiosk lockdown
   * (§8), the LAN, and the fact that no credential for Music Assistant, Qobuz, ListenBrainz or
   * the store is ever in a page.
   *
   * It lives here so the two surfaces cannot drift to different codes, which is what happens
   * when a constant is written down twice.
   */
  gatePin: str("GATE_PIN", "1234"),

  /**
   * ListenBrainz submission. Empty disables it entirely — silent, not broken.
   *
   * The token is read HERE and never leaves the server, exactly like `MA_TOKEN`: the page must
   * never hold it. There is deliberately no username setting, because the API identifies the
   * account by the token alone and this repository must not name the account. See the header
   * of `scrobble.ts` and docs/research/07.
   */
  listenbrainz: {
    token: str("LISTENBRAINZ_TOKEN"),
  },
} as const;

/**
 * Whether this process can actually play anything. False leaves the crate silent rather than
 * half-wired: the page renders, the covers are there, and Enter does nothing audible. That is
 * a deliberately better failure than a crate that looks broken.
 */
export const canPlay = (): boolean => Boolean(config.ma.host && config.ma.token && config.playerId);
