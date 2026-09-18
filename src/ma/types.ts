/** Minimal shapes for what this app touches. MA's full models live at /api-docs/schemas.json. */

export type PlaybackState = "idle" | "playing" | "paused" | "unknown";

export interface Player {
  player_id: string;
  name: string;
  available: boolean;
  powered: boolean | null;
  playback_state: PlaybackState;
  volume_level: number | null;
  /** Non-null means this speaker is a passive member of another player's group. */
  synced_to: string | null;
  active_group: string | null;
  group_members: string[];
  /** The player's own queue_id when MA owns it; an external source id otherwise. */
  active_source: string | null;
}

export interface Album {
  item_id: string;
  uri: string;
  name: string;
  version: string;
  year?: number;
  artists: { name: string; uri?: string }[];
  image?: string;
  /** Qobuz parental_warning surfaces here. Absent means unknown, NOT clean. */
  explicit?: boolean;
}

export interface Track {
  item_id: string;
  uri: string;
  name: string;
  /** Position within the album. This is the numeral the child sees. */
  track_number?: number;
  duration?: number;
  explicit?: boolean;
}

export interface ServerInfo {
  server_id: string;
  server_version: string;
  schema_version: number;
  min_supported_schema_version: number;
  base_url: string;
}

/**
 * Verified live against Music Assistant **2.9.9, API schema 31** by reading that server's
 * own `/api-docs/commands.json` — not a GitHub branch. Every command and argument name
 * this client uses was confirmed present there.
 *
 * Note for future readers: the research in docs/research/01 was written against the `dev`
 * branch at schema 77, which is far ahead of any released version. When the two disagree,
 * the running server's published spec wins. Re-check with:
 *
 *   curl -s http://<ma-host>:8095/api-docs/commands.json | jq -r '.[].command'
 */
export const CLIENT_MIN_SERVER_SCHEMA = 31;
