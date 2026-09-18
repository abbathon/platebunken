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

/** The schema this client was written against. */
export const WRITTEN_AGAINST_SCHEMA = 77;
