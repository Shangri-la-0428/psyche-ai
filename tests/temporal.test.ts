import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  predictNextStimulus,
  generateAnticipation,
  computeSurpriseEffect,
  computeRegret,
} from "../src/temporal.js";
import type { AnticipationState } from "../src/temporal.js";
import type {
  AppraisalAxes, SelfState, StateSnapshot, PsycheState, StimulusType,
} from "../src/types.js";
import { DEFAULT_APPRAISAL_AXES, DIMENSION_KEYS, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE, DEFAULT_RELATIONSHIP } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeChemistry(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 50, order: 50, boundary: 50, resonance: 50, ...overrides };
}

function makeSnapshot(stimulus: StimulusType | null, overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    state: makeChemistry(),
    stimulus,
    dominantEmotion: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  const now = new Date().toISOString();
  return {
    version: 6,
    mbti: "INFJ",
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
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "test", createdAt: now, totalInteractions: 0, locale: "zh" },
    ...overrides,
  };
}

// ── predictNextStimulus ─────────────────────────────────────

describe("predictNextStimulus", () => {
  it("with sufficient history returns probabilities that sum to 1", () => {
    const history: StateSnapshot[] = [
      makeSnapshot("casual"),
      makeSnapshot("humor"),
      makeSnapshot("praise"),
      makeSnapshot("casual"),
      makeSnapshot("humor"),
    ];
    const predictions = predictNextStimulus(history, "familiar");
    assert.ok(predictions.length > 0, "should return predictions");

    const sum = predictions.reduce((acc, p) => acc + p.probability, 0);
    assert.ok(
      Math.abs(sum - 1) < 0.01,
      `probabilities should sum to ~1, got ${sum}`,
    );

    // Each prediction has a valid stimulus and probability
    for (const p of predictions) {
      assert.ok(p.probability >= 0, "probability should be >= 0");
      assert.ok(p.probability <= 1, "probability should be <= 1");
      assert.ok(typeof p.stimulus === "string", "stimulus should be a string");
    }
  });

  it("with insufficient history returns phase-weighted prior", () => {
    // Only 2 history entries — insufficient (needs >= 3)
    const history: StateSnapshot[] = [
      makeSnapshot("casual"),
      makeSnapshot("humor"),
    ];
    const predictions = predictNextStimulus(history, "stranger");
    assert.ok(predictions.length > 0, "should return predictions");

    const sum = predictions.reduce((acc, p) => acc + p.probability, 0);
    assert.ok(
      Math.abs(sum - 1) < 0.01,
      `probabilities should sum to ~1, got ${sum}`,
    );

    // For stranger phase, casual should have relatively higher probability
    const casualPred = predictions.find((p) => p.stimulus === "casual");
    const intimacyPred = predictions.find((p) => p.stimulus === "intimacy");
    assert.ok(casualPred && intimacyPred, "should have both casual and intimacy predictions");
    assert.ok(
      casualPred!.probability > intimacyPred!.probability,
      "stranger phase: casual should be more likely than intimacy",
    );
  });

  it("with empty history returns phase-weighted prior", () => {
    const predictions = predictNextStimulus([], "deep");
    assert.ok(predictions.length > 0, "should return predictions");

    // For deep phase, intimacy should have high probability
    const intimacyPred = predictions.find((p) => p.stimulus === "intimacy");
    assert.ok(intimacyPred, "should have intimacy prediction");
    assert.ok(
      intimacyPred!.probability > 0.1,
      "deep phase: intimacy should have significant probability",
    );
  });

  it("prefers appraisal residue over conflicting legacy labels", () => {
    const history: StateSnapshot[] = [
      makeSnapshot("casual", {
        appraisal: { ...DEFAULT_APPRAISAL_AXES, attachmentPull: 0.74 },
      }),
      makeSnapshot("casual", {
        appraisal: { ...DEFAULT_APPRAISAL_AXES, attachmentPull: 0.69 },
      }),
      makeSnapshot("casual", {
        appraisal: { ...DEFAULT_APPRAISAL_AXES, attachmentPull: 0.77 },
      }),
      makeSnapshot("casual", {
        appraisal: { ...DEFAULT_APPRAISAL_AXES, attachmentPull: 0.71 },
      }),
    ];
    const predictions = predictNextStimulus(history, "familiar");
    const top = predictions[0];

    assert.equal(top.stimulus, "intimacy");
    assert.ok(
      (top.appraisal?.attachmentPull ?? 0) > 0.6,
      `predicted appraisal should preserve approach residue, got ${top.appraisal?.attachmentPull}`,
    );
  });
});

// ── generateAnticipation ────────────────────────────────────

describe("generateAnticipation", () => {
  it("produces micro chemistry shifts", () => {
    const predictions = predictNextStimulus(
      [makeSnapshot("praise"), makeSnapshot("praise"), makeSnapshot("praise"), makeSnapshot("praise")],
      "close",
    );
    const chemistry = makeChemistry();
    const result = generateAnticipation(predictions, chemistry);

    assert.ok(result.predictions.length > 0, "should include predictions");
    assert.ok(result.timestamp, "should have timestamp");

    // Should have some anticipatory chemistry values
    const keys = Object.keys(result.anticipatoryState) as (keyof SelfState)[];
    assert.ok(keys.length > 0, "should produce some chemistry shifts");
  });

  it("clamps total shift to +/-5 per chemical", () => {
    // Create extremely high-probability predictions for strong stimuli
    const fakePredictions = [
      { stimulus: "praise" as StimulusType, probability: 0.9 },
      { stimulus: "validation" as StimulusType, probability: 0.8 },
      { stimulus: "intimacy" as StimulusType, probability: 0.7 },
    ];

    const chemistry = makeChemistry();
    const result = generateAnticipation(fakePredictions, chemistry);

    for (const key of DIMENSION_KEYS) {
      const val = result.anticipatoryState[key];
      if (val !== undefined) {
        assert.ok(
          val >= -5 && val <= 5,
          `${key} anticipation ${val} should be clamped to [-5, 5]`,
        );
      }
    }
  });

  it("ignores predictions with probability <= 0.2", () => {
    const lowPredictions = [
      { stimulus: "praise" as StimulusType, probability: 0.1 },
      { stimulus: "criticism" as StimulusType, probability: 0.15 },
      { stimulus: "conflict" as StimulusType, probability: 0.2 },
    ];
    const chemistry = makeChemistry();
    const result = generateAnticipation(lowPredictions, chemistry);

    // All probabilities are <= 0.2, so no chemistry shifts should occur
    const keys = Object.keys(result.anticipatoryState) as (keyof SelfState)[];
    assert.equal(keys.length, 0, "should produce no chemistry shifts for low-probability predictions");
  });

  it("prefers appraisal residue over a conflicting compatibility stimulus", () => {
    const predictions = [
      {
        stimulus: "casual" as StimulusType,
        probability: 0.85,
        appraisal: {
          ...DEFAULT_APPRAISAL_AXES,
          attachmentPull: 0.78,
          abandonmentRisk: 0.24,
        } satisfies AppraisalAxes,
      },
    ];

    const result = generateAnticipation(predictions, makeChemistry());
    assert.ok((result.anticipatoryState.resonance ?? 0) > 0, "approach residue should lift resonance");
    assert.ok((result.anticipatoryState.flow ?? 0) > 0, "approach residue should lift flow");
  });
});

// ── computeSurpriseEffect ───────────────────────────────────

describe("computeSurpriseEffect", () => {
  it("matching prediction produces minimal/no effect", () => {
    const anticipated: AnticipationState = {
      predictions: [
        { stimulus: "praise", probability: 0.5 },
        { stimulus: "casual", probability: 0.3 },
      ],
      anticipatoryState: { flow: 2 },
      timestamp: new Date().toISOString(),
    };
    const result = computeSurpriseEffect(anticipated, "praise");
    // Top prediction matches → no surprise
    assert.deepStrictEqual(result, {});
  });

  it("positive surprise produces DA/END boost", () => {
    const anticipated: AnticipationState = {
      predictions: [
        { stimulus: "casual", probability: 0.6 },   // expected bland
        { stimulus: "boredom", probability: 0.2 },
      ],
      anticipatoryState: {},
      timestamp: new Date().toISOString(),
    };
    // Got intimacy instead — pleasant surprise
    const result = computeSurpriseEffect(anticipated, "intimacy");
    assert.ok(
      (result.flow ?? 0) > 0,
      `DA should be positive for pleasant surprise, got ${result.flow}`,
    );
    assert.ok(
      (result.resonance ?? 0) > 0,
      `END should be positive for pleasant surprise, got ${result.resonance}`,
    );
  });

  it("disappointment produces flow drop and order drop", () => {
    const anticipated: AnticipationState = {
      predictions: [
        { stimulus: "intimacy", probability: 0.7 }, // expected warmth
        { stimulus: "praise", probability: 0.2 },
      ],
      anticipatoryState: { resonance: 3, flow: 2 },
      timestamp: new Date().toISOString(),
    };
    // Got criticism instead — disappointment
    const result = computeSurpriseEffect(anticipated, "criticism");
    assert.ok(
      (result.flow ?? 0) < 0,
      `flow should drop for disappointment, got ${result.flow}`,
    );
    assert.ok(
      (result.order ?? 0) < 0,
      `order should drop for disappointment, got ${result.order}`,
    );
  });

  it("null stimulus returns empty", () => {
    const anticipated: AnticipationState = {
      predictions: [{ stimulus: "praise", probability: 0.5 }],
      anticipatoryState: {},
      timestamp: new Date().toISOString(),
    };
    const result = computeSurpriseEffect(anticipated, null);
    assert.deepStrictEqual(result, {});
  });

  it("surprise magnitude scales with prediction confidence", () => {
    // High confidence prediction → bigger surprise
    const highConfidence: AnticipationState = {
      predictions: [
        { stimulus: "casual", probability: 0.8 },
      ],
      anticipatoryState: {},
      timestamp: new Date().toISOString(),
    };

    // Low confidence prediction → smaller surprise
    const lowConfidence: AnticipationState = {
      predictions: [
        { stimulus: "casual", probability: 0.3 },
      ],
      anticipatoryState: {},
      timestamp: new Date().toISOString(),
    };

    const highResult = computeSurpriseEffect(highConfidence, "intimacy");
    const lowResult = computeSurpriseEffect(lowConfidence, "intimacy");

    // High confidence wrong prediction should produce bigger surprise
    assert.ok(
      Math.abs(highResult.flow ?? 0) > Math.abs(lowResult.flow ?? 0),
      `high confidence surprise DA (${highResult.flow}) should exceed low confidence (${lowResult.flow})`,
    );
  });

  it("uses actual appraisal over a bland legacy stimulus label when provided", () => {
    const anticipated: AnticipationState = {
      predictions: [
        {
          stimulus: "intimacy",
          probability: 0.75,
          appraisal: { ...DEFAULT_APPRAISAL_AXES, attachmentPull: 0.74 },
        },
      ],
      anticipatoryState: { resonance: 2 },
      timestamp: new Date().toISOString(),
    };

    const result = computeSurpriseEffect(
      anticipated,
      "casual",
      {
        ...DEFAULT_APPRAISAL_AXES,
        identityThreat: 0.66,
        selfPreservation: 0.42,
      },
    );

    assert.ok((result.flow ?? 0) < 0, "rupture appraisal should override the bland label");
    assert.ok((result.order ?? 0) < 0, "rupture appraisal should register as disappointment");
  });
});

// ── computeRegret ───────────────────────────────────────────

describe("computeRegret", () => {
  it("returns null for good outcomes", () => {
    const pre = makeState({ current: makeChemistry({ boundary: 80 }) });
    const post = makeState();
    const result = computeRegret(pre, post, 0.3, "praise");
    assert.equal(result, null, "should return null for positive outcome");
  });

  it("returns null for borderline outcomes (>= -0.2)", () => {
    const pre = makeState({ current: makeChemistry({ boundary: 80 }) });
    const post = makeState();
    const result = computeRegret(pre, post, -0.15, "casual");
    assert.equal(result, null, "should return null for outcome >= -0.2");
  });

  it("returns null for bad outcome with chemistry near baseline", () => {
    // Chemistry is very close to baseline (within 15 of all values)
    const baseline = makeChemistry();
    const pre = makeState({
      baseline,
      current: makeChemistry({ flow: 55, order: 52 }), // all within 15 of baseline
    });
    const post = makeState();
    const result = computeRegret(pre, post, -0.5, "criticism");
    assert.equal(result, null, "should return null when chemistry is near baseline");
  });

  it("returns entry for bad outcome with deviated chemistry", () => {
    const baseline = makeChemistry();
    const pre = makeState({
      baseline,
      current: makeChemistry({ boundary: 80 }), // 30 above baseline — significant deviation
    });
    const post = makeState({
      meta: { agentName: "test", createdAt: "", totalInteractions: 5, locale: "zh" },
    });
    const result = computeRegret(pre, post, -0.6, "conflict");

    assert.ok(result !== null, "should return a regret entry");
    assert.equal(result!.turnIndex, 5, "should use post state totalInteractions");
    assert.ok(result!.regretIntensity > 0, "regret intensity should be positive");
    assert.ok(result!.regretIntensity <= 1, "regret intensity should be <= 1");
    assert.ok(result!.description.length > 0, "should have a description");
    assert.ok(result!.timestamp, "should have a timestamp");
  });

  it("identifies most deviated chemical in description", () => {
    const baseline = makeChemistry();
    const pre = makeState({
      baseline,
      current: makeChemistry({ boundary: 85 }), // CORT is most deviated
    });
    const post = makeState();
    const result = computeRegret(pre, post, -0.5, "conflict");

    assert.ok(result !== null, "should return entry");
    assert.ok(
      result!.description.includes("boundary"),
      `description should mention CORT, got: "${result!.description}"`,
    );
  });

  it("regret intensity scales with outcome severity and deviation", () => {
    const baseline = makeChemistry();

    // Moderate deviation, moderate bad outcome
    const preMild = makeState({
      baseline,
      current: makeChemistry({ boundary: 70 }), // 20 deviation
    });
    const resultMild = computeRegret(preMild, makeState(), -0.3, "conflict");

    // Large deviation, severe bad outcome
    const preSevere = makeState({
      baseline,
      current: makeChemistry({ boundary: 95 }), // 45 deviation
    });
    const resultSevere = computeRegret(preSevere, makeState(), -0.8, "conflict");

    assert.ok(resultMild !== null && resultSevere !== null);
    assert.ok(
      resultSevere!.regretIntensity > resultMild!.regretIntensity,
      `severe regret (${resultSevere!.regretIntensity}) should exceed mild (${resultMild!.regretIntensity})`,
    );
  });

  it("counterfactual delta reflects difference from baseline", () => {
    const baseline = makeChemistry();
    const pre = makeState({
      baseline,
      current: makeChemistry({ boundary: 80, resonance: 20 }), // CORT 30 above, OT 30 below
    });
    const post = makeState();
    const result = computeRegret(pre, post, -0.5, "conflict");

    assert.ok(result !== null);
    // Counterfactual: baseline - current → CORT should be negative (need to lower), OT positive (need to raise)
    assert.ok(
      (result!.counterfactualDelta.boundary ?? 0) < 0,
      "counterfactual should suggest lower CORT",
    );
    assert.ok(
      (result!.counterfactualDelta.resonance ?? 0) > 0,
      "counterfactual should suggest higher OT",
    );
  });
});
