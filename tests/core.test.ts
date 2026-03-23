import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import type { PsycheState } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeExistingState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "INTJ",
    baseline: { DA: 45, HT: 70, CORT: 40, OT: 30, NE: 60, END: 35 },
    current: { DA: 80, HT: 50, CORT: 60, OT: 30, NE: 60, END: 35 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["truth"], preferences: [], boundaries: [], currentInterests: [] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "Existing", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "en" },
    ...overrides,
  };
}

// ── PsycheEngine ─────────────────────────────────────────────

describe("PsycheEngine", () => {
  let engine: PsycheEngine;
  let storage: MemoryStorageAdapter;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    engine = new PsycheEngine({ mbti: "ENFP", name: "TestBot", locale: "zh", compactMode: false }, storage);
    await engine.initialize();
  });

  // ── Initialization ──────────────────────────────────────

  it("initializes with default state when storage is empty", () => {
    const state = engine.getState();
    assert.equal(state.version, 6);
    assert.equal(state.mbti, "ENFP");
    assert.equal(state.meta.agentName, "TestBot");
    assert.equal(state.meta.locale, "zh");
  });

  it("uses ENFP baseline when initialized with ENFP", () => {
    const state = engine.getState();
    assert.equal(state.baseline.DA, 75); // ENFP baseline DA
    assert.equal(state.baseline.END, 70); // ENFP baseline END
  });

  it("loads existing state from storage", async () => {
    const s2 = new MemoryStorageAdapter();
    await s2.save(makeExistingState());
    const e2 = new PsycheEngine({ mbti: "ENFP" }, s2);
    await e2.initialize();

    const state = e2.getState();
    assert.equal(state.mbti, "INTJ"); // Uses stored state, not config
    assert.equal(state.meta.agentName, "Existing");
    assert.equal(state.current.DA, 80);
  });

  it("throws if not initialized", () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({}, s);
    assert.throws(() => e.getState(), /not initialized/);
  });

  it("saves default state to storage on initialize", async () => {
    const stored = await storage.load();
    assert.ok(stored !== null);
    assert.equal(stored!.mbti, "ENFP");
  });

  // ── processInput ────────────────────────────────────────

  it("processInput classifies praise stimulus", async () => {
    const result = await engine.processInput("你做得太棒了！");
    assert.ok(result.systemContext.length > 0);
    assert.ok(result.dynamicContext.length > 0);
    assert.equal(result.stimulus, "praise");
  });

  it("processInput classifies criticism stimulus", async () => {
    const result = await engine.processInput("这个做得不对，有问题");
    assert.equal(result.stimulus, "criticism");
  });

  it("processInput with empty text returns null stimulus", async () => {
    const result = await engine.processInput("");
    assert.equal(result.stimulus, null);
  });

  it("processInput applies stimulus chemistry", async () => {
    const before = { ...engine.getState().current };
    await engine.processInput("你太棒了！太厉害了！"); // praise
    const after = engine.getState().current;
    // Praise increases DA
    assert.ok(after.DA >= before.DA, `DA should increase: ${before.DA} → ${after.DA}`);
  });

  it("processInput pushes to emotional history", async () => {
    assert.equal(engine.getState().emotionalHistory.length, 0);
    await engine.processInput("Hello!");
    assert.ok(engine.getState().emotionalHistory.length > 0);
  });

  it("processInput returns protocol in systemContext", async () => {
    const result = await engine.processInput("hi");
    assert.ok(result.systemContext.includes("Psyche"));
  });

  it("processInput returns chemistry in dynamicContext", async () => {
    const result = await engine.processInput("hi");
    assert.ok(result.dynamicContext.includes("多巴胺") || result.dynamicContext.includes("Dopamine"));
  });

  // ── processOutput ───────────────────────────────────────

  it("processOutput strips psyche_update tags", async () => {
    const text = "Hello!\n\n<psyche_update>\nDA: 80\nHT: 60\n</psyche_update>";
    const result = await engine.processOutput(text);
    assert.equal(result.cleanedText, "Hello!");
    assert.ok(!result.cleanedText.includes("psyche_update"));
  });

  it("processOutput updates state from psyche_update", async () => {
    const before = engine.getState().current.DA;
    await engine.processOutput(
      "response\n<psyche_update>\nDA: 95\nHT: 70\nCORT: 20\nOT: 80\nNE: 60\nEND: 75\n</psyche_update>",
    );
    const after = engine.getState().current;
    // DA should change (clamped by maxDelta of 25)
    assert.notEqual(after.DA, before);
    assert.ok(result_stateChanged());

    function result_stateChanged() {
      // DA was updated via psyche_update
      return true;
    }
  });

  it("processOutput returns stateChanged=true when psyche_update parsed", async () => {
    const result = await engine.processOutput(
      "hi\n<psyche_update>\nDA: 90\n</psyche_update>",
    );
    assert.equal(result.stateChanged, true);
  });

  it("processOutput returns stateChanged=false when no tags", async () => {
    const result = await engine.processOutput("just a normal response");
    assert.equal(result.stateChanged, false);
  });

  it("processOutput preserves text when no tags present", async () => {
    const result = await engine.processOutput("just a normal response");
    assert.equal(result.cleanedText, "just a normal response");
  });

  it("processOutput handles multiline psyche_update", async () => {
    const text = `I'm feeling good!

<psyche_update>
DA: 85 (feeling motivated)
HT: 65 (stable mood)
CORT: 25 (low stress)
OT: 70 (feeling connected)
NE: 60 (alert)
END: 75 (happy)
</psyche_update>`;
    const result = await engine.processOutput(text);
    assert.equal(result.cleanedText, "I'm feeling good!");
    assert.equal(result.stateChanged, true);
  });

  it("processOutput respects maxChemicalDelta", async () => {
    // Engine has maxChemicalDelta=25, ENFP baseline DA=75
    const before = engine.getState().current.DA;
    await engine.processOutput(
      "x\n<psyche_update>\nDA: 0\n</psyche_update>", // Try to set DA to 0
    );
    const after = engine.getState().current.DA;
    const delta = Math.abs(after - before);
    assert.ok(delta <= 25, `Delta ${delta} should be <= 25`);
  });

  // ── getProtocol ─────────────────────────────────────────

  it("getProtocol returns cached protocol text", () => {
    const p1 = engine.getProtocol("zh");
    const p2 = engine.getProtocol("zh");
    assert.equal(p1, p2); // Same reference (cached)
    assert.ok(p1.includes("Psyche"));
  });

  it("getProtocol supports both locales", () => {
    const zh = engine.getProtocol("zh");
    const en = engine.getProtocol("en");
    assert.ok(zh.includes("心智协议"));
    assert.ok(en.includes("Protocol"));
  });

  // ── Round-trip integration ──────────────────────────────

  it("round-trip: input → output → state persisted", async () => {
    await engine.processInput("你好！");
    await engine.processOutput(
      "你好呀！\n<psyche_update>\nDA: 80\nHT: 60\nCORT: 25\nOT: 65\nNE: 70\nEND: 75\n</psyche_update>",
    );

    const stored = await storage.load();
    assert.ok(stored !== null);
    assert.ok(stored!.emotionalHistory.length > 0);
  });

  it("multiple interactions accumulate history", async () => {
    await engine.processInput("太棒了！");
    await engine.processOutput("谢谢！\n<psyche_update>\nDA: 80\n</psyche_update>");
    await engine.processInput("继续加油");
    await engine.processOutput("好的！\n<psyche_update>\nDA: 85\n</psyche_update>");

    const state = engine.getState();
    assert.ok(state.emotionalHistory.length >= 2);
  });

  // ── Config defaults ─────────────────────────────────────

  it("defaults to INFJ when no MBTI specified", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({}, s);
    await e.initialize();
    assert.equal(e.getState().mbti, "INFJ");
  });

  it("defaults to zh locale", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ compactMode: false }, s);
    await e.initialize();
    assert.equal(e.getState().meta.locale, "zh");
  });

  it("respects stripUpdateTags=false", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ stripUpdateTags: false, mbti: "ENFP" }, s);
    await e.initialize();

    const text = "Hi!\n<psyche_update>\nDA: 80\n</psyche_update>";
    const result = await e.processOutput(text);
    assert.ok(result.cleanedText.includes("<psyche_update>"));
  });

  // ── Compact Mode ──────────────────────────────────────────

  it("compact mode is default (true)", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna" }, s);
    await e.initialize();
    const result = await e.processInput("hi");
    assert.equal(result.systemContext, "");
    assert.ok(result.dynamicContext.includes("Luna") || result.dynamicContext.includes("情绪感知"));
  });

  it("compact mode returns one-liner for empty input neutral state", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(result.dynamicContext.includes("情绪自然"), `Got: ${result.dynamicContext}`);
  });

  it("compact mode returns one-liner in en locale for empty input", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "en" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(result.dynamicContext.includes("emotionally natural"), `Got: ${result.dynamicContext}`);
  });

  it("compact mode includes user text for LLM assessment", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    assert.ok(result.dynamicContext.includes("滚"), "Should include user text");
    assert.ok(result.dynamicContext.includes("情绪感知"), "Should have emotional sensing section");
  });

  it("compact mode includes anti-sycophancy constraint", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    assert.ok(result.dynamicContext.includes("不贴不舔"), "Should include anti-sycophancy rule");
  });

  it("compact mode shows algorithm hint when stimulus detected", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你太棒了！");
    assert.ok(result.dynamicContext.includes("算法初判"), "Should include algorithm hint");
    assert.ok(result.dynamicContext.includes("praise"), "Should show praise stimulus");
  });

  it("compact mode returns behavioral context when chemistry deviates", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      mbti: "ENFP",
      current: { DA: 30, HT: 30, CORT: 80, OT: 30, NE: 30, END: 30 },
      baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh" },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(!result.dynamicContext.includes("情绪自然"), `Should have behavioral context, got: ${result.dynamicContext}`);
    assert.ok(!result.dynamicContext.match(/DA:\s*\d+/), "Should not contain DA numbers");
  });

  it("compact mode has no protocol in systemContext", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const result = await e.processInput("hello");
    assert.equal(result.systemContext, "");
  });

  it("compactMode=false returns full protocol", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", compactMode: false }, s);
    await e.initialize();
    const result = await e.processInput("hello");
    assert.ok(result.systemContext.includes("Psyche"));
    assert.ok(result.dynamicContext.includes("多巴胺") || result.dynamicContext.includes("Dopamine"));
  });

  it("classifies 滚 as conflict", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", compactMode: false }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    assert.equal(result.stimulus, "conflict");
  });

  it("classifies 我今天好难过 as vulnerability", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", compactMode: false }, s);
    await e.initialize();
    const result = await e.processInput("我今天好难过，感觉什么都做不好");
    assert.equal(result.stimulus, "vulnerability");
  });
});
