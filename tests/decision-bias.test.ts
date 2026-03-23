import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDecisionBias,
  computeAttentionWeights,
  computeExploreExploit,
  buildDecisionContext,
} from "../src/decision-bias.js";
import type {
  PsycheState, ChemicalState, InnateDrives,
} from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_RELATIONSHIP, DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
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
    drives: { ...DEFAULT_DRIVES },
    updatedAt: now,
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
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

// ── computeDecisionBias ─────────────────────────────────────

describe("computeDecisionBias", () => {
  it("returns all 6 dimensions between 0 and 1", () => {
    const state = makeState();
    const bias = computeDecisionBias(state);
    for (const key of Object.keys(bias) as (keyof typeof bias)[]) {
      assert.ok(bias[key] >= 0, `${key} should be >= 0, got ${bias[key]}`);
      assert.ok(bias[key] <= 1, `${key} should be <= 1, got ${bias[key]}`);
    }
  });

  it("returns all 6 dimensions between 0 and 1 for extreme chemistry", () => {
    const state = makeState({
      current: { DA: 100, HT: 0, CORT: 100, OT: 0, NE: 100, END: 0 },
      drives: { survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 },
    });
    const bias = computeDecisionBias(state);
    for (const key of Object.keys(bias) as (keyof typeof bias)[]) {
      assert.ok(bias[key] >= 0, `${key} should be >= 0, got ${bias[key]}`);
      assert.ok(bias[key] <= 1, `${key} should be <= 1, got ${bias[key]}`);
    }
  });

  it("high DA + NE + curiosity produces high explorationTendency", () => {
    const state = makeState({
      current: makeChemistry({ DA: 90, NE: 85 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 90 },
    });
    const bias = computeDecisionBias(state);
    assert.ok(
      bias.explorationTendency > 0.65,
      `explorationTendency should be > 0.65, got ${bias.explorationTendency}`,
    );
  });

  it("high CORT + low safety produces high cautionLevel", () => {
    const state = makeState({
      current: makeChemistry({ CORT: 90 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const bias = computeDecisionBias(state);
    assert.ok(
      bias.cautionLevel > 0.7,
      `cautionLevel should be > 0.7, got ${bias.cautionLevel}`,
    );
  });

  it("high OT + connection produces high socialOrientation", () => {
    const state = makeState({
      current: makeChemistry({ OT: 95, END: 70 }),
      drives: { ...DEFAULT_DRIVES, connection: 85 },
    });
    const bias = computeDecisionBias(state);
    assert.ok(
      bias.socialOrientation > 0.65,
      `socialOrientation should be > 0.65, got ${bias.socialOrientation}`,
    );
  });

  it("all-50 neutral chemistry produces near-0.5 values", () => {
    const state = makeState({
      current: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
    });
    const bias = computeDecisionBias(state);
    for (const key of Object.keys(bias) as (keyof typeof bias)[]) {
      assert.ok(
        Math.abs(bias[key] - 0.5) < 0.01,
        `${key} should be ~0.5, got ${bias[key]}`,
      );
    }
  });

  it("high DA + END + low CORT produces high creativityBias", () => {
    const state = makeState({
      current: makeChemistry({ DA: 95, END: 80, CORT: 10 }),
    });
    const bias = computeDecisionBias(state);
    assert.ok(
      bias.creativityBias > 0.8,
      `creativityBias should be > 0.8, got ${bias.creativityBias}`,
    );
  });
});

// ── computeAttentionWeights ─────────────────────────────────

describe("computeAttentionWeights", () => {
  it("returns 5 weights that approximately sum to 1", () => {
    const state = makeState();
    const w = computeAttentionWeights(state);
    const sum = w.social + w.intellectual + w.threat + w.emotional + w.routine;
    assert.ok(
      Math.abs(sum - 1.0) < 0.001,
      `weights should sum to ~1, got ${sum}`,
    );
  });

  it("all weights are non-negative", () => {
    const state = makeState({
      current: { DA: 10, HT: 10, CORT: 90, OT: 10, NE: 90, END: 10 },
    });
    const w = computeAttentionWeights(state);
    for (const key of ["social", "intellectual", "threat", "emotional", "routine"] as const) {
      assert.ok(w[key] >= 0, `${key} should be >= 0, got ${w[key]}`);
    }
  });

  it("high OT produces higher social weight than baseline", () => {
    const baseW = computeAttentionWeights(makeState());
    const highOT = makeState({
      current: makeChemistry({ OT: 95, NE: 30, CORT: 30 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 50 },
    });
    const w = computeAttentionWeights(highOT);
    assert.ok(
      w.social > baseW.social,
      `social weight ${w.social} should exceed baseline ${baseW.social}`,
    );
  });

  it("high CORT produces highest threat weight", () => {
    const state = makeState({
      current: makeChemistry({ CORT: 90, NE: 70, OT: 30 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const w = computeAttentionWeights(state);
    assert.ok(
      w.threat > w.social && w.threat > w.routine,
      `threat (${w.threat}) should be the dominant weight`,
    );
  });

  it("high NE + curiosity produces highest intellectual weight", () => {
    const state = makeState({
      current: makeChemistry({ NE: 90, OT: 40, CORT: 35 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 90 },
    });
    const w = computeAttentionWeights(state);
    assert.ok(
      w.intellectual > w.social && w.intellectual > w.threat,
      `intellectual (${w.intellectual}) should exceed social (${w.social}) and threat (${w.threat})`,
    );
  });
});

// ── computeExploreExploit ───────────────────────────────────

describe("computeExploreExploit", () => {
  it("returns value between 0 and 1", () => {
    const state = makeState();
    const score = computeExploreExploit(state);
    assert.ok(score >= 0, `explore score should be >= 0, got ${score}`);
    assert.ok(score <= 1, `explore score should be <= 1, got ${score}`);
  });

  it("high curiosity + DA + NE + low CORT produces high explore score", () => {
    const state = makeState({
      current: makeChemistry({ DA: 90, NE: 85, CORT: 20 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 90, safety: 70 },
    });
    const score = computeExploreExploit(state);
    assert.ok(
      score > 0.85,
      `explore score should be > 0.85 for exploratory state, got ${score}`,
    );
  });

  it("high CORT + low safety produces low exploit score", () => {
    const state = makeState({
      current: makeChemistry({ DA: 30, NE: 70, CORT: 90 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const score = computeExploreExploit(state);
    assert.ok(
      score < 0.2,
      `explore score should be < 0.2 for exploit state, got ${score}`,
    );
  });

  it("all-50 neutral state produces exactly 0.5", () => {
    const state = makeState({
      current: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
    });
    const score = computeExploreExploit(state);
    assert.ok(
      Math.abs(score - 0.5) < 0.001,
      `neutral explore score should be ~0.5, got ${score}`,
    );
  });

  it("result stays within bounds for extreme chemistry", () => {
    const extremeHigh = makeState({
      current: { DA: 100, HT: 100, CORT: 0, OT: 100, NE: 100, END: 100 },
      drives: { survival: 100, safety: 100, connection: 100, esteem: 100, curiosity: 100 },
    });
    const extremeLow = makeState({
      current: { DA: 0, HT: 0, CORT: 100, OT: 0, NE: 0, END: 0 },
      drives: { survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 },
    });
    const high = computeExploreExploit(extremeHigh);
    const low = computeExploreExploit(extremeLow);
    assert.ok(high >= 0 && high <= 1, `extreme high should be in [0,1], got ${high}`);
    assert.ok(low >= 0 && low <= 1, `extreme low should be in [0,1], got ${low}`);
    assert.ok(high > low, `extreme high (${high}) should exceed extreme low (${low})`);
  });
});

// ── buildDecisionContext ────────────────────────────────────

describe("buildDecisionContext", () => {
  it("returns empty string when state is perfectly neutral", () => {
    const state = makeState({
      current: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
    });
    const ctx = buildDecisionContext(state);
    assert.equal(ctx, "", "neutral state should produce empty context string");
  });

  it("returns non-empty string with extreme chemistry", () => {
    const state = makeState({
      current: makeChemistry({ DA: 30, CORT: 90, OT: 30, END: 20 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(ctx.length > 0, "extreme state should produce non-empty context");
  });

  it("contains zh locale strings when locale is zh", () => {
    const state = makeState({
      current: makeChemistry({ DA: 30, CORT: 90, OT: 30, END: 20 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh" },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(ctx.startsWith("[决策倾向]"), `zh context should start with [决策倾向], got: ${ctx}`);
  });

  it("contains en locale strings when locale is en", () => {
    const state = makeState({
      current: makeChemistry({ DA: 30, CORT: 90, OT: 30, END: 20 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en" },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(ctx.startsWith("[Decision Bias]"), `en context should start with [Decision Bias], got: ${ctx}`);
    assert.ok(ctx.includes("cautious"), `en context should contain 'cautious', got: ${ctx}`);
  });

  it("mentions explore tendency for strongly exploratory state", () => {
    const state = makeState({
      current: makeChemistry({ DA: 95, NE: 90, CORT: 10, END: 80 }),
      drives: { survival: 90, safety: 90, connection: 60, esteem: 80, curiosity: 95 },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(
      ctx.includes("倾向尝试新方法"),
      `exploratory zh context should contain '倾向尝试新方法', got: ${ctx}`,
    );
  });

  it("mentions safe strategies for high-CORT exploit state", () => {
    const state = makeState({
      current: makeChemistry({ DA: 30, CORT: 90, NE: 70, OT: 30, END: 20 }),
      drives: { survival: 30, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(
      ctx.includes("倾向安全策略"),
      `exploit zh context should contain '倾向安全策略', got: ${ctx}`,
    );
  });
});
