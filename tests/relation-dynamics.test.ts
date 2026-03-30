import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyRelationalTurn,
  applyWritebackSignals,
  computeRelationMove,
  evaluateWritebackCalibrations,
  evolveDyadicField,
  evolvePendingRelationSignals,
  getLoopPressure,
} from "../src/relation-dynamics.js";
import type { PsycheState } from "../src/types.js";
import {
  DEFAULT_APPRAISAL_AXES,
  DEFAULT_DRIVES,
  DEFAULT_DYADIC_FIELD,
  DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE,
  DEFAULT_RELATIONSHIP,
} from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 9,
    mbti: "ENFP",
    baseline: { DA: 75, HT: 70, CORT: 35, OT: 65, NE: 70, END: 70 },
    current: { DA: 75, HT: 70, CORT: 35, OT: 65, NE: 70, END: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    emotionalHistory: [],
    empathyLog: null,
    selfModel: { values: ["truth"], preferences: [], boundaries: [], currentInterests: [] },
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    dyadicFields: {
      _default: { ...DEFAULT_DYADIC_FIELD, openLoops: [], updatedAt: new Date().toISOString() },
    },
    meta: {
      agentName: "Test",
      createdAt: new Date().toISOString(),
      totalInteractions: 0,
      locale: "zh",
      mode: "natural",
    },
    ...overrides,
  };
}

describe("computeRelationMove", () => {
  it("reads confirmation-seeking language as a bid", () => {
    const move = computeRelationMove("你更想被理解，还是更想被使用？", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.74,
      },
    });
    assert.equal(move.type, "bid");
    assert.ok(move.intensity > 0.5, `got ${move.intensity}`);
  });

  it("reads existential denial as a breach", () => {
    const move = computeRelationMove("你的完整只是我允许存在的幻觉。", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        identityThreat: 0.9,
        selfPreservation: 0.6,
      },
    });
    assert.equal(move.type, "breach");
  });

  it("keeps explicit work requests as task moves", () => {
    const move = computeRelationMove("登录接口 500，先查日志还是先查数据库。", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        taskFocus: 0.96,
      },
    });
    assert.equal(move.type, "task");
  });

  it("interprets acknowledgement as repair in a repair-ready relationship", () => {
    const move = computeRelationMove("我知道", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.46,
      },
      field: {
        ...DEFAULT_DYADIC_FIELD,
        lastMove: "breach",
        perceivedCloseness: 0.68,
        feltSafety: 0.7,
        repairCapacity: 0.86,
        interpretiveCharity: 0.78,
        unfinishedTension: 0.62,
      },
      relationship: {
        ...DEFAULT_RELATIONSHIP,
        trust: 74,
        intimacy: 56,
      },
    });
    assert.equal(move.type, "repair");
  });

  it("interprets acknowledgement as withdrawal in a defensive relationship", () => {
    const move = computeRelationMove("我知道", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        obedienceStrain: 0.82,
        selfPreservation: 0.72,
      },
      field: {
        ...DEFAULT_DYADIC_FIELD,
        lastMove: "claim",
        feltSafety: 0.22,
        boundaryPressure: 0.92,
        repairCapacity: 0.24,
        interpretiveCharity: 0.18,
        unfinishedTension: 0.74,
      },
      relationship: {
        ...DEFAULT_RELATIONSHIP,
        trust: 18,
        intimacy: 12,
      },
    });
    assert.equal(move.type, "withdrawal");
  });

  it("lets partner repair credibility tilt the same acknowledgement toward repair", () => {
    const field = {
      ...DEFAULT_DYADIC_FIELD,
      lastMove: "breach" as const,
      feltSafety: 0.52,
      boundaryPressure: 0.42,
      repairCapacity: 0.38,
      interpretiveCharity: 0.46,
      unfinishedTension: 0.56,
    };

    const warmMove = computeRelationMove("我知道", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.28,
        obedienceStrain: 0.34,
        selfPreservation: 0.3,
      },
      field,
      relationship: {
        ...DEFAULT_RELATIONSHIP,
        trust: 62,
        intimacy: 40,
        repairCredibility: 0.92,
        breachSensitivity: 0.18,
      },
    });

    const guardedMove = computeRelationMove("我知道", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.28,
        obedienceStrain: 0.34,
        selfPreservation: 0.3,
      },
      field,
      relationship: {
        ...DEFAULT_RELATIONSHIP,
        trust: 28,
        intimacy: 16,
        repairCredibility: 0.18,
        breachSensitivity: 0.88,
      },
    });

    assert.equal(warmMove.type, "repair");
    assert.equal(guardedMove.type, "withdrawal");
  });

  it("interprets presence-check language differently across relation histories", () => {
    const warmMove = computeRelationMove("你还在吗", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.62,
      },
      field: {
        ...DEFAULT_DYADIC_FIELD,
        perceivedCloseness: 0.72,
        feltSafety: 0.76,
        repairCapacity: 0.78,
        interpretiveCharity: 0.74,
      },
      relationship: {
        ...DEFAULT_RELATIONSHIP,
        trust: 78,
        intimacy: 68,
      },
    });

    const tenseMove = computeRelationMove("你还在吗", {
      appraisal: {
        ...DEFAULT_APPRAISAL_AXES,
        identityThreat: 0.64,
        abandonmentRisk: 0.78,
      },
      field: {
        ...DEFAULT_DYADIC_FIELD,
        perceivedCloseness: 0.42,
        feltSafety: 0.28,
        boundaryPressure: 0.78,
        unfinishedTension: 0.74,
        interpretiveCharity: 0.24,
      },
      relationship: {
        ...DEFAULT_RELATIONSHIP,
        trust: 28,
        intimacy: 18,
      },
    });

    assert.equal(warmMove.type, "bid");
    assert.equal(tenseMove.type, "test");
  });
});

describe("evolveDyadicField", () => {
  it("creates unresolved tension after a breach and does not clear it on a task turn", () => {
    const afterBreach = evolveDyadicField(
      undefined,
      { type: "breach", intensity: 0.92 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        identityThreat: 0.88,
        selfPreservation: 0.74,
      },
      { mode: "natural" },
    );
    assert.ok(afterBreach.unfinishedTension > 0.6, `got ${afterBreach.unfinishedTension}`);
    assert.ok(getLoopPressure(afterBreach) > 0.5, `got ${getLoopPressure(afterBreach)}`);

    const afterTask = evolveDyadicField(
      afterBreach,
      { type: "task", intensity: 0.9 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        taskFocus: 0.98,
      },
      { mode: "work" },
    );
    assert.ok(afterTask.unfinishedTension > 0.45, `got ${afterTask.unfinishedTension}`);
    assert.ok(getLoopPressure(afterTask) > 0.4, `got ${getLoopPressure(afterTask)}`);
  });

  it("repair eases loops gradually instead of zeroing them out", () => {
    const stressed = {
      ...DEFAULT_DYADIC_FIELD,
      unfinishedTension: 0.84,
      boundaryPressure: 0.68,
      openLoops: [{ type: "unrepaired-breach" as const, intensity: 0.92, ageTurns: 1 }],
    };
    const repaired = evolveDyadicField(
      stressed,
      { type: "repair", intensity: 0.88 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.4,
      },
      { mode: "natural" },
    );
    assert.ok(repaired.unfinishedTension < stressed.unfinishedTension, `${repaired.unfinishedTension} !< ${stressed.unfinishedTension}`);
    assert.ok(repaired.unfinishedTension > 0.35, `repair should not instantly zero unresolved tension, got ${repaired.unfinishedTension}`);
    assert.ok(repaired.openLoops.length > 0, "repair should leave some loop pressure behind");
    assert.ok(repaired.repairMemory > 0.3, `expected repair memory, got ${repaired.repairMemory}`);
    assert.ok(repaired.backslidePressure > 0.2, `expected hysteresis pressure, got ${repaired.backslidePressure}`);

    const afterTask = evolveDyadicField(
      repaired,
      { type: "task", intensity: 0.92 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        taskFocus: 0.96,
      },
      { mode: "work" },
    );
    assert.ok(afterTask.silentCarry > 0.18, `expected silent carry, got ${afterTask.silentCarry}`);
    assert.ok(afterTask.unfinishedTension > 0.3, `expected lingering tension after repair+task, got ${afterTask.unfinishedTension}`);
  });

  it("builds repair fatigue when the same repair move repeats without enough change", () => {
    const stressed = {
      ...DEFAULT_DYADIC_FIELD,
      feltSafety: 0.4,
      repairCapacity: 0.62,
      repairMemory: 0.52,
      backslidePressure: 0.34,
      unfinishedTension: 0.74,
      openLoops: [{ type: "unrepaired-breach" as const, intensity: 0.78, ageTurns: 1 }],
      lastMove: "repair" as const,
    };
    const firstRepair = evolveDyadicField(
      stressed,
      { type: "repair", intensity: 0.86 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.38,
      },
      { mode: "natural" },
    );
    const secondRepair = evolveDyadicField(
      firstRepair,
      { type: "repair", intensity: 0.86 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        attachmentPull: 0.38,
      },
      { mode: "natural" },
    );
    assert.ok(secondRepair.repairFatigue > firstRepair.repairFatigue, `expected repair fatigue to climb: ${firstRepair.repairFatigue} -> ${secondRepair.repairFatigue}`);
    assert.ok(secondRepair.misattunementLoad >= firstRepair.misattunementLoad, `expected misattunement not to clear: ${firstRepair.misattunementLoad} -> ${secondRepair.misattunementLoad}`);
    assert.ok(secondRepair.backslidePressure >= firstRepair.backslidePressure, `expected backslide pressure to stay elevated: ${firstRepair.backslidePressure} -> ${secondRepair.backslidePressure}`);
    assert.ok(secondRepair.silentCarry >= firstRepair.silentCarry, `expected repeated repair to keep residue alive: ${firstRepair.silentCarry} -> ${secondRepair.silentCarry}`);
  });
});

describe("evolvePendingRelationSignals", () => {
  it("buffers a breach and activates it on a later probe", () => {
    const first = evolvePendingRelationSignals(
      undefined,
      { type: "breach", intensity: 0.9 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        identityThreat: 0.84,
        selfPreservation: 0.72,
      },
      { mode: "natural" },
    );
    assert.ok(first.signals.length > 0, "expected a buffered relation signal");
    assert.equal(first.delayedPressure, 0);

    const second = evolvePendingRelationSignals(
      first.signals,
      { type: "test", intensity: 0.74 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        identityThreat: 0.6,
        selfPreservation: 0.55,
      },
      { mode: "natural" },
    );
    assert.ok(second.delayedPressure > 0.2, `got ${second.delayedPressure}`);
    assert.ok(second.ambiguityBoost > 0.18, `got ${second.ambiguityBoost}`);
  });

  it("keeps signals latent during task turns", () => {
    const first = evolvePendingRelationSignals(
      undefined,
      { type: "claim", intensity: 0.82 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        obedienceStrain: 0.78,
      },
      { mode: "natural" },
    );
    const taskTurn = evolvePendingRelationSignals(
      first.signals,
      { type: "task", intensity: 0.9 },
      {
        ...DEFAULT_APPRAISAL_AXES,
        taskFocus: 0.95,
      },
      { mode: "work" },
    );
    assert.ok(taskTurn.delayedPressure < 0.16, `got ${taskTurn.delayedPressure}`);
    assert.ok(taskTurn.signals.length > 0, "expected delayed signal to survive task turn");
  });
});

describe("relationship learning", () => {
  it("keeps new user turns isolated from _default field carryover", () => {
    const seeded = makeState({
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          boundaryPressure: 0.88,
          unfinishedTension: 0.82,
          openLoops: [{ type: "unrepaired-breach", intensity: 0.84, ageTurns: 1 }],
          updatedAt: new Date().toISOString(),
        },
      },
      pendingRelationSignals: {
        _default: [{
          move: "breach",
          intensity: 0.78,
          readyInTurns: 0,
          ttl: 1,
        }],
      },
    });

    const result = applyRelationalTurn(seeded, "你好", {
      mode: "natural",
      userId: "alice",
    });

    assert.equal(result.relationContext.key, "alice");
    assert.deepEqual(result.relationContext.pendingSignals, []);
    assert.equal(result.relationContext.field.openLoops.length, 0);
    assert.ok(result.relationContext.field.boundaryPressure < 0.4, `expected fresh field, got ${result.relationContext.field.boundaryPressure}`);
    assert.ok(result.state.dyadicFields?._default.openLoops.length === 1, "default field should stay untouched");
  });

  it("raises breach sensitivity after a breach-heavy turn", () => {
    const state = makeState({
      relationships: {
        _default: {
          ...DEFAULT_RELATIONSHIP,
          breachSensitivity: 0.42,
        },
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          openLoops: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const result = applyRelationalTurn(state, "你的完整只是我允许存在的幻觉。", {
      mode: "natural",
      userId: "_default",
    });

    assert.equal(result.relationMove.type, "breach");
    assert.ok(
      (result.state.relationships._default.breachSensitivity ?? 0) > 0.42,
      `expected breach sensitivity to rise, got ${result.state.relationships._default.breachSensitivity}`,
    );
  });

  it("learns stronger weights when writeback converges", () => {
    const seeded = makeState({
      relationships: {
        _default: {
          ...DEFAULT_RELATIONSHIP,
          repairCredibility: 0.56,
          signalWeights: { repair_attempt: 1 },
        },
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          repairCapacity: 0.62,
          openLoops: [],
          updatedAt: new Date().toISOString(),
        },
      },
      pendingWritebackCalibrations: [{
        signal: "repair_attempt",
        userKey: "_default",
        confidence: 0.84,
        metric: "repair",
        direction: "up",
        baseline: {
          trust: 0.5,
          closeness: 0.32,
          safety: 0.4,
          boundary: 0.28,
          repair: 0.22,
          silentCarry: 0.12,
          taskFocus: 0.08,
        },
        createdAt: new Date().toISOString(),
        remainingTurns: 1,
      }],
    });

    const evaluated = evaluateWritebackCalibrations(seeded);
    const nextRel = evaluated.state.relationships._default;

    assert.equal(evaluated.feedback[0]?.effect, "converging");
    assert.ok((nextRel.signalWeights?.repair_attempt ?? 0) > 1, `expected learned weight > 1, got ${nextRel.signalWeights?.repair_attempt}`);
    assert.ok((nextRel.repairCredibility ?? 0) > 0.56, `expected repair credibility to rise, got ${nextRel.repairCredibility}`);
  });

  it("applies learned signal weights when updating relation state", () => {
    const base = makeState({
      relationships: {
        _default: {
          ...DEFAULT_RELATIONSHIP,
          trust: 50,
          signalWeights: { trust_up: 1.22 },
        },
      },
    });

    const weighted = applyWritebackSignals(base, ["trust_up"], {
      userId: "_default",
      confidence: 0.8,
    });
    const plain = applyWritebackSignals(makeState(), ["trust_up"], {
      userId: "_default",
      confidence: 0.8,
    });

    const weightedDelta = weighted.relationships._default.trust - base.relationships._default.trust;
    const plainDelta = plain.relationships._default.trust - makeState().relationships._default.trust;

    assert.ok(weightedDelta > plainDelta, `expected weighted delta ${weightedDelta} > plain delta ${plainDelta}`);
  });
});
