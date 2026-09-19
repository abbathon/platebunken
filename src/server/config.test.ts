/**
 * Reading the environment.
 *
 * One test here is worth the file on its own: an unset variable must fall back to its default
 * and not to zero. `Number("")` is 0, so the obvious `isFinite` guard silently turned every
 * missing value into zero — which for VOLUME_CEILING means the crate goes permanently silent,
 * for MA_PORT means a connection to port 0, and for neither is there a log line saying so.
 *
 *   node --test src/server/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { intFrom, clamp } from "./config.ts";

test("an unset variable falls back to its default, not to zero", () => {
  assert.equal(intFrom("", 50), 50);
  assert.equal(intFrom("   ", 50), 50);
});

test("a set variable wins over the default", () => {
  assert.equal(intFrom("45", 50), 45);
  assert.equal(intFrom(" 45 ", 50), 45);
  assert.equal(intFrom("0", 50), 0);
});

test("a malformed variable falls back rather than becoming NaN", () => {
  // NaN propagates: a NaN ceiling makes every comparison against it false, so a volume clamp
  // written with Math.min stops clamping and says nothing about it.
  for (const bad of ["loud", "50%", "--", "1,5"]) assert.equal(intFrom(bad, 50), 50);
});

test("clamp keeps a value inside its bounds either way round", () => {
  assert.equal(clamp(120, 0, 100), 100);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(50, 0, 100), 50);
});
