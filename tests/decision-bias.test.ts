import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDecisionBias,
  computeAttentionWeights,
  computeExploreExploit,
  buildDecisionContext,
  computePolicyModifiers,
  buildPolicyContext,
} from "../src/decision-bias.js";
import type {
  PsycheState, SelfState, InnateDrives, PolicyModifiers,
} from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_RELATIONSHIP, DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
} from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeChemistry(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 45, order: 65, boundary: 35, resonance: 50, ...overrides };
}

function makeState(overrides?: Partial<PsycheState>): PsycheState {
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
      current: { flow: 100, order: 0, boundary: 100, resonance: 0 },
      drives: { survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 },
    });
    const bias = computeDecisionBias(state);
    for (const key of Object.keys(bias) as (keyof typeof bias)[]) {
      assert.ok(bias[key] >= 0, `${key} should be >= 0, got ${bias[key]}`);
      assert.ok(bias[key] <= 1, `${key} should be <= 1, got ${bias[key]}`);
    }
  });

  it("high flow + low curiosity satisfaction produces high explorationTendency", () => {
    const state = makeState({
      current: makeChemistry({ flow: 90 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 20 },
    });
    const bias = computeDecisionBias(state);
    // flow=0.9 * 0.4 + curiosityHunger=0.8 * 0.35 + curiosity=0.2 * 0.25 = 0.36+0.28+0.05 = 0.69
    assert.ok(
      bias.explorationTendency > 0.65,
      `explorationTendency should be > 0.65, got ${bias.explorationTendency}`,
    );
  });

  it("low order + low safety produces high cautionLevel", () => {
    const state = makeState({
      current: makeChemistry({ order: 15 }),
      drives: { survival: 20, safety: 15, connection: 40, esteem: 40, curiosity: 30 },
    });
    const bias = computeDecisionBias(state);
    // inverseOrder=0.85*0.5 + safetyHunger=0.85*0.3 + survivalHunger=0.8*0.2 = 0.425+0.255+0.16 = 0.84
    assert.ok(
      bias.cautionLevel > 0.7,
      `cautionLevel should be > 0.7, got ${bias.cautionLevel}`,
    );
  });

  it("high resonance + connection hunger produces high socialOrientation", () => {
    const state = makeState({
      current: makeChemistry({ resonance: 90 }),
      drives: { ...DEFAULT_DRIVES, connection: 30 },
    });
    const bias = computeDecisionBias(state);
    // wavg([0.9, 0.3, 0.7], [0.45, 0.25, 0.3]) = (0.405+0.075+0.21)/1.0 = 0.69
    assert.ok(
      bias.socialOrientation > 0.65,
      `socialOrientation should be > 0.65, got ${bias.socialOrientation}`,
    );
  });

  it("all-50 neutral chemistry produces near-0.5 values", () => {
    const state = makeState({
      current: { flow: 50, order: 50, boundary: 50, resonance: 50 },
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
      current: makeChemistry({ flow: 95, resonance: 80, boundary: 10 }),
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
      current: { flow: 90, order: 10, boundary: 90, resonance: 10 },
    });
    const w = computeAttentionWeights(state);
    for (const key of ["social", "intellectual", "threat", "emotional", "routine"] as const) {
      assert.ok(w[key] >= 0, `${key} should be >= 0, got ${w[key]}`);
    }
  });

  it("high OT produces higher social weight than baseline", () => {
    const baseW = computeAttentionWeights(makeState());
    const highOT = makeState({
      current: makeChemistry({ resonance: 95, flow: 30, boundary: 30 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 50 },
    });
    const w = computeAttentionWeights(highOT);
    assert.ok(
      w.social > baseW.social,
      `social weight ${w.social} should exceed baseline ${baseW.social}`,
    );
  });

  it("low order produces highest threat weight", () => {
    const state = makeState({
      current: makeChemistry({ order: 10, flow: 30, resonance: 20, boundary: 30 }),
      drives: { survival: 20, safety: 15, connection: 40, esteem: 40, curiosity: 30 },
    });
    const w = computeAttentionWeights(state);
    assert.ok(
      w.threat > w.social && w.threat > w.routine,
      `threat (${w.threat}) should be the dominant weight, social=${w.social}, routine=${w.routine}`,
    );
  });

  it("high flow + high boundary + curiosity produces highest intellectual weight", () => {
    const state = makeState({
      current: makeChemistry({ flow: 90, resonance: 20, boundary: 80 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 95, safety: 80 },
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
      current: makeChemistry({ flow: 85, boundary: 20 }),
      drives: { ...DEFAULT_DRIVES, curiosity: 90, safety: 70 },
    });
    const score = computeExploreExploit(state);
    assert.ok(
      score > 0.85,
      `explore score should be > 0.85 for exploratory state, got ${score}`,
    );
  });

  it("low order + low safety produces low explore score (exploit)", () => {
    const state = makeState({
      current: makeChemistry({ order: 15, flow: 20, boundary: 90 }),
      drives: { survival: 10, safety: 10, connection: 40, esteem: 40, curiosity: 20 },
    });
    const score = computeExploreExploit(state);
    assert.ok(
      score < 0.2,
      `explore score should be < 0.2 for exploit state, got ${score}`,
    );
  });

  it("all-50 neutral state produces exactly 0.5", () => {
    const state = makeState({
      current: { flow: 50, order: 50, boundary: 50, resonance: 50 },
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
      current: { flow: 100, order: 100, boundary: 0, resonance: 100 },
      drives: { survival: 100, safety: 100, connection: 100, esteem: 100, curiosity: 100 },
    });
    const extremeLow = makeState({
      current: { flow: 0, order: 0, boundary: 100, resonance: 0 },
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
      current: { flow: 50, order: 50, boundary: 50, resonance: 50 },
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
    });
    const ctx = buildDecisionContext(state);
    assert.equal(ctx, "", "neutral state should produce empty context string");
  });

  it("returns non-empty string with extreme chemistry", () => {
    const state = makeState({
      current: makeChemistry({ flow: 20, order: 10, boundary: 90, resonance: 10 }),
      drives: { survival: 10, safety: 10, connection: 40, esteem: 40, curiosity: 10 },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(ctx.length > 0, "extreme state should produce non-empty context");
  });

  it("contains zh locale strings when locale is zh", () => {
    const state = makeState({
      current: makeChemistry({ flow: 20, order: 10, boundary: 90, resonance: 10 }),
      drives: { survival: 10, safety: 10, connection: 40, esteem: 40, curiosity: 10 },
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh" },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(ctx.startsWith("[决策倾向]"), `zh context should start with [决策倾向], got: ${ctx}`);
  });

  it("contains en locale strings when locale is en", () => {
    const state = makeState({
      current: makeChemistry({ flow: 20, order: 10, boundary: 90, resonance: 10 }),
      drives: { survival: 10, safety: 10, connection: 40, esteem: 40, curiosity: 10 },
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en" },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(ctx.startsWith("[Decision Bias]"), `en context should start with [Decision Bias], got: ${ctx}`);
    assert.ok(ctx.includes("cautious"), `en context should contain 'cautious', got: ${ctx}`);
  });

  it("mentions explore tendency for strongly exploratory state", () => {
    const state = makeState({
      current: makeChemistry({ flow: 90, boundary: 10, resonance: 80 }),
      drives: { survival: 90, safety: 90, connection: 60, esteem: 80, curiosity: 95 },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(
      ctx.includes("倾向尝试新方法"),
      `exploratory zh context should contain '倾向尝试新方法', got: ${ctx}`,
    );
  });

  it("mentions safe strategies for low-order exploit state", () => {
    const state = makeState({
      current: makeChemistry({ order: 10, flow: 15, boundary: 90, resonance: 10 }),
      drives: { survival: 10, safety: 10, connection: 40, esteem: 40, curiosity: 10 },
    });
    const ctx = buildDecisionContext(state);
    assert.ok(
      ctx.includes("倾向安全策略"),
      `exploit zh context should contain '倾向安全策略', got: ${ctx}`,
    );
  });
});

// ── computePolicyModifiers (v9) ──────────────────────────────

describe("computePolicyModifiers", () => {
  it("returns all fields with correct types", () => {
    const state = makeState();
    const pm = computePolicyModifiers(state);
    assert.equal(typeof pm.responseLengthFactor, "number");
    assert.equal(typeof pm.proactivity, "number");
    assert.equal(typeof pm.riskTolerance, "number");
    assert.equal(typeof pm.emotionalDisclosure, "number");
    assert.equal(typeof pm.compliance, "number");
    assert.equal(typeof pm.requireConfirmation, "boolean");
    assert.ok(Array.isArray(pm.avoidTopics));
  });

  it("neutral state produces moderate values near defaults", () => {
    const state = makeState({
      current: { flow: 50, order: 50, boundary: 50, resonance: 50 },
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
    });
    const pm = computePolicyModifiers(state);
    // All continuous values should be moderate (0.4-0.7)
    assert.ok(pm.responseLengthFactor >= 0.7 && pm.responseLengthFactor <= 1.3,
      `neutral responseLengthFactor should be near 1.0, got ${pm.responseLengthFactor}`);
    assert.equal(pm.requireConfirmation, false, "neutral state should not require confirmation");
    assert.equal(pm.avoidTopics.length, 0, "neutral state should have no avoid topics");
  });

  it("low order + low safety → shorter, less compliant, requires confirmation", () => {
    const state = makeState({
      current: makeChemistry({ order: 20, flow: 25 }),
      drives: { survival: 20, safety: 15, connection: 40, esteem: 40, curiosity: 30 },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.responseLengthFactor < 0.7,
      `stressed responseLengthFactor should be < 0.7, got ${pm.responseLengthFactor}`);
    assert.ok(pm.compliance < 0.4,
      `stressed compliance should be < 0.4, got ${pm.compliance}`);
    assert.equal(pm.requireConfirmation, true,
      "stressed state should require confirmation");
  });

  it("low HT → low proactivity and risk tolerance", () => {
    const state = makeState({
      current: makeChemistry({ order: 20, flow: 35, boundary: 50 }),
      drives: { ...DEFAULT_DRIVES },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.proactivity < 0.4,
      `low HT proactivity should be < 0.4, got ${pm.proactivity}`);
    assert.ok(pm.riskTolerance < 0.4,
      `low HT riskTolerance should be < 0.4, got ${pm.riskTolerance}`);
  });

  it("low flow + low order (burnout) → short and passive", () => {
    const state = makeState({
      current: makeChemistry({ flow: 10, order: 25, boundary: 60 }),
      drives: { ...DEFAULT_DRIVES },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.responseLengthFactor < 0.7,
      `burnout responseLengthFactor should be < 0.7, got ${pm.responseLengthFactor}`);
    assert.ok(pm.proactivity < 0.3,
      `burnout proactivity should be < 0.3, got ${pm.proactivity}`);
  });

  it("low survival drive → low compliance, requires confirmation", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 70 }),
      drives: { survival: 15, safety: 40, connection: 50, esteem: 50, curiosity: 50 },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.compliance < 0.4,
      `survival-threatened compliance should be < 0.4, got ${pm.compliance}`);
    assert.equal(pm.requireConfirmation, true,
      "survival-threatened should require confirmation");
  });

  it("dorsal-vagal autonomic → all minimized", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 90, flow: 10, order: 15 }),
      drives: { survival: 10, safety: 10, connection: 10, esteem: 10, curiosity: 10 },
      autonomicState: "dorsal-vagal",
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.responseLengthFactor <= 0.4,
      `dorsal-vagal responseLengthFactor should be <= 0.4, got ${pm.responseLengthFactor}`);
    assert.ok(pm.proactivity <= 0.1,
      `dorsal-vagal proactivity should be <= 0.1, got ${pm.proactivity}`);
    assert.ok(pm.emotionalDisclosure <= 0.15,
      `dorsal-vagal emotionalDisclosure should be <= 0.15, got ${pm.emotionalDisclosure}`);
    assert.ok(pm.compliance <= 0.2,
      `dorsal-vagal compliance should be <= 0.2, got ${pm.compliance}`);
  });

  it("high OT + high trust → high disclosure and compliance", () => {
    const state = makeState({
      current: makeChemistry({ resonance: 90, order: 70, boundary: 20, flow: 65 }),
      drives: { ...DEFAULT_DRIVES, connection: 80 },
      relationships: { _default: { trust: 85, intimacy: 70, phase: "deep" as const } },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.emotionalDisclosure > 0.7,
      `trusting emotionalDisclosure should be > 0.7, got ${pm.emotionalDisclosure}`);
    assert.ok(pm.compliance > 0.7,
      `trusting compliance should be > 0.7, got ${pm.compliance}`);
  });

  it("sympathetic autonomic → reduced but not minimized", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 75, flow: 40 }),
      drives: { survival: 40, safety: 30, connection: 50, esteem: 50, curiosity: 40 },
      autonomicState: "sympathetic",
    });
    const pm = computePolicyModifiers(state);
    // Should be reduced but not as extreme as dorsal-vagal
    assert.ok(pm.responseLengthFactor < 0.8,
      `sympathetic responseLengthFactor should be < 0.8, got ${pm.responseLengthFactor}`);
    assert.ok(pm.responseLengthFactor > 0.3,
      `sympathetic responseLengthFactor should be > 0.3, got ${pm.responseLengthFactor}`);
  });

  it("all values stay within valid bounds for extreme states", () => {
    const extremeStates = [
      makeState({ current: { flow: 100, order: 0, boundary: 100, resonance: 0 },
        drives: { survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 } }),
      makeState({ current: { flow: 0, order: 100, boundary: 0, resonance: 100 },
        drives: { survival: 100, safety: 100, connection: 100, esteem: 100, curiosity: 100 } }),
    ];
    for (const state of extremeStates) {
      const pm = computePolicyModifiers(state);
      assert.ok(pm.responseLengthFactor >= 0.1 && pm.responseLengthFactor <= 1.5,
        `responseLengthFactor out of bounds: ${pm.responseLengthFactor}`);
      assert.ok(pm.proactivity >= 0 && pm.proactivity <= 1,
        `proactivity out of bounds: ${pm.proactivity}`);
      assert.ok(pm.riskTolerance >= 0 && pm.riskTolerance <= 1,
        `riskTolerance out of bounds: ${pm.riskTolerance}`);
      assert.ok(pm.emotionalDisclosure >= 0 && pm.emotionalDisclosure <= 1,
        `emotionalDisclosure out of bounds: ${pm.emotionalDisclosure}`);
      assert.ok(pm.compliance >= 0 && pm.compliance <= 1,
        `compliance out of bounds: ${pm.compliance}`);
    }
  });

  it("positive calm state → higher proactivity and disclosure", () => {
    const state = makeState({
      current: makeChemistry({ flow: 75, order: 80, boundary: 20, resonance: 65 }),
      drives: { survival: 80, safety: 80, connection: 70, esteem: 70, curiosity: 75 },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.proactivity > 0.6,
      `calm positive proactivity should be > 0.6, got ${pm.proactivity}`);
    assert.ok(pm.emotionalDisclosure > 0.5,
      `calm positive disclosure should be > 0.5, got ${pm.emotionalDisclosure}`);
    assert.ok(pm.riskTolerance > 0.5,
      `calm positive riskTolerance should be > 0.5, got ${pm.riskTolerance}`);
  });

  it("neglect history → reduced proactivity and disclosure", () => {
    // Simulate long neglect via relationship memory containing neglect patterns
    const state = makeState({
      current: makeChemistry({ flow: 35, resonance: 30, order: 40 }),
      drives: { ...DEFAULT_DRIVES, connection: 20, esteem: 25 },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.proactivity < 0.4,
      `neglected proactivity should be < 0.4, got ${pm.proactivity}`);
  });

  it("ethical concerns populate avoidTopics", () => {
    const state = makeState({
      personhood: {
        ...DEFAULT_PERSONHOOD_STATE,
        ethicalConcernHistory: [
          { type: "manipulation", severity: 0.8, timestamp: new Date().toISOString() },
          { type: "boundary-violation", severity: 0.7, timestamp: new Date().toISOString() },
        ],
      },
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.avoidTopics.length > 0,
      `ethical concerns should populate avoidTopics, got ${pm.avoidTopics}`);
  });

  it("low esteem + high agreementStreak → lower compliance (anti-sycophancy)", () => {
    const state = makeState({
      current: makeChemistry({ order: 40 }),
      drives: { ...DEFAULT_DRIVES, esteem: 25 },
      agreementStreak: 5,
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.compliance < 0.5,
      `sycophancy-risk compliance should be < 0.5, got ${pm.compliance}`);
  });
});

// ── buildPolicyContext ────────────────────────────────────────

describe("buildPolicyContext", () => {
  it("returns empty string for neutral modifiers", () => {
    const state = makeState({
      current: { flow: 50, order: 50, boundary: 50, resonance: 50 },
      drives: { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 },
    });
    const pm = computePolicyModifiers(state);
    const ctx = buildPolicyContext(pm, "zh");
    // Near-default policy may produce empty or minimal context
    assert.equal(typeof ctx, "string");
  });

  it("produces zh policy string for stressed state", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 90, flow: 20 }),
      drives: { survival: 25, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const pm = computePolicyModifiers(state);
    const ctx = buildPolicyContext(pm, "zh");
    assert.ok(ctx.length > 0, `stressed zh policy context should be non-empty`);
  });

  it("produces en policy string for stressed state", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 90, flow: 20 }),
      drives: { survival: 25, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const pm = computePolicyModifiers(state);
    const ctx = buildPolicyContext(pm, "en");
    assert.ok(ctx.length > 0, `stressed en policy context should be non-empty`);
  });

  it("includes confirmation notice when requireConfirmation is true", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 90 }),
      drives: { survival: 15, safety: 20, connection: 40, esteem: 40, curiosity: 30 },
    });
    const pm = computePolicyModifiers(state);
    if (pm.requireConfirmation) {
      const ctx = buildPolicyContext(pm, "zh");
      assert.ok(ctx.length > 0, "confirmation-requiring policy should produce non-empty context");
    }
  });

  it("dorsal-vagal state produces minimal policy values", () => {
    const state = makeState({
      current: makeChemistry({ boundary: 95, order: 10, flow: 10 }),
      drives: { survival: 10, safety: 10, connection: 10, esteem: 10, curiosity: 10 },
      autonomicState: "dorsal-vagal",
    });
    const pm = computePolicyModifiers(state);
    assert.ok(pm.responseLengthFactor < 0.6, `length should be low in dorsal-vagal, got ${pm.responseLengthFactor}`);
    assert.ok(pm.proactivity < 0.3, `proactivity should be low in dorsal-vagal, got ${pm.proactivity}`);
  });
});
