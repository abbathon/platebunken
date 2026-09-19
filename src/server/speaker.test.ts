/**
 * The volume mapping.
 *
 * This is the one function in the server whose failure is measured in decibels at a
 * four-year-old's pillow rather than in a log line, so it is pure, exported and tested
 * separately from everything that talks to a speaker. PRODUCT.md calls the ceiling a
 * hearing-safety requirement; these tests are what that sentence costs.
 *
 *   node --test src/server/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { levelFor } from "./speaker.ts";

const CEILING = 50;

test("full blocks means exactly the ceiling, and nothing above it exists", () => {
  // §4.3: "that is all there is." The top block is the ceiling, not a step towards it.
  assert.equal(levelFor(7, 7, CEILING), CEILING);
});

test("no blocks means silence", () => {
  assert.equal(levelFor(0, 7, CEILING), 0);
});

test("the blocks divide the ceiling evenly", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((s) => levelFor(s, 7, CEILING)),
    [0, 7, 14, 21, 29, 36, 43, 50],
  );
});

test("a step above the top is clamped, not scaled past the ceiling", () => {
  // A page that miscounts its own blocks, or a hand-made request, must not be able to ask
  // for more than the ceiling. The clamp is on the way in, before any arithmetic.
  assert.equal(levelFor(99, 7, CEILING), CEILING);
  assert.equal(levelFor(8, 7, CEILING), CEILING);
});

test("a negative step is silence, not a negative volume", () => {
  assert.equal(levelFor(-3, 7, CEILING), 0);
});

test("a malformed request returns null rather than guessing a level", () => {
  // Guessing here would mean moving a real speaker on the way to rejecting the request.
  // /volume turns null into a 400; /play falls back to VOLUME_START, which is also capped.
  for (const bad of [[undefined, 7], ["loud", 7], [3, 0], [3, -1], [3, "seven"], [NaN, 7], [3, NaN]]) {
    assert.equal(levelFor(bad[0], bad[1], CEILING), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("a ceiling of zero means the child cannot make a sound at any step", () => {
  // Not a hypothetical: it is the setting a parent reaches for at bedtime, and a mapping
  // that rounded up would turn "silent" into "quiet".
  for (const step of [0, 1, 4, 7]) assert.equal(levelFor(step, 7, 0), 0);
});

test("the mapping never exceeds the ceiling at any step or block count", () => {
  for (const ceiling of [0, 1, 7, 33, 50, 100]) {
    for (const steps of [1, 3, 5, 7, 12]) {
      for (let s = -2; s <= steps + 2; s++) {
        const level = levelFor(s, steps, ceiling)!;
        assert.ok(level >= 0 && level <= ceiling, `step ${s}/${steps} at ceiling ${ceiling} gave ${level}`);
      }
    }
  }
});
