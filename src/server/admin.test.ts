/**
 * The /admin page, as a served string.
 *
 * Two of these guard bugs this project has already paid for once, and neither is visible to
 * the type checker: a backtick inside the template literal that silently truncates the page,
 * and a value pasted into JavaScript without being escaped.
 *
 *   node --test src/server/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminHtml } from "./admin.ts";

test("the gate's digits are injected, not hardcoded", () => {
  const page = adminHtml("9182");
  assert.ok(page.includes('var PIN = "9182"'), "the configured pin reaches the page");
  assert.equal(page.includes("__GATE_PIN__"), false, "and the placeholder is gone");
});

test("a pin from the environment cannot break out of the string it is pasted into", () => {
  // It comes from GATE_PIN in .env. Quoting it by hand would let a stray quote or backslash
  // end the literal and take the rest of the script with it.
  const nasty = '1"; alert(1); var x="';
  const page = adminHtml(nasty);
  assert.ok(page.includes(JSON.stringify(nasty)), "escaped with JSON.stringify");
  assert.equal(page.includes('var PIN = "1"; alert(1)'), false, "not pasted raw");
});

test("the queue is not in the page until the gate is passed", () => {
  // The gate is a child gate and nothing more, but it must at least not render the two
  // buttons that decide a child's music behind a screen that looks locked.
  const page = adminHtml("1234");
  const gateAt = page.indexOf('id="gate"');
  const appAt = page.indexOf('id="app"');
  assert.ok(gateAt > -1 && appAt > gateAt, "the gate comes first");
  assert.match(page, /<div id="app" hidden>/, "and the queue starts hidden");
});

test("the page carries no backtick, which would truncate it", () => {
  // The whole file is one template literal. A backtick in the markup, a CSS rule or a comment
  // ends the string early and the page is served half-built. It has happened here before, in
  // a SQL comment, and took down a migration.
  const source = readFileSync(new URL("./admin.ts", import.meta.url), "utf8");
  const start = source.indexOf("const ADMIN_HTML = `") + 20;
  const end = source.lastIndexOf("`");
  const inner = source.slice(start, end);
  assert.equal((inner.match(/`/g) ?? []).length, 0);
  assert.equal((inner.match(/(?<!\\)\$\{/g) ?? []).length, 0, "and no accidental interpolation");
});

test("the page is self-contained: no external script or stylesheet", () => {
  // It is opened on a phone that may be on a network with no route off the LAN, and it must
  // not depend on a CDN to render the review queue.
  const page = adminHtml("1234");
  assert.equal(/<script[^>]+src=/.test(page), false);
  assert.equal(/<link[^>]+stylesheet/.test(page), false);
});

test("the hidden attribute is made to actually hide things", () => {
  // `hidden` is only display:none in the UA stylesheet, so any author display rule beats it.
  // `.gate` is display:grid, so hiding it did nothing: the gate stayed on screen behind the
  // unlocked queue. Caught in a browser, not by any test or type — hence this one.
  assert.match(adminHtml("1234"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});
