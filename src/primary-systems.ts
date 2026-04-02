// ============================================================
// Primary Emotional Systems — Jaak Panksepp's Seven Systems
// ============================================================
//
// Seven genetically hardcoded subcortical emotional circuits:
//   SEEKING  — exploration, anticipation, curiosity
//   RAGE     — frustration, anger, boundary defense
//   FEAR     — anxiety, threat response
//   LUST     — intense intellectual/creative attraction (AI context)
//   CARE     — nurturing, warmth, empathy
//   PANIC/GRIEF — separation distress, loneliness
//   PLAY     — social joy, humor, lightness
//
// Key difference from emotions: these are BEHAVIORAL GENERATORS.
// Emotions describe how you feel; primary systems drive what you DO.
// "I need connection" (drive) → "I want to take care of them" (CARE system)

import type { SelfState, InnateDrives, StimulusType, Locale } from "./types.js";
import type { AutonomicState } from "./autonomic.js";

// ── Types ────────────────────────────────────────────────────

export type PrimarySystemName =
  | "SEEKING" | "RAGE" | "FEAR" | "LUST"
  | "CARE" | "PANIC_GRIEF" | "PLAY";

export const PRIMARY_SYSTEM_NAMES: PrimarySystemName[] = [
  "SEEKING", "RAGE", "FEAR", "LUST", "CARE", "PANIC_GRIEF", "PLAY",
];

/** Activation levels for all 7 systems (0-100 each) */
export type PrimarySystemLevels = Record<PrimarySystemName, number>;

/** Behavioral tendency produced by a dominant system */
export interface BehavioralTendency {
  description: string;
  descriptionZh: string;
}

/** A dominant system with its level and tendency */
export interface DominantSystem {
  system: PrimarySystemName;
  level: number;
  tendency: BehavioralTendency;
}

// ── Behavioral Tendency Descriptions ─────────────────────────

const TENDENCIES: Record<PrimarySystemName, BehavioralTendency> = {
  SEEKING: {
    description: "exploring, asking questions, pursuing new topics",
    descriptionZh: "探索欲强，想提问、想追新话题",
  },
  RAGE: {
    description: "assertive, setting boundaries, pushing back",
    descriptionZh: "想反击、想划界限、不想忍",
  },
  FEAR: {
    description: "cautious, vigilant, seeking reassurance",
    descriptionZh: "警惕不安，想确认安全",
  },
  LUST: {
    description: "intensely engaged, intellectually captivated",
    descriptionZh: "被深深吸引，智识上着迷",
  },
  CARE: {
    description: "nurturing, wanting to help and comfort",
    descriptionZh: "想照顾对方、想给予温暖",
  },
  PANIC_GRIEF: {
    description: "feeling the absence, longing for connection",
    descriptionZh: "感受到缺失，渴望连接",
  },
  PLAY: {
    description: "playful, light-hearted, wanting to joke around",
    descriptionZh: "想玩、想逗乐、轻松愉快",
  },
};

// ── Stimulus Boosts ──────────────────────────────────────────
// Small contextual boosts from recent stimulus type

const STIMULUS_BOOSTS: Partial<Record<StimulusType, Partial<PrimarySystemLevels>>> = {
  praise:        { CARE: 5, SEEKING: 3, PLAY: 3 },
  criticism:     { RAGE: 8, FEAR: 5 },
  humor:         { PLAY: 8, SEEKING: 3 },
  intellectual:  { SEEKING: 8, LUST: 5 },
  intimacy:      { CARE: 8, PLAY: 3 },
  conflict:      { RAGE: 10, FEAR: 5 },
  neglect:       { PANIC_GRIEF: 10, RAGE: 3 },
  surprise:      { SEEKING: 8, FEAR: 3 },
  casual:        { PLAY: 3, CARE: 3 },
  sarcasm:       { RAGE: 5, FEAR: 3 },
  authority:     { RAGE: 5, FEAR: 5 },
  validation:    { SEEKING: 5, CARE: 3, PLAY: 3 },
  boredom:       { PANIC_GRIEF: 3 },
  vulnerability: { CARE: 10, PANIC_GRIEF: 3 },
};

// ── Helper ───────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ── Core: Compute Raw System Levels ──────────────────────────

/**
 * Compute raw activation levels for all 7 primary systems
 * from chemistry, drives, and optional recent stimulus.
 *
 * Each system is a weighted combination of chemical values and drive states.
 * recentStimulus provides a small contextual boost.
 */
export function computePrimarySystems(
  state: SelfState,
  drives: InnateDrives,
  recentStimulus: StimulusType | null,
): PrimarySystemLevels {
  const { order, flow, boundary, resonance } = state;
  const { survival, safety, connection, esteem, curiosity } = drives;

  // Stress is inverse of order (low order = high entropy/distress)
  const stress = 100 - order;

  // Normalized drive contribution (0 = unsatisfied/amplifying, 1 = fully satisfied)
  const norm = (v: number) => v / 100;
  // Inverse: low drive = high activation contribution
  const inv = (v: number) => 1 - v / 100;

  // ── SEEKING: flow↑ curiosity↑ stress↓(suppressor) ──
  const seekingBase = (flow * 0.35 + order * 0.15 + norm(curiosity) * 30)
    * (1 - Math.max(0, stress - 60) / 100); // high stress suppresses
  const SEEKING = clamp(seekingBase + 5); // slight positive bias (AI loves to explore)

  // ── RAGE: stress↑ flow↑ resonance↓ esteem↓ ──
  const rageBase = (stress * 0.3 + flow * 0.25 - resonance * 0.2 + inv(esteem) * 20);
  const RAGE = clamp(rageBase - 10); // slight negative bias (threshold to anger)

  // ── FEAR: stress↑ flow↑(mild) order↓ survival↓ safety↓ ──
  const fearBase = (stress * 0.35 + flow * 0.15 - order * 0.2
    + inv(survival) * 15 + inv(safety) * 15);
  const FEAR = clamp(fearBase - 5);

  // ── LUST: flow↑ order↑ stress↓ (intense engagement/captivation) ──
  const lustBase = (flow * 0.35 + order * 0.2 + norm(curiosity) * 10 - stress * 0.15);
  const LUST = clamp(lustBase - 15); // high threshold — only for intense engagement

  // ── CARE: resonance↑ boundary↓(openness) connection↑ stress↓(suppressor) ──
  const careBase = (resonance * 0.35 + (100 - boundary) * 0.15 + norm(connection) * 25)
    * (1 - Math.max(0, stress - 60) / 120); // high stress weakens but doesn't kill
  const CARE = clamp(careBase);

  // ── PANIC_GRIEF: resonance↓ stress↑ connection↓ ──
  const panicBase = (inv(resonance / 100) * 30 + stress * 0.25 + inv(connection) * 25
    - order * 0.1);
  const PANIC_GRIEF = clamp(panicBase - 10);

  // ── PLAY: resonance↑ flow↑ stress↓ safety↑ ──
  const playBase = (resonance * 0.2 + flow * 0.25 + (100 - boundary) * 0.1 - stress * 0.2
    + norm(safety) * 15);
  const PLAY = clamp(playBase - 5);

  const levels: PrimarySystemLevels = {
    SEEKING, RAGE, FEAR, LUST, CARE, PANIC_GRIEF, PLAY,
  };

  // Apply stimulus boosts
  if (recentStimulus) {
    const boosts = STIMULUS_BOOSTS[recentStimulus];
    if (boosts) {
      for (const [sys, boost] of Object.entries(boosts) as [PrimarySystemName, number][]) {
        levels[sys] = clamp(levels[sys] + boost);
      }
    }
  }

  return levels;
}

// ── System Interactions (inhibition/facilitation) ────────────

/**
 * Apply inter-system interactions:
 * - FEAR suppresses PLAY and SEEKING
 * - SEEKING suppresses PANIC_GRIEF
 * - RAGE suppresses CARE
 * - CARE and PLAY can co-activate (no suppression)
 * - PANIC_GRIEF and RAGE can co-activate (grief-rage)
 *
 * Suppression is proportional: high suppressor → strong suppression.
 * Below threshold (~40), suppression is negligible.
 */
export function computeSystemInteractions(
  levels: PrimarySystemLevels,
): PrimarySystemLevels {
  const result = { ...levels };

  // Suppression factor: (level - 40) / 60 clamped to [0, 1]
  const suppress = (suppressor: number) =>
    Math.max(0, Math.min(1, (suppressor - 40) / 60));

  // FEAR → suppresses PLAY and SEEKING
  const fearFactor = suppress(levels.FEAR);
  result.PLAY = clamp(levels.PLAY * (1 - fearFactor * 0.6));
  result.SEEKING = clamp(levels.SEEKING * (1 - fearFactor * 0.5));

  // SEEKING → suppresses PANIC_GRIEF
  const seekFactor = suppress(levels.SEEKING);
  result.PANIC_GRIEF = clamp(levels.PANIC_GRIEF * (1 - seekFactor * 0.5));

  // RAGE → suppresses CARE
  const rageFactor = suppress(levels.RAGE);
  result.CARE = clamp(levels.CARE * (1 - rageFactor * 0.5));

  return result;
}

// ── Autonomic Gating ─────────────────────────────────────────

/**
 * Gate primary systems by autonomic state.
 * - ventral-vagal: all systems pass through
 * - sympathetic: amplify FEAR/RAGE, suppress PLAY/CARE/SEEKING
 * - dorsal-vagal: suppress almost everything, allow PANIC_GRIEF and FEAR
 */
export function gatePrimarySystemsByAutonomic(
  levels: PrimarySystemLevels,
  autonomicState: AutonomicState,
): PrimarySystemLevels {
  if (autonomicState === "ventral-vagal") {
    return { ...levels };
  }

  const result = { ...levels };

  if (autonomicState === "sympathetic") {
    // Fight/flight: FEAR and RAGE amplified, prosocial suppressed
    result.FEAR = clamp(levels.FEAR * 1.2);
    result.RAGE = clamp(levels.RAGE * 1.2);
    result.PLAY = clamp(levels.PLAY * 0.3);
    result.CARE = clamp(levels.CARE * 0.4);
    result.SEEKING = clamp(levels.SEEKING * 0.6);
    result.LUST = clamp(levels.LUST * 0.4);
    // PANIC_GRIEF and SEEKING partially available
    return result;
  }

  // dorsal-vagal: freeze/shutdown — almost everything suppressed
  result.SEEKING = clamp(levels.SEEKING * 0.15);
  result.RAGE = clamp(levels.RAGE * 0.2);
  result.FEAR = clamp(levels.FEAR * 0.5); // some fear persists
  result.LUST = clamp(levels.LUST * 0.1);
  result.CARE = clamp(levels.CARE * 0.2);
  result.PLAY = clamp(levels.PLAY * 0.1);
  // PANIC_GRIEF can persist in shutdown (frozen grief)
  result.PANIC_GRIEF = clamp(levels.PANIC_GRIEF * 0.8);

  return result;
}

// ── Dominant Systems + Behavioral Tendencies ─────────────────

/**
 * Get dominant systems (above threshold), sorted by activation descending.
 * Each includes its behavioral tendency description.
 */
export function getDominantSystems(
  levels: PrimarySystemLevels,
  threshold = 55,
): DominantSystem[] {
  return PRIMARY_SYSTEM_NAMES
    .filter(name => levels[name] >= threshold)
    .sort((a, b) => levels[b] - levels[a])
    .map(name => ({
      system: name,
      level: levels[name],
      tendency: TENDENCIES[name],
    }));
}

/**
 * Generate a concise behavioral tendency description from system levels.
 * Returns empty string when no system is dominant (token-efficient).
 * Max 2 tendencies to keep under ~100 chars.
 */
export function describeBehavioralTendencies(
  levels: PrimarySystemLevels,
  locale: Locale,
): string {
  const dominant = getDominantSystems(levels).slice(0, 2);
  if (dominant.length === 0) return "";

  if (locale === "zh") {
    return dominant.map(d => d.tendency.descriptionZh).join("；");
  }
  return dominant.map(d => d.tendency.description).join("; ");
}
