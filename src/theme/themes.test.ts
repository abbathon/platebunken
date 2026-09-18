/**
 * A theme is the one part of this product a non-engineer might plausibly add later — the
 * older child will want one of his own. These tests are the guard rails for that: they say
 * what a theme must supply and what it is not allowed to do.
 *
 *   node --test src/theme/themes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME_ID, THEMES, TOKENS, cornerSvg, themeById, themeVars } from "./themes.ts";

/** WCAG 2.x relative luminance, for hex colours only. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `not a hex colour: ${hex}`);
  const n = parseInt(m![1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

test("every theme defines exactly the token set, no more and no less", () => {
  for (const t of THEMES) {
    assert.deepEqual(
      Object.keys(t.tokens).sort(), [...TOKENS].sort(),
      `theme "${t.id}" does not define exactly the tokens in TOKENS`,
    );
  }
});

test("a theme carries no spatial information", () => {
  // Rule 3: themes are the one thing here that can be changed freely, and that is only true
  // while they hold nothing that could move something the child has memorised.
  const spatial = /tile|grid|column|row|gap|target|page|size|width|height|position/i;
  for (const t of THEMES) {
    for (const k of Object.keys(t.tokens)) {
      assert.ok(!spatial.test(k), `theme token "${k}" in "${t.id}" looks like layout, not chrome`);
    }
  }
});

test("theme ids are unique and the default exists", () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_THEME_ID));
});

test("an unknown or missing theme falls back to the default rather than throwing", () => {
  // The kiosk reads this from config. A typo there must not leave a child with a blank screen.
  assert.equal(themeById("vikingtidd").id, DEFAULT_THEME_ID);
  assert.equal(themeById(null).id, DEFAULT_THEME_ID);
  assert.equal(themeById(undefined).id, DEFAULT_THEME_ID);
  assert.equal(themeById("vikingtid").id, "vikingtid");
});

test("body text clears WCAG AAA on every theme, and dim text clears AA", () => {
  for (const t of THEMES) {
    const body = contrast(t.tokens.ink, t.tokens.bg);
    assert.ok(body >= 7, `${t.id}: ink on bg is ${body.toFixed(2)}:1, below AAA 7:1`);
    const dim = contrast(t.tokens["ink-dim"], t.tokens.bg);
    assert.ok(dim >= 4.5, `${t.id}: ink-dim on bg is ${dim.toFixed(2)}:1, below AA 4.5:1`);
  }
});

test("the play button's own label stays legible on the accent in every theme", () => {
  // btn--play puts on-glow on glow. Get this wrong and the single most important control in
  // the product becomes a coloured blob.
  for (const t of THEMES) {
    const c = contrast(t.tokens["on-glow"], t.tokens.glow);
    assert.ok(c >= 4.5, `${t.id}: on-glow on glow is ${c.toFixed(2)}:1, below AA 4.5:1`);
  }
});

test("the selection ring is clearly distinct from the surface it sits on", () => {
  // The child cannot read, so the ring is how he knows which sleeve is live. It has to carry
  // that alone, from across a room.
  for (const t of THEMES) {
    const c = contrast(t.tokens["frame-ring"], t.tokens.bg);
    assert.ok(c >= 4.5, `${t.id}: frame-ring on bg is ${c.toFixed(2)}:1, too weak to mark selection`);
  }
});

test("corner ornaments and their size agree", () => {
  for (const t of THEMES) {
    const has = t.frame.corner !== null;
    assert.equal(has, t.frame.cornerPx > 0, `theme "${t.id}" has a corner/size mismatch`);
    assert.equal(cornerSvg(t) === "", !has);
    if (has) {
      assert.match(cornerSvg(t), /viewBox="0 0 32 32"/, `${t.id}: ornament must use the 32x32 box`);
      assert.ok(!/fill="#|stroke="#/.test(t.frame.corner!), `${t.id}: ornament must use currentColor`);
    }
  }
});

test("themeVars emits a custom property for every token plus the frame metrics", () => {
  for (const t of THEMES) {
    const vars = themeVars(t);
    for (const k of TOKENS) assert.equal(vars[`--${k}`], t.tokens[k]);
    assert.equal(vars["--frame-ring-w"], `${t.frame.ringPx}px`);
    assert.equal(vars["--frame-settle"], `${t.frame.settleMs}ms`);
    assert.ok(Object.keys(vars).every((k) => k.startsWith("--")));
  }
});

test("free-running motion stays opt-in", () => {
  // Rule 4. If this ever fails, someone has made the default device animate at itself in a
  // dark bedroom, which is the night-light §4.3 rules out.
  assert.equal(themeById(DEFAULT_THEME_ID).frame.breath, false);
});
