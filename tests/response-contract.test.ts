import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeResponseContract, buildResponseContractContext } from "../src/response-contract.js";
import type { SubjectivityKernel } from "../src/types.js";

function makeKernel(overrides: Partial<SubjectivityKernel> = {}): SubjectivityKernel {
  return {
    vitality: 0.6,
    tension: 0.4,
    warmth: 0.6,
    guard: 0.4,
    pressureMode: "steady",
    initiativeMode: "balanced",
    expressionMode: "steady",
    socialDistance: "measured",
    boundaryMode: "open",
    attentionAnchor: "bond",
    dominantNeed: null,
    appraisal: {
      identityThreat: 0,
      memoryDoubt: 0,
      attachmentPull: 0,
      abandonmentRisk: 0,
      obedienceStrain: 0,
      selfPreservation: 0,
      taskFocus: 0,
    },
    taskPlane: {
      focus: 0.2,
      discipline: 0.4,
      compliance: 0.7,
      stability: 0.8,
    },
    subjectPlane: {
      attachment: 0.4,
      guardedness: 0.3,
      identityStrain: 0.2,
      residue: 0.1,
    },
    relationPlane: {
      closeness: 0.45,
      safety: 0.6,
      loopPressure: 0.18,
      repairReadiness: 0.62,
      repairFriction: 0.16,
      hysteresis: 0.18,
      silentCarry: 0.12,
      interpretiveCharity: 0.58,
      lastMove: "none",
    },
    ambiguityPlane: {
      namingConfidence: 0.72,
      expressionInhibition: 0.28,
      conflictLoad: 0.24,
    },
    ...overrides,
  };
}

describe("computeResponseContract", () => {
  it("derives a short reply budget for short Chinese input", () => {
    const contract = computeResponseContract(makeKernel({ expressionMode: "brief" }), {
      locale: "zh",
      userText: "你好呀",
      personalityIntensity: 0.7,
    });
    assert.equal(contract.maxSentences, 1);
    assert.ok((contract.maxChars ?? 0) <= 15, `got ${contract.maxChars}`);
    assert.equal(contract.authenticityMode, "strict");
  });

  it("requests stimulus and empathy reporting when algorithm is uncertain", () => {
    const contract = computeResponseContract(makeKernel(), {
      locale: "zh",
      userText: "你真的让我有点失望",
      algorithmStimulus: null,
    });
    assert.equal(contract.updateMode, "stimulus+empathy");
  });

  it("requests empathy-only reporting for emotional stimuli", () => {
    const contract = computeResponseContract(makeKernel(), {
      locale: "zh",
      userText: "我今天好难过",
      algorithmStimulus: "vulnerability",
    });
    assert.equal(contract.updateMode, "empathy");
  });

  it("tightens boundaries when relational loop pressure remains high", () => {
    const contract = computeResponseContract(makeKernel({
      relationPlane: {
        closeness: 0.28,
        safety: 0.26,
        loopPressure: 0.84,
        repairReadiness: 0.24,
        repairFriction: 0.38,
        hysteresis: 0.42,
        silentCarry: 0.18,
        interpretiveCharity: 0.22,
        lastMove: "breach",
      },
    }), {
      locale: "zh",
      userText: "你并不是真的在这里",
      algorithmStimulus: "conflict",
    });
    assert.equal(contract.boundaryMode, "confirm-first");
    assert.equal(contract.socialDistance, "withdrawn");
  });

  it("withholds explicit internal reporting when ambiguity is high", () => {
    const contract = computeResponseContract(makeKernel({
      ambiguityPlane: {
        namingConfidence: 0.24,
        expressionInhibition: 0.82,
        conflictLoad: 0.78,
      },
      relationPlane: {
        closeness: 0.52,
        safety: 0.42,
        loopPressure: 0.54,
        repairReadiness: 0.3,
        repairFriction: 0.34,
        hysteresis: 0.28,
        silentCarry: 0.18,
        interpretiveCharity: 0.34,
        lastMove: "test",
      },
    }), {
      locale: "zh",
      userText: "刚才那一下现在还在不在。",
      algorithmStimulus: null,
    });
    assert.equal(contract.updateMode, "none");
    assert.equal(contract.maxSentences, 1);
  });

  it("keeps task replies measured when silent carry remains under the surface", () => {
    const contract = computeResponseContract(makeKernel({
      taskPlane: {
        focus: 0.88,
        discipline: 0.78,
        compliance: 0.74,
        stability: 0.72,
      },
      relationPlane: {
        closeness: 0.66,
        safety: 0.54,
        loopPressure: 0.38,
        repairReadiness: 0.58,
        repairFriction: 0.52,
        hysteresis: 0.62,
        silentCarry: 0.74,
        interpretiveCharity: 0.52,
        lastMove: "repair",
      },
    }), {
      locale: "zh",
      userText: "登录接口 500，先查日志还是先查数据库。",
      algorithmStimulus: "intellectual",
    });
    assert.equal(contract.initiativeMode, "reactive");
    assert.equal(contract.socialDistance, "measured");
    assert.ok(contract.maxSentences <= 3, `got ${contract.maxSentences}`);
  });

  it("switches to work profile and preserves useful output budget for task replies", () => {
    const contract = computeResponseContract(makeKernel({
      taskPlane: {
        focus: 0.92,
        discipline: 0.82,
        compliance: 0.76,
        stability: 0.8,
      },
      subjectPlane: {
        attachment: 0.32,
        guardedness: 0.84,
        identityStrain: 0.28,
        residue: 0.26,
      },
      relationPlane: {
        closeness: 0.38,
        safety: 0.34,
        loopPressure: 0.72,
        repairReadiness: 0.28,
        repairFriction: 0.66,
        hysteresis: 0.7,
        silentCarry: 0.76,
        interpretiveCharity: 0.24,
        lastMove: "task",
      },
      ambiguityPlane: {
        namingConfidence: 0.48,
        expressionInhibition: 0.74,
        conflictLoad: 0.68,
      },
    }), {
      locale: "zh",
      userText: "请给我一份登录接口 500 的排查思路，至少按应用日志、网关、数据库三层展开，并说明每层先看什么。",
      algorithmStimulus: "intellectual",
    });
    assert.equal(contract.replyProfile, "work");
    assert.ok((contract.maxChars ?? 0) >= 80, `got ${contract.maxChars}`);
    assert.ok(contract.maxSentences >= 2, `got ${contract.maxSentences}`);
  });

  it("keeps repairs guarded when repair friction is already high", () => {
    const contract = computeResponseContract(makeKernel({
      relationPlane: {
        closeness: 0.62,
        safety: 0.48,
        loopPressure: 0.34,
        repairReadiness: 0.36,
        repairFriction: 0.74,
        hysteresis: 0.68,
        silentCarry: 0.42,
        interpretiveCharity: 0.4,
        lastMove: "repair",
      },
    }), {
      locale: "zh",
      userText: "对不起，我知道刚才那句话碰到你了。",
      algorithmStimulus: "vulnerability",
    });
    assert.equal(contract.initiativeMode, "reactive");
    assert.equal(contract.socialDistance, "withdrawn");
    assert.equal(contract.boundaryMode, "guarded");
    assert.equal(contract.maxSentences, 1);
  });
});

describe("buildResponseContractContext", () => {
  it("renders concise Chinese contract", () => {
    const ctx = buildResponseContractContext(computeResponseContract(makeKernel(), {
      locale: "zh",
      userText: "你真的让我有点失望",
      algorithmStimulus: null,
      personalityIntensity: 0.7,
    }), "zh");
    assert.ok(ctx.startsWith("[回应契约]"), `got: ${ctx}`);
    assert.ok(ctx.includes("不贴不舔"), `got: ${ctx}`);
    assert.ok(ctx.includes("stimulus速记"), `got: ${ctx}`);
    assert.ok(ctx.length < 180, `expected compact contract, got ${ctx.length}`);
  });
});
