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
    assert.ok(ctx.length < 120, `expected compact contract, got ${ctx.length}`);
  });
});
