/**
 * Two rules about the stylesheet that have each already cost this project a silent failure.
 *
 * Neither is a matter of taste, and neither is visible in a type checker, a linter or a diff
 * review — the only symptom is text rendering at the browser's 13px Arial default and looking
 * like a styling oversight rather than a dropped declaration.
 *
 *   node --test src/ui/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

/** Strip comments, so the notes explaining these bugs do not trip the tests about them. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

test("no `font` shorthand ends in `inherit`", () => {
  // `font: 700 28px/1 inherit` is INVALID — `inherit` is not a legal family inside the
  // shorthand — so the browser drops the WHOLE declaration. Verified in Chromium: such a
  // button computes to 13.33px, weight 400, Arial, rather than the size and weight written.
  //
  // It cost a keypad whose digits rendered as blank buttons, and it survived that fix in two
  // more rules (.admin__tab and .chip) until a screenshot caught them too. Bare `font:
  // inherit` is fine and is deliberately still allowed.
  const offenders = code
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => /font:\s*[^;]*\binherit\s*(;|$)/.test(line) && !/font:\s*inherit\s*(;|$)/.test(line));

  assert.deepEqual(
    offenders.map((o) => `${o.n}: ${o.line}`),
    [],
    "use the longhands (font-family/font-weight/font-size/line-height) instead",
  );
});

test("a control that cannot be used is styled as unusable", () => {
  // The Sources screen draws sources the server cannot act on as facts rather than toggles.
  // If the rule is ever dropped, they would look pressable again and the screen would be
  // back to lying about what it does.
  assert.match(code, /\.chip\[data-unavailable="1"\]/);
});
