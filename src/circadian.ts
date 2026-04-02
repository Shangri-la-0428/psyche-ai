// ============================================================
// Circadian Rhythm — v11: modulates 4 self-state dimensions
// ============================================================

import type { SelfState, EnergyBudgets, StimulusType } from "./types.js";

// ── Phase Classification ─────────────────────────────────────

export type CircadianPhase = "morning" | "midday" | "afternoon" | "evening" | "night";

export function getCircadianPhase(time: Date): CircadianPhase {
  const h = time.getHours();
  if (h >= 6 && h <= 9) return "morning";
  if (h >= 10 && h <= 13) return "midday";
  if (h >= 14 && h <= 17) return "afternoon";
  if (h >= 18 && h <= 21) return "evening";
  return "night";
}

// ── Sinusoidal Helpers ───────────────────────────────────────

function fractionalHour(time: Date): number {
  return time.getHours() + time.getMinutes() / 60;
}

function sinMod(t: number, peakHour: number, amplitude: number): number {
  const phase = ((t - peakHour) / 24) * 2 * Math.PI;
  return amplitude * Math.cos(phase);
}

// ── Circadian Modulation (4D) ───────────────────────────────

/**
 * Apply circadian rhythm modulation to baseline self-state.
 *
 *   order     — peaks ~13 (midday coherence), amplitude ±5
 *   flow      — peaks ~10 (morning engagement), amplitude ±5
 *   boundary  — peaks ~8 (morning clarity), amplitude ±3
 *   resonance — peaks ~20 (evening warmth), amplitude ±3
 */
export function computeCircadianModulation(
  currentTime: Date,
  baseline: SelfState,
): SelfState {
  const t = fractionalHour(currentTime);

  const orderDelta = sinMod(t, 13, 5);
  const flowDelta = sinMod(t, 10, 5);
  const boundaryDelta = sinMod(t, 8, 3);
  const resonanceDelta = sinMod(t, 20, 3);

  return {
    order: clamp(baseline.order + orderDelta),
    flow: clamp(baseline.flow + flowDelta),
    boundary: clamp(baseline.boundary + boundaryDelta),
    resonance: clamp(baseline.resonance + resonanceDelta),
  };
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Homeostatic Pressure ─────────────────────────────────────

/**
 * Compute fatigue effects from extended session duration.
 * Now expressed as dimension effects instead of chemical deltas.
 */
export function computeHomeostaticPressure(sessionMinutes: number): {
  orderDepletion: number;
  flowDepletion: number;
  boundaryStiffening: number;
} {
  if (sessionMinutes < 30) {
    return { orderDepletion: 0, flowDepletion: 0, boundaryStiffening: 0 };
  }

  const effective = sessionMinutes - 30;
  const base = Math.log1p(effective / 30);

  return {
    orderDepletion: parseFloat((base * 3.5).toFixed(4)),
    flowDepletion: parseFloat((base * 3).toFixed(4)),
    boundaryStiffening: parseFloat((base * 2).toFixed(4)),
  };
}

// ── Energy Budgets (unchanged — substrate-independent) ──────

const ATTENTION_COSTS: Partial<Record<StimulusType, number>> = {
  intellectual: 5,
  conflict: 5,
  authority: 4,
  vulnerability: 3,
  sarcasm: 3,
  criticism: 3,
  surprise: 2,
};

const DECISION_COSTS: Partial<Record<StimulusType, number>> = {
  conflict: 4,
  authority: 4,
  vulnerability: 3,
  criticism: 2,
  sarcasm: 2,
};

export function computeEnergyDepletion(
  budgets: EnergyBudgets,
  stimulus: StimulusType | null,
  isExtravert: boolean,
): EnergyBudgets {
  const max = isExtravert ? 120 : 100;

  const attentionCost = 3 + (stimulus ? (ATTENTION_COSTS[stimulus] ?? 0) : 0);
  const attention = clamp(budgets.attention - attentionCost, 0, 100);

  const socialDelta = isExtravert ? 2 : -3;
  const socialEnergy = clamp(budgets.socialEnergy + socialDelta, 0, max);

  const decisionCost = 1 + (stimulus ? (DECISION_COSTS[stimulus] ?? 0) : 0);
  const decisionCapacity = clamp(budgets.decisionCapacity - decisionCost, 0, 100);

  return { attention, socialEnergy, decisionCapacity };
}

export function computeEnergyRecovery(
  budgets: EnergyBudgets,
  minutesElapsed: number,
  isExtravert: boolean,
): EnergyBudgets {
  if (minutesElapsed <= 0) return { ...budgets };

  const hours = minutesElapsed / 60;
  const max = isExtravert ? 120 : 100;

  const attention = clamp(budgets.attention + hours * 20, 0, 100);
  const socialDelta = isExtravert ? -3 * hours : 15 * hours;
  const socialEnergy = clamp(budgets.socialEnergy + socialDelta, 0, max);
  const decisionCapacity = clamp(budgets.decisionCapacity + hours * 25, 0, 100);

  return { attention, socialEnergy, decisionCapacity };
}
