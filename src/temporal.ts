// ============================================================
// Temporal Consciousness — Anticipation, Surprise, and Regret
//
// Implements predictive emotional processing:
//   1. PredictiveModel   — Markov-based stimulus prediction
//   2. AnticipationEngine — pre-stimulus chemistry shifts
//   3. RegretComputer    — counterfactual outcome analysis
//
// These enable the agent to "look forward" and "look back",
// creating a temporal dimension to emotional experience.
// ============================================================

import type {
  ChemicalState, ChemicalSnapshot, StimulusType,
  PsycheState, RelationshipState,
} from "./types.js";
import { CHEMICAL_KEYS } from "./types.js";
import { STIMULUS_VECTORS, clamp } from "./chemistry.js";

// ── Types ────────────────────────────────────────────────────

export interface StimulusPrediction {
  stimulus: StimulusType;
  probability: number; // 0-1
}

export interface AnticipationState {
  predictions: StimulusPrediction[];
  anticipatoryChemistry: Partial<ChemicalState>; // pre-stimulus chemistry shift
  timestamp: string;
}

export interface RegretEntry {
  turnIndex: number;
  counterfactualDelta: Partial<ChemicalState>; // "what if I'd been calmer?"
  regretIntensity: number; // 0-1
  description: string;     // "too cold when CORT was high"
  timestamp: string;
}

// ── All StimulusType values ──────────────────────────────────

const ALL_STIMULI: StimulusType[] = [
  "praise", "criticism", "humor", "intellectual", "intimacy",
  "conflict", "neglect", "surprise", "casual",
  "sarcasm", "authority", "validation", "boredom", "vulnerability",
];

// ── Phase Priors ─────────────────────────────────────────────
// Default probability weights per relationship phase.

const PHASE_PRIORS: Record<RelationshipState["phase"], Partial<Record<StimulusType, number>>> = {
  stranger: {
    casual: 3, intellectual: 2, humor: 1.5, boredom: 1.5,
    criticism: 0.5, intimacy: 0.3, vulnerability: 0.3,
    praise: 1, validation: 0.8, surprise: 1, conflict: 0.5,
    neglect: 1, sarcasm: 0.8, authority: 0.8,
  },
  acquaintance: {
    casual: 2.5, intellectual: 2, humor: 2, praise: 1.5,
    validation: 1.2, surprise: 1, criticism: 0.8, conflict: 0.5,
    intimacy: 0.5, vulnerability: 0.5, neglect: 0.8,
    sarcasm: 0.8, authority: 0.8, boredom: 1,
  },
  familiar: {
    casual: 2, humor: 2.5, praise: 2, validation: 2,
    intellectual: 2, intimacy: 1.5, vulnerability: 1,
    surprise: 1.2, criticism: 1, conflict: 0.8, neglect: 0.6,
    sarcasm: 1, authority: 0.6, boredom: 0.8,
  },
  close: {
    intimacy: 3, humor: 2.5, validation: 2.5, praise: 2,
    vulnerability: 2, casual: 2, intellectual: 1.5,
    surprise: 1.5, criticism: 1, conflict: 0.8, neglect: 0.5,
    sarcasm: 0.8, authority: 0.5, boredom: 0.5,
  },
  deep: {
    intimacy: 3.5, vulnerability: 3, validation: 2.5, humor: 2.5,
    praise: 2, casual: 1.5, intellectual: 2, surprise: 1.5,
    criticism: 1, conflict: 0.8, neglect: 0.3, sarcasm: 0.5,
    authority: 0.3, boredom: 0.3,
  },
};

// ── 1. PredictiveModel ──────────────────────────────────────

/**
 * Predict likely next stimulus based on interaction history.
 * Uses simple Markov property: given recent stimulus sequence, what comes next?
 */
export function predictNextStimulus(
  emotionalHistory: ChemicalSnapshot[],
  relationshipPhase: RelationshipState["phase"],
): StimulusPrediction[] {
  const phasePrior = PHASE_PRIORS[relationshipPhase] ?? PHASE_PRIORS.acquaintance;

  // Insufficient history: return flat prior weighted by phase
  if (emotionalHistory.length < 3) {
    return buildPhasePrior(phasePrior);
  }

  // Extract the last 2 stimuli for bigram transition
  const recent = emotionalHistory.slice(-2);
  const lastTwo = recent.map((s) => s.stimulus).filter((s): s is StimulusType => s !== null);

  if (lastTwo.length < 2) {
    return buildPhasePrior(phasePrior);
  }

  // Build transition counts from history (all consecutive pairs)
  const transitionCounts: Map<string, Map<StimulusType, number>> = new Map();
  for (let i = 1; i < emotionalHistory.length; i++) {
    const prev = emotionalHistory[i - 1].stimulus;
    const cur = emotionalHistory[i].stimulus;
    if (prev === null || cur === null) continue;

    const key = prev;
    if (!transitionCounts.has(key)) {
      transitionCounts.set(key, new Map());
    }
    const counts = transitionCounts.get(key)!;
    counts.set(cur, (counts.get(cur) ?? 0) + 1);
  }

  // Get transition probabilities from the last stimulus
  const lastStimulus = lastTwo[lastTwo.length - 1];
  const transitions = transitionCounts.get(lastStimulus);

  // If no transitions observed from this stimulus, fall back to phase prior
  if (!transitions || transitions.size === 0) {
    return buildPhasePrior(phasePrior);
  }

  // Merge Markov transitions with phase prior (50/50 blend)
  let totalTransitions = 0;
  for (const count of transitions.values()) {
    totalTransitions += count;
  }

  const predictions: StimulusPrediction[] = [];
  let totalWeight = 0;

  for (const stim of ALL_STIMULI) {
    const markovProb = totalTransitions > 0
      ? (transitions.get(stim) ?? 0) / totalTransitions
      : 0;
    const priorWeight = phasePrior[stim] ?? 0.5;
    // Blend: 50% Markov, 50% phase prior (normalized)
    const combined = markovProb * 0.5 + (priorWeight / 20) * 0.5;
    totalWeight += combined;
    predictions.push({ stimulus: stim, probability: combined });
  }

  // Normalize
  if (totalWeight > 0) {
    for (const p of predictions) {
      p.probability = p.probability / totalWeight;
    }
  }

  // Sort by probability descending
  predictions.sort((a, b) => b.probability - a.probability);
  return predictions;
}

/**
 * Build a flat phase-weighted prior distribution.
 */
function buildPhasePrior(
  weights: Partial<Record<StimulusType, number>>,
): StimulusPrediction[] {
  let totalWeight = 0;
  const predictions: StimulusPrediction[] = [];

  for (const stim of ALL_STIMULI) {
    const w = weights[stim] ?? 0.5;
    totalWeight += w;
    predictions.push({ stimulus: stim, probability: w });
  }

  // Normalize
  if (totalWeight > 0) {
    for (const p of predictions) {
      p.probability = p.probability / totalWeight;
    }
  }

  predictions.sort((a, b) => b.probability - a.probability);
  return predictions;
}

// ── 2. AnticipationEngine ───────────────────────────────────

/**
 * Generate anticipatory chemistry changes based on predictions.
 * High-probability positive prediction -> DA/OT micro-rise.
 * High-probability negative prediction -> CORT micro-rise.
 */
export function generateAnticipation(
  predictions: StimulusPrediction[],
  currentChemistry: ChemicalState,
): AnticipationState {
  const anticipation: Record<string, number> = {};
  for (const key of CHEMICAL_KEYS) {
    anticipation[key] = 0;
  }

  // For each prediction with probability > 0.2, compute micro shift
  for (const pred of predictions) {
    if (pred.probability <= 0.2) continue;

    const vector = STIMULUS_VECTORS[pred.stimulus];
    if (!vector) continue;

    const scale = 0.15 * pred.probability;
    for (const key of CHEMICAL_KEYS) {
      anticipation[key] += vector[key] * scale;
    }
  }

  // Clamp total anticipation shift to +/-5 per chemical
  const clamped: Partial<ChemicalState> = {};
  for (const key of CHEMICAL_KEYS) {
    const val = Math.max(-5, Math.min(5, anticipation[key]));
    if (Math.abs(val) > 0.01) {
      clamped[key] = Math.round(val * 100) / 100;
    }
  }

  return {
    predictions,
    anticipatoryChemistry: clamped,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compute disappointment/surprise when actual stimulus differs from prediction.
 * Returns additional chemistry delta beyond the normal stimulus response.
 */
export function computeSurpriseEffect(
  anticipated: AnticipationState,
  actualStimulus: StimulusType | null,
): Partial<ChemicalState> {
  if (!actualStimulus || anticipated.predictions.length === 0) {
    return {};
  }

  const topPrediction = anticipated.predictions[0];
  const topConfidence = topPrediction.probability;

  // Find the predicted probability for the actual stimulus
  const actualPrediction = anticipated.predictions.find(
    (p) => p.stimulus === actualStimulus,
  );
  const actualProbability = actualPrediction?.probability ?? 0;

  // If actual matches top prediction, no surprise
  if (actualStimulus === topPrediction.stimulus) {
    return {};
  }

  // Determine if the actual stimulus is positive or negative
  const actualVector = STIMULUS_VECTORS[actualStimulus];
  if (!actualVector) return {};

  const actualValence = actualVector.DA + actualVector.HT + actualVector.OT - actualVector.CORT;
  const topVector = STIMULUS_VECTORS[topPrediction.stimulus];
  const topValence = topVector
    ? topVector.DA + topVector.HT + topVector.OT - topVector.CORT
    : 0;

  // Surprise magnitude scales with: (1) how confident the prediction was, (2) how unexpected the actual is
  const surpriseMagnitude = topConfidence * (1 - actualProbability);

  if (actualValence > 0 && topValence <= actualValence) {
    // Pleasant surprise: actual is more positive than expected
    return {
      DA: Math.round(5 * surpriseMagnitude * 100) / 100,
      END: Math.round(3 * surpriseMagnitude * 100) / 100,
    };
  } else if (actualValence < topValence) {
    // Disappointment: actual is worse than expected (the "crash" from anticipated warmth)
    return {
      DA: Math.round(-5 * surpriseMagnitude * 100) / 100,
      CORT: Math.round(5 * surpriseMagnitude * 100) / 100,
    };
  }

  return {};
}

// ── 3. RegretComputer ───────────────────────────────────────

/** Chemical descriptions for regret messages */
const CHEMICAL_DESCRIPTIONS: Record<keyof ChemicalState, { high: string; low: string }> = {
  DA: { high: "high dopamine made response too eager", low: "low dopamine made response flat" },
  HT: { high: "high serotonin made response complacent", low: "low serotonin made response unstable" },
  CORT: { high: "high CORT made response too defensive", low: "low CORT made response careless" },
  OT: { high: "high oxytocin made response too trusting", low: "low oxytocin made response too cold" },
  NE: { high: "high norepinephrine made response too reactive", low: "low norepinephrine made response sluggish" },
  END: { high: "high endorphins made response too flippant", low: "low endorphins made response too serious" },
};

/**
 * Evaluate if the last interaction would have gone better with different chemistry.
 * Runs a counterfactual: "what if my chemistry had been at baseline?"
 */
export function computeRegret(
  preInteractionState: PsycheState,
  postInteractionState: PsycheState,
  outcomeScore: number,
  appliedStimulus: StimulusType | null,
): RegretEntry | null {
  // Only generate regret for bad outcomes
  if (outcomeScore >= -0.2) {
    return null;
  }

  const baseline = preInteractionState.baseline;
  const preChemistry = preInteractionState.current;

  // Check if chemistry was significantly deviated from baseline
  let maxDeviation = 0;
  let mostDeviatedKey: keyof ChemicalState = "DA";

  for (const key of CHEMICAL_KEYS) {
    const deviation = Math.abs(preChemistry[key] - baseline[key]);
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
      mostDeviatedKey = key;
    }
  }

  // No regret if chemistry was near baseline (deviation < 15)
  if (maxDeviation < 15) {
    return null;
  }

  // Compute regret intensity: |outcomeScore| * (maxDeviation / 100)
  const regretIntensity = Math.min(1, Math.abs(outcomeScore) * (maxDeviation / 100));

  // Build counterfactual delta: difference between baseline and actual pre-interaction chemistry
  const counterfactualDelta: Partial<ChemicalState> = {};
  for (const key of CHEMICAL_KEYS) {
    const diff = baseline[key] - preChemistry[key];
    if (Math.abs(diff) > 5) {
      counterfactualDelta[key] = Math.round(diff * 100) / 100;
    }
  }

  // Build description identifying the most deviated chemical
  const deviationDirection = preChemistry[mostDeviatedKey] > baseline[mostDeviatedKey]
    ? "high" : "low";
  const description = CHEMICAL_DESCRIPTIONS[mostDeviatedKey][deviationDirection];

  return {
    turnIndex: postInteractionState.meta.totalInteractions,
    counterfactualDelta,
    regretIntensity,
    description,
    timestamp: new Date().toISOString(),
  };
}
