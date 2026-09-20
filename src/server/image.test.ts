/**
 * The image contains everything it runs.
 *
 *   node --test src/server/
 *
 * ## Why this exists
 *
 * The Dockerfile copies directories by hand, and for two releases it copied the wrong set.
 * `scripts/` was never in the image, and neither was `src/curate` — so the moment the
 * container became the deployment, the review queue could not be refilled from the machine
 * that held the real crate. Nothing failed at build time, nothing failed at boot, and the
 * symptom would have arrived weeks later as an empty queue with no obvious cause.
 *
 * The type checker cannot see this: it resolves imports against the repository, where every
 * file exists. `docker build` cannot see it either, because nothing imports these modules
 * until someone runs the command. The gap is only visible by comparing two things that live
 * in different files and are edited at different times — the Dockerfile's COPY list and the
 * import graph — which is exactly the comparison a person stops making.
 *
 * So: walk what each entrypoint actually imports, transitively, and assert every file is in
 * the image. Adding a module to a new directory now fails here rather than in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * What the runtime stage copies in.
 *
 * Only the runtime stage: the build stage copies all of `src` and then throws most of it away,
 * so reading the whole file would make this test pass for the wrong reason. `--from=` lines are
 * build artefacts (the Vite bundle), not source, and nothing walked here can import them.
 */
function copiedPaths(): string[] {
  const dockerfile = readFileSync(join(REPO, "Dockerfile"), "utf8");
  const runtime = dockerfile.slice(dockerfile.indexOf("AS runtime"));
  const out: string[] = [];
  for (const line of runtime.split("\n")) {
    const m = /^COPY\s+(?!--from=)(\S+)\s/.exec(line.trim());
    if (m) out.push(m[1]!);
  }
  return out;
}

/** The commands the image can actually start: the CMD, and the `pb` shim on PATH. */
const ENTRYPOINTS = ["src/server/index.ts", "src/cli.ts"];

/** Every local file reachable from `entry`, transitively, as repo-relative paths. */
function importGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.pop()!;
    if (seen.has(rel)) continue;
    seen.add(rel);

    const abs = join(REPO, rel);
    if (!existsSync(abs)) continue;
    const src = readFileSync(abs, "utf8");

    // Static imports and re-exports. Dynamic import() is deliberately not followed: there is
    // none in this codebase, and a test that silently half-works is worse than one that does
    // not exist. The assertion below fails loudly if that ever changes.
    assert.ok(
      !/\bimport\s*\(/.test(src.replace(/\/\/.*$/gm, "")),
      `${rel} uses dynamic import(); this test only follows static imports and must be taught how`,
    );

    for (const m of src.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)) {
      const spec = m[1]!;
      if (!spec.startsWith(".")) continue;   // node: builtins; there are no bare deps
      queue.push(relative(REPO, resolve(dirname(abs), spec)));
    }
  }
  return seen;
}

const isCopied = (rel: string, copied: readonly string[]) =>
  copied.some((c) => rel === c || rel.startsWith(c.endsWith("/") ? c : `${c}/`));

for (const entry of ENTRYPOINTS) {
  test(`everything ${entry} imports is copied into the image`, () => {
    const copied = copiedPaths();
    const missing = [...importGraph(entry)].filter((f) => !isCopied(f, copied)).sort();

    assert.deepEqual(
      missing, [],
      `${entry} imports files the runtime stage does not COPY:\n` +
      missing.map((f) => `    ${f}`).join("\n") +
      `\n  The image would build and boot, and fail only when that code path runs.` +
      `\n  Add the directory to the runtime stage of the Dockerfile.`,
    );
  });
}

test("the entrypoints this test guards are the ones the image can start", () => {
  const dockerfile = readFileSync(join(REPO, "Dockerfile"), "utf8");
  // If a CMD or a shim is added or renamed, ENTRYPOINTS above has to learn about it — the
  // whole guarantee is that every startable command was walked.
  assert.ok(dockerfile.includes(`CMD ["node", "src/server/index.ts"]`), "CMD changed; update ENTRYPOINTS");
  assert.ok(dockerfile.includes("node /app/src/cli.ts"), "the pb shim changed; update ENTRYPOINTS");
});

test("the runtime stage carries the licence, which MIT requires of every copy", () => {
  // An image is a copy. 0.2.1 shipped MIT-licensed source with no notice in it.
  assert.ok(copiedPaths().includes("LICENSE"), "COPY LICENSE ./ is missing from the runtime stage");
});
