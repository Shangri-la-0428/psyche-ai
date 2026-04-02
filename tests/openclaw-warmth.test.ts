// ============================================================
// OpenClaw Warmth Integration Tests
//
// Simulates the OpenClaw → Psyche lifecycle to verify that
// v10.0 warmth parameter adjustments produce the expected
// behavioral signals in companion vs natural mode.
// ============================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCompactContext, deriveBehavioralBias } from "../src/prompt.js";
import type { PsycheState, PsycheMode } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 10,
    sensitivity: 1.0,
    baseline: { order: 55, flow: 55, boundary: 30, resonance: 50 },
    current:  { order: 55, flow: 55, boundary: 30, resonance: 50 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["真实", "好奇"], preferences: ["探索"], boundaries: ["不舔"], currentInterests: ["编程"] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "Claw", createdAt: new Date().toISOString(), totalInteractions: 20, locale: "zh", mode: "natural" as const },
    ...overrides,
  };
}

function withMode(state: PsycheState, mode: PsycheMode): PsycheState {
  return { ...state, meta: { ...state.meta, mode } };
}

function withOTDelta(state: PsycheState, delta: number): PsycheState {
  return { ...state, current: { ...state.current, resonance: state.baseline.resonance + delta } };
}

const warmBridge = {
  closenessFloor: 0.3, safetyFloor: 0.4, guardFloor: 0.2, residueFloor: 0.1, continuityFloor: 0.3,
  continuityMode: "warm-resume" as const, activeLoopTypes: [], sourceMemoryCount: 2,
};

const guardedBridge = { ...warmBridge, continuityMode: "guarded-resume" as const };

// ── deriveBehavioralBias: companion mode OT threshold ──────

describe("companion mode warmth threshold", () => {

  it("natural mode: OT +7 does NOT trigger warmth signal", () => {
    const state = withOTDelta(makeState(), 7);
    const bias = deriveBehavioralBias(state, "zh");
    assert.ok(!bias.includes("倾向靠近"), `OT +7 in natural should not trigger warmth, got: ${bias}`);
  });

  it("companion mode: OT +7 DOES trigger warmth signal", () => {
    const state = withOTDelta(withMode(makeState(), "companion"), 7);
    const bias = deriveBehavioralBias(state, "zh");
    assert.ok(bias.includes("倾向靠近"), `OT +7 in companion should trigger warmth, got: ${bias}`);
  });

  it("companion mode: OT +4 does NOT trigger (below even companion threshold)", () => {
    const state = withOTDelta(withMode(makeState(), "companion"), 4);
    const bias = deriveBehavioralBias(state, "zh");
    assert.ok(!bias.includes("倾向靠近"), `OT +4 should not trigger even in companion, got: ${bias}`);
  });

  it("natural mode: OT +12 triggers warmth (above natural threshold)", () => {
    const state = withOTDelta(makeState(), 12);
    const bias = deriveBehavioralBias(state, "zh");
    assert.ok(bias.includes("倾向靠近"), `OT +12 should trigger in natural, got: ${bias}`);
  });

  it("work mode: uses natural threshold (OT +7 no trigger)", () => {
    const state = withOTDelta(withMode(makeState(), "work"), 7);
    const bias = deriveBehavioralBias(state, "zh");
    assert.ok(!bias.includes("倾向靠近"), `work mode should use natural threshold, got: ${bias}`);
  });

  it("English locale also respects companion threshold", () => {
    const state = withOTDelta(withMode(makeState(), "companion"), 7);
    state.meta.locale = "en";
    const bias = deriveBehavioralBias(state, "en");
    assert.ok(bias.includes("leaning closer"), `English companion should also trigger at +7, got: ${bias}`);
  });
});

// ── buildUnifiedConstraints: warm-resume positive signal ────

describe("warm-resume established constraint", () => {

  it("warm-resume: gets relaxed constraint, no 不贴不舔 (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "最近怎么样", sessionBridge: warmBridge });
    assert.ok(ctx.includes("放松，可以主动分享"), `warm-resume should have positive signal, got: ${ctx}`);
    assert.ok(!ctx.includes("不贴不舔"), `warm-resume should NOT have cold defense, got: ${ctx}`);
  });

  it("guarded-resume: keeps defensive constraint (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "最近怎么样", sessionBridge: guardedBridge });
    assert.ok(ctx.includes("不贴不舔"), `guarded-resume should keep defense, got: ${ctx}`);
    assert.ok(!ctx.includes("放松，可以主动分享"), `guarded-resume should NOT have warm signal, got: ${ctx}`);
  });

  it("no bridge: gets full boilerplate, not compressed (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "最近怎么样" });
    assert.ok(ctx.includes("像发微信一样说话"), `no bridge should have full rules, got: ${ctx}`);
    assert.ok(!ctx.includes("放松，可以主动分享"), `no bridge should NOT have warm signal, got: ${ctx}`);
  });

  it("warm-resume English: relaxed constraint", () => {
    const state = makeState({
      meta: { agentName: "Claw", createdAt: new Date().toISOString(), totalInteractions: 20, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "how are you", sessionBridge: warmBridge });
    assert.ok(ctx.includes("Relax, you can initiate sharing"), `English warm-resume should have positive signal, got: ${ctx}`);
    assert.ok(!ctx.includes("No people-pleasing"), `English warm-resume should NOT have cold defense, got: ${ctx}`);
  });

  it("guarded-resume English: defensive constraint", () => {
    const state = makeState({
      meta: { agentName: "Claw", createdAt: new Date().toISOString(), totalInteractions: 20, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "hey", sessionBridge: guardedBridge });
    assert.ok(ctx.includes("No people-pleasing"), `English guarded should keep defense, got: ${ctx}`);
  });
});

// ── Full lifecycle simulation: OpenClaw hook sequence ────────

describe("OpenClaw lifecycle: warmth in companion + warm-resume", () => {

  it("companion + warm-resume + OT +7: both warmth signals present", () => {
    const state = withOTDelta(withMode(makeState(), "companion"), 7);
    const ctx = buildCompactContext(state, undefined, {
      userText: "今天好累啊",
      sessionBridge: warmBridge,
    });
    // Should have: continuity warm signal + behavioral warmth + relaxed constraint
    assert.ok(ctx.includes("[延续]"), "should have continuity section");
    assert.ok(ctx.includes("倾向靠近"), "companion OT +7 should trigger warmth in inner state");
    assert.ok(ctx.includes("放松，可以主动分享"), "warm-resume should have relaxed constraint");
    assert.ok(!ctx.includes("不贴不舔"), "should NOT have cold defense");
  });

  it("natural + warm-resume + OT +7: only constraint warmth, no inner warmth", () => {
    const state = withOTDelta(makeState(), 7);
    const ctx = buildCompactContext(state, undefined, {
      userText: "今天好累啊",
      sessionBridge: warmBridge,
    });
    // OT +7 < natural threshold 10, so no inner warmth
    assert.ok(!ctx.includes("倾向靠近"), "natural OT +7 should NOT trigger inner warmth");
    // But warm-resume still softens constraint
    assert.ok(ctx.includes("放松，可以主动分享"), "warm-resume constraint should still be relaxed");
  });

  it("companion + guarded-resume + OT +7: inner warmth but defensive constraint", () => {
    const state = withOTDelta(withMode(makeState(), "companion"), 7);
    const ctx = buildCompactContext(state, undefined, {
      userText: "我们需要谈谈",
      sessionBridge: guardedBridge,
    });
    assert.ok(ctx.includes("倾向靠近"), "companion OT +7 triggers inner warmth");
    assert.ok(ctx.includes("不贴不舔"), "guarded-resume keeps defensive constraint");
    assert.ok(!ctx.includes("放松，可以主动分享"), "guarded should NOT have warm constraint");
  });

  it("zero extra tokens: warm-resume constraint same length as cold", () => {
    const warmText = "放松，可以主动分享。有自尊。";
    const coldText = "镜像对方风格。不贴不舔。有自尊。";
    // Warm should not be significantly longer (< 2x)
    assert.ok(warmText.length <= coldText.length * 1.5,
      `warm constraint (${warmText.length}) should not waste tokens vs cold (${coldText.length})`);
  });
});
