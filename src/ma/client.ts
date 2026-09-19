import type { Album, Player, PlayerQueue, ServerInfo, Track } from "./types.ts";
import { CLIENT_MIN_SERVER_SCHEMA } from "./types.ts";

/**
 * Music Assistant WebSocket client.
 *
 * Protocol (music_assistant/controllers/webserver/websocket_client.py):
 *   1. server sends ServerInfoMessage on connect
 *   2. client sends `auth` with the long-lived token
 *   3. server replies { authenticated: true, ... } and ONLY THEN subscribes to events
 *   4. events arrive unsolicited; command results carry the echoed message_id
 *
 * The connection is long-lived by design: a kiosk holds this open for months and never
 * polls. Player state is maintained from PLAYER_UPDATED events, and queue state from
 * QUEUE_UPDATED / QUEUE_ITEMS_UPDATED.
 *
 * Those two queue event names were confirmed **on this household's server** (2.9.9, schema
 * 31) rather than read off a branch, because the running server's `/api-docs` publishes its
 * commands and its schemas but NOT its event names — there is no EventType enum to curl. The
 * confirmation was done without making a sound, by sending `player_queues/clear` to an
 * already-empty idle queue and watching what came back. If you need to re-confirm, do it the
 * same way; do not start playback in a child's bedroom to find out.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class MassCommandError extends Error {
  /** Node strips types rather than transforming them, so no parameter properties here. */
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "MassCommandError";
    this.code = code;
  }
}

export interface MassClientOptions {
  /** e.g. "http://musicassistant.lan:8095" */
  baseUrl: string;
  token: string;
  /** Called whenever a player's state changes. Never poll instead of using this. */
  onPlayerUpdate?: (player: Player) => void;
  /**
   * Called whenever a queue changes: a new record, a track transition, a pause, a stop.
   *
   * This is the only way the server learns that track 2 started when track 1 ended. Nothing
   * else in the system knows — the page only knows what the child pressed.
   */
  onQueueUpdate?: (queue: PlayerQueue) => void;
  onConnectionChange?: (connected: boolean) => void;
  commandTimeoutMs?: number;
}

export class MassClient {
  #ws: WebSocket | null = null;
  #seq = 0;
  #pending = new Map<string, Pending>();
  #players = new Map<string, Player>();
  #queues = new Map<string, PlayerQueue>();
  #info: ServerInfo | null = null;
  #closing = false;
  #backoff = 1000;
  readonly #opts: Required<Pick<MassClientOptions, "commandTimeoutMs">> & MassClientOptions;

  constructor(opts: MassClientOptions) {
    this.#opts = { commandTimeoutMs: 15_000, ...opts };
  }

  get info(): ServerInfo | null { return this.#info; }
  get players(): Player[] { return [...this.#players.values()]; }
  player(id: string): Player | undefined { return this.#players.get(id); }
  get queues(): PlayerQueue[] { return [...this.#queues.values()]; }
  /** A player's own queue_id is its player_id, so this takes either. */
  queue(id: string): PlayerQueue | undefined { return this.#queues.get(id); }

  // ── connection ────────────────────────────────────────────────

  async connect(): Promise<ServerInfo> {
    const url = new URL("/ws", this.#opts.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    return new Promise<ServerInfo>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.#ws = ws;
      let settled = false;

      const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } };

      ws.addEventListener("message", (ev) => {
        let msg: any;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }

        // 1. server info arrives first, unsolicited
        if (!this.#info && msg.server_id && msg.schema_version !== undefined) {
          this.#info = msg as ServerInfo;
          this.#assertSchema(this.#info);
          ws.send(JSON.stringify({ command: "auth", message_id: "auth", args: { token: this.#opts.token } }));
          return;
        }

        // 2. auth reply
        if (msg.message_id === "auth") {
          if (msg.authenticated || msg.result?.authenticated) {
            this.#backoff = 1000;
            this.#opts.onConnectionChange?.(true);
            settled = true;
            this.#hydratePlayers().then(() => resolve(this.#info!), (e) => reject(e));
          } else {
            fail(new MassCommandError(msg.error ?? "Authentication rejected by Music Assistant"));
            ws.close();
          }
          return;
        }

        // 3. command results
        if (msg.message_id && this.#pending.has(msg.message_id)) {
          const p = this.#pending.get(msg.message_id)!;
          this.#pending.delete(msg.message_id);
          clearTimeout(p.timer);
          if (msg.error_code || msg.error) {
            p.reject(new MassCommandError(msg.details ?? msg.error ?? "Command failed", msg.error_code));
          } else {
            p.resolve(msg.result);
          }
          return;
        }

        // 4. events
        if (msg.event) this.#onEvent(msg.event, msg.data);
      });

      ws.addEventListener("error", () => fail(new Error(`Cannot reach Music Assistant at ${this.#opts.baseUrl}`)));
      ws.addEventListener("close", () => {
        this.#opts.onConnectionChange?.(false);
        for (const [, p] of this.#pending) { clearTimeout(p.timer); p.reject(new Error("Connection closed")); }
        this.#pending.clear();
        fail(new Error("Connection closed before authentication"));
        if (!this.#closing) this.#scheduleReconnect();
      });
    });
  }

  close(): void {
    this.#closing = true;
    this.#ws?.close();
  }

  #scheduleReconnect(): void {
    const wait = this.#backoff;
    this.#backoff = Math.min(this.#backoff * 2, 30_000);
    setTimeout(() => {
      this.#info = null;
      this.connect().catch(() => { /* the next close schedules the retry */ });
    }, wait);
  }

  #assertSchema(info: ServerInfo): void {
    // Fail loudly and specifically. A silent schema drift here surfaces months later as
    // "the music stopped working" with no clue attached.
    if (info.schema_version < CLIENT_MIN_SERVER_SCHEMA) {
      throw new Error(
        `Music Assistant reports schema ${info.schema_version}, but this client needs at least ` +
        `${CLIENT_MIN_SERVER_SCHEMA}. Upgrade Music Assistant, or re-verify the commands against ` +
        `this server's /api-docs/commands.json.`,
      );
    }
    if (CLIENT_MIN_SERVER_SCHEMA < info.min_supported_schema_version) {
      throw new Error(
        `This client targets schema ${CLIENT_MIN_SERVER_SCHEMA} but the server has dropped support ` +
        `below ${info.min_supported_schema_version}. Update the client.`,
      );
    }
  }

  #onEvent(event: string, data: unknown): void {
    if (event === "player_updated" || event === "player_added") {
      const p = data as Player;
      this.#players.set(p.player_id, p);
      this.#opts.onPlayerUpdate?.(p);
    } else if (event === "player_removed") {
      this.#players.delete(String(data));
    } else if (event === "queue_updated" || event === "queue_items_updated" || event === "queue_added") {
      // The payload is the WHOLE PlayerQueue, never a delta — so replace, never merge.
      // Both names carry it; a clear emits both, one after the other. Subscribers are
      // therefore required to be idempotent, and `listens.ts` is built that way.
      const q = data as PlayerQueue;
      if (!q?.queue_id) return;
      this.#queues.set(q.queue_id, q);
      this.#opts.onQueueUpdate?.(q);
    }
  }

  async #hydratePlayers(): Promise<void> {
    const all = await this.command<Player[]>("players/all");
    for (const p of all) this.#players.set(p.player_id, p);

    // Queues are hydrated at connect for the same reason players are: after a reconnect the
    // server would otherwise believe nothing is playing until the next event, and a track
    // that started during the disconnect would never be attributed at all. This is a
    // one-shot read on connect, NOT a poll.
    //
    // Deliberately not fatal: an MA that answers players/all but not player_queues/all is
    // still an MA the child can play records on, and refusing to connect over a log we
    // cannot write would trade a working crate for a tidy one.
    try {
      for (const q of await this.command<PlayerQueue[]>("player_queues/all")) {
        if (q?.queue_id) this.#queues.set(q.queue_id, q);
      }
    } catch (e) {
      console.warn(`[ma] queues not hydrated: ${(e as Error).message}`);
    }
  }

  // ── commands ──────────────────────────────────────────────────

  command<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected"));
    const message_id = `m${++this.#seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(message_id);
        reject(new Error(`Timed out: ${command}`));
      }, this.#opts.commandTimeoutMs);
      this.#pending.set(message_id, { resolve: resolve as (v: unknown) => void, reject, timer });
      ws.send(JSON.stringify({ command, message_id, args }));
    });
  }

  // ── library ───────────────────────────────────────────────────

  albums(opts: { limit?: number; offset?: number; search?: string; favorite?: boolean } = {}): Promise<Album[]> {
    return this.command<Album[]>("music/albums/library_items", { limit: 100, ...opts });
  }

  albumTracks(item_id: string, provider_instance_id_or_domain = "library"): Promise<Track[]> {
    return this.command<Track[]>("music/albums/album_tracks", { item_id, provider_instance_id_or_domain });
  }

  // ── playback ──────────────────────────────────────────────────

  /**
   * Play an album on a player. This is the entire playback path for the child's UI.
   *
   * Handles the one failure the research says is certain to happen: someone grouped the
   * speaker from the Sonos app, which makes it a passive member that refuses to play.
   * Ungroup first, then play, then retry once. Silent to the child either way.
   *
   * `startItem` is a TRACK uri to begin the album from — `play_media`'s own documented
   * parameter on this server, so starting at track 7 is one command and the queue still
   * holds the whole record. Without it the album starts at track 1, and the caller must
   * fall back to `playIndex()`, which costs a second round trip and a moment of track 1.
   */
  async playAlbum(playerId: string, albumUri: string, startItem?: string): Promise<void> {
    const player = this.#players.get(playerId);
    if (player?.synced_to || player?.active_group) {
      await this.command("players/cmd/ungroup", { player_id: playerId }).catch(() => {});
    }
    const play = () =>
      this.command("player_queues/play_media", {
        queue_id: playerId, media: albumUri, option: "replace",
        ...(startItem ? { start_item: startItem } : {}),
      });
    try {
      await play();
    } catch (e) {
      // "player_synced_cannot_play" and friends: ungroup, then one more attempt.
      await this.command("players/cmd/ungroup", { player_id: playerId }).catch(() => {});
      await play();
    }
  }

  /** Jump to a position in the queue that is already loaded. 0-based, as MA counts it. */
  playIndex(playerId: string, index: number): Promise<unknown> {
    return this.command("player_queues/play_index", { queue_id: playerId, index });
  }

  setVolume(playerId: string, level: number): Promise<unknown> {
    return this.command("players/cmd/volume_set", { player_id: playerId, volume_level: Math.round(level) });
  }
  pause(playerId: string) { return this.command("players/cmd/pause", { player_id: playerId }); }
  playPause(playerId: string) { return this.command("players/cmd/play_pause", { player_id: playerId }); }
  next(playerId: string) { return this.command("players/cmd/next", { player_id: playerId }); }
}
