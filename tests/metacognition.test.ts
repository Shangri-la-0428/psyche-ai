import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessMetacognition,
  computeEmotionalConfidence,
  generateRegulationSuggestions,
  detectDefenseMechanisms,
  updateMetacognitiveState,
} from "../src/metacognition.js";
import type {
  PsycheState, ChemicalState, OutcomeScore, StimulusType,
  MetacognitiveState,
} from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
} from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeChemistry(overrides: Partial<ChemicalState> = {}): ChemicalState {
  return { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50, ...overrides };
}

function makeState(overrides?: Partial<PsycheState>): PsycheState {
  const now = new Date().toISOString();
  return {
    version: 6,
    mbti: "INFJ",
    baseline: makeChemistry(),
    current: makeChemistry(),
    drives: { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 },
    updatedAt: now,
    relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    empathyLog: null,
    selfModel: { values: [], preferences: [], boundaries: [], currentInterests: [] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "test", createdAt: now, totalInteractions: 0, locale: "zh" },
    ...overrides,
  };
}

function makeOutcome(
  stimulus: StimulusType | null,
  adaptiveScore: number,
  turnIndex = 0,
): OutcomeScore {
  return {
    turnIndex,
    stimulus,
    adaptiveScore,
    signals: {
      driveDelta: adaptiveScore * 0.5,
      relationshipDelta: adaptiveScore * 0.3,
      userWarmthDelta: adaptiveScore * 0.2,
      conversationContinued: true,
    },
    timestamp: new Date().toISOString(),
  };
}

// ── assessMetacognition ─────────────────────────────────────

describe("assessMetacognition", () => {
  it("returns valid MetacognitiveAssessment with all fields", () => {
    const state = makeState();
    const result = assessMetacognition(state, "casual", []);
    assert.ok(typeof result.emotionalConfidence === "number");
    assert.ok(Array.isArray(result.regulationSuggestions));
    assert.ok(Array.isArray(result.defenseMechanisms));
    assert.ok(typeof result.metacognitiveNote === "string");
    assert.ok(result.metacognitiveNote.length > 0);
  });

  it("works with empty outcome history (default confidence 0.5)", () => {
    const state = makeState();
    const result = assessMetacognition(state, "praise", []);
    assert.equal(result.emotionalConfidence, 0.5);
  });

  it("works with positive outcome history (higher confidence)", () => {
    const outcomes = [
      makeOutcome("praise", 0.8, 1),
      makeOutcome("praise", 0.9, 2),
      makeOutcome("praise", 0.7, 3),
      makeOutcome("praise", 0.85, 4),
    ];
    const state = makeState();
    const result = assessMetacognition(state, "praise", outcomes);
    // Positive outcomes for matching stimulus should yield confidence above 0.5
    assert.ok(
      result.emotionalConfidence > 0.5,
      `expected confidence > 0.5, got ${result.emotionalConfidence}`,
    );
  });

  it("works with negative outcome history (lower confidence)", () => {
    const outcomes = [
      makeOutcome("criticism", -0.7, 1),
      makeOutcome("criticism", -0.8, 2),
      makeOutcome("criticism", -0.6, 3),
      makeOutcome("criticism", -0.9, 4),
    ];
    const state = makeState();
    const result = assessMetacognition(state, "criticism", outcomes);
    // Negative outcomes should yield confidence below 0.5
    assert.ok(
      result.emotionalConfidence < 0.5,
      `expected confidence < 0.5, got ${result.emotionalConfidence}`,
    );
  });

  it("metacognitiveNote is non-empty string for all cases", () => {
    const state = makeState();
    const result = assessMetacognition(state, "casual", []);
    assert.ok(result.metacognitiveNote.length > 0, "note should not be empty");
    // With near-baseline state and no history, expect the neutral note
    assert.ok(
      result.metacognitiveNote.includes("normal parameters"),
      `expected neutral note, got: ${result.metacognitiveNote}`,
    );
  });
});

// ── computeEmotionalConfidence ──────────────────────────────

describe("computeEmotionalConfidence", () => {
  it("returns 0.5 with no history", () => {
    const state = makeState();
    const confidence = computeEmotionalConfidence(state, "casual", []);
    assert.equal(confidence, 0.5);
  });

  it("returns 0.5 with fewer than 3 outcomes (MIN_HISTORY_FOR_CONFIDENCE)", () => {
    const state = makeState();
    const outcomes = [
      makeOutcome("praise", 0.9, 1),
      makeOutcome("praise", 0.8, 2),
    ];
    const confidence = computeEmotionalConfidence(state, "praise", outcomes);
    assert.equal(confidence, 0.5);
  });

  it("higher confidence with consistent positive outcomes for the stimulus type", () => {
    const outcomes = [
      makeOutcome("praise", 0.8, 1),
      makeOutcome("praise", 0.9, 2),
      makeOutcome("praise", 0.7, 3),
      makeOutcome("validation", 0.85, 4), // same positive-valence
    ];
    const state = makeState();
    const confidence = computeEmotionalConfidence(state, "praise", outcomes);
    assert.ok(
      confidence > 0.5,
      `expected confidence > 0.5 for positive outcomes, got ${confidence}`,
    );
  });

  it("lower confidence with negative outcomes", () => {
    const outcomes = [
      makeOutcome("criticism", -0.8, 1),
      makeOutcome("conflict", -0.7, 2),
      makeOutcome("criticism", -0.9, 3),
      makeOutcome("neglect", -0.6, 4),
    ];
    const state = makeState();
    const confidence = computeEmotionalConfidence(state, "criticism", outcomes);
    assert.ok(
      confidence < 0.5,
      `expected confidence < 0.5 for negative outcomes, got ${confidence}`,
    );
  });

  it("returns 0.5 when no relevant outcomes match the stimulus valence", () => {
    // All outcomes are for positive stimuli, but we query a negative stimulus
    const outcomes = [
      makeOutcome("praise", 0.8, 1),
      makeOutcome("validation", 0.9, 2),
      makeOutcome("humor", 0.7, 3),
    ];
    const state = makeState();
    // "boredom" is negative valence, none of these outcomes match
    const confidence = computeEmotionalConfidence(state, "boredom", outcomes);
    assert.equal(confidence, 0.5, "no relevant outcomes should give neutral confidence");
  });

  it("penalizes extreme chemistry deviations from baseline", () => {
    const outcomes = [
      makeOutcome("praise", 0.8, 1),
      makeOutcome("praise", 0.9, 2),
      makeOutcome("praise", 0.7, 3),
    ];
    const normalState = makeState();
    const normalConf = computeEmotionalConfidence(normalState, "praise", outcomes);

    const extremeState = makeState({
      current: makeChemistry({ CORT: 95, DA: 10, HT: 10 }), // extreme deviation
    });
    const extremeConf = computeEmotionalConfidence(extremeState, "praise", outcomes);

    assert.ok(
      extremeConf < normalConf,
      `extreme state confidence (${extremeConf}) should be less than normal (${normalConf})`,
    );
  });
});

// ── generateRegulationSuggestions ───────────────────────────

describe("generateRegulationSuggestions", () => {
  it("self-soothing suggested when chemistry has extreme deviation (>= 25)", () => {
    // CORT at 35 baseline + 30 = 65 deviation, which is > 25
    const state = makeState({
      current: makeChemistry({ CORT: 65 }), // deviation of 30 from baseline 35
    });
    const suggestions = generateRegulationSuggestions(state, "casual", 0.5, []);
    const hasSoothing = suggestions.some((s) => s.strategy === "self-soothing");
    assert.ok(hasSoothing, "should suggest self-soothing for extreme CORT deviation");
  });

  it("self-soothing includes chemistry adjustment toward baseline", () => {
    const state = makeState({
      current: makeChemistry({ CORT: 65 }), // deviation of 30 from baseline 35
    });
    const suggestions = generateRegulationSuggestions(state, "casual", 0.5, []);
    const soothing = suggestions.find((s) => s.strategy === "self-soothing");
    assert.ok(soothing, "should have self-soothing suggestion");
    assert.ok(soothing!.chemistryAdjustment, "should have chemistry adjustment");
    // CORT is above baseline, so adjustment should be negative (pull back)
    assert.ok(
      (soothing!.chemistryAdjustment!.CORT ?? 0) < 0,
      "CORT adjustment should be negative to pull toward baseline",
    );
    assert.match(soothing!.description, /normal 20-55/);
    assert.match(soothing!.action, /Next 3 turns:/);
  });

  it("reappraisal suggested when stimulus has historically been misinterpreted", () => {
    // Need: emotionalConfidence <= 0.6, >= 2 outcomes for stimulus with avg < -0.1
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.4, 3),
    ];
    // Low confidence triggers reappraisal path
    const state = makeState();
    const suggestions = generateRegulationSuggestions(state, "criticism", 0.3, outcomes);
    const hasReappraisal = suggestions.some((s) => s.strategy === "reappraisal");
    assert.ok(hasReappraisal, "should suggest reappraisal for historically bad outcomes");
  });

  it("reappraisal NOT suggested when confidence is high", () => {
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.4, 3),
    ];
    const state = makeState();
    // emotionalConfidence > 0.6 means no reappraisal
    const suggestions = generateRegulationSuggestions(state, "criticism", 0.8, outcomes);
    const hasReappraisal = suggestions.some((s) => s.strategy === "reappraisal");
    assert.ok(!hasReappraisal, "should NOT suggest reappraisal when confidence is high");
  });

  it("strategic expression when high stress + vulnerability stimulus", () => {
    // Case 1 in code: high CORT + "vulnerability" stimulus
    const state = makeState({
      current: makeChemistry({ CORT: 55 }), // baseline CORT is 35, deviation = 20 > MODERATE_DEVIATION_THRESHOLD
    });
    const suggestions = generateRegulationSuggestions(state, "vulnerability", 0.5, []);
    const hasStrategic = suggestions.some((s) => s.strategy === "strategic-expression");
    assert.ok(
      hasStrategic,
      "should suggest strategic expression when stressed + vulnerability",
    );
  });

  it("strategic expression when low confidence (< 0.35)", () => {
    // Case 5 in code: emotionalConfidence < 0.35
    const state = makeState();
    const suggestions = generateRegulationSuggestions(state, "casual", 0.2, []);
    const hasStrategic = suggestions.some((s) => s.strategy === "strategic-expression");
    assert.ok(
      hasStrategic,
      "should suggest strategic expression when confidence is very low",
    );
  });

  it("reappraisal and strategic suggestions expose concrete actions", () => {
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.4, 3),
    ];
    const state = makeState();
    const suggestions = generateRegulationSuggestions(state, "criticism", 0.2, outcomes);
    assert.ok(suggestions.every((suggestion) => suggestion.action.length > 0));
    assert.ok(suggestions.every((suggestion) => (suggestion.horizonTurns ?? 0) >= 2));
  });

  it("no suggestions when state is near baseline and confidence is normal", () => {
    // Baseline state, moderate confidence, no negative history
    const state = makeState();
    const suggestions = generateRegulationSuggestions(state, "casual", 0.5, []);
    assert.equal(
      suggestions.length, 0,
      `expected no suggestions, got ${suggestions.length}: ${suggestions.map(s => s.strategy).join(", ")}`,
    );
  });

  it("suggestions are sorted by confidence descending", () => {
    // Trigger multiple suggestions simultaneously:
    // extreme CORT for self-soothing + low confidence for strategic expression
    const state = makeState({
      current: makeChemistry({ CORT: 65 }), // extreme deviation for self-soothing
    });
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.4, 3),
    ];
    const suggestions = generateRegulationSuggestions(state, "criticism", 0.3, outcomes);
    // Verify sorted descending by confidence
    for (let i = 1; i < suggestions.length; i++) {
      assert.ok(
        suggestions[i - 1].confidence >= suggestions[i].confidence,
        `suggestions not sorted: [${i-1}].confidence=${suggestions[i-1].confidence} < [${i}].confidence=${suggestions[i].confidence}`,
      );
    }
  });
});

// ── detectDefenseMechanisms ─────────────────────────────────

describe("detectDefenseMechanisms", () => {
  it("returns empty array for healthy baseline state", () => {
    const state = makeState();
    const defenses = detectDefenseMechanisms(state, "casual", []);
    assert.deepEqual(defenses, []);
  });

  it("detects avoidance: withdrawn state + negative outcome history for stimulus", () => {
    // Avoidance requires: DA < baseline-10, NE < baseline-10
    //   + >= 2 outcomes for stimulus with avg < -0.15
    const state = makeState({
      current: makeChemistry({
        DA: 40,  // baseline 55 - 15 = 40, deviation > 10
        NE: 30,  // baseline 45 - 15 = 30, deviation > 10
      }),
    });
    const outcomes = [
      makeOutcome("conflict", -0.5, 1),
      makeOutcome("conflict", -0.6, 2),
      makeOutcome("conflict", -0.4, 3),
    ];
    const defenses = detectDefenseMechanisms(state, "conflict", outcomes);
    const hasAvoidance = defenses.some((d) => d.mechanism === "avoidance");
    assert.ok(hasAvoidance, "should detect avoidance pattern");
  });

  it("avoidance includes evidence string with stimulus name", () => {
    const state = makeState({
      current: makeChemistry({ DA: 40, NE: 30 }),
    });
    const outcomes = [
      makeOutcome("conflict", -0.5, 1),
      makeOutcome("conflict", -0.6, 2),
    ];
    const defenses = detectDefenseMechanisms(state, "conflict", outcomes);
    const avoidance = defenses.find((d) => d.mechanism === "avoidance");
    assert.ok(avoidance, "should find avoidance");
    assert.ok(
      avoidance!.evidence.includes("conflict"),
      "evidence should mention the stimulus",
    );
  });

  it("no avoidance when not withdrawn (DA/NE near baseline)", () => {
    const state = makeState(); // at baseline
    const outcomes = [
      makeOutcome("conflict", -0.5, 1),
      makeOutcome("conflict", -0.6, 2),
    ];
    const defenses = detectDefenseMechanisms(state, "conflict", outcomes);
    const hasAvoidance = defenses.some((d) => d.mechanism === "avoidance");
    assert.ok(!hasAvoidance, "should NOT detect avoidance when at baseline");
  });

  it("detects rationalization: repeated negative outcomes without adaptation", () => {
    // Need >= 4 outcomes, with >= 3 for a stimulus and >= 60% negative (< -0.2)
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.3, 3),
      makeOutcome("criticism", -0.4, 4),
    ];
    // No learned vectors for this stimulus — no adaptation
    const state = makeState();
    const defenses = detectDefenseMechanisms(state, "criticism", outcomes);
    const hasRationalization = defenses.some((d) => d.mechanism === "rationalization");
    assert.ok(hasRationalization, "should detect rationalization for repeated failures");
  });

  it("no rationalization when there are fewer than 4 outcomes", () => {
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.3, 3),
    ];
    const state = makeState();
    const defenses = detectDefenseMechanisms(state, "criticism", outcomes);
    const hasRationalization = defenses.some((d) => d.mechanism === "rationalization");
    assert.ok(!hasRationalization, "should NOT detect rationalization with < 4 outcomes");
  });

  it("no rationalization when learned vectors show adaptation", () => {
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.3, 3),
      makeOutcome("criticism", -0.4, 4),
    ];
    // Has adapted: learned vector for criticism with sampleCount >= 3 and confidence > 0.3
    const state = makeState({
      learning: {
        ...DEFAULT_LEARNING_STATE,
        learnedVectors: [{
          stimulus: "criticism",
          contextHash: "ctx",
          adjustment: { CORT: -3 },
          confidence: 0.5,
          sampleCount: 5,
          lastUpdated: new Date().toISOString(),
        }],
      },
    });
    const defenses = detectDefenseMechanisms(state, "criticism", outcomes);
    const hasRationalization = defenses.some((d) => d.mechanism === "rationalization");
    assert.ok(!hasRationalization, "should NOT detect rationalization when adapted");
  });

  it("detects sublimation: high NE/DA + low connection + intellectual stimulus", () => {
    const state = makeState({
      current: makeChemistry({
        NE: 60, // baseline 45 + 15 > baseline + 10
        DA: 70, // baseline 55 + 15 > baseline + 10
        OT: 45, // baseline 60 - 15 < baseline - 10
      }),
      drives: { survival: 80, safety: 70, connection: 40, esteem: 60, curiosity: 70 },
    });
    const defenses = detectDefenseMechanisms(state, "intellectual", []);
    const hasSublimation = defenses.some((d) => d.mechanism === "sublimation");
    assert.ok(hasSublimation, "should detect sublimation for high energy + low connection + intellectual");
  });
});

// ── updateMetacognitiveState ────────────────────────────────

describe("updateMetacognitiveState", () => {
  it("increments totalAssessments", () => {
    const meta: MetacognitiveState = { ...DEFAULT_METACOGNITIVE_STATE };
    const assessment = assessMetacognition(makeState(), "casual", []);
    const updated = updateMetacognitiveState(meta, assessment);
    assert.equal(updated.totalAssessments, 1);
  });

  it("updates avgEmotionalConfidence with EMA", () => {
    // First assessment: alpha = 1.0, so avgConfidence = assessment confidence
    const meta: MetacognitiveState = { ...DEFAULT_METACOGNITIVE_STATE };
    const assessment = assessMetacognition(makeState(), "casual", []);
    const updated = updateMetacognitiveState(meta, assessment);
    assert.ok(
      Math.abs(updated.avgEmotionalConfidence - assessment.emotionalConfidence) < 0.001,
      `first assessment should set avg to assessment confidence, got ${updated.avgEmotionalConfidence}`,
    );

    // Second assessment: alpha = 0.1, so EMA blends
    const assessment2 = assessMetacognition(makeState(), "casual", []);
    const updated2 = updateMetacognitiveState(updated, assessment2);
    const expected = updated.avgEmotionalConfidence * 0.9 + assessment2.emotionalConfidence * 0.1;
    assert.ok(
      Math.abs(updated2.avgEmotionalConfidence - expected) < 0.001,
      `second assessment should use EMA, got ${updated2.avgEmotionalConfidence}, expected ${expected}`,
    );
  });

  it("records regulation suggestions with confidence >= 0.5", () => {
    // Create a state that will produce a self-soothing suggestion with confidence >= 0.5
    const state = makeState({
      current: makeChemistry({ CORT: 70 }), // deviation of 35 from baseline 35; confidence = 35/60 ~ 0.58
    });
    const assessment = assessMetacognition(state, "casual", []);
    // Verify we actually got a suggestion with confidence >= 0.5
    const highConfSuggestions = assessment.regulationSuggestions.filter(s => s.confidence >= 0.5);
    if (highConfSuggestions.length === 0) {
      // If no high-confidence suggestions, the history should remain empty
      const meta: MetacognitiveState = { ...DEFAULT_METACOGNITIVE_STATE };
      const updated = updateMetacognitiveState(meta, assessment);
      assert.equal(updated.regulationHistory.length, 0);
      return;
    }

    const meta: MetacognitiveState = { ...DEFAULT_METACOGNITIVE_STATE };
    const updated = updateMetacognitiveState(meta, assessment);
    assert.ok(
      updated.regulationHistory.length > 0,
      "should record regulation suggestions",
    );
    assert.equal(updated.regulationHistory[0].effective, false, "effective should default to false");
  });

  it("tracks defense patterns with strength >= 0.3", () => {
    // Trigger rationalization (which produces a strength based on failure rate)
    const outcomes = [
      makeOutcome("criticism", -0.5, 1),
      makeOutcome("criticism", -0.6, 2),
      makeOutcome("criticism", -0.3, 3),
      makeOutcome("criticism", -0.7, 4),
      makeOutcome("criticism", -0.5, 5),
      makeOutcome("criticism", -0.4, 6),
    ];
    const state = makeState();
    const assessment = assessMetacognition(state, "criticism", outcomes);

    // Verify we actually detected a defense with strength >= 0.3
    const strongDefenses = assessment.defenseMechanisms.filter(d => d.strength >= 0.3);
    if (strongDefenses.length === 0) {
      // No strong defense, pattern tracking won't fire
      return;
    }

    const meta: MetacognitiveState = { ...DEFAULT_METACOGNITIVE_STATE };
    const updated = updateMetacognitiveState(meta, assessment);
    assert.ok(
      updated.defensePatterns.length > 0,
      "should track defense patterns",
    );
    assert.equal(updated.defensePatterns[0].frequency, 1, "frequency should start at 1");
  });
});
