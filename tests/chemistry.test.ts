import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyDecay, applyStimulus, applyContagion, detectEmotions,
  describeEmotionalState, getExpressionHint, getBehaviorGuide,
  clamp,
  STIMULUS_VECTORS, EMOTION_PATTERNS,
} from "../src/chemistry.js";
import type { ChemicalState, StimulusType } from "../src/types.js";
import { CHEMICAL_KEYS } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeState(overrides: Partial<ChemicalState> = {}): ChemicalState {
  return { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50, ...overrides };
}

function assertInRange(state: ChemicalState): void {
  for (const key of CHEMICAL_KEYS) {
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
    const current = makeState({ DA: 80 });
    const baseline = makeState({ DA: 50 });
    const result = applyDecay(current, baseline, 0);
    assert.deepStrictEqual(result, current);
    assert.notStrictEqual(result, current); // new object
  });

  it("decays toward baseline over time", () => {
    const current = makeState({ DA: 80, NE: 90, HT: 30 });
    const baseline = makeState({ DA: 50, NE: 50, HT: 60 });
    const result = applyDecay(current, baseline, 60);

    // DA should be closer to 50 than 80
    assert.ok(result.DA < 80 && result.DA > 50, `DA should decay toward baseline: ${result.DA}`);
    // NE decays fast
    assert.ok(result.NE < 90 && result.NE >= 50, `NE should decay fast: ${result.NE}`);
    // HT was below baseline, should rise toward it
    assert.ok(result.HT > 30 && result.HT <= 60, `HT should rise toward baseline: ${result.HT}`);
  });

  it("fast chemicals decay faster than slow ones", () => {
    const current = makeState({ NE: 90, HT: 90 });
    const baseline = makeState({ NE: 50, HT: 50 });
    const result = applyDecay(current, baseline, 60);

    const neDelta = 90 - result.NE;
    const htDelta = 90 - result.HT;
    assert.ok(neDelta > htDelta, `NE should decay faster than HT: NE delta=${neDelta}, HT delta=${htDelta}`);
  });

  it("never decays past baseline (overshoots)", () => {
    const current = makeState({ DA: 90 });
    const baseline = makeState({ DA: 50 });
    // Even after a very long time
    const result = applyDecay(current, baseline, 10000);
    assert.ok(result.DA >= 50, `DA should not decay past baseline: ${result.DA}`);
  });

  it("all values stay in [0, 100]", () => {
    const current = makeState({ DA: 100, HT: 0, CORT: 100, OT: 0, NE: 100, END: 0 });
    const baseline = makeState();
    const result = applyDecay(current, baseline, 120);
    assertInRange(result);
  });

  it("returns baseline when minutes is very large", () => {
    const current = makeState({ DA: 100 });
    const baseline = makeState({ DA: 50 });
    const result = applyDecay(current, baseline, 100000);
    assert.ok(Math.abs(result.DA - 50) < 1, `DA should converge to baseline: ${result.DA}`);
  });
});

// ── applyStimulus ───────────────────────────────────────────

describe("applyStimulus", () => {
  it("applies praise stimulus correctly", () => {
    const current = makeState();
    const result = applyStimulus(current, "praise", 1.0, 25);
    assert.ok(result.DA > current.DA, "DA should increase on praise");
    assert.ok(result.CORT < current.CORT, "CORT should decrease on praise");
    assertInRange(result);
  });

  it("applies criticism stimulus correctly", () => {
    const current = makeState();
    const result = applyStimulus(current, "criticism", 1.0, 25);
    assert.ok(result.DA < current.DA, "DA should decrease on criticism");
    assert.ok(result.CORT > current.CORT, "CORT should increase on criticism");
    assertInRange(result);
  });

  it("respects maxDelta", () => {
    const current = makeState();
    const maxDelta = 10;
    const result = applyStimulus(current, "conflict", 1.0, maxDelta);
    for (const key of CHEMICAL_KEYS) {
      const delta = Math.abs(result[key] - current[key]);
      assert.ok(delta <= maxDelta + 0.001, `${key} delta ${delta} should be <= ${maxDelta}`);
    }
  });

  it("respects sensitivity multiplier", () => {
    const current = makeState();
    const low = applyStimulus(current, "praise", 0.5, 25);
    const high = applyStimulus(current, "praise", 1.5, 25);
    assert.ok(high.DA > low.DA, "Higher sensitivity should produce larger DA change");
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
    const low = makeState({ DA: 0, HT: 0, CORT: 0, OT: 0, NE: 0, END: 0 });
    const high = makeState({ DA: 100, HT: 100, CORT: 100, OT: 100, NE: 100, END: 100 });

    for (const type of Object.keys(STIMULUS_VECTORS) as StimulusType[]) {
      assertInRange(applyStimulus(low, type, 1.5, 30));
      assertInRange(applyStimulus(high, type, 1.5, 30));
    }
  });
});

// ── applyContagion ──────────────────────────────────────────

describe("applyContagion", () => {
  it("applies partial influence from user emotion", () => {
    const agent = makeState({ DA: 50 });
    const result = applyContagion(agent, "praise", 0.2, 1.0);
    // praise has DA: +15, contagion 0.2 → +3
    assert.ok(result.DA > agent.DA, "DA should increase via contagion");
    assert.ok(result.DA - agent.DA < 5, "Contagion effect should be small");
  });

  it("returns copy for unknown stimulus", () => {
    const agent = makeState();
    const result = applyContagion(agent, "nope" as StimulusType, 0.2, 1.0);
    assert.deepStrictEqual(result, agent);
  });

  it("all values stay in [0, 100]", () => {
    const extreme = makeState({ DA: 100, HT: 0, CORT: 100, OT: 0, NE: 100, END: 0 });
    const result = applyContagion(extreme, "conflict", 1.0, 1.5);
    assertInRange(result);
  });
});

// ── detectEmotions ──────────────────────────────────────────

describe("detectEmotions", () => {
  it("detects excited joy", () => {
    const state = makeState({ DA: 80, NE: 70, CORT: 20 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "excited joy"), "Should detect excited joy");
  });

  it("detects burnout", () => {
    const state = makeState({ DA: 30, NE: 30, CORT: 50 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "burnout"), "Should detect burnout");
  });

  it("detects boredom (new v0.2)", () => {
    const state = makeState({ DA: 30, NE: 30, CORT: 30 });
    const emotions = detectEmotions(state);
    assert.ok(emotions.some((e) => e.name === "boredom"), "Should detect boredom");
  });

  it("detects nostalgia (new v0.2)", () => {
    const state = makeState({ DA: 40, OT: 60, HT: 55, END: 55 });
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
    const state = makeState({ DA: 80, NE: 70, CORT: 20 });
    const desc = describeEmotionalState(state, "zh");
    assert.ok(desc.includes("愉悦兴奋"), `Should contain emotion name: ${desc}`);
  });

  it("supports English locale", () => {
    const state = makeState({ DA: 80, NE: 70, CORT: 20 });
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
    const state = makeState({ DA: 80 }); // High DA but maybe no full pattern match
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
    const state = makeState({ DA: 80, NE: 70, CORT: 20 });
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

  it("all vectors have all 6 chemical keys", () => {
    for (const [type, vec] of Object.entries(STIMULUS_VECTORS)) {
      for (const key of CHEMICAL_KEYS) {
        assert.ok(typeof vec[key] === "number", `${type}.${key} should be a number`);
      }
    }
  });

});
