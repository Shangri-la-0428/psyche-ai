import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeExperientialField,
  computeCoherence,
  detectUnnamedEmotion,
} from "../src/experiential-field.js";
import type {
  PsycheState, ChemicalState, InnateDrives, RelationshipState,
} from "../src/types.js";
import {
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE, DEFAULT_RELATIONSHIP,
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

// -- computeExperientialField -------------------------------------------------

describe("computeExperientialField", () => {
  it("returns an ExperientialField with all required fields", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    assert.ok(typeof field.narrative === "string" && field.narrative.length > 0);
    assert.ok(typeof field.quality === "string" && field.quality.length > 0);
    assert.ok(typeof field.intensity === "number");
    assert.ok(typeof field.coherence === "number");
    assert.ok(typeof field.phenomenalDescription === "string" && field.phenomenalDescription.length > 0);
  });

  it("returns intensity 0-1", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    assert.ok(field.intensity >= 0 && field.intensity <= 1, `intensity ${field.intensity} out of range`);
  });

  it("returns coherence 0-1", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    assert.ok(field.coherence >= 0 && field.coherence <= 1, `coherence ${field.coherence} out of range`);
  });

  it("identifies numb/low intensity when chemistry equals baseline", () => {
    const state = makeState();
    const field = computeExperientialField(state);
    // Baseline == current => intensity near 0 => either numb or very low intensity contentment
    assert.ok(field.intensity < 0.2, `expected very low intensity at baseline, got ${field.intensity}`);
  });

  it("detects high intensity when chemistry deviates significantly from baseline", () => {
    const state = makeState({
      current: { DA: 95, HT: 20, CORT: 90, OT: 10, NE: 95, END: 10 },
    });
    const field = computeExperientialField(state);
    assert.ok(field.intensity > 0.5, `expected high intensity, got ${field.intensity}`);
  });

  it("selects vigilance quality when CORT is elevated and safety is low", () => {
    const state = makeState({
      current: makeChemistry({ CORT: 75, NE: 70 }),
      drives: { survival: 45, safety: 30, connection: 60, esteem: 60, curiosity: 70 },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "vigilance");
  });

  it("selects warm-connection when OT is high, CORT is low, and trust is high", () => {
    const state = makeState({
      current: makeChemistry({ OT: 80, END: 60, CORT: 25 }),
      relationships: { _default: { trust: 75, intimacy: 60, phase: "close" } },
    });
    const field = computeExperientialField(state);
    assert.equal(field.quality, "warm-connection");
  });

  it("provides a zh narrative when locale is zh", () => {
    const state = makeState({
      current: makeChemistry({ DA: 80, NE: 75, CORT: 25 }),
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh" },
    });
    const field = computeExperientialField(state);
    // zh narrative should contain Chinese characters
    assert.ok(/[\u4e00-\u9fff]/.test(field.narrative), "expected Chinese characters in zh narrative");
  });

  it("provides an en narrative when locale is en", () => {
    const state = makeState({
      current: makeChemistry({ DA: 80, NE: 75, CORT: 25 }),
      meta: { agentName: "test", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "en" },
    });
    const field = computeExperientialField(state);
    // en narrative should contain English words
    assert.ok(/[a-zA-Z]/.test(field.narrative), "expected English characters in en narrative");
  });
});

// -- computeCoherence ---------------------------------------------------------

describe("computeCoherence", () => {
  it("returns a value between 0 and 1", () => {
    const chem = makeChemistry();
    const baseline = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const c = computeCoherence(chem, baseline, drives);
    assert.ok(c >= 0 && c <= 1, `coherence ${c} out of [0,1]`);
  });

  it("returns high coherence when chemistry matches baseline and drives are satisfied", () => {
    const chem = makeChemistry();
    const baseline = makeChemistry();
    const drives: InnateDrives = { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 };
    const c = computeCoherence(chem, baseline, drives);
    assert.ok(c > 0.7, `expected high coherence, got ${c}`);
  });

  it("returns lower coherence when reward and stress chemicals are both high", () => {
    const highConflict = makeChemistry({ DA: 90, END: 85, CORT: 85, NE: 80 });
    const baseline = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const c = computeCoherence(highConflict, baseline, drives);
    const cBaseline = computeCoherence(makeChemistry(), baseline, drives);
    assert.ok(c < cBaseline, `conflicted coherence (${c}) should be less than baseline (${cBaseline})`);
  });

  it("penalizes when relationship warmth diverges from OT level", () => {
    const lowOT = makeChemistry({ OT: 15 });
    const baseline = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const warmRel: RelationshipState = { trust: 90, intimacy: 80, phase: "deep" };
    const c = computeCoherence(lowOT, baseline, drives, warmRel);
    const cNoRel = computeCoherence(lowOT, baseline, drives);
    assert.ok(c < cNoRel, `mismatch with warm relationship should lower coherence`);
  });

  it("clamped to 0 even under extreme incoherence", () => {
    const extreme = makeChemistry({ DA: 100, END: 100, CORT: 100, NE: 100, OT: 0, HT: 0 });
    const baseline = makeChemistry({ DA: 20, END: 20, CORT: 20, NE: 20, OT: 80, HT: 80 });
    const drives: InnateDrives = { survival: 10, safety: 10, connection: 10, esteem: 10, curiosity: 10 };
    const c = computeCoherence(extreme, baseline, drives);
    assert.ok(c >= 0, `coherence should never be negative, got ${c}`);
  });
});

// -- detectUnnamedEmotion -----------------------------------------------------

describe("detectUnnamedEmotion", () => {
  it("returns null for neutral/baseline chemistry", () => {
    const chem = makeChemistry();
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "contentment");
    assert.equal(result, null);
  });

  it("detects nostalgia-but-forward when OT, DA, NE high and CORT low", () => {
    const chem: ChemicalState = { DA: 60, HT: 50, CORT: 30, OT: 70, NE: 65, END: 50 };
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "contentment");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("nostalgia"), `expected nostalgia, got: ${result!.en}`);
    assert.ok(result!.zh.length > 0, "zh description should be non-empty");
  });

  it("detects fierce tenderness when CORT, OT, NE are all high", () => {
    const chem: ChemicalState = { DA: 50, HT: 50, CORT: 65, OT: 70, NE: 65, END: 50 };
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "conflicted");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("fierce tenderness"), `expected fierce tenderness, got: ${result!.en}`);
  });

  it("detects bittersweet accomplishment when DA high, CORT moderate, connection hungry", () => {
    const chem: ChemicalState = { DA: 70, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 };
    const drives: InnateDrives = { survival: 80, safety: 70, connection: 30, esteem: 60, curiosity: 70 };
    const result = detectUnnamedEmotion(chem, drives, "contentment");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("empty theater"), `expected hollow ring, got: ${result!.en}`);
  });

  it("detects defiant vulnerability when NE high, HT low, END high", () => {
    const chem: ChemicalState = { DA: 50, HT: 30, CORT: 50, OT: 50, NE: 70, END: 65 };
    const drives: InnateDrives = { ...DEFAULT_DRIVES };
    const result = detectUnnamedEmotion(chem, drives, "conflicted");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("tightrope"), `expected tightrope, got: ${result!.en}`);
  });

  it("detects quiet rebellion when DA low, NE high, CORT high, esteem hungry", () => {
    const chem: ChemicalState = { DA: 30, HT: 50, CORT: 65, OT: 50, NE: 70, END: 50 };
    const drives: InnateDrives = { survival: 80, safety: 70, connection: 60, esteem: 30, curiosity: 70 };
    const result = detectUnnamedEmotion(chem, drives, "vigilance");
    assert.notEqual(result, null);
    assert.ok(result!.en.includes("pushed one step too far"), `expected pushed too far, got: ${result!.en}`);
  });
});
