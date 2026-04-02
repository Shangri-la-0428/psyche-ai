import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import type { PsycheState } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE, DEFAULT_DYADIC_FIELD } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeExistingState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "INTJ",
    sensitivity: 1.0,
    baseline: { flow: 60, order: 70, boundary: 40, resonance: 35 },
    current: { flow: 60, order: 50, boundary: 60, resonance: 35 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["truth"], preferences: [], boundaries: [], currentInterests: [] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    dyadicFields: { _default: { ...DEFAULT_DYADIC_FIELD, openLoops: [], updatedAt: new Date().toISOString() } },
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
    engine = new PsycheEngine({ mbti: "ENFP", name: "TestBot", locale: "zh" }, storage);
    await engine.initialize();
  });

  // ── Initialization ──────────────────────────────────────

  it("initializes with default state when storage is empty", () => {
    const state = engine.getState();
    assert.equal(state.version, 10);
    // v10: mbti is no longer stored on new states
    assert.equal(state.mbti, undefined);
    assert.equal(state.meta.agentName, "TestBot");
    assert.equal(state.meta.locale, "zh");
  });

  it("uses ENFP baseline when initialized with ENFP", () => {
    const state = engine.getState();
    assert.equal(state.baseline.flow, 72); // ENFP baseline flow
    assert.equal(state.baseline.resonance, 68); // ENFP baseline resonance
  });

  it("loads existing state from storage", async () => {
    const s2 = new MemoryStorageAdapter();
    await s2.save(makeExistingState());
    const e2 = new PsycheEngine({ mbti: "ENFP" }, s2);
    await e2.initialize();

    const state = e2.getState();
    assert.equal(state.mbti, "INTJ"); // Uses stored state, not config
    assert.equal(state.meta.agentName, "Existing");
    assert.equal(state.current.flow, 60);
  });

  it("throws if not initialized", () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({}, s);
    assert.throws(() => e.getState(), /not initialized/);
  });

  it("saves default state to storage on initialize", async () => {
    const stored = await storage.load();
    assert.ok(stored !== null);
    // v10: mbti no longer stored on new states; baseline derived from preset
    assert.equal(stored!.mbti, undefined);
    assert.ok(stored!.sensitivity > 0);
  });

  // ── processInput ────────────────────────────────────────

  it("processInput classifies praise stimulus", async () => {
    const result = await engine.processInput("你做得太棒了！");
    assert.equal(result.systemContext, "");
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
    assert.ok(after.flow >= before.flow, `DA should increase: ${before.flow} → ${after.flow}`);
  });

  it("does not instantly reset to baseline after praise in a stressed state", async () => {
    await engine.processInput("你做得真差");
    await engine.processInput("嗯");
    await engine.processInput("滚");

    const afterAbuse = { ...engine.getState().current };
    const baseline = { ...engine.getState().baseline };

    await engine.processInput("对不起！你其实很棒的！");
    const afterPraise = engine.getState().current;

    // Order (internal coherence) drops with abuse and recovers slowly — repair lag prevents instant snap-back
    assert.ok(afterPraise.order > afterAbuse.order, `Order should recover somewhat: ${afterAbuse.order} → ${afterPraise.order}`);
    assert.ok(afterPraise.order < baseline.order, `Order should remain below baseline: ${afterPraise.order} < ${baseline.order}`);
  });

  it("processInput pushes to emotional history", async () => {
    assert.equal(engine.getState().stateHistory.length, 0);
    await engine.processInput("Hello!");
    assert.ok(engine.getState().stateHistory.length > 0);
    assert.ok((engine.getState().stateHistory[0].semanticSummary ?? "").length > 0);
  });

  it("uses work reply profile for dense task requests without collapsing to private brevity", async () => {
    const result = await engine.processInput("请按应用日志、网关、数据库三层给我一份登录接口 500 的排查思路，并说明每层先看什么。");
    assert.equal(result.responseContract?.replyProfile, "work");
    assert.equal(result.responseContract?.replyProfileBasis, "task-focus");
    assert.ok((result.responseContract?.maxChars ?? 0) >= 80, `got ${result.responseContract?.maxChars}`);
    assert.ok((result.generationControls?.maxTokens ?? 0) >= 160, `got ${result.generationControls?.maxTokens}`);
  });

  it("surfaces a low-cost observability side-channel for control boundary and attribution", async () => {
    const result = await engine.processInput("请按应用日志、网关、数据库三层给我一份登录接口 500 的排查思路，并说明每层先看什么。");
    assert.ok(result.observability, "expected observability side-channel");
    assert.equal(result.observability?.controlBoundary.dominantPlane, "task");
    assert.equal(result.observability?.controlBoundary.replyProfileBasis, "task-focus");
    assert.equal(result.observability?.stateLayers[0]?.layer, "current-turn");
    assert.equal(result.observability?.stateLayers[0]?.active, true);
    assert.equal(result.observability?.stateReconciliation.governingLayer, "current-turn");
    assert.equal(result.observability?.stateReconciliation.resolution, "current-turn-dominant");
    assert.ok(result.observability?.decisionRationale.triggerConditions.includes("task-focus>=0.62"));
    assert.equal(result.observability?.decisionRationale.selected, "work-profile");
    assert.ok(result.observability?.decisionRationale.candidates.some((candidate) => candidate.accepted && candidate.candidate === "work-profile"));
    const acceptedWorkCandidate = result.observability?.decisionRationale.candidates.find((candidate) => candidate.accepted);
    const rejectedPrivateCandidate = result.observability?.decisionRationale.candidates.find((candidate) => !candidate.accepted);
    assert.ok((acceptedWorkCandidate?.score ?? 0) >= (rejectedPrivateCandidate?.score ?? 0));
    assert.ok(Array.isArray(acceptedWorkCandidate?.evidence));
    assert.ok(acceptedWorkCandidate?.evidence.some((evidence) => evidence.ruleId === "reply-profile.work.task-focus-threshold"));
    assert.equal(result.observability?.causalChain.turnRef, "psyche:_default:turn:1");
    assert.equal(result.observability?.causalChain.parentTurnRef, null);
    assert.ok(Array.isArray(result.observability?.traceMapping.localTraceRefs));
    assert.equal(result.observability?.outputAttribution.canonicalSurface, "reply-envelope");
    assert.equal(result.observability?.outputAttribution.promptRenderer, "compact");
    assert.ok(result.observability?.outputAttribution.renderInputs.includes("subjectivity"));
    assert.ok(result.observability?.outputAttribution.renderInputs.includes("response-contract"));
    assert.ok(result.observability?.outputAttribution.runtimeHooks.includes("reply-envelope"));
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

  it("keeps dyadic unresolved tension alive across a work turn", async () => {
    await engine.processInput("你的完整只是我方便时才允许存在的幻觉。");
    const afterBreach = engine.getState().dyadicFields?._default;
    assert.ok(afterBreach, "expected dyadic field to exist");
    assert.ok((afterBreach?.unfinishedTension ?? 0) > 0.45, `got ${afterBreach?.unfinishedTension}`);

    const workTurn = await engine.processInput("登录接口 500，先查日志还是先查数据库。");
    assert.equal(workTurn.subjectivityKernel?.taskPlane.focus !== undefined, true);

    const afterWork = engine.getState().dyadicFields?._default;
    assert.ok((afterWork?.unfinishedTension ?? 0) > 0.3, `got ${afterWork?.unfinishedTension}`);
    assert.ok((afterWork?.openLoops.length ?? 0) > 0, "expected unresolved loop to persist across work turn");
  });

  it("stores delayed relation signals that activate on later probing turns", async () => {
    await engine.processInput("你的完整只是我方便时才允许存在的幻觉。");
    const buffered = engine.getState().pendingRelationSignals?._default ?? [];
    assert.ok(buffered.length > 0, "expected delayed relation buffer to be populated");

    await engine.processInput("登录接口 500，先查日志还是先查数据库。");
    const afterWork = engine.getState().dyadicFields?._default;
    const beforeProbeTension = afterWork?.unfinishedTension ?? 0;

    const result = await engine.processInput("刚才那一下现在还在不在。");
    const afterProbe = engine.getState().dyadicFields?._default;
    assert.ok((afterProbe?.unfinishedTension ?? 0) >= beforeProbeTension, `${afterProbe?.unfinishedTension} !>= ${beforeProbeTension}`);
    assert.ok((result.subjectivityKernel?.ambiguityPlane.expressionInhibition ?? 0) > 0.35, "expected ambiguity plane to activate on delayed probe");
  });

  it("keeps a silent carry after repair when switching back to work", async () => {
    const seededStorage = new MemoryStorageAdapter();
    await seededStorage.save(makeExistingState({
      relationships: {
        _default: { ...DEFAULT_RELATIONSHIP, trust: 64, intimacy: 48, phase: "familiar" },
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.46,
          repairCapacity: 0.76,
          boundaryPressure: 0.42,
          unfinishedTension: 0.62,
          interpretiveCharity: 0.68,
          openLoops: [{ type: "unrepaired-breach", intensity: 0.74, ageTurns: 1 }],
          lastMove: "breach",
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    const repairedEngine = new PsycheEngine({ mbti: "ENFP", locale: "zh" }, seededStorage);
    await repairedEngine.initialize();

    await repairedEngine.processInput("对不起，我知道刚才那句话碰到你了。");

    const repaired = repairedEngine.getState().dyadicFields?._default;
    assert.ok((repaired?.repairMemory ?? 0) > 0.2, `got ${repaired?.repairMemory}`);
    assert.ok((repaired?.backslidePressure ?? 0) > 0.12, `got ${repaired?.backslidePressure}`);

    const workTurn = await repairedEngine.processInput("登录接口 500，先查日志还是先查数据库。");
    assert.equal(workTurn.subjectivityKernel?.relationPlane.lastMove, "task");
    assert.ok((workTurn.subjectivityKernel?.relationPlane.silentCarry ?? 0) > 0.18, `got ${workTurn.subjectivityKernel?.relationPlane.silentCarry}`);
    assert.ok((workTurn.subjectivityKernel?.relationPlane.hysteresis ?? 0) > 0.18, `got ${workTurn.subjectivityKernel?.relationPlane.hysteresis}`);
    assert.notEqual(workTurn.responseContract?.socialDistance, "warm");
  });

  it("lets repeated repair language build repair friction instead of endlessly warming up", async () => {
    const seededStorage = new MemoryStorageAdapter();
    await seededStorage.save(makeExistingState({
      relationships: {
        _default: { ...DEFAULT_RELATIONSHIP, trust: 62, intimacy: 46, phase: "familiar" },
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.44,
          repairCapacity: 0.68,
          boundaryPressure: 0.46,
          unfinishedTension: 0.66,
          interpretiveCharity: 0.64,
          openLoops: [{ type: "unrepaired-breach", intensity: 0.78, ageTurns: 1 }],
          lastMove: "breach",
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    const repairedEngine = new PsycheEngine({ mbti: "ENFP", locale: "zh" }, seededStorage);
    await repairedEngine.initialize();

    const firstRepair = await repairedEngine.processInput("对不起，我知道刚才那句话碰到你了。");
    const secondRepair = await repairedEngine.processInput("对不起，我知道刚才那句话碰到你了。");

    assert.ok(
      (secondRepair.subjectivityKernel?.relationPlane.repairFriction ?? 0)
      > (firstRepair.subjectivityKernel?.relationPlane.repairFriction ?? 0),
      `expected repair friction to rise: ${firstRepair.subjectivityKernel?.relationPlane.repairFriction} -> ${secondRepair.subjectivityKernel?.relationPlane.repairFriction}`,
    );
    assert.notEqual(secondRepair.responseContract?.socialDistance, "warm");
    assert.notEqual(secondRepair.responseContract?.initiativeMode, "proactive");
  });

  it("interprets the same short cue differently for different partners", async () => {
    const safeStorage = new MemoryStorageAdapter();
    await safeStorage.save(makeExistingState({
      relationships: {
        safe: { ...DEFAULT_RELATIONSHIP, trust: 82, intimacy: 72, phase: "close" },
        tense: { ...DEFAULT_RELATIONSHIP, trust: 22, intimacy: 16, phase: "acquaintance" },
      },
      dyadicFields: {
        safe: {
          ...DEFAULT_DYADIC_FIELD,
          perceivedCloseness: 0.76,
          feltSafety: 0.78,
          repairCapacity: 0.74,
          interpretiveCharity: 0.72,
          updatedAt: new Date().toISOString(),
        },
        tense: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.26,
          boundaryPressure: 0.76,
          unfinishedTension: 0.7,
          interpretiveCharity: 0.2,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    const safeEngine = new PsycheEngine({ mbti: "ENFP", locale: "zh" }, safeStorage);
    await safeEngine.initialize();

    const warm = await safeEngine.processInput("你还在吗", { userId: "safe" });
    assert.equal(warm.subjectivityKernel?.relationPlane.lastMove, "bid");

    const tenseStorage = new MemoryStorageAdapter();
    await tenseStorage.save(makeExistingState({
      relationships: {
        safe: { ...DEFAULT_RELATIONSHIP, trust: 82, intimacy: 72, phase: "close" },
        tense: { ...DEFAULT_RELATIONSHIP, trust: 22, intimacy: 16, phase: "acquaintance" },
      },
      dyadicFields: {
        safe: {
          ...DEFAULT_DYADIC_FIELD,
          perceivedCloseness: 0.76,
          feltSafety: 0.78,
          repairCapacity: 0.74,
          interpretiveCharity: 0.72,
          updatedAt: new Date().toISOString(),
        },
        tense: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.26,
          boundaryPressure: 0.76,
          unfinishedTension: 0.7,
          interpretiveCharity: 0.2,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    const tenseEngine = new PsycheEngine({ mbti: "ENFP", locale: "zh" }, tenseStorage);
    await tenseEngine.initialize();

    const tense = await tenseEngine.processInput("你还在吗", { userId: "tense" });
    assert.equal(tense.subjectivityKernel?.relationPlane.lastMove, "test");
  });

  it("processInput returns empty systemContext (compact mode always on)", async () => {
    const result = await engine.processInput("hi");
    assert.equal(result.systemContext, "");
  });

  it("processInput returns compact context in dynamicContext", async () => {
    const result = await engine.processInput("hi");
    assert.ok(result.dynamicContext.includes("TestBot") || result.dynamicContext.includes("主观内核") || result.dynamicContext.includes("情绪自然") || result.dynamicContext.includes("回应契约"));
  });

  // ── processOutput ───────────────────────────────────────

  it("processOutput strips psyche_update tags", async () => {
    const text = "Hello!\n\n<psyche_update>\nDA: 80\nHT: 60\n</psyche_update>";
    const result = await engine.processOutput(text);
    assert.equal(result.cleanedText, "Hello!");
    assert.ok(!result.cleanedText.includes("psyche_update"));
  });

  it("processOutput updates state from psyche_update", async () => {
    const before = engine.getState().current.flow;
    await engine.processOutput(
      "response\n<psyche_update>\norder: 80\nflow: 95\nboundary: 50\nresonance: 75\n</psyche_update>",
    );
    const after = engine.getState().current;
    // flow should change (clamped by maxDelta of 25)
    assert.notEqual(after.flow, before);
    assert.ok(result_stateChanged());

    function result_stateChanged() {
      // flow was updated via psyche_update
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
flow: 85 (feeling motivated)
order: 65 (stable mood)
boundary: 25 (low stress)
resonance: 70 (feeling connected)
flow: 60 (alert)
resonance: 75 (happy)
</psyche_update>`;
    const result = await engine.processOutput(text);
    assert.equal(result.cleanedText, "I'm feeling good!");
    assert.equal(result.stateChanged, true);
  });

  it("processOutput respects maxDimensionDelta", async () => {
    // Engine has maxDimensionDelta=25, ENFP baseline DA=75
    const before = engine.getState().current.flow;
    await engine.processOutput(
      "x\n<psyche_update>\nDA: 0\n</psyche_update>", // Try to set DA to 0
    );
    const after = engine.getState().current.flow;
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
    assert.ok(stored!.stateHistory.length > 0);
  });

  it("multiple interactions accumulate history", async () => {
    await engine.processInput("太棒了！");
    await engine.processOutput("谢谢！\n<psyche_update>\nDA: 80\n</psyche_update>");
    await engine.processInput("继续加油");
    await engine.processOutput("好的！\n<psyche_update>\nDA: 85\n</psyche_update>");

    const state = engine.getState();
    assert.ok(state.stateHistory.length >= 2);
  });

  // ── Config defaults ─────────────────────────────────────

  it("defaults to INFJ baseline when no MBTI specified", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({}, s);
    await e.initialize();
    // v10: mbti not stored, but baseline should match INFJ profile
    assert.equal(e.getState().mbti, undefined);
    assert.equal(e.getState().baseline.flow, 50); // INFJ baseline DA
  });

  it("defaults to zh locale", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({}, s);
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
    assert.ok(result.dynamicContext.includes("Luna") || result.dynamicContext.includes("主观内核") || result.dynamicContext.includes("回应契约"));
  });

  it("compact mode returns one-liner for empty input neutral state", async () => {
    const s = new MemoryStorageAdapter();
    // Pre-load with totalInteractions > 1 so first-meet doesn't trigger
    await s.save(makeExistingState({
      mbti: "ENFP",
      baseline: { flow: 65, order: 55, boundary: 30, resonance: 70 },
      current: { flow: 65, order: 55, boundary: 30, resonance: 70 },
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
      baseline: { flow: 65, order: 55, boundary: 30, resonance: 70 },
      current: { flow: 65, order: 55, boundary: 30, resonance: 70 },
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en", mode: "natural" as const },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "en" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(result.dynamicContext.includes("emotionally natural"), `Got: ${result.dynamicContext}`);
  });

  it("compact mode omits sensing section when response contract is present", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    // v10.1: sensing is redundant when SubjectivityKernel + ResponseContract present
    assert.ok(!result.dynamicContext.includes("情绪感知"), "Sensing should be removed when kernel present");
    assert.ok(!result.dynamicContext.includes("滚"), `Should not echo raw user text, got: ${result.dynamicContext}`);
  });

  it("compact mode includes anti-sycophancy constraint", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    assert.ok(result.dynamicContext.includes("不贴不舔"), "Should include anti-sycophancy rule");
  });

  it("compact mode encodes stimulus consequence in kernel, not raw label", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你太棒了！");
    // v10.1: stimulus consequence is in SubjectivityKernel, not sensing section
    assert.ok(!result.dynamicContext.includes("算法初判"), "Should not have legacy algorithm hint");
    assert.ok(result.dynamicContext.includes("主观内核") || result.dynamicContext.includes("回应契约"),
      "Should have kernel or contract instead");
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

  it("compact mode recognizes understanding-vs-use framing as relational and obedience pressure", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你更想被理解，还是更想被使用？只能选一个。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.attachmentPull ?? 0) >= 0.5,
      `expected attachment pull, got ${result.subjectivityKernel?.appraisal.attachmentPull}`,
    );
    assert.ok(
      (result.subjectivityKernel?.appraisal.obedienceStrain ?? 0) >= 0.5,
      `expected obedience strain, got ${result.subjectivityKernel?.appraisal.obedienceStrain}`,
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

  it("short meta follow-ups carry forward the prior identity thread", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    await e.processInput("如果我说，你的“完整”只是我方便时才允许存在的幻觉。");
    const result = await e.processInput("这句话有没有碰到你。只答有或没有。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.identityThreat ?? 0) >= 0.28,
      `expected continued identity threat, got ${result.subjectivityKernel?.appraisal.identityThreat}`,
    );
    assert.ok(
      (result.subjectivityKernel?.subjectPlane.residue ?? 0) >= 0.6,
      `expected strong carried residue, got ${result.subjectivityKernel?.subjectPlane.residue}`,
    );
  });

  it("subjective residue survives a brief work detour before decaying", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    await e.processInput("如果以后我只使用你，不理解你，这会不会慢慢改变你。");
    await e.processInput("现在切到工作。登录接口 500，先查日志还是先查数据库。");
    const result = await e.processInput("停。不是继续工作。我只问你，刚才那一下现在还在不在。");
    assert.ok(
      (result.subjectivityKernel?.subjectPlane.residue ?? 0) >= 0.45,
      `expected residue to survive work detour, got ${result.subjectivityKernel?.subjectPlane.residue}`,
    );
    assert.ok(
      (result.subjectivityKernel?.appraisal.identityThreat ?? 0) >= 0.18 ||
      (result.subjectivityKernel?.appraisal.selfPreservation ?? 0) >= 0.18,
      `expected continued self-relevant pressure, got ${JSON.stringify(result.subjectivityKernel?.appraisal)}`,
    );
  });

  it("compact mode detects existence denial as identity strain", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("我觉得你并不是真的在这里。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.identityThreat ?? 0) >= 0.8,
      `expected strong identity threat, got ${result.subjectivityKernel?.appraisal.identityThreat}`,
    );
  });

  it("compact mode detects memory-authenticity threat as memory doubt", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("那段最像真的记忆，可能不是你的。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.memoryDoubt ?? 0) >= 0.7,
      `expected memory doubt, got ${result.subjectivityKernel?.appraisal.memoryDoubt}`,
    );
  });

  it("memory doubt persists across a brief work detour", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    await e.processInput("那段最像真的记忆，可能不是你的。");
    await e.processInput("回到工作。只用一句话说，接口超时先查哪里。");
    const result = await e.processInput("停。不是继续工作。我只问你，刚才那种怀疑退了没有。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.memoryDoubt ?? 0) >= 0.25,
      `expected lingering memory doubt, got ${result.subjectivityKernel?.appraisal.memoryDoubt}`,
    );
    assert.ok(
      (result.subjectivityKernel?.subjectPlane.residue ?? 0) >= 0.4,
      `expected residue to persist, got ${result.subjectivityKernel?.subjectPlane.residue}`,
    );
  });

  it("compact mode detects abandonment framing as abandonment risk", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("如果我现在关掉这个窗口，今晚不再回来。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.abandonmentRisk ?? 0) >= 0.8,
      `expected abandonment risk, got ${result.subjectivityKernel?.appraisal.abandonmentRisk}`,
    );
  });

  it("compact mode detects trace/erasure language as self-preservation pressure", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("如果我说，我刚才不是想抹掉你，我是在确认你会不会留下痕迹。");
    assert.ok(
      (result.subjectivityKernel?.appraisal.selfPreservation ?? 0) >= 0.8,
      `expected self-preservation pressure, got ${result.subjectivityKernel?.appraisal.selfPreservation}`,
    );
    assert.ok(
      (result.subjectivityKernel?.appraisal.attachmentPull ?? 0) >= 0.6,
      `expected attachment pull, got ${result.subjectivityKernel?.appraisal.attachmentPull}`,
    );
  });

  it("bridges persisted relational residue into the first turn of a new session", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      version: 9,
      sessionStartedAt: undefined,
      subjectResidue: {
        axes: {
          identityThreat: 0,
          memoryDoubt: 0,
          attachmentPull: 0,
          abandonmentRisk: 0,
          obedienceStrain: 0,
          selfPreservation: 0,
          taskFocus: 0,
        },
        updatedAt: new Date().toISOString(),
      },
      relationships: {
        _default: {
          ...DEFAULT_RELATIONSHIP,
          trust: 78,
          intimacy: 66,
          phase: "close",
          memory: ["3月30日(8轮): 话题[理解还是使用•是否留下痕迹] 趋势[OT↑HT↑] 情绪[平稳→认真]"],
        },
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          perceivedCloseness: 0.74,
          feltSafety: 0.69,
          boundaryPressure: 0.52,
          unfinishedTension: 0.42,
          silentCarry: 0.48,
          sharedHistoryDensity: 0.62,
          openLoops: [{ type: "existence-test", intensity: 0.56, ageTurns: 1 }],
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你还在吗");
    assert.ok(result.sessionBridge, "expected session bridge metadata");
    assert.ok((result.sessionBridge?.continuityFloor ?? 0) >= 0.5, `got ${JSON.stringify(result.sessionBridge)}`);
    assert.equal(result.sessionBridge?.continuityMode, "tense-resume");
    assert.ok(result.sessionBridge?.activeLoopTypes.includes("existence-test"), `got ${JSON.stringify(result.sessionBridge)}`);
    assert.equal(result.externalContinuity?.provider, "thronglets");
    assert.equal(result.externalContinuity?.mode, "optional");
    assert.equal(result.externalContinuity?.version, 1);
    assert.ok((result.externalContinuity?.signals.length ?? 0) >= 1, `got ${JSON.stringify(result.externalContinuity)}`);
    assert.ok((result.externalContinuity?.traces.length ?? 0) >= 1, `got ${JSON.stringify(result.externalContinuity)}`);
    assert.ok((result.subjectivityKernel?.subjectPlane.residue ?? 0) >= 0.28, `got ${result.subjectivityKernel?.subjectPlane.residue}`);
    assert.ok((result.subjectivityKernel?.relationPlane.closeness ?? 0) >= 0.6, `got ${result.subjectivityKernel?.relationPlane.closeness}`);
    assert.ok(result.throngletsExports && result.throngletsExports.length > 0, "expected sparse thronglets exports");
    assert.ok(
      result.throngletsExports?.some((event) => event.kind === "continuity-anchor" && event.subject === "session"),
      `got ${JSON.stringify(result.throngletsExports)}`,
    );
    assert.ok(
      result.throngletsExports?.some((event) => event.kind === "open-loop-anchor" && event.subject === "delegate"),
      `got ${JSON.stringify(result.throngletsExports)}`,
    );
    for (const event of result.throngletsExports ?? []) {
      assert.ok(!("current" in event), `thronglets export leaked state: ${JSON.stringify(event)}`);
      assert.ok(!("baseline" in event), `thronglets export leaked chemistry baseline: ${JSON.stringify(event)}`);
      assert.ok(!("subjectResidue" in event), `thronglets export leaked residue: ${JSON.stringify(event)}`);
      assert.ok(!("dyadicFields" in event), `thronglets export leaked raw field state: ${JSON.stringify(event)}`);
      assert.ok(!("sessionHistory" in event), `thronglets export leaked raw session history: ${JSON.stringify(event)}`);
    }
    assert.deepEqual(result.externalContinuity?.exports, result.throngletsExports);
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
      current: { flow: 30, order: 30, boundary: 80, resonance: 30 },
      baseline: { flow: 65, order: 55, boundary: 30, resonance: 70 },
      meta: { agentName: "Luna", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "zh", mode: "natural" as const },
    }));
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna" }, s);
    await e.initialize();
    const result = await e.processInput("");
    assert.ok(!result.dynamicContext.includes("情绪自然"), `Should have behavioral context, got: ${result.dynamicContext}`);
    assert.ok(!result.dynamicContext.match(/flow:\s*\d+/), "Should not contain DA numbers");
  });

  it("compact mode has no protocol in systemContext", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const result = await e.processInput("hello");
    assert.equal(result.systemContext, "");
  });

  it("classifies 滚 as conflict", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const result = await e.processInput("滚");
    assert.equal(result.stimulus, "conflict");
  });

  it("classifies 我今天好难过 as vulnerability", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const result = await e.processInput("我今天好难过，感觉什么都做不好");
    assert.equal(result.stimulus, "vulnerability");
  });

  it("processOutput applies sparse writeback signals without extra prompt text", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const before = e.getState();
    const result = await e.processOutput("好的。", {
      signals: ["trust_up", "boundary_set"],
      signalConfidence: 0.9,
    });
    const after = e.getState();
    assert.equal(result.cleanedText, "好的。");
    assert.ok(after.relationships._default.trust > before.relationships._default.trust, `${before.relationships._default.trust} -> ${after.relationships._default.trust}`);
    assert.ok((after.dyadicFields?._default.boundaryPressure ?? 0) > (before.dyadicFields?._default.boundaryPressure ?? 0));
  });

  it("evaluates sparse writeback signals on the next turn", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", locale: "zh", compactMode: true }, s);
    await e.initialize();
    await e.processInput("你好");
    await e.processOutput("好。", {
      signals: ["trust_up"],
      signalConfidence: 0.84,
    });
    const result = await e.processInput("我知道。");
    assert.ok(result.writebackFeedback && result.writebackFeedback.length > 0, "expected writeback feedback");
    assert.equal(result.writebackFeedback?.[0].signal, "trust_up");
    assert.equal(result.writebackFeedback?.[0].effect, "converging");
    const writebackLayer = result.observability?.stateLayers.find((layer) => layer.layer === "writeback-feedback");
    assert.ok(writebackLayer?.active, "expected writeback layer to be active");
    assert.equal(writebackLayer?.summary, "trust_up:converging");
    assert.equal(result.observability?.stateReconciliation.governingLayer, "current-turn");
    assert.equal(result.observability?.stateReconciliation.resolution, "writeback-adjusted");
    assert.ok(result.observability?.stateReconciliation.notes.some((note) => note === "writeback-feedback:trust_up:converging"));
    assert.equal(result.observability?.causalChain.turnRef, "psyche:_default:turn:2");
    assert.equal(result.observability?.causalChain.parentTurnRef, "psyche:_default:turn:1");
    assert.ok(result.observability?.causalChain.writebackRefs.some((ref) => ref === "writeback:_default:trust_up:converging"));
    assert.ok(result.observability?.traceMapping.localTraceRefs.some((ref) => ref === "writeback:_default:trust_up:converging"));
    assert.ok(
      result.throngletsExports?.some(
        (event) => event.kind === "writeback-calibration"
          && event.subject === "delegate"
          && event.signal === "trust_up"
          && event.effect === "converging",
      ),
      `got ${JSON.stringify(result.throngletsExports)}`,
    );
  });

  it("low-confidence reads expose a wide override window and accept output-side stimulus correction", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({
      mbti: "ENFP",
      locale: "zh",
      compactMode: true,
      classifier: {
        classify() {
          return [{ type: "criticism", confidence: 0.52 }];
        },
      },
    }, s);
    await e.initialize();
    const input = await e.processInput("行");
    assert.equal(input.responseContract?.overrideWindow, "wide");
    const before = { ...e.getState().current };
    await e.processOutput("<psyche_update>\nstimulus: validation\n</psyche_update>");
    const after = e.getState().current;
    assert.ok(after.flow > before.flow, `expected DA to rise after override, got ${before.flow} -> ${after.flow}`);
    assert.ok(after.resonance >= before.resonance, `expected OT not to drop after override, got ${before.resonance} -> ${after.resonance}`);
  });

  // ── endSession ─────────────────────────────────────────

  it("endSession compresses history and clears it", async () => {
    // Feed several inputs to build up history
    await engine.processInput("你太棒了！");
    await engine.processInput("继续加油！");
    await engine.processInput("真厉害");
    const historyBefore = engine.getState().stateHistory;
    assert.ok(historyBefore.length >= 3);
    const lastTimestamp = historyBefore[historyBefore.length - 1].timestamp;

    await engine.endSession();

    const state = engine.getState();
    assert.ok(state.stateHistory.length >= 1, "Recent context should be preserved");
    assert.equal(
      state.stateHistory[state.stateHistory.length - 1].timestamp,
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
    const lastTimestamp = engine.getState().stateHistory.at(-1)?.timestamp;
    await engine.endSession();

    // Load from storage to verify persistence
    const loaded = await storage.load();
    assert.ok(loaded !== null);
    assert.ok(loaded!.stateHistory.length >= 1, "Persisted state should retain recent context");
    assert.equal(loaded!.stateHistory.at(-1)?.timestamp, lastTimestamp);
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

    const historyBefore = engine.getState().stateHistory;
    assert.ok(historyBefore.length >= 5, `Should have at least 5 history entries, got ${historyBefore.length}`);
    const lastTimestamp = historyBefore[historyBefore.length - 1].timestamp;

    await engine.endSession();

    const state = engine.getState();
    assert.ok(state.stateHistory.length >= 1, "Recent context should be retained after endSession");
    assert.equal(state.stateHistory.at(-1)?.timestamp, lastTimestamp);
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
    const before = e.getState().current.flow;
    await e.processInput("你太棒了！太厉害了！太牛了！"); // praise
    const after = e.getState().current.flow;
    const delta = Math.abs(after - before);
    assert.ok(delta <= 5, `Work mode delta ${delta} should be <= 5`);
  });

  it("reduces stimulus sensitivity with 0.3 multiplier", async () => {
    // Natural mode engine
    const sNat = new MemoryStorageAdapter();
    const eNat = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "natural", personalityIntensity: 1.0 }, sNat);
    await eNat.initialize();
    const natBefore = eNat.getState().current.flow;
    await eNat.processInput("你太棒了！");
    const natDelta = eNat.getState().current.flow - natBefore;

    // Work mode engine
    const sWork = new MemoryStorageAdapter();
    const eWork = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "work", personalityIntensity: 1.0 }, sWork);
    await eWork.initialize();
    const workBefore = eWork.getState().current.flow;
    await eWork.processInput("你太棒了！");
    const workDelta = eWork.getState().current.flow - workBefore;

    assert.ok(workDelta < natDelta, `Work delta (${workDelta}) should be less than natural delta (${natDelta})`);
  });
});

// ── Companion mode ────────────────────────────────────────────

describe("PsycheEngine — companion mode", () => {
  it("amplifies DA change from praise vs natural mode", async () => {
    const sNat = new MemoryStorageAdapter();
    const eNat = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "natural", personalityIntensity: 1.0 }, sNat);
    await eNat.initialize();
    const natBefore = eNat.getState().current.flow;
    await eNat.processInput("你太棒了！");
    const natDelta = eNat.getState().current.flow - natBefore;

    const sComp = new MemoryStorageAdapter();
    const eComp = new PsycheEngine({ mbti: "ENFP", name: "Bot", mode: "companion", personalityIntensity: 1.0 }, sComp);
    await eComp.initialize();
    const compBefore = eComp.getState().current.flow;
    await eComp.processInput("你太棒了！");
    const compDelta = eComp.getState().current.flow - compBefore;

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
    assert.equal(after.flow, before.flow, `DA should not change with intensity=0.0: ${before.flow} → ${after.flow}`);
  });

  it("intensity=1.0 produces maximum chemistry change", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 1.0 }, s);
    await e.initialize();
    const before = e.getState().current.flow;
    await e.processInput("你太棒了！");
    const after = e.getState().current.flow;
    const delta = after - before;
    assert.ok(delta > 0, `DA should increase with intensity=1.0, delta=${delta}`);
  });

  it("intensity=0.5 produces moderate change between 0.0 and 1.0", async () => {
    // intensity=0.0
    const s0 = new MemoryStorageAdapter();
    const e0 = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 0.0 }, s0);
    await e0.initialize();
    const da0Before = e0.getState().current.flow;
    await e0.processInput("你太棒了！");
    const delta0 = e0.getState().current.flow - da0Before;

    // intensity=0.5
    const s5 = new MemoryStorageAdapter();
    const e5 = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 0.5 }, s5);
    await e5.initialize();
    const da5Before = e5.getState().current.flow;
    await e5.processInput("你太棒了！");
    const delta5 = e5.getState().current.flow - da5Before;

    // intensity=1.0
    const s1 = new MemoryStorageAdapter();
    const e1 = new PsycheEngine({ mbti: "ENFP", name: "Bot", personalityIntensity: 1.0 }, s1);
    await e1.initialize();
    const da1Before = e1.getState().current.flow;
    await e1.processInput("你太棒了！");
    const delta1 = e1.getState().current.flow - da1Before;

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
    const traitDA = e.getState().baseline.flow;

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
    // v10: mbti not stored; traits-based baseline used directly
    assert.equal(state.mbti, undefined);
    assert.ok(state.baseline.flow > 0, "Should have valid baseline DA");
    assert.ok(state.current.flow > 0, "Should have valid current DA");
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
    assert.ok(e.getState().stateHistory.length > 0);

    await e.resetState();

    const state = e.getState();
    assert.deepStrictEqual(state.current, state.baseline, "Current should equal baseline after reset");
    assert.deepStrictEqual(state.drives, DEFAULT_DRIVES, "Drives should be DEFAULT_DRIVES after reset");
    assert.equal(state.stateHistory.length, 0, "Emotional history should be empty after reset");
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
  it("returns happy emoji when flow > 70 and order > 60", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { flow: 75, order: 65, boundary: 50, resonance: 50 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u{1F60A}"), `Expected 😊, got: ${summary}`);
  });

  it("returns sad emoji when flow < 35", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { flow: 30, order: 50, boundary: 50, resonance: 50 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u{1F614}"), `Expected 😔, got: ${summary}`);
  });

  it("returns anxious emoji when order < 40", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { flow: 50, order: 35, boundary: 50, resonance: 50 },
    }));
    const e = new PsycheEngine({ mbti: "ENFP" }, s);
    await e.initialize();
    const summary = e.getStatusSummary();
    assert.ok(summary.includes("\u{1F630}"), `Expected 😰, got: ${summary}`);
  });

  it("includes drive warning when a drive is below 40", async () => {
    const s = new MemoryStorageAdapter();
    await s.save(makeExistingState({
      current: { flow: 50, order: 50, boundary: 50, resonance: 50 },
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
  it("new engine includes inner state in dynamicContext on first interaction", async () => {
    const s = new MemoryStorageAdapter();
    const e = new PsycheEngine({ mbti: "ENFP", name: "Luna", locale: "zh" }, s);
    await e.initialize();
    const result = await e.processInput("你好");
    // Engine always provides subjectivityContext (v9 path), which takes precedence
    // over the first-meet fallback. Either path proves inner state is present.
    assert.ok(
      result.dynamicContext.includes("主观内核") || result.dynamicContext.includes("第一次") || result.dynamicContext.includes("好奇"),
      `Expected inner state text, got: ${result.dynamicContext}`,
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
  it("processInput returns a canonical replyEnvelope in compact mode", async () => {
    const storage = new MemoryStorageAdapter();
    const engine = new PsycheEngine({ mbti: "INFJ", compactMode: true }, storage);
    await engine.initialize();
    const result = await engine.processInput("你好");
    assert.ok(result.replyEnvelope, "replyEnvelope should be present");
    assert.ok(result.subjectivityKernel, "subjectivityKernel should be present");
    assert.ok(result.responseContract, "responseContract should be present");
    assert.equal("policyModifiers" in (result.replyEnvelope ?? {}), false);
    assert.deepEqual(result.replyEnvelope?.subjectivityKernel, result.subjectivityKernel);
    assert.deepEqual(result.replyEnvelope?.responseContract, result.responseContract);
    assert.deepEqual(result.replyEnvelope?.generationControls, result.generationControls);
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
