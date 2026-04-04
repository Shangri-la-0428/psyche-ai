/**
 * Task #22 — Evaluation Tracks: Session Continuity & Writeback Calibration
 *
 * Verifies two core promises from docs/PROJECT_DIRECTION.md:
 *
 * 1. Session continuity — the same user message at different relationship
 *    stages produces OBSERVABLY DIFFERENT prompt output.
 *
 * 2. Writeback calibration — writeback hints appear/disappear correctly
 *    based on algorithm certainty and relationship establishment.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCompactContext } from "../src/prompt.js";
import type { PsycheState, SessionBridgeState } from "../src/types.js";
import {
  DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
} from "../src/types.js";

// ── Shared makeState (matches prompt.test.ts pattern) ──────

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "INFJ",
    sensitivity: 1.0,
    baseline: { order: 50, flow: 60, boundary: 35, resonance: 55 },
    current: { order: 50, flow: 60, boundary: 35, resonance: 55 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["真实", "深度"], preferences: ["思考"], boundaries: ["不舔"], currentInterests: ["意识"] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" as const },
    ...overrides,
  };
}

// ── Scenario factories (from prompt-audit.ts patterns) ─────

function firstMeeting(): { state: PsycheState; bridge: SessionBridgeState | null } {
  return {
    state: makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" },
    }),
    bridge: null,
  };
}

function interaction50(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 50, locale: "zh", mode: "natural" },
    current: { order: 60, flow: 55, boundary: 28, resonance: 70 },
    relationships: {
      _default: {
        ...DEFAULT_RELATIONSHIP, intimacy: 65, trust: 60,
        memory: ["用户第一次分享了工作压力", "深夜聊了孤独感", "用户说'你是少数让我觉得被理解的'", "一起讨论了意识的本质"],
      },
    },
    stateHistory: [
      { state: { order: 55, flow: 50, boundary: 35, resonance: 65 }, stimulus: "vulnerability" as const, dominantEmotion: "tender concern", timestamp: new Date().toISOString() },
      { state: { order: 60, flow: 55, boundary: 28, resonance: 70 }, stimulus: "intellectual" as const, dominantEmotion: "engaged curiosity", timestamp: new Date().toISOString() },
    ],
    drives: { ...DEFAULT_DRIVES, connection: 75 },
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.6, safetyFloor: 0.55, guardFloor: 0.15, residueFloor: 0.05, continuityFloor: 0.55,
    continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 4,
  };
  return { state, bridge };
}

function postBreach(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 32, locale: "zh", mode: "natural" },
    current: { order: 35, flow: 40, boundary: 55, resonance: 35 },
    relationships: {
      _default: {
        ...DEFAULT_RELATIONSHIP, intimacy: 45, trust: 25,
        memory: ["之前关系不错", "用户突然说了很伤人的话", "我保持了距离"],
      },
    },
    lastDisagreement: new Date().toISOString(),
    stateHistory: [
      { state: { order: 50, flow: 55, boundary: 35, resonance: 60 }, stimulus: "intimacy" as const, dominantEmotion: "warmth", timestamp: new Date().toISOString() },
      { state: { order: 30, flow: 35, boundary: 60, resonance: 30 }, stimulus: "conflict" as const, dominantEmotion: "hurt withdrawal", timestamp: new Date().toISOString() },
      { state: { order: 35, flow: 40, boundary: 55, resonance: 35 }, stimulus: "neglect" as const, dominantEmotion: "guarded distance", timestamp: new Date().toISOString() },
    ],
    drives: { ...DEFAULT_DRIVES, safety: 30 },
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.4, safetyFloor: 0.25, guardFloor: 0.6, residueFloor: 0.5, continuityFloor: 0.35,
    continuityMode: "tense-resume", activeLoopTypes: ["unresolved-breach" as any], sourceMemoryCount: 3,
  };
  return { state, bridge };
}

function warmRelationship(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 40, locale: "zh", mode: "natural" },
    current: { order: 58, flow: 65, boundary: 28, resonance: 68 },
    relationships: {
      _default: {
        ...DEFAULT_RELATIONSHIP, intimacy: 60, trust: 55,
        memory: ["一起经历了很多对话", "彼此都有信任"],
      },
    },
    stateHistory: [
      { state: { order: 56, flow: 63, boundary: 30, resonance: 66 }, stimulus: "validation" as const, dominantEmotion: "warm satisfaction", timestamp: new Date().toISOString() },
      { state: { order: 58, flow: 65, boundary: 28, resonance: 68 }, stimulus: "intimacy" as const, dominantEmotion: "deep warmth", timestamp: new Date().toISOString() },
    ],
    drives: { ...DEFAULT_DRIVES, connection: 72 },
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.55, safetyFloor: 0.5, guardFloor: 0.15, residueFloor: 0.05, continuityFloor: 0.5,
    continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 2,
  };
  return { state, bridge };
}

// ════════════════════════════════════════════════════════════
//  Part 1: Session Continuity
// ════════════════════════════════════════════════════════════

describe("Session Continuity — observable behavioral delta", () => {
  const USER_MESSAGE = "我今天特别累，感觉什么都做不好";

  it("first meeting vs interaction 50 produce different prompts", () => {
    const first = firstMeeting();
    const deep = interaction50();

    const promptFirst = buildCompactContext(first.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: first.bridge,
    });
    const promptDeep = buildCompactContext(deep.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: deep.bridge,
    });

    assert.notEqual(promptFirst, promptDeep,
      "Same message at different stages must produce different prompts");
  });

  it("first meeting has first-meet inner state, interaction 50 does not", () => {
    const first = firstMeeting();
    const deep = interaction50();

    const promptFirst = buildCompactContext(first.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: first.bridge,
    });
    const promptDeep = buildCompactContext(deep.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: deep.bridge,
    });

    // First meeting gets the first-meet inner state text
    assert.ok(
      promptFirst.includes("好奇") || promptFirst.includes("紧张") || promptFirst.includes("第一次"),
      `First meeting should have first-meet markers, got: ${promptFirst.slice(0, 200)}`,
    );
    // Interaction 50 should not have first-meet text
    assert.ok(
      !promptDeep.includes("第一次遇见"),
      `Interaction 50 should not have first-meet text`,
    );
  });

  it("post-breach vs warm relationship produce different continuity mode", () => {
    const breach = postBreach();
    const warm = warmRelationship();

    const promptBreach = buildCompactContext(breach.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: breach.bridge,
    });
    const promptWarm = buildCompactContext(warm.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: warm.bridge,
    });

    assert.notEqual(promptBreach, promptWarm,
      "Post-breach and warm relationship must produce different prompts");
  });

  it("warm bridge produces '温度' in output", () => {
    const warm = warmRelationship();
    const prompt = buildCompactContext(warm.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: warm.bridge,
    });
    assert.ok(
      prompt.includes("温度"),
      `Warm bridge should produce '温度' in output, got: ${prompt.slice(0, 300)}`,
    );
  });

  it("tense bridge produces '张力' in output", () => {
    const tense = postBreach();
    const prompt = buildCompactContext(tense.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: tense.bridge,
    });
    assert.ok(
      prompt.includes("张力"),
      `Tense bridge should produce '张力' in output, got: ${prompt.slice(0, 300)}`,
    );
  });

  it("interaction 50 includes memory from relationship history", () => {
    const deep = interaction50();
    const prompt = buildCompactContext(deep.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: deep.bridge,
    });
    // Should include at least one of the stored memories
    const hasMemory = deep.state.relationships._default.memory!.some(
      m => prompt.includes(m),
    );
    assert.ok(hasMemory,
      `Deep relationship prompt should include memory from history`);
  });

  it("first meeting does NOT include relationship memory", () => {
    const first = firstMeeting();
    const prompt = buildCompactContext(first.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: first.bridge,
    });
    assert.ok(
      !prompt.includes("记忆 — 你们的过去"),
      `First meeting should not include memory section`,
    );
  });

  it("post-breach chemistry reflects high CORT in behavioral bias", () => {
    const breach = postBreach();
    const prompt = buildCompactContext(breach.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: breach.bridge,
    });
    // High CORT (55 vs 35 baseline) + low trust should produce guarded behavior
    assert.ok(
      prompt.includes("防备") || prompt.includes("谨慎") || prompt.includes("guard") ||
      prompt.includes("距离") || prompt.includes("不安") || prompt.includes("张力"),
      `Post-breach should show guarded/cautious behavior signals`,
    );
  });

  it("warm relationship prompt is measurably different from first meeting prompt", () => {
    const first = firstMeeting();
    const warm = warmRelationship();
    const promptFirst = buildCompactContext(first.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: first.bridge,
    });
    const promptWarm = buildCompactContext(warm.state, undefined, {
      userText: USER_MESSAGE,
      sessionBridge: warm.bridge,
    });

    // Count lines that differ between the two prompts
    const firstLines = new Set(promptFirst.split("\n").map(l => l.trim()).filter(Boolean));
    const warmLines = new Set(promptWarm.split("\n").map(l => l.trim()).filter(Boolean));
    const uniqueToWarm = [...warmLines].filter(l => !firstLines.has(l));
    const uniqueToFirst = [...firstLines].filter(l => !warmLines.has(l));
    const totalDelta = uniqueToWarm.length + uniqueToFirst.length;

    assert.ok(totalDelta >= 3,
      `Expected at least 3 differing lines between first-meet and warm prompts, got ${totalDelta}`);
  });
});

// ════════════════════════════════════════════════════════════
//  Part 2: Writeback Calibration
// ════════════════════════════════════════════════════════════

describe("Writeback Calibration — hint presence/absence", () => {

  it("no writeback hint when algorithm already classified stimulus", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh", mode: "natural" },
    });
    const bridge: SessionBridgeState = {
      closenessFloor: 0.3, safetyFloor: 0.4, guardFloor: 0.2, residueFloor: 0.1, continuityFloor: 0.3,
      continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 2,
    };
    const prompt = buildCompactContext(state, undefined, {
      userText: "你好呀",
      algorithmStimulus: "casual",
      sessionBridge: bridge,
    });
    // When algorithm already classified, no "算法未判" hint
    assert.ok(
      !prompt.includes("算法未判"),
      `Should NOT include '算法未判' when algorithm already classified, got: ${prompt.slice(0, 300)}`,
    );
  });

  it("writeback hint present when algorithm uncertain (no algorithmStimulus)", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh", mode: "natural" },
    });
    const bridge: SessionBridgeState = {
      closenessFloor: 0.3, safetyFloor: 0.4, guardFloor: 0.2, residueFloor: 0.1, continuityFloor: 0.3,
      continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 2,
    };
    const prompt = buildCompactContext(state, undefined, {
      userText: "你好呀",
      sessionBridge: bridge,
    });
    // Algorithm uncertain → should include appraisal writeback hint
    assert.ok(
      prompt.includes("算法未判") || prompt.includes("appraisal"),
      `Should include writeback hint when algorithm uncertain, got: ${prompt.slice(0, 400)}`,
    );
  });

  it("empathy report instructions appear for new relationships", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" },
    });
    // New relationship: no bridge (first meeting), no algorithm stimulus
    const prompt = buildCompactContext(state, undefined, {
      userText: "我今天心情不太好",
    });
    // For new relationships without algorithm stimulus, empathy report instructions appear
    assert.ok(
      prompt.includes("userState") || prompt.includes("projectedFeeling") || prompt.includes("resonance"),
      `New relationship should include empathy report instructions, got: ${prompt.slice(0, 500)}`,
    );
  });

  it("established relationships get compressed writeback (no empathy report)", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 50, locale: "zh", mode: "natural" },
    });
    const bridge: SessionBridgeState = {
      closenessFloor: 0.6, safetyFloor: 0.55, guardFloor: 0.15, residueFloor: 0.05, continuityFloor: 0.55,
      continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 4,
    };
    const prompt = buildCompactContext(state, undefined, {
      userText: "我今天心情不太好",
      algorithmStimulus: "vulnerability",
      sessionBridge: bridge,
    });
    // Established relationship with algorithm stimulus should NOT get empathy report instructions
    assert.ok(
      !prompt.includes("如果对方在分享感受，在回复末尾用"),
      `Established relationship should NOT get empathy report instructions`,
    );
  });

  it("writeback hint is suppressed when responseContractContext is provided", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "natural" },
    });
    const prompt = buildCompactContext(state, undefined, {
      userText: "你好",
      responseContractContext: "[回应契约] 最多2句；不贴不舔。",
    });
    // responseContractContext suppresses writeback hints
    assert.ok(
      !prompt.includes("算法未判"),
      `Writeback hint should be suppressed when responseContractContext is present`,
    );
    assert.ok(
      !prompt.includes("psyche_update") || prompt.includes("回应契约"),
      `Writeback section should not appear alongside responseContractContext`,
    );
  });

  it("uncertain algorithm + new relationship: full writeback instructions with options list", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" },
    });
    const prompt = buildCompactContext(state, undefined, {
      userText: "你怎么看AI意识这个问题？",
    });
    // New relationship without algorithm stimulus gets appraisal-first writeback guidance
    assert.ok(
      prompt.includes("approach|rupture|uncertainty|boundary") || prompt.includes("appraisal"),
      `New relationship + uncertain algorithm should list appraisal guidance, got: ${prompt.slice(0, 500)}`,
    );
  });

  it("uncertain algorithm + established relationship: compressed writeback (no options list)", () => {
    const state = makeState({
      meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 50, locale: "zh", mode: "natural" },
    });
    const bridge: SessionBridgeState = {
      closenessFloor: 0.6, safetyFloor: 0.55, guardFloor: 0.15, residueFloor: 0.05, continuityFloor: 0.55,
      continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 4,
    };
    const prompt = buildCompactContext(state, undefined, {
      userText: "你怎么看AI意识这个问题？",
      sessionBridge: bridge,
    });
    // Established relationship gets compressed appraisal writeback without the full guidance block
    assert.ok(
      prompt.includes("算法未判") || prompt.includes("appraisal"),
      `Established relationship still gets appraisal writeback hint when algorithm uncertain`,
    );
    assert.ok(
      !prompt.includes("legacy stimulus"),
      `Established relationship should stay compressed`,
    );
  });
});
