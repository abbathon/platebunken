/**
 * A theme is the one part of this product a non-engineer might plausibly add later — the
 * older child will want one of his own. These tests are the guard rails for that: they say
 * what a theme must supply and what it is not allowed to do.
 *
 *   node --test src/theme/themes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_THEME_ID, MOTIF_DRIFT_FLOOR_MS, MOTIF_MAX_OPACITY, MOTIF_MOTION, THEMES, TOKENS, TRACER_FLOOR_MS,
  cornerSvg, emblemSvg, motifSvg, themeById, themeVars,
} from "./themes.ts";

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

test("every theme has an emblem, because that is how a pre-reader picks one", () => {
  // He cannot read "Vikingtid", and an orange dot does not mean vikings to anybody. The
  // emblem is the only part of a theme he actually operates.
  for (const t of THEMES) {
    assert.ok(t.emblem.trim().length > 0, `theme "${t.id}" has no emblem`);
    assert.match(emblemSvg(t), /viewBox="0 0 64 64"/, `${t.id}: emblem must use the 64x64 box`);
    assert.ok(!/fill="#|stroke="#/.test(t.emblem), `${t.id}: emblem must use currentColor`);
    // Silhouettes, not line art: a stroked drawing turns to mush at 40px on a picker disc.
    assert.ok(/fill="currentColor"/.test(t.emblem), `${t.id}: emblem should carry filled shapes`);
  }
});

test("a backdrop stays a texture and never becomes a picture", () => {
  for (const t of THEMES) {
    assert.ok(t.motif.opacity >= 0 && t.motif.opacity <= MOTIF_MAX_OPACITY,
      `${t.id}: motif at ${t.motif.opacity} exceeds the ${MOTIF_MAX_OPACITY} ceiling`);
    // An invisible drawing and a missing one must not be describable two ways.
    assert.equal(t.motif.svg === "", t.motif.opacity === 0, `${t.id}: motif svg/opacity disagree`);
    if (t.motif.svg) {
      assert.match(motifSvg(t), /viewBox="0 0 240 120"/, `${t.id}: motif must use the 240x120 box`);
      assert.match(motifSvg(t), /slice/, `${t.id}: motif is scaled to cover, so it must slice`);
      assert.ok(!/fill="#|stroke="#/.test(t.motif.svg), `${t.id}: motif must use currentColor`);
    } else {
      assert.equal(motifSvg(t), "");
    }
  }
});

test("the backdrop moves slowly or not at all", () => {
  // The largest moving surface in the product, in a bedroom, at night, behind the record he is
  // trying to choose. Slow enough and it is weather; quick enough and it is a visualiser.
  for (const t of THEMES) {
    const ms = t.motif.driftMs;
    assert.ok(ms === 0 || ms >= MOTIF_DRIFT_FLOOR_MS,
      `${t.id}: backdrop drift at ${ms}ms is below the ${MOTIF_DRIFT_FLOOR_MS}ms floor`);
    assert.equal(ms === 0, t.motif.svg === "", `${t.id}: a still backdrop and a missing one must not be the same state`);
  }
});

test("a motif only uses motion classes the stylesheet actually defines", () => {
  // themes.ts is pure data and cannot see the CSS. A class name typo would fail silently as a
  // backdrop that simply never moves, which is exactly the kind of bug nobody reports.
  const css = readFileSync(new URL("../../prototypes/crate/src/style.css", import.meta.url), "utf8");
  for (const c of MOTIF_MOTION) {
    assert.ok(css.includes(`#motif .${c}`), `stylesheet defines no motion for "${c}"`);
  }
  for (const t of THEMES) {
    for (const m of t.motif.svg.matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1]!.split(/\s+/)) {
        assert.ok((MOTIF_MOTION as readonly string[]).includes(c),
          `${t.id}: motif uses class "${c}", which is not in the motion vocabulary`);
      }
    }
  }
});

test("a drifting path is drawn wide enough to loop seamlessly", () => {
  // It is shifted a whole 80-unit period and still has to cover a 0-240 viewBox at both ends
  // of the cycle. Start it at -90 or the sea develops a visible seam every cycle.
  for (const t of THEMES) {
    for (const m of t.motif.svg.matchAll(/class="drift[^"]*"\s+d="M(-?[\d.]+)/g)) {
      assert.ok(Number(m[1]) <= -80, `${t.id}: a drifting path starts at x=${m[1]}, too far right to loop`);
    }
  }
});

test("a plate shape never changes what is possible to hit", () => {
  // §4.5 puts a hard 76px floor under every target because tap accuracy at this age is 57%.
  // The clip path is painted on a layer inside the button; applying it to the control itself
  // would clip the hit area with it. If this ever ends up on `.btn`, the floor is gone.
  const css = readFileSync(new URL("../../prototypes/crate/src/style.css", import.meta.url), "utf8");
  const onControl = /\.btn\s*\{[^}]*clip-path/.test(css) || /\.picker__dot\s*\{[^}]*clip-path/.test(css);
  assert.equal(onControl, false, "clip-path must be on the plate layer, never on the control");
});

test("themeVars emits a custom property for every token plus the frame metrics", () => {
  for (const t of THEMES) {
    const vars = themeVars(t);
    for (const k of TOKENS) assert.equal(vars[`--${k}`], t.tokens[k]);
    assert.equal(vars["--frame-ring-w"], `${t.frame.ringPx}px`);
    assert.equal(vars["--frame-settle"], `${t.frame.settleMs}ms`);
    assert.equal(vars["--frame-tracer"], `${t.frame.tracerMs}ms`);
    assert.equal(vars["--motif-opacity"], String(t.motif.opacity));
    assert.equal(vars["--motif-drift"], `${t.motif.driftMs}ms`);
    assert.ok(vars["--btn-plate"], `${t.id}: no plate shape`);
    assert.ok(Object.keys(vars).every((k) => k.startsWith("--")));
  }
});

test("the frame's tracer is never fast enough to read as a flicker", () => {
  // This is the one rule in this file with a person on the other end of it. A bright edge
  // moving fast, forty centimetres from a four-year-old's face, for as long as he is
  // choosing a record, is not a style decision. Off is allowed; fast is not.
  for (const t of THEMES) {
    const ms = t.frame.tracerMs;
    assert.ok(ms === 0 || ms >= TRACER_FLOOR_MS, `${t.id}: tracer at ${ms}ms is below the ${TRACER_FLOOR_MS}ms floor`);
    assert.ok(Number.isFinite(ms) && ms >= 0, `${t.id}: tracer must be a non-negative duration`);
  }
});

test("a theme can be fully quieted", () => {
  // prefers-reduced-motion removes the tracer in CSS, which only leaves selection legible if
  // the frame also carries a static ring. That ring's contrast is asserted above; this asserts
  // the frame has real thickness to show it with.
  for (const t of THEMES) {
    assert.ok(t.frame.ringPx >= 4, `${t.id}: a ${t.frame.ringPx}px ring is too thin to carry selection alone`);
  }
});
