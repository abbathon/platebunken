import { defineConfig } from "vite";

// Single-target kiosk: one known Chromium on one known machine. No need to transpile
// down for a browser matrix that will never run this.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  esbuild: { target: "es2022" },
  server: { host: true },
});
