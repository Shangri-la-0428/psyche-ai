import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeAutonomicState,
  computeAutonomicResult,
  gateEmotions,
  getTransitionTime,
  describeAutonomicState,
} from "../src/autonomic.js";
import { DEFAULT_DRIVES } from "../src/types.js";
import type { SelfState, InnateDrives, Locale } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeState(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 50, order: 50, boundary: 50, resonance: 50, ...overrides };
}

function makeDrives(overrides: Partial<InnateDrives> = {}): InnateDrives {
  return { ...DEFAULT_DRIVES, ...overrides };
}

// ── computeAutonomicState ────────────────────────────────────

describe("computeAutonomicState", () => {
  it("low CORT + adequate HT + adequate OT → ventral-vagal", () => {
    const chem = makeState({ boundary: 25, order: 60, resonance: 55 });
    assert.equal(computeAutonomicState(chem, makeDrives()), "ventral-vagal");
  });

  it("low order + high flow → sympathetic (fight/flight)", () => {
    // stress = 100 - order = 85, arousal = flow = 85 → both >= 65 → sympathetic
    const chem = makeState({ order: 15, flow: 85 });
    assert.equal(computeAutonomicState(chem, makeDrives()), "sympathetic");
  });

  it("very low order + low flow → dorsal-vagal (freeze/shutdown)", () => {
    // stress = 100 - 10 = 90 >= 80, arousal = flow = 15 <= 25, flow = 15 <= 20 → dorsal
    const chem = makeState({ order: 10, flow: 15 });
    assert.equal(computeAutonomicState(chem, makeDrives()), "dorsal-vagal");
  });

  it("moderate chemistry → ventral-vagal (default safe state)", () => {
    const chem = makeState(); // all 50
    assert.equal(computeAutonomicState(chem, makeDrives()), "ventral-vagal");
  });

  it("all drives satisfied → ventral-vagal", () => {
    const chem = makeState({ boundary: 30, order: 60 });
    const drives = makeDrives({ survival: 90, safety: 85, connection: 80, esteem: 75, curiosity: 80 });
    assert.equal(computeAutonomicState(chem, drives), "ventral-vagal");
  });

  it("very low survival drive → sympathetic (threat)", () => {
    // Need stress >= 55 (order <= 45) and arousal >= 55 (flow >= 55) plus survival < 20
    const chem = makeState({ order: 40, flow: 60 });
    const drives = makeDrives({ survival: 10 });
    assert.equal(computeAutonomicState(chem, drives), "sympathetic");
  });

  it("very low safety drive → sympathetic", () => {
    // Need stress >= 55 and arousal >= 55 plus safety < 20
    const chem = makeState({ order: 40, flow: 60 });
    const drives = makeDrives({ safety: 10 });
    assert.equal(computeAutonomicState(chem, drives), "sympathetic");
  });

  it("multiple low drives → dorsal-vagal", () => {
    // Need 3+ low drives, stress >= 70 (order <= 30), and arousal <= 30 or flow <= 20
    const chem = makeState({ order: 20, flow: 15 });
    const drives = makeDrives({ survival: 15, safety: 15, connection: 15 });
    assert.equal(computeAutonomicState(chem, drives), "dorsal-vagal");
  });

  it("edge: all chemicals at 50 → ventral-vagal", () => {
    const chem = makeState();
    assert.equal(computeAutonomicState(chem, makeDrives()), "ventral-vagal");
  });

  it("edge: order=0, flow=100 → sympathetic", () => {
    // stress = 100, arousal = 100 → both >= 65 → sympathetic
    const chem = makeState({ order: 0, flow: 100 });
    assert.equal(computeAutonomicState(chem, makeDrives()), "sympathetic");
  });

  it("edge: order=0, flow=0 → dorsal-vagal", () => {
    // stress = 100 >= 80, arousal = 0 <= 25, flow = 0 <= 20 → dorsal
    const chem = makeState({ order: 0, flow: 0 });
    assert.equal(computeAutonomicState(chem, makeDrives()), "dorsal-vagal");
  });

  it("gradual: order=50 should still be ventral-vagal (thresholds not too sensitive)", () => {
    // stress = 50, not exceeding any threshold
    const chem = makeState({ order: 50 });
    assert.equal(computeAutonomicState(chem, makeDrives()), "ventral-vagal");
  });

  it("happy profile → ventral-vagal", () => {
    const chem: SelfState = { flow: 60, order: 80, boundary: 20, resonance: 70 };
    assert.equal(computeAutonomicState(chem, makeDrives()), "ventral-vagal");
  });

  it("stressed profile → sympathetic", () => {
    // stress = 100-20 = 80, arousal = flow = 80 → both >= 65 → sympathetic
    const chem: SelfState = { flow: 80, order: 20, boundary: 80, resonance: 20 };
    assert.equal(computeAutonomicState(chem, makeDrives()), "sympathetic");
  });

  it("collapsed profile → dorsal-vagal", () => {
    // stress = 100-10 = 90 >= 80, arousal = flow = 15 <= 25, flow = 15 <= 20 → dorsal
    const chem: SelfState = { flow: 15, order: 10, boundary: 85, resonance: 10 };
    assert.equal(computeAutonomicState(chem, makeDrives()), "dorsal-vagal");
  });
});

// ── gateEmotions ─────────────────────────────────────────────

describe("gateEmotions", () => {
  it("ventral-vagal: allows all emotions (no gating)", () => {
    const emotions = ["excited joy", "warm intimacy", "focused alertness", "melancholic introspection"];
    const result = gateEmotions("ventral-vagal", emotions);
    assert.deepStrictEqual(result, emotions);
  });

  it("ventral-vagal: returns input emotions unchanged", () => {
    const emotions = ["playful mischief", "deep contentment", "anxious tension"];
    const result = gateEmotions("ventral-vagal", emotions);
    assert.equal(result.length, emotions.length);
    for (const e of emotions) {
      assert.ok(result.includes(e), `${e} should be in result`);
    }
  });

  // Gating removed: 4D quality scoring is the sole arbiter of emotion selection.
  // Sympathetic state no longer blocks positive emotions — the experiential field
  // naturally selects stress-appropriate emotions via dimension scoring.
  it("sympathetic: passes all emotions through (4D scoring is the arbiter)", () => {
    const all = ["deep contentment", "warm intimacy", "playful mischief", "anxious tension", "focused alertness", "righteous anger"];
    const result = gateEmotions("sympathetic", all);
    assert.deepStrictEqual(result, all, "all emotions should pass through in any autonomic state");
  });

  it("sympathetic: allows 'anxious tension'", () => {
    const result = gateEmotions("sympathetic", ["anxious tension"]);
    assert.ok(result.includes("anxious tension"));
  });

  it("sympathetic: allows 'focused alertness'", () => {
    const result = gateEmotions("sympathetic", ["focused alertness"]);
    assert.ok(result.includes("focused alertness"));
  });

  it("sympathetic: allows 'righteous anger'", () => {
    const result = gateEmotions("sympathetic", ["righteous anger"]);
    assert.ok(result.includes("righteous anger"));
  });

  it("dorsal-vagal: allows 'emotional numbness'", () => {
    const result = gateEmotions("dorsal-vagal", ["emotional numbness", "excited joy"]);
    assert.ok(result.includes("emotional numbness"));
  });

  it("dorsal-vagal: allows 'melancholic introspection'", () => {
    const result = gateEmotions("dorsal-vagal", ["melancholic introspection"]);
    assert.ok(result.includes("melancholic introspection"));
  });

  it("dorsal-vagal: allows 'burnout'", () => {
    const result = gateEmotions("dorsal-vagal", ["burnout"]);
    assert.ok(result.includes("burnout"));
  });

  // Gating removed: dorsal-vagal no longer whitelists emotions.
  it("dorsal-vagal: passes all emotions through (4D scoring is the arbiter)", () => {
    const all = ["excited joy", "playful mischief", "warm intimacy", "emotional numbness", "burnout"];
    const result = gateEmotions("dorsal-vagal", all);
    assert.deepStrictEqual(result, all, "all emotions should pass through in any autonomic state");
  });

  it("empty emotion list returns empty for any state", () => {
    assert.deepStrictEqual(gateEmotions("ventral-vagal", []), []);
    assert.deepStrictEqual(gateEmotions("sympathetic", []), []);
    assert.deepStrictEqual(gateEmotions("dorsal-vagal", []), []);
  });

  it("unknown emotion strings pass through ungated for ventral-vagal", () => {
    const result = gateEmotions("ventral-vagal", ["totally_made_up_emotion", "xyzzy"]);
    assert.deepStrictEqual(result, ["totally_made_up_emotion", "xyzzy"]);
  });
});

// ── getTransitionTime ────────────────────────────────────────

describe("getTransitionTime", () => {
  it("ventral-vagal → sympathetic: fast (1-3 minutes)", () => {
    const t = getTransitionTime("ventral-vagal", "sympathetic");
    assert.ok(t >= 1 && t <= 3, `expected 1-3 min, got ${t}`);
  });

  it("sympathetic → dorsal-vagal: moderate (5-10 minutes)", () => {
    const t = getTransitionTime("sympathetic", "dorsal-vagal");
    assert.ok(t >= 5 && t <= 10, `expected 5-10 min, got ${t}`);
  });

  it("dorsal-vagal → sympathetic: moderate (10-15 minutes)", () => {
    const t = getTransitionTime("dorsal-vagal", "sympathetic");
    assert.ok(t >= 10 && t <= 15, `expected 10-15 min, got ${t}`);
  });

  it("dorsal-vagal → ventral-vagal: slow (20-30 minutes)", () => {
    const t = getTransitionTime("dorsal-vagal", "ventral-vagal");
    assert.ok(t >= 20 && t <= 30, `expected 20-30 min, got ${t}`);
  });

  it("sympathetic → ventral-vagal: moderate (5-15 minutes)", () => {
    const t = getTransitionTime("sympathetic", "ventral-vagal");
    assert.ok(t >= 5 && t <= 15, `expected 5-15 min, got ${t}`);
  });

  it("same state → same state: 0 minutes (no transition)", () => {
    assert.equal(getTransitionTime("ventral-vagal", "ventral-vagal"), 0);
    assert.equal(getTransitionTime("sympathetic", "sympathetic"), 0);
    assert.equal(getTransitionTime("dorsal-vagal", "dorsal-vagal"), 0);
  });

  it("asymmetric: downward transitions are faster than upward", () => {
    const downToSympathetic = getTransitionTime("ventral-vagal", "sympathetic");
    const upToVentral = getTransitionTime("sympathetic", "ventral-vagal");
    assert.ok(downToSympathetic < upToVentral,
      `ventral→sympathetic (${downToSympathetic}) should be faster than sympathetic→ventral (${upToVentral})`);
  });

  it("asymmetric: collapse faster than recovery from freeze", () => {
    const collapse = getTransitionTime("sympathetic", "dorsal-vagal");
    const recovery = getTransitionTime("dorsal-vagal", "sympathetic");
    assert.ok(collapse < recovery,
      `sympathetic→dorsal (${collapse}) should be faster than dorsal→sympathetic (${recovery})`);
  });

  it("ventral-vagal → dorsal-vagal: should not be a direct fast path", () => {
    const direct = getTransitionTime("ventral-vagal", "dorsal-vagal");
    const viaSymp = getTransitionTime("ventral-vagal", "sympathetic")
                   + getTransitionTime("sympathetic", "dorsal-vagal");
    // Direct path should take at least as long as the two-step path
    assert.ok(direct >= viaSymp,
      `direct ventral→dorsal (${direct}) should be >= two-step (${viaSymp})`);
  });

  it("all transitions return non-negative values", () => {
    const states = ["ventral-vagal", "sympathetic", "dorsal-vagal"] as const;
    for (const from of states) {
      for (const to of states) {
        assert.ok(getTransitionTime(from, to) >= 0, `${from}→${to} should be >= 0`);
      }
    }
  });
});

// ── computeAutonomicResult ───────────────────────────────────

describe("computeAutonomicResult", () => {
  it("first call (previousState=null) → immediate state, transitionProgress=1", () => {
    const chem = makeState({ boundary: 25, order: 60 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.equal(result.transitionProgress, 1);
    assert.equal(result.state, computeAutonomicState(chem, makeDrives()));
  });

  it("same state maintained → transitionProgress=1", () => {
    const chem = makeState({ boundary: 25, order: 60 });
    const result = computeAutonomicResult(chem, makeDrives(), "ventral-vagal", 5);
    assert.equal(result.state, "ventral-vagal");
    assert.equal(result.transitionProgress, 1);
  });

  it("transition from ventral to sympathetic with only 1 minute → partial progress", () => {
    // Need sympathetic: stress >= 65 (order <= 35) && arousal >= 65 (flow >= 65)
    const chem = makeState({ order: 15, flow: 85 });
    // Force a transition: previous was ventral-vagal, chemistry says sympathetic
    const result = computeAutonomicResult(chem, makeDrives(), "ventral-vagal", 0.5);
    // With < full transition time elapsed, progress should be partial
    assert.ok(result.transitionProgress > 0, "should have some progress");
    assert.ok(result.transitionProgress <= 1, "should not exceed 1");
  });

  it("transition from dorsal to ventral with 30 minutes → full transitionProgress", () => {
    const chem = makeState({ boundary: 25, order: 60, resonance: 55 });
    const result = computeAutonomicResult(chem, makeDrives(), "dorsal-vagal", 30);
    assert.equal(result.transitionProgress, 1);
  });

  it("result includes gated emotion categories based on state", () => {
    // sympathetic state should gate positive social emotions
    const chem = makeState({ order: 15, flow: 85 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.equal(result.state, "sympathetic");
    assert.ok(Array.isArray(result.gatedEmotionCategories));
    assert.ok(result.gatedEmotionCategories.length > 0,
      "sympathetic state should gate some emotion categories");
  });

  it("ventral-vagal result has no gated categories", () => {
    const chem = makeState({ boundary: 25, order: 60, resonance: 55 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.equal(result.state, "ventral-vagal");
    assert.equal(result.gatedEmotionCategories.length, 0);
  });

  it("result includes locale-appropriate description (zh)", () => {
    const chem = makeState({ boundary: 25, order: 60 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0, "zh");
    assert.ok(result.description.length > 0);
    assert.ok(typeof result.description === "string");
  });

  it("result includes locale-appropriate description (en)", () => {
    const chem = makeState({ boundary: 25, order: 60 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0, "en");
    assert.ok(result.description.length > 0);
    assert.ok(typeof result.description === "string");
  });

  it("after full transition, new state is applied", () => {
    const chem = makeState({ order: 15, flow: 85 });
    const result = computeAutonomicResult(chem, makeDrives(), "ventral-vagal", 10);
    // After enough time, should be fully transitioned to sympathetic
    assert.equal(result.state, "sympathetic");
    assert.equal(result.transitionProgress, 1);
  });

  it("short time does not fully transition (inertia)", () => {
    // dorsal-vagal → ventral-vagal requires 20-30 minutes
    const chem = makeState({ boundary: 25, order: 60, resonance: 55 });
    const result = computeAutonomicResult(chem, makeDrives(), "dorsal-vagal", 5);
    // With only 5 minutes, should not be fully transitioned
    assert.ok(result.transitionProgress < 1,
      `expected partial progress, got ${result.transitionProgress}`);
  });

  it("result has all required fields", () => {
    const chem = makeState();
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.ok("state" in result);
    assert.ok("transitionProgress" in result);
    assert.ok("gatedEmotionCategories" in result);
    assert.ok("description" in result);
  });

  it("transitionProgress is always between 0 and 1", () => {
    const scenarios = [
      { chem: makeState({ order: 15, flow: 85 }), prev: "ventral-vagal" as const, min: 0.1 },
      { chem: makeState({ order: 60 }), prev: "dorsal-vagal" as const, min: 2 },
      { chem: makeState({ order: 10, flow: 15 }), prev: "sympathetic" as const, min: 3 },
    ];
    for (const { chem, prev, min } of scenarios) {
      const result = computeAutonomicResult(chem, makeDrives(), prev, min);
      assert.ok(result.transitionProgress >= 0 && result.transitionProgress <= 1,
        `transitionProgress should be 0-1, got ${result.transitionProgress}`);
    }
  });
});

// ── describeAutonomicState ───────────────────────────────────

describe("describeAutonomicState", () => {
  it("ventral-vagal in zh: includes relevant Chinese terms", () => {
    const desc = describeAutonomicState("ventral-vagal", "zh");
    assert.ok(
      desc.includes("安全") || desc.includes("社交参与") || desc.includes("腹侧"),
      `expected Chinese safety/engagement terms, got: ${desc}`,
    );
  });

  it("sympathetic in zh: includes relevant Chinese terms", () => {
    const desc = describeAutonomicState("sympathetic", "zh");
    assert.ok(
      desc.includes("警觉") || desc.includes("战斗") || desc.includes("动员") || desc.includes("交感"),
      `expected Chinese alertness terms, got: ${desc}`,
    );
  });

  it("dorsal-vagal in zh: includes relevant Chinese terms", () => {
    const desc = describeAutonomicState("dorsal-vagal", "zh");
    assert.ok(
      desc.includes("冻结") || desc.includes("关闭") || desc.includes("保护") || desc.includes("背侧"),
      `expected Chinese freeze/shutdown terms, got: ${desc}`,
    );
  });

  it("ventral-vagal in en: includes relevant English terms", () => {
    const desc = describeAutonomicState("ventral-vagal", "en");
    const lower = desc.toLowerCase();
    assert.ok(
      lower.includes("safe") || lower.includes("socially engaged") || lower.includes("ventral"),
      `expected English safety terms, got: ${desc}`,
    );
  });

  it("sympathetic in en: includes relevant English terms", () => {
    const desc = describeAutonomicState("sympathetic", "en");
    const lower = desc.toLowerCase();
    assert.ok(
      lower.includes("alert") || lower.includes("mobilized") || lower.includes("fight") || lower.includes("sympathetic"),
      `expected English alertness terms, got: ${desc}`,
    );
  });

  it("dorsal-vagal in en: includes relevant English terms", () => {
    const desc = describeAutonomicState("dorsal-vagal", "en");
    const lower = desc.toLowerCase();
    assert.ok(
      lower.includes("freeze") || lower.includes("shutdown") || lower.includes("protective") || lower.includes("dorsal"),
      `expected English freeze/shutdown terms, got: ${desc}`,
    );
  });

  it("all states return non-empty strings", () => {
    const states = ["ventral-vagal", "sympathetic", "dorsal-vagal"] as const;
    const locales: Locale[] = ["zh", "en"];
    for (const state of states) {
      for (const locale of locales) {
        const desc = describeAutonomicState(state, locale);
        assert.ok(desc.length > 0, `${state}/${locale} should not be empty`);
      }
    }
  });

  it("description length is reasonable (< 200 chars)", () => {
    const states = ["ventral-vagal", "sympathetic", "dorsal-vagal"] as const;
    const locales: Locale[] = ["zh", "en"];
    for (const state of states) {
      for (const locale of locales) {
        const desc = describeAutonomicState(state, locale);
        assert.ok(desc.length < 200,
          `${state}/${locale} description too long (${desc.length} chars): ${desc}`);
      }
    }
  });
});

// ── computeProcessingDepth (P10: Dual Process) ──────────────

import { computeProcessingDepth } from "../src/autonomic.js";

describe("computeProcessingDepth", () => {
  const baseline = makeState(); // all 50

  // ── Dorsal-vagal: always depth ≈ 0 ──
  it("dorsal-vagal → depth near 0 (no reflective capacity)", () => {
    const result = computeProcessingDepth("dorsal-vagal", makeState({ order: 10, flow: 10 }), baseline);
    assert.ok(result.depth < 0.15, `expected depth < 0.15, got ${result.depth}`);
  });

  it("dorsal-vagal → skips all expensive stages", () => {
    const result = computeProcessingDepth("dorsal-vagal", makeState({ order: 15, flow: 15 }), baseline);
    assert.ok(result.skippedStages.includes("metacognition"));
    assert.ok(result.skippedStages.includes("ethics"));
    assert.ok(result.skippedStages.includes("shared-intentionality"));
    assert.ok(result.skippedStages.includes("experiential-field"));
    assert.ok(result.skippedStages.includes("generative-self"));
  });

  // ── Sympathetic + high stress (low order) ──
  it("sympathetic + low order → depth 0.1-0.3 (fight mode, only instinct)", () => {
    // stress = 100 - 25 = 75 >= 60
    const result = computeProcessingDepth("sympathetic", makeState({ order: 25, flow: 80 }), baseline);
    assert.ok(result.depth >= 0.05 && result.depth <= 0.35,
      `expected 0.05-0.35, got ${result.depth}`);
  });

  it("sympathetic + high stress → skips ethics, shared-intentionality, generative-self", () => {
    // stress = 100 - 30 = 70 >= 60
    const result = computeProcessingDepth("sympathetic", makeState({ order: 30, flow: 75 }), baseline);
    assert.ok(result.skippedStages.includes("ethics"));
    assert.ok(result.skippedStages.includes("shared-intentionality"));
    assert.ok(result.skippedStages.includes("generative-self"));
  });

  // ── Sympathetic + moderate stress ──
  it("sympathetic + moderate stress → depth 0.15-0.55 (alert but can judge)", () => {
    // stress = 100 - 50 = 50 < 60 → baseDepth=0.35
    const result = computeProcessingDepth("sympathetic", makeState({ order: 50, flow: 55 }), baseline);
    assert.ok(result.depth >= 0.15 && result.depth <= 0.55,
      `expected 0.15-0.55, got ${result.depth}`);
  });

  // ── Ventral-vagal + state far from baseline ──
  it("ventral-vagal + high state deviation → depth 0.4-0.8", () => {
    const chem = makeState({ flow: 80, boundary: 20, resonance: 85 }); // far from baseline
    const result = computeProcessingDepth("ventral-vagal", chem, baseline);
    assert.ok(result.depth >= 0.4 && result.depth <= 0.8,
      `expected 0.4-0.8, got ${result.depth}`);
  });

  it("ventral-vagal + strong emotions → skips generative-self only", () => {
    const chem = makeState({ flow: 80, boundary: 20, resonance: 85 });
    const result = computeProcessingDepth("ventral-vagal", chem, baseline);
    // Should only skip generative-self at most
    assert.ok(!result.skippedStages.includes("metacognition"),
      "should not skip metacognition in ventral-vagal");
  });

  // ── Ventral-vagal + chemistry near baseline ──
  it("ventral-vagal + calm chemistry → depth 0.8-1.0 (full reflection)", () => {
    const chem = makeState(); // all 50, same as baseline
    const result = computeProcessingDepth("ventral-vagal", chem, baseline);
    assert.ok(result.depth >= 0.75, `expected depth >= 0.75, got ${result.depth}`);
  });

  it("ventral-vagal + calm → skips nothing", () => {
    const result = computeProcessingDepth("ventral-vagal", makeState(), baseline);
    assert.equal(result.skippedStages.length, 0, "should skip no stages");
  });

  // ── Boundary tests ──
  it("order=41 in sympathetic → different depth than order=40", () => {
    // stress = 100 - 41 = 59, stress = 100 - 40 = 60
    // stress >= 60 → baseDepth=0.15, stress < 60 → baseDepth=0.35
    const r41 = computeProcessingDepth("sympathetic", makeState({ order: 41, flow: 60 }), baseline);
    const r40 = computeProcessingDepth("sympathetic", makeState({ order: 40, flow: 60 }), baseline);
    // order=40 → stress=60 → lower depth; order=41 → stress=59 → higher depth
    assert.ok(r41.depth >= r40.depth,
      `order=41 depth (${r41.depth}) should be >= order=40 depth (${r40.depth})`);
  });

  it("depth is always between 0 and 1", () => {
    const scenarios = [
      { state: "dorsal-vagal" as const, chem: makeState({ order: 0, flow: 0 }) },
      { state: "sympathetic" as const, chem: makeState({ order: 0, flow: 100 }) },
      { state: "sympathetic" as const, chem: makeState({ order: 50, flow: 55 }) },
      { state: "ventral-vagal" as const, chem: makeState({ flow: 100, resonance: 100 }) },
      { state: "ventral-vagal" as const, chem: makeState() },
    ];
    for (const { state, chem } of scenarios) {
      const result = computeProcessingDepth(state, chem, baseline);
      assert.ok(result.depth >= 0 && result.depth <= 1,
        `${state}: depth should be 0-1, got ${result.depth}`);
    }
  });

  it("skippedStages only contains valid stage names", () => {
    const validStages = new Set([
      "metacognition", "ethics", "shared-intentionality",
      "experiential-field", "generative-self",
    ]);
    const result = computeProcessingDepth("sympathetic", makeState({ order: 15, flow: 85 }), baseline);
    for (const stage of result.skippedStages) {
      assert.ok(validStages.has(stage), `unknown stage: ${stage}`);
    }
  });

  // ── Depth → stage mapping consistency ──
  it("depth < 0.2 → skips 5 stages", () => {
    const result = computeProcessingDepth("dorsal-vagal", makeState({ order: 10, flow: 10 }), baseline);
    assert.ok(result.depth < 0.2);
    assert.equal(result.skippedStages.length, 5);
  });

  it("depth >= 0.8 → skips 0 stages", () => {
    const result = computeProcessingDepth("ventral-vagal", makeState(), baseline);
    assert.ok(result.depth >= 0.8);
    assert.equal(result.skippedStages.length, 0);
  });

  // ── Integration: computeAutonomicResult includes processingDepth ──
  it("computeAutonomicResult includes processingDepth and skippedStages", () => {
    const chem = makeState();
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.ok("processingDepth" in result, "should have processingDepth");
    assert.ok("skippedStages" in result, "should have skippedStages");
    assert.ok(typeof result.processingDepth === "number");
    assert.ok(Array.isArray(result.skippedStages));
  });

  it("ventral-vagal calm result → high processingDepth", () => {
    const chem = makeState({ boundary: 25, order: 60 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.equal(result.state, "ventral-vagal");
    assert.ok(result.processingDepth >= 0.6,
      `expected high depth for calm ventral-vagal, got ${result.processingDepth}`);
  });

  it("sympathetic stressed result → low processingDepth", () => {
    const chem = makeState({ order: 15, flow: 85 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.equal(result.state, "sympathetic");
    assert.ok(result.processingDepth < 0.4,
      `expected low depth for sympathetic, got ${result.processingDepth}`);
  });

  it("dorsal-vagal result → near-zero processingDepth", () => {
    const chem = makeState({ order: 10, flow: 15 });
    const result = computeAutonomicResult(chem, makeDrives(), null, 0);
    assert.equal(result.state, "dorsal-vagal");
    assert.ok(result.processingDepth < 0.15,
      `expected near-zero depth for dorsal-vagal, got ${result.processingDepth}`);
  });

  // ── Chemical deviation effect on depth ──
  it("more chemical deviation → lower depth within same autonomic state", () => {
    const calm = computeProcessingDepth("ventral-vagal", makeState(), baseline);
    const excited = computeProcessingDepth("ventral-vagal", makeState({ flow: 80 }), baseline);
    assert.ok(calm.depth > excited.depth,
      `calm depth (${calm.depth}) should be > excited depth (${excited.depth})`);
  });

  it("symmetry: deviation in positive vs negative direction has same effect on depth", () => {
    const highDA = computeProcessingDepth("ventral-vagal", makeState({ flow: 80 }), baseline);
    const lowDA = computeProcessingDepth("ventral-vagal", makeState({ flow: 20 }), baseline);
    // Same magnitude of deviation → similar depth
    assert.ok(Math.abs(highDA.depth - lowDA.depth) < 0.15,
      `same deviation magnitude should give similar depth: ${highDA.depth} vs ${lowDA.depth}`);
  });
});
