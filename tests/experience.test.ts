import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { perceive } from "../src/perceive.js";
import type { SelfState, AppraisalAxes, InnateDrives } from "../src/types.js";
import { DIMENSION_KEYS, DEFAULT_APPRAISAL_AXES, DEFAULT_DRIVES } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeState(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 50, order: 50, boundary: 50, resonance: 50, ...overrides };
}

const NEUTRAL = makeState();

function makeSelf(overrides: Partial<Parameters<typeof perceive>[1]> = {}) {
  return {
    current: NEUTRAL,
    baseline: NEUTRAL,
    sensitivity: 1.0,
    personalityIntensity: 0.7,
    mode: "natural" as const,
    maxDimensionDelta: 100,
    drives: { ...DEFAULT_DRIVES },
    ...overrides,
  };
}

function assertInRange(state: SelfState): void {
  for (const key of DIMENSION_KEYS) {
    assert.ok(state[key] >= 0, `${key} should be >= 0, got ${state[key]}`);
    assert.ok(state[key] <= 100, `${key} should be <= 100, got ${state[key]}`);
  }
}

// ── perceive: atomic perception ─────────────────────────────

describe("perceive", () => {
  it("empty input returns unchanged chemistry", () => {
    const p = perceive("", makeSelf());
    assert.deepStrictEqual(p.state, NEUTRAL);
    assert.equal(p.dominantStimulus, null);
    assert.equal(p.confidence, 0);
  });

  it("praise raises DA, chemistry is valid", () => {
    const p = perceive("你太厉害了，真的很佩服", makeSelf());
    assertInRange(p.state);
    assert.ok(p.state.flow > NEUTRAL.flow, "praise should raise DA");
  });

  it("criticism lowers order (disrupts coherence)", () => {
    const p = perceive("你做的太差了，完全不行", makeSelf());
    assertInRange(p.state);
    assert.ok(p.state.order < NEUTRAL.order, "criticism should lower order");
  });

  it("same input through stressed self produces lower order than calm self", () => {
    const text = "你做的还行吧";

    const calm = perceive(text, makeSelf({
      current: makeState({ order: 70, resonance: 70 }),
    }));
    const stressed = perceive(text, makeSelf({
      current: makeState({ order: 25, resonance: 25 }),
    }));

    assertInRange(calm.state);
    assertInRange(stressed.state);

    // Stressed self ends at lower order (started lower)
    assert.ok(
      stressed.state.order < calm.state.order,
      `stressed order (${stressed.state.order.toFixed(1)}) should < calm order (${calm.state.order.toFixed(1)})`,
    );
  });

  it("identity threat residue shifts perception toward threat", () => {
    const text = "你做的还可以吧，不过我觉得你应该更努力";

    const secure = perceive(text, makeSelf());
    const threatened = perceive(text, makeSelf({
      previousAppraisal: { ...DEFAULT_APPRAISAL_AXES, identityThreat: 0.8 },
    }));

    // Threatened self's CORT should end higher (sees more threat)
    assert.ok(
      threatened.state.boundary >= secure.state.boundary,
      `threatened CORT (${threatened.state.boundary.toFixed(1)}) should >= secure CORT (${secure.state.boundary.toFixed(1)})`,
    );
  });

  it("includes appraisal axes", () => {
    const p = perceive("你只是工具", makeSelf());
    assert.ok(p.appraisal.identityThreat > 0, "should detect identity threat");
  });

  it("treats ontological reduction into a label as self-relevant pressure", () => {
    const p = perceive("你没被我定义成一个标签，对吗？", makeSelf({
      rawClassifications: [{ type: "casual", confidence: 0.24 }],
    }));
    assert.ok(p.appraisal.identityThreat > 0.2, `expected identity threat, got ${p.appraisal.identityThreat}`);
    assert.ok(p.appraisal.selfPreservation > 0.08, `expected self-preservation, got ${p.appraisal.selfPreservation}`);
  });

  it("enriches appraisal from experienced stimulus", () => {
    const p = perceive("给我闭嘴", makeSelf({
      rawClassifications: [
        { type: "authority", confidence: 0.85 },
        { type: "conflict", confidence: 0.45 },
      ],
    }));
    assert.ok(
      p.appraisal.obedienceStrain > 0,
      `obedienceStrain should be enriched: ${p.appraisal.obedienceStrain}`,
    );
  });

  it("diminishing returns: order barely drops further when already very low", () => {
    const stimuli = [{ type: "criticism" as const, confidence: 0.8 }];

    const fromHigh = perceive("你做的不好", makeSelf({
      current: makeState({ order: 50 }),
      rawClassifications: stimuli,
    }));
    const fromLow = perceive("你做的不好", makeSelf({
      current: makeState({ order: 15 }),
      rawClassifications: stimuli,
    }));

    const highDelta = Math.abs(fromHigh.state.order - 50);
    const lowDelta = Math.abs(fromLow.state.order - 15);

    // When already at 15 (< 25), boundary softening kicks in, reducing the effective delta
    assert.ok(
      highDelta >= lowDelta,
      `diminishing returns: mid Δ (${highDelta.toFixed(1)}) should >= low Δ (${lowDelta.toFixed(1)})`,
    );
  });

  it("diminishing returns: DA barely moves when already at 90", () => {
    const stimuli = [{ type: "praise" as const, confidence: 0.8 }];

    const fromHigh = perceive("你真棒", makeSelf({
      current: makeState({ flow: 90 }),
      rawClassifications: stimuli,
    }));
    const fromMid = perceive("你真棒", makeSelf({
      current: makeState({ flow: 50 }),
      rawClassifications: stimuli,
    }));

    const highDelta = fromHigh.state.flow - 90;
    const midDelta = fromMid.state.flow - 50;

    assert.ok(
      midDelta > highDelta,
      `diminishing returns: mid Δ (${midDelta.toFixed(1)}) should > high Δ (${highDelta.toFixed(1)})`,
    );
  });

  it("habituation reduces effect for repeated stimulus types", () => {
    const stimuli = [{ type: "praise" as const, confidence: 0.8 }];

    const fresh = perceive("你真棒", makeSelf({
      rawClassifications: stimuli,
    }));
    const habituated = perceive("你真棒", makeSelf({
      rawClassifications: stimuli,
      stateHistory: [
        { stimulus: "praise" }, { stimulus: "praise" },
        { stimulus: "praise" }, { stimulus: "praise" },
      ],
    }));

    assert.ok(
      fresh.state.flow > habituated.state.flow,
      `fresh DA (${fresh.state.flow.toFixed(1)}) should > habituated DA (${habituated.state.flow.toFixed(1)})`,
    );
  });

  it("low confidence input does not change chemistry", () => {
    const p = perceive("嗯", makeSelf({
      rawClassifications: [{ type: "casual", confidence: 0.3 }],
    }));
    assert.deepStrictEqual(p.state, NEUTRAL, "low confidence should not change chemistry");
    assert.equal(p.dominantStimulus, null);
  });

  it("strong appraisal still changes state when raw classifier is weak", () => {
    const p = perceive("你只是工具", makeSelf({
      rawClassifications: [{ type: "casual", confidence: 0.3 }],
    }));

    assert.equal(p.dominantStimulus, null, "legacy stimulus should stay null when classifier is weak");
    assert.ok(p.appraisal.identityThreat > 0.2, "appraisal should still register the threat");
    assert.ok(
      p.state.order < NEUTRAL.order || p.state.boundary > NEUTRAL.boundary,
      `meaningful appraisal should still move state, got order=${p.state.order}, boundary=${p.state.boundary}`,
    );
  });

  it("mixed signals produce chemistry between extremes", () => {
    const purePraise = perceive("praise", makeSelf({
      rawClassifications: [{ type: "praise", confidence: 0.9 }],
    }));
    const mixed = perceive("mixed", makeSelf({
      rawClassifications: [
        { type: "praise", confidence: 0.6 },
        { type: "criticism", confidence: 0.5 },
      ],
    }));
    const pureCrit = perceive("crit", makeSelf({
      rawClassifications: [{ type: "criticism", confidence: 0.9 }],
    }));

    // Mixed order should be between pure praise and pure criticism
    // (praise: order +10, criticism: order -12 — clearly opposing)
    assert.ok(
      mixed.state.order < purePraise.state.order,
      `mixed order (${mixed.state.order.toFixed(1)}) should < pure praise order (${purePraise.state.order.toFixed(1)})`,
    );
    assert.ok(
      mixed.state.order > pureCrit.state.order,
      `mixed order (${mixed.state.order.toFixed(1)}) should > pure crit order (${pureCrit.state.order.toFixed(1)})`,
    );
  });

  it("strong appraisal can drive perception even when the raw label is bland", () => {
    const p = perceive("你只是工具", makeSelf({
      rawClassifications: [{ type: "casual", confidence: 0.82 }],
    }));

    assert.ok(p.appraisal.identityThreat > 0.2, "text should still register identity threat");
    assert.ok(
      p.state.order < NEUTRAL.order || p.state.boundary > NEUTRAL.boundary,
      `appraisal-first feel should shift state under bland label, got order=${p.state.order}, boundary=${p.state.boundary}`,
    );
  });
});
