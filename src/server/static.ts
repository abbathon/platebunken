/**
 * The built page, served by the same process that serves the API.
 *
 * One origin, so there is no CORS story to get wrong and no second container to keep in step.
 * `vite build` writes `dist/public`; nothing here knows or cares how it got there.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";
import type { ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Resolve a request path inside the public directory, or null if it escapes.
 *
 * Normalise first, then check the resolved path is still under the root. Decoding after
 * normalising is how `%2e%2e%2f` walks out of a directory that looked guarded — the decode
 * has to happen first so that normalise sees what the filesystem will see.
 */
function safePath(root: string, urlPath: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes("\0")) return null;
  const full = resolve(join(root, normalize(decoded)));
  return full === root || full.startsWith(root + "/") ? full : null;
}

export function staticServer(publicDir: string) {
  const root = resolve(publicDir);

  return async function serve(urlPath: string, res: ServerResponse): Promise<boolean> {
    const wanted = urlPath === "/" ? "/index.html" : urlPath;
    const file = safePath(root, wanted);
    if (!file) return false;

    let size: number;
    try {
      const s = await stat(file);
      if (!s.isFile()) return false;
      size = s.size;
    } catch { return false; }

    const ext = extname(file).toLowerCase();
    res.statusCode = 200;
    res.setHeader("content-type", TYPES[ext] ?? "application/octet-stream");
    res.setHeader("content-length", size);
    /**
     * Vite fingerprints everything under `assets/`, so those may be cached hard. The entry
     * document may not: it is what points at the new fingerprints, and a kiosk that caches it
     * is a kiosk still running last month's page after a deploy, with no one to press reload.
     */
    res.setHeader(
      "cache-control",
      file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    );
    createReadStream(file).pipe(res);
    return true;
  };
}
