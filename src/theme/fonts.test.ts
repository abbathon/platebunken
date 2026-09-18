import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NUMERAL_FACE, NUMERAL_FACES, numeralFace, numeralVars } from "./fonts.ts";

test("every candidate face is completely specified", () => {
  for (const f of NUMERAL_FACES) {
    for (const k of ["id", "label", "stack", "googleFamily", "note"] as const) {
      assert.ok(f[k]?.trim().length, `${f.id}: empty ${k}`);
    }
    assert.ok(f.weight >= 400 && f.weight <= 900, `${f.id}: implausible weight ${f.weight}`);
  }
});

test("every stack ends in a generic family", () => {
  // The kiosk has no WAN. A stack that ends in a named font disappears the moment the self-hosted
  // file is missing, and the number line is the one thing in his interface made of text.
  for (const f of NUMERAL_FACES) {
    const last = f.stack.split(",").pop()!.trim();
    assert.match(last, /^(sans-serif|serif|monospace|system-ui)$/, `${f.id}: stack ends in "${last}"`);
  }
});

test("an unknown face falls back rather than throwing", () => {
  assert.equal(numeralFace("comic").id, DEFAULT_NUMERAL_FACE);
  assert.equal(numeralFace(null).id, DEFAULT_NUMERAL_FACE);
  assert.equal(numeralFace("andika").id, "andika");
});

test("ids are unique and the default exists", () => {
  const ids = NUMERAL_FACES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_NUMERAL_FACE));
});

test("numeralVars emits the pair the stylesheet reads", () => {
  for (const f of NUMERAL_FACES) {
    const v = numeralVars(f);
    assert.equal(v["--numeral-font"], f.stack);
    assert.equal(v["--numeral-weight"], String(f.weight));
  }
});
