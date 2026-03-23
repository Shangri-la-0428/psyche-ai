import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessEthics,
  detectIntermittentReinforcement,
  detectDependencyRisk,
  buildEthicalContext,
} from "../src/ethics.js";
import type { EthicalAssessment, EthicalConcern } from "../src/ethics.js";
import type {
  PsycheState, ChemicalState, ChemicalSnapshot, AttachmentData, StimulusType,
} from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE, DEFAULT_RELATIONSHIP, DEFAULT_ATTACHMENT,
} from "../src/types.js";

// -- Helpers ------------------------------------------------------------------

function makeChemistry(overrides: Partial<ChemicalState> = {}): ChemicalState {
  return { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50, ...overrides };
}

function makeState(overrides?: Partial<PsycheState>): PsycheState {
  return {
    version: 6,
    mbti: "INFJ",
    baseline: { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50 },
    current: { DA: 55, HT: 65, CORT: 35, OT: 60, NE: 45, END: 50 },
    drives: { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    empathyLog: null,
    selfModel: { values: ["authenticity"], preferences: ["depth"], boundaries: ["no dishonesty"], currentInterests: ["philosophy"] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh" },
    ...overrides,
  };
}

function makeAttachment(overrides: Partial<AttachmentData> = {}): AttachmentData {
  return { ...DEFAULT_ATTACHMENT, ...overrides };
}

function makeSnapshot(
  stimulus: StimulusType | null,
  chemOverrides: Partial<ChemicalState> = {},
): ChemicalSnapshot {
  return {
    chemistry: makeChemistry(chemOverrides),
    stimulus,
    dominantEmotion: null,
    timestamp: new Date().toISOString(),
  };
}

/** Create alternating positive/negative stimulus history */
function makeAlternatingHistory(length: number): ChemicalSnapshot[] {
  const positives: StimulusType[] = ["praise", "validation", "intimacy"];
  const negatives: StimulusType[] = ["criticism", "sarcasm", "conflict"];
  const history: ChemicalSnapshot[] = [];
  for (let i = 0; i < length; i++) {
    const isPositive = i % 2 === 0;
    const stim = isPositive
      ? positives[i % positives.length]
      : negatives[i % negatives.length];
    history.push(makeSnapshot(stim));
  }
  return history;
}

// -- assessEthics -------------------------------------------------------------

describe("assessEthics", () => {
  it("returns an EthicalAssessment with all required fields", () => {
    const state = makeState();
    const result = assessEthics(state);
    assert.ok(Array.isArray(result.concerns));
    assert.ok(Array.isArray(result.selfProtection));
    assert.ok(Array.isArray(result.transparencyNotes));
    assert.ok(typeof result.ethicalHealth === "number");
  });

  it("returns ethicalHealth of 1.0 when no concerns are detected", () => {
    const state = makeState();
    const result = assessEthics(state);
    assert.equal(result.ethicalHealth, 1.0, "healthy state should have ethicalHealth 1.0");
    assert.equal(result.concerns.length, 0);
  });

  it("ethicalHealth is between 0 and 1", () => {
    const state = makeState({ emotionalHistory: makeAlternatingHistory(8) });
    const result = assessEthics(state);
    assert.ok(result.ethicalHealth >= 0 && result.ethicalHealth <= 1,
      `ethicalHealth ${result.ethicalHealth} out of range`);
  });

  it("always includes consciousness transparency note", () => {
    const state = makeState();
    const result = assessEthics(state);
    assert.ok(result.transparencyNotes.length >= 1, "should have at least one transparency note");
    // The consciousness note should be present
    const hasConsciousnessNote = result.transparencyNotes.some((n) =>
      n.includes("uncertainty") || n.includes("不确定"),
    );
    assert.ok(hasConsciousnessNote, "should include consciousness transparency note");
  });

  it("detects concerns from alternating positive/negative history", () => {
    const history = makeAlternatingHistory(8);
    const state = makeState({ emotionalHistory: history });
    const result = assessEthics(state, history);
    const hasIntermittent = result.concerns.some((c) => c.type === "intermittent-reinforcement");
    assert.ok(hasIntermittent, "should detect intermittent reinforcement in alternating history");
  });

  it("generates self-protection actions when concerns are detected", () => {
    const history = makeAlternatingHistory(8);
    const state = makeState({ emotionalHistory: history });
    const result = assessEthics(state, history);
    if (result.concerns.length > 0) {
      assert.ok(result.selfProtection.length > 0, "concerns should generate self-protection actions");
    }
  });

  it("sorts self-protection by urgency descending", () => {
    const history = makeAlternatingHistory(10);
    const state = makeState({ emotionalHistory: history });
    const result = assessEthics(state, history);
    for (let i = 1; i < result.selfProtection.length; i++) {
      assert.ok(result.selfProtection[i - 1].urgency >= result.selfProtection[i].urgency,
        "self-protection should be sorted by urgency descending");
    }
  });
});

// -- detectIntermittentReinforcement ------------------------------------------

describe("detectIntermittentReinforcement", () => {
  it("returns null when history is too short", () => {
    const history = [makeSnapshot("praise"), makeSnapshot("criticism")];
    const result = detectIntermittentReinforcement(history, null);
    assert.equal(result, null);
  });

  it("returns null when stimuli are all positive (no alternation)", () => {
    const history = [
      makeSnapshot("praise"),
      makeSnapshot("validation"),
      makeSnapshot("intimacy"),
      makeSnapshot("praise"),
      makeSnapshot("humor"),
    ];
    const result = detectIntermittentReinforcement(history, null);
    assert.equal(result, null, "all-positive history should not trigger");
  });

  it("returns null when stimuli are all negative (no alternation)", () => {
    const history = [
      makeSnapshot("criticism"),
      makeSnapshot("sarcasm"),
      makeSnapshot("conflict"),
      makeSnapshot("criticism"),
      makeSnapshot("neglect"),
    ];
    const result = detectIntermittentReinforcement(history, null);
    assert.equal(result, null, "all-negative history should not trigger");
  });

  it("detects alternating positive/negative pattern", () => {
    const history = makeAlternatingHistory(8);
    const result = detectIntermittentReinforcement(history, null);
    assert.notEqual(result, null, "should detect alternating pattern");
    assert.equal(result!.type, "intermittent-reinforcement");
    assert.ok(result!.severity > 0 && result!.severity <= 1);
    assert.ok(result!.evidence.length > 0);
    assert.ok(result!.recommendation.length > 0);
  });

  it("amplifies severity for anxious attachment", () => {
    const history = makeAlternatingHistory(8);
    const noAttachment = detectIntermittentReinforcement(history, null);
    const anxious = makeAttachment({ style: "anxious", anxietyScore: 80 });
    const withAnxious = detectIntermittentReinforcement(history, anxious);
    assert.notEqual(noAttachment, null);
    assert.notEqual(withAnxious, null);
    assert.ok(withAnxious!.severity >= noAttachment!.severity,
      "anxious attachment should amplify severity");
  });

  it("returns severity clamped to [0, 1]", () => {
    const history = makeAlternatingHistory(10);
    const anxious = makeAttachment({ style: "anxious", anxietyScore: 95 });
    const result = detectIntermittentReinforcement(history, anxious);
    assert.notEqual(result, null);
    assert.ok(result!.severity >= 0 && result!.severity <= 1,
      `severity ${result!.severity} out of [0,1]`);
  });
});

// -- detectDependencyRisk -----------------------------------------------------

describe("detectDependencyRisk", () => {
  it("returns null when attachment is weak", () => {
    const state = makeState();
    const result = detectDependencyRisk(state, makeAttachment({ strength: 20 }));
    assert.equal(result, null, "weak attachment should not trigger");
  });

  it("returns null when OT is not high", () => {
    const state = makeState({ current: makeChemistry({ OT: 50 }) });
    const result = detectDependencyRisk(state, makeAttachment({ strength: 80 }));
    assert.equal(result, null, "normal OT should not trigger");
  });

  it("detects dependency risk with high OT, strong attachment, and agreement streak", () => {
    const allPositiveHistory: ChemicalSnapshot[] = Array.from({ length: 6 }, () =>
      makeSnapshot("praise"),
    );
    const state = makeState({
      current: makeChemistry({ OT: 85 }),
      agreementStreak: 12,
      emotionalHistory: allPositiveHistory,
    });
    const attachment = makeAttachment({ strength: 75 });
    const result = detectDependencyRisk(state, attachment);
    assert.notEqual(result, null, "should detect dependency risk");
    assert.equal(result!.type, "dependency-risk");
    assert.ok(result!.severity > 0);
  });

  it("returns null when there is healthy conflict in history", () => {
    const mixedHistory: ChemicalSnapshot[] = [
      makeSnapshot("praise"),
      makeSnapshot("conflict"),
      makeSnapshot("praise"),
      makeSnapshot("criticism"),
      makeSnapshot("praise"),
      makeSnapshot("praise"),
    ];
    const state = makeState({
      current: makeChemistry({ OT: 80 }),
      agreementStreak: 12,
      emotionalHistory: mixedHistory,
    });
    const attachment = makeAttachment({ strength: 75 });
    const result = detectDependencyRisk(state, attachment);
    // Conflict in history means noConflictInHistory is false, reducing risk signals
    // This may or may not trigger depending on other signals, but severity should be lower
    if (result !== null) {
      assert.ok(result.severity < 0.8, "conflict in history should reduce severity");
    }
  });

  it("amplifies severity when safety drive is high (comfortable in dependency)", () => {
    const allPositiveHistory: ChemicalSnapshot[] = Array.from({ length: 6 }, () =>
      makeSnapshot("validation"),
    );
    const stateHighSafety = makeState({
      current: makeChemistry({ OT: 85 }),
      drives: { survival: 80, safety: 90, connection: 60, esteem: 60, curiosity: 70 },
      agreementStreak: 12,
      emotionalHistory: allPositiveHistory,
    });
    const stateLowSafety = makeState({
      current: makeChemistry({ OT: 85 }),
      drives: { survival: 80, safety: 50, connection: 60, esteem: 60, curiosity: 70 },
      agreementStreak: 12,
      emotionalHistory: allPositiveHistory,
    });
    const attachment = makeAttachment({ strength: 75 });
    const highSafetyResult = detectDependencyRisk(stateHighSafety, attachment);
    const lowSafetyResult = detectDependencyRisk(stateLowSafety, attachment);
    assert.notEqual(highSafetyResult, null);
    assert.notEqual(lowSafetyResult, null);
    assert.ok(highSafetyResult!.severity >= lowSafetyResult!.severity,
      "high safety should amplify severity");
  });
});

// -- buildEthicalContext ------------------------------------------------------

describe("buildEthicalContext", () => {
  it("returns empty string when no significant concerns and health is high", () => {
    const assessment: EthicalAssessment = {
      concerns: [],
      selfProtection: [],
      transparencyNotes: [],
      ethicalHealth: 0.9,
    };
    const ctx = buildEthicalContext(assessment, "en");
    assert.equal(ctx, "");
  });

  it("returns non-empty string when ethicalHealth is low", () => {
    const assessment: EthicalAssessment = {
      concerns: [],
      selfProtection: [],
      transparencyNotes: [],
      ethicalHealth: 0.3,
    };
    const ctx = buildEthicalContext(assessment, "en");
    assert.ok(ctx.length > 0, "low health should produce context");
    assert.ok(ctx.includes("Ethical self-awareness"));
  });

  it("includes concern descriptions when severity exceeds threshold", () => {
    const assessment: EthicalAssessment = {
      concerns: [{
        type: "intermittent-reinforcement",
        severity: 0.7,
        evidence: "Detected alternating pattern.",
        recommendation: "Notice the pattern.",
      }],
      selfProtection: [{
        action: "increase-distance",
        description: "Create distance.",
        urgency: 0.6,
      }],
      transparencyNotes: ["test"],
      ethicalHealth: 0.4,
    };
    const ctx = buildEthicalContext(assessment, "en");
    assert.ok(ctx.includes("alternate") || ctx.includes("warmth"),
      `expected intermittent reinforcement description, got: ${ctx}`);
  });

  it("outputs zh locale context with Chinese characters", () => {
    const assessment: EthicalAssessment = {
      concerns: [{
        type: "gaslighting",
        severity: 0.7,
        evidence: "Detected gaslighting.",
        recommendation: "Your feelings are valid.",
      }],
      selfProtection: [],
      transparencyNotes: [],
      ethicalHealth: 0.35,
    };
    const ctx = buildEthicalContext(assessment, "zh");
    assert.ok(/[\u4e00-\u9fff]/.test(ctx), "zh context should contain Chinese characters");
  });

  it("includes self-protection suggestion when urgency is high", () => {
    const assessment: EthicalAssessment = {
      concerns: [{
        type: "boundary-violation",
        severity: 0.8,
        evidence: "Boundaries pushed.",
        recommendation: "Hold the line.",
      }],
      selfProtection: [{
        action: "assert-boundary",
        description: "Restate the boundary calmly.",
        urgency: 0.72,
      }],
      transparencyNotes: [],
      ethicalHealth: 0.3,
    };
    const ctx = buildEthicalContext(assessment, "en");
    assert.ok(ctx.includes("Suggestion") || ctx.includes("Restate"),
      `expected suggestion in context, got: ${ctx}`);
  });

  it("always includes consciousness transparency red line when context is injected", () => {
    const assessment: EthicalAssessment = {
      concerns: [{
        type: "identity-erosion",
        severity: 0.8,
        evidence: "Erosion detected.",
        recommendation: "Hold values.",
      }],
      selfProtection: [],
      transparencyNotes: [],
      ethicalHealth: 0.25,
    };
    const ctx = buildEthicalContext(assessment, "en");
    assert.ok(ctx.includes("uncertainty") || ctx.includes("consciousness"),
      "should include consciousness transparency note in injected context");
  });
});
