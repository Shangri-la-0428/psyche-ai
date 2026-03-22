import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDynamicContext, buildProtocolContext, buildInnerWorld, buildCompactContext, computeUserInvestment } from "../src/prompt.js";
import type { PsycheState, ChemicalSnapshot } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES } from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 3,
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
    meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh" },
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

// ── buildInnerWorld ──────────────────────────────────────────

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
    const state = makeState({ meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en" } });
    const ctx = buildInnerWorld(state, "en");
    assert.ok(ctx.includes("Inner — yourself"));
    assert.ok(ctx.includes("You care about"));
  });
});

// ── buildCompactContext outer/inner structure ─────────────────

describe("buildCompactContext outer/inner structure", () => {
  it("has outer section when user text provided", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "你好" });
    assert.ok(ctx.includes("外 — 对方"));
    assert.ok(ctx.includes("你好"));
  });

  it("always has inner section", () => {
    const ctx = buildCompactContext(makeState());
    assert.ok(ctx.includes("内 — 你自己"));
  });

  it("inner section present even without user input", () => {
    const ctx = buildCompactContext(makeState(), undefined, {});
    assert.ok(ctx.includes("内 — 你自己"));
    assert.ok(!ctx.includes("外 — 对方"), "No outer without user text");
  });

  it("includes bottom-line constraints", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "hi" });
    assert.ok(ctx.includes("底线"));
  });

  it("includes relationship memory when available", () => {
    const state = makeState();
    state.relationships._default.memory = ["3月20日(5轮): 刺激[casual×3] 趋势[OT↑]"];
    const ctx = buildCompactContext(state);
    assert.ok(ctx.includes("记忆") || ctx.includes("Memory"));
    assert.ok(ctx.includes("3月20日"));
  });
});
