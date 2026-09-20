/**
 * `.env.example` and the code say the same thing.
 *
 *   node --test src/server/
 *
 * ## Why this exists
 *
 * Six keys were out of step in one session, in both directions, and each one was invisible
 * until something went wrong somewhere else:
 *
 *   - `CURATE_MAX` was read by the code and documented nowhere, so nobody set it.
 *   - `SEED_PLAYLIST_ID` was read only by a script, so it was called "script-only" and left
 *     out of the deployed `.env` — and then the script became a command inside the container
 *     and the only machine with a real crate could not seed it.
 *   - `PLATEBUNKEN_TAG` was read by compose and documented nowhere.
 *   - `LISTENBRAINZ_LABS_BASE` and `NEW_SHELF_TRICKLE_PER_DAY` were documented and read by
 *     nothing. The second was worse than useless: it had become a stored setting the parent
 *     changes at /admin, so setting it in `.env` made a redeploy silently disagree with the
 *     screen.
 *   - `PLAYER_ID_FALLBACK` sat in a working `.env` and was read by nothing at all.
 *
 * A key nothing reads is the same lie as a toggle that does nothing, and this project has now
 * shipped both. Neither direction is catchable by the type checker: `process.env.X` is
 * `string | undefined` whether or not X exists anywhere else in the world.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Documented but read by nothing, on purpose.
 *
 * Every entry needs a reason, and the reason is the point: this is the list of things a
 * reader would otherwise have to guess about. `.env.example` marks each of these in place as
 * not implemented, which is the convention that keeps an operator from chasing credentials
 * for a feature that does not exist.
 */
const DOCUMENTED_BUT_UNREAD: Record<string, string> = {
  MQTT_HOST: "§12.8, not implemented",
  MQTT_PORT: "§12.8, not implemented",
  MQTT_USER: "§12.8, not implemented",
  MQTT_PASSWORD: "§12.8, not implemented",
  MQTT_DISCOVERY_PREFIX: "§12.8, not implemented",
  LASTFM_API_KEY: "§5 intended suggestion source; SOURCE_AVAILABLE.lastfm is false",
  MA_ADMIN_TOKEN: "used by scripts/ma-user.ts to mint the non-admin token; never by the server",
  PLAYER_ID_FALLBACK: "§7 second output; read by nothing yet",
  EXTRA_PLAYER_IDS: "§4.6 additional outputs; read by nothing yet",
};

/** Directories whose code ships in the image. `scripts/` deliberately does not — see image.test.ts. */
const SHIPPED = ["src/ma", "src/store", "src/server", "src/curate"];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(REPO, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(REPO, rel)).isDirectory()) walk(rel);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(rel);
    }
  };
  for (const d of SHIPPED) walk(d);
  out.push("src/cli.ts");
  return out;
}

/** Keys the shipped code reads, however it reads them. */
function keysReadByCode(): Map<string, string> {
  const found = new Map<string, string>();
  for (const rel of sourceFiles()) {
    const src = readFileSync(join(REPO, rel), "utf8");
    // `process.env.X`, `process.env["X"]`, and config.ts's own str("X") / int("X") helpers.
    for (const re of [
      /process\.env\.([A-Z][A-Z0-9_]*)/g,
      /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g,
      /\b(?:str|int)\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    ]) {
      for (const m of src.matchAll(re)) if (!found.has(m[1]!)) found.set(m[1]!, rel);
    }
  }
  return found;
}

/** Keys compose.yml interpolates. These configure the deployment, not the program. */
function keysReadByCompose(): Set<string> {
  const src = readFileSync(join(REPO, "compose.yml"), "utf8");
  return new Set([...src.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g)].map((m) => m[1]!));
}

function documentedKeys(): Set<string> {
  const src = readFileSync(join(REPO, ".env.example"), "utf8");
  return new Set(
    src.split("\n")
      .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l.trim())?.[1])
      .filter((k): k is string => Boolean(k)),
  );
}

test("every environment variable the shipped code reads is documented in .env.example", () => {
  const documented = documentedKeys();
  const undocumented = [...keysReadByCode()]
    .filter(([k]) => !documented.has(k))
    .map(([k, where]) => `${k}  (read in ${where})`)
    .sort();

  assert.deepEqual(
    undocumented, [],
    "these keys are read by code and documented nowhere, so nobody deploying will set them:\n" +
      undocumented.map((s) => `    ${s}`).join("\n"),
  );
});

test("every key compose.yml interpolates is documented in .env.example", () => {
  const documented = documentedKeys();
  const undocumented = [...keysReadByCompose()].filter((k) => !documented.has(k)).sort();

  // PLATEBUNKEN_TAG was read here and documented nowhere, which is how a host ended up
  // deploying a tag nobody had chosen.
  assert.deepEqual(undocumented, [], `compose.yml reads undocumented keys: ${undocumented.join(", ")}`);
});

test("every key in .env.example is read by something, or is listed as deliberately not", () => {
  const read = new Set([...keysReadByCode().keys(), ...keysReadByCompose()]);
  const orphans = [...documentedKeys()]
    .filter((k) => !read.has(k) && !(k in DOCUMENTED_BUT_UNREAD))
    .sort();

  assert.deepEqual(
    orphans, [],
    "these keys are documented but read by nothing:\n" +
      orphans.map((k) => `    ${k}`).join("\n") +
      "\n  Either delete them, or add them to DOCUMENTED_BUT_UNREAD with a reason." +
      "\n  A key nothing reads is the same lie as a toggle that does nothing.",
  );
});

test("the deliberate exceptions are still exceptions", () => {
  // If one of these gets implemented, it should drop off this list in the same commit —
  // otherwise the list slowly becomes a place where real keys go to be forgotten.
  const read = new Set([...keysReadByCode().keys(), ...keysReadByCompose()]);
  const nowRead = Object.keys(DOCUMENTED_BUT_UNREAD).filter((k) => read.has(k)).sort();

  assert.deepEqual(
    nowRead, [],
    `these are listed as read by nothing, but something reads them now: ${nowRead.join(", ")}` +
      "\n  Remove them from DOCUMENTED_BUT_UNREAD.",
  );
});

test("the keys with no sensible default are documented as required", () => {
  // These are the ones a deployment is simply broken without, and each has cost time by being
  // absent. DEPLOY.md §2 names the same set; this asserts .env.example at least carries them.
  const documented = documentedKeys();
  for (const k of ["MA_HOST", "MA_TOKEN", "PLAYER_ID_PRIMARY", "SEED_PLAYLIST_ID", "VOLUME_CEILING", "TZ"]) {
    assert.ok(documented.has(k), `${k} is missing from .env.example`);
  }
});
