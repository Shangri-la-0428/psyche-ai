import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeCircadianModulation,
  computeHomeostaticPressure,
  getCircadianPhase,
  computeEnergyDepletion,
  computeEnergyRecovery,
  type CircadianPhase,
} from "../src/circadian.js";
import type { SelfState, EnergyBudgets } from "../src/types.js";
import { DEFAULT_ENERGY_BUDGETS } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeBaseline(): SelfState {
  return { flow: 50, order: 50, boundary: 50, resonance: 50 };
}

/** Create a Date at a specific hour (0-23) today */
function atHour(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ── getCircadianPhase ────────────────────────────────────────

describe("getCircadianPhase", () => {
  it("classifies early morning (6-9) as morning", () => {
    assert.equal(getCircadianPhase(atHour(7)), "morning");
    assert.equal(getCircadianPhase(atHour(8)), "morning");
  });

  it("classifies midday (10-13) as midday", () => {
    assert.equal(getCircadianPhase(atHour(10)), "midday");
    assert.equal(getCircadianPhase(atHour(12)), "midday");
  });

  it("classifies afternoon (14-17) as afternoon", () => {
    assert.equal(getCircadianPhase(atHour(14)), "afternoon");
    assert.equal(getCircadianPhase(atHour(16)), "afternoon");
  });

  it("classifies evening (18-21) as evening", () => {
    assert.equal(getCircadianPhase(atHour(18)), "evening");
    assert.equal(getCircadianPhase(atHour(20)), "evening");
  });

  it("classifies night (22-5) as night", () => {
    assert.equal(getCircadianPhase(atHour(23)), "night");
    assert.equal(getCircadianPhase(atHour(2)), "night");
    assert.equal(getCircadianPhase(atHour(5)), "night");
  });
});

// ── computeCircadianModulation ───────────────────────────────

describe("computeCircadianModulation", () => {
  const baseline = makeBaseline();

  it("returns a valid SelfState with all values in [0, 100]", () => {
    for (let h = 0; h < 24; h++) {
      const mod = computeCircadianModulation(atHour(h), baseline);
      for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
        assert.ok(mod[key] >= 0 && mod[key] <= 100,
          `${key} at hour ${h} = ${mod[key]} should be in [0, 100]`);
      }
    }
  });

  // Cortisol: peaks ~8am, trough ~midnight
  it("CORT is higher in the morning than at midnight", () => {
    const morning = computeCircadianModulation(atHour(8), baseline);
    const midnight = computeCircadianModulation(atHour(0), baseline);
    assert.ok(morning.boundary > midnight.boundary,
      `Morning CORT ${morning.boundary} should > midnight CORT ${midnight.boundary}`);
  });

  // Serotonin: higher during daytime (9-17)
  it("HT is higher at noon than at midnight", () => {
    const noon = computeCircadianModulation(atHour(12), baseline);
    const midnight = computeCircadianModulation(atHour(0), baseline);
    assert.ok(noon.order > midnight.order,
      `Noon HT ${noon.order} should > midnight HT ${midnight.order}`);
  });

  // Norepinephrine: morning rise, evening decline
  it("NE is higher in the morning than in the evening", () => {
    const morning = computeCircadianModulation(atHour(8), baseline);
    const evening = computeCircadianModulation(atHour(21), baseline);
    assert.ok(morning.flow > evening.flow,
      `Morning NE ${morning.flow} should > evening NE ${evening.flow}`);
  });

  // Endorphins: slight evening rise (social hours)
  it("END is higher in the evening than early morning", () => {
    const evening = computeCircadianModulation(atHour(20), baseline);
    const earlyMorning = computeCircadianModulation(atHour(6), baseline);
    assert.ok(evening.resonance >= earlyMorning.resonance,
      `Evening END ${evening.resonance} should >= early morning END ${earlyMorning.resonance}`);
  });

  // Modulations are subtle — max ±8 from baseline
  it("modulations are subtle (max ±10 from baseline)", () => {
    for (let h = 0; h < 24; h++) {
      const mod = computeCircadianModulation(atHour(h), baseline);
      for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
        const delta = Math.abs(mod[key] - baseline[key]);
        assert.ok(delta <= 10,
          `${key} at hour ${h}: delta ${delta} should be <= 10`);
      }
    }
  });

  // Different baselines produce different modulations (not hardcoded absolute values)
  it("respects different baselines", () => {
    const highBaseline: SelfState = { flow: 80, order: 80, boundary: 80, resonance: 80 };
    const lowBaseline: SelfState = { flow: 20, order: 20, boundary: 20, resonance: 20 };
    const highMod = computeCircadianModulation(atHour(12), highBaseline);
    const lowMod = computeCircadianModulation(atHour(12), lowBaseline);
    // High baseline should produce higher modulated values
    assert.ok(highMod.flow > lowMod.flow,
      `High baseline DA ${highMod.flow} should > low baseline DA ${lowMod.flow}`);
  });

  // Continuous — no sudden jumps between adjacent hours
  it("produces smooth transitions between adjacent hours", () => {
    for (let h = 0; h < 23; h++) {
      const a = computeCircadianModulation(atHour(h), baseline);
      const b = computeCircadianModulation(atHour(h + 1), baseline);
      for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
        const jump = Math.abs(a[key] - b[key]);
        assert.ok(jump <= 5,
          `${key} jump from hour ${h} to ${h + 1} = ${jump} should be <= 5`);
      }
    }
  });

  // Edge: baseline at 0 should not go negative
  it("clamps at 0 for zero baseline", () => {
    const zeroBaseline: SelfState = { flow: 0, order: 0, boundary: 0, resonance: 0 };
    for (let h = 0; h < 24; h++) {
      const mod = computeCircadianModulation(atHour(h), zeroBaseline);
      for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
        assert.ok(mod[key] >= 0, `${key} at hour ${h} = ${mod[key]} should be >= 0`);
      }
    }
  });

  // Edge: baseline at 100 should not exceed 100
  it("clamps at 100 for max baseline", () => {
    const maxBaseline: SelfState = { flow: 100, order: 100, boundary: 100, resonance: 100 };
    for (let h = 0; h < 24; h++) {
      const mod = computeCircadianModulation(atHour(h), maxBaseline);
      for (const key of ["flow", "order", "boundary", "resonance", "flow", "resonance"] as const) {
        assert.ok(mod[key] <= 100, `${key} at hour ${h} = ${mod[key]} should be <= 100`);
      }
    }
  });
});

// ── computeHomeostaticPressure ───────────────────────────────

describe("computeHomeostaticPressure", () => {
  it("returns zero pressure for short sessions (< 30 min)", () => {
    const pressure = computeHomeostaticPressure(15);
    assert.equal(pressure.orderDepletion, 0);
    assert.equal(pressure.flowDepletion, 0);
    assert.equal(pressure.boundaryStiffening, 0);
  });

  it("returns moderate pressure for 1-hour session", () => {
    const pressure = computeHomeostaticPressure(60);
    assert.ok(pressure.orderDepletion > 0, "CORT should accumulate");
    assert.ok(pressure.flowDepletion > 0, "DA should deplete");
    assert.ok(pressure.boundaryStiffening > 0, "NE should deplete");
  });

  it("returns higher pressure for longer sessions", () => {
    const short = computeHomeostaticPressure(60);
    const long = computeHomeostaticPressure(180);
    assert.ok(long.orderDepletion > short.orderDepletion,
      "Longer session should have more CORT accumulation");
    assert.ok(long.flowDepletion > short.flowDepletion,
      "Longer session should have more DA depletion");
  });

  it("pressure has a ceiling (diminishing returns)", () => {
    const veryLong = computeHomeostaticPressure(600); // 10 hours
    const extreme = computeHomeostaticPressure(1440); // 24 hours
    // Should not double — diminishing returns
    assert.ok(extreme.orderDepletion < veryLong.orderDepletion * 2,
      "Pressure should have diminishing returns");
  });

  it("returns all non-negative values", () => {
    for (const mins of [0, 10, 30, 60, 120, 300, 600]) {
      const pressure = computeHomeostaticPressure(mins);
      assert.ok(pressure.orderDepletion >= 0);
      assert.ok(pressure.flowDepletion >= 0);
      assert.ok(pressure.boundaryStiffening >= 0);
    }
  });

  it("zero minutes returns zero pressure", () => {
    const pressure = computeHomeostaticPressure(0);
    assert.equal(pressure.orderDepletion, 0);
    assert.equal(pressure.flowDepletion, 0);
    assert.equal(pressure.boundaryStiffening, 0);
  });
});

// ── Circadian + Homeostatic combined behavior ────────────────

describe("circadian integration scenarios", () => {
  const baseline = makeBaseline();

  it("morning agent feels alert: higher CORT and NE", () => {
    const mod = computeCircadianModulation(atHour(8), baseline);
    assert.ok(mod.boundary > baseline.boundary, "Morning CORT should be above baseline");
    assert.ok(mod.flow > baseline.flow, "Morning NE should be above baseline");
  });

  it("evening agent feels warm and mellow: higher OT and END, lower NE", () => {
    const mod = computeCircadianModulation(atHour(20), baseline);
    assert.ok(mod.resonance >= baseline.resonance, "Evening OT should be >= baseline");
    assert.ok(mod.resonance >= baseline.resonance, "Evening END should be >= baseline");
  });

  it("late night agent feels depleted: lower DA and NE", () => {
    const mod = computeCircadianModulation(atHour(3), baseline);
    assert.ok(mod.flow <= baseline.flow, "Late night DA should be <= baseline");
    assert.ok(mod.flow < baseline.flow, "Late night NE should be below baseline");
  });

  it("exhausted agent (long session + late night) is significantly depleted", () => {
    const mod = computeCircadianModulation(atHour(3), baseline);
    const pressure = computeHomeostaticPressure(240); // 4 hours
    const finalDA = Math.max(0, mod.flow - pressure.flowDepletion);
    const finalCORT = Math.min(100, mod.boundary + pressure.orderDepletion);
    assert.ok(finalDA < baseline.flow - 5, "Exhausted agent DA should be noticeably below baseline");
    assert.ok(finalCORT > baseline.boundary || pressure.orderDepletion > 0,
      "Exhausted agent should have CORT pressure");
  });
});

// ── Energy Budgets (v9) ─────────────────────────────────────

function makeBudgets(overrides: Partial<EnergyBudgets> = {}): EnergyBudgets {
  return { ...DEFAULT_ENERGY_BUDGETS, ...overrides };
}

describe("computeEnergyDepletion", () => {
  it("depletes attention per turn (base -3)", () => {
    const result = computeEnergyDepletion(makeBudgets(), null, false);
    assert.ok(result.attention < 100, `attention should decrease, got ${result.attention}`);
    assert.equal(result.attention, 97);
  });

  it("intellectual stimulus costs extra attention", () => {
    const casual = computeEnergyDepletion(makeBudgets(), "casual", false);
    const intellectual = computeEnergyDepletion(makeBudgets(), "intellectual", false);
    assert.ok(intellectual.attention < casual.attention,
      "intellectual should drain more attention");
  });

  it("conflict costs extra attention and decision capacity", () => {
    const casual = computeEnergyDepletion(makeBudgets(), "casual", false);
    const conflict = computeEnergyDepletion(makeBudgets(), "conflict", false);
    assert.ok(conflict.attention < casual.attention);
    assert.ok(conflict.decisionCapacity < casual.decisionCapacity);
  });

  it("introvert LOSES social energy per turn", () => {
    const result = computeEnergyDepletion(makeBudgets(), "casual", false);
    assert.ok(result.socialEnergy < 100,
      `Introvert social energy should decrease, got ${result.socialEnergy}`);
  });

  it("extravert GAINS social energy per turn", () => {
    const result = computeEnergyDepletion(makeBudgets(), "casual", true);
    assert.ok(result.socialEnergy > 100,
      `Extravert social energy should increase, got ${result.socialEnergy}`);
  });

  it("extravert social energy can exceed 100 (up to 120)", () => {
    const result = computeEnergyDepletion(makeBudgets({ socialEnergy: 119 }), "casual", true);
    assert.ok(result.socialEnergy <= 120, "should not exceed 120");
    assert.ok(result.socialEnergy > 100, "should be above 100");
  });

  it("introvert social energy capped at 100", () => {
    const result = computeEnergyDepletion(makeBudgets({ socialEnergy: 100 }), null, false);
    assert.ok(result.socialEnergy <= 100);
  });

  it("never goes below 0", () => {
    const result = computeEnergyDepletion(makeBudgets({ attention: 1, socialEnergy: 1, decisionCapacity: 0 }), "conflict", false);
    assert.ok(result.attention >= 0);
    assert.ok(result.socialEnergy >= 0);
    assert.ok(result.decisionCapacity >= 0);
  });

  it("multiple turns accumulate depletion", () => {
    let budgets = makeBudgets();
    for (let i = 0; i < 10; i++) {
      budgets = computeEnergyDepletion(budgets, "intellectual", false);
    }
    assert.ok(budgets.attention < 30,
      `10 intellectual turns should drain attention below 30, got ${budgets.attention}`);
    assert.ok(budgets.socialEnergy < 100,
      "introvert should lose social energy over 10 turns");
  });
});

describe("computeEnergyRecovery", () => {
  it("returns unchanged budgets for 0 minutes", () => {
    const budgets = makeBudgets({ attention: 50 });
    const result = computeEnergyRecovery(budgets, 0, false);
    assert.deepStrictEqual(result, budgets);
  });

  it("recovers attention over time (+20/hr)", () => {
    const result = computeEnergyRecovery(makeBudgets({ attention: 50 }), 60, false);
    assert.ok(result.attention > 50, "attention should recover");
    assert.equal(result.attention, 70); // 50 + 20
  });

  it("introvert GAINS social energy while alone (+15/hr)", () => {
    const result = computeEnergyRecovery(makeBudgets({ socialEnergy: 40 }), 60, false);
    assert.ok(result.socialEnergy > 40,
      `Introvert should recover social energy, got ${result.socialEnergy}`);
  });

  it("extravert LOSES social energy while alone (-3/hr)", () => {
    const result = computeEnergyRecovery(makeBudgets({ socialEnergy: 80 }), 60, true);
    assert.ok(result.socialEnergy < 80,
      `Extravert should lose social energy alone, got ${result.socialEnergy}`);
  });

  it("recovers decision capacity over time (+25/hr)", () => {
    const result = computeEnergyRecovery(makeBudgets({ decisionCapacity: 30 }), 60, false);
    assert.equal(result.decisionCapacity, 55); // 30 + 25
  });

  it("clamped to max values", () => {
    const result = computeEnergyRecovery(makeBudgets({ attention: 95 }), 120, false);
    assert.ok(result.attention <= 100, "attention should not exceed 100");
  });

  it("negative minutes returns unchanged", () => {
    const budgets = makeBudgets({ attention: 50 });
    const result = computeEnergyRecovery(budgets, -10, false);
    assert.deepStrictEqual(result, budgets);
  });
});

describe("E/I direction reversal integration", () => {
  it("introvert exhausts social energy in ~33 turns", () => {
    let budgets = makeBudgets();
    let turns = 0;
    while (budgets.socialEnergy > 10 && turns < 50) {
      budgets = computeEnergyDepletion(budgets, "casual", false);
      turns++;
    }
    assert.ok(turns < 50 && turns > 20,
      `Introvert should exhaust social energy in 20-50 turns, took ${turns}`);
  });

  it("extravert never runs out of social energy from interaction", () => {
    let budgets = makeBudgets();
    for (let i = 0; i < 50; i++) {
      budgets = computeEnergyDepletion(budgets, "casual", true);
    }
    assert.ok(budgets.socialEnergy >= 100,
      `Extravert should not lose social energy from talking, got ${budgets.socialEnergy}`);
  });

  it("energy budgets never go below 0", () => {
    let budgets = { attention: 5, socialEnergy: 5, decisionCapacity: 5 };
    for (let i = 0; i < 20; i++) {
      budgets = computeEnergyDepletion(budgets, "conflict", false);
    }
    assert.ok(budgets.attention >= 0, `attention should not go negative, got ${budgets.attention}`);
    assert.ok(budgets.socialEnergy >= 0, `socialEnergy should not go negative, got ${budgets.socialEnergy}`);
    assert.ok(budgets.decisionCapacity >= 0, `decisionCapacity should not go negative, got ${budgets.decisionCapacity}`);
  });
});
