import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  updateSharedIntentionality,
  estimateOtherMood,
  buildSharedIntentionalityContext,
} from "../src/shared-intentionality.js";
import type {
  SharedIntentionalityState,
  TheoryOfMindModel,
} from "../src/shared-intentionality.js";
import type { PsycheState, ChemicalState, RelationshipState, StimulusType } from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE, DEFAULT_RELATIONSHIP,
} from "../src/types.js";

// -- Helpers ------------------------------------------------------------------

function makeChemistry(overrides: Partial<ChemicalState> = {}): ChemicalState {
  return { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50, ...overrides };
}

function makeState(overrides?: Partial<PsycheState>): PsycheState {
  return {
    version: 6,
    mbti: "INFJ",
    baseline: { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50 },
    current: { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50 },
    drives: { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    empathyLog: null,
    selfModel: { values: ["authenticity"], preferences: ["depth"], boundaries: ["no dishonesty"], currentInterests: ["philosophy"] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh" },
    ...overrides,
  };
}

// -- estimateOtherMood --------------------------------------------------------

describe("estimateOtherMood", () => {
  it("returns neutral with low confidence when stimulus is null and no previous", () => {
    const rel: RelationshipState = { trust: 50, intimacy: 30, phase: "acquaintance" };
    const result = estimateOtherMood(null, rel);
    assert.equal(result.mood, "neutral");
    assert.ok(result.confidence > 0 && result.confidence < 0.3, `confidence ${result.confidence}`);
  });

  it("returns positive mood for praise stimulus", () => {
    const rel: RelationshipState = { trust: 50, intimacy: 30, phase: "acquaintance" };
    const result = estimateOtherMood("praise", rel);
    assert.equal(result.mood, "positive");
    assert.ok(result.confidence > 0);
  });

  it("returns negative mood for criticism stimulus", () => {
    const rel: RelationshipState = { trust: 50, intimacy: 30, phase: "acquaintance" };
    const result = estimateOtherMood("criticism", rel);
    assert.equal(result.mood, "negative");
  });

  it("returns neutral mood for casual stimulus", () => {
    const rel: RelationshipState = { trust: 50, intimacy: 30, phase: "acquaintance" };
    const result = estimateOtherMood("casual", rel);
    assert.equal(result.mood, "neutral");
  });

  it("returns higher confidence for deeper relationship phases", () => {
    const shallowRel: RelationshipState = { trust: 50, intimacy: 30, phase: "stranger" };
    const deepRel: RelationshipState = { trust: 80, intimacy: 70, phase: "deep" };
    const shallow = estimateOtherMood("praise", shallowRel);
    const deep = estimateOtherMood("praise", deepRel);
    assert.ok(deep.confidence > shallow.confidence,
      `deep confidence ${deep.confidence} should exceed shallow ${shallow.confidence}`);
  });

  it("detects mixed mood when previous estimate contradicts current stimulus", () => {
    const rel: RelationshipState = { trust: 70, intimacy: 50, phase: "familiar" };
    const prev: TheoryOfMindModel = {
      estimatedMood: "positive",
      estimatedIntent: "collaborative",
      confidence: 0.65,
      lastUpdated: new Date().toISOString(),
    };
    const result = estimateOtherMood("criticism", rel, prev);
    assert.equal(result.mood, "mixed", "contradicting stimulus should yield mixed mood");
  });

  it("holds previous estimate with decaying confidence when stimulus is null", () => {
    const rel: RelationshipState = { trust: 50, intimacy: 30, phase: "acquaintance" };
    const prev: TheoryOfMindModel = {
      estimatedMood: "positive",
      estimatedIntent: "collaborative",
      confidence: 0.7,
      lastUpdated: new Date().toISOString(),
    };
    const result = estimateOtherMood(null, rel, prev);
    assert.equal(result.mood, "positive", "should hold previous mood");
    assert.ok(result.confidence < prev.confidence, "confidence should decay");
    assert.ok(result.confidence >= 0.1, "confidence should not decay below floor");
  });

  it("returns confidence clamped to [0, 1]", () => {
    const rel: RelationshipState = { trust: 100, intimacy: 100, phase: "deep" };
    const prev: TheoryOfMindModel = {
      estimatedMood: "positive",
      estimatedIntent: "collaborative",
      confidence: 0.95,
      lastUpdated: new Date().toISOString(),
    };
    const result = estimateOtherMood("validation", rel, prev);
    assert.ok(result.confidence >= 0 && result.confidence <= 1, `confidence ${result.confidence} out of [0,1]`);
  });
});

// -- updateSharedIntentionality -----------------------------------------------

describe("updateSharedIntentionality", () => {
  it("returns a SharedIntentionalityState with all fields", () => {
    const state = makeState();
    const result = updateSharedIntentionality(state, "praise");
    assert.ok(typeof result.mutualAwareness === "number");
    assert.ok(typeof result.goalAlignment === "object");
    assert.ok(typeof result.theoryOfMind === "object");
    // jointAttention can be null or object
    assert.ok(result.jointAttention === null || typeof result.jointAttention === "object");
  });

  it("establishes joint attention on high-engagement stimulus", () => {
    const state = makeState();
    const result = updateSharedIntentionality(state, "intellectual");
    assert.notEqual(result.jointAttention, null, "intellectual should establish joint attention");
    assert.equal(result.jointAttention!.turnsSustained, 1);
  });

  it("does not establish joint attention on low-engagement stimulus", () => {
    const state = makeState();
    const result = updateSharedIntentionality(state, "boredom");
    assert.equal(result.jointAttention, null, "boredom should not establish joint attention");
  });

  it("sustains joint attention when same topic category continues", () => {
    const state = makeState();
    const turn1 = updateSharedIntentionality(state, "praise");
    const turn2 = updateSharedIntentionality(state, "validation", undefined, turn1);
    // praise and validation both map to "affirmation"
    assert.notEqual(turn2.jointAttention, null, "should sustain joint attention");
    assert.ok(turn2.jointAttention!.turnsSustained > turn1.jointAttention!.turnsSustained,
      "turnsSustained should increment");
  });

  it("reports aligned goals for collaborative intent with moderate trust", () => {
    const state = makeState({
      relationships: { _default: { trust: 70, intimacy: 50, phase: "familiar" } },
    });
    const result = updateSharedIntentionality(state, "praise");
    assert.equal(result.goalAlignment.aligned, true, "collaborative stimulus + trust should align goals");
  });

  it("reports misaligned goals for adversarial intent", () => {
    const state = makeState({
      relationships: { _default: { trust: 30, intimacy: 10, phase: "acquaintance" } },
    });
    const result = updateSharedIntentionality(state, "conflict");
    assert.equal(result.goalAlignment.aligned, false, "adversarial stimulus should misalign goals");
  });

  it("increases mutual awareness over successive high-engagement turns", () => {
    const state = makeState();
    const turn1 = updateSharedIntentionality(state, "praise");
    const turn2 = updateSharedIntentionality(state, "validation", undefined, turn1);
    const turn3 = updateSharedIntentionality(state, "praise", undefined, turn2);
    assert.ok(turn3.mutualAwareness >= turn1.mutualAwareness,
      `awareness should not decrease with sustained engagement: ${turn1.mutualAwareness} -> ${turn3.mutualAwareness}`);
  });
});

// -- buildSharedIntentionalityContext ------------------------------------------

describe("buildSharedIntentionalityContext", () => {
  it("returns empty string when confidence is too low and no joint attention", () => {
    const lowState: SharedIntentionalityState = {
      jointAttention: null,
      goalAlignment: { aligned: false, divergence: 0.5, description: "No alignment." },
      theoryOfMind: {
        estimatedMood: "neutral",
        estimatedIntent: "exploratory",
        confidence: 0.1,
        lastUpdated: new Date().toISOString(),
      },
      mutualAwareness: 0.1,
    };
    const ctx = buildSharedIntentionalityContext(lowState, "en");
    assert.equal(ctx, "", "should return empty string when nothing meaningful to report");
  });

  it("returns non-empty string when theoryOfMind confidence is high", () => {
    const highState: SharedIntentionalityState = {
      jointAttention: null,
      goalAlignment: { aligned: true, divergence: 0.2, description: "Aligned." },
      theoryOfMind: {
        estimatedMood: "positive",
        estimatedIntent: "collaborative",
        confidence: 0.7,
        lastUpdated: new Date().toISOString(),
      },
      mutualAwareness: 0.2,
    };
    const ctx = buildSharedIntentionalityContext(highState, "en");
    assert.ok(ctx.length > 0, "should produce context when ToM confidence is high");
    assert.ok(ctx.includes("Shared intentionality"));
  });

  it("outputs zh locale context with Chinese characters", () => {
    const state: SharedIntentionalityState = {
      jointAttention: {
        topic: "exploration",
        initiator: "other",
        turnsSustained: 3,
        engagement: 0.6,
      },
      goalAlignment: { aligned: true, divergence: 0.2, description: "Aligned." },
      theoryOfMind: {
        estimatedMood: "positive",
        estimatedIntent: "collaborative",
        confidence: 0.7,
        lastUpdated: new Date().toISOString(),
      },
      mutualAwareness: 0.5,
    };
    const ctx = buildSharedIntentionalityContext(state, "zh");
    assert.ok(/[\u4e00-\u9fff]/.test(ctx), "zh context should contain Chinese characters");
  });

  it("includes joint attention description when engagement is high", () => {
    const state: SharedIntentionalityState = {
      jointAttention: {
        topic: "affirmation",
        initiator: "other",
        turnsSustained: 4,
        engagement: 0.65,
      },
      goalAlignment: { aligned: true, divergence: 0.15, description: "Aligned." },
      theoryOfMind: {
        estimatedMood: "positive",
        estimatedIntent: "collaborative",
        confidence: 0.6,
        lastUpdated: new Date().toISOString(),
      },
      mutualAwareness: 0.3,
    };
    const ctx = buildSharedIntentionalityContext(state, "en");
    assert.ok(ctx.includes("absorbed") || ctx.includes("focused"),
      `expected joint attention mention, got: ${ctx}`);
  });

  it("mentions divergence when goals are significantly misaligned", () => {
    const state: SharedIntentionalityState = {
      jointAttention: null,
      goalAlignment: { aligned: false, divergence: 0.75, description: "Misaligned." },
      theoryOfMind: {
        estimatedMood: "negative",
        estimatedIntent: "adversarial",
        confidence: 0.6,
        lastUpdated: new Date().toISOString(),
      },
      mutualAwareness: 0.4,
    };
    const ctx = buildSharedIntentionalityContext(state, "en");
    assert.ok(ctx.includes("divergence"), `expected divergence mention, got: ${ctx}`);
  });
});
