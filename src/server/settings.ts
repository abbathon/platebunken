/**
 * The settings that outlive a reboot, and the ones that deliberately do not.
 *
 * Before this, every setting lived in page memory: a kiosk that reboots nightly forgot the
 * theme, the language and the numeral face every morning, and the speaker the parent picked
 * reverted to `PLAYER_ID_PRIMARY` on every container restart — which, with a container, is
 * every redeploy.
 *
 * **VOLUME_CEILING is not here, and that is the point.** It is a hearing-safety limit set from
 * an SPL measurement at the pillow (PRODUCT.md), so it belongs to the deployment, not to a
 * screen behind a four-digit gate that stops a four-year-old and nobody else. The server sends
 * it so the page can show the real number instead of a local default that disagreed with it —
 * read-only, and changing it means changing `.env` and redeploying, on purpose.
 */
import type { DatabaseSync } from "node:sqlite";
import { settings as read, setSettings as write } from "../store/crate.ts";
import { config } from "./config.ts";

/** The mark drawn beside a track he keeps choosing. `bar` is the quietest: no glyph at all. */
export const FAVOURITE_MARKS = [
  "bar", "heart", "pentagram", "sigil", "bolt", "flame", "pick", "skull",
  "helmet", "shield", "sword", "hammer", "dot",
] as const;
export type FavouriteMark = (typeof FAVOURITE_MARKS)[number];

export interface StoredSettings {
  lang: "nb" | "en";
  theme: string;
  numeralFace: string;
  favouriteMark: FavouriteMark;
  /** Marks off entirely. Some children chase a mark; this is the way back out. */
  favouritesShown: boolean;
  tricklePerDay: number;
  sources: { listenbrainz: boolean; lastfm: boolean; deezer: boolean; charts: boolean };
  /** The MA player the crate plays to. Null means "whatever .env says". */
  playerId: string | null;
}

export const DEFAULTS: StoredSettings = {
  lang: "nb",
  theme: "natt",
  numeralFace: "archivo",
  favouriteMark: "heart",
  favouritesShown: true,
  tricklePerDay: 1,
  sources: { listenbrainz: true, lastfm: true, deezer: true, charts: false },
  playerId: null,
};

const isMark = (v: unknown): v is FavouriteMark =>
  typeof v === "string" && (FAVOURITE_MARKS as readonly string[]).includes(v);

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

/**
 * Validate on the way OUT of the store, not only on the way in.
 *
 * A row written by an older build, a hand-edited database or a future key we dropped must not
 * be able to put an unknown value in front of the child — an unrecognised mark would render as
 * nothing and read as a bug, and an unrecognised theme would render as no theme at all.
 */
export function load(db: DatabaseSync): StoredSettings {
  const s = read(db) as Partial<StoredSettings>;
  const src = (s.sources ?? {}) as Partial<StoredSettings["sources"]>;
  return {
    lang: s.lang === "en" ? "en" : "nb",
    theme: str(s.theme, DEFAULTS.theme),
    numeralFace: str(s.numeralFace, DEFAULTS.numeralFace),
    favouriteMark: isMark(s.favouriteMark) ? s.favouriteMark : DEFAULTS.favouriteMark,
    favouritesShown: bool(s.favouritesShown, DEFAULTS.favouritesShown),
    tricklePerDay: Number.isFinite(s.tricklePerDay) ? Number(s.tricklePerDay) : DEFAULTS.tricklePerDay,
    sources: {
      listenbrainz: bool(src.listenbrainz, true),
      lastfm: bool(src.lastfm, true),
      deezer: bool(src.deezer, true),
      charts: bool(src.charts, false),
    },
    playerId: typeof s.playerId === "string" && s.playerId ? s.playerId : null,
  };
}

/** Only known keys are written. An unknown key in a PUT is dropped, not stored. */
export function save(db: DatabaseSync, patch: Record<string, unknown>): StoredSettings {
  const allowed = new Set(Object.keys(DEFAULTS));
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (allowed.has(k)) clean[k] = v;
  if (Object.keys(clean).length) write(db, clean);
  return load(db);
}

/** What the page receives: the stored settings plus the read-only facts from the environment. */
export function wireSettings(db: DatabaseSync) {
  return {
    ...load(db),
    /** Read-only. Shown so the screen stops disagreeing with what the speaker actually does. */
    volumeCeiling: config.volume.ceiling,
    volumeStart: config.volume.start,
    /** Tells the page to render those two as facts rather than as controls. */
    volumeReadOnly: true,
    marks: FAVOURITE_MARKS,
  };
}
