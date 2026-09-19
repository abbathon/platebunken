import { defineConfig } from "vite";

/**
 * Vite builds the page. It does not serve the API any more.
 *
 * There used to be a dev-only plugin here (`apply: "serve"`) that stood in for
 * `platebunken-server`, and it was a good stand-in right up until the moment the page was
 * built: a build contains no plugin, so `vite build` produced 57 kB of static files that
 * called `/api/speaker/*` with nothing anywhere that answered. Two implementations of one
 * API, one of which could never ship.
 *
 * Now there is one. `npm run dev` starts `src/server/` alongside this, and every request the
 * page makes in development goes to the same code that will serve it on the kiosk.
 *
 * Cover art is proxied for the same reason it always was: the page only ever talks to its own
 * origin, which keeps mDNS resolution, MA's address changing and every cross-origin behaviour
 * out of the browser. The store holds host-less `/imageproxy/...` paths to suit.
 */
const SERVER = process.env.PLATEBUNKEN_SERVER ?? "http://localhost:8080";

// Single-target kiosk: one known Chromium on one known machine. No browser matrix.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    // Out of the prototype directory and into the one thing the container copies. Emptied on
    // every build so a renamed asset cannot linger and be served from a stale index.
    outDir: "../../dist/public",
    emptyOutDir: true,
  },
  esbuild: { target: "es2022" },
  server: {
    host: true,
    proxy: {
      "/api": { target: SERVER, changeOrigin: true },
      "/imageproxy": { target: SERVER, changeOrigin: true },
    },
  },
});
