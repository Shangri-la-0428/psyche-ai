// ============================================================
// Context-Aware Stimulus Classification
//
// Wraps classify.ts with contextual signals (relationship depth,
// recent stimulus patterns, drive hunger, agreement streaks,
// time gaps) to improve classification accuracy.
// ============================================================

import type {
  StimulusType,
  DriveType,
  RelationshipState,
  PsycheState,
} from "./types.js";
import { DRIVE_KEYS } from "./types.js";
import { classifyStimulus } from "./classify.js";

// ── Context Features ─────────────────────────────────────────

export interface ContextFeatures {
  relationshipPhase: RelationshipState["phase"];
  recentStimuli: StimulusType[];          // last 3 stimuli
  driveSatisfaction: Record<DriveType, "high" | "mid" | "low">;
  timeSinceLastMessage: number;            // minutes
  totalInteractions: number;
  agreementStreak: number;
}

// ── Contextual Classification ────────────────────────────────

export interface ContextualClassification {
  type: StimulusType;
  baseConfidence: number;       // from classify.ts
  contextConfidence: number;    // adjusted confidence
  contextModifiers: string[];   // what context affected the classification
}

// ── Drive Satisfaction Thresholds ────────────────────────────

function driveSatisfactionLevel(value: number): "high" | "mid" | "low" {
  if (value >= 70) return "high";
  if (value >= 40) return "mid";
  return "low";
}

// ── Extract Context Features ─────────────────────────────────

/**
 * Extract contextual features from the current psyche state.
 * Used to feed into classifyStimulusWithContext.
 */
export function extractContextFeatures(
  state: PsycheState,
  userId?: string,
): ContextFeatures {
  // Relationship phase
  const relKey = userId ?? "_default";
  const relationship = state.relationships[relKey] ?? state.relationships["_default"];
  const relationshipPhase: RelationshipState["phase"] =
    relationship?.phase ?? "stranger";

  // Recent stimuli from state history (last 3)
  const recentStimuli: StimulusType[] = state.stateHistory
    .slice(-3)
    .map((snap) => snap.stimulus)
    .filter((s): s is StimulusType => s !== null);

  // Drive satisfaction levels
  const driveSatisfaction = {} as Record<DriveType, "high" | "mid" | "low">;
  for (const key of DRIVE_KEYS) {
    driveSatisfaction[key] = driveSatisfactionLevel(state.drives[key]);
  }

  // Time since last message (minutes)
  const now = Date.now();
  const updatedAt = new Date(state.updatedAt).getTime();
  const timeSinceLastMessage = Math.max(0, (now - updatedAt) / 60_000);

  // Total interactions
  const totalInteractions = state.meta.totalInteractions;

  // Agreement streak
  const agreementStreak = state.agreementStreak;

  return {
    relationshipPhase,
    recentStimuli,
    driveSatisfaction,
    timeSinceLastMessage,
    totalInteractions,
    agreementStreak,
  };
}

// ── Context-Adjusted Classification ──────────────────────────

/**
 * Classify a stimulus with context modifiers applied.
 *
 * Wraps classifyStimulus(text) and adjusts confidence based on:
 * - Relationship depth
 * - Recent stimulus patterns
 * - Drive hunger
 * - Agreement streak
 * - Time gap
 *
 * Returns results sorted by contextConfidence descending.
 */
export function classifyStimulusWithContext(
  text: string,
  context: ContextFeatures,
): ContextualClassification[] {
  const baseResults = classifyStimulus(text);

  const results: ContextualClassification[] = baseResults.map((r) => ({
    type: r.type,
    baseConfidence: r.confidence,
    contextConfidence: r.confidence,
    contextModifiers: [],
  }));

  // Ensure all stimulus types that need boosting have an entry
  const ensureType = (type: StimulusType): ContextualClassification => {
    let entry = results.find((r) => r.type === type);
    if (!entry) {
      entry = {
        type,
        baseConfidence: 0,
        contextConfidence: 0,
        contextModifiers: [],
      };
      results.push(entry);
    }
    return entry;
  };

  for (const r of results) {
    // ── Relationship depth modifiers ──
    if (context.relationshipPhase === "stranger" && r.type === "intimacy") {
      r.contextConfidence *= 0.7;
      r.contextModifiers.push("stranger penalty on intimacy");
    }
    if (
      (context.relationshipPhase === "close" || context.relationshipPhase === "deep") &&
      r.type === "casual"
    ) {
      r.contextConfidence += 0.1;
      r.contextModifiers.push("close relationship boost on casual");
    }
    if (context.relationshipPhase === "stranger" && r.type === "vulnerability") {
      r.contextConfidence *= 0.6;
      r.contextModifiers.push("stranger penalty on vulnerability");
    }

    // ── Recent stimulus pattern modifiers ──

    // Same stimulus 3x in a row → confidence * 0.8 (repetition fatigue)
    if (
      context.recentStimuli.length >= 3 &&
      context.recentStimuli.every((s) => s === r.type)
    ) {
      r.contextConfidence *= 0.8;
      r.contextModifiers.push("repetition fatigue penalty");
    }

    // ── Agreement streak modifiers ──
    if (context.agreementStreak >= 5 && r.type === "validation") {
      r.contextConfidence *= 0.8;
      r.contextModifiers.push("sycophantic loop dampening on validation");
    }

    // ── Time gap modifiers ──
    if (context.timeSinceLastMessage > 1440) {
      if (r.type === "casual") {
        r.contextConfidence += 0.1;
        r.contextModifiers.push("long absence boost on casual");
      }
      if (r.type === "intimacy") {
        r.contextConfidence *= 0.9;
        r.contextModifiers.push("long absence penalty on intimacy");
      }
    }
  }

  // ── De-escalation pattern (conflict → casual) ──
  if (
    context.recentStimuli.length > 0 &&
    context.recentStimuli[context.recentStimuli.length - 1] === "conflict"
  ) {
    const casual = ensureType("casual");
    casual.contextConfidence += 0.15;
    casual.contextModifiers.push("de-escalation boost after conflict");
  }

  // ── Fake praise follow-up (praise → sarcasm) ──
  if (
    context.recentStimuli.length > 0 &&
    context.recentStimuli[context.recentStimuli.length - 1] === "praise"
  ) {
    const sarcasm = results.find((r) => r.type === "sarcasm");
    if (sarcasm) {
      sarcasm.contextConfidence += 0.1;
      sarcasm.contextModifiers.push("possible fake praise follow-up boost on sarcasm");
    }
  }

  // ── Drive-hunger modifiers ──
  if (context.driveSatisfaction.connection === "low") {
    // Positive stimuli get a warmth boost
    const positiveTypes: StimulusType[] = [
      "praise", "validation", "intimacy", "humor", "casual", "vulnerability",
    ];
    for (const r of results) {
      if (positiveTypes.includes(r.type)) {
        r.contextConfidence += 0.05;
        r.contextModifiers.push("connection hunger boost");
      }
    }
  }

  if (context.driveSatisfaction.esteem === "low") {
    for (const r of results) {
      if (r.type === "validation" || r.type === "praise") {
        r.contextConfidence += 0.05;
        r.contextModifiers.push("esteem hunger boost");
      }
    }
  }

  if (context.driveSatisfaction.survival === "low") {
    for (const r of results) {
      if (r.type === "authority" || r.type === "conflict") {
        r.contextConfidence += 0.1;
        r.contextModifiers.push("survival threat sensitivity boost");
      }
    }
  }

  // ── Sort by contextConfidence descending ──
  results.sort((a, b) => b.contextConfidence - a.contextConfidence);

  return results;
}

// ── Warmth Scoring ───────────────────────────────────────────

const WARMTH_MAP: Record<StimulusType, number> = {
  praise: 0.8,
  validation: 0.7,
  intimacy: 0.9,
  humor: 0.5,
  surprise: 0.3,
  casual: 0.1,
  intellectual: 0.2,
  vulnerability: 0.3,
  sarcasm: -0.5,
  criticism: -0.7,
  conflict: -0.9,
  authority: -0.4,
  neglect: -0.8,
  boredom: -0.3,
};

/**
 * Map a stimulus type to a warmth score for outcome evaluation.
 * Positive stimuli return positive values; negative stimuli return negative.
 * null returns 0.
 */
export function stimulusWarmth(stimulus: StimulusType | null): number {
  if (stimulus === null) return 0;
  return WARMTH_MAP[stimulus] ?? 0;
}
