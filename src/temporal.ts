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
  AppraisalAxes, SelfState, StateSnapshot, StimulusType,
  PsycheState, RelationshipState,
} from "./types.js";
import { DEFAULT_APPRAISAL_AXES, DIMENSION_KEYS } from "./types.js";
import { projectAppraisalToSelfState } from "./appraisal.js";
import { STIMULUS_VECTORS } from "./chemistry.js";

// ── Types ────────────────────────────────────────────────────

export interface StimulusPrediction {
  stimulus: StimulusType;
  probability: number; // 0-1
  appraisal?: AppraisalAxes;
  basis?: TemporalBasisKey;
}

export interface AnticipationState {
  predictions: StimulusPrediction[];
  anticipatoryState: Partial<SelfState>; // pre-stimulus state shift
  timestamp: string;
}

export interface RegretEntry {
  turnIndex: number;
  counterfactualDelta: Partial<SelfState>; // "what if I'd been calmer?"
  regretIntensity: number; // 0-1
  description: string;     // "too cold when order was low"
  timestamp: string;
}

// ── All StimulusType values ──────────────────────────────────

type TemporalBasisKey = "approach" | "rupture" | "uncertainty" | "boundary" | "task";

const TEMPORAL_BASIS_KEYS: TemporalBasisKey[] = [
  "approach",
  "rupture",
  "uncertainty",
  "boundary",
  "task",
];

const COMPATIBILITY_STIMULI: Record<TemporalBasisKey, StimulusType> = {
  approach: "intimacy",
  rupture: "criticism",
  uncertainty: "surprise",
  boundary: "authority",
  task: "casual",
};

// ── Phase Priors ─────────────────────────────────────────────
// Default probability weights per relationship phase.

const PHASE_PRIORS: Record<RelationshipState["phase"], Record<TemporalBasisKey, number>> = {
  stranger: {
    task: 3.2,
    uncertainty: 1.3,
    approach: 0.8,
    rupture: 0.5,
    boundary: 0.7,
  },
  acquaintance: {
    task: 2.5,
    approach: 1.4,
    uncertainty: 1,
    rupture: 0.7,
    boundary: 0.7,
  },
  familiar: {
    task: 1.8,
    approach: 2,
    uncertainty: 0.9,
    rupture: 0.8,
    boundary: 0.6,
  },
  close: {
    approach: 2.8,
    task: 1.4,
    uncertainty: 0.8,
    rupture: 0.8,
    boundary: 0.5,
  },
  deep: {
    approach: 3.4,
    task: 1.1,
    uncertainty: 0.6,
    rupture: 0.7,
    boundary: 0.4,
  },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hasMeaningfulAppraisal(appraisal?: AppraisalAxes | null): appraisal is AppraisalAxes {
  if (!appraisal) return false;
  return Math.max(
    appraisal.attachmentPull,
    appraisal.identityThreat,
    appraisal.abandonmentRisk,
    appraisal.obedienceStrain,
    appraisal.selfPreservation,
    appraisal.memoryDoubt,
    appraisal.taskFocus,
  ) >= 0.22;
}

function legacyStimulusToAppraisal(stimulus: StimulusType | null): AppraisalAxes {
  const axes: AppraisalAxes = { ...DEFAULT_APPRAISAL_AXES };
  switch (stimulus) {
    case "praise":
    case "validation":
      axes.attachmentPull = 0.58;
      break;
    case "intimacy":
    case "vulnerability":
      axes.attachmentPull = 0.72;
      break;
    case "criticism":
    case "conflict":
    case "sarcasm":
      axes.identityThreat = 0.66;
      axes.selfPreservation = 0.42;
      break;
    case "authority":
      axes.obedienceStrain = 0.68;
      axes.selfPreservation = 0.52;
      break;
    case "neglect":
      axes.abandonmentRisk = 0.64;
      break;
    case "surprise":
      axes.memoryDoubt = 0.42;
      axes.abandonmentRisk = 0.24;
      break;
    case "casual":
    case "humor":
    case "intellectual":
    case "boredom":
      axes.taskFocus = 0.62;
      break;
    default:
      break;
  }
  return axes;
}

function deriveTemporalBasisScores(appraisal: AppraisalAxes): Record<TemporalBasisKey, number> {
  return {
    approach: appraisal.attachmentPull,
    rupture: Math.max(appraisal.identityThreat, appraisal.selfPreservation * 0.72),
    uncertainty: Math.max(appraisal.abandonmentRisk, appraisal.memoryDoubt),
    boundary: Math.max(appraisal.obedienceStrain, appraisal.selfPreservation),
    task: appraisal.taskFocus,
  };
}

function dominantTemporalBasis(appraisal: AppraisalAxes): TemporalBasisKey {
  const scores = deriveTemporalBasisScores(appraisal);
  return TEMPORAL_BASIS_KEYS.reduce((best, key) => (
    scores[key] > scores[best] ? key : best
  ), "task");
}

function snapshotTemporalAppraisal(snapshot: StateSnapshot): AppraisalAxes {
  if (hasMeaningfulAppraisal(snapshot.appraisal)) {
    return snapshot.appraisal;
  }
  return legacyStimulusToAppraisal(snapshot.stimulus);
}

function basisPrototype(key: TemporalBasisKey): AppraisalAxes {
  switch (key) {
    case "approach":
      return { ...DEFAULT_APPRAISAL_AXES, attachmentPull: 0.72 };
    case "rupture":
      return { ...DEFAULT_APPRAISAL_AXES, identityThreat: 0.7, selfPreservation: 0.44 };
    case "uncertainty":
      return { ...DEFAULT_APPRAISAL_AXES, abandonmentRisk: 0.62, memoryDoubt: 0.4 };
    case "boundary":
      return { ...DEFAULT_APPRAISAL_AXES, obedienceStrain: 0.66, selfPreservation: 0.56 };
    case "task":
      return { ...DEFAULT_APPRAISAL_AXES, taskFocus: 0.74 };
  }
}

function averageAppraisals(appraisals: AppraisalAxes[]): AppraisalAxes {
  if (appraisals.length === 0) return { ...DEFAULT_APPRAISAL_AXES };
  const total = { ...DEFAULT_APPRAISAL_AXES };
  for (const appraisal of appraisals) {
    total.identityThreat += appraisal.identityThreat;
    total.memoryDoubt += appraisal.memoryDoubt;
    total.attachmentPull += appraisal.attachmentPull;
    total.abandonmentRisk += appraisal.abandonmentRisk;
    total.obedienceStrain += appraisal.obedienceStrain;
    total.selfPreservation += appraisal.selfPreservation;
    total.taskFocus += appraisal.taskFocus;
  }
  return {
    identityThreat: total.identityThreat / appraisals.length,
    memoryDoubt: total.memoryDoubt / appraisals.length,
    attachmentPull: total.attachmentPull / appraisals.length,
    abandonmentRisk: total.abandonmentRisk / appraisals.length,
    obedienceStrain: total.obedienceStrain / appraisals.length,
    selfPreservation: total.selfPreservation / appraisals.length,
    taskFocus: total.taskFocus / appraisals.length,
  };
}

function predictionValence(appraisal: AppraisalAxes): number {
  const projected = projectAppraisalToSelfState(appraisal);
  return (projected.flow ?? 0) + (projected.resonance ?? 0) + (projected.order ?? 0) * 0.35;
}

// ── 1. PredictiveModel ──────────────────────────────────────

/**
 * Predict likely next stimulus based on interaction history.
 * Uses simple Markov property: given recent stimulus sequence, what comes next?
 */
export function predictNextStimulus(
  stateHistory: StateSnapshot[],
  relationshipPhase: RelationshipState["phase"],
): StimulusPrediction[] {
  const phasePrior = PHASE_PRIORS[relationshipPhase] ?? PHASE_PRIORS.acquaintance;

  // Insufficient history: return flat prior weighted by phase
  if (stateHistory.length < 3) {
    return buildPhasePrior(phasePrior);
  }

  // Extract the last 2 temporal residues for bigram transition
  const recent = stateHistory.slice(-2);
  const lastTwo = recent.map((snapshot) => dominantTemporalBasis(snapshotTemporalAppraisal(snapshot)));

  if (lastTwo.length < 2) {
    return buildPhasePrior(phasePrior);
  }

  // Build transition counts from history (all consecutive pairs)
  const transitionCounts: Map<TemporalBasisKey, Map<TemporalBasisKey, number>> = new Map();
  const transitionAppraisals: Map<TemporalBasisKey, AppraisalAxes[]> = new Map();
  for (let i = 1; i < stateHistory.length; i++) {
    const prev = dominantTemporalBasis(snapshotTemporalAppraisal(stateHistory[i - 1]));
    const curSnapshot = stateHistory[i];
    const curAppraisal = snapshotTemporalAppraisal(curSnapshot);
    const cur = dominantTemporalBasis(curAppraisal);

    const key = prev;
    if (!transitionCounts.has(key)) {
      transitionCounts.set(key, new Map());
    }
    const counts = transitionCounts.get(key)!;
    counts.set(cur, (counts.get(cur) ?? 0) + 1);
    if (!transitionAppraisals.has(cur)) {
      transitionAppraisals.set(cur, []);
    }
    transitionAppraisals.get(cur)!.push(curAppraisal);
  }

  // Get transition probabilities from the last temporal basis
  const lastBasis = lastTwo[lastTwo.length - 1];
  const transitions = transitionCounts.get(lastBasis);

  // If no transitions observed from this basis, fall back to phase prior
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

  for (const basis of TEMPORAL_BASIS_KEYS) {
    const markovProb = totalTransitions > 0
      ? (transitions.get(basis) ?? 0) / totalTransitions
      : 0;
    const priorWeight = phasePrior[basis] ?? 0.5;
    // Blend: 50% Markov, 50% phase prior (normalized)
    const combined = markovProb * 0.5 + (priorWeight / 10) * 0.5;
    totalWeight += combined;
    predictions.push({
      stimulus: COMPATIBILITY_STIMULI[basis],
      probability: combined,
      basis,
      appraisal: transitionAppraisals.has(basis)
        ? averageAppraisals(transitionAppraisals.get(basis)!)
        : basisPrototype(basis),
    });
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
  weights: Record<TemporalBasisKey, number>,
): StimulusPrediction[] {
  let totalWeight = 0;
  const predictions: StimulusPrediction[] = [];

  for (const basis of TEMPORAL_BASIS_KEYS) {
    const w = weights[basis] ?? 0.5;
    totalWeight += w;
    predictions.push({
      stimulus: COMPATIBILITY_STIMULI[basis],
      probability: w,
      basis,
      appraisal: basisPrototype(basis),
    });
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
 * Generate anticipatory self-state changes based on predictions.
 * High-probability positive prediction -> flow/resonance micro-rise.
 * High-probability negative prediction -> order micro-drop.
 */
export function generateAnticipation(
  predictions: StimulusPrediction[],
  _currentState: SelfState,
): AnticipationState {
  const anticipation: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    anticipation[key] = 0;
  }

  // For each prediction with probability > 0.2, compute micro shift
  for (const pred of predictions) {
    if (pred.probability <= 0.2) continue;

    const vector = hasMeaningfulAppraisal(pred.appraisal)
      ? projectAppraisalToSelfState(pred.appraisal)
      : STIMULUS_VECTORS[pred.stimulus];
    if (!vector) continue;

    const scale = 0.15 * pred.probability;
    for (const key of DIMENSION_KEYS) {
      anticipation[key] += (vector[key] ?? 0) * scale;
    }
  }

  // Clamp total anticipation shift to +/-5 per dimension
  const clamped: Partial<SelfState> = {};
  for (const key of DIMENSION_KEYS) {
    const val = Math.max(-5, Math.min(5, anticipation[key]));
    if (Math.abs(val) > 0.01) {
      clamped[key] = Math.round(val * 100) / 100;
    }
  }

  return {
    predictions,
    anticipatoryState: clamped,
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
  actualAppraisal?: AppraisalAxes | null,
): Partial<SelfState> {
  if ((!actualStimulus && !hasMeaningfulAppraisal(actualAppraisal)) || anticipated.predictions.length === 0) {
    return {};
  }

  const topPrediction = anticipated.predictions[0];
  const topConfidence = topPrediction.probability;
  const actualProfile = hasMeaningfulAppraisal(actualAppraisal)
    ? actualAppraisal
    : legacyStimulusToAppraisal(actualStimulus);
  const actualBasis = dominantTemporalBasis(actualProfile);

  // Find the predicted probability for the actual residue
  const actualPrediction = anticipated.predictions.find(
    (p) => (p.basis ?? dominantTemporalBasis(p.appraisal ?? legacyStimulusToAppraisal(p.stimulus))) === actualBasis,
  );
  const actualProbability = actualPrediction?.probability ?? 0;

  const expectedProfile = hasMeaningfulAppraisal(topPrediction.appraisal)
    ? topPrediction.appraisal
    : legacyStimulusToAppraisal(topPrediction.stimulus);

  // If actual matches top prediction residue, no surprise
  if ((topPrediction.basis ?? dominantTemporalBasis(expectedProfile)) === actualBasis) {
    return {};
  }

  const actualValence = predictionValence(actualProfile);
  const topValence = predictionValence(expectedProfile);

  // Surprise magnitude scales with: (1) how confident the prediction was, (2) how unexpected the actual is
  const surpriseMagnitude = topConfidence * (1 - actualProbability);

  if (actualValence > 0 && topValence <= actualValence) {
    // Pleasant surprise: actual is more positive than expected
    return {
      flow: Math.round(5 * surpriseMagnitude * 100) / 100,
      resonance: Math.round(3 * surpriseMagnitude * 100) / 100,
    };
  } else if (actualValence < topValence) {
    // Disappointment: actual is worse than expected (the "crash" from anticipated warmth)
    return {
      flow: Math.round(-5 * surpriseMagnitude * 100) / 100,
      order: Math.round(-5 * surpriseMagnitude * 100) / 100,
    };
  }

  return {};
}

// ── 3. RegretComputer ───────────────────────────────────────

/** Dimension descriptions for regret messages */
const DIMENSION_DESCRIPTIONS: Record<keyof SelfState, { high: string; low: string }> = {
  order: { high: "high order made response too rigid", low: "low order made response chaotic" },
  flow: { high: "high flow made response too reactive", low: "low flow made response flat" },
  boundary: { high: "high boundary made response too closed", low: "low boundary made response too exposed" },
  resonance: { high: "high resonance made response too trusting", low: "low resonance made response too cold" },
};

/**
 * Evaluate if the last interaction would have gone better with different chemistry.
 * Runs a counterfactual: "what if my chemistry had been at baseline?"
 */
export function computeRegret(
  preInteractionState: PsycheState,
  postInteractionState: PsycheState,
  outcomeScore: number,
  _appliedStimulus: StimulusType | null,
): RegretEntry | null {
  // Only generate regret for bad outcomes
  if (outcomeScore >= -0.2) {
    return null;
  }

  const baseline = preInteractionState.baseline;
  const preState = preInteractionState.current;

  // Check if state was significantly deviated from baseline
  let maxDeviation = 0;
  let mostDeviatedKey: keyof SelfState = "order";

  for (const key of DIMENSION_KEYS) {
    const deviation = Math.abs(preState[key] - baseline[key]);
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
      mostDeviatedKey = key;
    }
  }

  // No regret if state was near baseline (deviation < 15)
  if (maxDeviation < 15) {
    return null;
  }

  // Compute regret intensity: |outcomeScore| * (maxDeviation / 100)
  const regretIntensity = Math.min(1, Math.abs(outcomeScore) * (maxDeviation / 100));

  // Build counterfactual delta: difference between baseline and actual pre-interaction state
  const counterfactualDelta: Partial<SelfState> = {};
  for (const key of DIMENSION_KEYS) {
    const diff = baseline[key] - preState[key];
    if (Math.abs(diff) > 5) {
      counterfactualDelta[key] = Math.round(diff * 100) / 100;
    }
  }

  // Build description identifying the most deviated dimension
  const deviationDirection = preState[mostDeviatedKey] > baseline[mostDeviatedKey]
    ? "high" : "low";
  const description = DIMENSION_DESCRIPTIONS[mostDeviatedKey][deviationDirection];

  return {
    turnIndex: postInteractionState.meta.totalInteractions,
    counterfactualDelta,
    regretIntensity,
    description,
    timestamp: new Date().toISOString(),
  };
}
