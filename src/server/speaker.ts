/**
 * Everything this process does to Music Assistant.
 *
 * The rule that does not change: **the page never holds a credential.** The token lives here,
 * the page posts a uri, and MA is asked exactly the two runtime questions §5.1 allows — *give
 * me this cover* (the imageproxy passthrough in `app.ts`) and *play this uri*. It is never
 * asked what it has got. That answer belongs to the store, and the approval gate is the only
 * way into the store.
 *
 * The one exception is `players()`, which asks MA what output devices exist. That is a parent
 * surface behind the keypad (§4.6) and never reaches the child's crate.
 *
 * Ported from the dev-only Vite plugin that stood in for this file. There is no second copy
 * now: `vite dev` proxies to this server, so what is developed against is what ships.
 */
import { MassClient } from "../ma/client.ts";
import { config, canPlay } from "./config.ts";

let client: MassClient | null = null;
let connecting: Promise<MassClient> | null = null;

/**
 * The output player, overridable at runtime from the parent's settings screen.
 *
 * Process memory, deliberately: this is not a child-facing setting and it is not the page's
 * to own. §4.6 puts settings in the store or in `.env`; a target chosen here survives until
 * the container restarts, at which point `PLAYER_ID_PRIMARY` is the answer again. Persisting
 * it belongs with the rest of the settings work, not bolted on here.
 */
let targetOverride: string | null = null;

export const target = (): string => targetOverride ?? config.playerId;

export async function ma(): Promise<MassClient> {
  if (client) return client;
  if (!connecting) {
    const c = new MassClient({ baseUrl: config.ma.baseUrl, token: config.ma.token });
    // The client reconnects itself, so one connection is cached for the life of the process.
    // A failed first connect clears the latch so the next request tries again rather than
    // sticking — an MA that was restarting when this container started must not poison it.
    connecting = c.connect().then(() => (client = c), (e) => { connecting = null; throw e; });
  }
  return connecting;
}

export function closeMa(): void {
  client?.close();
  client = null;
  connecting = null;
}

/**
 * The child's 0..steps blocks, in MA's 0..100 units, clamped to the ceiling.
 *
 * This is where VOLUME_CEILING stops being decoration. Full blocks means exactly the ceiling
 * and nothing above it exists, which is what §4.3's "that is all there is" describes — and it
 * is a hearing-safety requirement (PRODUCT.md), not a preference.
 *
 * Pure, exported and tested, because it is the one function here whose failure is measured in
 * decibels at a four-year-old's pillow rather than in a log line.
 */
export function levelFor(step: unknown, steps: unknown, ceiling = config.volume.ceiling): number | null {
  const s = Number(step), n = Number(steps);
  if (!Number.isFinite(s) || !Number.isFinite(n) || n <= 0) return null;
  const blocks = Math.max(0, Math.min(n, s));
  return Math.max(0, Math.min(ceiling, Math.round((blocks / n) * ceiling)));
}

export interface PlayerOption {
  id: string; name: string; provider: string; model: string | null; current: boolean;
}

/**
 * The players the parent may choose between.
 *
 * Filtered on `type !== "group"`, NOT on the provider domain. MA wraps protocol players in a
 * Universal Player, so the laptop's squeezelite player reports `provider: "universal_player"`
 * and a domain filter misses it entirely. That cost most of an hour and three wrong theories.
 */
export async function players(): Promise<PlayerOption[]> {
  const c = await ma();
  const chosen = target();
  return c.players
    .filter((p) => p.available && p.type !== "group")
    .map((p) => ({
      id: p.player_id,
      name: p.name,
      provider: p.provider,
      model: p.device_info?.model ?? null,
      current: p.player_id === chosen,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

export async function setTarget(playerId: string): Promise<boolean> {
  const c = await ma();
  if (!c.player(playerId)) return false;
  targetOverride = playerId;
  console.log(`[speaker] output switched to ${playerId}`);
  return true;
}

export interface PlayRequest {
  uri: string;
  step: unknown;
  steps: unknown;
  startIndex?: unknown;
  startUri?: string;
}

/**
 * Start a record.
 *
 * **Volume BEFORE audio, always, and a failure to set it stops the play.** The speaker is
 * shared: it can be sitting at whatever level the last person to use it left it at, and the
 * first thing a record does here is arrive in a child's bedroom. Starting the music and
 * correcting the volume afterwards means the loud moment still happened. So this is not
 * best-effort, and the `await` order below is the whole point of the function.
 */
export async function play(req: PlayRequest): Promise<number> {
  const player = target();
  const c = await ma();

  const level = levelFor(req.step, req.steps) ?? config.volume.start;
  await c.setVolume(player, level);

  await c.playAlbum(player, req.uri, req.startUri);

  // Only reached for an album whose tracks carry no uri — an unseeded or partially tagged
  // record. `start_item` above is one command; this is a play followed by a jump, and the
  // brief burst of the wrong track is exactly why it is the fallback and not the path.
  const index = Number(req.startIndex);
  if (!req.startUri && Number.isFinite(index) && index > 0) {
    await c.playIndex(player, index).catch(() => {});
  }
  return level;
}

export async function setVolume(step: unknown, steps: unknown): Promise<number | null> {
  const level = levelFor(step, steps);
  if (level === null) return null;
  await (await ma()).setVolume(target(), level);
  return level;
}

export const playPause = async () => { await (await ma()).playPause(target()); };
export const next = async () => { await (await ma()).next(target()); };

export { canPlay };
