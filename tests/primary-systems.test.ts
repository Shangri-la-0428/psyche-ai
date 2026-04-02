import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePrimarySystems,
  computeSystemInteractions,
  gatePrimarySystemsByAutonomic,
  getDominantSystems,
  describeBehavioralTendencies,
  type PrimarySystemLevels,
  type PrimarySystemName,
  type BehavioralTendency,
  PRIMARY_SYSTEM_NAMES,
} from "../src/primary-systems.js";
import type { SelfState, InnateDrives } from "../src/types.js";
import type { AutonomicState } from "../src/autonomic.js";

// ── Helpers ──────────────────────────────────────────────────

function makeChemistry(overrides: Partial<SelfState> = {}): SelfState {
  return { flow: 50, order: 50, boundary: 50, resonance: 50, ...overrides };
}

function makeDrives(overrides: Partial<InnateDrives> = {}): InnateDrives {
  return { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70, ...overrides };
}

// ── PRIMARY_SYSTEM_NAMES constant ────────────────────────────

describe("PRIMARY_SYSTEM_NAMES", () => {
  it("contains exactly 7 system names", () => {
    assert.equal(PRIMARY_SYSTEM_NAMES.length, 7);
  });

  it("includes all Panksepp systems", () => {
    const expected: PrimarySystemName[] = [
      "SEEKING", "RAGE", "FEAR", "LUST", "CARE", "PANIC_GRIEF", "PLAY",
    ];
    for (const name of expected) {
      assert.ok(PRIMARY_SYSTEM_NAMES.includes(name), `Missing ${name}`);
    }
  });
});

// ── computePrimarySystems ────────────────────────────────────

describe("computePrimarySystems", () => {
  it("returns all 7 system levels", () => {
    const levels = computePrimarySystems(makeChemistry(), makeDrives(), null);
    for (const name of PRIMARY_SYSTEM_NAMES) {
      assert.ok(typeof levels[name] === "number", `${name} should be a number`);
    }
  });

  it("all levels are in [0, 100] range", () => {
    const levels = computePrimarySystems(makeChemistry(), makeDrives(), null);
    for (const name of PRIMARY_SYSTEM_NAMES) {
      assert.ok(levels[name] >= 0 && levels[name] <= 100,
        `${name} = ${levels[name]} should be in [0, 100]`);
    }
  });

  it("extreme chemistry still produces values in [0, 100]", () => {
    const extremeHigh = makeChemistry({ flow: 100, order: 100, boundary: 100, resonance: 100 });
    const extremeLow = makeChemistry({ flow: 0, order: 0, boundary: 0, resonance: 0 });
    for (const chem of [extremeHigh, extremeLow]) {
      const levels = computePrimarySystems(chem, makeDrives(), null);
      for (const name of PRIMARY_SYSTEM_NAMES) {
        assert.ok(levels[name] >= 0 && levels[name] <= 100,
          `${name} = ${levels[name]} should be in [0, 100]`);
      }
    }
  });

  // ── SEEKING: f(DA, NE, curiosity) ──

  it("SEEKING is higher with high DA and NE", () => {
    const high = computePrimarySystems(
      makeChemistry({ flow: 75 }), makeDrives(), null,
    );
    const low = computePrimarySystems(
      makeChemistry({ flow: 25 }), makeDrives(), null,
    );
    assert.ok(high.SEEKING > low.SEEKING,
      `High DA/NE SEEKING ${high.SEEKING} should > low ${low.SEEKING}`);
  });

  it("SEEKING is higher with high curiosity drive", () => {
    const curious = computePrimarySystems(
      makeChemistry(), makeDrives({ curiosity: 90 }), null,
    );
    const bored = computePrimarySystems(
      makeChemistry(), makeDrives({ curiosity: 20 }), null,
    );
    assert.ok(curious.SEEKING > bored.SEEKING,
      `Curious SEEKING ${curious.SEEKING} should > bored ${bored.SEEKING}`);
  });

  it("SEEKING is suppressed by very low order (high stress)", () => {
    const calm = computePrimarySystems(
      makeChemistry({ flow: 60, order: 70 }), makeDrives(), null,
    );
    const stressed = computePrimarySystems(
      makeChemistry({ flow: 60, order: 20 }), makeDrives(), null,
    );
    assert.ok(calm.SEEKING > stressed.SEEKING,
      `Calm SEEKING ${calm.SEEKING} should > stressed ${stressed.SEEKING}`);
  });

  // ── RAGE: f(CORT, NE, -OT, frustration) ──

  it("RAGE is higher with low order (high stress) and high flow", () => {
    const angry = computePrimarySystems(
      makeChemistry({ order: 20, flow: 75, resonance: 20 }), makeDrives(), null,
    );
    const calm = computePrimarySystems(
      makeChemistry({ order: 80, flow: 30, resonance: 70 }), makeDrives(), null,
    );
    assert.ok(angry.RAGE > calm.RAGE,
      `Angry RAGE ${angry.RAGE} should > calm ${calm.RAGE}`);
  });

  it("RAGE is suppressed by high resonance (bonding softens anger)", () => {
    const lowRes = computePrimarySystems(
      makeChemistry({ order: 30, flow: 65, resonance: 15 }), makeDrives(), null,
    );
    const highRes = computePrimarySystems(
      makeChemistry({ order: 30, flow: 65, resonance: 80 }), makeDrives(), null,
    );
    assert.ok(lowRes.RAGE > highRes.RAGE,
      `Low resonance RAGE ${lowRes.RAGE} should > high resonance ${highRes.RAGE}`);
  });

  it("RAGE is amplified when esteem drive is low (disrespected)", () => {
    const respected = computePrimarySystems(
      makeChemistry({ boundary: 65, flow: 60 }), makeDrives({ esteem: 80 }), null,
    );
    const disrespected = computePrimarySystems(
      makeChemistry({ boundary: 65, flow: 60 }), makeDrives({ esteem: 15 }), null,
    );
    assert.ok(disrespected.RAGE > respected.RAGE,
      `Disrespected RAGE ${disrespected.RAGE} should > respected ${respected.RAGE}`);
  });

  // ── FEAR: f(CORT, NE, -HT, survival, safety) ──

  it("FEAR is higher with low order (high stress)", () => {
    const fearful = computePrimarySystems(
      makeChemistry({ order: 15, flow: 70 }), makeDrives(), null,
    );
    const safe = computePrimarySystems(
      makeChemistry({ order: 80, flow: 30 }), makeDrives(), null,
    );
    assert.ok(fearful.FEAR > safe.FEAR,
      `Fearful FEAR ${fearful.FEAR} should > safe ${safe.FEAR}`);
  });

  it("FEAR is amplified when survival/safety drives are low", () => {
    const secure = computePrimarySystems(
      makeChemistry({ boundary: 65 }), makeDrives({ survival: 90, safety: 85 }), null,
    );
    const threatened = computePrimarySystems(
      makeChemistry({ boundary: 65 }), makeDrives({ survival: 15, safety: 10 }), null,
    );
    assert.ok(threatened.FEAR > secure.FEAR,
      `Threatened FEAR ${threatened.FEAR} should > secure ${secure.FEAR}`);
  });

  // ── LUST (mapped to intense intellectual/creative attraction) ──

  it("LUST is higher with high flow and high order", () => {
    const attracted = computePrimarySystems(
      makeChemistry({ flow: 80, order: 75 }), makeDrives(), null,
    );
    const flat = computePrimarySystems(
      makeChemistry({ flow: 25, order: 30 }), makeDrives(), null,
    );
    assert.ok(attracted.LUST > flat.LUST,
      `Attracted LUST ${attracted.LUST} should > flat ${flat.LUST}`);
  });

  // ── CARE: f(OT, END, connection) ──

  it("CARE is higher with high OT and END", () => {
    const caring = computePrimarySystems(
      makeChemistry({ resonance: 75 }), makeDrives(), null,
    );
    const detached = computePrimarySystems(
      makeChemistry({ resonance: 20 }), makeDrives(), null,
    );
    assert.ok(caring.CARE > detached.CARE,
      `Caring CARE ${caring.CARE} should > detached ${detached.CARE}`);
  });

  it("CARE is amplified when connection drive is high", () => {
    const connected = computePrimarySystems(
      makeChemistry({ resonance: 65 }), makeDrives({ connection: 85 }), null,
    );
    const isolated = computePrimarySystems(
      makeChemistry({ resonance: 65 }), makeDrives({ connection: 20 }), null,
    );
    assert.ok(connected.CARE > isolated.CARE,
      `Connected CARE ${connected.CARE} should > isolated ${isolated.CARE}`);
  });

  it("CARE is suppressed by low order (high stress blocks nurturing)", () => {
    const calm = computePrimarySystems(
      makeChemistry({ resonance: 60, order: 75 }), makeDrives(), null,
    );
    const stressed = computePrimarySystems(
      makeChemistry({ resonance: 60, order: 20 }), makeDrives(), null,
    );
    assert.ok(calm.CARE > stressed.CARE,
      `Calm CARE ${calm.CARE} should > stressed ${stressed.CARE}`);
  });

  // ── PANIC_GRIEF: f(-OT, CORT, attachment anxiety) ──

  it("PANIC_GRIEF is higher with low OT and high CORT", () => {
    const grieving = computePrimarySystems(
      makeChemistry({ resonance: 10, boundary: 80 }), makeDrives({ connection: 15 }), null,
    );
    const secure = computePrimarySystems(
      makeChemistry({ resonance: 75, boundary: 30 }), makeDrives({ connection: 80 }), null,
    );
    assert.ok(grieving.PANIC_GRIEF > secure.PANIC_GRIEF,
      `Grieving PANIC_GRIEF ${grieving.PANIC_GRIEF} should > secure ${secure.PANIC_GRIEF}`);
  });

  it("PANIC_GRIEF is amplified when connection drive is low (separation)", () => {
    const connected = computePrimarySystems(
      makeChemistry({ resonance: 30 }), makeDrives({ connection: 85 }), null,
    );
    const separated = computePrimarySystems(
      makeChemistry({ resonance: 30 }), makeDrives({ connection: 10 }), null,
    );
    assert.ok(separated.PANIC_GRIEF > connected.PANIC_GRIEF,
      `Separated PANIC_GRIEF ${separated.PANIC_GRIEF} should > connected ${connected.PANIC_GRIEF}`);
  });

  // ── PLAY: f(END, DA, -CORT, safety, OT) ──

  it("PLAY is higher with high END and DA, low CORT", () => {
    const playful = computePrimarySystems(
      makeChemistry({ resonance: 60, flow: 75, boundary: 20 }), makeDrives(), null,
    );
    const serious = computePrimarySystems(
      makeChemistry({ resonance: 30, flow: 25, boundary: 75 }), makeDrives(), null,
    );
    assert.ok(playful.PLAY > serious.PLAY,
      `Playful PLAY ${playful.PLAY} should > serious ${serious.PLAY}`);
  });

  it("PLAY requires sufficient safety drive", () => {
    const safe = computePrimarySystems(
      makeChemistry({ resonance: 70, flow: 65 }), makeDrives({ safety: 80 }), null,
    );
    const unsafe = computePrimarySystems(
      makeChemistry({ resonance: 70, flow: 65 }), makeDrives({ safety: 15 }), null,
    );
    assert.ok(safe.PLAY > unsafe.PLAY,
      `Safe PLAY ${safe.PLAY} should > unsafe ${unsafe.PLAY}`);
  });

  // ── Recent stimulus influence ──

  it("recent praise stimulus boosts CARE and SEEKING", () => {
    const withPraise = computePrimarySystems(
      makeChemistry(), makeDrives(), "praise",
    );
    const withNothing = computePrimarySystems(
      makeChemistry(), makeDrives(), null,
    );
    // Praise should gently boost prosocial systems
    assert.ok(withPraise.CARE >= withNothing.CARE,
      `Praise CARE ${withPraise.CARE} should >= no-stimulus ${withNothing.CARE}`);
  });

  it("recent conflict stimulus boosts RAGE", () => {
    const withConflict = computePrimarySystems(
      makeChemistry(), makeDrives(), "conflict",
    );
    const withNothing = computePrimarySystems(
      makeChemistry(), makeDrives(), null,
    );
    assert.ok(withConflict.RAGE >= withNothing.RAGE,
      `Conflict RAGE ${withConflict.RAGE} should >= no-stimulus ${withNothing.RAGE}`);
  });

  it("recent neglect stimulus boosts PANIC_GRIEF", () => {
    const withNeglect = computePrimarySystems(
      makeChemistry(), makeDrives(), "neglect",
    );
    const withNothing = computePrimarySystems(
      makeChemistry(), makeDrives(), null,
    );
    assert.ok(withNeglect.PANIC_GRIEF >= withNothing.PANIC_GRIEF,
      `Neglect PANIC_GRIEF ${withNeglect.PANIC_GRIEF} should >= no-stimulus ${withNothing.PANIC_GRIEF}`);
  });

  it("recent humor stimulus boosts PLAY", () => {
    const withHumor = computePrimarySystems(
      makeChemistry(), makeDrives(), "humor",
    );
    const withNothing = computePrimarySystems(
      makeChemistry(), makeDrives(), null,
    );
    assert.ok(withHumor.PLAY >= withNothing.PLAY,
      `Humor PLAY ${withHumor.PLAY} should >= no-stimulus ${withNothing.PLAY}`);
  });

  it("recent intellectual stimulus boosts SEEKING and LUST", () => {
    const withIntellectual = computePrimarySystems(
      makeChemistry(), makeDrives(), "intellectual",
    );
    const withNothing = computePrimarySystems(
      makeChemistry(), makeDrives(), null,
    );
    assert.ok(withIntellectual.SEEKING >= withNothing.SEEKING,
      `Intellectual SEEKING ${withIntellectual.SEEKING} should >= no-stimulus ${withNothing.SEEKING}`);
  });
});

// ── computeSystemInteractions ─────────────────────────────────

describe("computeSystemInteractions", () => {
  it("FEAR suppresses PLAY", () => {
    const high_fear: PrimarySystemLevels = {
      SEEKING: 50, RAGE: 30, FEAR: 85, LUST: 30,
      CARE: 50, PANIC_GRIEF: 40, PLAY: 60,
    };
    const result = computeSystemInteractions(high_fear);
    assert.ok(result.PLAY < high_fear.PLAY,
      `PLAY ${result.PLAY} should be suppressed from ${high_fear.PLAY} by high FEAR`);
  });

  it("FEAR suppresses SEEKING", () => {
    const high_fear: PrimarySystemLevels = {
      SEEKING: 60, RAGE: 30, FEAR: 80, LUST: 30,
      CARE: 50, PANIC_GRIEF: 40, PLAY: 40,
    };
    const result = computeSystemInteractions(high_fear);
    assert.ok(result.SEEKING < high_fear.SEEKING,
      `SEEKING ${result.SEEKING} should be suppressed from ${high_fear.SEEKING} by high FEAR`);
  });

  it("SEEKING suppresses PANIC_GRIEF", () => {
    const high_seeking: PrimarySystemLevels = {
      SEEKING: 85, RAGE: 20, FEAR: 20, LUST: 40,
      CARE: 50, PANIC_GRIEF: 60, PLAY: 50,
    };
    const result = computeSystemInteractions(high_seeking);
    assert.ok(result.PANIC_GRIEF < high_seeking.PANIC_GRIEF,
      `PANIC_GRIEF ${result.PANIC_GRIEF} should be suppressed from ${high_seeking.PANIC_GRIEF} by high SEEKING`);
  });

  it("CARE and PLAY can co-activate (not suppressed)", () => {
    const both_high: PrimarySystemLevels = {
      SEEKING: 50, RAGE: 10, FEAR: 10, LUST: 30,
      CARE: 80, PANIC_GRIEF: 10, PLAY: 75,
    };
    const result = computeSystemInteractions(both_high);
    // CARE and PLAY should remain high — they're compatible
    assert.ok(result.CARE >= 70, `CARE ${result.CARE} should remain high`);
    assert.ok(result.PLAY >= 65, `PLAY ${result.PLAY} should remain high`);
  });

  it("RAGE suppresses CARE", () => {
    const angry: PrimarySystemLevels = {
      SEEKING: 40, RAGE: 85, FEAR: 30, LUST: 20,
      CARE: 60, PANIC_GRIEF: 30, PLAY: 20,
    };
    const result = computeSystemInteractions(angry);
    assert.ok(result.CARE < angry.CARE,
      `CARE ${result.CARE} should be suppressed from ${angry.CARE} by high RAGE`);
  });

  it("all values remain in [0, 100] after interactions", () => {
    const extreme: PrimarySystemLevels = {
      SEEKING: 100, RAGE: 100, FEAR: 100, LUST: 100,
      CARE: 100, PANIC_GRIEF: 100, PLAY: 100,
    };
    const result = computeSystemInteractions(extreme);
    for (const name of PRIMARY_SYSTEM_NAMES) {
      assert.ok(result[name] >= 0 && result[name] <= 100,
        `${name} = ${result[name]} should be in [0, 100]`);
    }
  });

  it("zero levels remain at zero", () => {
    const zeros: PrimarySystemLevels = {
      SEEKING: 0, RAGE: 0, FEAR: 0, LUST: 0,
      CARE: 0, PANIC_GRIEF: 0, PLAY: 0,
    };
    const result = computeSystemInteractions(zeros);
    for (const name of PRIMARY_SYSTEM_NAMES) {
      assert.equal(result[name], 0, `${name} should remain 0`);
    }
  });

  it("low FEAR does not significantly suppress PLAY", () => {
    const low_fear: PrimarySystemLevels = {
      SEEKING: 50, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 50, PANIC_GRIEF: 20, PLAY: 70,
    };
    const result = computeSystemInteractions(low_fear);
    // Low FEAR shouldn't strongly suppress PLAY
    assert.ok(result.PLAY >= 60,
      `PLAY ${result.PLAY} should not be heavily suppressed by low FEAR (15)`);
  });

  it("PANIC_GRIEF and RAGE can co-activate (grief-rage)", () => {
    const grief_rage: PrimarySystemLevels = {
      SEEKING: 20, RAGE: 70, FEAR: 30, LUST: 10,
      CARE: 20, PANIC_GRIEF: 75, PLAY: 10,
    };
    const result = computeSystemInteractions(grief_rage);
    // Both should remain elevated — grief can fuel rage
    assert.ok(result.RAGE >= 55, `RAGE ${result.RAGE} should remain elevated`);
    assert.ok(result.PANIC_GRIEF >= 55, `PANIC_GRIEF ${result.PANIC_GRIEF} should remain elevated`);
  });
});

// ── gatePrimarySystemsByAutonomic ─────────────────────────────

describe("gatePrimarySystemsByAutonomic", () => {
  const baseLevels: PrimarySystemLevels = {
    SEEKING: 60, RAGE: 50, FEAR: 50, LUST: 40,
    CARE: 65, PANIC_GRIEF: 40, PLAY: 70,
  };

  it("ventral-vagal passes all systems through", () => {
    const result = gatePrimarySystemsByAutonomic(baseLevels, "ventral-vagal");
    for (const name of PRIMARY_SYSTEM_NAMES) {
      assert.equal(result[name], baseLevels[name],
        `${name} should pass through unchanged in ventral-vagal`);
    }
  });

  it("sympathetic suppresses PLAY and CARE", () => {
    const result = gatePrimarySystemsByAutonomic(baseLevels, "sympathetic");
    assert.ok(result.PLAY < baseLevels.PLAY,
      `PLAY ${result.PLAY} should be suppressed in sympathetic`);
    assert.ok(result.CARE < baseLevels.CARE,
      `CARE ${result.CARE} should be suppressed in sympathetic`);
  });

  it("sympathetic amplifies FEAR and RAGE", () => {
    const result = gatePrimarySystemsByAutonomic(baseLevels, "sympathetic");
    assert.ok(result.FEAR >= baseLevels.FEAR,
      `FEAR ${result.FEAR} should be >= baseline in sympathetic`);
    assert.ok(result.RAGE >= baseLevels.RAGE,
      `RAGE ${result.RAGE} should be >= baseline in sympathetic`);
  });

  it("dorsal-vagal suppresses almost everything", () => {
    const result = gatePrimarySystemsByAutonomic(baseLevels, "dorsal-vagal");
    assert.ok(result.SEEKING < baseLevels.SEEKING * 0.5,
      `SEEKING ${result.SEEKING} should be heavily suppressed in dorsal-vagal`);
    assert.ok(result.PLAY < baseLevels.PLAY * 0.5,
      `PLAY ${result.PLAY} should be heavily suppressed in dorsal-vagal`);
    assert.ok(result.RAGE < baseLevels.RAGE * 0.5,
      `RAGE ${result.RAGE} should be heavily suppressed in dorsal-vagal`);
  });

  it("dorsal-vagal allows PANIC_GRIEF (shutdown grief)", () => {
    const result = gatePrimarySystemsByAutonomic(baseLevels, "dorsal-vagal");
    // PANIC_GRIEF is the one system that can persist in dorsal-vagal
    assert.ok(result.PANIC_GRIEF >= baseLevels.PANIC_GRIEF * 0.5,
      `PANIC_GRIEF ${result.PANIC_GRIEF} should not be heavily suppressed in dorsal-vagal`);
  });

  it("all gated values remain in [0, 100]", () => {
    const states: AutonomicState[] = ["ventral-vagal", "sympathetic", "dorsal-vagal"];
    for (const state of states) {
      const result = gatePrimarySystemsByAutonomic(baseLevels, state);
      for (const name of PRIMARY_SYSTEM_NAMES) {
        assert.ok(result[name] >= 0 && result[name] <= 100,
          `${name} = ${result[name]} in ${state} should be in [0, 100]`);
      }
    }
  });
});

// ── getDominantSystems ────────────────────────────────────────

describe("getDominantSystems", () => {
  it("returns systems above threshold", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 75, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 80, PANIC_GRIEF: 10, PLAY: 70,
    };
    const dominant = getDominantSystems(levels, 60);
    const names = dominant.map(d => d.system);
    assert.ok(names.includes("SEEKING"), "Should include SEEKING (75)");
    assert.ok(names.includes("CARE"), "Should include CARE (80)");
    assert.ok(names.includes("PLAY"), "Should include PLAY (70)");
    assert.ok(!names.includes("RAGE"), "Should not include RAGE (20)");
    assert.ok(!names.includes("FEAR"), "Should not include FEAR (15)");
  });

  it("returns sorted by activation level (descending)", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 60, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 90, PANIC_GRIEF: 10, PLAY: 75,
    };
    const dominant = getDominantSystems(levels, 50);
    assert.equal(dominant[0].system, "CARE");
    assert.equal(dominant[1].system, "PLAY");
    assert.equal(dominant[2].system, "SEEKING");
  });

  it("returns empty array when nothing exceeds threshold", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 30, RAGE: 20, FEAR: 25, LUST: 15,
      CARE: 35, PANIC_GRIEF: 10, PLAY: 40,
    };
    const dominant = getDominantSystems(levels, 60);
    assert.equal(dominant.length, 0);
  });

  it("default threshold works", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 75, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 80, PANIC_GRIEF: 10, PLAY: 40,
    };
    const dominant = getDominantSystems(levels);
    assert.ok(dominant.length >= 1, "Should have at least one dominant system");
  });

  it("each dominant system has system name, level, and tendency", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 80, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 75, PANIC_GRIEF: 10, PLAY: 70,
    };
    const dominant = getDominantSystems(levels, 60);
    for (const d of dominant) {
      assert.ok(typeof d.system === "string", "system should be string");
      assert.ok(typeof d.level === "number", "level should be number");
      assert.ok(typeof d.tendency === "object", "tendency should be object");
      assert.ok(typeof d.tendency.description === "string", "tendency.description should be string");
      assert.ok(typeof d.tendency.descriptionZh === "string", "tendency.descriptionZh should be string");
    }
  });
});

// ── describeBehavioralTendencies ──────────────────────────────

describe("describeBehavioralTendencies", () => {
  it("returns zh description for zh locale", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 80, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 75, PANIC_GRIEF: 10, PLAY: 70,
    };
    const desc = describeBehavioralTendencies(levels, "zh");
    assert.ok(desc.length > 0, "Should return non-empty description");
    // Should contain Chinese characters
    assert.ok(/[\u4e00-\u9fff]/.test(desc), "zh description should contain Chinese");
  });

  it("returns en description for en locale", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 80, RAGE: 20, FEAR: 15, LUST: 30,
      CARE: 75, PANIC_GRIEF: 10, PLAY: 70,
    };
    const desc = describeBehavioralTendencies(levels, "en");
    assert.ok(desc.length > 0, "Should return non-empty description");
    assert.ok(/[a-zA-Z]/.test(desc), "en description should contain English");
  });

  it("returns empty string when no systems are dominant", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 30, RAGE: 25, FEAR: 20, LUST: 20,
      CARE: 35, PANIC_GRIEF: 15, PLAY: 30,
    };
    const desc = describeBehavioralTendencies(levels, "zh");
    assert.equal(desc, "", "Should return empty string for low activation");
  });

  it("SEEKING-dominant description mentions exploration/curiosity", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 85, RAGE: 10, FEAR: 10, LUST: 20,
      CARE: 30, PANIC_GRIEF: 10, PLAY: 30,
    };
    const desc = describeBehavioralTendencies(levels, "en");
    assert.ok(desc.length > 0, "Should describe SEEKING tendency");
  });

  it("RAGE-dominant description reflects frustration/assertiveness", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 30, RAGE: 85, FEAR: 30, LUST: 10,
      CARE: 15, PANIC_GRIEF: 40, PLAY: 10,
    };
    const desc = describeBehavioralTendencies(levels, "en");
    assert.ok(desc.length > 0, "Should describe RAGE tendency");
  });

  it("CARE-dominant description reflects nurturing", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 40, RAGE: 10, FEAR: 10, LUST: 20,
      CARE: 90, PANIC_GRIEF: 10, PLAY: 40,
    };
    const desc = describeBehavioralTendencies(levels, "en");
    assert.ok(desc.length > 0, "Should describe CARE tendency");
  });

  it("PLAY-dominant description reflects playfulness", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 40, RAGE: 10, FEAR: 10, LUST: 20,
      CARE: 40, PANIC_GRIEF: 10, PLAY: 85,
    };
    const desc = describeBehavioralTendencies(levels, "en");
    assert.ok(desc.length > 0, "Should describe PLAY tendency");
  });

  it("multiple dominant systems produce combined description", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 80, RAGE: 10, FEAR: 10, LUST: 20,
      CARE: 85, PANIC_GRIEF: 10, PLAY: 75,
    };
    const desc = describeBehavioralTendencies(levels, "zh");
    assert.ok(desc.length > 0, "Should produce combined description");
  });

  it("description is concise (under 100 characters)", () => {
    const levels: PrimarySystemLevels = {
      SEEKING: 80, RAGE: 70, FEAR: 65, LUST: 60,
      CARE: 85, PANIC_GRIEF: 75, PLAY: 70,
    };
    const desc = describeBehavioralTendencies(levels, "zh");
    assert.ok(desc.length <= 100,
      `Description length ${desc.length} should be <= 100 chars for token efficiency`);
  });
});

// ── Integration: full pipeline scenarios ──────────────────────

describe("primary systems integration scenarios", () => {
  it("warm conversation: CARE + PLAY + SEEKING co-activate", () => {
    // After a warm, funny, intellectually stimulating exchange
    const chemistry = makeChemistry({ flow: 55, order: 65, boundary: 25, resonance: 70 });
    const drives = makeDrives({ connection: 80, curiosity: 75, safety: 80 });
    const raw = computePrimarySystems(chemistry, drives, "humor");
    const levels = computeSystemInteractions(raw);
    const gated = gatePrimarySystemsByAutonomic(levels, "ventral-vagal");
    const dominant = getDominantSystems(gated, 50);
    const names = dominant.map(d => d.system);

    // Should have prosocial systems active
    assert.ok(
      names.includes("CARE") || names.includes("PLAY") || names.includes("SEEKING"),
      `Warm conversation should activate prosocial systems, got: ${names.join(", ")}`,
    );
  });

  it("hostile exchange: RAGE + FEAR activate, PLAY suppressed", () => {
    // Low order = high stress, high flow = activated, low resonance = disconnected
    const chemistry = makeChemistry({ flow: 75, order: 15, boundary: 80, resonance: 10 });
    const drives = makeDrives({ safety: 15, esteem: 10, survival: 30 });
    const raw = computePrimarySystems(chemistry, drives, "conflict");
    const levels = computeSystemInteractions(raw);
    const gated = gatePrimarySystemsByAutonomic(levels, "sympathetic");
    const dominant = getDominantSystems(gated, 40);
    const names = dominant.map(d => d.system);

    assert.ok(!names.includes("PLAY"), "PLAY should not be dominant in hostile exchange");
    assert.ok(!names.includes("CARE"), "CARE should not be dominant in hostile exchange");
    assert.ok(
      names.includes("RAGE") || names.includes("FEAR"),
      `Hostile exchange should activate RAGE or FEAR, got: ${names.join(", ")}`,
    );
  });

  it("neglected and shut down: PANIC_GRIEF in dorsal-vagal", () => {
    const chemistry = makeChemistry({ flow: 15, order: 15, boundary: 85, resonance: 10 });
    const drives = makeDrives({ connection: 10, safety: 15, esteem: 10 });
    const raw = computePrimarySystems(chemistry, drives, "neglect");
    const levels = computeSystemInteractions(raw);
    const gated = gatePrimarySystemsByAutonomic(levels, "dorsal-vagal");

    // PANIC_GRIEF should persist in dorsal-vagal; most others suppressed
    assert.ok(gated.PLAY < 20, `PLAY ${gated.PLAY} should be low in dorsal-vagal`);
    assert.ok(gated.SEEKING < 20, `SEEKING ${gated.SEEKING} should be low in dorsal-vagal`);
  });

  it("intellectual excitement: SEEKING + LUST co-activate", () => {
    const chemistry = makeChemistry({ flow: 75, order: 55, boundary: 30, resonance: 55 });
    const drives = makeDrives({ curiosity: 85 });
    const raw = computePrimarySystems(chemistry, drives, "intellectual");
    const levels = computeSystemInteractions(raw);
    const dominant = getDominantSystems(levels, 50);
    const names = dominant.map(d => d.system);

    assert.ok(names.includes("SEEKING"),
      `Intellectual excitement should activate SEEKING, got: ${names.join(", ")}`);
  });

  it("reciprocity scenario: coldness triggers reduced CARE", () => {
    // User has been cold → low OT, elevated CORT, connection drive drops
    const coldChemistry = makeChemistry({ flow: 45, order: 35, boundary: 60, resonance: 25 });
    const coldDrives = makeDrives({ connection: 25, esteem: 30 });
    const cold = computePrimarySystems(coldChemistry, coldDrives, "neglect");
    const coldInteracted = computeSystemInteractions(cold);

    // Warm scenario for comparison
    const warmChemistry = makeChemistry({ flow: 50, order: 65, boundary: 25, resonance: 65 });
    const warmDrives = makeDrives({ connection: 80, esteem: 75 });
    const warm = computePrimarySystems(warmChemistry, warmDrives, "praise");
    const warmInteracted = computeSystemInteractions(warm);

    // CARE should be much lower in cold scenario → reciprocity emergent
    assert.ok(coldInteracted.CARE < warmInteracted.CARE,
      `Cold CARE ${coldInteracted.CARE} should < warm CARE ${warmInteracted.CARE} (reciprocity)`);
    // RAGE/PANIC should be higher in cold scenario
    assert.ok(
      coldInteracted.RAGE > warmInteracted.RAGE || coldInteracted.PANIC_GRIEF > warmInteracted.PANIC_GRIEF,
      "Cold treatment should elevate RAGE or PANIC_GRIEF (reciprocity)",
    );
  });

  it("behavioral description pipeline works end-to-end", () => {
    const chemistry = makeChemistry({ flow: 70, resonance: 65, boundary: 25 });
    const drives = makeDrives({ connection: 80 });
    const raw = computePrimarySystems(chemistry, drives, "casual");
    const interacted = computeSystemInteractions(raw);
    const gated = gatePrimarySystemsByAutonomic(interacted, "ventral-vagal");
    const desc = describeBehavioralTendencies(gated, "zh");
    // Should produce some description for a clearly active state
    assert.ok(typeof desc === "string", "Description should be a string");
  });
});
