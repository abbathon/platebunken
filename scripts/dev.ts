/**
 * Both halves of development, from one command.
 *
 *   npm run dev
 *
 * `src/server/` serves the API and the store; Vite serves the page and proxies `/api` and
 * `/imageproxy` to it. The point is that there is only ONE implementation of the API now —
 * the dev-only Vite plugin that used to stand in for the server could never ship, and the
 * gap only showed up when a build was served and nothing answered it.
 *
 * Ctrl-C stops both. If either exits, the other goes with it: half a stack running is worse
 * than none, because it looks like it works.
 */
import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];
let shuttingDown = false;

function run(name: string, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`\n[dev] ${name} exited (${signal ?? code}) — stopping the rest`);
    stop(typeof code === "number" ? code : 1);
  });
  children.push(child);
  return child;
}

function stop(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 400).unref();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => stop(0));

run("server", process.execPath, ["--env-file=.env", "src/server/index.ts"]);
run("vite", "npx", ["vite", "prototypes/crate", "--open"]);
