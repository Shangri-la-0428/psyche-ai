// ============================================================
// Type Guards — runtime validation for string→type conversions
// ============================================================

import type { SelfState, MBTIType, StimulusType } from "./types.js";
import { DIMENSION_KEYS } from "./types.js";

const MBTI_TYPES = new Set<string>([
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
]);

const STIMULUS_TYPES = new Set<string>([
  "praise", "criticism", "humor", "intellectual", "intimacy",
  "conflict", "neglect", "surprise", "casual",
  "sarcasm", "authority", "validation", "boredom", "vulnerability",
]);

const DIMENSION_KEY_SET = new Set<string>(DIMENSION_KEYS);

export function isMBTIType(s: string): s is MBTIType {
  return MBTI_TYPES.has(s.toUpperCase());
}

export function isDimensionKey(s: string): s is keyof SelfState {
  return DIMENSION_KEY_SET.has(s);
}

/** @deprecated Use isDimensionKey */
export const isChemicalKey = isDimensionKey;

export function isStimulusType(s: string): s is StimulusType {
  return STIMULUS_TYPES.has(s);
}

/** Validate that a SelfState has all keys in [0, 100] */
export function isValidState(c: unknown): c is SelfState {
  if (typeof c !== "object" || c === null) return false;
  const obj = c as Record<string, unknown>;
  for (const key of DIMENSION_KEYS) {
    const v = obj[key];
    if (typeof v !== "number" || v < 0 || v > 100 || !isFinite(v)) return false;
  }
  return true;
}

/** @deprecated Use isValidState */
export const isValidChemistry = isValidState;

/** Validate locale string */
export function isLocale(s: string): s is "zh" | "en" {
  return s === "zh" || s === "en";
}
