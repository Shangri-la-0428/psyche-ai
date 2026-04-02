// ============================================================
// Autonomic Nervous System — Polyvagal Theory Implementation
// ============================================================
//
// Maps chemical state + innate drives to autonomic nervous system
// states based on Stephen Porges' Polyvagal Theory:
//
// - Ventral vagal: social engagement, safety (default)
// - Sympathetic: fight/flight mobilization
// - Dorsal vagal: freeze/shutdown/collapse

import type { SelfState, InnateDrives, Locale, EnergyBudgets } from "./types.js";
import { DIMENSION_KEYS } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export type AutonomicState = "ventral-vagal" | "sympathetic" | "dorsal-vagal";

export interface AutonomicResult {
  state: AutonomicState;
  transitionProgress: number; // 0-1
  gatedEmotionCategories: string[];
  description: string;
  // P10: Dual Process — processing depth derived from autonomic state
  processingDepth: number;    // 0-1, 0=pure intuition (System 1), 1=full reflection (System 2)
  skippedStages: string[];    // pipeline stages to skip based on processingDepth
}

export interface AutonomicTransition {
  from: AutonomicState;
  to: AutonomicState;
  transitionMinutes: number;
}

// ── i18n Strings ─────────────────────────────────────────────

const AUTONOMIC_STRINGS: Record<Locale, Record<AutonomicState, string>> = {
  zh: {
    "ventral-vagal": "腹侧迷走神经激活——安全与社交参与状态，情绪开放，表达自然",
    "sympathetic": "交感神经激活——警觉动员状态，战斗或逃跑准备中",
    "dorsal-vagal": "背侧迷走神经激活——冻结与保护性关闭状态，能量极低",
  },
  en: {
    "ventral-vagal": "Ventral vagal activation — safe and socially engaged, emotionally open",
    "sympathetic": "Sympathetic activation — alert and mobilized, fight-or-flight readiness",
    "dorsal-vagal": "Dorsal vagal activation — freeze and protective shutdown, minimal energy",
  },
};

// ── Transition Time Matrix (minutes) ─────────────────────────

const TRANSITION_TIMES: Record<AutonomicState, Record<AutonomicState, number>> = {
  "ventral-vagal": {
    "ventral-vagal": 0,
    "sympathetic": 2,      // fast activation
    "dorsal-vagal": 7,     // not a shortcut: >= ventral→sympathetic + sympathetic→dorsal (2+5=7)
  },
  "sympathetic": {
    "ventral-vagal": 8,    // calming down
    "sympathetic": 0,
    "dorsal-vagal": 5,     // collapse
  },
  "dorsal-vagal": {
    "ventral-vagal": 25,   // full recovery is slow
    "sympathetic": 12,     // re-mobilization from freeze
    "dorsal-vagal": 0,
  },
};

// ── Emotion Gating ───────────────────────────────────────────

/** Positive social emotions blocked during sympathetic activation */
const SYMPATHETIC_BLOCKED = new Set([
  "deep contentment",
  "warm intimacy",
  "playful mischief",
  "excited joy",
  "tender affection",
  "serene peace",
  "grateful warmth",
  "compassionate care",
]);

/** Emotions allowed during dorsal-vagal (whitelist) */
const DORSAL_ALLOWED = new Set([
  "emotional numbness",
  "melancholic introspection",
  "burnout",
  "resignation",
  "dissociation",
  "exhaustion",
]);

// ── Core Functions ───────────────────────────────────────────

/**
 * Compute the raw autonomic state from chemistry and drives.
 * No transition inertia — returns the "target" state.
 */
export function computeAutonomicState(
  state: SelfState,
  drives: InnateDrives,
): AutonomicState {
  const { order, flow, boundary } = state;
  const { survival, safety, connection } = drives;

  // Inverse order = stress (low order = high entropy/distress)
  const stress = 100 - order;
  // Flow maps to arousal/activation
  const arousal = flow;

  // Count drives that are critically low (< 20)
  const lowDriveCount = [survival, safety, connection, drives.esteem, drives.curiosity]
    .filter((d) => d < 20).length;

  // ── Dorsal vagal check (freeze/shutdown) ──
  // Very high stress + low arousal + low motivation = collapse
  if (stress >= 80 && arousal <= 25 && flow <= 20) {
    return "dorsal-vagal";
  }
  // Multiple critically low drives with depleted state
  if (lowDriveCount >= 3 && stress >= 70 && (arousal <= 30 || flow <= 20)) {
    return "dorsal-vagal";
  }

  // ── Sympathetic check (fight/flight) ──
  // High stress + high arousal
  if (stress >= 65 && arousal >= 65) {
    return "sympathetic";
  }
  // Either axis extreme: one dimension dominating can still trigger mobilization
  if (stress + arousal >= 140 && stress >= 50 && arousal >= 50) {
    return "sympathetic";
  }
  // Very low survival or safety drive with elevated stress
  if ((survival < 20 || safety < 20) && stress >= 55 && arousal >= 55) {
    return "sympathetic";
  }

  // ── Default: Ventral vagal (social engagement/safety) ──
  return "ventral-vagal";
}

/**
 * Gate emotions based on autonomic state.
 * - Ventral vagal: all emotions pass through
 * - Sympathetic: blocks positive social emotions
 * - Dorsal vagal: only allows numbness/introspection/burnout (whitelist)
 */
export function gateEmotions(
  autonomicState: AutonomicState,
  emotions: string[],
): string[] {
  if (autonomicState === "ventral-vagal") {
    return emotions;
  }
  if (autonomicState === "sympathetic") {
    return emotions.filter((e) => !SYMPATHETIC_BLOCKED.has(e));
  }
  // dorsal-vagal: whitelist only
  return emotions.filter((e) => DORSAL_ALLOWED.has(e));
}

/**
 * Get the transition time in minutes between two autonomic states.
 * Asymmetric: activation is faster than recovery.
 */
export function getTransitionTime(
  from: AutonomicState,
  to: AutonomicState,
): number {
  return TRANSITION_TIMES[from][to];
}

/**
 * Describe an autonomic state in the given locale.
 */
export function describeAutonomicState(
  state: AutonomicState,
  locale: Locale,
): string {
  return AUTONOMIC_STRINGS[locale]?.[state] ?? AUTONOMIC_STRINGS.zh[state];
}

/**
 * P10: Compute processing depth from autonomic state and chemistry.
 *
 * Processing depth represents the cognitive resource available for reflection:
 * - 0 = pure System 1 (intuition only, no metacognition)
 * - 1 = full System 2 (complete reflective capacity)
 *
 * This is a natural extension of autonomic state: you can't deeply reflect
 * when your nervous system is in fight/flight/freeze mode.
 */
export function computeProcessingDepth(
  autonomicState: AutonomicState,
  current: SelfState,
  baseline: SelfState,
  energyBudgets?: EnergyBudgets,
): { depth: number; skippedStages: string[] } {
  const stress = 100 - current.order;

  // State deviation from baseline (0-1)
  let totalDeviation = 0;
  for (const k of DIMENSION_KEYS) {
    totalDeviation += Math.abs(current[k] - baseline[k]);
  }
  const stateDeviation = Math.min(1, totalDeviation / 400);

  // Base depth from autonomic state
  let baseDepth: number;
  if (autonomicState === "dorsal-vagal") {
    baseDepth = 0;
  } else if (autonomicState === "sympathetic") {
    // Higher stress in sympathetic = less cognitive resource
    baseDepth = stress >= 60 ? 0.15 : 0.35;
  } else {
    // ventral-vagal: safe, most cognitive resource available
    baseDepth = 0.85;
  }

  // State deviation reduces depth (strong shifts = less reflection)
  let depth = Math.max(0, Math.min(1, baseDepth * (1 - stateDeviation * 0.5)));

  // v9: Low attention energy further reduces processing depth
  if (energyBudgets && energyBudgets.attention < 30) {
    const attentionPenalty = (30 - energyBudgets.attention) / 30 * 0.3;
    depth = Math.max(0, depth - attentionPenalty);
  }

  // Map depth to skipped pipeline stages
  const skippedStages: string[] = [];
  if (depth < 0.8) skippedStages.push("generative-self");
  if (depth < 0.5) {
    skippedStages.push("ethics");
    skippedStages.push("shared-intentionality");
  }
  if (depth < 0.2) {
    skippedStages.push("metacognition");
    skippedStages.push("experiential-field");
  }

  return { depth, skippedStages };
}

/**
 * Compute the full autonomic result with transition inertia.
 *
 * If previousState differs from the target state, transition progress
 * is based on elapsed time vs required transition time.
 *
 * Includes P10 processing depth (dual-process cognitive gating).
 */
export function computeAutonomicResult(
  current: SelfState,
  drives: InnateDrives,
  previousState: AutonomicState | null,
  minutesSinceLastUpdate: number,
  locale: Locale = "zh",
  baseline?: SelfState,
  energyBudgets?: EnergyBudgets,
): AutonomicResult {
  const targetState = computeAutonomicState(current, drives);
  const effectiveBaseline = baseline ?? { order: 50, flow: 50, boundary: 50, resonance: 50 };

  // Helper to build full result with processing depth
  const buildResult = (
    state: AutonomicState,
    transitionProgress: number,
  ): AutonomicResult => {
    const { depth, skippedStages } = computeProcessingDepth(state, current, effectiveBaseline, energyBudgets);
    return {
      state,
      transitionProgress,
      gatedEmotionCategories: getGatedCategories(state),
      description: describeAutonomicState(state, locale),
      processingDepth: depth,
      skippedStages,
    };
  };

  // First call or same state — immediate
  if (previousState === null || previousState === targetState) {
    return buildResult(targetState, 1);
  }

  // Transitioning between states
  const transitionTime = getTransitionTime(previousState, targetState);
  const progress = transitionTime === 0
    ? 1
    : Math.min(1, minutesSinceLastUpdate / transitionTime);

  // If transition is complete, use the new state
  if (progress >= 1) {
    return buildResult(targetState, 1);
  }

  // Transition in progress
  return buildResult(targetState, progress);
}

// ── Internal Helpers ─────────────────────────────────────────

/** Get the list of emotion categories that are blocked/gated for a state */
function getGatedCategories(state: AutonomicState): string[] {
  if (state === "ventral-vagal") {
    return [];
  }
  if (state === "sympathetic") {
    return [...SYMPATHETIC_BLOCKED];
  }
  // dorsal-vagal gates everything except the whitelist
  return [
    "excited joy",
    "warm intimacy",
    "playful mischief",
    "deep contentment",
    "focused alertness",
    "righteous anger",
    "anxious tension",
    "tender affection",
    "serene peace",
    "grateful warmth",
    "compassionate care",
  ];
}
