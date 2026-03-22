import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decayDrives, feedDrives, detectExistentialThreat,
  computeEffectiveBaseline, computeEffectiveSensitivity,
  computeMaslowWeights, buildDriveContext, hasCriticalDrive,
} from "../src/drives.js";
import { DEFAULT_DRIVES } from "../src/types.js";
import type { InnateDrives, ChemicalState } from "../src/types.js";

const ENFP_BASELINE: ChemicalState = { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 };

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

  it("low survival raises CORT and NE baseline", () => {
    const drives = makeDrives({ survival: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.CORT > ENFP_BASELINE.CORT, "CORT baseline should rise");
    assert.ok(effective.NE > ENFP_BASELINE.NE, "NE baseline should rise");
  });

  it("low connection lowers OT and DA baseline", () => {
    const drives = makeDrives({ connection: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.OT < ENFP_BASELINE.OT, "OT baseline should drop");
    assert.ok(effective.DA < ENFP_BASELINE.DA, "DA baseline should drop");
  });

  it("low curiosity lowers DA and NE baseline", () => {
    const drives = makeDrives({ curiosity: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.DA < ENFP_BASELINE.DA, "DA baseline should drop");
    assert.ok(effective.NE < ENFP_BASELINE.NE, "NE baseline should drop");
  });

  it("low safety raises CORT and lowers HT baseline", () => {
    const drives = makeDrives({ safety: 20 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    assert.ok(effective.CORT > ENFP_BASELINE.CORT, "CORT should rise from safety deficit");
    assert.ok(effective.HT < ENFP_BASELINE.HT, "HT should drop from safety deficit");
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

    // Also verify: END baseline (only affected by connection, not survival)
    // should shift less when survival suppresses connection weight
    const drivesNormal = makeDrives({ connection: 20 });
    const drivesSurvival = makeDrives({ survival: 10, connection: 20 });
    const effectiveNormal = computeEffectiveBaseline(ENFP_BASELINE, drivesNormal);
    const effectiveSurvival = computeEffectiveBaseline(ENFP_BASELINE, drivesSurvival);
    const endDropNormal = ENFP_BASELINE.END - effectiveNormal.END;
    const endDropSurvival = ENFP_BASELINE.END - effectiveSurvival.END;
    assert.ok(endDropSurvival < endDropNormal,
      "connection effect on END should be suppressed when survival is low");
  });

  it("effective baseline stays within [0, 100]", () => {
    const drives = makeDrives({ survival: 0, safety: 0, connection: 0, esteem: 0, curiosity: 0 });
    const effective = computeEffectiveBaseline(ENFP_BASELINE, drives);
    for (const key of ["DA", "HT", "CORT", "OT", "NE", "END"] as const) {
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
    // DA should drop significantly (connection + esteem + curiosity all pull it down)
    assert.ok(effective.DA < ENFP_BASELINE.DA - 10,
      "multiple deficits should compound DA drop");
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
