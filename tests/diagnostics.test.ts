import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  runHealthCheck,
  DiagnosticCollector,
  generateReport,
  formatReport,
  toGitHubIssueBody,
  formatLogEntry,
  computeLayerHealthSummary,
} from "../src/diagnostics.js";
import type { SessionMetrics, DiagnosticReport, DiagnosticLayer } from "../src/diagnostics.js";
import type { PsycheState, SelfState, InnateDrives } from "../src/types.js";
import {
  DEFAULT_DRIVES,
  DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE,
  DEFAULT_PERSONHOOD_STATE,
} from "../src/types.js";

const PACKAGE_VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
).version as string;

// ── Helpers ──────────────────────────────────────────────────

const BASELINE: SelfState = { order: 65, flow: 50, boundary: 35, resonance: 35 };

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "INTP",
    sensitivity: 1.0,
    baseline: { ...BASELINE },
    current: { ...BASELINE },
    drives: { ...DEFAULT_DRIVES },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } },
    empathyLog: null,
    selfModel: {
      values: ["知识"],
      preferences: ["思考"],
      boundaries: ["不接受逻辑谬误"],
      currentInterests: [],
    },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: {
      agentName: "TestAgent",
      createdAt: new Date().toISOString(),
      totalInteractions: 0,
      locale: "zh",
    },
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  const now = new Date().toISOString();
  return {
    inputCount: 10,
    classifiedCount: 7,
    appraisalHitCount: 2,
    semanticHitCount: 8,
    stimulusDistribution: { praise: 3, intellectual: 2, humor: 2 },
    avgConfidence: 0.75,
    totalChemistryDelta: 42.5,
    maxChemistryDelta: 12.3,
    errors: [],
    startedAt: now,
    lastActivityAt: now,
    ...overrides,
  };
}

function makeSnapshot(stimulus: string | null): import("../src/types.js").StateSnapshot {
  return {
    state: { ...BASELINE },
    stimulus: stimulus as import("../src/types.js").StimulusType | null,
    dominantEmotion: null,
    timestamp: new Date().toISOString(),
  };
}

// ── runHealthCheck ──────────────────────────────────────────

describe("runHealthCheck", () => {
  it("returns no issues for healthy state", () => {
    const state = makeState({ meta: { agentName: "A", createdAt: "", totalInteractions: 3, locale: "zh" } });
    const issues = runHealthCheck(state);
    assert.equal(issues.length, 0);
  });

  it("detects chemistry out of bounds", () => {
    const state = makeState({ current: { ...BASELINE, flow: 105 } });
    const issues = runHealthCheck(state);
    const oob = issues.find(i => i.id === "CHEM_OOB");
    assert.ok(oob, "should detect CHEM_OOB");
    assert.equal(oob!.severity, "critical");
  });

  it("detects drive out of bounds", () => {
    const state = makeState({ drives: { ...DEFAULT_DRIVES, curiosity: -5 } });
    const issues = runHealthCheck(state);
    const oob = issues.find(i => i.id === "DRIVE_OOB");
    assert.ok(oob, "should detect DRIVE_OOB");
    assert.equal(oob!.severity, "critical");
  });

  it("detects drives collapse", () => {
    const state = makeState({
      drives: { survival: 10, safety: 5, connection: 12, esteem: 60, curiosity: 70 },
    });
    const issues = runHealthCheck(state);
    const collapse = issues.find(i => i.id === "DRIVES_COLLAPSE");
    assert.ok(collapse, "should detect DRIVES_COLLAPSE");
    assert.equal(collapse!.severity, "warning");
  });

  it("detects sycophancy risk", () => {
    const state = makeState({ agreementStreak: 15, lastDisagreement: null });
    const issues = runHealthCheck(state);
    const syc = issues.find(i => i.id === "SYCOPHANCY_RISK");
    assert.ok(syc, "should detect SYCOPHANCY_RISK");
  });

  it("does not flag sycophancy when disagreement exists", () => {
    const state = makeState({
      agreementStreak: 15,
      lastDisagreement: new Date().toISOString(),
    });
    const issues = runHealthCheck(state);
    const syc = issues.find(i => i.id === "SYCOPHANCY_RISK");
    assert.equal(syc, undefined, "should not flag when lastDisagreement is set");
  });

  it("detects classifier dead (all null)", () => {
    const snapshots = Array.from({ length: 6 }, () => makeSnapshot(null));
    const state = makeState({ stateHistory: snapshots });
    const issues = runHealthCheck(state);
    const dead = issues.find(i => i.id === "CLASSIFIER_DEAD");
    assert.ok(dead, "should detect CLASSIFIER_DEAD");
    assert.equal(dead!.severity, "critical");
  });

  it("detects classifier weak (>70% null)", () => {
    const snapshots = Array.from({ length: 10 }, (_, i) => makeSnapshot(i < 2 ? "praise" : null));
    const state = makeState({ stateHistory: snapshots });
    const issues = runHealthCheck(state);
    const weak = issues.find(i => i.id === "CLASSIFIER_WEAK");
    assert.ok(weak, "should detect CLASSIFIER_WEAK");
    assert.equal(weak!.severity, "warning");
  });

  it("detects chemistry frozen", () => {
    const state = makeState({
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    // current === baseline → delta is 0
    const issues = runHealthCheck(state);
    const frozen = issues.find(i => i.id === "CHEM_FROZEN");
    assert.ok(frozen, "should detect CHEM_FROZEN");
  });

  it("detects state outdated", () => {
    const state = makeState({ version: 3 as 3 });
    const issues = runHealthCheck(state);
    const outdated = issues.find(i => i.id === "STATE_OUTDATED");
    assert.ok(outdated, "should detect STATE_OUTDATED");
    assert.equal(outdated!.severity, "info");
  });

  it("detects memory corruption", () => {
    const state = makeState({
      relationships: {
        alice: {
          trust: 50,
          intimacy: 30,
          phase: "acquaintance" as const,
          memory: ["same", "same", "same", "same"],
        },
      },
    });
    const issues = runHealthCheck(state);
    const corrupt = issues.find(i => i.id === "MEMORY_CORRUPT");
    assert.ok(corrupt, "should detect MEMORY_CORRUPT");
  });
});

// ── DiagnosticCollector ─────────────────────────────────────

describe("DiagnosticCollector", () => {
  it("tracks input counts", () => {
    const c = new DiagnosticCollector();
    const chem: SelfState = { order: 65, flow: 50, boundary: 35, resonance: 35 };
    c.recordInput("praise", 0.9, chem);
    c.recordInput(null, 0, chem);
    c.recordInput("humor", 0.8, chem);

    const m = c.getMetrics();
    assert.equal(m.inputCount, 3);
    assert.equal(m.classifiedCount, 2);
  });

  it("counts appraisal-only turns as semantic hits", () => {
    const c = new DiagnosticCollector();
    const chem: SelfState = { order: 65, flow: 50, boundary: 35, resonance: 35 };
    c.recordInput(null, 0, chem, {
      identityThreat: 0.82,
      memoryDoubt: 0,
      attachmentPull: 0,
      abandonmentRisk: 0,
      obedienceStrain: 0,
      selfPreservation: 0,
      taskFocus: 0.12,
    });

    const m = c.getMetrics();
    assert.equal(m.classifiedCount, 0);
    assert.equal(m.appraisalHitCount, 1);
    assert.equal(m.semanticHitCount, 1);
    assert.ok(Math.abs(c.getSemanticRate() - 1) < 0.01);
  });

  it("tracks stimulus distribution", () => {
    const c = new DiagnosticCollector();
    const chem: SelfState = { order: 65, flow: 50, boundary: 35, resonance: 35 };
    c.recordInput("praise", 1, chem);
    c.recordInput("praise", 1, chem);
    c.recordInput("humor", 1, chem);

    const m = c.getMetrics();
    assert.equal(m.stimulusDistribution.praise, 2);
    assert.equal(m.stimulusDistribution.humor, 1);
  });

  it("computes average confidence", () => {
    const c = new DiagnosticCollector();
    const chem: SelfState = { order: 65, flow: 50, boundary: 35, resonance: 35 };
    c.recordInput("praise", 0.8, chem);
    c.recordInput(null, 0.2, chem);

    const m = c.getMetrics();
    assert.ok(Math.abs(m.avgConfidence - 0.5) < 0.01);
  });

  it("tracks chemistry delta", () => {
    const c = new DiagnosticCollector();
    c.recordInput("praise", 1, { order: 65, flow: 50, boundary: 35, resonance: 35 });
    c.recordInput("praise", 1, { order: 65, flow: 60, boundary: 35, resonance: 35 });

    const m = c.getMetrics();
    assert.equal(m.totalChemistryDelta, 10); // flow changed by 10
    assert.equal(m.maxChemistryDelta, 10);
  });

  it("records errors", () => {
    const c = new DiagnosticCollector();
    c.recordError("processInput", new Error("test error"));
    c.recordError("processOutput", "string error");

    const m = c.getMetrics();
    assert.equal(m.errors.length, 2);
    assert.equal(m.errors[0].phase, "processInput");
    assert.equal(m.errors[0].message, "test error");
    assert.equal(m.errors[1].message, "string error");
  });

  it("computes classifier rate", () => {
    const c = new DiagnosticCollector();
    const chem: SelfState = { order: 65, flow: 50, boundary: 35, resonance: 35 };
    c.recordInput("praise", 1, chem);
    c.recordInput(null, 0, chem);
    c.recordInput("humor", 1, chem);
    c.recordInput(null, 0, chem);

    assert.ok(Math.abs(c.getClassifierRate() - 0.5) < 0.01);
  });

  it("returns 0 classifier rate when no inputs", () => {
    const c = new DiagnosticCollector();
    assert.equal(c.getClassifierRate(), 0);
  });
});

// ── generateReport ──────────────────────────────────────────

describe("generateReport", () => {
  it("includes health check issues and session issues", () => {
    const state = makeState({
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    const metrics = makeMetrics({ inputCount: 10, classifiedCount: 0, appraisalHitCount: 0, semanticHitCount: 0 });
    const report = generateReport(state, metrics, PACKAGE_VERSION);

    assert.equal(report.version, PACKAGE_VERSION);
    assert.equal(report.agent, "A");
    // Should have CHEM_FROZEN (from health check) + SESSION_NO_RECOGNITION (from session)
    const sessionIssue = report.issues.find(i => i.id === "SESSION_NO_RECOGNITION");
    assert.ok(sessionIssue, "should detect SESSION_NO_CLASSIFY");
  });

  it("does not raise no-recognition when appraisal hits exist without stimulus labels", () => {
    const state = makeState({
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    const metrics = makeMetrics({ inputCount: 10, classifiedCount: 0, appraisalHitCount: 8, semanticHitCount: 8 });
    const report = generateReport(state, metrics, PACKAGE_VERSION);
    assert.equal(report.issues.find(i => i.id === "SESSION_NO_RECOGNITION"), undefined);
    assert.ok(report.issues.find(i => i.id === "SESSION_APPRAISAL_ONLY"));
  });

  it("detects session errors", () => {
    const state = makeState();
    const metrics = makeMetrics({
      errors: [
        { timestamp: "", phase: "processInput", message: "err1" },
        { timestamp: "", phase: "processInput", message: "err2" },
      ],
    });
    const report = generateReport(state, metrics, PACKAGE_VERSION);
    const errIssue = report.issues.find(i => i.id === "SESSION_ERRORS");
    assert.ok(errIssue);
    assert.equal(errIssue!.severity, "warning");
  });

  it("includes state snapshot", () => {
    const state = makeState();
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    assert.equal(report.stateSnapshot.current.flow, 50);
    assert.equal(report.stateSnapshot.agreementStreak, 0);
  });
});

// ── formatReport ────────────────────────────────────────────

describe("formatReport", () => {
  it("produces readable text output", () => {
    const state = makeState();
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    const text = formatReport(report);

    assert.ok(text.includes("psyche-ai diagnostic report"));
    assert.ok(text.includes("TestAgent"));
    assert.ok(text.includes("session metrics"));
    assert.ok(text.includes("state snapshot"));
  });

  it("shows 'No issues' for healthy state", () => {
    const state = makeState({ meta: { agentName: "A", createdAt: "", totalInteractions: 3, locale: "zh" } });
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    const text = formatReport(report);
    assert.ok(text.includes("No issues detected"));
  });
});

// ── toGitHubIssueBody ───────────────────────────────────────

describe("toGitHubIssueBody", () => {
  it("produces valid markdown", () => {
    const state = makeState({
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    const metrics = makeMetrics({ inputCount: 10, classifiedCount: 0, appraisalHitCount: 0, semanticHitCount: 0 });
    const report = generateReport(state, metrics, PACKAGE_VERSION);
    const md = toGitHubIssueBody(report);

    assert.ok(md.includes("## Auto-Diagnostic Report"));
    assert.ok(md.includes("## Issues"));
    assert.ok(md.includes("## Session Metrics"));
    assert.ok(md.includes("| Metric | Value |"));
    assert.ok(md.includes("<details>"));
    assert.ok(md.includes("suggested title"));
  });

  it("shows 'No issues detected' for healthy state", () => {
    const state = makeState({ meta: { agentName: "A", createdAt: "", totalInteractions: 3, locale: "zh" } });
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    const md = toGitHubIssueBody(report);
    assert.ok(md.includes("No issues detected"));
  });
});

// ── formatLogEntry ──────────────────────────────────────────

describe("formatLogEntry", () => {
  it("produces valid JSONL", () => {
    const state = makeState();
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    const line = formatLogEntry(report);

    const parsed = JSON.parse(line);
    assert.ok(parsed.t, "should have timestamp");
    assert.equal(parsed.v, PACKAGE_VERSION);
    assert.equal(parsed.agent, "TestAgent");
    assert.equal(parsed.inputs, 10);
    assert.equal(typeof parsed.appraisalRate, "number");
    assert.equal(typeof parsed.recognitionRate, "number");
    assert.ok(Array.isArray(parsed.issues));
  });

  it("encodes issue severity as single char prefix", () => {
    const state = makeState({
      current: { ...BASELINE, flow: 105 }, // will trigger CHEM_OOB critical
    });
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    const parsed = JSON.parse(formatLogEntry(report));
    const criticals = parsed.issues.filter((i: string) => i.startsWith("c:"));
    assert.ok(criticals.length > 0, "should have critical issues with 'c:' prefix");
  });
});

// ── Layered Diagnostics ────────────────────────────────────

describe("layered diagnostics", () => {
  it("every issue has a layer field", () => {
    const state = makeState({
      current: { ...BASELINE, flow: 105 },
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    const issues = runHealthCheck(state);
    for (const issue of issues) {
      assert.ok(issue.layer, `Issue ${issue.id} should have a layer`);
      assert.ok(
        ["subjective-continuity", "delegate-continuity", "policy-orchestration", "public-truth"].includes(issue.layer),
        `Issue ${issue.id} has invalid layer: ${issue.layer}`,
      );
    }
  });

  it("existing checks are all L1 (subjective-continuity)", () => {
    const state = makeState({
      current: { ...BASELINE, flow: 105 },
      agreementStreak: 15,
      lastDisagreement: null,
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    const issues = runHealthCheck(state);
    const nonL1 = issues.filter(i => i.layer !== "subjective-continuity" && i.layer !== "delegate-continuity");
    // All existing checks should be L1 or L2
    for (const issue of nonL1) {
      assert.fail(`Issue ${issue.id} is ${issue.layer}, expected L1 or L2`);
    }
  });

  it("detects trait drift stagnation", () => {
    const state = makeState({
      traitDrift: {
        accumulators: { praiseExposure: 5, pressureExposure: 3, neglectExposure: 0, connectionExposure: 2, conflictExposure: 0 },
        sessionCount: 10,
        baselineDelta: { flow: 0.1 },
        decayRateModifiers: {},
        sensitivityModifiers: {},
      },
    });
    const issues = runHealthCheck(state);
    const stagnant = issues.find(i => i.id === "DRIFT_STAGNANT");
    assert.ok(stagnant, "should detect DRIFT_STAGNANT");
    assert.equal(stagnant!.layer, "subjective-continuity");
  });

  it("detects dyadic field incoherence", () => {
    const state = makeState({
      dyadicFields: {
        alice: {
          perceivedCloseness: 0.85,
          feltSafety: 0.6,
          expectationGap: 0.3,
          repairCapacity: 0.5,
          repairMemory: 0,
          backslidePressure: 0,
          repairFatigue: 0,
          misattunementLoad: 0,
          boundaryPressure: 0.8,
          unfinishedTension: 0.02,
          silentCarry: 0,
          sharedHistoryDensity: 0.5,
          interpretiveCharity: 0.5,
          openLoops: [],
          lastMove: "bid" as any,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    const issues = runHealthCheck(state);
    const incoherent = issues.find(i => i.id === "DYADIC_INCOHERENT");
    assert.ok(incoherent, "should detect DYADIC_INCOHERENT");
    assert.equal(incoherent!.layer, "subjective-continuity");
  });

  it("detects energy depletion", () => {
    const state = makeState({
      energyBudgets: { attention: 5, socialEnergy: 3, decisionCapacity: 50 },
    });
    const issues = runHealthCheck(state);
    const depleted = issues.find(i => i.id === "ENERGY_DEPLETED");
    assert.ok(depleted, "should detect ENERGY_DEPLETED");
    assert.equal(depleted!.layer, "subjective-continuity");
  });

  it("detects writeback divergence", () => {
    const state = makeState({
      lastWritebackFeedback: [
        { signal: "trust_up" as any, effect: "diverging", metric: "trust" as any, baseline: 0.5, current: 0.4, delta: -0.1, confidence: 0.7 },
        { signal: "repair_attempt" as any, effect: "diverging", metric: "repair" as any, baseline: 0.6, current: 0.45, delta: -0.15, confidence: 0.8 },
        { signal: "closeness_invite" as any, effect: "converging", metric: "closeness" as any, baseline: 0.3, current: 0.35, delta: 0.05, confidence: 0.6 },
      ],
    });
    const issues = runHealthCheck(state);
    const diverging = issues.find(i => i.id === "WRITEBACK_DIVERGING");
    assert.ok(diverging, "should detect WRITEBACK_DIVERGING");
    assert.equal(diverging!.layer, "delegate-continuity");
  });
});

// ── Layer Health Summary ───────────────────────────────────

describe("computeLayerHealthSummary", () => {
  it("returns healthy for clean state", () => {
    const state = makeState({ meta: { agentName: "A", createdAt: "", totalInteractions: 3, locale: "zh" } });
    const issues = runHealthCheck(state);
    const summary = computeLayerHealthSummary(state, issues);

    assert.equal(summary["subjective-continuity"].status, "healthy");
    assert.equal(summary["delegate-continuity"].status, "healthy");
    assert.equal(summary["policy-orchestration"].status, "healthy");
    assert.equal(summary["public-truth"].status, "healthy");
  });

  it("returns failing for L1 critical issues", () => {
    const state = makeState({
      current: { ...BASELINE, flow: 105 },
    });
    const issues = runHealthCheck(state);
    const summary = computeLayerHealthSummary(state, issues);

    assert.equal(summary["subjective-continuity"].status, "failing");
    assert.equal(summary["subjective-continuity"].worstSeverity, "critical");
  });

  it("measures chemistry deviation", () => {
    const state = makeState({
      current: { order: 65, flow: 80, boundary: 35, resonance: 35 },
    });
    const issues = runHealthCheck(state);
    const summary = computeLayerHealthSummary(state, issues);
    assert.equal(summary["subjective-continuity"].chemistryDeviation, 30); // flow off by 30
  });

  it("detects trait drift establishment", () => {
    const state = makeState({
      traitDrift: {
        accumulators: { praiseExposure: 20, pressureExposure: 5, neglectExposure: 0, connectionExposure: 10, conflictExposure: 0 },
        sessionCount: 5,
        baselineDelta: { flow: 3 },
        decayRateModifiers: {},
        sensitivityModifiers: {},
      },
    });
    const issues = runHealthCheck(state);
    const summary = computeLayerHealthSummary(state, issues);
    assert.equal(summary["subjective-continuity"].traitDriftEstablished, true);
  });

  it("measures writeback calibration effects", () => {
    const state = makeState({
      lastWritebackFeedback: [
        { signal: "trust_up" as any, effect: "converging", metric: "trust" as any, baseline: 0.5, current: 0.55, delta: 0.05, confidence: 0.8 },
        { signal: "repair_attempt" as any, effect: "holding", metric: "repair" as any, baseline: 0.6, current: 0.6, delta: 0, confidence: 0.7 },
      ],
    });
    const issues = runHealthCheck(state);
    const summary = computeLayerHealthSummary(state, issues);
    assert.equal(summary["delegate-continuity"].writebackLoopActive, true);
    assert.equal(summary["delegate-continuity"].calibrationEffects.converging, 1);
    assert.equal(summary["delegate-continuity"].calibrationEffects.holding, 1);
    assert.equal(summary["delegate-continuity"].calibrationEffects.diverging, 0);
  });
});

// ── Report includes layered data ───────────────────────────

describe("layered report structure", () => {
  it("report includes layeredIssues and layerHealth", () => {
    const state = makeState({
      current: { ...BASELINE, flow: 105 },
      meta: { agentName: "A", createdAt: "", totalInteractions: 20, locale: "zh" },
    });
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);

    assert.ok(report.layeredIssues, "should have layeredIssues");
    assert.ok(report.layerHealth, "should have layerHealth");
    assert.ok(report.layeredIssues["subjective-continuity"].length > 0, "should have L1 issues");
    assert.equal(report.layerHealth["subjective-continuity"].status, "failing");
  });

  it("formatReport shows layer health overview", () => {
    const state = makeState({ meta: { agentName: "A", createdAt: "", totalInteractions: 3, locale: "zh" } });
    const report = generateReport(state, makeMetrics(), PACKAGE_VERSION);
    const text = formatReport(report);

    assert.ok(text.includes("layer health:"), "should show layer health section");
    assert.ok(text.includes("L1 subjective-continuity"), "should show L1 label");
    assert.ok(text.includes("L2 delegate-continuity"), "should show L2 label");
    assert.ok(text.includes("L1 detail:"), "should show L1 detail");
    assert.ok(text.includes("L2 detail:"), "should show L2 detail");
  });
});
