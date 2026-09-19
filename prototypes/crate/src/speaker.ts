/**
 * The page's side of the speaker endpoint.
 *
 * Every call is fire-and-forget and none of them can throw. §10 and principle 4: the child
 * never sees an error, and a failure here must not take the interface down with it — he is
 * standing in front of a screen that has to keep working whatever Music Assistant is doing.
 * The failure is logged for whoever is running the dev server, which is the only person who
 * can act on it.
 *
 * This holds no token and knows no host. It posts a uri to its own origin; the dev server
 * (vite.config.ts) is what talks to Music Assistant, and `src/server/` will replace it
 * without this file changing.
 */
const post = async (route: string, payload: Record<string, unknown> = {}): Promise<void> => {
  try {
    const res = await fetch(`/api/speaker/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn(`[speaker] ${route}: ${res.status} ${(await res.json().catch(() => ({}))).error ?? ""}`);
  } catch (e) {
    console.warn(`[speaker] ${route}: ${(e as Error).message}`);
  }
};

export interface SpeakerConfig {
  /** False when .env has no player, host or token — the page then runs silent, as before. */
  configured: boolean;
  /** MA's 0-100 units. Full blocks map to exactly this and nothing above it exists. */
  ceiling: number;
  start: number;
}

export async function speakerConfig(): Promise<SpeakerConfig | null> {
  try {
    const res = await fetch("/api/speaker/config");
    return res.ok ? ((await res.json()) as SpeakerConfig) : null;
  } catch {
    return null;
  }
}

export interface PlayerOption {
  id: string; name: string; provider: string; model: string | null; current: boolean;
}
export interface DeviceInfo {
  hostname: string; addresses: string[]; expected: string | null; matches: boolean | null; maHost: string;
}

/** Parent surface only, behind the keypad. The child's crate never asks MA what it has got. */
export async function speakerPlayers(): Promise<PlayerOption[]> {
  try {
    const res = await fetch("/api/speaker/players");
    return res.ok ? ((await res.json()).players as PlayerOption[]) : [];
  } catch { return []; }
}

export async function deviceInfo(): Promise<DeviceInfo | null> {
  try {
    const res = await fetch("/api/speaker/device");
    return res.ok ? ((await res.json()) as DeviceInfo) : null;
  } catch { return null; }
}

export const speaker = {
  /**
   * Start a record. `step`/`steps` travel with it because the server sets the volume before
   * it starts any audio — what the blocks show is what the room gets, and a record never
   * arrives at whatever level the speaker was left at.
   *
   * `startIndex` is 0-based, as MA counts the queue. `startUri` is the better path and is
   * used when the snapshot carries track uris.
   */
  play: (uri: string, step: number, steps: number, startIndex = 0, startUri?: string) =>
    post("play", { uri, step, steps, startIndex, startUri }),
  playPause: () => post("playpause"),
  next: () => post("next"),
  volume: (step: number, steps: number) => post("volume", { step, steps }),
  /** Switch output. The server owns the target; the page only names one. */
  setTarget: (playerId: string) => post("target", { playerId }),
};
