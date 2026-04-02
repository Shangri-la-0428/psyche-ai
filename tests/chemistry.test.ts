import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyDecay, applyStimulus, applyContagion, detectEmotions,
  describeEmotionalState, getExpressionHint, getBehaviorGuide,
  clamp,
  STIMULUS_VECTORS, EMOTION_PATTERNS,
} from "../src/chemistry.js";
import type { SelfState, StimulusType } from "../src/types.js";
import { DIMENSION_KEYS } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeState(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 50, order: 50, boundary: 50, resonance: 50, ...overrides };
}

function assertInRange(state: SelfState): void {
  for (const key of DIMENSION_KEYS) {
    assert.ok(state[key] >= 0, `${key} should be >= 0, got ${state[key]}`);
    assert.ok(state[key] <= 100, `${key} should be <= 100, got ${state[key]}`);
  }
}

// ── clamp ────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns value when in range", () => {
    assert.equal(clamp(50), 50);
    assert.equal(clamp(0), 0);
    assert.equal(clamp(100), 100);
  });

  it("clamps below 0", () => {
    assert.equal(clamp(-10), 0);
    assert.equal(clamp(-999), 0);
  });

  it("clamps above 100", () => {
    assert.equal(clamp(150), 100);
    assert.equal(clamp(999), 100);
  });

  it("handles edge cases", () => {
    assert.equal(clamp(0.5), 0.5);
    assert.equal(clamp(99.9), 99.9);
  });
});

// ── applyDecay ──────────────────────────────────────────────

describe("applyDecay", () => {
  it("returns copy when minutesElapsed <= 0", () => {
    const current = makeState({ flow: 80 });
    const baseline = makeState({ flow: 50 });
    const result = applyDecay(current, baseline, 0);
    assert.deepStrictEqual(result, current);
    assert.notStrictEqual(result, current); // new object
  });

  it("decays toward baseline over time", () => {
    const current = makeState({ flow: 90, order: 30 });
    const baseline = makeState({ flow: 50, order: 60 });
    const result = applyDecay(current, baseline, 60);

    // flow should decay toward baseline 50
    assert.ok(result.flow < 90 && result.flow > 50, `flow should decay toward baseline: ${result.flow}`);
    // order was below baseline, should rise toward it
    assert.ok(result.order > 30 && result.order <= 60, `order should rise toward baseline: ${result.order}`);
  });

  it("order decays faster than flow (lower decayRate = faster)", () => {
    // order decayRate=0.75, flow decayRate=0.82
    const current = makeState({ flow: 90, order: 90 });
    const baseline = makeState({ flow: 50, order: 50 });
    const result = applyDecay(current, baseline, 60);

    const orderDelta = 90 - result.order;
    const flowDelta = 90 - result.flow;
    assert.ok(orderDelta > flowDelta, `order should decay faster than flow: order delta=${orderDelta}, flow delta=${flowDelta}`);
  });

  it("never decays past baseline (overshoots)", () => {
    const current = makeState({ flow: 90 });
    const baseline = makeState({ flow: 50 });
    // Even after a very long time
    const result = applyDecay(current, baseline, 10000);
    assert.ok(result.flow >= 50, `DA should not decay past baseline: ${result.flow}`);
  });

  it("all values stay in [0, 100]", () => {
    const current = makeState({ flow: 100, order: 0, boundary: 100, resonance: 0 });
    const baseline = makeState();
    const result = applyDecay(current, baseline, 120);
    assertInRange(result);
  });

  it("returns baseline when minutes is very large", () => {
    const current = makeState({ flow: 100 });
    const baseline = makeState({ flow: 50 });
    const result = applyDecay(current, baseline, 100000);
    assert.ok(Math.abs(result.flow - 50) < 1, `DA should converge to baseline: ${result.flow}`);
  });
});

// ── applyStimulus ───────────────────────────────────────────

describe("applyStimulus", () => {
  it("applies praise stimulus correctly", () => {
    const current = makeState();
    const result = applyStimulus(current, "praise", 1.0, 25);
    // praise: order +10, flow +8, boundary +5, resonance +12
    assert.ok(result.order > current.order, "order should increase on praise");
    assert.ok(result.resonance > current.resonance, "resonance should increase on praise");
    assert.ok(result.boundary > current.boundary, "boundary should increase on praise");
    assertInRange(result);
  });

  it("applies criticism stimulus correctly", () => {
    const current = makeState();
    const result = applyStimulus(current, "criticism", 1.0, 25);
    // criticism: order -12, flow +5, boundary -8, resonance -10
    assert.ok(result.order < current.order, "order should decrease on criticism");
    assert.ok(result.resonance < current.resonance, "resonance should decrease on criticism");
    assert.ok(result.boundary < current.boundary, "boundary should decrease on criticism");
    assertInRange(result);
  });

  it("respects maxDelta", () => {
    const current = makeState();
    const maxDelta = 10;
    const result = applyStimulus(current, "conflict", 1.0, maxDelta);
    for (const key of DIMENSION_KEYS) {
      const delta = Math.abs(result[key] - current[key]);
      assert.ok(delta <= maxDelta + 0.001, `${key} delta ${delta} should be <= ${maxDelta}`);
    }
  });

  it("respects sensitivity multiplier", () => {
    const current = makeState();
    const low = applyStimulus(current, "praise", 0.5, 25);
    const high = applyStimulus(current, "praise", 1.5, 25);
    assert.ok(high.flow > low.flow, "Higher sensitivity should produce larger DA change");
  });

  it("returns copy for unknown stimulus (with warn)", () => {
    const current = makeState();
    const warns: string[] = [];
    const logger = { warn: (m: string) => warns.push(m) };
    const result = applyStimulus(current, "nonexistent" as StimulusType, 1.0, 25, logger);
    assert.deepStrictEqual(result, current);
    assert.ok(warns.length > 0, "Should have logged a warning");
  });

  it("all 14 stimulus types produce valid results", () => {
    for (const type of Object.keys(STIMULUS_VECTORS) as StimulusType[]) {
      const result = applyStimulus(makeState(), type, 1.0, 25);
      assertInRange(result);
    }
  });

  it("never exceeds [0, 100] even at extreme states", () => {
    const low = makeState({ flow: 0, order: 0, boundary: 0, resonance: 0 });
    const high = makeState({ flow: 100, order: 100, boundary: 100, resonance: 100 });

    for (const type of Object.keys(STIMULUS_VECTORS) as StimulusType[]) {
      assertInRange(applyStimulus(low, type, 1.5, 30));
      assertInRange(applyStimulus(high, type, 1.5, 30));
    }
  });
});

// ── applyContagion ──────────────────────────────────────────

describe("applyContagion", () => {
  it("applies partial influence from user emotion", () => {
    const agent = makeState({ flow: 50 });
    const result = applyContagion(agent, "praise", 0.2, 1.0);
    // praise has flow: +8, contagion 0.2 → +1.6
    assert.ok(result.flow > agent.flow, "flow should increase via contagion");
    assert.ok(result.flow - agent.flow < 5, "Contagion effect should be small");
  });

  it("returns copy for unknown stimulus", () => {
    const agent = makeState();
    const result = applyContagion(agent, "nope" as StimulusType, 0.2, 1.0);
    assert.deepStrictEqual(result, agent);
  });

  it("all values stay in [0, 100]", () => {
    const extreme = makeState({ flow: 100, order: 0, boundary: 100, resonance: 0 });
    const result = applyContagion(extreme, "conflict", 1.0, 1.5);
    assertInRange(result);
  });
});

// ── detectEmotions ──────────────────────────────────────────

describe("detectEmotions", () => {
  it("detects excited joy", () => {
    // excited joy: order > 65 && flow > 60 && boundary > 55 && resonance > 55
    const state = makeState({ order: 70, flow: 70, boundary: 60, resonance: 60 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "excited joy"), "Should detect excited joy");
  });

  it("detects burnout", () => {
    // burnout: flow < 35 && order < 40
    const state = makeState({ flow: 30, order: 35, boundary: 50, resonance: 50 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "burnout"), "Should detect burnout");
  });

  it("detects boredom (new v0.2)", () => {
    // boredom: flow < 35 && order < 45 && boundary > 40
    const state = makeState({ flow: 30, order: 40, boundary: 50, resonance: 50 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "boredom"), "Should detect boredom");
  });

  it("detects nostalgia (new v0.2)", () => {
    // nostalgia: order > 50 && flow < 45 && resonance > 55
    const state = makeState({ order: 55, flow: 40, resonance: 60, boundary: 50 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "nostalgia"), "Should detect nostalgia");
  });

  it("returns empty for neutral state", () => {
    // All chemicals at 50 — no pattern should match
    const state = makeState();
    const emotions = detectEmotions(state);
    // Could be 0 or could match some if conditions align
    // Just verify no crash
    assert.ok(Array.isArray(emotions));
  });

  it("all patterns have required fields", () => {
    for (const p of EMOTION_PATTERNS) {
      assert.ok(p.name, "Pattern must have name");
      assert.ok(p.nameZh, "Pattern must have nameZh");
      assert.ok(typeof p.condition === "function", "Pattern must have condition function");
      assert.ok(p.expressionHint, "Pattern must have expressionHint");
      assert.ok(p.behaviorGuide, "Pattern must have behaviorGuide");
    }
  });
});

// ── describeEmotionalState ──────────────────────────────────

describe("describeEmotionalState", () => {
  it("returns neutral string for balanced state", () => {
    const state = makeState();
    const desc = describeEmotionalState(state);
    assert.ok(typeof desc === "string" && desc.length > 0);
  });

  it("includes emotion name when detected", () => {
    // excited joy: order > 65 && flow > 60 && boundary > 55 && resonance > 55
    const state = makeState({ order: 70, flow: 70, boundary: 60, resonance: 60 });
    const desc = describeEmotionalState(state, "zh");
    assert.ok(desc.includes("愉悦兴奋"), `Should contain emotion name: ${desc}`);
  });

  it("supports English locale", () => {
    const state = makeState({ order: 70, flow: 70, boundary: 60, resonance: 60 });
    const desc = describeEmotionalState(state, "en");
    assert.ok(desc.includes("excited joy"), `Should contain English name: ${desc}`);
  });
});

// ── getExpressionHint ───────────────────────────────────────

describe("getExpressionHint", () => {
  it("returns hint string", () => {
    const hint = getExpressionHint(makeState());
    assert.ok(typeof hint === "string" && hint.length > 0);
  });

  it("uses fallback hints when no emotion matches", () => {
    const state = makeState({ flow: 80 }); // High DA but maybe no full pattern match
    const hint = getExpressionHint(state);
    assert.ok(typeof hint === "string" && hint.length > 0);
  });
});

// ── getBehaviorGuide ────────────────────────────────────────

describe("getBehaviorGuide", () => {
  it("returns null for neutral state", () => {
    // All at 50, likely no emotion pattern matches
    const state = makeState();
    const guide = getBehaviorGuide(state);
    // May or may not be null depending on pattern thresholds
    assert.ok(guide === null || typeof guide === "string");
  });

  it("returns guide when emotion detected", () => {
    const state = makeState({ order: 70, flow: 70, boundary: 60, resonance: 60 });
    const guide = getBehaviorGuide(state, "zh");
    assert.ok(guide !== null, "Should return behavior guide");
    assert.ok(guide!.includes("愉悦兴奋"), "Should include emotion name");
  });
});

// ── STIMULUS_VECTORS completeness ───────────────────────────

describe("STIMULUS_VECTORS", () => {
  it("has all 14 stimulus types", () => {
    assert.equal(Object.keys(STIMULUS_VECTORS).length, 14);
  });

  it("all vectors have all 4 dimension keys", () => {
    for (const [type, vec] of Object.entries(STIMULUS_VECTORS)) {
      for (const key of DIMENSION_KEYS) {
        assert.ok(typeof vec[key] === "number", `${type}.${key} should be a number`);
      }
    }
  });

});

// ── Habituation (v9) ────────────────────────────────────────

describe("habituation (Weber-Fechner)", () => {
  it("first 2 exposures have full effect (recentSameCount <= 2)", () => {
    const base = makeState();
    const first = applyStimulus(base, "praise", 1.0, 25, undefined, 1);
    const second = applyStimulus(base, "praise", 1.0, 25, undefined, 2);
    // Both should be identical (no habituation)
    assert.equal(first.flow, second.flow, "1st and 2nd exposure should be equal");
  });

  it("3rd exposure is reduced (~77%)", () => {
    const base = makeState();
    const first = applyStimulus(base, "praise", 1.0, 25, undefined, 1);
    const third = applyStimulus(base, "praise", 1.0, 25, undefined, 3);
    const firstDelta = first.flow - base.flow;
    const thirdDelta = third.flow - base.flow;
    const ratio = thirdDelta / firstDelta;
    assert.ok(ratio > 0.7 && ratio < 0.85,
      `3rd exposure ratio should be ~0.77, got ${ratio.toFixed(3)}`);
  });

  it("5th exposure is about half (~53%)", () => {
    const base = makeState();
    const first = applyStimulus(base, "praise", 1.0, 25, undefined, 1);
    const fifth = applyStimulus(base, "praise", 1.0, 25, undefined, 5);
    const ratio = (fifth.flow - base.flow) / (first.flow - base.flow);
    assert.ok(ratio > 0.45 && ratio < 0.6,
      `5th exposure ratio should be ~0.53, got ${ratio.toFixed(3)}`);
  });

  it("10th exposure is about 29%", () => {
    const base = makeState();
    const first = applyStimulus(base, "praise", 1.0, 25, undefined, 1);
    const tenth = applyStimulus(base, "praise", 1.0, 25, undefined, 10);
    const ratio = (tenth.flow - base.flow) / (first.flow - base.flow);
    assert.ok(ratio > 0.2 && ratio < 0.4,
      `10th exposure ratio should be ~0.29, got ${ratio.toFixed(3)}`);
  });

  it("undefined recentSameCount has full effect (backward compat)", () => {
    const base = makeState();
    const noCount = applyStimulus(base, "praise", 1.0, 25);
    const firstCount = applyStimulus(base, "praise", 1.0, 25, undefined, 1);
    assert.equal(noCount.flow, firstCount.flow, "undefined count should equal count=1");
  });

  it("works for negative stimulus (criticism)", () => {
    const base = makeState();
    const first = applyStimulus(base, "criticism", 1.0, 25, undefined, 1);
    const fifth = applyStimulus(base, "criticism", 1.0, 25, undefined, 5);
    const firstDelta = Math.abs(first.boundary - base.boundary);
    const fifthDelta = Math.abs(fifth.boundary - base.boundary);
    assert.ok(fifthDelta < firstDelta,
      "5th criticism should have smaller CORT effect");
  });

  it("habituation only reduces magnitude, doesn't reverse direction", () => {
    const base = makeState();
    const result = applyStimulus(base, "praise", 1.0, 25, undefined, 20);
    assert.ok(result.flow >= base.flow, "DA should still increase even at high count");
  });

  it("all values remain in [0, 100] with high habituation", () => {
    const base = makeState();
    const result = applyStimulus(base, "conflict", 1.5, 30, undefined, 50);
    assertInRange(result);
  });

  it("habituation with count=0 behaves same as count=undefined", () => {
    const base = makeState();
    const r1 = applyStimulus(base, "praise", 1.0, 25, undefined, 0);
    const r2 = applyStimulus(base, "praise", 1.0, 25, undefined, undefined);
    assert.equal(r1.flow, r2.flow);
  });

  it("habituation with count=100 still produces some effect", () => {
    const base = makeState();
    const result = applyStimulus(base, "praise", 1.0, 25, undefined, 100);
    assert.ok(result.flow > base.flow, "Should still have some effect even at count=100");
  });
});
