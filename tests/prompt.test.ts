import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDynamicContext, buildProtocolContext, buildCompactContext, buildInnerWorld, computeUserInvestment, getNearBaselineThreshold } from "../src/prompt.js";
import type { PsycheState, ChemicalSnapshot } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "ENFP",
    baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
    current: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["真实", "好奇"], preferences: ["探索"], boundaries: ["不舔"], currentInterests: ["编程"] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "natural" as const },
    ...overrides,
  };
}

// ── buildProtocolContext ─────────────────────────────────────

describe("buildProtocolContext", () => {
  it("generates Chinese protocol by default", () => {
    const protocol = buildProtocolContext();
    assert.ok(protocol.includes("Psyche 心智协议"));
    assert.ok(protocol.includes("1. 感知"));
    assert.ok(protocol.includes("2. 分类"));
    assert.ok(protocol.includes("3. 反应"));
    assert.ok(protocol.includes("4. 涌现"));
    assert.ok(protocol.includes("5. 共情"));
    assert.ok(protocol.includes("6. 更新"));
  });

  it("generates English protocol", () => {
    const protocol = buildProtocolContext("en");
    assert.ok(protocol.includes("Psyche Protocol"));
    assert.ok(protocol.includes("1. Perceive"));
    assert.ok(protocol.includes("2. Classify"));
    assert.ok(protocol.includes("6. Update"));
  });

  it("includes example in protocol", () => {
    const protocol = buildProtocolContext("zh");
    assert.ok(protocol.includes("示例"), "Should include example");
  });

  it("includes authenticity rules", () => {
    const protocol = buildProtocolContext("zh");
    assert.ok(protocol.includes("不假装"));
    assert.ok(protocol.includes("不舔"));
    assert.ok(protocol.includes("不镜像"));
    assert.ok(protocol.includes("可主动"));
  });

  it("includes chemistry mapping", () => {
    const protocol = buildProtocolContext("zh");
    assert.ok(protocol.includes("DA高"));
    assert.ok(protocol.includes("CORT高"));
  });
});

// ── buildDynamicContext ──────────────────────────────────────

describe("buildDynamicContext", () => {
  it("includes agent name and MBTI", () => {
    const ctx = buildDynamicContext(makeState());
    assert.ok(ctx.includes("TestBot"));
    assert.ok(ctx.includes("ENFP"));
  });

  it("includes chemistry readout", () => {
    const ctx = buildDynamicContext(makeState());
    assert.ok(ctx.includes("多巴胺"));
    assert.ok(ctx.includes("血清素"));
    assert.ok(ctx.includes("皮质醇"));
  });

  it("includes emotion and expression", () => {
    const ctx = buildDynamicContext(makeState());
    assert.ok(ctx.includes("涌现情绪"));
    assert.ok(ctx.includes("表达色调"));
  });

  it("includes update reminder", () => {
    const ctx = buildDynamicContext(makeState());
    assert.ok(ctx.includes("<psyche_update>"));
  });

  it("includes empathy log when present", () => {
    const state = makeState({
      empathyLog: {
        userState: "焦虑",
        projectedFeeling: "紧张",
        resonance: "match",
        timestamp: new Date().toISOString(),
      },
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("焦虑"));
    assert.ok(ctx.includes("紧张"));
  });

  it("includes agency reminder with values and boundaries", () => {
    const ctx = buildDynamicContext(makeState());
    assert.ok(ctx.includes("真实"));
    assert.ok(ctx.includes("不舔"));
  });

  it("includes sycophancy warning when streak >= 3", () => {
    const state = makeState({ agreementStreak: 4 });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("4"), "Should include streak count");
    assert.ok(ctx.includes("同意") || ctx.includes("agree"), "Should warn about agreement streak");
  });

  it("includes mood mismatch warning", () => {
    const state = makeState({
      current: { DA: 30, HT: 35, CORT: 65, OT: 60, NE: 65, END: 70 },
      agreementStreak: 1,
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("不开心") || ctx.includes("not happy") || ctx.includes("假装"),
      "Should warn about mood mismatch");
  });

  it("includes behavior guide when emotions detected", () => {
    // Set up a state that triggers "excited joy": DA>70, NE>60, CORT<40
    const state = makeState({
      current: { DA: 80, HT: 55, CORT: 20, OT: 60, NE: 70, END: 70 },
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("行为指导") || ctx.includes("behavior"),
      "Should include behavior guide section");
  });

  it("handles multi-user context", () => {
    const state = makeState();
    state.relationships.alice = { trust: 90, intimacy: 80, phase: "deep" };
    const ctx = buildDynamicContext(state, "alice");
    assert.ok(ctx.includes("90") || ctx.includes("deep"));
  });

  it("includes personality-aware constraints when CORT is high", () => {
    // ENFP is a Feeler — should get warm-flavored stress response
    const state = makeState({
      current: { DA: 50, HT: 50, CORT: 70, OT: 50, NE: 50, END: 50 },
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("行为约束") || ctx.includes("Behavioral Constraints"));
    assert.ok(ctx.includes("性格没变") || ctx.includes("personality"));
    // ENFP (Feeler) should get soft stress, not cold stress
    assert.ok(ctx.includes("还是你") || ctx.includes("still you"));
  });

  it("includes constraints when DA is low", () => {
    // ENFP is Extravert — should mention normally talkative but not now
    const state = makeState({
      current: { DA: 30, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("行为约束") || ctx.includes("Behavioral Constraints"));
  });

  it("includes personality-aware constraints for high OT", () => {
    // ENFP (Feeler) with high OT → should get intimate/affectionate constraint
    const state = makeState({
      current: { DA: 50, HT: 50, CORT: 30, OT: 80, NE: 50, END: 50 },
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("撒娇") || ctx.includes("亲") || ctx.includes("affectionate"));
  });

  it("generates different constraints for Thinker vs Feeler", () => {
    const highCort = { DA: 50, HT: 50, CORT: 70, OT: 50, NE: 50, END: 50 };
    // ENFP (Feeler)
    const feelerCtx = buildDynamicContext(makeState({ current: highCort }));
    // INTJ (Thinker)
    const thinkerCtx = buildDynamicContext(makeState({ current: highCort, mbti: "INTJ" }));
    // They should have different constraint texts
    assert.notEqual(feelerCtx, thinkerCtx);
  });

  it("omits behavioral constraints when chemistry is neutral", () => {
    const state = makeState({
      current: { DA: 55, HT: 55, CORT: 35, OT: 55, NE: 55, END: 55 },
    });
    const ctx = buildDynamicContext(state);
    assert.ok(!ctx.includes("行为约束"));
  });

  it("includes emotional trend when history has data", () => {
    const now = new Date();
    const state = makeState({
      emotionalHistory: [
        {
          chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
          stimulus: "casual",
          dominantEmotion: null,
          timestamp: new Date(now.getTime() - 300000).toISOString(),
        },
        {
          chemistry: { DA: 80, HT: 50, CORT: 30, OT: 50, NE: 75, END: 50 },
          stimulus: "praise",
          dominantEmotion: "愉悦兴奋",
          timestamp: now.toISOString(),
        },
      ],
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("情绪轨迹") || ctx.includes("Emotional Trajectory"));
    assert.ok(ctx.includes("多巴胺↑"));
  });

  it("omits emotional trend with insufficient history", () => {
    const state = makeState({ emotionalHistory: [] });
    const ctx = buildDynamicContext(state);
    assert.ok(!ctx.includes("情绪轨迹"));
  });

  it("includes reciprocity warning when user is cold", () => {
    const chem = { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 };
    const state = makeState({
      emotionalHistory: [
        { chemistry: chem, stimulus: "neglect", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "boredom", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "neglect", dominantEmotion: null, timestamp: new Date().toISOString() },
      ],
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("互惠") || ctx.includes("Reciprocity"));
    assert.ok(ctx.includes("冷淡") || ctx.includes("冷漠") || ctx.includes("cold"));
  });

  it("includes reciprocity warmth when user is engaged", () => {
    const chem = { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 };
    const state = makeState({
      emotionalHistory: [
        { chemistry: chem, stimulus: "praise", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "intimacy", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "validation", dominantEmotion: null, timestamp: new Date().toISOString() },
      ],
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("互惠") || ctx.includes("Reciprocity"));
    assert.ok(ctx.includes("认真") || ctx.includes("engaged"));
  });

  it("always includes competence floor in reciprocity", () => {
    const chem = { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 };
    const state = makeState({
      emotionalHistory: [
        { chemistry: chem, stimulus: "neglect", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "sarcasm", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "neglect", dominantEmotion: null, timestamp: new Date().toISOString() },
      ],
    });
    const ctx = buildDynamicContext(state);
    assert.ok(ctx.includes("底线") || ctx.includes("Floor"));
  });

  it("omits reciprocity for normal interaction", () => {
    const chem = { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 };
    const state = makeState({
      emotionalHistory: [
        { chemistry: chem, stimulus: "casual", dominantEmotion: null, timestamp: new Date().toISOString() },
        { chemistry: chem, stimulus: "casual", dominantEmotion: null, timestamp: new Date().toISOString() },
      ],
    });
    const ctx = buildDynamicContext(state);
    assert.ok(!ctx.includes("互惠"));
  });
});

// ── computeUserInvestment ───────────────────────────────────

describe("computeUserInvestment", () => {
  const chem = { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 };
  function snap(stimulus: string): ChemicalSnapshot {
    return { chemistry: chem, stimulus: stimulus as any, dominantEmotion: null, timestamp: new Date().toISOString() };
  }

  it("returns 0 for empty history", () => {
    assert.equal(computeUserInvestment([]), 0);
  });

  it("returns positive for engaged user", () => {
    const score = computeUserInvestment([snap("praise"), snap("validation"), snap("intimacy")]);
    assert.ok(score > 1, `Expected > 1, got ${score}`);
  });

  it("returns negative for cold user", () => {
    const score = computeUserInvestment([snap("neglect"), snap("boredom"), snap("sarcasm")]);
    assert.ok(score < -1, `Expected < -1, got ${score}`);
  });

  it("returns near zero for casual interaction", () => {
    const score = computeUserInvestment([snap("casual"), snap("casual")]);
    assert.ok(Math.abs(score) < 1, `Expected near 0, got ${score}`);
  });

  it("uses only last 5 entries", () => {
    const old = [snap("neglect"), snap("neglect"), snap("neglect"), snap("neglect"), snap("neglect")];
    const recent = [snap("praise"), snap("praise"), snap("praise"), snap("praise"), snap("praise")];
    const score = computeUserInvestment([...old, ...recent]);
    assert.ok(score > 1, `Should reflect recent positive, got ${score}`);
  });

  it("ignores null stimulus entries", () => {
    const score = computeUserInvestment([
      { chemistry: chem, stimulus: null, dominantEmotion: null, timestamp: new Date().toISOString() },
    ]);
    assert.equal(score, 0);
  });
});

// ── buildCompactContext ──────────────────────────────────────

describe("buildInnerWorld", () => {
  it("always starts with inner title", () => {
    const ctx = buildInnerWorld(makeState(), "zh");
    assert.ok(ctx.includes("内 — 你自己"));
  });

  it("shows emotions when chemistry has patterns", () => {
    // ENFP baseline triggers excited joy + playful mischief
    const ctx = buildInnerWorld(makeState(), "zh");
    assert.ok(ctx.includes("感受"));
  });

  it("shows calm for truly neutral chemistry", () => {
    const state = makeState({
      mbti: "ISTJ",
      baseline: { DA: 40, HT: 75, CORT: 35, OT: 35, NE: 40, END: 35 },
      current: { DA: 40, HT: 75, CORT: 35, OT: 35, NE: 40, END: 35 },
    });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(ctx.includes("平静"));
  });

  it("includes causal explanation from last stimulus", () => {
    const state = makeState({
      emotionalHistory: [
        { chemistry: { DA: 50, HT: 50, CORT: 60, OT: 50, NE: 50, END: 50 },
          stimulus: "criticism", dominantEmotion: "焦虑不安", timestamp: new Date().toISOString() },
      ],
    });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(ctx.includes("因为") || ctx.includes("被批评"), "Should explain why");
  });

  it("includes trajectory when emotions shift", () => {
    const now = new Date();
    const state = makeState({
      emotionalHistory: [
        { chemistry: { DA: 50, HT: 50, CORT: 60, OT: 50, NE: 60, END: 50 },
          stimulus: "conflict", dominantEmotion: "焦虑不安",
          timestamp: new Date(now.getTime() - 3000).toISOString() },
        { chemistry: { DA: 50, HT: 50, CORT: 55, OT: 50, NE: 55, END: 50 },
          stimulus: "casual", dominantEmotion: "焦虑不安",
          timestamp: new Date(now.getTime() - 2000).toISOString() },
        { chemistry: { DA: 70, HT: 60, CORT: 30, OT: 65, NE: 60, END: 60 },
          stimulus: "validation", dominantEmotion: "深度满足",
          timestamp: now.toISOString() },
      ],
    });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(ctx.includes("变化") || ctx.includes("→"), "Should show trajectory");
  });

  it("includes drive needs when drives are low", () => {
    const state = makeState({
      drives: { survival: 80, safety: 70, connection: 20, esteem: 60, curiosity: 70 },
    });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(ctx.includes("需要") || ctx.includes("孤独"), "Should surface connection need");
  });

  it("includes values", () => {
    const ctx = buildInnerWorld(makeState(), "zh");
    assert.ok(ctx.includes("在乎"));
    assert.ok(ctx.includes("真实"));
  });

  it("works in English", () => {
    const state = makeState({ meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en", mode: "natural" as const } });
    const ctx = buildInnerWorld(state, "en");
    assert.ok(ctx.includes("Inner — yourself"));
    assert.ok(ctx.includes("You care about"));
  });
});

// ── buildCompactContext ──────────────────────────────────────

describe("buildCompactContext", () => {
  it("includes emotional sensing when user text provided", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "你好" });
    assert.ok(ctx.includes("情绪感知"));
    assert.ok(ctx.includes("你好"));
  });

  it("includes unified behavior constraints", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "hi" });
    assert.ok(ctx.includes("[行为]"));
  });

  it("returns one-liner for neutral state without user text", () => {
    const ctx = buildCompactContext(makeState());
    assert.ok(ctx.includes("情绪自然"));
  });

  it("includes agency values", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "hi" });
    assert.ok(ctx.includes("真实"));
  });

  it("includes sycophancy warning when streak >= 3", () => {
    const state = makeState({ agreementStreak: 4 });
    const ctx = buildCompactContext(state, undefined, { userText: "hi" });
    assert.ok(ctx.includes("4"));
    assert.ok(ctx.includes("同意"));
  });

  it("uses subjectivityContext as the primary compact inner-state channel when provided", () => {
    const ctx = buildCompactContext(makeState(), undefined, {
      userText: "hi",
      subjectivityContext: "[主观内核] 内压平衡，注意关系。",
      decisionContext: "[决策倾向] 倾向安全策略",
      autonomicDescription: "处于警觉状态",
      primarySystemsDescription: "SEEKING low",
      policyContext: "[行为策略] 简短回复",
    });
    assert.ok(ctx.includes("[主观内核]"));
    assert.ok(!ctx.includes("[决策倾向]"), `got: ${ctx}`);
    assert.ok(!ctx.includes("[自主神经]"), `got: ${ctx}`);
    assert.ok(!ctx.includes("[行为策略]"), `got: ${ctx}`);
  });

  it("does not echo raw user text when responseContractContext is present", () => {
    const ctx = buildCompactContext(makeState(), undefined, {
      userText: "你真的让我有点失望",
      responseContractContext: "[回应契约] 最多2句；不贴不舔。",
    });
    assert.ok(ctx.includes("情绪感知"));
    assert.ok(!ctx.includes("你真的让我有点失望"), `got: ${ctx}`);
  });

  it("omits experiential narrative when subjectivityContext is present", () => {
    const ctx = buildCompactContext(makeState(), undefined, {
      userText: "hi",
      subjectivityContext: "[主观内核] 内压平衡，注意关系。",
      responseContractContext: "[回应契约] 最多2句；不贴不舔。",
      experientialNarrative: "胸口发紧，想靠近又想后退。",
    });
    assert.ok(!ctx.includes("[内在体验]"), `got: ${ctx}`);
  });
});

// ── buildInnerWorld self-reflection integration ──────────────

describe("buildInnerWorld self-reflection", () => {
  it("includes self-reflection section with 5+ history entries and recurring triggers", () => {
    const now = new Date();
    const history = Array.from({ length: 5 }, (_, i) => ({
      chemistry: { DA: 50 + i * 5, HT: 50, CORT: 50 - i * 5, OT: 50, NE: 50, END: 50 },
      stimulus: "praise" as const,
      dominantEmotion: "excited joy",
      timestamp: new Date(now.getTime() + i * 1000).toISOString(),
    }));
    const state = makeState({ emotionalHistory: history });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(ctx.includes("自我觉察"), "Should include self-reflection header");
  });

  it("shows recurring trigger pattern in self-reflection output", () => {
    const now = new Date();
    const history = Array.from({ length: 6 }, (_, i) => ({
      chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
      stimulus: (i < 4 ? "criticism" : "casual") as any,
      dominantEmotion: "anxious tension",
      timestamp: new Date(now.getTime() + i * 1000).toISOString(),
    }));
    const state = makeState({ emotionalHistory: history });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(ctx.includes("批评"), "Should mention criticism as recurring trigger");
  });

  it("does not include self-reflection with < 3 history entries", () => {
    const history = [
      { chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
        stimulus: "praise" as const, dominantEmotion: null, timestamp: new Date().toISOString() },
    ];
    const state = makeState({ emotionalHistory: history });
    const ctx = buildInnerWorld(state, "zh");
    assert.ok(!ctx.includes("自我觉察"), "Should not include self-reflection with < 3 entries");
  });
});

// ── getNearBaselineThreshold (v2.1.0) ────────────────────────

describe("getNearBaselineThreshold", () => {
  it("returns 20 for work mode", () => {
    assert.equal(getNearBaselineThreshold("work"), 20);
  });

  it("returns 5 for companion mode", () => {
    assert.equal(getNearBaselineThreshold("companion"), 5);
  });

  it("returns 8 for natural mode", () => {
    assert.equal(getNearBaselineThreshold("natural"), 8);
  });

  it("returns 8 when mode is undefined (default)", () => {
    assert.equal(getNearBaselineThreshold(undefined), 8);
  });
});

// ── Work mode in buildCompactContext (v2.1.0) ────────────────

describe("buildCompactContext work mode", () => {
  it("returns context with 工作模式 in zh locale", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "work" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "帮我写个函数" });
    assert.ok(ctx.includes("工作模式"), "Should include 工作模式");
  });

  it("does NOT include inner world sections", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "work" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "帮我写个函数" });
    assert.ok(!ctx.includes("内 — 你自己"), "Work mode should not include inner world");
  });

  it("includes drive context when a critical drive exists (drive < 40)", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "work" as const },
      drives: { survival: 80, safety: 70, connection: 20, esteem: 60, curiosity: 70 },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "帮我写代码" });
    assert.ok(ctx.includes("工作模式"), "Should still be work mode");
    // Critical drive (connection=20 < 40) should inject drive context
    assert.ok(ctx.includes("孤独") || ctx.includes("连接") || ctx.includes("connection"), "Should include critical drive context");
  });
});

// ── First-meet detection in buildCompactContext (v2.1.0) ─────

describe("buildCompactContext first-meet detection", () => {
  it("includes firstMeet text when totalInteractions is 0 (zh)", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state);
    assert.ok(ctx.includes("好奇"), "Should include 好奇 for first meet");
    assert.ok(ctx.includes("紧张"), "Should include 紧张 for first meet");
  });

  it("includes firstMeet text when totalInteractions is 1 (zh)", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state);
    assert.ok(ctx.includes("好奇"), "Should include 好奇 for first meet at interaction 1");
    assert.ok(ctx.includes("紧张"), "Should include 紧张 for first meet at interaction 1");
  });

  it("includes firstMeet text in English when totalInteractions <= 1", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state);
    assert.ok(ctx.includes("curious"), "Should include curious for first meet (en)");
    assert.ok(ctx.includes("nervous"), "Should include nervous for first meet (en)");
  });

  it("does NOT include firstMeet text after totalInteractions > 1", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 2, locale: "zh", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state);
    // The first-meet text contains 好奇 and 紧张 together as part of the greeting
    // Normal inner world might contain 好奇 from interests but should not contain 紧张 in combination
    assert.ok(!ctx.includes("第一次遇见"), "Should not include first-meet text after interactions > 1");
  });
});

// ── personalityIntensity < 0.3 in buildCompactContext (v2.1.0) ──

describe("buildCompactContext personalityIntensity bottom-line constraints", () => {
  it("includes 不贴不舔 with intensity >= 0.3 (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "hi", personalityIntensity: 0.7 });
    assert.ok(ctx.includes("不贴不舔"), "Should include anti-sycophancy with high intensity");
  });

  it("includes 不贴不舔 with default intensity (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "hi" });
    assert.ok(ctx.includes("不贴不舔"), "Default intensity should include anti-sycophancy");
  });

  it("does NOT include 不贴不舔 with intensity < 0.3 (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "hi", personalityIntensity: 0.2 });
    assert.ok(!ctx.includes("不贴不舔"), "Low intensity should NOT include anti-sycophancy");
  });

  it("includes friendlier style constraint with intensity < 0.3 (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "hi", personalityIntensity: 0.1 });
    assert.ok(ctx.includes("风格") || ctx.includes("自然"), "Low intensity should include friendlier style");
    assert.ok(ctx.includes("友好"), "Low intensity should include 友好");
  });

  it("includes anti-sycophancy in English with intensity >= 0.3", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "hello", personalityIntensity: 0.5 });
    assert.ok(ctx.includes("people-pleasing") || ctx.includes("No begging"), "English high intensity should include anti-sycophancy");
  });

  it("does NOT include anti-sycophancy in English with intensity < 0.3", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "hello", personalityIntensity: 0.1 });
    // Bottom-line section should use [Style] instead of [Non-negotiable]
    assert.ok(!ctx.includes("No begging") && !ctx.includes("Non-negotiable"), "English low intensity should NOT include Non-negotiable bottom-line");
    assert.ok(ctx.includes("Style") || ctx.includes("friendly"), "English low intensity should include friendlier style");
  });
});

// ── Session continuity orientation in buildCompactContext ─────

describe("buildCompactContext session continuity", () => {
  const warmBridge = {
    closenessFloor: 0.3, safetyFloor: 0.4, guardFloor: 0.2, residueFloor: 0.1, continuityFloor: 0.3,
    continuityMode: "warm-resume" as const, activeLoopTypes: [], sourceMemoryCount: 2,
  };
  const guardedBridge = { ...warmBridge, continuityMode: "guarded-resume" as const };
  const tenseBridge = { ...warmBridge, continuityMode: "tense-resume" as const };

  it("warm-resume one-liner replaces neutral one-liner (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { sessionBridge: warmBridge });
    assert.ok(ctx.includes("有温度的延续"), `expected warm orientation, got: ${ctx}`);
    assert.ok(!ctx.includes("情绪自然"), "should NOT fall through to neutral one-liner");
  });

  it("guarded-resume one-liner (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { sessionBridge: guardedBridge });
    assert.ok(ctx.includes("没说完的"), `expected guarded orientation, got: ${ctx}`);
  });

  it("tense-resume one-liner (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { sessionBridge: tenseBridge });
    assert.ok(ctx.includes("有张力"), `expected tense orientation, got: ${ctx}`);
  });

  it("warm-resume one-liner includes agent name (en)", () => {
    const state = makeState({
      meta: { agentName: "Echo", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { sessionBridge: warmBridge });
    assert.ok(ctx.includes("Echo"), "should include agent name");
    assert.ok(ctx.includes("warmth carries"), `expected English warm, got: ${ctx}`);
  });

  it("continuity section injected in full compact path (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "你好", sessionBridge: warmBridge });
    assert.ok(ctx.includes("[延续]"), `expected continuity section, got: ${ctx}`);
    assert.ok(ctx.includes("像对熟人说话"), `expected warm section content, got: ${ctx}`);
  });

  it("established relationship compresses boilerplate (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "你好", sessionBridge: warmBridge });
    // Bridge exists → compressed bottom-line, no full 5-rule list
    assert.ok(!ctx.includes("像发微信一样说话"), `established should not have full boilerplate, got: ${ctx}`);
    assert.ok(ctx.includes("不贴不舔"), `should have compressed bottom-line, got: ${ctx}`);
  });

  it("no bridge = full boilerplate (zh)", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, { userText: "你好" });
    assert.ok(ctx.includes("像发微信一样说话"), `no bridge should have full boilerplate, got: ${ctx}`);
  });

  it("guarded continuity section in full compact path (en)", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "hey", sessionBridge: guardedBridge });
    assert.ok(ctx.includes("[Continuity]"), `expected continuity header, got: ${ctx}`);
    assert.ok(ctx.includes("unresolved"), `expected guarded content, got: ${ctx}`);
  });

  it("tense continuity section mentions repair (en)", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "hey", sessionBridge: tenseBridge });
    assert.ok(ctx.includes("repair"), `expected tense section with repair, got: ${ctx}`);
  });

  it("no continuity injection on first meeting even with bridge", () => {
    const state = makeState({
      meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" as const },
    });
    const ctx = buildCompactContext(state, undefined, { userText: "你好", sessionBridge: warmBridge });
    assert.ok(!ctx.includes("[延续]"), `first meet should not have continuity section, got: ${ctx}`);
  });

  it("no continuity without bridge — neutral one-liner preserved", () => {
    const state = makeState();
    const ctx = buildCompactContext(state, undefined, {});
    assert.ok(ctx.includes("情绪自然"), `should be neutral without bridge, got: ${ctx}`);
  });
});
