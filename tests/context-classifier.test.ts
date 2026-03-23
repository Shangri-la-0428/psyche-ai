import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractContextFeatures,
  classifyStimulusWithContext,
  stimulusWarmth,
} from "../src/context-classifier.js";
import type { ContextFeatures } from "../src/context-classifier.js";
import type { PsycheState, StimulusType } from "../src/types.js";
import { DEFAULT_DRIVES, DEFAULT_LEARNING_STATE } from "../src/types.js";

// ── Helper: minimal PsycheState factory ──────────────────────

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 4,
    mbti: "INFJ",
    baseline: { DA: 50, HT: 60, CORT: 40, OT: 55, NE: 45, END: 50 },
    current: { DA: 50, HT: 60, CORT: 40, OT: 55, NE: 45, END: 50 },
    drives: { ...DEFAULT_DRIVES },
    updatedAt: new Date().toISOString(),
    relationships: {
      _default: { trust: 50, intimacy: 30, phase: "acquaintance" },
    },
    empathyLog: null,
    selfModel: { values: [], preferences: [], boundaries: [], currentInterests: [] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    meta: {
      agentName: "test-agent",
      createdAt: new Date().toISOString(),
      totalInteractions: 10,
      locale: "zh",
    },
    ...overrides,
  };
}

/** Neutral context — no special modifiers should apply */
function neutralContext(): ContextFeatures {
  return {
    relationshipPhase: "acquaintance",
    recentStimuli: [],
    driveSatisfaction: {
      survival: "high",
      safety: "high",
      connection: "high",
      esteem: "high",
      curiosity: "high",
    },
    timeSinceLastMessage: 5,
    totalInteractions: 10,
    agreementStreak: 0,
  };
}

// ── extractContextFeatures ───────────────────────────────────

describe("extractContextFeatures", () => {
  it("returns correct features from state", () => {
    const state = makeState({
      relationships: {
        _default: { trust: 80, intimacy: 60, phase: "close" },
      },
      emotionalHistory: [
        { chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 }, stimulus: "praise", dominantEmotion: null, timestamp: "" },
        { chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 }, stimulus: "humor", dominantEmotion: null, timestamp: "" },
        { chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 }, stimulus: "casual", dominantEmotion: null, timestamp: "" },
      ],
      drives: { survival: 80, safety: 70, connection: 30, esteem: 50, curiosity: 90 },
      agreementStreak: 3,
    });

    const features = extractContextFeatures(state);

    assert.equal(features.relationshipPhase, "close");
    assert.deepEqual(features.recentStimuli, ["praise", "humor", "casual"]);
    assert.equal(features.driveSatisfaction.survival, "high");
    assert.equal(features.driveSatisfaction.safety, "high");
    assert.equal(features.driveSatisfaction.connection, "low");
    assert.equal(features.driveSatisfaction.esteem, "mid");
    assert.equal(features.driveSatisfaction.curiosity, "high");
    assert.equal(features.totalInteractions, 10);
    assert.equal(features.agreementStreak, 3);
  });

  it("handles missing relationship — falls back to stranger", () => {
    const state = makeState({
      relationships: {}, // no _default, no user
    });

    const features = extractContextFeatures(state, "unknown-user");

    assert.equal(features.relationshipPhase, "stranger");
  });

  it("uses user-specific relationship when available", () => {
    const state = makeState({
      relationships: {
        _default: { trust: 50, intimacy: 30, phase: "acquaintance" },
        "user-123": { trust: 90, intimacy: 80, phase: "deep" },
      },
    });

    const features = extractContextFeatures(state, "user-123");
    assert.equal(features.relationshipPhase, "deep");
  });

  it("falls back to _default when user not found", () => {
    const state = makeState({
      relationships: {
        _default: { trust: 50, intimacy: 30, phase: "familiar" },
      },
    });

    const features = extractContextFeatures(state, "missing-user");
    assert.equal(features.relationshipPhase, "familiar");
  });
});

// ── driveSatisfaction thresholds ─────────────────────────────

describe("driveSatisfaction thresholds", () => {
  it("marks drives >= 70 as high", () => {
    const state = makeState({ drives: { survival: 70, safety: 80, connection: 100, esteem: 70, curiosity: 90 } });
    const features = extractContextFeatures(state);
    assert.equal(features.driveSatisfaction.survival, "high");
    assert.equal(features.driveSatisfaction.safety, "high");
    assert.equal(features.driveSatisfaction.connection, "high");
    assert.equal(features.driveSatisfaction.esteem, "high");
    assert.equal(features.driveSatisfaction.curiosity, "high");
  });

  it("marks drives >= 40 and < 70 as mid", () => {
    const state = makeState({ drives: { survival: 40, safety: 50, connection: 60, esteem: 69, curiosity: 45 } });
    const features = extractContextFeatures(state);
    assert.equal(features.driveSatisfaction.survival, "mid");
    assert.equal(features.driveSatisfaction.safety, "mid");
    assert.equal(features.driveSatisfaction.connection, "mid");
    assert.equal(features.driveSatisfaction.esteem, "mid");
    assert.equal(features.driveSatisfaction.curiosity, "mid");
  });

  it("marks drives < 40 as low", () => {
    const state = makeState({ drives: { survival: 0, safety: 10, connection: 20, esteem: 39, curiosity: 5 } });
    const features = extractContextFeatures(state);
    assert.equal(features.driveSatisfaction.survival, "low");
    assert.equal(features.driveSatisfaction.safety, "low");
    assert.equal(features.driveSatisfaction.connection, "low");
    assert.equal(features.driveSatisfaction.esteem, "low");
    assert.equal(features.driveSatisfaction.curiosity, "low");
  });
});

// ── classifyStimulusWithContext ───────────────────────────────

describe("classifyStimulusWithContext", () => {
  it("returns base classification when context is neutral", () => {
    const ctx = neutralContext();
    const results = classifyStimulusWithContext("太棒了", ctx);

    assert.ok(results.length > 0);
    const praise = results.find((r) => r.type === "praise");
    assert.ok(praise);
    // With neutral context, base and context confidence should be equal
    assert.equal(praise.baseConfidence, praise.contextConfidence);
    assert.equal(praise.contextModifiers.length, 0);
  });

  it("stranger + intimacy reduces confidence", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      relationshipPhase: "stranger",
    };
    const results = classifyStimulusWithContext("我信任你，跟你说个秘密", ctx);

    const intimacy = results.find((r) => r.type === "intimacy");
    assert.ok(intimacy);
    assert.ok(intimacy.contextConfidence < intimacy.baseConfidence);
    assert.ok(intimacy.contextModifiers.includes("stranger penalty on intimacy"));
  });

  it("close + casual boosts confidence", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      relationshipPhase: "close",
    };
    const results = classifyStimulusWithContext("你好，最近怎么样", ctx);

    const casual = results.find((r) => r.type === "casual");
    assert.ok(casual);
    assert.ok(casual.contextConfidence > casual.baseConfidence);
    assert.ok(casual.contextModifiers.includes("close relationship boost on casual"));
  });

  it("3x same stimulus in a row reduces confidence", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      recentStimuli: ["praise", "praise", "praise"],
    };
    const results = classifyStimulusWithContext("太棒了，真不错", ctx);

    const praise = results.find((r) => r.type === "praise");
    assert.ok(praise);
    assert.ok(praise.contextConfidence < praise.baseConfidence);
    assert.ok(praise.contextModifiers.includes("repetition fatigue penalty"));
  });

  it("conflict -> casual boosts casual (de-escalation)", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      recentStimuli: ["conflict"],
    };
    const results = classifyStimulusWithContext("你好，最近怎么样", ctx);

    const casual = results.find((r) => r.type === "casual");
    assert.ok(casual);
    assert.ok(
      casual.contextModifiers.includes("de-escalation boost after conflict"),
    );
    // The de-escalation boost should have added 0.15
    assert.ok(casual.contextConfidence > casual.baseConfidence);
  });

  it("drive hunger boosts relevant stimuli", () => {
    // Connection low -> positive stimuli get boosted
    const ctx: ContextFeatures = {
      ...neutralContext(),
      driveSatisfaction: {
        survival: "high",
        safety: "high",
        connection: "low",
        esteem: "high",
        curiosity: "high",
      },
    };
    const results = classifyStimulusWithContext("太棒了", ctx);

    const praise = results.find((r) => r.type === "praise");
    assert.ok(praise);
    assert.ok(praise.contextConfidence > praise.baseConfidence);
    assert.ok(praise.contextModifiers.includes("connection hunger boost"));
  });

  it("esteem hunger boosts validation/praise", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      driveSatisfaction: {
        survival: "high",
        safety: "high",
        connection: "high",
        esteem: "low",
        curiosity: "high",
      },
    };
    const results = classifyStimulusWithContext("你说得对，确实有道理", ctx);

    const validation = results.find((r) => r.type === "validation");
    assert.ok(validation);
    assert.ok(validation.contextModifiers.includes("esteem hunger boost"));
  });

  it("survival hunger boosts authority/conflict sensitivity", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      driveSatisfaction: {
        survival: "low",
        safety: "high",
        connection: "high",
        esteem: "high",
        curiosity: "high",
      },
    };
    const results = classifyStimulusWithContext("你必须马上给我做完", ctx);

    const authority = results.find((r) => r.type === "authority");
    assert.ok(authority);
    assert.ok(authority.contextConfidence > authority.baseConfidence);
    assert.ok(authority.contextModifiers.includes("survival threat sensitivity boost"));
  });

  it("agreement streak dampens validation", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      agreementStreak: 6,
    };
    const results = classifyStimulusWithContext("你说得对，确实有道理", ctx);

    const validation = results.find((r) => r.type === "validation");
    assert.ok(validation);
    assert.ok(validation.contextConfidence < validation.baseConfidence);
    assert.ok(
      validation.contextModifiers.includes("sycophantic loop dampening on validation"),
    );
  });

  it("long time gap boosts casual, reduces intimacy", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      timeSinceLastMessage: 1500, // > 24h
    };

    // Test casual boost
    const casualResults = classifyStimulusWithContext("你好，最近怎么样", ctx);
    const casual = casualResults.find((r) => r.type === "casual");
    assert.ok(casual);
    assert.ok(casual.contextModifiers.includes("long absence boost on casual"));

    // Test intimacy reduction
    const intimacyResults = classifyStimulusWithContext("我信任你，跟你说个秘密", ctx);
    const intimacy = intimacyResults.find((r) => r.type === "intimacy");
    assert.ok(intimacy);
    assert.ok(intimacy.contextConfidence < intimacy.baseConfidence);
    assert.ok(intimacy.contextModifiers.includes("long absence penalty on intimacy"));
  });

  it("contextModifiers strings are descriptive", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      relationshipPhase: "stranger",
      recentStimuli: ["intimacy", "intimacy", "intimacy"],
      agreementStreak: 6,
      timeSinceLastMessage: 1500,
    };

    const results = classifyStimulusWithContext("我信任你，跟你说个秘密", ctx);
    const intimacy = results.find((r) => r.type === "intimacy");
    assert.ok(intimacy);

    // Each modifier should be a non-empty descriptive string
    for (const mod of intimacy.contextModifiers) {
      assert.ok(mod.length > 5, `Modifier "${mod}" should be descriptive`);
      assert.ok(typeof mod === "string");
    }
  });

  it("results are sorted by contextConfidence descending", () => {
    const ctx: ContextFeatures = {
      ...neutralContext(),
      relationshipPhase: "stranger",
    };
    const results = classifyStimulusWithContext("我信任你，跟你说个秘密", ctx);

    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].contextConfidence >= results[i].contextConfidence,
        `results[${i - 1}].contextConfidence (${results[i - 1].contextConfidence}) >= results[${i}].contextConfidence (${results[i].contextConfidence})`,
      );
    }
  });
});

// ── stimulusWarmth ───────────────────────────────────────────

describe("stimulusWarmth", () => {
  it("returns positive values for positive stimuli", () => {
    assert.equal(stimulusWarmth("praise"), 0.8);
    assert.equal(stimulusWarmth("validation"), 0.7);
    assert.equal(stimulusWarmth("intimacy"), 0.9);
    assert.equal(stimulusWarmth("humor"), 0.5);
    assert.equal(stimulusWarmth("surprise"), 0.3);
    assert.equal(stimulusWarmth("casual"), 0.1);
    assert.equal(stimulusWarmth("intellectual"), 0.2);
    assert.equal(stimulusWarmth("vulnerability"), 0.3);
  });

  it("returns negative values for negative stimuli", () => {
    assert.equal(stimulusWarmth("sarcasm"), -0.5);
    assert.equal(stimulusWarmth("criticism"), -0.7);
    assert.equal(stimulusWarmth("conflict"), -0.9);
    assert.equal(stimulusWarmth("authority"), -0.4);
    assert.equal(stimulusWarmth("neglect"), -0.8);
    assert.equal(stimulusWarmth("boredom"), -0.3);
  });

  it("returns 0 for null stimulus", () => {
    assert.equal(stimulusWarmth(null), 0);
  });
});
