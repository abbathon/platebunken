/**
 * The small amount of HTTP this server needs, in one place.
 *
 * No framework. Six routes and a static directory do not earn a dependency tree that has to
 * be audited and upgraded for the next decade — the same argument §5.1 makes for `node:sqlite`
 * over a native addon.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export function json(res: ServerResponse, code: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  // The crate and the shelves change when the parent approves something; nothing here may be
  // served from a stale cache, and Chromium on the kiosk is aggressive about deciding for
  // itself when it has not been told.
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}

/**
 * Read a JSON request body, capped.
 *
 * Never rejects. A malformed body resolves to `{}` and the route validates from there, which
 * keeps every failure on one path instead of two. The cap exists because this port is open on
 * a LAN: 8 KiB is far more than any request here sends, and an unbounded read is a way to
 * exhaust a small container's memory with one curl.
 */
export function body(req: IncomingMessage, limit = 8192): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > limit) { raw = ""; req.destroy(); }
    });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

/** Path without query string or trailing slash. "/api/speaker/play/" -> "/api/speaker/play". */
export function routeOf(url: string | undefined): string {
  const path = (url ?? "/").split("?")[0]!;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
