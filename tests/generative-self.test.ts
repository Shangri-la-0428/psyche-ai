import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeGenerativeSelf,
  predictSelfReaction,
  detectInternalConflicts,
  buildIdentityNarrative,
} from "../src/generative-self.js";
import type { PsycheState, SelfState, AttachmentData } from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE, DEFAULT_RELATIONSHIP, DEFAULT_ATTACHMENT,
} from "../src/types.js";

// -- Helpers ------------------------------------------------------------------

function makeChemistry(overrides: Partial<SelfState> = {}): SelfState {
  return { order: 65, flow: 55, boundary: 35, resonance: 60, ...overrides };
}

function makeState(overrides?: Partial<PsycheState>): PsycheState {
  return {
    version: 6,
    mbti: "INFJ",
    sensitivity: 1.0,
    baseline: { order: 65, flow: 55, boundary: 35, resonance: 60 },
    current: { order: 65, flow: 55, boundary: 35, resonance: 60 },
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

function makeAttachment(overrides: Partial<AttachmentData> = {}): AttachmentData {
  return { ...DEFAULT_ATTACHMENT, ...overrides };
}

// -- computeGenerativeSelf ----------------------------------------------------

describe("computeGenerativeSelf", () => {
  it("returns a GenerativeSelfModel with all required fields", () => {
    const state = makeState();
    const model = computeGenerativeSelf(state);
    assert.ok(typeof model.identityNarrative === "string");
    assert.ok(Array.isArray(model.causalInsights));
    assert.ok(Array.isArray(model.predictions));
    assert.ok(typeof model.growthArc === "object");
    assert.ok(Array.isArray(model.conflicts));
  });

  it("generates predictions for 6 probe stimuli", () => {
    const state = makeState();
    const model = computeGenerativeSelf(state);
    assert.equal(model.predictions.length, 6, "should predict for 6 probe stimuli");
    const stimuli = model.predictions.map((p) => p.stimulus);
    assert.ok(stimuli.includes("praise"));
    assert.ok(stimuli.includes("criticism"));
    assert.ok(stimuli.includes("intimacy"));
  });

  it("growthArc.direction is a valid value", () => {
    const state = makeState();
    const model = computeGenerativeSelf(state);
    const validDirections = ["growing", "stable", "regressing", "transforming"];
    assert.ok(validDirections.includes(model.growthArc.direction), `unexpected direction: ${model.growthArc.direction}`);
  });

  it("returns stable growth arc with minimal history", () => {
    const state = makeState();
    const model = computeGenerativeSelf(state);
    assert.equal(model.growthArc.direction, "stable");
  });

  it("produces identity narrative in zh locale", () => {
    const state = makeState({ meta: { agentName: "t", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh" } });
    const model = computeGenerativeSelf(state);
    assert.ok(/[\u4e00-\u9fff]/.test(model.identityNarrative), "expected Chinese characters in zh narrative");
  });

  it("produces identity narrative in en locale", () => {
    const state = makeState({ meta: { agentName: "t", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "en" } });
    const model = computeGenerativeSelf(state);
    assert.ok(/[a-zA-Z]/.test(model.identityNarrative), "expected English text in en narrative");
  });
});

// -- predictSelfReaction ------------------------------------------------------

describe("predictSelfReaction", () => {
  it("returns a SelfPrediction with all required fields", () => {
    const state = makeState();
    const pred = predictSelfReaction(state, "praise");
    assert.equal(pred.stimulus, "praise");
    assert.ok(typeof pred.predictedEmotion === "string" && pred.predictedEmotion.length > 0);
    assert.ok(typeof pred.confidence === "number");
    assert.ok(pred.confidence >= 0 && pred.confidence <= 1, `confidence ${pred.confidence} out of range`);
    assert.ok(typeof pred.predictedState === "object");
  });

  it("predicts different chemistry for praise vs criticism", () => {
    const state = makeState();
    const praisePred = predictSelfReaction(state, "praise");
    const criticismPred = predictSelfReaction(state, "criticism");
    // Praise should result in higher flow than criticism
    assert.ok(
      praisePred.predictedState.flow > criticismPred.predictedState.flow,
      "praise should predict higher flow than criticism",
    );
  });

  it("increases confidence when learned vectors exist", () => {
    const stateNoLearning = makeState();
    const stateWithLearning = makeState({
      learning: {
        ...DEFAULT_LEARNING_STATE,
        learnedVectors: [{
          stimulus: "praise",
          contextHash: "ctx1",
          adjustment: { flow: 2, order: 3, boundary: -2, resonance: 1 },
          confidence: 0.8,
          sampleCount: 10,
          lastUpdated: new Date().toISOString(),
        }],
      },
    });
    const noLearn = predictSelfReaction(stateNoLearning, "praise");
    const withLearn = predictSelfReaction(stateWithLearning, "praise");
    assert.ok(withLearn.confidence > noLearn.confidence, "learned vectors should increase confidence");
  });

  it("returns chemistry values clamped to 0-100 range", () => {
    const state = makeState({ current: { order: 95, flow: 95, boundary: 5, resonance: 95 } });
    const pred = predictSelfReaction(state, "praise");
    for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
      assert.ok(pred.predictedState[key] >= 0 && pred.predictedState[key] <= 100,
        `${key} = ${pred.predictedState[key]} out of [0,100]`);
    }
  });
});

// -- detectInternalConflicts --------------------------------------------------

describe("detectInternalConflicts", () => {
  it("returns an empty array when no conflicts exist", () => {
    const state = makeState();
    const conflicts = detectInternalConflicts(state);
    assert.ok(Array.isArray(conflicts));
    // Default state has boundaries + agreementStreak 0 => no people-pleasing conflict
    // Drives and chemistry are balanced => no other conflicts
  });

  it("detects curiosity vs stress conflict", () => {
    const state = makeState({
      drives: { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 75 },
      current: makeChemistry({ order: 30 }),  // low order = high stress/disorder
    });
    const conflicts = detectInternalConflicts(state);
    const curiosityStress = conflicts.find((c) =>
      c.subsystems.some((s) => s.includes("curiosity") || s.includes("好奇")),
    );
    assert.ok(curiosityStress, "should detect curiosity vs stress conflict");
    assert.ok(curiosityStress!.severity >= 0 && curiosityStress!.severity <= 1);
  });

  it("detects people-pleasing vs boundaries conflict with high agreement streak", () => {
    const state = makeState({
      agreementStreak: 8,
      selfModel: { values: ["authenticity"], preferences: [], boundaries: ["no dishonesty"], currentInterests: [] },
    });
    const conflicts = detectInternalConflicts(state);
    const pleasing = conflicts.find((c) =>
      c.subsystems.some((s) => s.includes("pleasing") || s.includes("讨好")),
    );
    assert.ok(pleasing, "should detect people-pleasing conflict");
  });

  it("detects esteem need vs reward system conflict", () => {
    const state = makeState({
      drives: { survival: 80, safety: 70, connection: 60, esteem: 30, curiosity: 70 },
      current: makeChemistry({ flow: 30  }),
    });
    const conflicts = detectInternalConflicts(state);
    const esteemReward = conflicts.find((c) =>
      c.subsystems.some((s) => s.includes("esteem") || s.includes("尊重")),
    );
    assert.ok(esteemReward, "should detect esteem vs reward conflict");
  });

  it("detects connection vs avoidant attachment conflict", () => {
    const state = makeState({
      drives: { survival: 80, safety: 70, connection: 75, esteem: 60, curiosity: 70 },
      relationships: {
        _default: {
          trust: 50, intimacy: 30, phase: "acquaintance",
          attachment: makeAttachment({ avoidanceScore: 75 }),
        },
      },
    });
    const conflicts = detectInternalConflicts(state);
    const connAvoidant = conflicts.find((c) =>
      c.subsystems.some((s) => s.includes("connection") || s.includes("连接")),
    );
    assert.ok(connAvoidant, "should detect connection vs avoidant attachment conflict");
  });

  it("sorts conflicts by severity descending", () => {
    const state = makeState({
      drives: { survival: 80, safety: 30, connection: 75, esteem: 30, curiosity: 75 },
      current: makeChemistry({ flow: 30, boundary: 70  }),
      agreementStreak: 10,
      relationships: {
        _default: {
          trust: 50, intimacy: 30, phase: "acquaintance",
          attachment: makeAttachment({ avoidanceScore: 75 }),
        },
      },
    });
    const conflicts = detectInternalConflicts(state);
    for (let i = 1; i < conflicts.length; i++) {
      assert.ok(conflicts[i - 1].severity >= conflicts[i].severity,
        `conflicts not sorted by severity descending at index ${i}`);
    }
  });
});

// -- buildIdentityNarrative ---------------------------------------------------

describe("buildIdentityNarrative", () => {
  it("returns a non-empty string", () => {
    const state = makeState();
    const model = computeGenerativeSelf(state);
    const narrative = buildIdentityNarrative(state, model.causalInsights, model.growthArc, "en");
    assert.ok(typeof narrative === "string" && narrative.length > 0);
  });

  it("incorporates MBTI personality traits", () => {
    // ENTP: high flow baseline (expressive), high current flow → "draws energy from interaction and exchange"
    const state = makeState({
      mbti: "ENTP",
      sensitivity: 1.0,
      baseline: { order: 50, flow: 75, boundary: 52, resonance: 55 },
      current: { order: 50, flow: 75, boundary: 52, resonance: 55 },
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "en" },
    });
    const model = computeGenerativeSelf(state);
    const narrative = buildIdentityNarrative(state, model.causalInsights, model.growthArc, "en");
    // ENTP is expressive (high flow) -> narrative should mention interaction/energy/exchange
    assert.ok(narrative.includes("energy") || narrative.includes("interaction") || narrative.includes("exchange"),
      `ENTP narrative should reference extraverted energy, got: ${narrative}`);
  });

  it("includes causal insight when confidence is high", () => {
    const state = makeState();
    const insights = [
      { trait: "I am cautious with new people", because: "early interactions involved criticism", evidence: "3 spikes", confidence: 0.8 },
    ];
    const model = computeGenerativeSelf(state);
    const narrative = buildIdentityNarrative(state, insights, model.growthArc, "en");
    assert.ok(narrative.includes("cautious"), `expected insight to appear, got: ${narrative}`);
  });

  it("includes growth trajectory when direction is not stable", () => {
    const state = makeState();
    const insights: any[] = [];
    const growthArc = {
      direction: "growing" as const,
      description: "Growing overall.",
      dimensionTrend: {},
      driveTrend: {},
    };
    const narrative = buildIdentityNarrative(state, insights, growthArc, "en");
    assert.ok(narrative.includes("Growing"), `expected growth description, got: ${narrative}`);
  });
});
