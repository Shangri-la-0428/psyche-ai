// ============================================================
// Emotional Learning Engine — Damasio's Somatic Marker Hypothesis
//
// The system learns from interaction outcomes which emotional
// reactions are adaptive. Over time, stimulus→chemistry mappings
// shift based on what actually worked in context.
//
// Components:
//   1. OutcomeEvaluator  — scores interaction outcomes
//   2. StimulusVectorStore — learned vector adjustments
//   3. PredictionEngine  — predict & track prediction error
// ============================================================

import type {
  PsycheState, StimulusType, SelfState, ImpactVector,
  LearningState, OutcomeScore, OutcomeSignals, PredictionRecord,
  LearnedVectorAdjustment,
} from "./types.js";
import {
  DIMENSION_KEYS, DRIVE_KEYS,
  MAX_LEARNED_VECTORS, MAX_PREDICTION_HISTORY,
} from "./types.js";
import { STIMULUS_VECTORS, clamp } from "./chemistry.js";

// ── 1. OutcomeEvaluator ─────────────────────────────────────

/** Warmth mapping for nextUserStimulus */
const WARMTH_MAP: Record<StimulusType, number> = {
  praise: 0.8,
  validation: 0.7,
  intimacy: 0.9,
  humor: 0.5,
  casual: 0,
  intellectual: 0.2,
  surprise: 0.3,
  vulnerability: 0.4,
  criticism: -0.6,
  conflict: -0.8,
  neglect: -0.9,
  sarcasm: -0.5,
  authority: -0.4,
  boredom: -0.3,
};

/**
 * Evaluate the adaptive outcome of an interaction turn.
 *
 * Computes a score from -1 to 1 using multiple signals:
 * drive changes, relationship changes, user warmth, conversation continuation.
 */
export function evaluateOutcome(
  prevState: PsycheState,
  currentState: PsycheState,
  nextUserStimulus: StimulusType | null,
  appliedStimulus: StimulusType | null,
): OutcomeScore {
  // Drive delta: sum of all drive changes, normalized
  let driveSum = 0;
  for (const key of DRIVE_KEYS) {
    driveSum += currentState.drives[key] - prevState.drives[key];
  }
  const driveDelta = Math.max(-1, Math.min(1, driveSum / 50));

  // Relationship delta: change in trust + intimacy of _default relationship
  const prevRel = prevState.relationships._default ?? { trust: 50, intimacy: 30 };
  const curRel = currentState.relationships._default ?? { trust: 50, intimacy: 30 };
  const relChange = (curRel.trust - prevRel.trust) + (curRel.intimacy - prevRel.intimacy);
  const relationshipDelta = Math.max(-1, Math.min(1, relChange / 20));

  // User warmth: what the user said next
  const userWarmthDelta = nextUserStimulus !== null ? (WARMTH_MAP[nextUserStimulus] ?? 0) : 0;

  // Conversation continued
  const conversationContinued = nextUserStimulus !== null;

  // Weighted average
  const continuedBonus = conversationContinued ? 0.15 : -0.15;
  const raw = driveDelta * 0.25
    + relationshipDelta * 0.25
    + userWarmthDelta * 0.35
    + continuedBonus;
  const adaptiveScore = Math.max(-1, Math.min(1, raw));

  const signals: OutcomeSignals = {
    driveDelta,
    relationshipDelta,
    userWarmthDelta,
    conversationContinued,
  };

  return {
    turnIndex: currentState.meta.totalInteractions,
    stimulus: appliedStimulus,
    adaptiveScore,
    signals,
    timestamp: new Date().toISOString(),
  };
}

// ── 2. StimulusVectorStore ──────────────────────────────────

/**
 * Get the effective stimulus vector for a given stimulus + context,
 * combining the base vector with any learned adjustment.
 */
export function getLearnedVector(
  learning: LearningState,
  stimulus: StimulusType,
  contextHash: string,
): ImpactVector {
  const base = STIMULUS_VECTORS[stimulus];
  if (!base) {
    // Unknown stimulus — return zeros
    return { order: 0, flow: 0, boundary: 0, resonance: 0 };
  }

  // Look for a learned adjustment matching this stimulus + context
  const entry = learning.learnedVectors.find(
    (v) => v.stimulus === stimulus && v.contextHash === contextHash,
  );

  if (!entry) return { ...base };

  // Apply adjustment
  const result = { ...base };
  for (const key of DIMENSION_KEYS) {
    const adj = entry.adjustment[key] ?? 0;
    result[key] = base[key] + adj;
  }
  return result;
}

/**
 * Update a learned vector adjustment based on an outcome.
 *
 * Learning rule:
 * - Positive outcome → reinforce (adjust toward actual delta)
 * - Negative outcome → suppress (adjust away from actual delta)
 * - Learning rate: 0.05 * |outcomeScore|
 * - Each adjustment clamped to +/- 50% of base vector value
 */
export function updateLearnedVector(
  learning: LearningState,
  stimulus: StimulusType,
  contextHash: string,
  outcomeScore: number,
  actualState: SelfState,
  baselineState: SelfState,
): LearningState {
  const base = STIMULUS_VECTORS[stimulus];
  if (!base) return learning;

  // State delta: what actually happened
  const stateDelta: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    stateDelta[key] = actualState[key] - baselineState[key];
  }

  // Learning rate: conservative, proportional to outcome strength
  const learningRate = 0.05 * Math.abs(outcomeScore);
  const direction = outcomeScore >= 0 ? 1 : -1;

  // Find or create entry
  const existingIdx = learning.learnedVectors.findIndex(
    (v) => v.stimulus === stimulus && v.contextHash === contextHash,
  );

  let entry: LearnedVectorAdjustment;
  if (existingIdx >= 0) {
    entry = { ...learning.learnedVectors[existingIdx] };
    entry.adjustment = { ...entry.adjustment };
  } else {
    entry = {
      stimulus,
      contextHash,
      adjustment: {},
      confidence: 0,
      sampleCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Update adjustment for each dimension
  for (const key of DIMENSION_KEYS) {
    const currentAdj = entry.adjustment[key] ?? 0;
    const delta = stateDelta[key] * direction * learningRate;
    let newAdj = currentAdj + delta;

    // Clamp to +/- 50% of base vector absolute value
    const baseAbs = Math.abs(base[key]);
    const maxAdj = Math.max(baseAbs * 0.5, 1); // at least 1 to allow learning on zero-base values
    newAdj = Math.max(-maxAdj, Math.min(maxAdj, newAdj));

    entry.adjustment[key] = newAdj;
  }

  // Update metadata
  entry.sampleCount += 1;
  entry.confidence = 0.9 * entry.confidence + 0.1 * Math.abs(outcomeScore);
  entry.lastUpdated = new Date().toISOString();

  // Build new vectors array
  let newVectors: LearnedVectorAdjustment[];
  if (existingIdx >= 0) {
    newVectors = [...learning.learnedVectors];
    newVectors[existingIdx] = entry;
  } else {
    newVectors = [...learning.learnedVectors, entry];
  }

  // Trim to MAX_LEARNED_VECTORS: keep highest sampleCount entries
  if (newVectors.length > MAX_LEARNED_VECTORS) {
    newVectors.sort((a, b) => b.sampleCount - a.sampleCount);
    newVectors = newVectors.slice(0, MAX_LEARNED_VECTORS);
  }

  return {
    ...learning,
    learnedVectors: newVectors,
  };
}

/**
 * Compute a context hash from the current psyche state.
 *
 * Format: "{phase}:{last3stimuli}:{driveLevels}"
 * Drive levels are encoded as h(igh)/m(id)/l(ow) for each of the 5 drives.
 *
 * Example: "familiar:praise,casual,intellectual:hml_hh"
 */
export function computeContextHash(
  state: PsycheState,
  _userId?: string,
): string {
  // Relationship phase
  const rel = state.relationships._default ?? { phase: "stranger" as const };
  const phase = rel.phase;

  // Last 3 stimuli from emotional history
  const history = state.stateHistory ?? [];
  const recentStimuli = history
    .slice(-3)
    .map((s) => s.stimulus ?? "none")
    .join(",");

  // Drive satisfaction levels: h(igh >=67), m(id 34-66), l(ow <34)
  const driveLevels: string[] = [];
  for (const key of DRIVE_KEYS) {
    const val = state.drives[key];
    if (val >= 67) driveLevels.push("h");
    else if (val >= 34) driveLevels.push("m");
    else driveLevels.push("l");
  }

  // Format: separate safety from the rest for readability
  // survival_safety_connection_esteem_curiosity
  const driveStr = driveLevels.join("");

  return `${phase}:${recentStimuli || "none"}:${driveStr}`;
}

// ── 3. PredictionEngine ─────────────────────────────────────

/**
 * Predict the resulting chemistry after applying a stimulus,
 * using learned vectors instead of raw base vectors.
 *
 * Same math as applyStimulus in chemistry.ts but with learned adjustments.
 */
export function predictState(
  current: SelfState,
  stimulus: StimulusType,
  learning: LearningState,
  contextHash: string,
  sensitivity: number,
  maxDelta: number,
): SelfState {
  const vector = getLearnedVector(learning, stimulus, contextHash);

  const result = { ...current };
  for (const key of DIMENSION_KEYS) {
    const raw = vector[key] * sensitivity;
    const clamped = Math.max(-maxDelta, Math.min(maxDelta, raw));
    result[key] = clamp(current[key] + clamped);
  }
  return result;
}

/**
 * Compute the prediction error between predicted and actual chemistry.
 *
 * Euclidean distance across all 6 chemicals, normalized to 0-1 range.
 * Normalization factor: sqrt(6 * 100^2) = sqrt(60000) ~= 244.95
 */
export function computePredictionError(
  predicted: SelfState,
  actual: SelfState,
): number {
  let sumSq = 0;
  for (const key of DIMENSION_KEYS) {
    const diff = predicted[key] - actual[key];
    sumSq += diff * diff;
  }
  const maxDistance = Math.sqrt(4 * 100 * 100); // ~200
  return Math.sqrt(sumSq) / maxDistance;
}

/**
 * Record a prediction and its actual outcome.
 * Pushes to predictionHistory and trims to MAX_PREDICTION_HISTORY.
 */
export function recordPrediction(
  learning: LearningState,
  predicted: SelfState,
  actual: SelfState,
  stimulus: StimulusType | null,
): LearningState {
  const error = computePredictionError(predicted, actual);

  const record: PredictionRecord = {
    predictedState: { ...predicted },
    actualState: { ...actual },
    stimulus,
    predictionError: error,
    timestamp: new Date().toISOString(),
  };

  let newHistory = [...learning.predictionHistory, record];
  if (newHistory.length > MAX_PREDICTION_HISTORY) {
    newHistory = newHistory.slice(newHistory.length - MAX_PREDICTION_HISTORY);
  }

  return {
    ...learning,
    predictionHistory: newHistory,
  };
}

// ── 4. Utility ──────────────────────────────────────────────

/**
 * Get the average prediction error over recent history.
 * Returns 1.0 if no history exists (maximum uncertainty).
 */
export function getAveragePredictionError(learning: LearningState): number {
  if (learning.predictionHistory.length === 0) return 1.0;

  let sum = 0;
  for (const record of learning.predictionHistory) {
    sum += record.predictionError;
  }
  return sum / learning.predictionHistory.length;
}
