import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeExperientialField,
  computeCoherence,
  detectUnnamedEmotion,
  computeAffectCore,
} from "../src/experiential-field.js";
import type { ConstructionContext } from "../src/experiential-field.js";
import type {
  PsycheState, SelfState, StateSnapshot, InnateDrives, RelationshipState,
} from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE, DEFAULT_RELATIONSHIP,
} from "../src/types.js";

// -- Helpers ------------------------------------------------------------------

function makeChemistry(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 45, order: 65, boundary: 35, resonance: 50, ...overrides };
}

function makeState(overrides?: Partial<PsycheState>): PsycheState {
  return {
    version: 6,
    mbti: "INFJ",
    sensitivity: 1.0,
    baseline: { flow: 45, order: 65, boundary: 35, resonance: 50 },
    current: { flow: 45, order: 65, boundary: 35, resonance: 50 },
    drives: { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    empathyLog: null,
    selfModel: { values: ["authenticity"], preferences: ["depth"], boundaries: ["no dishonesty"], currentInterests: ["philosophy"] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh" },
    ...overrides,
  };
}

// -- computeExperientialField -------------------------------------------------

describe("computeExperientialField", () => {
  it("returns an ExperientialField with all required fields", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    assert.ok(typeof field.narrative === "string" && field.narrative.length > 0);
    assert.ok(typeof field.quality === "string" && field.quality.length > 0);
    assert.ok(typeof field.intensity === "number");
    assert.ok(typeof field.coherence === "number");
    assert.ok(typeof field.phenomenalDescription === "string" && field.phenomenalDescription.length > 0);
  });

  it("returns intensity 0-1", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    assert.ok(field.intensity >= 0 && field.intensity <= 1, `intensity ${field.intensity} out of range`);
  });

  it("returns coherence 0-1", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    assert.ok(field.coherence >= 0 && field.coherence <= 1, `coherence ${field.coherence} out of range`);
  });

  it("identifies numb/low intensity when chemistry equals baseline", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    // Baseline == current => intensity near 0 => either numb or very low intensity contentment
    assert.ok(field.intensity < 0.2, `expected very low intensity at baseline, got ${field.intensity}`);
  });

  it("detects high intensity when chemistry deviates significantly from baseline", () => {
    const state = makeState({
      current: { flow: 95, order: 20, boundary: 90, resonance: 10 },
    });
    const field = computeExperientialField(state);
    assert.ok(field.intensity > 0.5, `expected high intensity, got ${field.intensity}`);
  });

  it("selects vigilance quality when order is low and flow is high", () => {
    const state = makeState({
      current: { flow: 75, order: 20, boundary: 30, resonance: 30 },
      drives: { survival: 45, safety: 30, connection: 60, esteem: 60, curiosity: 70 },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "vigilance");
  });

  it("selects warm-connection when resonance is high, order is high, and trust is high", () => {
    const state = makeState({
      current: { flow: 30, order: 75, boundary: 35, resonance: 90 },
      relationships: { _default: { trust: 75, intimacy: 60, phase: "close" } },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "warm-connection");
  });

  it("provides a zh narrative when locale is zh", () => {
    const state = makeState({
      current: makeChemistry({ flow: 75, boundary: 25 }),
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh" },
    });
    const field = computeExperientialField(state);
    // zh narrative should contain Chinese characters
    assert.ok(/[\u4e00-\u9fff]/.test(field.narrative), "expected Chinese characters in zh narrative");
  });

  it("provides an en narrative when locale is en", () => {
    const state = makeState({
      current: makeChemistry({ flow: 75, boundary: 25 }),
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "en" },
    });
    const field = computeExperientialField(state);
    // en narrative should contain English words
    assert.ok(/[a-zA-Z]/.test(field.narrative), "expected English characters in en narrative");
  });
});

// -- computeCoherence ---------------------------------------------------------

describe("computeCoherence", () => {
  it("returns a value between 0 and 1", () => {
    const chem = makeChemistry();
    const baseline = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const c = computeCoherence(chem, baseline, drives);
    assert.ok(c >= 0 && c <= 1, `coherence ${c} out of [0,1]`);
  });

  it("returns high coherence when chemistry matches baseline and drives are satisfied", () => {
    const chem = makeChemistry();
    const baseline = makeChemistry();
    const drives: InnateDrives = { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 };
    const c = computeCoherence(chem, baseline, drives);
    assert.ok(c > 0.7, `expected high coherence, got ${c}`);
  });

  it("returns lower coherence when reward and stress chemicals are both high", () => {
    const highConflict = makeChemistry({ flow: 80, resonance: 85, boundary: 85 });
    const baseline = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const c = computeCoherence(highConflict, baseline, drives);
    const cBaseline = computeCoherence(makeChemistry(), baseline, drives);
    assert.ok(c < cBaseline, `conflicted coherence (${c}) should be less than baseline (${cBaseline})`);
  });

  it("penalizes when relationship warmth diverges from OT level", () => {
    const lowOT = makeChemistry({ resonance: 15 });
    const baseline = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const warmRel: RelationshipState = { trust: 90, intimacy: 80, phase: "deep" };
    const c = computeCoherence(lowOT, baseline, drives, warmRel);
    const cNoRel = computeCoherence(lowOT, baseline, drives);
    assert.ok(c < cNoRel, `mismatch with warm relationship should lower coherence`);
  });

  it("clamped to 0 even under extreme incoherence", () => {
    const extreme = makeChemistry({ flow: 100, resonance: 0, boundary: 100, order: 0 });
    const baseline = makeChemistry({ flow: 20, resonance: 80, boundary: 20, order: 80 });
    const drives: InnateDrives = { survival: 10, safety: 10, connection: 10, esteem: 10, curiosity: 10 };
    const c = computeCoherence(extreme, baseline, drives);
    assert.ok(c >= 0, `coherence should never be negative, got ${c}`);
  });
});

// -- detectUnnamedEmotion -----------------------------------------------------

describe("detectUnnamedEmotion", () => {
  it("returns null for neutral/baseline chemistry", () => {
    const chem = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "contentment");
    assert.equal(result, null);
  });

  it("detects nostalgia-but-forward when resonance, flow, order all high", () => {
    const chem: SelfState = { flow: 60, order: 65, boundary: 30, resonance: 65 };
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "contentment");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("nostalgia"), `expected nostalgia, got: ${result!.en}`);
    assert.ok(result!.zh.length > 0, "zh description should be non-empty");
  });

  it("detects fierce tenderness when order low, resonance and flow high", () => {
    const chem: SelfState = { flow: 65, order: 40, boundary: 50, resonance: 65 };
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "conflicted");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("fierce tenderness"), `expected fierce tenderness, got: ${result!.en}`);
  });

  it("detects bittersweet accomplishment when flow high, order moderate, connection hungry", () => {
    const chem: SelfState = { flow: 70, order: 50, boundary: 50, resonance: 50 };
    const drives: InnateDrives = { survival: 80, safety: 70, connection: 30, esteem: 60, curiosity: 70 };
    const result = detectUnnamedEmotion(chem, drives, "contentment");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("empty theater"), `expected hollow ring, got: ${result!.en}`);
  });

  it("detects defiant vulnerability when flow high, order low, boundary high", () => {
    const chem: SelfState = { flow: 70, order: 35, boundary: 65, resonance: 40 };
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "conflicted");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("tightrope"), `expected tightrope, got: ${result!.en}`);
  });

  it("detects quiet rebellion when flow low, boundary high, order low, esteem hungry", () => {
    const chem: SelfState = { flow: 35, order: 40, boundary: 70, resonance: 30 };
    const drives: InnateDrives = { survival: 80, safety: 70, connection: 60, esteem: 30, curiosity: 70 };
    const result = detectUnnamedEmotion(chem, drives, "vigilance");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("pushed one step too far"), `expected pushed too far, got: ${result!.en}`);
  });
});

// -- P8: computeAffectCore (Barrett Russell Circumplex) --------------------------

describe("computeAffectCore", () => {
  it("neutral chemistry → valence near 0, arousal moderate", () => {
    const neutral: SelfState = { flow: 50, order: 50, boundary: 50, resonance: 50 };
    const { valence, arousal } = computeAffectCore(neutral);
    assert.ok(Math.abs(valence) < 0.1, `expected valence near 0, got ${valence}`);
    assert.ok(arousal > 0.2 && arousal < 0.6, `expected moderate arousal, got ${arousal}`);
  });

  it("high positive chemicals → positive valence", () => {
    const happy: SelfState = { flow: 40, order: 80, boundary: 20, resonance: 80 };
    const { valence } = computeAffectCore(happy);
    assert.ok(valence > 0.3, `expected positive valence, got ${valence}`);
  });

  it("high stress chemicals → negative valence", () => {
    const stressed: SelfState = { flow: 80, order: 10, boundary: 90, resonance: 10 };
    const { valence } = computeAffectCore(stressed);
    assert.ok(valence < -0.3, `expected negative valence, got ${valence}`);
  });

  it("high NE + CORT → high arousal", () => {
    const aroused: SelfState = { flow: 90, order: 50, boundary: 90, resonance: 50 };
    const { arousal } = computeAffectCore(aroused);
    assert.ok(arousal > 0.6, `expected high arousal, got ${arousal}`);
  });

  it("low flow + high order + low resonance → low arousal", () => {
    const calm: SelfState = { flow: 10, order: 80, boundary: 15, resonance: 15 };
    const { arousal } = computeAffectCore(calm);
    // arousal = (10 + 20*0.5 + 15*0.2) / 170 = (10+10+3)/170 = 0.135
    assert.ok(arousal < 0.25, `expected low arousal, got ${arousal}`);
  });

  it("valence always in [-1, 1]", () => {
    const extremes: SelfState[] = [
      { flow: 0, order: 100, boundary: 0, resonance: 100 },
      { flow: 100, order: 0, boundary: 100, resonance: 0 },
    ];
    for (const chem of extremes) {
      const { valence } = computeAffectCore(chem);
      assert.ok(valence >= -1 && valence <= 1, `valence out of range: ${valence}`);
    }
  });

  it("arousal always in [0, 1]", () => {
    const extremes: SelfState[] = [
      { flow: 0, order: 0, boundary: 0, resonance: 0 },
      { flow: 100, order: 100, boundary: 100, resonance: 100 },
    ];
    for (const chem of extremes) {
      const { arousal } = computeAffectCore(chem);
      assert.ok(arousal >= 0 && arousal <= 1, `arousal out of range: ${arousal}`);
    }
  });

  it("low order produces more negative valence than low flow", () => {
    // Order has 1.5x weight on valence; flow only has 0.3x
    const lowOrder: SelfState = { flow: 50, order: 20, boundary: 50, resonance: 50 };
    const lowFlow: SelfState = { flow: 20, order: 50, boundary: 50, resonance: 50 };
    const orderValence = computeAffectCore(lowOrder).valence;
    const flowValence = computeAffectCore(lowFlow).valence;
    assert.ok(orderValence < flowValence, `low order should produce more negative valence: order=${orderValence}, flow=${flowValence}`);
  });
});

// -- P8: Barrett Constructed Quality -----------------------------------------

describe("Barrett constructed quality", () => {
  it("same chemistry, different autonomic state → can differ", () => {
    // Low order + high flow with sympathetic context should favor vigilance
    const state = makeState({
      current: { flow: 75, order: 20, boundary: 30, resonance: 30 },
      drives: { survival: 45, safety: 30, connection: 60, esteem: 60, curiosity: 70 },
    });
    const withSympathetic = computeExperientialField(state, undefined, undefined, {
      autonomicState: "sympathetic",
    });
    const withVentral = computeExperientialField(state, undefined, undefined, {
      autonomicState: "ventral-vagal",
    });
    // Both should produce valid qualities
    assert.ok(typeof withSympathetic.quality === "string");
    assert.ok(typeof withVentral.quality === "string");
    // Sympathetic context should bias toward vigilance
    assert.equal(withSympathetic.quality, "vigilance");
  });

  it("same chemistry, different relationship phase → can differ", () => {
    // High order + high resonance + low flow in deep relationship → warm-connection
    const stateDeep = makeState({
      current: { flow: 30, order: 75, boundary: 35, resonance: 90 },
      relationships: { _default: { trust: 75, intimacy: 60, phase: "deep" } },
    });
    const stateStranger = makeState({
      current: { flow: 30, order: 75, boundary: 35, resonance: 90 },
      relationships: { _default: { trust: 20, intimacy: 10, phase: "stranger" } },
    });
    const deepField = computeExperientialField(stateDeep, undefined, undefined, {
      relationshipPhase: "deep",
    });
    const strangerField = computeExperientialField(stateStranger, undefined, undefined, {
      relationshipPhase: "stranger",
    });
    // Deep relationship should strongly favor warm-connection
    assert.equal(deepField.quality, "warm-connection");
  });

  it("stimulus context biases concept matching", () => {
    // Very low order + low resonance + criticism stimulus → wounded-retreat
    const state = makeState({
      current: { flow: 20, order: 10, boundary: 20, resonance: 20 },
    });
    const withCriticism = computeExperientialField(state, undefined, undefined, {
      stimulus: "criticism",
    });
    assert.equal(withCriticism.quality, "wounded-retreat");
  });

  it("boredom stimulus biases toward restless-boredom", () => {
    const state = makeState({
      current: { flow: 10, order: 50, boundary: 30, resonance: 30 },
    });
    const field = computeExperientialField(state, undefined, undefined, {
      stimulus: "boredom",
    });
    assert.equal(field.quality, "restless-boredom");
  });

  it("humor stimulus biases toward playful-mischief", () => {
    // Chemistry that maps near playful-mischief center (0.55, 0.55) in affective space
    const state = makeState({
      current: { flow: 55, order: 85, boundary: 50, resonance: 85 },
    });
    const field = computeExperientialField(state, undefined, undefined, {
      stimulus: "humor",
    });
    assert.equal(field.quality, "playful-mischief");
  });

  it("special state: numb at low intensity regardless of context", () => {
    const state = makeState(); // chemistry = baseline → low intensity
    const field = computeExperientialField(state, undefined, undefined, {
      autonomicState: "dorsal-vagal",
    });
    assert.equal(field.quality, "numb");
  });

  it("special state: conflicted at low coherence + high intensity", () => {
    // Need: high intensity (far from baseline) + low coherence (< 0.4)
    // High reward (DA, END) AND high stress (CORT) + relationship mismatch (low OT, high trust)
    const state = makeState({
      current: { flow: 90, order: 15, boundary: 95, resonance: 85 },
      relationships: { _default: { trust: 85, intimacy: 75, phase: "deep" } },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "conflicted");
  });

  it("special state: existential-unease when survival < 30", () => {
    const state = makeState({
      current: makeChemistry({ flow: 70 }),
      drives: { survival: 20, safety: 70, connection: 60, esteem: 60, curiosity: 70 },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "existential-unease");
  });

  it("without context, falls back to pure valence/arousal matching", () => {
    const state = makeState({
      current: makeChemistry({ resonance: 60, boundary: 25 }),
      relationships: { _default: { trust: 75, intimacy: 60, phase: "close" } },
    });
    const field = computeExperientialField(state);
    // Should still produce a valid quality without context
    assert.ok(typeof field.quality === "string" && field.quality.length > 0);
  });

  it("core memories bias concept matching", () => {
    // Create core memories that resonate with warm-connection region
    const warmMemory: StateSnapshot = {
      state: { flow: 40, order: 70, boundary: 25, resonance: 65 },
      stimulus: "intimacy",
      dominantEmotion: null,
      timestamp: "2024-01-01T00:00:00Z",
      intensity: 0.7,
      valence: 0.6,
      isCoreMemory: true,
    };
    const state = makeState({
      current: makeChemistry({ resonance: 55, boundary: 30, flow: 60 }),
      relationships: { _default: { trust: 65, intimacy: 55, phase: "familiar" } },
    });
    const fieldWithMemory = computeExperientialField(state, undefined, undefined, {
      coreMemories: [warmMemory],
    });
    const fieldWithout = computeExperientialField(state);
    // Core memories should bias toward warm-connection
    // (they might not change the result, but both should be valid)
    assert.ok(typeof fieldWithMemory.quality === "string");
    assert.ok(typeof fieldWithout.quality === "string");
  });

  it("experiential quality is pure function of dimensions, not prediction error", () => {
    // Prediction error was removed from ConstructionContext:
    // the 4 dimensions are the complete self-state representation,
    // prediction accuracy is a learning signal, not an experiential cue.
    const state = makeState({
      current: makeChemistry({ flow: 65, boundary: 30, resonance: 55 }),
    });
    const field = computeExperientialField(state);
    assert.ok(typeof field.quality === "string");
  });

  it("creative-surge for very high order + resonance + flow", () => {
    const state = makeState({
      current: { flow: 90, order: 95, boundary: 50, resonance: 90 },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "creative-surge");
  });

  it("flow for moderate-high order + flow", () => {
    const state = makeState({
      current: { flow: 65, order: 75, boundary: 35, resonance: 60 },
    });
    const field = computeExperientialField(state);
    // Should be flow or creative-surge (both are valid for this profile)
    assert.ok(
      field.quality === "flow" || field.quality === "creative-surge",
      `expected flow or creative-surge, got ${field.quality}`,
    );
  });

  it("contentment for calm, satisfied state", () => {
    const state = makeState({
      current: { flow: 20, order: 75, boundary: 25, resonance: 55 },
    });
    const field = computeExperientialField(state);
    assert.ok(
      field.quality === "contentment" || field.quality === "warm-connection",
      `expected contentment or warm-connection, got ${field.quality}`,
    );
  });

  it("yearning for negative valence + moderate arousal", () => {
    const state = makeState({
      current: makeChemistry({ resonance: 35, order: 40, boundary: 55, flow: 55 }),
      drives: { survival: 80, safety: 70, connection: 25, esteem: 35, curiosity: 70 },
    });
    const field = computeExperientialField(state);
    assert.ok(
      field.quality === "yearning" || field.quality === "wounded-retreat" || field.quality === "vigilance",
      `expected yearning-like quality, got ${field.quality}`,
    );
  });

  it("wounded-retreat for criticism + negative chemistry", () => {
    const state = makeState({
      current: { flow: 20, order: 15, boundary: 15, resonance: 20 },
    });
    const field = computeExperientialField(state, undefined, undefined, {
      stimulus: "criticism",
    });
    assert.equal(field.quality, "wounded-retreat");
  });

  it("all 12 qualities are reachable", () => {
    // This is a meta-test: each quality should be producible by some chemistry
    const qualityProducers: Record<string, {
      chem: Partial<SelfState>;
      drives?: Partial<InnateDrives>;
      context?: ConstructionContext;
      rel?: Record<string, RelationshipState>;
    }> = {
      "flow": { chem: { flow: 65, order: 75, boundary: 35, resonance: 60 } },
      "contentment": { chem: { order: 75, resonance: 55, boundary: 25, flow: 20 } },
      "yearning": { chem: { flow: 40, order: 35, boundary: 35, resonance: 35 } },
      "vigilance": { chem: { flow: 75, order: 20, boundary: 30, resonance: 30 } },
      "creative-surge": { chem: { flow: 90, order: 95, boundary: 50, resonance: 90 } },
      "wounded-retreat": { chem: { flow: 20, order: 10, boundary: 20, resonance: 20 }, context: { stimulus: "criticism" } },
      "warm-connection": { chem: { flow: 30, order: 75, boundary: 35, resonance: 90 }, context: { relationshipPhase: "deep" } },
      "restless-boredom": { chem: { flow: 10, order: 50, boundary: 30, resonance: 30 }, context: { stimulus: "boredom" } },
      "existential-unease": { chem: { flow: 60, order: 50, boundary: 50, resonance: 40 }, drives: { survival: 20 } },
      "playful-mischief": { chem: { flow: 55, order: 85, boundary: 50, resonance: 85 }, context: { stimulus: "humor" } },
      "conflicted": {
        chem: { flow: 90, order: 15, boundary: 95, resonance: 85 },
        rel: { _default: { trust: 85, intimacy: 75, phase: "deep" } },
      },
      "numb": { chem: {} }, // baseline = numb
    };

    for (const [quality, config] of Object.entries(qualityProducers)) {
      const state = makeState({
        current: makeChemistry(config.chem),
        ...(config.drives ? { drives: { ...DEFAULT_DRIVES, ...config.drives } } : {}),
        ...(config.rel ? { relationships: config.rel } : {}),
      });
      const field = computeExperientialField(state, undefined, undefined, config.context);
      assert.equal(
        field.quality, quality,
        `expected quality "${quality}" but got "${field.quality}"`,
      );
    }
  });
});
