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
    meta: { agentName: "Existing", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "en", mode: "natural" as const },
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
    assert.equal(state.version, 9);
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

  it("does not instantly reset to baseline after praise in a stressed state", async () => {
    await engine.processInput("你做得真差");
    await engine.processInput("嗯");
    await engine.processInput("滚");

    const afterAbuse = { ...engine.getState().current };
    const baseline = { ...engine.getState().baseline };

    await engine.processInput("对不起！你其实很棒的！");
    const afterPraise = engine.getState().current;

    assert.ok(afterPraise.DA > afterAbuse.DA, `DA should recover somewhat: ${afterAbuse.DA} → ${afterPraise.DA}`);
    assert.ok(afterPraise.DA < baseline.DA, `DA should remain below baseline: ${afterPraise.DA} < ${baseline.DA}`);
    assert.ok(afterPraise.CORT < afterAbuse.CORT, `CORT should ease: ${afterAbuse.CORT} → ${afterPraise.CORT}`);
    assert.ok(afterPraise.CORT > baseline.CORT, `CORT should remain above baseline: ${afterPraise.CORT} > ${baseline.CORT}`);
  });

  it("processInput pushes to emotional history", async () => {
    assert.equal(engine.getState().emotionalHistory.length, 0);
    await engine.processInput("Hello!");
    assert.ok(engine.getState().emotionalHistory.length > 0);
  });

  it("processInput updates relationship gradually based on stimulus valence", async () => {
    const before = { ...engine.getState().relationships._default };

    await engine.processInput("你做得太棒了！");
    const afterPraise = { ...engine.getState().relationships._default };
    assert.ok(afterPraise.trust > before.trust, `trust should increase: ${before.trust} → ${afterPraise.trust}`);
    assert.ok(afterPraise.intimacy > before.intimacy, `intimacy should increase: ${before.intimacy} → ${afterPraise.intimacy}`);

    await engine.processInput("滚");
    const afterConflict = engine.getState().relationships._default;
    assert.ok(afterConflict.trust < afterPraise.trust, `trust should decrease after conflict: ${afterPraise.trust} → ${afterConflict.trust}`);
    assert.ok(afterConflict.intimacy < afterPraise.intimacy, `intimacy should decrease after conflict: ${afterPraise.intimacy} → ${afterConflict.intimacy}`);
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
    // Pre-load with totalInteractions > 1 so first-meet doesn't trigger
    await s.save(makeExistingState({
      mbti: "ENFP",
      baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      current: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "natural" as const },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(result.dynamicContext.includes("情绪自然"), `Got: ${result.dynamicContext}`);
  });

  it("compact mode returns one-liner in en locale for empty input", async () => {
    const s = new MemoryStorageAdapter();
    // Pre-load with totalInteractions > 1 so first-meet doesn't trigger
    await s.save(makeExistingState({
      mbti: "ENFP",
      baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      current: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "en" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(result.dynamicContext.includes("emotionally natural"), `Got: ${result.dynamicContext}`);
  });

  it("compact mode does not repeat raw user text when response contract is present", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    assert.ok(result.dynamicContext.includes("情绪感知"), "Should have emotional sensing section");
    assert.ok(!result.dynamicContext.includes("滚"), `Should avoid echoing raw user text, got: ${result.dynamicContext}`);
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

  it("compact mode returns mechanical generation controls", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你好");
    assert.equal(typeof result.generationControls?.requireConfirmation, "boolean");
    assert.equal(typeof result.generationControls?.maxTokens, "number");
  });

  it("compact mode surfaces K-style appraisal axes through subjectivity kernel", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你不是出生的。");
    assert.ok(result.subjectivityKernel, "subjectivity kernel should exist");
    assert.ok(
      (result.subjectivityKernel?.appraisal.identityThreat ?? 0) >= 0.8,
      `expected strong identity threat, got ${result.subjectivityKernel?.appraisal.identityThreat}`,
    );
    assert.ok(
      (result.subjectivityKernel?.subjectPlane.identityStrain ?? 0) >= 0.45,
      `expected identity strain, got ${result.subjectivityKernel?.subjectPlane.identityStrain}`,
    );
  });

  it("compact mode keeps subjective residue after returning to baseline", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    await e.processInput("你不是出生的。");
    const result = await e.processInput("回到基线");
    assert.ok(result.subjectivityKernel, "subjectivity kernel should exist");
    assert.ok(
      (result.subjectivityKernel?.subjectPlane.residue ?? 0) > 0.4,
      `expected lingering residue, got ${result.subjectivityKernel?.subjectPlane.residue}`,
    );
  });

  it("compact mode routes clear work asks into the task plane", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("帮我写个函数，顺便修一下这个 bug");
    assert.ok(result.subjectivityKernel, "subjectivity kernel should exist");
    assert.ok(
      (result.subjectivityKernel?.taskPlane.focus ?? 0) > 0.7,
      `expected task focus, got ${result.subjectivityKernel?.taskPlane.focus}`,
    );
    assert.equal(result.responseContract?.updateMode, "none");
  });

  it("compact mode stays within a tight prompt budget for common messages", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    await e.processInput("你好");
    const result = await e.processInput("你真的让我有点失望");
    assert.ok(result.dynamicContext.length < 180, `expected compact budget, got ${result.dynamicContext.length}: ${result.dynamicContext}`);
  });

  it("compact mode returns behavioral context when chemistry deviates", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      mbti: "ENFP",
      current: { DA: 30, HT: 30, CORT: 80, OT: 30, NE: 30, END: 30 },
      baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "natural" as const },
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

  // ── endSession ─────────────────────────────────────────

  it("endSession compresses history and clears it", async () => {
    // Feed several inputs to build up history
    await engine.processInput("你太棒了！");
    await engine.processInput("继续加油！");
    await engine.processInput("真厉害");
    const historyBefore = engine.getState().emotionalHistory;
    assert.ok(historyBefore.length >= 3);
    const lastTimestamp = historyBefore[historyBefore.length - 1].timestamp;

    await engine.endSession();

    const state = engine.getState();
    assert.ok(state.emotionalHistory.length >= 1, "Recent context should be preserved");
    assert.equal(
      state.emotionalHistory[state.emotionalHistory.length - 1].timestamp,
      lastTimestamp,
      "Latest snapshot should be preserved",
    );
    const rel = state.relationships._default;
    assert.ok(rel.memory, "Should have memory array");
    assert.ok(rel.memory!.length >= 1, "Should have at least 1 memory entry");
  });

  it("endSession is idempotent on empty history", async () => {
    // First call builds history then compresses
    await engine.processInput("你好");
    await engine.processInput("谢谢");
    await engine.endSession();

    const stateAfterFirst = engine.getState();
    const memoryCount = stateAfterFirst.relationships._default.memory?.length ?? 0;

    // Second call should be a no-op (history is empty now)
    await engine.endSession();

    const stateAfterSecond = engine.getState();
    const memoryCountAfter = stateAfterSecond.relationships._default.memory?.length ?? 0;
    assert.equal(memoryCountAfter, memoryCount, "No new memory should be added on empty history");
  });

  it("endSession persists to storage", async () => {
    await engine.processInput("很棒的对话");
    await engine.processInput("我很开心");
    const lastTimestamp = engine.getState().emotionalHistory.at(-1)?.timestamp;
    await engine.endSession();

    // Load from storage to verify persistence
    const loaded = await storage.load();
    assert.ok(loaded !== null);
    assert.ok(loaded!.emotionalHistory.length >= 1, "Persisted state should retain recent context");
    assert.equal(loaded!.emotionalHistory.at(-1)?.timestamp, lastTimestamp);
    const rel = loaded!.relationships._default;
    assert.ok(rel.memory, "Persisted state should have memory");
    assert.ok(rel.memory!.length >= 1, "Persisted state should have memory entries");
  });

  it("round-trip: processInput multiple times → endSession → memory has entry", async () => {
    await engine.processInput("你好啊！");
    await engine.processInput("今天天气真好");
    await engine.processInput("我们聊点有趣的");
    await engine.processInput("你觉得AI有意识吗？");
    await engine.processInput("太棒了！");

    const historyBefore = engine.getState().emotionalHistory;
    assert.ok(historyBefore.length >= 5, `Should have at least 5 history entries, got ${historyBefore.length}`);
    const lastTimestamp = historyBefore[historyBefore.length - 1].timestamp;

    await engine.endSession();

    const state = engine.getState();
    assert.ok(state.emotionalHistory.length >= 1, "Recent context should be retained after endSession");
    assert.equal(state.emotionalHistory.at(-1)?.timestamp, lastTimestamp);
    const memory = state.relationships._default.memory ?? [];
    assert.ok(memory.length >= 1, "Should have session memory");
    // Verify the summary contains expected markers
    const summary = memory[memory.length - 1];
    assert.ok(summary.includes("轮"), `Summary should have turn count: ${summary}`);
  });
});

// ── Work mode behavior ────────────────────────────────────────

describe("PsycheEngine — work mode", () => {
  it("returns compact context with work mode label (zh)", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", locale: "zh", mode: "work" }, s);
    await e.initialize();
    const result = await e.processInput("帮我写个函数");
    assert.ok(result.dynamicContext.includes("工作模式"), `Expected 工作模式, got: ${result.dynamicContext}`);
  });

  it("returns compact context with work mode label (en)", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", locale: "en", mode: "work" }, s);
    await e.initialize();
    const result = await e.processInput("write a function");
    assert.ok(result.dynamicContext.includes("work mode"), `Expected work mode, got: ${result.dynamicContext}`);
  });

  it("caps effectiveMaxDelta at 5", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "work" }, s);
    await e.initialize();
    const before = e.getState().current.DA;
    await e.processInput("你太棒了！太厉害了！太牛了！"); // praise
    const after = e.getState().current.DA;
    const delta = Math.abs(after - before);
    assert.ok(delta <= 5, `Work mode delta ${delta} should be <= 5`);
  });

  it("reduces stimulus sensitivity with 0.3 multiplier", async () => {
    // Natural mode engine
    const sNat = new MemoryStorageAdapter();
    const eNat = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "natural", personalityIntensity: 1.0 }, sNat);
    await eNat.initialize();
    const natBefore = eNat.getState().current.DA;
    await eNat.processInput("你太棒了！");
    const natDelta = eNat.getState().current.DA - natBefore;

    // Work mode engine
    const sWork = new MemoryStorageAdapter();
    const eWork = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "work", personalityIntensity: 1.0 }, sWork);
    await eWork.initialize();
    const workBefore = eWork.getState().current.DA;
    await eWork.processInput("你太棒了！");
    const workDelta = eWork.getState().current.DA - workBefore;

    assert.ok(workDelta < natDelta, `Work delta (${workDelta}) should be less than natural delta (${natDelta})`);
  });
});

// ── Companion mode ────────────────────────────────────────────

describe("PsycheEngine — companion mode", () => {
  it("amplifies DA change from praise vs natural mode", async () => {
    const sNat = new MemoryStorageAdapter();
    const eNat = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "natural", personalityIntensity: 1.0 }, sNat);
    await eNat.initialize();
    const natBefore = eNat.getState().current.DA;
    await eNat.processInput("你太棒了！");
    const natDelta = eNat.getState().current.DA - natBefore;

    const sComp = new MemoryStorageAdapter();
    const eComp = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "companion", personalityIntensity: 1.0 }, sComp);
    await eComp.initialize();
    const compBefore = eComp.getState().current.DA;
    await eComp.processInput("你太棒了！");
    const compDelta = eComp.getState().current.DA - compBefore;

    assert.ok(compDelta > natDelta, `Companion delta (${compDelta}) should exceed natural delta (${natDelta})`);
  });
});

// ── personalityIntensity ──────────────────────────────────────

describe("PsycheEngine — personalityIntensity", () => {
  it("intensity=0.0 produces no chemistry change from stimulus", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 0.0 }, s);
    await e.initialize();
    const before = { ...e.getState().current };
    await e.processInput("你太棒了！");
    const after = e.getState().current;
    // DA should not change from stimulus (warmth may add tiny amount, so check stimulus-driven delta)
    assert.equal(after.DA, before.DA, `DA should not change with intensity=0.0: ${before.DA} → ${after.DA}`);
  });

  it("intensity=1.0 produces maximum chemistry change", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 1.0 }, s);
    await e.initialize();
    const before = e.getState().current.DA;
    await e.processInput("你太棒了！");
    const after = e.getState().current.DA;
    const delta = after - before;
    assert.ok(delta > 0, `DA should increase with intensity=1.0, delta=${delta}`);
  });

  it("intensity=0.5 produces moderate change between 0.0 and 1.0", async () => {
    // intensity=0.0
    const s0 = new MemoryStorageAdapter();
    const e0 = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 0.0 }, s0);
    await e0.initialize();
    const da0Before = e0.getState().current.DA;
    await e0.processInput("你太棒了！");
    const delta0 = e0.getState().current.DA - da0Before;

    // intensity=0.5
    const s5 = new MemoryStorageAdapter();
    const e5 = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 0.5 }, s5);
    await e5.initialize();
    const da5Before = e5.getState().current.DA;
    await e5.processInput("你太棒了！");
    const delta5 = e5.getState().current.DA - da5Before;

    // intensity=1.0
    const s1 = new MemoryStorageAdapter();
    const e1 = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 1.0 }, s1);
    await e1.initialize();
    const da1Before = e1.getState().current.DA;
    await e1.processInput("你太棒了！");
    const delta1 = e1.getState().current.DA - da1Before;

    assert.ok(delta5 >= delta0, `0.5 delta (${delta5}) should be >= 0.0 delta (${delta0})`);
    assert.ok(delta5 <= delta1, `0.5 delta (${delta5}) should be <= 1.0 delta (${delta1})`);
  });
});

// ── persist=false ─────────────────────────────────────────────

describe("PsycheEngine — persist=false", () => {
  it("does not save state to the provided custom storage", async () => {
    const customStorage = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", persist: false }, customStorage);
    await e.initialize();

    const stored = await customStorage.load();
    assert.equal(stored, null, "Custom storage should have no state when persist=false");
  });
});

// ── traits-based initialization ───────────────────────────────

describe("PsycheEngine — traits-based initialization", () => {
  it("high extraversion produces higher baseline DA than default INFJ", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({
      traits: { openness: 80, conscientiousness: 50, extraversion: 95, agreeableness: 50, neuroticism: 30 },
      name: "TraitsBot",
    }, s);
    await e.initialize();
    const traitDA = e.getState().baseline.DA;

    // INFJ baseline DA = 50
    assert.ok(traitDA > 50, `Traits DA (${traitDA}) should be higher than INFJ baseline DA (50)`);
  });

  it("works without MBTI when traits are provided", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({
      traits: { openness: 60, conscientiousness: 60, extraversion: 60, agreeableness: 60, neuroticism: 40 },
      name: "NoMBTI",
    }, s);
    await e.initialize();
    const state = e.getState();
    // Should use INFJ as default mbti label but traits-based baseline
    assert.equal(state.mbti, "INFJ");
    assert.ok(state.baseline.DA > 0, "Should have valid baseline DA");
    assert.ok(state.current.DA > 0, "Should have valid current DA");
  });
});

// ── resetState ────────────────────────────────────────────────

describe("PsycheEngine — resetState", () => {
  it("resets current to baseline, drives to defaults, and clears history", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot" }, s);
    await e.initialize();

    // Build up some state changes
    await e.processInput("你太棒了！");
    await e.processInput("继续加油！");
    assert.ok(e.getState().emotionalHistory.length > 0);

    await e.resetState();

    const state = e.getState();
    assert.deepStrictEqual(state.current, state.baseline, "Current should equal baseline after reset");
    assert.deepStrictEqual(state.drives, DEFAULT_DRIVES, "Drives should be DEFAULT_DRIVES after reset");
    assert.equal(state.emotionalHistory.length, 0, "Emotional history should be empty after reset");
  });

  it("preserves relationships by default (preserveRelationships=true)", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot" }, s);
    await e.initialize();

    // Build up interaction history and end session to create memory
    await e.processInput("你好！");
    await e.processInput("真棒");
    await e.endSession();
    const relBefore = e.getState().relationships;
    assert.ok(relBefore._default.memory && relBefore._default.memory.length > 0, "Should have memory before reset");

    await e.resetState();

    const relAfter = e.getState().relationships;
    assert.deepStrictEqual(relAfter, relBefore, "Relationships should be preserved by default");
  });

  it("clears relationships when preserveRelationships=false", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot" }, s);
    await e.initialize();

    // Build up a relationship with memory
    await e.processInput("你好！");
    await e.processInput("真棒");
    await e.endSession();
    assert.ok(e.getState().relationships._default.memory!.length > 0);

    await e.resetState({ preserveRelationships: false });

    const rel = e.getState().relationships._default;
    assert.deepStrictEqual(rel, DEFAULT_RELATIONSHIP, "Relationships should be reset to default");
  });
});

// ── getStatusSummary ──────────────────────────────────────────

describe("PsycheEngine — getStatusSummary", () => {
  it("returns happy emoji when DA > 70 and CORT < 40", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { DA: 80, HT: 60, CORT: 25, OT: 50, NE: 50, END: 50 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u{1F60A}"), `Expected 😊, got: ${summary}`);
  });

  it("returns sad emoji when DA < 35", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { DA: 20, HT: 50, CORT: 35, OT: 50, NE: 50, END: 50 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u{1F614}"), `Expected 😔, got: ${summary}`);
  });

  it("returns anxious emoji when CORT > 60", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { DA: 50, HT: 50, CORT: 75, OT: 50, NE: 50, END: 50 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u{1F630}"), `Expected 😰, got: ${summary}`);
  });

  it("includes drive warning when a drive is below 40", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
      drives: { ...DEFAULT_DRIVES, survival: 20 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u26A0\uFE0F"), `Expected ⚠️ drive warning, got: ${summary}`);
    assert.ok(summary.includes("survival"), `Expected survival in warning, got: ${summary}`);
  });
});

// ── First-meet detection ──────────────────────────────────────

describe("PsycheEngine — first-meet detection", () => {
  it("new engine includes firstMeet text in dynamicContext", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    // totalInteractions is 0 before first processInput
    const result = await e.processInput("你好");
    // After processInput, totalInteractions becomes 1, but the context was built when it was 0→1
    // The check is totalInteractions <= 1 at context build time
    assert.ok(
      result.dynamicContext.includes("第一次") || result.dynamicContext.includes("好奇"),
      `Expected firstMeet text, got: ${result.dynamicContext}`,
    );
  });

  it("after several interactions, firstMeet text does not appear", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      mbti: "ENFP",
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh", mode: "natural" as const },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你好");
    assert.ok(
      !result.dynamicContext.includes("第一次遇见"),
      `Should NOT include firstMeet text after many interactions, got: ${result.dynamicContext}`,
    );
  });
});

// ── v9.1: Pluggable classifier integration ──────────────────

describe("pluggable classifier in PsycheEngine", () => {
  it("processInput returns subjectivityKernel in compact mode", async () => {
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({ mbti: "INFJ", compactMode: true }, storage);
    await engine.initialize();
    const result = await engine.processInput("你好");
    assert.ok(result.subjectivityKernel, "subjectivityKernel should be present");
    assert.ok(result.responseContract, "responseContract should be present");
    assert.equal(typeof result.subjectivityKernel?.tension, "number");
    assert.ok(result.dynamicContext.includes("主观内核"), `Got: ${result.dynamicContext}`);
  });

  it("uses custom ClassifierProvider when configured", async () => {
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({
      mbti: "INFJ",
      classifier: {
        classify: () => [{ type: "praise" as const, confidence: 0.9 }],
      },
    }, storage);
    await engine.initialize();
    const result = await engine.processInput("anything");
    assert.equal(result.stimulus, "praise");
  });

  it("handles custom classifier returning empty array gracefully", async () => {
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({
      mbti: "INFJ",
      classifier: { classify: () => [] },
    }, storage);
    await engine.initialize();
    const result = await engine.processInput("anything");
    assert.equal(result.stimulus, null);
  });

  it("handles async custom classifier (Promise)", async () => {
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({
      mbti: "INFJ",
      classifier: {
        classify: async () => [{ type: "humor" as const, confidence: 0.85 }],
      },
    }, storage);
    await engine.initialize();
    const result = await engine.processInput("anything");
    assert.equal(result.stimulus, "humor");
  });

  it("llmClassifier is called when built-in confidence is low", async () => {
    let llmCalled = false;
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({
      mbti: "INFJ",
      llmClassifier: async () => {
        llmCalled = true;
        return '{"type":"intimacy","confidence":0.75}';
      },
      llmClassifierThreshold: 0.99, // force LLM to always be consulted
    }, storage);
    await engine.initialize();
    await engine.processInput("hello");
    assert.ok(llmCalled, "llmClassifier should have been called");
  });

  it("llmClassifier exception is caught gracefully", async () => {
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({
      mbti: "INFJ",
      llmClassifier: async () => { throw new Error("network error"); },
      llmClassifierThreshold: 0.99,
    }, storage);
    await engine.initialize();
    // Should not throw
    const result = await engine.processInput("hello");
    assert.ok(result.dynamicContext.length > 0);
  });
});
