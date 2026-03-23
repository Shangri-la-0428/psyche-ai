import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getChannelProfile, buildChannelModifier, createCustomChannel,
} from "../src/channels.js";
import type { ChannelType, ChannelProfile } from "../src/channels.js";
import { buildCompactContext } from "../src/prompt.js";
import type { PsycheState } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE } from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 4,
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
    meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh" },
    ...overrides,
  };
}

// ── Built-in Channel Profiles ────────────────────────────────

describe("getChannelProfile", () => {
  const ALL_CHANNELS: ChannelType[] = ["discord", "slack", "feishu", "terminal", "web", "api", "custom"];

  it("returns a profile for every built-in channel type", () => {
    for (const ch of ALL_CHANNELS) {
      const profile = getChannelProfile(ch);
      assert.equal(profile.type, ch);
      assert.equal(typeof profile.allowEmoji, "boolean");
      assert.equal(typeof profile.allowKaomoji, "boolean");
      assert.ok(["casual", "neutral", "formal"].includes(profile.formalityLevel));
      assert.ok(Array.isArray(profile.expressionHints));
    }
  });

  it("discord: casual, emoji+kaomoji allowed", () => {
    const p = getChannelProfile("discord");
    assert.equal(p.formalityLevel, "casual");
    assert.equal(p.allowEmoji, true);
    assert.equal(p.allowKaomoji, true);
  });

  it("slack: neutral, emoji allowed, no kaomoji", () => {
    const p = getChannelProfile("slack");
    assert.equal(p.formalityLevel, "neutral");
    assert.equal(p.allowEmoji, true);
    assert.equal(p.allowKaomoji, false);
  });

  it("feishu: formal, no emoji, no kaomoji", () => {
    const p = getChannelProfile("feishu");
    assert.equal(p.formalityLevel, "formal");
    assert.equal(p.allowEmoji, false);
    assert.equal(p.allowKaomoji, false);
  });

  it("terminal: neutral, no emoji, has maxResponseLength", () => {
    const p = getChannelProfile("terminal");
    assert.equal(p.formalityLevel, "neutral");
    assert.equal(p.allowEmoji, false);
    assert.equal(p.allowKaomoji, false);
    assert.ok(typeof p.maxResponseLength === "number" && p.maxResponseLength > 0);
  });

  it("web: neutral, emoji allowed", () => {
    const p = getChannelProfile("web");
    assert.equal(p.formalityLevel, "neutral");
    assert.equal(p.allowEmoji, true);
  });

  it("api: neutral, no emoji, structured", () => {
    const p = getChannelProfile("api");
    assert.equal(p.formalityLevel, "neutral");
    assert.equal(p.allowEmoji, false);
    assert.equal(p.allowKaomoji, false);
  });

  it("custom: neutral defaults", () => {
    const p = getChannelProfile("custom");
    assert.equal(p.formalityLevel, "neutral");
    assert.equal(p.allowEmoji, false);
  });

  it("returns a copy, not a reference", () => {
    const p1 = getChannelProfile("discord");
    const p2 = getChannelProfile("discord");
    p1.expressionHints.push("mutated");
    assert.ok(!p2.expressionHints.includes("mutated"));
  });
});

// ── buildChannelModifier ─────────────────────────────────────

describe("buildChannelModifier", () => {
  it("generates Chinese modifier for discord", () => {
    const p = getChannelProfile("discord");
    const mod = buildChannelModifier(p, "zh");
    assert.ok(mod.includes("表达风格"));
    assert.ok(mod.includes("discord"));
    assert.ok(mod.includes("emoji"));
    assert.ok(mod.includes("颜文字"));
    assert.ok(mod.includes("轻松活泼"));
  });

  it("generates English modifier for discord", () => {
    const p = getChannelProfile("discord");
    const mod = buildChannelModifier(p, "en");
    assert.ok(mod.includes("Expression Style"));
    assert.ok(mod.includes("discord"));
    assert.ok(mod.includes("Emoji"));
    assert.ok(mod.includes("kaomoji"));
    assert.ok(mod.includes("casual and lively"));
  });

  it("feishu zh: formal, no emoji", () => {
    const p = getChannelProfile("feishu");
    const mod = buildChannelModifier(p, "zh");
    assert.ok(mod.includes("feishu"));
    assert.ok(mod.includes("正式专业"));
    assert.ok(mod.includes("不使用"));
  });

  it("feishu en: formal, no emoji", () => {
    const p = getChannelProfile("feishu");
    const mod = buildChannelModifier(p, "en");
    assert.ok(mod.includes("feishu"));
    assert.ok(mod.includes("formal and professional"));
    assert.ok(mod.includes("No emoji"));
  });

  it("terminal includes maxResponseLength hint in zh", () => {
    const p = getChannelProfile("terminal");
    const mod = buildChannelModifier(p, "zh");
    assert.ok(mod.includes("500"));
    assert.ok(mod.includes("字以内"));
  });

  it("terminal includes maxResponseLength hint in en", () => {
    const p = getChannelProfile("terminal");
    const mod = buildChannelModifier(p, "en");
    assert.ok(mod.includes("500"));
    assert.ok(mod.includes("chars"));
  });

  it("slack zh: emoji allowed, no kaomoji", () => {
    const p = getChannelProfile("slack");
    const mod = buildChannelModifier(p, "zh");
    assert.ok(mod.includes("slack"));
    assert.ok(mod.includes("emoji"));
    assert.ok(mod.includes("不用颜文字"));
  });

  it("slack en: emoji allowed, no kaomoji", () => {
    const p = getChannelProfile("slack");
    const mod = buildChannelModifier(p, "en");
    assert.ok(mod.includes("slack"));
    assert.ok(mod.includes("Emoji allowed"));
    assert.ok(mod.includes("no kaomoji"));
  });

  it("web en: emoji allowed, neutral", () => {
    const p = getChannelProfile("web");
    const mod = buildChannelModifier(p, "en");
    assert.ok(mod.includes("web"));
    assert.ok(mod.includes("Emoji allowed"));
    assert.ok(mod.includes("natural and balanced"));
  });

  it("api en: no emoji, neutral", () => {
    const p = getChannelProfile("api");
    const mod = buildChannelModifier(p, "en");
    assert.ok(mod.includes("api"));
    assert.ok(mod.includes("No emoji"));
    assert.ok(mod.includes("natural and balanced"));
  });

  it("modifier is concise (single line)", () => {
    for (const ch of ["discord", "slack", "feishu", "terminal", "web", "api"] as ChannelType[]) {
      const p = getChannelProfile(ch);
      const mod = buildChannelModifier(p, "zh");
      const lines = mod.split("\n");
      assert.ok(lines.length <= 4, `${ch} zh modifier should be 1-4 lines, got ${lines.length}`);
      const modEn = buildChannelModifier(p, "en");
      const linesEn = modEn.split("\n");
      assert.ok(linesEn.length <= 4, `${ch} en modifier should be 1-4 lines, got ${linesEn.length}`);
    }
  });
});

// ── createCustomChannel ──────────────────────────────────────

describe("createCustomChannel", () => {
  it("returns custom type even if base overrides attempted", () => {
    const custom = createCustomChannel({ type: "custom" });
    assert.equal(custom.type, "custom");
  });

  it("overrides allowEmoji", () => {
    const custom = createCustomChannel({ type: "custom", allowEmoji: true });
    assert.equal(custom.allowEmoji, true);
  });

  it("overrides formalityLevel", () => {
    const custom = createCustomChannel({ type: "custom", formalityLevel: "formal" });
    assert.equal(custom.formalityLevel, "formal");
  });

  it("overrides maxResponseLength", () => {
    const custom = createCustomChannel({ type: "custom", maxResponseLength: 1000 });
    assert.equal(custom.maxResponseLength, 1000);
  });

  it("overrides expressionHints", () => {
    const custom = createCustomChannel({ type: "custom", expressionHints: ["Be nice"] });
    assert.deepStrictEqual(custom.expressionHints, ["Be nice"]);
  });

  it("keeps default expressionHints when not overridden", () => {
    const custom = createCustomChannel({ type: "custom", allowEmoji: true });
    assert.ok(Array.isArray(custom.expressionHints));
  });

  it("overrides allowKaomoji", () => {
    const custom = createCustomChannel({ type: "custom", allowKaomoji: true });
    assert.equal(custom.allowKaomoji, true);
  });

  it("builds valid modifier from custom channel", () => {
    const custom = createCustomChannel({
      type: "custom",
      allowEmoji: true,
      allowKaomoji: true,
      formalityLevel: "casual",
    });
    const mod = buildChannelModifier(custom, "zh");
    assert.ok(mod.includes("custom"));
    assert.ok(mod.includes("emoji"));
    assert.ok(mod.includes("颜文字"));
    assert.ok(mod.includes("轻松活泼"));
  });
});

// ── Channel modifier in buildCompactContext ───────────────────

describe("buildCompactContext with channelType", () => {
  it("does not include channel modifier when channelType is not set", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "hi" });
    assert.ok(!ctx.includes("表达风格"));
    assert.ok(!ctx.includes("Expression Style"));
  });

  it("includes channel modifier when channelType is set (zh)", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "hi", channelType: "discord" });
    assert.ok(ctx.includes("表达风格"));
    assert.ok(ctx.includes("discord"));
  });

  it("includes channel modifier when channelType is set (en)", () => {
    const state = makeState({ meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en" } });
    const ctx = buildCompactContext(state, undefined, { userText: "hello", channelType: "slack" });
    assert.ok(ctx.includes("Expression Style"));
    assert.ok(ctx.includes("slack"));
  });

  it("channel modifier appears before empathy report", () => {
    const ctx = buildCompactContext(makeState(), undefined, { userText: "hi", channelType: "terminal" });
    const channelIdx = ctx.indexOf("表达风格");
    const empathyIdx = ctx.indexOf("psyche_update");
    assert.ok(channelIdx >= 0, "should have channel modifier");
    assert.ok(empathyIdx >= 0, "should have empathy report");
    assert.ok(channelIdx < empathyIdx, "channel modifier should appear before empathy report");
  });

  it("channel modifier appears after memory when memory exists", () => {
    const state = makeState();
    state.relationships._default.memory = ["session1: good chat"];
    const ctx = buildCompactContext(state, undefined, { userText: "hi", channelType: "web" });
    const memoryIdx = ctx.indexOf("记忆");
    const channelIdx = ctx.indexOf("表达风格");
    assert.ok(memoryIdx >= 0, "should have memory section");
    assert.ok(channelIdx >= 0, "should have channel modifier");
    assert.ok(memoryIdx < channelIdx, "memory should appear before channel modifier");
  });
});
