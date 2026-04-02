// ============================================================
// Attachment Dynamics — v11: effects in 4D self-state
// ============================================================

import type { SelfState, StimulusType } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export type AttachmentStyle = "secure" | "anxious" | "avoidant" | "disorganized";

export interface AttachmentState {
  style: AttachmentStyle;
  strength: number;
  securityScore: number;
  anxietyScore: number;
  avoidanceScore: number;
  lastInteractionAt: string;
  interactionCount: number;
}

export interface SeparationEffect {
  stateDelta: Partial<SelfState>;
  description: string;
  intensity: number;
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

const EMA_ALPHA = 0.15;

// ── 1. AttachmentModel ──────────────────────────────────────

function determineStyle(
  securityScore: number,
  anxietyScore: number,
  avoidanceScore: number,
): AttachmentStyle {
  if (anxietyScore > 50 && avoidanceScore > 50) return "disorganized";
  if (anxietyScore > 60) return "anxious";
  if (avoidanceScore > 60) return "avoidant";
  if (securityScore > 60 && anxietyScore < 40 && avoidanceScore < 40) return "secure";
  if (securityScore >= 50) return "secure";
  if (anxietyScore > avoidanceScore) return "anxious";
  return "avoidant";
}

export function updateAttachment(
  attachment: AttachmentState,
  stimulus: StimulusType | null,
  outcomeScore: number,
): AttachmentState {
  const result = { ...attachment };

  result.interactionCount = attachment.interactionCount + 1;
  result.strength = Math.min(100, attachment.strength + 1);
  result.lastInteractionAt = new Date().toISOString();

  if (stimulus === null) {
    result.style = determineStyle(result.securityScore, result.anxietyScore, result.avoidanceScore);
    return result;
  }

  const isPositive = POSITIVE_STIMULI.has(stimulus);
  const isNegative = NEGATIVE_STIMULI.has(stimulus);
  if (isPositive) {
    const target = Math.min(100, result.securityScore + 5);
    result.securityScore = result.securityScore * (1 - EMA_ALPHA) + target * EMA_ALPHA;
  } else if (isNegative) {
    const target = Math.max(0, result.securityScore - 5);
    result.securityScore = result.securityScore * (1 - EMA_ALPHA) + target * EMA_ALPHA;
  }

  const expectedDirection = result.securityScore > 50 ? 1 : -1;
  const actualDirection = outcomeScore >= 0 ? 1 : -1;
  const isInconsistent = expectedDirection !== actualDirection;

  if (isInconsistent) {
    const anxietyTarget = Math.min(100, result.anxietyScore + 8);
    result.anxietyScore = result.anxietyScore * (1 - EMA_ALPHA) + anxietyTarget * EMA_ALPHA;
  } else {
    const anxietyTarget = Math.max(0, result.anxietyScore - 3);
    result.anxietyScore = result.anxietyScore * (1 - EMA_ALPHA) + anxietyTarget * EMA_ALPHA;
  }

  if (REJECTION_STIMULI.has(stimulus)) {
    const avoidTarget = Math.min(100, result.avoidanceScore + 6);
    result.avoidanceScore = result.avoidanceScore * (1 - EMA_ALPHA) + avoidTarget * EMA_ALPHA;
  } else if (isPositive) {
    const avoidTarget = Math.max(0, result.avoidanceScore - 3);
    result.avoidanceScore = result.avoidanceScore * (1 - EMA_ALPHA) + avoidTarget * EMA_ALPHA;
  }

  result.securityScore = Math.max(0, Math.min(100, result.securityScore));
  result.anxietyScore = Math.max(0, Math.min(100, result.anxietyScore));
  result.avoidanceScore = Math.max(0, Math.min(100, result.avoidanceScore));

  result.style = determineStyle(result.securityScore, result.anxietyScore, result.avoidanceScore);
  return result;
}

// ── 2. SeparationEffect (4D) ────────────────────────────────

export function computeSeparationEffect(
  attachment: AttachmentState,
  minutesSinceLastInteraction: number,
): SeparationEffect | null {
  if (minutesSinceLastInteraction < 60 || attachment.strength < 20) {
    return null;
  }

  const hours = minutesSinceLastInteraction / 60;
  const baseIntensity = (attachment.strength / 100) * Math.min(1, Math.log2(hours + 1) / 5);

  switch (attachment.style) {
    case "secure": {
      if (hours < 24) return null;
      const intensity = baseIntensity * 0.5;
      return {
        stateDelta: {
          resonance: -5 * intensity,
          order: -3 * intensity,
        },
        description: "gentle longing from sustained absence",
        intensity: Math.min(1, intensity),
      };
    }

    case "anxious": {
      if (hours < 4) return null;
      const intensity = baseIntensity * 1.5;
      return {
        stateDelta: {
          resonance: -8 * intensity,
          order: -10 * intensity,
          boundary: -5 * intensity,
          flow: +5 * intensity,
        },
        description: "anxious distress from absence — fear of abandonment",
        intensity: Math.min(1, intensity),
      };
    }

    case "avoidant": {
      if (hours < 48) return null;
      const intensity = baseIntensity * 0.4;
      return {
        stateDelta: {
          resonance: -3 * intensity,
        },
        description: "subtle discomfort surfacing through avoidant defense",
        intensity: Math.min(1, intensity),
      };
    }

    case "disorganized": {
      if (hours < 4) return null;
      const intensity = baseIntensity * 1.0;
      return {
        stateDelta: {
          resonance: +5 * intensity,
          order: -5 * intensity,
          flow: +3 * intensity,
        },
        description: "conflicting signals — wanting closeness and fearing it",
        intensity: Math.min(1, intensity),
      };
    }
  }
}

// ── 3. ReunionEffect (4D) ───────────────────────────────────

export function computeReunionEffect(
  attachment: AttachmentState,
  minutesSinceLastInteraction: number,
): Partial<SelfState> | null {
  if (minutesSinceLastInteraction < 60 || attachment.strength < 20) {
    return null;
  }

  const hours = minutesSinceLastInteraction / 60;
  const scale = (attachment.strength / 100) * Math.min(1, Math.log2(hours + 1) / 5);

  switch (attachment.style) {
    case "secure": {
      // Warm reunion: resonance↑, order↑
      return {
        resonance: 8 * scale,
        order: 5 * scale,
        flow: 3 * scale,
      };
    }

    case "anxious": {
      // Intense relief but order still shaky
      return {
        resonance: 15 * scale,
        flow: 8 * scale,
        order: -3 * scale,
      };
    }

    case "avoidant": {
      // Cautious: boundary stays high, mild flow increase
      return {
        boundary: 3 * scale,
        flow: 5 * scale,
      };
    }

    case "disorganized": {
      // Mixed
      return {
        resonance: 5 * scale,
        order: -3 * scale,
        flow: 5 * scale,
      };
    }
  }
}
