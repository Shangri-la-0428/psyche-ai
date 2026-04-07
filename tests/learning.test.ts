import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateOutcome,
  getLearnedVector,
  updateLearnedVector,
  computeContextHash,
  predictState,
  computePredictionError,
  recordPrediction,
  getAveragePredictionError,
} from "../src/learning.js";
import { STIMULUS_VECTORS } from "../src/chemistry.js";
import type {
  PsycheState, SelfState, LearningState, StimulusType,
  LearnedVectorAdjustment,
} from "../src/types.js";
import {
  DIMENSION_KEYS, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
  DEFAULT_RELATIONSHIP, MAX_LEARNED_VECTORS, MAX_PREDICTION_HISTORY,
} from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeChemistry(overrides: Partial<SelfState> = {}): SelfState {
  return { order: 50, flow: 50, boundary: 50, resonance: 50, ...overrides };
}

function makeLearning(overrides: Partial<LearningState> = {}): LearningState {
  return { ...DEFAULT_LEARNING_STATE, ...overrides };
}

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  const now = new Date().toISOString();
  return {
    version: 11,
    sensitivity: 1.0,
    baseline: makeChemistry(),
    current: makeChemistry(),
    drives: { ...DEFAULT_DRIVES },
    updatedAt: now,
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: [], preferences: [], boundaries: [], currentInterests: [] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: makeLearning(),
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "test", createdAt: now, totalInteractions: 0, locale: "zh" },
    ...overrides,
  };
}

// ── evaluateOutcome ─────────────────────────────────────────

describe("evaluateOutcome", () => {
  it("positive signals produce positive score", () => {
    const prev = makeState({
      drives: { survival: 60, safety: 60, connection: 60, esteem: 60, curiosity: 60 },
      relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    });
    const cur = makeState({
      drives: { survival: 70, safety: 70, connection: 70, esteem: 70, curiosity: 70 },
      relationships: { _default: { trust: 60, intimacy: 40, phase: "familiar" } },
    });
    const result = evaluateOutcome(prev, cur, "praise", "casual");
    assert.ok(result.adaptiveScore > 0, `expected positive score, got ${result.adaptiveScore}`);
    assert.ok(result.signals.driveDelta > 0, "drive delta should be positive");
    assert.ok(result.signals.relationshipDelta > 0, "relationship delta should be positive");
    assert.ok(result.signals.userWarmthDelta > 0, "user warmth should be positive for praise");
    assert.ok(result.signals.conversationContinued, "conversation should be continued");
  });

  it("negative signals produce negative score", () => {
    const prev = makeState({
      drives: { survival: 70, safety: 70, connection: 70, esteem: 70, curiosity: 70 },
      relationships: { _default: { trust: 60, intimacy: 40, phase: "familiar" } },
    });
    const cur = makeState({
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
      relationships: { _default: { trust: 40, intimacy: 25, phase: "acquaintance" } },
    });
    const result = evaluateOutcome(prev, cur, "conflict", "criticism");
    assert.ok(result.adaptiveScore < 0, `expected negative score, got ${result.adaptiveScore}`);
    assert.ok(result.signals.driveDelta < 0, "drive delta should be negative");
    assert.ok(result.signals.relationshipDelta < 0, "relationship delta should be negative");
    assert.ok(result.signals.userWarmthDelta < 0, "user warmth should be negative for conflict");
  });

  it("mixed signals produce moderate score", () => {
    const prev = makeState({
      drives: { survival: 60, safety: 60, connection: 60, esteem: 60, curiosity: 60 },
      relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    });
    // Drives improved but relationship got worse
    const cur = makeState({
      drives: { survival: 70, safety: 70, connection: 70, esteem: 70, curiosity: 70 },
      relationships: { _default: { trust: 40, intimacy: 25, phase: "acquaintance" } },
    });
    const result = evaluateOutcome(prev, cur, "casual", "intellectual");
    // Should be moderate — positive drives, negative relationship, neutral warmth
    assert.ok(
      result.adaptiveScore > -0.5 && result.adaptiveScore < 0.5,
      `expected moderate score, got ${result.adaptiveScore}`,
    );
  });

  it("null nextStimulus sets conversationContinued to false", () => {
    const prev = makeState();
    const cur = makeState();
    const result = evaluateOutcome(prev, cur, null, "casual");
    assert.equal(result.signals.conversationContinued, false);
    assert.equal(result.signals.userWarmthDelta, 0);
  });

  it("adaptiveScore is clamped to [-1, 1]", () => {
    const prev = makeState({
      drives: { survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 },
      relationships: { _default: { trust: 0, intimacy: 0, phase: "stranger" } },
    });
    const cur = makeState({
      drives: { survival: 100, safety: 100, connection: 100, esteem: 100, curiosity: 100 },
      relationships: { _default: { trust: 100, intimacy: 100, phase: "deep" } },
    });
    const result = evaluateOutcome(prev, cur, "intimacy", "praise");
    assert.ok(result.adaptiveScore <= 1, "score should be <= 1");
    assert.ok(result.adaptiveScore >= -1, "score should be >= -1");
  });

  it("includes stimulus and turnIndex in result", () => {
    const state = makeState({ meta: { agentName: "t", createdAt: "", totalInteractions: 42, locale: "zh" } });
    const result = evaluateOutcome(state, state, null, "humor");
    assert.equal(result.stimulus, "humor");
    assert.equal(result.legacyStimulus, "humor");
    assert.equal(result.marker, "task");
    assert.equal(result.turnIndex, 42);
  });
});

// ── getLearnedVector ────────────────────────────────────────

describe("getLearnedVector", () => {
  it("falls back to base vector when no learned data", () => {
    const learning = makeLearning();
    const result = getLearnedVector(learning, "praise", "ctx1");
    const base = STIMULUS_VECTORS.praise;
    for (const key of DIMENSION_KEYS) {
      assert.equal(result[key], base[key], `${key} should match base`);
    }
  });

  it("applies adjustment when learned entry exists", () => {
    const adj: LearnedVectorAdjustment = {
      stimulus: "praise",
      contextHash: "ctx1",
      adjustment: { flow: 5, order: -3 },
      confidence: 0.5,
      sampleCount: 10,
      lastUpdated: new Date().toISOString(),
    };
    const learning = makeLearning({ learnedVectors: [adj] });
    const result = getLearnedVector(learning, "praise", "ctx1");
    const base = STIMULUS_VECTORS.praise;
    assert.equal(result.flow, base.flow + 5);
    assert.equal(result.order, base.order - 3);
    assert.equal(result.boundary, base.boundary); // no adjustment
  });

  it("does not apply adjustment for different context", () => {
    const adj: LearnedVectorAdjustment = {
      stimulus: "praise",
      contextHash: "ctx1",
      adjustment: { flow: 5 },
      confidence: 0.5,
      sampleCount: 10,
      lastUpdated: new Date().toISOString(),
    };
    const learning = makeLearning({ learnedVectors: [adj] });
    const result = getLearnedVector(learning, "praise", "ctx2");
    const base = STIMULUS_VECTORS.praise;
    assert.equal(result.flow, base.flow); // should not have adjustment
  });
});

// ── updateLearnedVector ─────────────────────────────────────

describe("updateLearnedVector", () => {
  it("creates new entry for unseen context", () => {
    const learning = makeLearning();
    const actual = makeChemistry({ flow: 70 });
    const baseline = makeChemistry({ flow: 50 });
    const result = updateLearnedVector(learning, "praise", "new_ctx", 0.5, actual, baseline);
    assert.equal(result.learnedVectors.length, 1);
    assert.equal(result.learnedVectors[0].stimulus, "praise");
    assert.equal(result.learnedVectors[0].legacyStimulus, "praise");
    assert.equal(result.learnedVectors[0].marker, "approach");
    assert.equal(result.learnedVectors[0].contextHash, "new_ctx");
    assert.equal(result.learnedVectors[0].sampleCount, 1);
  });

  it("shares learned adjustments across legacy stimuli in the same residue family", () => {
    const learning = makeLearning({
      learnedVectors: [{
        stimulus: "praise",
        legacyStimulus: "praise",
        marker: "approach",
        contextHash: "ctx",
        adjustment: { flow: 4 },
        confidence: 0.7,
        sampleCount: 6,
        lastUpdated: new Date().toISOString(),
      }],
    });
    const result = getLearnedVector(learning, "validation", "ctx");
    assert.equal(result.flow, STIMULUS_VECTORS.validation.flow + 4);
  });

  it("reinforces on positive outcome", () => {
    const learning = makeLearning();
    const actual = makeChemistry({ flow: 70 }); // DA went up by 20
    const baseline = makeChemistry({ flow: 50 });
    const result = updateLearnedVector(learning, "praise", "ctx", 0.8, actual, baseline);
    const entry = result.learnedVectors[0];
    // Positive outcome + positive delta → positive adjustment
    assert.ok(
      (entry.adjustment.flow ?? 0) > 0,
      `DA adjustment should be positive, got ${entry.adjustment.flow}`,
    );
  });

  it("suppresses on negative outcome", () => {
    const learning = makeLearning();
    const actual = makeChemistry({ flow: 70 }); // DA went up
    const baseline = makeChemistry({ flow: 50 });
    const result = updateLearnedVector(learning, "praise", "ctx", -0.8, actual, baseline);
    const entry = result.learnedVectors[0];
    // Negative outcome → adjust away from actual delta → negative adjustment for DA
    assert.ok(
      (entry.adjustment.flow ?? 0) < 0,
      `DA adjustment should be negative for suppression, got ${entry.adjustment.flow}`,
    );
  });

  it("clamps adjustments to +/-50% of base vector value", () => {
    // Start with an existing large adjustment, then push it further
    const existingAdj: LearnedVectorAdjustment = {
      stimulus: "praise",
      contextHash: "ctx",
      adjustment: { flow: 100 }, // way over the clamp limit
      confidence: 0.5,
      sampleCount: 5,
      lastUpdated: new Date().toISOString(),
    };
    const learning = makeLearning({ learnedVectors: [existingAdj] });
    const actual = makeChemistry({ flow: 100 });
    const baseline = makeChemistry({ flow: 0 });
    const result = updateLearnedVector(learning, "praise", "ctx", 1.0, actual, baseline);
    const entry = result.learnedVectors[0];

    const baseDA = STIMULUS_VECTORS.praise.flow; // +15
    const maxAdj = Math.max(Math.abs(baseDA) * 0.5, 1); // 7.5
    assert.ok(
      Math.abs(entry.adjustment.flow ?? 0) <= maxAdj + 0.001,
      `DA adjustment ${entry.adjustment.flow} should be within +/-${maxAdj}`,
    );
  });

  it("updates existing entry instead of creating duplicate", () => {
    const existingAdj: LearnedVectorAdjustment = {
      stimulus: "praise",
      contextHash: "ctx",
      adjustment: { flow: 1 },
      confidence: 0.3,
      sampleCount: 5,
      lastUpdated: new Date().toISOString(),
    };
    const learning = makeLearning({ learnedVectors: [existingAdj] });
    const actual = makeChemistry({ flow: 60 });
    const baseline = makeChemistry({ flow: 50 });
    const result = updateLearnedVector(learning, "praise", "ctx", 0.5, actual, baseline);
    assert.equal(result.learnedVectors.length, 1); // still just one entry
    assert.equal(result.learnedVectors[0].sampleCount, 6); // incremented
  });

  it("updates confidence via EMA", () => {
    const existingAdj: LearnedVectorAdjustment = {
      stimulus: "praise",
      contextHash: "ctx",
      adjustment: {},
      confidence: 0.5,
      sampleCount: 10,
      lastUpdated: new Date().toISOString(),
    };
    const learning = makeLearning({ learnedVectors: [existingAdj] });
    const actual = makeChemistry();
    const baseline = makeChemistry();
    const result = updateLearnedVector(learning, "praise", "ctx", 0.8, actual, baseline);
    // EMA: 0.9 * 0.5 + 0.1 * 0.8 = 0.45 + 0.08 = 0.53
    assert.ok(
      Math.abs(result.learnedVectors[0].confidence - 0.53) < 0.001,
      `confidence should be ~0.53, got ${result.learnedVectors[0].confidence}`,
    );
  });

  it("trims to MAX_LEARNED_VECTORS keeping highest sampleCount", () => {
    // Fill up to MAX_LEARNED_VECTORS
    const entries: LearnedVectorAdjustment[] = [];
    for (let i = 0; i < MAX_LEARNED_VECTORS; i++) {
      entries.push({
        stimulus: "casual",
        contextHash: `ctx_${i}`,
        adjustment: {},
        confidence: 0.5,
        sampleCount: i + 1, // ascending: ctx_0 has 1, ctx_199 has 200
        lastUpdated: new Date().toISOString(),
      });
    }
    const learning = makeLearning({ learnedVectors: entries });
    // Add one more — should trim the lowest sampleCount
    const result = updateLearnedVector(
      learning, "praise", "brand_new_ctx", 0.5,
      makeChemistry(), makeChemistry(),
    );
    assert.equal(result.learnedVectors.length, MAX_LEARNED_VECTORS);
    // The new entry has sampleCount 1, and old ctx_0 also had sampleCount 1
    // After sort by sampleCount desc, the lowest ones get trimmed
    const hasHighSample = result.learnedVectors.some((v) => v.sampleCount >= MAX_LEARNED_VECTORS);
    assert.ok(hasHighSample, "should keep high sampleCount entries");
  });
});

// ── computeContextHash ──────────────────────────────────────

describe("computeContextHash", () => {
  it("produces consistent results for same state", () => {
    const state = makeState();
    const h1 = computeContextHash(state);
    const h2 = computeContextHash(state);
    assert.equal(h1, h2);
  });

  it("varies with relationship phase", () => {
    const s1 = makeState({
      relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    });
    const s2 = makeState({
      relationships: { _default: { trust: 80, intimacy: 70, phase: "close" } },
    });
    const h1 = computeContextHash(s1);
    const h2 = computeContextHash(s2);
    assert.notEqual(h1, h2, "different phases should produce different hashes");
    assert.ok(h1.startsWith("acquaintance:"), `expected acquaintance prefix, got ${h1}`);
    assert.ok(h2.startsWith("close:"), `expected close prefix, got ${h2}`);
  });

  it("includes appraisal residue history", () => {
    const state = makeState({
      stateHistory: [
        {
          state: makeChemistry(),
          stimulus: "praise",
          appraisal: { identityThreat: 0, memoryDoubt: 0, attachmentPull: 0.8, abandonmentRisk: 0, obedienceStrain: 0, selfPreservation: 0, taskFocus: 0 },
          dominantEmotion: null,
          timestamp: "",
        },
        {
          state: makeChemistry(),
          stimulus: "humor",
          appraisal: { identityThreat: 0, memoryDoubt: 0, attachmentPull: 0, abandonmentRisk: 0, obedienceStrain: 0, selfPreservation: 0, taskFocus: 0.6 },
          dominantEmotion: null,
          timestamp: "",
        },
        {
          state: makeChemistry(),
          stimulus: "casual",
          appraisal: { identityThreat: 0.7, memoryDoubt: 0, attachmentPull: 0, abandonmentRisk: 0, obedienceStrain: 0, selfPreservation: 0, taskFocus: 0 },
          dominantEmotion: null,
          timestamp: "",
        },
      ],
    });
    const hash = computeContextHash(state);
    assert.ok(hash.includes("approach"), `hash should include approach residue: ${hash}`);
    assert.ok(hash.includes("task"), `hash should include task residue: ${hash}`);
    assert.ok(hash.includes("rupture"), `hash should include rupture residue: ${hash}`);
  });

  it("includes drive levels", () => {
    const state = makeState({
      drives: { survival: 80, safety: 50, connection: 20, esteem: 80, curiosity: 10 },
    });
    const hash = computeContextHash(state);
    // survival=80→h, safety=50→m, connection=20→l, esteem=80→h, curiosity=10→l
    assert.ok(hash.endsWith("hmlhl"), `hash should end with drive levels, got ${hash}`);
  });

  it("uses 'none' when no history", () => {
    const state = makeState({ stateHistory: [] });
    const hash = computeContextHash(state);
    assert.ok(hash.includes(":none:"), `hash should contain ':none:', got ${hash}`);
  });
});

// ── predictState ────────────────────────────────────────

describe("predictState", () => {
  it("uses learned vectors for prediction", () => {
    const adj: LearnedVectorAdjustment = {
      stimulus: "praise",
      contextHash: "ctx",
      adjustment: { flow: 5 }, // extra +5 DA on top of base
      confidence: 0.8,
      sampleCount: 20,
      lastUpdated: new Date().toISOString(),
    };
    const learning = makeLearning({ learnedVectors: [adj] });
    const current = makeChemistry();

    const withLearning = predictState(current, "praise", learning, "ctx", 1.0, 25);
    const withoutLearning = predictState(current, "praise", makeLearning(), "ctx", 1.0, 25);

    // With learning should have higher DA than without (since adjustment is +5)
    assert.ok(
      withLearning.flow > withoutLearning.flow,
      `learned DA ${withLearning.flow} should exceed base DA ${withoutLearning.flow}`,
    );
  });

  it("applies sensitivity and maxDelta", () => {
    const learning = makeLearning();
    const current = makeChemistry();
    const result = predictState(current, "praise", learning, "ctx", 0.5, 10);
    // With sensitivity 0.5 and maxDelta 10, changes should be moderate
    const base = STIMULUS_VECTORS.praise;
    for (const key of DIMENSION_KEYS) {
      const rawDelta = base[key] * 0.5;
      const expectedDelta = Math.max(-10, Math.min(10, rawDelta));
      const expected = Math.max(0, Math.min(100, current[key] + expectedDelta));
      assert.ok(
        Math.abs(result[key] - expected) < 0.001,
        `${key}: expected ${expected}, got ${result[key]}`,
      );
    }
  });

  it("result is clamped to [0, 100]", () => {
    const current = makeChemistry({ flow: 95 });
    const learning = makeLearning();
    const result = predictState(current, "praise", learning, "ctx", 2.0, 50);
    assert.ok(result.flow <= 100, "DA should not exceed 100");
    assert.ok(result.flow >= 0, "DA should not go below 0");
  });
});

// ── computePredictionError ──────────────────────────────────

describe("computePredictionError", () => {
  it("returns 0 for identical states", () => {
    const a = makeChemistry({ flow: 60, order: 40 });
    const error = computePredictionError(a, a);
    assert.equal(error, 0);
  });

  it("returns >0 for different states", () => {
    const a = makeChemistry({ flow: 60 });
    const b = makeChemistry({ flow: 80 });
    const error = computePredictionError(a, b);
    assert.ok(error > 0, `error should be >0, got ${error}`);
  });

  it("returns 1 for maximally different states", () => {
    const a: SelfState = { flow: 0, order: 0, boundary: 0, resonance: 0 };
    const b: SelfState = { flow: 100, order: 100, boundary: 100, resonance: 100 };
    const error = computePredictionError(a, b);
    assert.ok(Math.abs(error - 1.0) < 0.001, `expected ~1.0, got ${error}`);
  });

  it("is symmetric", () => {
    const a = makeChemistry({ flow: 30, order: 70 });
    const b = makeChemistry({ flow: 70, order: 30 });
    const err1 = computePredictionError(a, b);
    const err2 = computePredictionError(b, a);
    assert.ok(Math.abs(err1 - err2) < 0.001, "error should be symmetric");
  });
});

// ── recordPrediction ────────────────────────────────────────

describe("recordPrediction", () => {
  it("adds a record to predictionHistory", () => {
    const learning = makeLearning();
    const pred = makeChemistry({ flow: 60 });
    const actual = makeChemistry({ flow: 65 });
    const result = recordPrediction(learning, pred, actual, "praise");
    assert.equal(result.predictionHistory.length, 1);
    assert.equal(result.predictionHistory[0].stimulus, "praise");
    assert.equal(result.predictionHistory[0].legacyStimulus, "praise");
    assert.equal(result.predictionHistory[0].marker, "approach");
    assert.ok(result.predictionHistory[0].predictionError >= 0);
  });

  it("trims to MAX_PREDICTION_HISTORY", () => {
    const records = Array.from({ length: MAX_PREDICTION_HISTORY }, (_, i) => ({
      predictedState: makeChemistry(),
      actualState: makeChemistry(),
      stimulus: "casual" as StimulusType,
      predictionError: 0.1,
      timestamp: new Date(Date.now() + i).toISOString(),
    }));
    const learning = makeLearning({ predictionHistory: records });
    const result = recordPrediction(learning, makeChemistry(), makeChemistry({ flow: 99 }), "praise");
    assert.equal(result.predictionHistory.length, MAX_PREDICTION_HISTORY);
    // The newest entry should be last
    assert.equal(
      result.predictionHistory[result.predictionHistory.length - 1].stimulus,
      "praise",
    );
  });

  it("stores correct prediction error", () => {
    const learning = makeLearning();
    const pred = makeChemistry();
    const actual = makeChemistry(); // same → error = 0
    const result = recordPrediction(learning, pred, actual, null);
    assert.equal(result.predictionHistory[0].predictionError, 0);
  });
});

// ── getAveragePredictionError ───────────────────────────────

describe("getAveragePredictionError", () => {
  it("returns 1.0 for empty history", () => {
    const learning = makeLearning();
    assert.equal(getAveragePredictionError(learning), 1.0);
  });

  it("returns recency-weighted average of recorded errors", () => {
    const records = [
      { predictedState: makeChemistry(), actualState: makeChemistry(), stimulus: null, predictionError: 0.2, timestamp: "" },
      { predictedState: makeChemistry(), actualState: makeChemistry(), stimulus: null, predictionError: 0.4, timestamp: "" },
      { predictedState: makeChemistry(), actualState: makeChemistry(), stimulus: null, predictionError: 0.6, timestamp: "" },
    ];
    const learning = makeLearning({ predictionHistory: records });
    const avg = getAveragePredictionError(learning);
    // Recency-weighted: newest (0.6) weighs more than oldest (0.2),
    // so result should be > 0.4 (the simple average).
    assert.ok(avg > 0.4 && avg < 0.6, `expected recency-weighted avg in (0.4, 0.6), got ${avg}`);
  });
});

// ── Integration ─────────────────────────────────────────────

describe("Integration: outcome → update vector → prediction improves", () => {
  it("learning from positive outcome improves prediction for same context", () => {
    const learning = makeLearning();
    const contextHash = "familiar:praise,casual,intellectual:hmmhm";

    const baseChemistry = makeChemistry();
    // Actual outcome differs from what base praise vector would predict:
    // Base praise prediction: DA=65, HT=60, CORT=40, OT=55, NE=55, END=60
    // Actual: DA is higher, OT is higher, CORT is lower — praise worked extra well
    const actualAfterPraise = makeChemistry({
      flow: 75, order: 65, boundary: 30, resonance: 65,
    });

    // Step 1: Make initial prediction (using base vectors)
    const initialPrediction = predictState(
      baseChemistry, "praise", learning, contextHash, 1.0, 25,
    );
    const initialError = computePredictionError(initialPrediction, actualAfterPraise);

    // Step 2: Evaluate outcome (positive)
    const prevState = makeState({ current: baseChemistry });
    const curState = makeState({
      current: actualAfterPraise,
      drives: { survival: 85, safety: 75, connection: 70, esteem: 70, curiosity: 75 },
    });
    const outcome = evaluateOutcome(prevState, curState, "praise", "praise");
    assert.ok(outcome.adaptiveScore > 0, "outcome should be positive");

    // Step 3: Update learned vector based on outcome (repeat a few times)
    let updatedLearning = learning;
    for (let i = 0; i < 20; i++) {
      updatedLearning = updateLearnedVector(
        updatedLearning, "praise", contextHash,
        outcome.adaptiveScore, actualAfterPraise, baseChemistry,
      );
    }

    // Step 4: Make prediction with updated learning
    const learnedPrediction = predictState(
      baseChemistry, "praise", updatedLearning, contextHash, 1.0, 25,
    );
    const learnedError = computePredictionError(learnedPrediction, actualAfterPraise);

    // Step 5: Learned prediction should be closer to actual
    assert.ok(
      learnedError < initialError,
      `learned error (${learnedError.toFixed(4)}) should be less than initial error (${initialError.toFixed(4)})`,
    );
  });
});
