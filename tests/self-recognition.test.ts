import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeSelfReflection,
  computeEmotionalTendency,
  buildSelfReflectionContext,
} from "../src/self-recognition.js";
import type { StateSnapshot, StimulusType } from "../src/types.js";

function makeSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    state: { order: 50, flow: 50, boundary: 50, resonance: 50 },
    stimulus: null,
    dominantEmotion: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── computeSelfReflection ────────────────────────────────────

describe("computeSelfReflection", () => {
  it("returns default reflection for empty history", () => {
    const r = computeSelfReflection([], "zh");
    assert.deepEqual(r.recurringTriggers, []);
    assert.equal(r.tendency, "stable");
    assert.equal(r.dominantEmotion, null);
    assert.ok(r.narrativeSummary.length > 0);
  });

  it("returns stable/minimal reflection for 1-2 entries", () => {
    const r = computeSelfReflection([makeSnapshot(), makeSnapshot()], "en");
    assert.equal(r.tendency, "stable");
    assert.deepEqual(r.recurringTriggers, []);
    assert.equal(r.dominantEmotion, null);
  });

  it("detects repeated praise stimulus as recurring trigger", () => {
    const history: StateSnapshot[] = Array.from({ length: 5 }, () =>
      makeSnapshot({ stimulus: "praise" as StimulusType }),
    );
    const r = computeSelfReflection(history, "zh");
    assert.ok(r.recurringTriggers.length > 0);
    assert.equal(r.recurringTriggers[0].stimulus, "praise");
    assert.equal(r.recurringTriggers[0].count, 5);
  });

  it("orders mixed stimuli by frequency", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ stimulus: "praise" as StimulusType }),
      makeSnapshot({ stimulus: "humor" as StimulusType }),
      makeSnapshot({ stimulus: "praise" as StimulusType }),
      makeSnapshot({ stimulus: "humor" as StimulusType }),
      makeSnapshot({ stimulus: "praise" as StimulusType }),
      makeSnapshot({ stimulus: "criticism" as StimulusType }),
    ];
    const r = computeSelfReflection(history, "en");
    assert.ok(r.recurringTriggers.length >= 2);
    assert.equal(r.recurringTriggers[0].stimulus, "praise");
    assert.equal(r.recurringTriggers[0].count, 3);
    assert.equal(r.recurringTriggers[1].stimulus, "humor");
    assert.equal(r.recurringTriggers[1].count, 2);
  });

  it("finds most frequent dominant emotion", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ dominantEmotion: "anxious tension" }),
      makeSnapshot({ dominantEmotion: "excited joy" }),
      makeSnapshot({ dominantEmotion: "anxious tension" }),
      makeSnapshot({ dominantEmotion: "anxious tension" }),
    ];
    const r = computeSelfReflection(history, "en");
    assert.equal(r.dominantEmotion, "anxious tension");
  });

  it("excludes triggers with count < 2", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ stimulus: "praise" as StimulusType }),
      makeSnapshot({ stimulus: "humor" as StimulusType }),
      makeSnapshot({ stimulus: "criticism" as StimulusType }),
    ];
    const r = computeSelfReflection(history, "zh");
    assert.equal(r.recurringTriggers.length, 0, "No stimulus repeated >= 2 times");
  });

  it("generates zh narrative summary with trigger info", () => {
    const history: StateSnapshot[] = Array.from({ length: 4 }, () =>
      makeSnapshot({ stimulus: "praise" as StimulusType, dominantEmotion: "excited joy" }),
    );
    const r = computeSelfReflection(history, "zh");
    assert.ok(r.narrativeSummary.includes("赞美"), "Should mention trigger in zh");
  });

  it("generates en narrative summary with trigger info", () => {
    const history: StateSnapshot[] = Array.from({ length: 4 }, () =>
      makeSnapshot({ stimulus: "praise" as StimulusType, dominantEmotion: "excited joy" }),
    );
    const r = computeSelfReflection(history, "en");
    assert.ok(r.narrativeSummary.includes("praise"), "Should mention trigger in en");
  });
});

// ── computeEmotionalTendency ─────────────────────────────────

describe("computeEmotionalTendency", () => {
  it("returns stable for flat history", () => {
    const history = Array.from({ length: 5 }, () => makeSnapshot());
    assert.equal(computeEmotionalTendency(history), "stable");
  });

  it("detects ascending when DA rises and CORT falls", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ state: { order: 30, flow: 30, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 35, flow: 35, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 50, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 65, flow: 65, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 75, flow: 75, boundary: 50, resonance: 50 } }),
    ];
    assert.equal(computeEmotionalTendency(history), "ascending");
  });

  it("detects descending when DA falls and CORT rises", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ state: { order: 75, flow: 75, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 65, flow: 65, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 50, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 35, flow: 35, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 25, flow: 25, boundary: 50, resonance: 50 } }),
    ];
    assert.equal(computeEmotionalTendency(history), "descending");
  });

  it("detects volatile when DA stddev is high", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ state: { order: 50, flow: 20, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 80, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 25, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 85, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 20, boundary: 50, resonance: 50 } }),
    ];
    const tendency = computeEmotionalTendency(history);
    assert.ok(tendency === "volatile" || tendency === "oscillating",
      `Expected volatile or oscillating, got ${tendency}`);
  });

  it("detects oscillating pattern", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ state: { order: 50, flow: 30, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 70, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 25, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 75, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 30, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 50, flow: 70, boundary: 50, resonance: 50 } }),
    ];
    assert.equal(computeEmotionalTendency(history), "oscillating");
  });

  it("returns stable for < 3 entries", () => {
    assert.equal(computeEmotionalTendency([makeSnapshot(), makeSnapshot()]), "stable");
  });
});

// ── buildSelfReflectionContext ────────────────────────────────

describe("buildSelfReflectionContext", () => {
  it("zh output contains 自我觉察", () => {
    const reflection = computeSelfReflection(
      Array.from({ length: 5 }, () =>
        makeSnapshot({ stimulus: "praise" as StimulusType, dominantEmotion: "excited joy" }),
      ),
      "zh",
    );
    const ctx = buildSelfReflectionContext(reflection, "zh");
    assert.ok(ctx.includes("自我觉察"), `Expected 自我觉察, got: ${ctx}`);
  });

  it("en output contains Self-awareness", () => {
    const reflection = computeSelfReflection(
      Array.from({ length: 5 }, () =>
        makeSnapshot({ stimulus: "praise" as StimulusType, dominantEmotion: "excited joy" }),
      ),
      "en",
    );
    const ctx = buildSelfReflectionContext(reflection, "en");
    assert.ok(ctx.includes("Self-awareness"), `Expected Self-awareness, got: ${ctx}`);
  });

  it("returns empty string for default/minimal reflection", () => {
    const reflection = computeSelfReflection([], "zh");
    const ctx = buildSelfReflectionContext(reflection, "zh");
    assert.equal(ctx, "", "Should be empty for default reflection");
  });

  it("returns empty string for stable reflection with no triggers or emotion", () => {
    const reflection = computeSelfReflection([
      makeSnapshot(),
      makeSnapshot(),
    ], "en");
    const ctx = buildSelfReflectionContext(reflection, "en");
    assert.equal(ctx, "");
  });

  it("includes trigger counts in zh output", () => {
    const reflection = computeSelfReflection(
      Array.from({ length: 3 }, () =>
        makeSnapshot({ stimulus: "criticism" as StimulusType }),
      ),
      "zh",
    );
    const ctx = buildSelfReflectionContext(reflection, "zh");
    assert.ok(ctx.includes("3次"), `Should include count, got: ${ctx}`);
    assert.ok(ctx.includes("批评"), `Should include trigger name in zh, got: ${ctx}`);
  });

  it("includes tendency description when not stable", () => {
    const history: StateSnapshot[] = [
      makeSnapshot({ state: { order: 30, flow: 30, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 40, flow: 40, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 55, flow: 55, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 70, flow: 70, boundary: 50, resonance: 50 } }),
      makeSnapshot({ state: { order: 80, flow: 80, boundary: 50, resonance: 50 } }),
    ];
    const reflection = computeSelfReflection(history, "zh");
    const ctx = buildSelfReflectionContext(reflection, "zh");
    assert.ok(ctx.includes("上扬"), `Should describe ascending tendency, got: ${ctx}`);
  });
});
