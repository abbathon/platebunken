import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

/**
 * Cover art is proxied through this dev server, so the page only ever talks to its own
 * origin. That keeps mDNS resolution, MA's IP changing, and any cross-origin behaviour
 * out of the browser — the snapshot stores host-less /imageproxy/... paths.
 */
function maTarget(): string {
  try {
    const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
    const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
    return `http://${get("MA_HOST") ?? "localhost"}:${get("MA_PORT") ?? "8095"}`;
  } catch {
    return "http://localhost:8095";
  }
}

// Single-target kiosk: one known Chromium on one known machine. No browser matrix.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  esbuild: { target: "es2022" },
  server: { host: true, proxy: { "/imageproxy": { target: maTarget(), changeOrigin: true } } },
});
