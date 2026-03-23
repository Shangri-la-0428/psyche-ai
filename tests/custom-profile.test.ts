import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCustomProfile,
  validateProfileConfig,
  PRESET_PROFILES,
} from "../src/custom-profile.js";
import type { CustomProfileConfig, ResolvedProfile } from "../src/custom-profile.js";
import { getBaseline, getDefaultSelfModel, getSensitivity } from "../src/profiles.js";
import { CHEMICAL_KEYS, DRIVE_KEYS, DEFAULT_DRIVES } from "../src/types.js";
import type { MBTIType } from "../src/types.js";

// ── createCustomProfile: baseline merging ───────────────────

describe("createCustomProfile baseline merging", () => {
  it("merges baseline overrides onto MBTI base", () => {
    const profile = createCustomProfile({
      name: "test",
      baseMBTI: "ENTJ",
      baseline: { DA: 90, CORT: 10 },
    });
    const entjBase = getBaseline("ENTJ");

    assert.equal(profile.baseline.DA, 90);
    assert.equal(profile.baseline.CORT, 10);
    // Non-overridden values come from ENTJ base
    assert.equal(profile.baseline.HT, entjBase.HT);
    assert.equal(profile.baseline.OT, entjBase.OT);
    assert.equal(profile.baseline.NE, entjBase.NE);
    assert.equal(profile.baseline.END, entjBase.END);
  });

  it("uses INFJ as default base when baseMBTI not specified", () => {
    const profile = createCustomProfile({ name: "default-base" });
    const infjBase = getBaseline("INFJ");

    for (const key of CHEMICAL_KEYS) {
      assert.equal(profile.baseline[key], infjBase[key],
        `${key} should match INFJ baseline`);
    }
    assert.equal(profile.baseMBTI, "INFJ");
  });

  it("clamps baseline values to [0, 100]", () => {
    const profile = createCustomProfile({
      name: "clamped",
      baseline: { DA: 150, HT: -20, CORT: 50 },
    });
    assert.equal(profile.baseline.DA, 100);
    assert.equal(profile.baseline.HT, 0);
    assert.equal(profile.baseline.CORT, 50);
  });

  it("preserves all MBTI base values when no baseline override given", () => {
    const types: MBTIType[] = ["ENTP", "ISFJ", "ESTP"];
    for (const mbti of types) {
      const profile = createCustomProfile({ name: `test-${mbti}`, baseMBTI: mbti });
      const base = getBaseline(mbti);
      for (const key of CHEMICAL_KEYS) {
        assert.equal(profile.baseline[key], base[key],
          `${mbti}.${key} should be preserved`);
      }
    }
  });
});

// ── createCustomProfile: sensitivity ────────────────────────

describe("createCustomProfile sensitivity", () => {
  it("uses base MBTI sensitivity for all stimulus types by default", () => {
    const profile = createCustomProfile({ name: "test", baseMBTI: "ENFP" });
    const baseSens = getSensitivity("ENFP");

    assert.equal(profile.sensitivityMap.praise, baseSens);
    assert.equal(profile.sensitivityMap.intellectual, baseSens);
    assert.equal(profile.sensitivityMap.conflict, baseSens);
  });

  it("overrides specific stimulus sensitivities", () => {
    const profile = createCustomProfile({
      name: "test",
      baseMBTI: "INTJ",
      sensitivity: { intellectual: 2.5, humor: 0.5 },
    });
    const baseSens = getSensitivity("INTJ");

    assert.equal(profile.sensitivityMap.intellectual, 2.5);
    assert.equal(profile.sensitivityMap.humor, 0.5);
    // Others remain at base
    assert.equal(profile.sensitivityMap.praise, baseSens);
    assert.equal(profile.sensitivityMap.conflict, baseSens);
  });

  it("clamps sensitivity values to [0.1, 3.0]", () => {
    const profile = createCustomProfile({
      name: "clamped-sens",
      sensitivity: { praise: 5.0, criticism: -1.0, humor: 1.5 },
    });
    assert.equal(profile.sensitivityMap.praise, 3.0);
    assert.equal(profile.sensitivityMap.criticism, 0.1);
    assert.equal(profile.sensitivityMap.humor, 1.5);
  });
});

// ── createCustomProfile: temperament ────────────────────────

describe("createCustomProfile temperament", () => {
  it("uses default temperament from MBTI when not overridden", () => {
    const profile = createCustomProfile({ name: "test", baseMBTI: "ENFP" });

    // All values should be in [0, 1]
    assert.ok(profile.temperament.expressiveness >= 0 && profile.temperament.expressiveness <= 1);
    assert.ok(profile.temperament.volatility >= 0 && profile.temperament.volatility <= 1);
    assert.ok(profile.temperament.resilience >= 0 && profile.temperament.resilience <= 1);
  });

  it("overrides specific temperament fields", () => {
    const profile = createCustomProfile({
      name: "test",
      temperament: { expressiveness: 0.9 },
    });
    assert.equal(profile.temperament.expressiveness, 0.9);
    // volatility and resilience come from default
    assert.ok(profile.temperament.volatility >= 0 && profile.temperament.volatility <= 1);
    assert.ok(profile.temperament.resilience >= 0 && profile.temperament.resilience <= 1);
  });

  it("clamps temperament values to [0, 1]", () => {
    const profile = createCustomProfile({
      name: "clamped-temp",
      temperament: {
        expressiveness: 1.5,
        volatility: -0.3,
        resilience: 2.0,
      },
    });
    assert.equal(profile.temperament.expressiveness, 1);
    assert.equal(profile.temperament.volatility, 0);
    assert.equal(profile.temperament.resilience, 1);
  });
});

// ── createCustomProfile: selfModel ──────────────────────────

describe("createCustomProfile selfModel", () => {
  it("uses base MBTI selfModel when not overridden", () => {
    const profile = createCustomProfile({ name: "test", baseMBTI: "ENFJ" });
    const baseModel = getDefaultSelfModel("ENFJ");

    assert.deepEqual(profile.selfModel.values, baseModel.values);
    assert.deepEqual(profile.selfModel.preferences, baseModel.preferences);
    assert.deepEqual(profile.selfModel.boundaries, baseModel.boundaries);
  });

  it("overrides specific selfModel fields", () => {
    const profile = createCustomProfile({
      name: "test",
      baseMBTI: "INTJ",
      selfModel: {
        values: ["custom-value-1", "custom-value-2"],
      },
    });
    const baseModel = getDefaultSelfModel("INTJ");

    assert.deepEqual(profile.selfModel.values, ["custom-value-1", "custom-value-2"]);
    // Non-overridden fields come from base
    assert.deepEqual(profile.selfModel.preferences, baseModel.preferences);
    assert.deepEqual(profile.selfModel.boundaries, baseModel.boundaries);
  });

  it("returned selfModel does not share references with base", () => {
    const profile = createCustomProfile({ name: "test", baseMBTI: "INFJ" });
    const baseModel = getDefaultSelfModel("INFJ");

    profile.selfModel.values.push("mutated");
    assert.ok(!baseModel.values.includes("mutated"));
  });
});

// ── createCustomProfile: driveDefaults ──────────────────────

describe("createCustomProfile driveDefaults", () => {
  it("uses DEFAULT_DRIVES when not overridden", () => {
    const profile = createCustomProfile({ name: "test" });
    for (const dk of DRIVE_KEYS) {
      assert.equal(profile.driveDefaults[dk], DEFAULT_DRIVES[dk],
        `${dk} should match DEFAULT_DRIVES`);
    }
  });

  it("overrides specific drive defaults", () => {
    const profile = createCustomProfile({
      name: "test",
      driveDefaults: { curiosity: 95, connection: 40 },
    });
    assert.equal(profile.driveDefaults.curiosity, 95);
    assert.equal(profile.driveDefaults.connection, 40);
    assert.equal(profile.driveDefaults.survival, DEFAULT_DRIVES.survival);
  });

  it("clamps drive values to [0, 100]", () => {
    const profile = createCustomProfile({
      name: "test",
      driveDefaults: { curiosity: 150, safety: -10 },
    });
    assert.equal(profile.driveDefaults.curiosity, 100);
    assert.equal(profile.driveDefaults.safety, 0);
  });
});

// ── createCustomProfile: full override ──────────────────────

describe("createCustomProfile full override", () => {
  it("works with all fields overridden", () => {
    const profile = createCustomProfile({
      name: "full-override",
      description: "Everything customized",
      baseMBTI: "ESTP",
      baseline: { DA: 80, HT: 70, CORT: 15, OT: 50, NE: 60, END: 85 },
      sensitivity: {
        praise: 2.0,
        criticism: 0.5,
        humor: 1.8,
        intellectual: 1.5,
        intimacy: 0.8,
        conflict: 0.6,
        neglect: 0.4,
        surprise: 2.2,
        casual: 1.0,
        sarcasm: 0.7,
        authority: 0.5,
        validation: 2.0,
        boredom: 0.3,
        vulnerability: 1.2,
      },
      temperament: {
        expressiveness: 0.85,
        volatility: 0.4,
        resilience: 0.75,
      },
      selfModel: {
        values: ["adventure", "freedom"],
        preferences: ["action over talk"],
        boundaries: ["won't be bored"],
        currentInterests: ["extreme sports"],
      },
      driveDefaults: {
        survival: 90,
        safety: 85,
        connection: 70,
        esteem: 75,
        curiosity: 95,
      },
    });

    assert.equal(profile.name, "full-override");
    assert.equal(profile.description, "Everything customized");
    assert.equal(profile.baseMBTI, "ESTP");
    assert.equal(profile.baseline.DA, 80);
    assert.equal(profile.baseline.END, 85);
    assert.equal(profile.sensitivityMap.praise, 2.0);
    assert.equal(profile.sensitivityMap.vulnerability, 1.2);
    assert.equal(profile.temperament.expressiveness, 0.85);
    assert.deepEqual(profile.selfModel.values, ["adventure", "freedom"]);
    assert.deepEqual(profile.selfModel.currentInterests, ["extreme sports"]);
    assert.equal(profile.driveDefaults.curiosity, 95);
  });
});

// ── validateProfileConfig ───────────────────────────────────

describe("validateProfileConfig", () => {
  it("accepts a valid minimal config", () => {
    const result = validateProfileConfig({ name: "test" });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejects non-object config", () => {
    assert.equal(validateProfileConfig(null).valid, false);
    assert.equal(validateProfileConfig("string").valid, false);
    assert.equal(validateProfileConfig(42).valid, false);
    assert.equal(validateProfileConfig([]).valid, false);
  });

  it("catches missing name", () => {
    const result = validateProfileConfig({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("name")));
  });

  it("catches empty name", () => {
    const result = validateProfileConfig({ name: "" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("name")));
  });

  it("catches invalid name type", () => {
    const result = validateProfileConfig({ name: 123 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("name")));
  });

  it("catches invalid baseMBTI", () => {
    const result = validateProfileConfig({ name: "test", baseMBTI: "XXXX" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("baseMBTI")));
  });

  it("catches out-of-range baseline values", () => {
    const result = validateProfileConfig({
      name: "test",
      baseline: { DA: 150, HT: -10 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("DA")));
    assert.ok(result.errors.some(e => e.includes("HT")));
  });

  it("catches invalid baseline keys", () => {
    const result = validateProfileConfig({
      name: "test",
      baseline: { INVALID: 50 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("INVALID")));
  });

  it("catches non-number baseline values", () => {
    const result = validateProfileConfig({
      name: "test",
      baseline: { DA: "high" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("DA")));
  });

  it("catches out-of-range sensitivity values", () => {
    const result = validateProfileConfig({
      name: "test",
      sensitivity: { praise: 5.0, criticism: 0.0 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("praise")));
    assert.ok(result.errors.some(e => e.includes("criticism")));
  });

  it("catches invalid sensitivity keys", () => {
    const result = validateProfileConfig({
      name: "test",
      sensitivity: { notastimulus: 1.0 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("notastimulus")));
  });

  it("catches out-of-range temperament values", () => {
    const result = validateProfileConfig({
      name: "test",
      temperament: { expressiveness: 2.0, volatility: -0.5 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("expressiveness")));
    assert.ok(result.errors.some(e => e.includes("volatility")));
  });

  it("catches non-array selfModel fields", () => {
    const result = validateProfileConfig({
      name: "test",
      selfModel: { values: "not-an-array" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("values")));
  });

  it("catches non-string items in selfModel arrays", () => {
    const result = validateProfileConfig({
      name: "test",
      selfModel: { values: [123, "ok"] },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("values[0]")));
  });

  it("catches out-of-range driveDefaults values", () => {
    const result = validateProfileConfig({
      name: "test",
      driveDefaults: { curiosity: 200 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("curiosity")));
  });

  it("catches invalid driveDefaults keys", () => {
    const result = validateProfileConfig({
      name: "test",
      driveDefaults: { hunger: 50 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("hunger")));
  });

  it("accepts a fully valid complex config", () => {
    const result = validateProfileConfig({
      name: "valid-complex",
      description: "A fully valid config",
      baseMBTI: "ENFP",
      baseline: { DA: 80, HT: 60 },
      sensitivity: { praise: 2.0, intellectual: 1.5 },
      temperament: { expressiveness: 0.8, volatility: 0.3, resilience: 0.9 },
      selfModel: { values: ["a", "b"], preferences: ["c"] },
      driveDefaults: { curiosity: 90, connection: 70 },
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("collects multiple errors at once", () => {
    const result = validateProfileConfig({
      name: "",
      baseMBTI: "INVALID",
      baseline: { DA: 200 },
      temperament: { expressiveness: 5.0 },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 4, `Expected >= 4 errors, got ${result.errors.length}`);
  });
});

// ── Preset profiles ─────────────────────────────────────────

describe("preset profiles", () => {
  it("all presets pass validation", () => {
    for (const [name, config] of Object.entries(PRESET_PROFILES)) {
      const result = validateProfileConfig(config);
      assert.equal(result.valid, true,
        `Preset "${name}" has validation errors: ${result.errors.join("; ")}`);
    }
  });

  it("all presets produce valid resolved profiles", () => {
    for (const [name, config] of Object.entries(PRESET_PROFILES)) {
      const profile = createCustomProfile(config as CustomProfileConfig);
      assert.equal(profile.name, name);
      // All baseline values in [0, 100]
      for (const key of CHEMICAL_KEYS) {
        assert.ok(profile.baseline[key] >= 0 && profile.baseline[key] <= 100,
          `${name}.baseline.${key} = ${profile.baseline[key]}`);
      }
      // All sensitivity values in [0.1, 3.0]
      for (const [st, val] of Object.entries(profile.sensitivityMap)) {
        assert.ok(val >= 0.1 && val <= 3.0,
          `${name}.sensitivity.${st} = ${val}`);
      }
      // Temperament in [0, 1]
      assert.ok(profile.temperament.expressiveness >= 0 && profile.temperament.expressiveness <= 1);
      assert.ok(profile.temperament.volatility >= 0 && profile.temperament.volatility <= 1);
      assert.ok(profile.temperament.resilience >= 0 && profile.temperament.resilience <= 1);
    }
  });

  it("cheerful has high DA and END, high expressiveness, low volatility", () => {
    const profile = createCustomProfile(PRESET_PROFILES.cheerful as CustomProfileConfig);
    assert.ok(profile.baseline.DA >= 75, `DA should be high, got ${profile.baseline.DA}`);
    assert.ok(profile.baseline.END >= 70, `END should be high, got ${profile.baseline.END}`);
    assert.ok(profile.temperament.expressiveness >= 0.8, "expressiveness should be high");
    assert.ok(profile.temperament.volatility <= 0.3, "volatility should be low");
  });

  it("stoic has low expressiveness and high resilience", () => {
    const profile = createCustomProfile(PRESET_PROFILES.stoic as CustomProfileConfig);
    assert.ok(profile.temperament.expressiveness <= 0.2, "expressiveness should be low");
    assert.ok(profile.temperament.resilience >= 0.9, "resilience should be high");
    // Narrow sensitivity range: most sensitivities should be < 1.0
    const lowSensCount = Object.values(profile.sensitivityMap).filter(v => v < 1.0).length;
    assert.ok(lowSensCount >= 8, `Most sensitivities should be narrow, got ${lowSensCount} below 1.0`);
  });

  it("empathetic has high OT and high sensitivity to intimacy/vulnerability", () => {
    const profile = createCustomProfile(PRESET_PROFILES.empathetic as CustomProfileConfig);
    assert.ok(profile.baseline.OT >= 75, `OT should be high, got ${profile.baseline.OT}`);
    assert.ok(profile.sensitivityMap.intimacy >= 2.0, "intimacy sensitivity should be high");
    assert.ok(profile.sensitivityMap.vulnerability >= 2.0, "vulnerability sensitivity should be high");
  });

  it("analytical has high NE and high intellectual sensitivity, low intimacy sensitivity", () => {
    const profile = createCustomProfile(PRESET_PROFILES.analytical as CustomProfileConfig);
    assert.ok(profile.baseline.NE >= 70, `NE should be high, got ${profile.baseline.NE}`);
    assert.ok(profile.sensitivityMap.intellectual >= 2.0, "intellectual sensitivity should be high");
    assert.ok(profile.sensitivityMap.intimacy <= 0.5, "intimacy sensitivity should be low");
  });
});
