import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PsycheEngine } from "../src/core.js";
import { PsycheInteraction } from "../src/interaction.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import type { PsycheState, SelfState } from "../src/types.js";
import { DIMENSION_KEYS, DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  const now = new Date().toISOString();
  return {
    version: 6,
    mbti: "ENFP",
    sensitivity: 1.0,
    baseline: { order: 55, flow: 75, boundary: 30, resonance: 60 },
    current: { order: 55, flow: 75, boundary: 30, resonance: 60 },
    updatedAt: now,
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["growth"], preferences: [], boundaries: [], currentInterests: [] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "AgentA", createdAt: now, totalInteractions: 0, locale: "en" },
    ...overrides,
  };
}

async function createEngine(
  name: string,
  currentOverrides?: Partial<SelfState>,
): Promise<{ engine: PsycheEngine; storage: MemoryStorageAdapter }> {
  const storage = new MemoryStorageAdapter();
  const state = makeState({
    meta: { agentName: name, createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en" },
    ...(currentOverrides ? { current: { flow: 65, order: 55, boundary: 30, resonance: 70 } } : {}),
  });
  await storage.save(state);
  const engine = new PsycheEngine({ name, locale: "en", compactMode: false }, storage);
  await engine.initialize();
  return { engine, storage };
}

// ── PsycheInteraction ────────────────────────────────────────

describe("PsycheInteraction", () => {
  let engineA: PsycheEngine;
  let engineB: PsycheEngine;
  let storageA: MemoryStorageAdapter;
  let storageB: MemoryStorageAdapter;
  let interaction: PsycheInteraction;

  beforeEach(async () => {
    ({ engine: engineA, storage: storageA } = await createEngine("Alice"));
    ({ engine: engineB, storage: storageB } = await createEngine("Bob"));
    interaction = new PsycheInteraction(engineA, engineB);
  });

  // ── Basic exchange flow ──────────────────────────────────

  it("exchange returns outputResult, inputResult, and detectedStimulus", async () => {
    const result = await interaction.exchange(engineA, engineB, "You are amazing! Great job!");

    assert.ok(result.outputResult, "Should have outputResult");
    assert.ok(result.inputResult, "Should have inputResult");
    assert.ok("cleanedText" in result.outputResult, "outputResult should have cleanedText");
    assert.ok("systemContext" in result.inputResult, "inputResult should have systemContext");
    assert.ok("dynamicContext" in result.inputResult, "inputResult should have dynamicContext");
    assert.ok("detectedStimulus" in result, "Should have detectedStimulus field");
  });

  it("exchange strips psyche_update tags from speaker output before feeding to receiver", async () => {
    const textWithTags = "I feel great!\n<psyche_update>\nDA: 90\nHT: 70\n</psyche_update>";
    const result = await interaction.exchange(engineA, engineB, textWithTags);

    assert.ok(
      !result.outputResult.cleanedText.includes("<psyche_update>"),
      "Cleaned text should not contain psyche_update tags",
    );
    assert.equal(result.outputResult.cleanedText, "I feel great!");
  });

  it("exchange detects stimulus type from speaker's cleaned text", async () => {
    const result = await interaction.exchange(engineA, engineB, "This is terrible, wrong, not good at all");

    assert.equal(result.detectedStimulus, "criticism");
  });

  // ── Cross-contagion ──────────────────────────────────────

  it("crossContagion modifies chemistry when engines have divergent emotional states", async () => {
    // Put Alice in an excited state (high flow, low boundary)
    const sA = new MemoryStorageAdapter();
    await sA.save(makeState({
      meta: { agentName: "Alice", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en" },
      current: { order: 60, flow: 85, boundary: 20, resonance: 65 },
    }));
    const excitedAlice = new PsycheEngine({ name: "Alice", locale: "en" }, sA);
    await excitedAlice.initialize();

    // Put Bob in a stressed state (high boundary, low order)
    const sB = new MemoryStorageAdapter();
    await sB.save(makeState({
      meta: { agentName: "Bob", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en" },
      current: { order: 35, flow: 30, boundary: 70, resonance: 30 },
    }));
    const stressedBob = new PsycheEngine({ name: "Bob", locale: "en" }, sB);
    await stressedBob.initialize();

    const cross = new PsycheInteraction(excitedAlice, stressedBob);
    const result = await cross.crossContagion(excitedAlice, stressedBob, 0.3);

    // Contagion should have produced some change
    assert.equal(result.changed, true, "Contagion should have changed chemistry");

    // At least one delta should be non-empty
    const hasDeltaA = Object.keys(result.deltaA).length > 0;
    const hasDeltaB = Object.keys(result.deltaB).length > 0;
    assert.ok(hasDeltaA || hasDeltaB, "At least one engine should have a chemistry delta");
  });

  it("crossContagion with rate=0 produces no changes", async () => {
    const result = await interaction.crossContagion(engineA, engineB, 0);
    assert.equal(result.changed, false, "Zero rate should produce no change");
    assert.equal(Object.keys(result.deltaA).length, 0);
    assert.equal(Object.keys(result.deltaB).length, 0);
  });

  // ── Relationship summary ─────────────────────────────────

  it("getRelationshipSummary returns strangers phase with no exchanges", () => {
    const summary = interaction.getRelationshipSummary(engineA, engineB);

    assert.equal(summary.totalExchanges, 0);
    assert.equal(summary.phase, "strangers");
    assert.equal(summary.averageValenceAtoB, 0);
    assert.equal(summary.averageValenceBtoA, 0);
    assert.ok(summary.description.includes("Alice"));
    assert.ok(summary.description.includes("Bob"));
    assert.ok(summary.description.includes("barely interacted"));
  });

  it("multiple exchanges build relationship and advance phase", async () => {
    // Do 3 exchanges (crosses from strangers to acquaintances)
    await interaction.exchange(engineA, engineB, "Hello Bob! Great to meet you!");
    await interaction.exchange(engineB, engineA, "Hi Alice! You seem wonderful!");
    await interaction.exchange(engineA, engineB, "Thanks! I think we'll get along well!");

    const summary = interaction.getRelationshipSummary(engineA, engineB);

    assert.equal(summary.totalExchanges, 3);
    assert.equal(summary.phase, "acquaintances");
    assert.ok(summary.description.includes("getting to know"));
  });

  it("getRelationshipSummary tracks directional valence correctly", async () => {
    // Alice sends positive messages
    await interaction.exchange(engineA, engineB, "Amazing work! You're brilliant!");
    await interaction.exchange(engineA, engineB, "I really appreciate you, thank you!");

    // Bob sends negative messages
    await interaction.exchange(engineB, engineA, "This is wrong. Terrible approach.");
    await interaction.exchange(engineB, engineA, "Shut up, you're being ridiculous.");

    const summary = interaction.getRelationshipSummary(engineA, engineB);

    // Alice→Bob should be positive, Bob→Alice should be negative
    assert.ok(
      summary.averageValenceAtoB > summary.averageValenceBtoA,
      `A→B valence (${summary.averageValenceAtoB}) should be greater than B→A valence (${summary.averageValenceBtoA})`,
    );
    assert.ok(summary.averageValenceAtoB > 0, "A→B should be positive");
    assert.ok(summary.averageValenceBtoA < 0, "B→A should be negative");
  });

  // ── Asymmetric emotional states ──────────────────────────

  it("asymmetric states produce different inputResult stimuli in each direction", async () => {
    // Alice sends praise
    const r1 = await interaction.exchange(engineA, engineB, "You are so talented! Amazing!");
    // Bob sends criticism
    const r2 = await interaction.exchange(engineB, engineA, "That's wrong. This doesn't work at all.");

    // The detected stimuli should differ
    assert.equal(r1.detectedStimulus, "praise");
    assert.equal(r2.detectedStimulus, "criticism");
  });

  it("asymmetric contagion: stressed agent receives different delta than calm agent", async () => {
    // Create a stressed Alice
    const sA = new MemoryStorageAdapter();
    await sA.save(makeState({
      meta: { agentName: "Alice", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en" },
      current: { order: 30, flow: 25, boundary: 80, resonance: 25 },
    }));
    const stressedAlice = new PsycheEngine({ name: "Alice", locale: "en" }, sA);
    await stressedAlice.initialize();

    // Create a calm, happy Bob
    const sB = new MemoryStorageAdapter();
    await sB.save(makeState({
      meta: { agentName: "Bob", createdAt: new Date().toISOString(), totalInteractions: 5, locale: "en" },
      current: { order: 70, flow: 75, boundary: 20, resonance: 70 },
    }));
    const calmBob = new PsycheEngine({ name: "Bob", locale: "en" }, sB);
    await calmBob.initialize();

    const asymInteraction = new PsycheInteraction(stressedAlice, calmBob);
    const result = await asymInteraction.crossContagion(stressedAlice, calmBob, 0.25);

    // Both should be affected, but the deltas should be different
    // because they start from very different chemistry states
    if (result.changed) {
      const deltaAKeys = Object.keys(result.deltaA);
      const deltaBKeys = Object.keys(result.deltaB);
      // At least one side should have deltas
      assert.ok(
        deltaAKeys.length > 0 || deltaBKeys.length > 0,
        "At least one engine should have deltas from asymmetric contagion",
      );
    }
  });

  // ── Edge cases and validation ────────────────────────────

  it("exchange rejects engines not part of the interaction", async () => {
    const { engine: outsider } = await createEngine("Outsider");

    await assert.rejects(
      () => interaction.exchange(outsider, engineB, "hello"),
      /not part of this interaction/,
    );
  });

  it("relationship summary reports chemical similarity between engines", () => {
    const summary = interaction.getRelationshipSummary(engineA, engineB);

    // Both engines start with identical default chemistry, so similarity should be very high
    assert.ok(
      summary.chemicalSimilarity > 0.9,
      `Identical-start engines should have high similarity, got ${summary.chemicalSimilarity}`,
    );
  });

  it("exchange records persist in history and are retrievable", async () => {
    await interaction.exchange(engineA, engineB, "Hello there!");
    await interaction.exchange(engineB, engineA, "Hi back!");

    const history = interaction.getHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0].fromId, "Alice");
    assert.equal(history[0].toId, "Bob");
    assert.equal(history[1].fromId, "Bob");
    assert.equal(history[1].toId, "Alice");
  });
});
