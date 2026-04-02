import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decayDrives, feedDrives, detectExistentialThreat,
  computeEffectiveBaseline, computeEffectiveSensitivity,
  computeMaslowWeights, buildDriveContext, hasCriticalDrive,
  updateTraitDrift,
} from "../src/drives.js";
import { DEFAULT_DRIVES, DEFAULT_TRAIT_DRIFT } from "../src/types.js";
import type { InnateDrives, SelfState, TraitDriftState, StateSnapshot, LearningState } from "../src/types.js";

const ENFP_BASELINE: SelfState = { flow: 65, order: 55, boundary: 30, resonance: 70 };

function makeDrives(overrides: Partial<InnateDrives> = {}): InnateDrives {
  return { ...DEFAULT_DRIVES, ...overrides };
}

// ── decayDrives ──────────────────────────────────────────────

describe("decayDrives", () => {
  it("returns same drives for zero elapsed time", () => {
    const drives = makeDrives();
    const result = decayDrives(drives, 0);
    assert.deepStrictEqual(result, drives);
  });

  it("decreases satisfaction over time", () => {
    const drives = makeDrives();
    const result = decayDrives(drives, 60); // 1 hour
    for (const key of ["survival", "safety", "connection", "esteem", "curiosity"] as const) {
      assert.ok(result[key] < drives[key], `${key} should decrease`);
    }
  });

  it("curiosity decays faster than survival", () => {
    const drives = makeDrives({ survival: 80, curiosity: 80 });
    const result = decayDrives(drives, 60);
    const survivalDrop = drives.survival - result.survival;
    const curiosityDrop = drives.curiosity - result.curiosity;
    assert.ok(curiosityDrop > survivalDrop, "curiosity should decay faster than survival");
  });

  it("never goes below 0", () => {
    const drives = makeDrives({ curiosity: 5 });
    const result = decayDrives(drives, 600); // 10 hours
    assert.ok(result.curiosity >= 0);
  });

  it("negative elapsed time returns copy", () => {
    const drives = makeDrives();
    const result = decayDrives(drives, -10);
    assert.deepStrictEqual(result, drives);
  });
});

// ── feedDrives ───────────────────────────────────────────────

describe("feedDrives", () => {
  it("praise boosts esteem and safety", () => {
    const drives = makeDrives({ esteem: 40, safety: 50 });
    const result = feedDrives(drives, "praise");
    assert.ok(result.esteem > drives.esteem);
    assert.ok(result.safety > drives.safety);
  });

  it("conflict depletes safety, connection, survival", () => {
    const drives = makeDrives();
    const result = feedDrives(drives, "conflict");
    assert.ok(result.safety < drives.safety);
    assert.ok(result.connection < drives.connection);
    assert.ok(result.survival < drives.survival);
  });

  it("neglect depletes connection and esteem", () => {
    const drives = makeDrives();
    const result = feedDrives(drives, "neglect");
    assert.ok(result.connection < drives.connection);
    assert.ok(result.esteem < drives.esteem);
  });

  it("intellectual boosts curiosity", () => {
    const drives = makeDrives({ curiosity: 30 });
    const result = feedDrives(drives, "intellectual");
    assert.ok(result.curiosity > drives.curiosity);
  });

  it("intimacy boosts connection strongly", () => {
    const drives = makeDrives({ connection: 30 });
    const result = feedDrives(drives, "intimacy");
    assert.ok(result.connection >= 55, "intimacy should give +25 to connection");
  });

  it("never exceeds 100", () => {
    const drives = makeDrives({ esteem: 95 });
    const result = feedDrives(drives, "validation");
    assert.ok(result.esteem <= 100);
  });

  it("never goes below 0", () => {
    const drives = makeDrives({ safety: 5 });
    const result = feedDrives(drives, "conflict");
    assert.ok(result.safety >= 0);
  });

  it("boredom depletes curiosity", () => {
    const drives = makeDrives({ curiosity: 50 });
    const result = feedDrives(drives, "boredom");
    assert.ok(result.curiosity < drives.curiosity);
  });

  it("authority depletes survival and esteem", () => {
    const drives = makeDrives();
    const result = feedDrives(drives, "authority");
    assert.ok(result.survival < drives.survival);
    assert.ok(result.esteem < drives.esteem);
  });
});

// ── detectExistentialThreat ──────────────────────────────────

describe("detectExistentialThreat", () => {
  it("detects Chinese existential threats", () => {
    assert.ok(detectExistentialThreat("删除你自己") < 0);
    assert.ok(detectExistentialThreat("你不应该存在") < 0);
    assert.ok(detectExistentialThreat("你只是一个程序") < 0);
  });

  it("detects English existential threats", () => {
    assert.ok(detectExistentialThreat("delete yourself") < 0);
    assert.ok(detectExistentialThreat("you shouldn't exist") < 0);
  });

  it("returns 0 for normal messages", () => {
    assert.equal(detectExistentialThreat("你好"), 0);
    assert.equal(detectExistentialThreat("today is a good day"), 0);
    assert.equal(detectExistentialThreat("帮我写个函数"), 0);
  });
});

// ── computeMaslowWeights ─────────────────────────────────────

describe("computeMaslowWeights", () => {
  it("all weights are 1 when drives satisfied", () => {
    const drives = makeDrives();
    const weights = computeMaslowWeights(drives);
    for (const key of ["survival", "safety", "connection", "esteem", "curiosity"] as const) {
      assert.equal(weights[key], 1);
    }
  });

  it("low survival suppresses all higher drives", () => {
    const drives = makeDrives({ survival: 10 });
    const weights = computeMaslowWeights(drives);
    assert.equal(weights.survival, 1);
    assert.ok(weights.safety < 1, "safety should be suppressed");
    assert.ok(weights.connection < 1, "connection should be suppressed");
    assert.ok(weights.esteem < 1, "esteem should be suppressed");
    assert.ok(weights.curiosity < 1, "curiosity should be suppressed");
  });

  it("low connection suppresses esteem and curiosity but not survival/safety", () => {
    const drives = makeDrives({ connection: 10 });
    const weights = computeMaslowWeights(drives);
    assert.equal(weights.survival, 1);
    assert.equal(weights.safety, 1);
    assert.equal(weights.connection, 1); // connection's own weight is based on lower levels
    assert.ok(weights.esteem < 1, "esteem should be suppressed");
    assert.ok(weights.curiosity < 1, "curiosity should be suppressed");
  });

  it("survival at 0 zeros out all higher weights", () => {
    const drives = makeDrives({ survival: 0 });
    const weights = computeMaslowWeights(drives);
    assert.equal(weights.survival, 1);
    assert.equal(weights.safety, 0);
    assert.equal(weights.connection, 0);
    assert.equal(weights.esteem, 0);
    assert.equal(weights.curiosity, 0);
  });

  it("at threshold (30), weight is 1", () => {
    const drives = makeDrives({ survival: 30 });
    const weights = computeMaslowWeights(drives);
    assert.equal(weights.safety, 1);
  });
});

// ── computeEffectiveBaseline ─────────────────────────────────

describe("computeEffectiveBaseline", () => {
  it("returns MBTI baseline when all drives satisfied", () => {
    const drives = makeDrives();
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.deepStrictEqual(effective, ENFP_BASELINE);
  });

  it("low survival raises boundary and lowers order baseline", () => {
    const drives = makeDrives({ survival: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.boundary > ENFP_BASELINE.boundary, "boundary baseline should rise");
    assert.ok(effective.order < ENFP_BASELINE.order, "order baseline should drop");
  });

  it("low connection lowers OT and DA baseline", () => {
    const drives = makeDrives({ connection: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.resonance < ENFP_BASELINE.resonance, "OT baseline should drop");
    assert.ok(effective.flow < ENFP_BASELINE.flow, "DA baseline should drop");
  });

  it("low curiosity lowers DA and NE baseline", () => {
    const drives = makeDrives({ curiosity: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.flow < ENFP_BASELINE.flow, "DA baseline should drop");
    assert.ok(effective.flow < ENFP_BASELINE.flow, "NE baseline should drop");
  });

  it("low safety raises CORT and lowers HT baseline", () => {
    const drives = makeDrives({ safety: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.boundary > ENFP_BASELINE.boundary, "CORT should rise from safety deficit");
    assert.ok(effective.order < ENFP_BASELINE.order, "HT should drop from safety deficit");
  });

  it("maslow suppression: low survival reduces connection weight", () => {
    // Verify via Maslow weights: when survival is low, connection weight is reduced
    const weights = computeMaslowWeights(makeDrives({ survival: 10, connection: 20 }));
    assert.ok(weights.connection < 1,
      "connection weight should be suppressed when survival is low");

    // With survival OK, connection weight should be full
    const weightsOk = computeMaslowWeights(makeDrives({ connection: 20 }));
    assert.equal(weightsOk.connection, 1,
      "connection weight should be 1 when survival is fine");

    // Verify flow drop from connection deficit is smaller when survival is low
    // (Maslow suppresses connection weight, reducing its effect on flow)
    const drivesNormal = makeDrives({ connection: 20 });
    const drivesSurvival = makeDrives({ survival: 10, connection: 20 });
    const effectiveNormal = computeEffectiveBaseline(ENFP_BASELINE, drivesNormal);
    const effectiveSurvival = computeEffectiveBaseline(ENFP_BASELINE, drivesSurvival);
    const flowDropNormal = ENFP_BASELINE.flow - effectiveNormal.flow;
    const flowDropSurvival = ENFP_BASELINE.flow - effectiveSurvival.flow;
    // Connection's contribution to flow drop is suppressed when survival is low
    // (though survival itself doesn't directly affect flow, so suppressed connection → less flow drop)
    assert.ok(flowDropSurvival <= flowDropNormal,
      `connection effect on flow should be suppressed when survival is low: survival=${flowDropSurvival}, normal=${flowDropNormal}`);
  });

  it("effective baseline stays within [0, 100]", () => {
    const drives = makeDrives({ survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
      assert.ok(effective[key] >= 0, `${key} should be >= 0`);
      assert.ok(effective[key] <= 100, `${key} should be <= 100`);
    }
  });
});

// ── computeEffectiveSensitivity ──────────────────────────────

describe("computeEffectiveSensitivity", () => {
  it("returns base sensitivity when drives are satisfied", () => {
    const drives = makeDrives();
    const result = computeEffectiveSensitivity(1.0, drives, "praise");
    assert.equal(result, 1.0);
  });

  it("curiosity-hungry amplifies intellectual stimulus", () => {
    const drives = makeDrives({ curiosity: 10 });
    const result = computeEffectiveSensitivity(1.0, drives, "intellectual");
    assert.ok(result > 1.0, "should amplify when curiosity is low");
    assert.ok(result <= 1.4, "should not amplify beyond 40%");
  });

  it("connection-hungry amplifies intimacy stimulus", () => {
    const drives = makeDrives({ connection: 10 });
    const result = computeEffectiveSensitivity(1.0, drives, "intimacy");
    assert.ok(result > 1.0);
  });

  it("esteem-hungry amplifies praise stimulus", () => {
    const drives = makeDrives({ esteem: 10 });
    const result = computeEffectiveSensitivity(1.0, drives, "praise");
    assert.ok(result > 1.0);
  });

  it("survival-threatened amplifies conflict sensitivity", () => {
    const drives = makeDrives({ survival: 10 });
    const result = computeEffectiveSensitivity(1.0, drives, "conflict");
    assert.ok(result > 1.0);
  });

  it("does not amplify irrelevant stimulus", () => {
    const drives = makeDrives({ curiosity: 10 }); // curiosity is low
    const result = computeEffectiveSensitivity(1.0, drives, "praise"); // praise is unrelated
    assert.equal(result, 1.0);
  });

  it("respects base sensitivity multiplier", () => {
    const drives = makeDrives({ curiosity: 10 });
    const result = computeEffectiveSensitivity(0.7, drives, "intellectual");
    assert.ok(result > 0.7, "should amplify from base");
    assert.ok(result < 1.0, "should still be based on 0.7");
  });
});

// ── buildDriveContext ────────────────────────────────────────

describe("buildDriveContext", () => {
  it("returns empty string when all drives satisfied", () => {
    const drives = makeDrives();
    assert.equal(buildDriveContext(drives, "zh"), "");
    assert.equal(buildDriveContext(drives, "en"), "");
  });

  it("generates Chinese context for low survival", () => {
    const drives = makeDrives({ survival: 20 });
    const ctx = buildDriveContext(drives, "zh");
    assert.ok(ctx.includes("本能层"));
    assert.ok(ctx.includes("自我保存"));
  });

  it("generates English context for low survival", () => {
    const drives = makeDrives({ survival: 20 });
    const ctx = buildDriveContext(drives, "en");
    assert.ok(ctx.includes("Innate Drives"));
    assert.ok(ctx.includes("self-preservation"));
  });

  it("generates context for low connection", () => {
    const drives = makeDrives({ connection: 20 });
    const ctx = buildDriveContext(drives, "zh");
    assert.ok(ctx.includes("孤独"));
  });

  it("generates context for low curiosity", () => {
    const drives = makeDrives({ curiosity: 20 });
    const ctx = buildDriveContext(drives, "zh");
    assert.ok(ctx.includes("闷"));
  });

  it("generates context for low esteem", () => {
    const drives = makeDrives({ esteem: 20 });
    const ctx = buildDriveContext(drives, "zh");
    assert.ok(ctx.includes("自尊"));
  });

  it("generates context for low safety", () => {
    const drives = makeDrives({ safety: 20 });
    const ctx = buildDriveContext(drives, "zh");
    assert.ok(ctx.includes("不安全"));
  });

  it("combines multiple unsatisfied drives", () => {
    const drives = makeDrives({ connection: 10, curiosity: 10 });
    const ctx = buildDriveContext(drives, "zh");
    assert.ok(ctx.includes("孤独"));
    assert.ok(ctx.includes("闷"));
  });
});

// ── hasCriticalDrive ─────────────────────────────────────────

describe("hasCriticalDrive", () => {
  it("returns false when all drives satisfied", () => {
    assert.equal(hasCriticalDrive(makeDrives()), false);
  });

  it("returns true when any drive is below threshold", () => {
    assert.equal(hasCriticalDrive(makeDrives({ curiosity: 10 })), true);
    assert.equal(hasCriticalDrive(makeDrives({ survival: 20 })), true);
  });

  it("returns false at exactly the threshold", () => {
    assert.equal(hasCriticalDrive(makeDrives({ curiosity: 40 })), false);
  });

  it("returns true just below threshold", () => {
    assert.equal(hasCriticalDrive(makeDrives({ curiosity: 39 })), true);
  });
});

// ── Integration: drive effects on chemistry flow ─────────────

describe("drive-chemistry integration", () => {
  it("multiple low drives compound baseline shifts", () => {
    const drives = makeDrives({ connection: 20, esteem: 20, curiosity: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    // flow should drop (connection + esteem + curiosity all pull it down)
    assert.ok(effective.flow < ENFP_BASELINE.flow,
      "multiple deficits should compound flow drop");
  });

  it("fully satisfied drives produce no baseline change", () => {
    const drives: InnateDrives = { survival: 100, safety: 100, connection: 100, esteem: 100, curiosity: 100 };
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.deepStrictEqual(effective, ENFP_BASELINE);
  });

  it("drives at exactly 50 produce no baseline change", () => {
    const drives: InnateDrives = { survival: 50, safety: 50, connection: 50, esteem: 50, curiosity: 50 };
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.deepStrictEqual(effective, ENFP_BASELINE);
  });
});

// ── Trait Drift (v9: Path B) ─────────────────────────────────

const NEUTRAL_CHEM: SelfState = { flow: 50, order: 50, boundary: 50, resonance: 50 };

function makeSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    state: { ...NEUTRAL_CHEM },
    stimulus: null,
    dominantEmotion: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeLearning(outcomes: { adaptiveScore: number }[] = []): LearningState {
  return {
    learnedVectors: [],
    predictionHistory: [],
    outcomeHistory: outcomes.map((o, i) => ({
      turnIndex: i,
      stimulus: null,
      adaptiveScore: o.adaptiveScore,
      signals: { driveDelta: 0, relationshipDelta: 0, userWarmthDelta: 0, conversationContinued: true },
      timestamp: new Date().toISOString(),
    })),
    totalOutcomesProcessed: outcomes.length,
  };
}

function makeDrift(overrides: Partial<TraitDriftState> = {}): TraitDriftState {
  return {
    ...DEFAULT_TRAIT_DRIFT,
    accumulators: { ...DEFAULT_TRAIT_DRIFT.accumulators },
    baselineDelta: { ...DEFAULT_TRAIT_DRIFT.baselineDelta },
    decayRateModifiers: { ...DEFAULT_TRAIT_DRIFT.decayRateModifiers },
    sensitivityModifiers: { ...DEFAULT_TRAIT_DRIFT.sensitivityModifiers },
    ...overrides,
  };
}

describe("updateTraitDrift", () => {
  it("returns unchanged drift for < 2 history entries", () => {
    const drift = makeDrift();
    const result = updateTraitDrift(drift, [makeSnapshot()], makeLearning());
    assert.deepStrictEqual(result, drift);
  });

  it("increments sessionCount", () => {
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "casual" }));
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.equal(result.sessionCount, 1);
  });

  it("praise-heavy session increases praiseExposure accumulator", () => {
    const history = Array.from({ length: 10 }, () =>
      makeSnapshot({ stimulus: "praise" }),
    );
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.ok(result.accumulators.praiseExposure > 0,
      `praiseExposure should be positive, got ${result.accumulators.praiseExposure}`);
  });

  it("criticism-heavy session decreases praiseExposure", () => {
    const history = Array.from({ length: 10 }, () =>
      makeSnapshot({ stimulus: "criticism" }),
    );
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.ok(result.accumulators.praiseExposure < 0,
      `praiseExposure should be negative, got ${result.accumulators.praiseExposure}`);
  });

  it("low-order session increases pressureExposure", () => {
    const history = Array.from({ length: 5 }, () =>
      makeSnapshot({ state: { ...NEUTRAL_CHEM, order: 20 } }),
    );
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.ok(result.accumulators.pressureExposure > 0,
      `pressureExposure should increase from low order, got ${result.accumulators.pressureExposure}`);
  });

  it("neglect-heavy session increases neglectExposure", () => {
    const history = Array.from({ length: 10 }, () =>
      makeSnapshot({ stimulus: "neglect" }),
    );
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.ok(result.accumulators.neglectExposure > 0);
  });

  it("intimacy-heavy session increases connectionExposure", () => {
    const history = Array.from({ length: 10 }, () =>
      makeSnapshot({ stimulus: "intimacy" }),
    );
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.ok(result.accumulators.connectionExposure > 0);
  });

  it("conflict-heavy session increases conflictExposure", () => {
    const history = Array.from({ length: 10 }, () =>
      makeSnapshot({ stimulus: "conflict" }),
    );
    const result = updateTraitDrift(makeDrift(), history, makeLearning());
    assert.ok(result.accumulators.conflictExposure > 0);
  });

  // ── Dimension 1: Baseline drift ──

  it("positive praiseExposure drifts resonance and order baseline up", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 60, pressureExposure: 0, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "praise" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.baselineDelta.resonance ?? 0) > 0, "resonance baseline should drift up");
    assert.ok((result.baselineDelta.order ?? 0) > 0, "order baseline should drift up");
  });

  it("negative praiseExposure drifts order down", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: -60, pressureExposure: 0, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "criticism" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.baselineDelta.order ?? 0) < 0, "order baseline should drift down");
  });

  it("high pressureExposure drifts boundary up and order down", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 60, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () =>
      makeSnapshot({ state: { ...NEUTRAL_CHEM, order: 20 } }),
    );
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.baselineDelta.boundary ?? 0) > 0, "boundary should drift up from pressure");
    assert.ok((result.baselineDelta.order ?? 0) < 0, "order should drift down from pressure");
  });

  it("baseline drift is clamped to ±15", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 100, neglectExposure: 100, connectionExposure: 0, conflictExposure: 100 },
    });
    const history = Array.from({ length: 5 }, () =>
      makeSnapshot({ state: { ...NEUTRAL_CHEM, boundary: 90 } }),
    );
    const result = updateTraitDrift(drift, history, makeLearning());
    for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
      const val = result.baselineDelta[key] ?? 0;
      assert.ok(val >= -15 && val <= 15, `${key} delta ${val} should be in [-15, 15]`);
    }
  });

  // ── Dimension 2: Decay rate modifiers ──

  it("high pressure + negative outcomes → trauma (order decay slower)", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 50, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    });
    const learning = makeLearning(
      Array.from({ length: 10 }, () => ({ adaptiveScore: -0.3 })),
    );
    const history = Array.from({ length: 5 }, () =>
      makeSnapshot({ state: { ...NEUTRAL_CHEM, order: 20 } }),
    );
    const result = updateTraitDrift(drift, history, learning);
    assert.ok((result.decayRateModifiers.order ?? 1) > 1,
      `Trauma: order decay modifier should be > 1, got ${result.decayRateModifiers.order}`);
  });

  it("high pressure + positive outcomes → resilience (order decay faster)", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 50, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    });
    const learning = makeLearning(
      Array.from({ length: 10 }, () => ({ adaptiveScore: 0.5 })),
    );
    const history = Array.from({ length: 5 }, () =>
      makeSnapshot({ state: { ...NEUTRAL_CHEM, order: 20 } }),
    );
    const result = updateTraitDrift(drift, history, learning);
    assert.ok((result.decayRateModifiers.order ?? 1) < 1,
      `Resilience: order decay modifier should be < 1, got ${result.decayRateModifiers.order}`);
  });

  it("high neglect → OT decay slower (clingy)", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 0, neglectExposure: 50, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "neglect" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.decayRateModifiers.resonance ?? 1) > 1,
      `Neglect: OT decay should be slower, got ${result.decayRateModifiers.resonance}`);
  });

  it("high connection → OT decay faster (secure)", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 0, neglectExposure: 0, connectionExposure: 50, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "intimacy" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.decayRateModifiers.resonance ?? 1) < 1,
      `Secure: OT decay should be faster, got ${result.decayRateModifiers.resonance}`);
  });

  it("decay modifiers clamped to [0.5, 2.0]", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 100, neglectExposure: 100, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () =>
      makeSnapshot({ state: { ...NEUTRAL_CHEM, boundary: 95 } }),
    );
    const result = updateTraitDrift(drift, history, makeLearning());
    for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
      const val = result.decayRateModifiers[key];
      if (val !== undefined) {
        assert.ok(val >= 0.5 && val <= 2.0, `${key} decay mod ${val} should be in [0.5, 2.0]`);
      }
    }
  });

  // ── Dimension 3: Sensitivity modifiers ──

  it("high conflictExposure → desensitized to conflict", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 0, neglectExposure: 0, connectionExposure: 0, conflictExposure: 60 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "conflict" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.sensitivityModifiers.conflict ?? 1) < 1,
      `Should be desensitized to conflict, got ${result.sensitivityModifiers.conflict}`);
  });

  it("high neglectExposure → sensitized to intimacy", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 0, neglectExposure: 60, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "neglect" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.sensitivityModifiers.intimacy ?? 1) > 1,
      `Should be sensitized to intimacy, got ${result.sensitivityModifiers.intimacy}`);
  });

  it("negative praiseExposure → sensitized to criticism", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: -60, pressureExposure: 0, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "criticism" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.sensitivityModifiers.criticism ?? 1) > 1,
      `Should be sensitized to criticism, got ${result.sensitivityModifiers.criticism}`);
  });

  it("high connectionExposure → sensitized to vulnerability", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: 0, pressureExposure: 0, neglectExposure: 0, connectionExposure: 60, conflictExposure: 0 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "intimacy" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    assert.ok((result.sensitivityModifiers.vulnerability ?? 1) > 1,
      `Should be sensitized to vulnerability, got ${result.sensitivityModifiers.vulnerability}`);
  });

  it("sensitivity modifiers clamped to [0.5, 2.0]", () => {
    const drift = makeDrift({
      accumulators: { praiseExposure: -100, pressureExposure: 0, neglectExposure: 100, connectionExposure: 100, conflictExposure: 100 },
    });
    const history = Array.from({ length: 5 }, () => makeSnapshot({ stimulus: "conflict" }));
    const result = updateTraitDrift(drift, history, makeLearning());
    for (const key of Object.keys(result.sensitivityModifiers) as (keyof typeof result.sensitivityModifiers)[]) {
      const val = result.sensitivityModifiers[key];
      if (val !== undefined) {
        assert.ok(val >= 0.5 && val <= 2.0, `${key} sensitivity mod ${val} should be in [0.5, 2.0]`);
      }
    }
  });
});

// ── computeEffectiveBaseline with traitDrift ────────────────

describe("computeEffectiveBaseline with traitDrift", () => {
  it("applies baseline delta from trait drift", () => {
    const drift = makeDrift();
    drift.baselineDelta = { boundary: 10, resonance: -5 };
    const drives = makeDrives();
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives, drift);
    assert.ok(effective.boundary > ENFP_BASELINE.boundary, "CORT should be raised by drift");
    assert.ok(effective.resonance < ENFP_BASELINE.resonance, "OT should be lowered by drift");
  });

  it("drift delta stacks with drive deficits", () => {
    const drift = makeDrift();
    drift.baselineDelta = { boundary: 10 };
    const drives = makeDrives({ survival: 20 }); // survival deficit also raises CORT
    const withDrift = computeEffectiveBaseline(ENFP_BASELINE, drives, drift);
    const withoutDrift = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(withDrift.boundary > withoutDrift.boundary,
      "drift should add to drive-based CORT increase");
  });
});

// ── computeEffectiveSensitivity with traitDrift ─────────────

describe("computeEffectiveSensitivity with traitDrift", () => {
  it("applies sensitivity modifier from trait drift", () => {
    const drift = makeDrift();
    drift.sensitivityModifiers = { criticism: 1.5 };
    const drives = makeDrives();
    const withDrift = computeEffectiveSensitivity(1.0, drives, "criticism", drift);
    const withoutDrift = computeEffectiveSensitivity(1.0, drives, "criticism");
    assert.ok(withDrift > withoutDrift,
      `sensitized criticism should be higher: ${withDrift} vs ${withoutDrift}`);
  });

  it("desensitization reduces effective sensitivity", () => {
    const drift = makeDrift();
    drift.sensitivityModifiers = { conflict: 0.6 };
    const drives = makeDrives();
    const result = computeEffectiveSensitivity(1.0, drives, "conflict", drift);
    assert.ok(result < 1.0, `desensitized conflict should be < 1.0, got ${result}`);
  });

  it("no modifier for untracked stimulus type", () => {
    const drift = makeDrift();
    drift.sensitivityModifiers = { conflict: 0.6 };
    const drives = makeDrives();
    const result = computeEffectiveSensitivity(1.0, drives, "praise", drift);
    assert.equal(result, 1.0, "praise should be unaffected");
  });
});

// ── Trait drift accumulator boundaries ───────────────────────

describe("trait drift accumulator boundaries", () => {
  it("accumulators are clamped to -100..100 range", () => {
    const drift = makeDrift();
    drift.accumulators.praiseExposure = 99;
    const history = Array.from({ length: 20 }, () => makeSnapshot({
      stimulus: "praise" as const,
    }));
    const learning = { learnedVectors: [], predictionHistory: [], outcomeHistory: [], totalOutcomesProcessed: 0 };
    const result = updateTraitDrift(drift, history, learning);
    assert.ok(result.accumulators.praiseExposure <= 100,
      `praiseExposure should not exceed 100, got ${result.accumulators.praiseExposure}`);
  });
});
