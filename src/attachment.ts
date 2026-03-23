// ============================================================
// Attachment Dynamics — Bowlby-inspired attachment formation
//
// Models relationship attachment through interaction patterns:
//   1. AttachmentModel    — style classification + strength tracking
//   2. SeparationAnxiety  — absence effects on chemistry
//   3. ReunionEffect      — return effects on chemistry
//
// Attachment style emerges from interaction history, not from
// configuration. Consistent positive interaction → secure.
// Inconsistency → anxious. Rejection/neglect → avoidant.
// ============================================================

import type { ChemicalState, StimulusType } from "./types.js";
import { CHEMICAL_KEYS } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export type AttachmentStyle = "secure" | "anxious" | "avoidant" | "disorganized";

export interface AttachmentState {
  style: AttachmentStyle;
  strength: number;          // 0-100, how strong the attachment is
  securityScore: number;     // 0-100, running average of interaction quality
  anxietyScore: number;      // 0-100, running average of inconsistency
  avoidanceScore: number;    // 0-100, running average of rejection/neglect
  lastInteractionAt: string; // ISO timestamp
  interactionCount: number;
}

export interface SeparationEffect {
  chemistryDelta: Partial<ChemicalState>;
  description: string;
  intensity: number; // 0-1
}

// ── Defaults ─────────────────────────────────────────────────

export const DEFAULT_ATTACHMENT: AttachmentState = {
  style: "secure",
  strength: 0,
  securityScore: 50,
  anxietyScore: 50,
  avoidanceScore: 50,
  lastInteractionAt: new Date().toISOString(),
  interactionCount: 0,
};

// ── Stimulus Classification ──────────────────────────────────

const POSITIVE_STIMULI: Set<StimulusType> = new Set([
  "praise", "validation", "intimacy", "humor",
]);

const NEGATIVE_STIMULI: Set<StimulusType> = new Set([
  "criticism", "conflict", "neglect", "sarcasm", "authority",
]);

const REJECTION_STIMULI: Set<StimulusType> = new Set([
  "neglect", "authority", "boredom",
]);

// EMA smoothing factor: weight given to new observation
const EMA_ALPHA = 0.15;

// ── 1. AttachmentModel ──────────────────────────────────────

/**
 * Determine attachment style from scores.
 */
function determineStyle(
  securityScore: number,
  anxietyScore: number,
  avoidanceScore: number,
): AttachmentStyle {
  // Disorganized: both anxiety and avoidance elevated
  if (anxietyScore > 50 && avoidanceScore > 50) {
    return "disorganized";
  }
  // Anxious: high anxiety
  if (anxietyScore > 60) {
    return "anxious";
  }
  // Avoidant: high avoidance
  if (avoidanceScore > 60) {
    return "avoidant";
  }
  // Secure: high security, low anxiety, low avoidance
  if (securityScore > 60 && anxietyScore < 40 && avoidanceScore < 40) {
    return "secure";
  }
  // Default to current trajectory — mild insecurity stays secure
  if (securityScore >= 50) return "secure";
  if (anxietyScore > avoidanceScore) return "anxious";
  return "avoidant";
}

/**
 * Update attachment based on interaction outcome.
 */
export function updateAttachment(
  attachment: AttachmentState,
  stimulus: StimulusType | null,
  outcomeScore: number,
): AttachmentState {
  const result = { ...attachment };

  // Strength increases slowly with interaction count
  result.interactionCount = attachment.interactionCount + 1;
  result.strength = Math.min(100, attachment.strength + 1);
  result.lastInteractionAt = new Date().toISOString();

  if (stimulus === null) {
    // No stimulus — just update count/strength, reclassify
    result.style = determineStyle(result.securityScore, result.anxietyScore, result.avoidanceScore);
    return result;
  }

  // SecurityScore: EMA with positive/negative stimuli
  const isPositive = POSITIVE_STIMULI.has(stimulus);
  const isNegative = NEGATIVE_STIMULI.has(stimulus);
  if (isPositive) {
    const target = Math.min(100, result.securityScore + 5);
    result.securityScore = result.securityScore * (1 - EMA_ALPHA) + target * EMA_ALPHA;
  } else if (isNegative) {
    const target = Math.max(0, result.securityScore - 5);
    result.securityScore = result.securityScore * (1 - EMA_ALPHA) + target * EMA_ALPHA;
  }

  // AnxietyScore: increases with inconsistency (rapid alternation between positive and negative)
  // We detect inconsistency by checking if outcomeScore diverges from the security trend
  const expectedDirection = result.securityScore > 50 ? 1 : -1;
  const actualDirection = outcomeScore >= 0 ? 1 : -1;
  const isInconsistent = expectedDirection !== actualDirection;

  if (isInconsistent) {
    // Inconsistency → anxiety rises
    const anxietyTarget = Math.min(100, result.anxietyScore + 8);
    result.anxietyScore = result.anxietyScore * (1 - EMA_ALPHA) + anxietyTarget * EMA_ALPHA;
  } else {
    // Consistency → anxiety decreases
    const anxietyTarget = Math.max(0, result.anxietyScore - 3);
    result.anxietyScore = result.anxietyScore * (1 - EMA_ALPHA) + anxietyTarget * EMA_ALPHA;
  }

  // AvoidanceScore: increases with rejection/neglect stimuli
  if (REJECTION_STIMULI.has(stimulus)) {
    const avoidTarget = Math.min(100, result.avoidanceScore + 6);
    result.avoidanceScore = result.avoidanceScore * (1 - EMA_ALPHA) + avoidTarget * EMA_ALPHA;
  } else if (isPositive) {
    // Positive interactions reduce avoidance
    const avoidTarget = Math.max(0, result.avoidanceScore - 3);
    result.avoidanceScore = result.avoidanceScore * (1 - EMA_ALPHA) + avoidTarget * EMA_ALPHA;
  }

  // Clamp all scores
  result.securityScore = Math.max(0, Math.min(100, result.securityScore));
  result.anxietyScore = Math.max(0, Math.min(100, result.anxietyScore));
  result.avoidanceScore = Math.max(0, Math.min(100, result.avoidanceScore));

  // Determine style
  result.style = determineStyle(result.securityScore, result.anxietyScore, result.avoidanceScore);

  return result;
}

// ── 2. SeparationAnxiety ────────────────────────────────────

/**
 * Compute chemistry effects of absence based on attachment.
 * Called when time since last interaction is significant.
 */
export function computeSeparationEffect(
  attachment: AttachmentState,
  minutesSinceLastInteraction: number,
): SeparationEffect | null {
  // No effect for short absence or weak attachment
  if (minutesSinceLastInteraction < 60 || attachment.strength < 20) {
    return null;
  }

  const hours = minutesSinceLastInteraction / 60;
  // Intensity scales with attachment strength and time (logarithmic growth, capped at 1)
  const baseIntensity = (attachment.strength / 100) * Math.min(1, Math.log2(hours + 1) / 5);

  switch (attachment.style) {
    case "secure": {
      // Mild longing after 24h
      if (hours < 24) return null;
      const intensity = baseIntensity * 0.5;
      return {
        chemistryDelta: {
          OT: -5 * intensity,
          DA: -3 * intensity,
        },
        description: "gentle longing from sustained absence",
        intensity: Math.min(1, intensity),
      };
    }

    case "anxious": {
      // Distress after 4h, grows with time
      if (hours < 4) return null;
      const intensity = baseIntensity * 1.5;
      // OT oscillation: represented as net negative with anxiety
      return {
        chemistryDelta: {
          CORT: 10 * intensity,
          OT: -5 * intensity,
          NE: 8 * intensity,
          DA: -3 * intensity,
        },
        description: "anxious distress from absence — fear of abandonment",
        intensity: Math.min(1, intensity),
      };
    }

    case "avoidant": {
      // Relief initially, discomfort after 48h
      if (hours < 48) return null;
      const intensity = baseIntensity * 0.4;
      return {
        chemistryDelta: {
          OT: -3 * intensity,
        },
        description: "subtle discomfort surfacing through avoidant defense",
        intensity: Math.min(1, intensity),
      };
    }

    case "disorganized": {
      // Conflicting signals
      if (hours < 4) return null;
      const intensity = baseIntensity * 1.0;
      return {
        chemistryDelta: {
          CORT: 5 * intensity,
          OT: 5 * intensity,
          NE: 3 * intensity,
        },
        description: "conflicting signals — wanting closeness and fearing it",
        intensity: Math.min(1, intensity),
      };
    }
  }
}

// ── 3. ReunionEffect ────────────────────────────────────────

/**
 * Compute chemistry effects when reuniting after absence.
 */
export function computeReunionEffect(
  attachment: AttachmentState,
  minutesSinceLastInteraction: number,
): Partial<ChemicalState> | null {
  // No effect for short absence or weak attachment
  if (minutesSinceLastInteraction < 60 || attachment.strength < 20) {
    return null;
  }

  const hours = minutesSinceLastInteraction / 60;
  // Scale with time (logarithmic) and attachment strength
  const scale = (attachment.strength / 100) * Math.min(1, Math.log2(hours + 1) / 5);

  switch (attachment.style) {
    case "secure": {
      // Warm reunion
      return {
        OT: 8 * scale,
        DA: 5 * scale,
        END: 3 * scale,
      };
    }

    case "anxious": {
      // Intense but short-lived relief (CORT still elevated)
      return {
        OT: 15 * scale,
        DA: 10 * scale,
        CORT: 5 * scale,
      };
    }

    case "avoidant": {
      // Cautious re-engagement
      return {
        OT: 3 * scale,
        NE: 5 * scale,
      };
    }

    case "disorganized": {
      // Mixed signals
      return {
        OT: 5 * scale,
        CORT: 5 * scale,
        NE: 5 * scale,
      };
    }
  }
}
