/**
 * Can this deployment play, and who decides?
 *
 *   node --test src/server/
 *
 * ## The bug this defends against
 *
 * The first person to actually use the deployed crate reported two things: the settings screen
 * did not show which speaker was active, and no speaker produced any sound. They were one bug.
 *
 * `canPlay()` required `PLAYER_ID_PRIMARY` — an environment variable — to be non-empty. That
 * variable is deliberately empty on a deployment whose `VOLUME_CEILING` has not yet come from
 * an SPL measurement at the pillow, which DEPLOY.md calls the correct state. Meanwhile every
 * `POST /api/speaker/*` was refused when `canPlay()` was false, and the route that *chooses* a
 * speaker was one of them.
 *
 * So no speaker could be chosen, because no speaker was chosen. The page updates itself
 * optimistically, so the tap looked like it worked; the server answered 503 and the choice was
 * gone on the next load — which is exactly "it isn't clear what's active when you log in".
 *
 * The decision is a pure function precisely so this file needs no environment at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { playable, restoreTarget, target } from "./speaker.ts";

test("MA ready and a speaker chosen: it can play", () => {
  assert.equal(playable(true, "player-1"), true);
});

test("MA ready but no speaker chosen: it cannot", () => {
  assert.equal(playable(true, ""), false);
});

test("a speaker chosen but no MA credential: it cannot", () => {
  // The crate still renders; it is silent. §10 calls that a better failure than one that
  // looks broken.
  assert.equal(playable(false, "player-1"), false);
});

test("neither: it cannot", () => {
  assert.equal(playable(false, ""), false);
});

test("a runtime choice is sufficient on its own — PLAYER_ID_PRIMARY need never be set", () => {
  // This is the whole bug. `PLAYER_ID_PRIMARY` is empty on the real deployment by design, and
  // the parent's stored choice has to be able to enable playback without it.
  restoreTarget("chosen-by-the-parent");
  assert.equal(target(), "chosen-by-the-parent");
  assert.equal(playable(true, target()), true);
});

test("clearing the stored choice falls back to whatever the environment says", () => {
  restoreTarget(null);
  // No PLAYER_ID_PRIMARY in the test environment, so this is empty — and that is the state
  // that must NOT lock the parent out of choosing one.
  assert.equal(target(), "");
  assert.equal(playable(true, target()), false);
});

test("the stored choice wins over the environment default", () => {
  restoreTarget("from-settings");
  assert.equal(target(), "from-settings");
  restoreTarget(null);
});
