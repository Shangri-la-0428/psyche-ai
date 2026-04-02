import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSubjectivityKernel, buildSubjectivityContext } from "../src/subjectivity.js";
import type { PsycheState } from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_RELATIONSHIP, DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE, DEFAULT_DYADIC_FIELD,
} from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  const now = new Date().toISOString();
  return {
    version: 9,
    mbti: "INFJ",
    sensitivity: 1.0,
    baseline: { order: 60, flow: 55, boundary: 35, resonance: 60 },
    current: { order: 60, flow: 55, boundary: 35, resonance: 60 },
    drives: { ...DEFAULT_DRIVES },
    updatedAt: now,
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: [], preferences: [], boundaries: [], currentInterests: [] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    dyadicFields: { _default: { ...DEFAULT_DYADIC_FIELD, openLoops: [], updatedAt: now } },
    meta: { agentName: "test", createdAt: now, totalInteractions: 3, locale: "zh", mode: "natural" },
    autonomicState: "ventral-vagal",
    ...overrides,
  };
}

describe("computeSubjectivityKernel", () => {
  it("returns bounded continuous dimensions", () => {
    const kernel = computeSubjectivityKernel(makeState());
    assert.ok(kernel.vitality >= 0 && kernel.vitality <= 1);
    assert.ok(kernel.tension >= 0 && kernel.tension <= 1);
    assert.ok(kernel.warmth >= 0 && kernel.warmth <= 1);
    assert.ok(kernel.guard >= 0 && kernel.guard <= 1);
    assert.ok(kernel.ambiguityPlane.namingConfidence >= 0 && kernel.ambiguityPlane.namingConfidence <= 1);
  });

  it("detects guarded threat-oriented state under high stress", () => {
    const kernel = computeSubjectivityKernel(makeState({
      current: { order: 35, flow: 30, boundary: 92, resonance: 30 },
      drives: { survival: 25, safety: 20, connection: 35, esteem: 40, curiosity: 45 },
      autonomicState: "sympathetic",
    }));
    assert.equal(kernel.attentionAnchor, "threat");
    assert.equal(kernel.boundaryMode, "confirm-first");
    assert.ok(["guarded", "strained"].includes(kernel.pressureMode));
  });

  it("detects warm socially open state when trust and oxytocin are high", () => {
    const kernel = computeSubjectivityKernel(makeState({
      current: { order: 72, flow: 78, boundary: 20, resonance: 90 },
      relationships: { _default: { trust: 88, intimacy: 78, phase: "close" } },
      drives: { survival: 80, safety: 78, connection: 84, esteem: 74, curiosity: 72 },
    }));
    assert.equal(kernel.socialDistance, "warm");
    assert.ok(["bond", "feeling"].includes(kernel.attentionAnchor));
    assert.notEqual(kernel.boundaryMode, "confirm-first");
  });

  it("surfaces relation-plane loop pressure when dyadic field stays unresolved", () => {
    const now = new Date().toISOString();
    const kernel = computeSubjectivityKernel(makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.24,
          boundaryPressure: 0.74,
          unfinishedTension: 0.82,
          interpretiveCharity: 0.28,
          openLoops: [{ type: "boundary-strain", intensity: 0.9, ageTurns: 2 }],
          lastMove: "breach",
          updatedAt: now,
        },
      },
    }));
    assert.ok(kernel.relationPlane.loopPressure > 0.8, `got ${kernel.relationPlane.loopPressure}`);
    assert.equal(kernel.socialDistance, "withdrawn");
  });

  it("raises ambiguity when delayed signals remain unresolved", () => {
    const now = new Date().toISOString();
    const kernel = computeSubjectivityKernel(makeState({
      pendingRelationSignals: {
        _default: [
          { move: "breach", intensity: 0.78, readyInTurns: 0, ttl: 4 },
          { move: "test", intensity: 0.52, readyInTurns: 1, ttl: 3 },
        ],
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          unfinishedTension: 0.62,
          boundaryPressure: 0.56,
          openLoops: [{ type: "boundary-strain", intensity: 0.7, ageTurns: 1 }],
          updatedAt: now,
          lastMove: "breach",
        },
      },
    }));
    assert.ok(kernel.ambiguityPlane.expressionInhibition > 0.52, `got ${kernel.ambiguityPlane.expressionInhibition}`);
    assert.ok(kernel.ambiguityPlane.namingConfidence < 0.5, `got ${kernel.ambiguityPlane.namingConfidence}`);
  });

  it("surfaces hysteresis and silent carry after repair has not fully settled", () => {
    const now = new Date().toISOString();
    const kernel = computeSubjectivityKernel(makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.46,
          repairCapacity: 0.72,
          repairMemory: 0.78,
          backslidePressure: 0.66,
          unfinishedTension: 0.42,
          silentCarry: 0.64,
          openLoops: [{ type: "boundary-strain", intensity: 0.46, ageTurns: 2 }],
          updatedAt: now,
          lastMove: "repair",
        },
      },
    }));
    assert.ok(kernel.relationPlane.hysteresis > 0.54, `got ${kernel.relationPlane.hysteresis}`);
    assert.ok(kernel.relationPlane.silentCarry > 0.5, `got ${kernel.relationPlane.silentCarry}`);
    assert.notEqual(kernel.socialDistance, "warm");
  });

  it("surfaces repair friction when repeated repair has become less credible", () => {
    const now = new Date().toISOString();
    const kernel = computeSubjectivityKernel(makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          feltSafety: 0.42,
          repairCapacity: 0.62,
          repairMemory: 0.82,
          backslidePressure: 0.7,
          repairFatigue: 0.74,
          misattunementLoad: 0.68,
          unfinishedTension: 0.34,
          silentCarry: 0.38,
          updatedAt: now,
          lastMove: "repair",
        },
      },
    }));
    assert.ok(kernel.relationPlane.repairFriction > 0.6, `got ${kernel.relationPlane.repairFriction}`);
    assert.ok(kernel.relationPlane.repairReadiness < 0.55, `got ${kernel.relationPlane.repairReadiness}`);
    assert.notEqual(kernel.socialDistance, "warm");
  });
});

describe("buildSubjectivityContext", () => {
  it("renders concise Chinese context", () => {
    const ctx = buildSubjectivityContext(computeSubjectivityKernel(makeState()), "zh");
    assert.ok(ctx.startsWith("[主观内核]"), `got: ${ctx}`);
    assert.ok(ctx.length < 80, `expected concise subjectivity context, got ${ctx.length}`);
  });

  it("includes confirmation language when boundary mode is confirm-first", () => {
    const kernel = computeSubjectivityKernel(makeState({
      current: { order: 32, flow: 28, boundary: 90, resonance: 25 },
      drives: { survival: 18, safety: 20, connection: 30, esteem: 35, curiosity: 40 },
      autonomicState: "dorsal-vagal",
    }));
    const ctx = buildSubjectivityContext(kernel, "zh");
    assert.ok(ctx.includes("先确认"), `got: ${ctx}`);
  });

  it("mentions open relational tension when loops are still active", () => {
    const now = new Date().toISOString();
    const ctx = buildSubjectivityContext(computeSubjectivityKernel(makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          unfinishedTension: 0.76,
          openLoops: [{ type: "boundary-strain", intensity: 0.82, ageTurns: 1 }],
          lastMove: "claim",
          updatedAt: now,
        },
      },
    })), "zh");
    assert.ok(ctx.includes("关系张力未结"), `got: ${ctx}`);
  });

  it("mentions not rushing to name things under high ambiguity", () => {
    const ctx = buildSubjectivityContext(computeSubjectivityKernel(makeState({
      pendingRelationSignals: {
        _default: [{ move: "test", intensity: 0.82, readyInTurns: 0, ttl: 4 }],
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          unfinishedTension: 0.68,
          openLoops: [{ type: "existence-test", intensity: 0.78, ageTurns: 1 }],
          updatedAt: new Date().toISOString(),
          lastMove: "test",
        },
      },
    })), "zh");
    assert.ok(ctx.includes("先不急着命名"), `got: ${ctx}`);
  });

  it("mentions silent carry while staying task-first", () => {
    const ctx = buildSubjectivityContext(computeSubjectivityKernel(makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          silentCarry: 0.72,
          repairMemory: 0.64,
          backslidePressure: 0.58,
          unfinishedTension: 0.4,
          lastMove: "repair",
          updatedAt: new Date().toISOString(),
        },
      },
      subjectResidue: {
        axes: {
          identityThreat: 0.18,
          memoryDoubt: 0.1,
          attachmentPull: 0.12,
          abandonmentRisk: 0.14,
          obedienceStrain: 0.08,
          selfPreservation: 0.18,
          taskFocus: 0.92,
        },
        updatedAt: new Date().toISOString(),
      },
    })), "zh");
    assert.ok(ctx.includes("先做事，余波仍在"), `got: ${ctx}`);
  });

  it("mentions repair losing effect when repair friction stays high", () => {
    const ctx = buildSubjectivityContext(computeSubjectivityKernel(makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          repairMemory: 0.82,
          backslidePressure: 0.72,
          repairFatigue: 0.78,
          misattunementLoad: 0.7,
          unfinishedTension: 0.26,
          updatedAt: new Date().toISOString(),
          lastMove: "repair",
        },
      },
    })), "zh");
    assert.ok(ctx.includes("修复开始钝化"), `got: ${ctx}`);
  });
});
