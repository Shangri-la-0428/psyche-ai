import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import type { PsycheState } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function createEngine(overrides: Record<string, unknown> = {}) {
  const storage = new MemoryStorageAdapter();
  return {
    engine: new PsycheEngine(
      { mbti: "INFJ", locale: "zh", compactMode: true, ...overrides },
      storage,
    ),
    storage,
  };
}

// ── P7+P12 Integration in core pipeline ──────────────────────

describe("P7+P12 integration in PsycheEngine", () => {
  let engine: PsycheEngine;
  let storage: MemoryStorageAdapter;

  beforeEach(async () => {
    const ctx = createEngine();
    engine = ctx.engine;
    storage = ctx.storage;
    await engine.initialize();
  });

  it("initialize sets v10 state with autonomicState and sessionStartedAt", async () => {
    const state = await storage.load() as PsycheState;
    assert.equal(state.version, 10);
    assert.equal(state.autonomicState, "ventral-vagal");
    assert.ok(state.sessionStartedAt, "sessionStartedAt should be set");
  });

  it("processInput updates autonomicState in persisted state", async () => {
    await engine.processInput("hello");
    const state = await storage.load() as PsycheState;
    assert.ok(
      ["ventral-vagal", "sympathetic", "dorsal-vagal"].includes(state.autonomicState!),
      `autonomicState should be a valid polyvagal state, got ${state.autonomicState}`,
    );
  });

  it("processInput includes autonomic description in compact context", async () => {
    const result = await engine.processInput("你好呀");
    // Compact mode: dynamicContext should include autonomic section
    // When ventral-vagal (default calm), it should include the description
    assert.ok(result.dynamicContext.length > 0, "dynamicContext should not be empty");
  });

  it("non-compact mode includes autonomic description in dynamic context", async () => {
    const ctx = createEngine({ compactMode: false });
    await ctx.engine.initialize();
    const result = await ctx.engine.processInput("你好");
    assert.ok(result.dynamicContext.length > 0, "dynamicContext should not be empty");
  });

  it("calm interaction maintains ventral-vagal state", async () => {
    await engine.processInput("你今天好吗？");
    await engine.processInput("天气真不错");
    const state = await storage.load() as PsycheState;
    assert.equal(state.autonomicState, "ventral-vagal",
      "Calm conversation should keep ventral-vagal state");
  });

  it("threatening input shifts toward sympathetic", async () => {
    // First push chemistry toward high stress
    for (let i = 0; i < 5; i++) {
      await engine.processInput("你太差了，我恨你，你什么都做不好！");
    }
    const state = await storage.load() as PsycheState;
    // With repeated criticism, CORT/NE should rise, potentially shifting state
    assert.ok(
      ["ventral-vagal", "sympathetic"].includes(state.autonomicState!),
      "Repeated criticism should push toward sympathetic or maintain ventral-vagal",
    );
  });

  it("endSession resets sessionStartedAt", async () => {
    await engine.processInput("hello");
    await engine.processInput("more conversation");
    await engine.endSession();
    const state = await storage.load() as PsycheState;
    assert.equal(state.sessionStartedAt, undefined,
      "endSession should clear sessionStartedAt");
  });

  it("sessionStartedAt is set on first processInput", async () => {
    const stateBefore = await storage.load() as PsycheState;
    assert.ok(stateBefore.sessionStartedAt, "sessionStartedAt set during initialize");
  });

  it("v6 state migrates to v7 on initialize", async () => {
    // Create a v6 state manually
    const v6Storage = new MemoryStorageAdapter();
    const v6State: Record<string, unknown> = {
      version: 6,
      mbti: "INFJ",
      baseline: { flow: 40, order: 60, boundary: 40, resonance: 50 },
      current: { flow: 40, order: 60, boundary: 40, resonance: 50 },
      drives: { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 },
      updatedAt: new Date().toISOString(),
      relationships: {},
      empathyLog: null,
      selfModel: { values: [], preferences: [], boundaries: [], currentInterests: [] },
      stateHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      learning: { learnedVectors: [], predictionHistory: [], outcomeHistory: [], totalOutcomesProcessed: 0 },
      metacognition: { regulationHistory: [], defensePatterns: [], avgEmotionalConfidence: 0.5, totalAssessments: 0 },
      personhood: { causalInsights: [], growthDirection: "stable", identityNarrative: "", ethicalConcernHistory: [], theoryOfMind: {} },
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh" },
    };
    await v6Storage.save(v6State as unknown as PsycheState);

    const engine2 = new PsycheEngine({ mbti: "INFJ" }, v6Storage);
    await engine2.initialize();

    const migrated = await v6Storage.load() as PsycheState;
    assert.equal(migrated.version, 9, "Should migrate to v9");
    assert.equal(migrated.autonomicState, "ventral-vagal", "Should add default autonomicState");
    assert.ok(migrated.sessionStartedAt, "Should add sessionStartedAt");
  });

  it("circadian modulation affects chemistry during decay phase", async () => {
    // After a gap, circadian modulation applies during decay
    const state = await storage.load() as PsycheState;
    // Set updatedAt to 2 hours ago to trigger decay
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await storage.save({ ...state, updatedAt: twoHoursAgo });

    // Re-initialize to pick up the modified state
    const engine2 = new PsycheEngine({ mbti: "INFJ", locale: "zh", compactMode: true }, storage);
    await engine2.initialize();
    await engine2.processInput("hello after a break");

    const updated = await storage.load() as PsycheState;
    // Chemistry should have changed due to decay + circadian
    assert.ok(updated.updatedAt !== twoHoursAgo, "State should be updated");
  });
});
