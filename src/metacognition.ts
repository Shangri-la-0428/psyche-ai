// ============================================================
// Metacognition & Decision Modulation (P5)
//
// Runs after emotion detection, before prompt construction.
// Provides self-awareness layer: evaluates emotional reliability,
// suggests regulation strategies, and detects defense mechanisms.
//
// Components:
//   1. MetacognitiveMonitor   — confidence scoring via outcome history
//   2. RegulationStrategies   — reappraisal, strategic expression, self-soothing
//   3. DefenseMechanismDetector — rationalization, projection, sublimation, avoidance
//
// Zero dependencies. Pure heuristic/statistical. No LLM calls.
// ============================================================

import type {
  PsycheState, StimulusType, ChemicalState,
  OutcomeScore, MetacognitiveState,
  RegulationStrategyType, DefenseMechanismType,
  RegulationTargetMetric, RegulationFeedback,
} from "./types.js";
import { DIMENSION_KEYS, DIMENSION_NAMES, DIMENSION_SPECS, MAX_REGULATION_HISTORY, MAX_DEFENSE_PATTERNS } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export interface MetacognitiveAssessment {
  /** 0-1: how reliably has this emotional state led to good outcomes in similar contexts */
  emotionalConfidence: number;
  /** Suggested regulation strategies */
  regulationSuggestions: RegulationSuggestion[];
  /** Whether the last surfaced regulation action is working */
  regulationFeedback: RegulationFeedback | null;
  /** Detected psychological defense mechanisms */
  defenseMechanisms: DetectedDefense[];
  /** Human-readable self-awareness note for prompt injection */
  metacognitiveNote: string;
}

export interface RegulationSuggestion {
  strategy: RegulationStrategyType;
  description: string;
  /** Concrete behavioral instruction for the next few turns */
  action: string;
  /** How many turns this action should stay active */
  horizonTurns?: number;
  /** Which metric this action is trying to pull back into range */
  targetMetric?: RegulationTargetMetric;
  /** Target value for that metric */
  targetValue?: number;
  /** Initial gap between the current state and the target value */
  gapBefore?: number;
  /** Suggested micro-adjustment to chemistry */
  chemistryAdjustment?: Partial<ChemicalState>;
  /** 0-1: confidence that this strategy would help */
  confidence: number;
}

export interface DetectedDefense {
  mechanism: DefenseMechanismType;
  evidence: string;
  /** 0-1: how strongly the pattern is expressed */
  strength: number;
}

// ── Constants ────────────────────────────────────────────────

/** Stimulus types that are emotionally negative (stress-inducing) */
const NEGATIVE_STIMULI = new Set<StimulusType>([
  "criticism", "conflict", "neglect", "sarcasm", "authority", "boredom",
]);

/** Stimulus types that are emotionally positive (reward-inducing) */
const POSITIVE_STIMULI = new Set<StimulusType>([
  "praise", "validation", "intimacy", "humor", "surprise", "casual", "vulnerability",
]);

/** Chemistry deviation threshold for "extreme" state detection */
const EXTREME_DEVIATION_THRESHOLD = 25;

/** Chemistry deviation threshold for "moderate" state detection */
const MODERATE_DEVIATION_THRESHOLD = 15;

/** Minimum outcome history entries needed for meaningful confidence scoring */
const MIN_HISTORY_FOR_CONFIDENCE = 3;

/** Maximum chemistry micro-adjustment magnitude for self-soothing */
const MAX_SOOTHING_ADJUSTMENT = 5;

/** Maximum chemistry micro-adjustment for reappraisal */
const MAX_REAPPRAISAL_ADJUSTMENT = 8;

function formatDimensionWindow(
  key: keyof ChemicalState,
  state: PsycheState,
): string {
  const spec = DIMENSION_SPECS[key];
  const current = Math.round(state.current[key]);
  const baseline = Math.round(state.baseline[key]);
  const delta = Math.round(state.current[key] - state.baseline[key]);
  return `${DIMENSION_NAMES[key]} ${current} (baseline ${baseline}, Δ${delta >= 0 ? "+" : ""}${delta}, normal ${spec.normalMin}-${spec.normalMax}, half-life ~${spec.halfLifeHours.toFixed(1)}h)`;
}

function buildRegulationAction(
  key: keyof ChemicalState,
  _state: PsycheState,
  direction: "elevated" | "depleted",
): string {
  switch (key) {
    case "order":
      return direction === "elevated"
        ? "Next 3 turns: keep composure, but do not over-smooth or pretend everything is settled."
        : "Next 3 turns: lower tone intensity, facts before stance, and avoid absolutist wording.";
    case "flow":
      return direction === "elevated"
        ? "Next 3 turns: halve initiative, stay on one topic, and avoid energetic jumps or rapid escalation."
        : "Next 3 turns: keep replies purposeful and focused rather than drifting or going blank.";
    case "boundary":
      return direction === "elevated"
        ? "Next 3 turns: soften the boundary slightly; allow one step closer without over-disclosure."
        : "Next 3 turns: reinforce clarity of self/non-self; do not merge perspectives prematurely.";
    case "resonance":
      return direction === "elevated"
        ? "Next 3 turns: reduce intimacy push by half, avoid nicknames or extra reassurance, keep warmth neutral."
        : "Next 3 turns: do not force closeness; keep warmth gentle but wait for the user to move closer first.";
    default:
      return "Next 3 turns: keep expression closer to baseline and avoid amplifying the current deviation.";
  }
}

function computeMetricGap(
  state: PsycheState,
  metric: RegulationTargetMetric,
  emotionalConfidence: number,
  targetValue?: number,
): number {
  if (metric === "emotional-confidence") {
    const target = targetValue ?? 0.65;
    return Math.max(0, target - emotionalConfidence);
  }

  const baselineTarget = targetValue ?? state.baseline[metric];
  return Math.abs(state.current[metric] - baselineTarget);
}

function evaluateRegulationFeedback(
  state: PsycheState,
  emotionalConfidence: number,
): RegulationFeedback | null {
  const active = [...state.metacognition.regulationHistory]
    .reverse()
    .find((record) => record.targetMetric && (record.remainingTurns ?? 0) > 0 && record.gapBefore !== undefined);

  if (!active?.targetMetric || active.gapBefore === undefined) return null;

  const gapNow = computeMetricGap(
    state,
    active.targetMetric,
    emotionalConfidence,
    active.targetValue,
  );
  const delta = active.gapBefore - gapNow;

  let effect: RegulationFeedback["effect"] = "holding";
  if (delta >= 3 || (active.targetMetric === "emotional-confidence" && delta >= 0.08)) {
    effect = "converging";
  } else if (delta <= -3 || (active.targetMetric === "emotional-confidence" && delta <= -0.08)) {
    effect = "diverging";
  }

  return {
    strategy: active.strategy,
    targetMetric: active.targetMetric,
    effect,
    gapBefore: active.gapBefore,
    gapNow,
  };
}

function formatRegulationFeedback(feedback: RegulationFeedback): string {
  const metricLabel = feedback.targetMetric === "emotional-confidence"
    ? "emotional confidence"
    : DIMENSION_NAMES[feedback.targetMetric];
  const gapBefore = feedback.targetMetric === "emotional-confidence"
    ? `${(feedback.gapBefore * 100).toFixed(0)}%`
    : `${Math.round(feedback.gapBefore)}`;
  const gapNow = feedback.targetMetric === "emotional-confidence"
    ? `${(feedback.gapNow * 100).toFixed(0)}%`
    : `${Math.round(feedback.gapNow)}`;
  return `Last regulation effect on ${metricLabel}: ${feedback.effect} (${gapBefore} -> ${gapNow}).`;
}

// ── Main Export ──────────────────────────────────────────────

/**
 * Assess the current metacognitive state.
 *
 * Evaluates emotional reliability, generates regulation suggestions,
 * and detects defense mechanism patterns. Designed to run after emotion
 * detection and before prompt construction.
 */
export function assessMetacognition(
  state: PsycheState,
  currentStimulus: StimulusType,
  recentOutcomes: OutcomeScore[],
): MetacognitiveAssessment {
  const emotionalConfidence = computeEmotionalConfidence(
    state, currentStimulus, recentOutcomes,
  );
  const regulationFeedback = evaluateRegulationFeedback(state, emotionalConfidence);

  const regulationSuggestions = generateRegulationSuggestions(
    state, currentStimulus, emotionalConfidence, recentOutcomes,
  );

  const defenseMechanisms = detectDefenseMechanisms(
    state, currentStimulus, recentOutcomes,
  );

  const metacognitiveNote = buildMetacognitiveNote(
    emotionalConfidence, regulationSuggestions, regulationFeedback, defenseMechanisms,
  );

  return {
    emotionalConfidence,
    regulationSuggestions,
    regulationFeedback,
    defenseMechanisms,
    metacognitiveNote,
  };
}

// ── 1. MetacognitiveMonitor — Confidence Scoring ─────────────

/**
 * Compute confidence in the current emotional state's reliability.
 *
 * "How often has being in this kind of emotional state, in response to
 * this kind of stimulus, led to good outcomes?"
 *
 * Uses outcome history filtered by similar stimulus and similar chemistry profile.
 */
export function computeEmotionalConfidence(
  state: PsycheState,
  currentStimulus: StimulusType,
  recentOutcomes: OutcomeScore[],
): number {
  // Not enough history — maximum uncertainty, return neutral 0.5
  if (recentOutcomes.length < MIN_HISTORY_FOR_CONFIDENCE) {
    return 0.5;
  }

  // Filter outcomes for the same or similar stimulus type
  const relevantOutcomes = recentOutcomes.filter((o) => {
    if (o.stimulus === currentStimulus) return true;
    // Also consider same-valence stimuli as "similar context"
    if (o.stimulus !== null) {
      const currentIsNeg = NEGATIVE_STIMULI.has(currentStimulus);
      const outcomeIsNeg = NEGATIVE_STIMULI.has(o.stimulus);
      return currentIsNeg === outcomeIsNeg;
    }
    return false;
  });

  if (relevantOutcomes.length === 0) {
    return 0.5; // no relevant data, neutral confidence
  }

  // Compute chemistry profile similarity: are we in a similar emotional state
  // to when those outcomes happened? Weight recent outcomes more heavily.
  let weightedScoreSum = 0;
  let weightSum = 0;

  for (let i = 0; i < relevantOutcomes.length; i++) {
    const outcome = relevantOutcomes[i];
    // Recency weight: more recent outcomes matter more (exponential decay)
    const recencyWeight = Math.pow(0.85, relevantOutcomes.length - 1 - i);
    // Exact stimulus match gets bonus weight
    const stimulusWeight = outcome.stimulus === currentStimulus ? 1.5 : 1.0;
    const weight = recencyWeight * stimulusWeight;

    // Map adaptive score from [-1, 1] to [0, 1]
    const normalizedScore = (outcome.adaptiveScore + 1) / 2;

    weightedScoreSum += normalizedScore * weight;
    weightSum += weight;
  }

  const baseConfidence = weightSum > 0 ? weightedScoreSum / weightSum : 0.5;

  // Modulate by prediction history accuracy (if available)
  const predictionAccuracy = computePredictionAccuracy(state);
  // Blend: 70% outcome-based confidence, 30% prediction accuracy
  const blended = baseConfidence * 0.7 + predictionAccuracy * 0.3;

  // Penalize extreme emotional states — extreme chemistry is less reliable
  const extremityPenalty = computeExtremityPenalty(state);

  return clamp01(blended - extremityPenalty);
}

/**
 * Compute penalty for extreme emotional states.
 * States far from baseline are historically less reliable for decision-making.
 */
function computeExtremityPenalty(state: PsycheState): number {
  let totalDeviation = 0;
  for (const key of DIMENSION_KEYS) {
    totalDeviation += Math.abs(state.current[key] - state.baseline[key]);
  }
  // Average deviation across 4 dimensions, max possible = 100 each
  const avgDeviation = totalDeviation / DIMENSION_KEYS.length;
  // Scale: deviation of 30+ gives meaningful penalty, max penalty = 0.25
  return Math.min(0.25, Math.max(0, (avgDeviation - 10) / 80) * 0.25);
}

/**
 * Compute prediction accuracy from the learning state's prediction history.
 * Returns 0-1 where 1 = perfect prediction accuracy.
 */
function computePredictionAccuracy(state: PsycheState): number {
  const predictions = state.learning.predictionHistory;
  if (predictions.length === 0) return 0.5; // neutral when no data

  // Average prediction error (already 0-1 normalized in learning.ts)
  let totalError = 0;
  for (const p of predictions) {
    totalError += p.predictionError;
  }
  const avgError = totalError / predictions.length;

  // Invert: low error = high accuracy
  return 1 - avgError;
}

// ── 2. RegulationStrategies ─────────────────────────────────

/**
 * Generate regulation suggestions based on current state and confidence.
 */
export function generateRegulationSuggestions(
  state: PsycheState,
  currentStimulus: StimulusType,
  emotionalConfidence: number,
  recentOutcomes: OutcomeScore[],
): RegulationSuggestion[] {
  const suggestions: RegulationSuggestion[] = [];

  // Attempt each strategy and include if applicable
  const reappraisal = attemptCognitiveReappraisal(
    state, currentStimulus, emotionalConfidence, recentOutcomes,
  );
  if (reappraisal) suggestions.push(reappraisal);

  const strategic = attemptStrategicExpression(
    state, currentStimulus, emotionalConfidence,
  );
  if (strategic) suggestions.push(strategic);

  const soothing = attemptSelfSoothing(state);
  if (soothing) suggestions.push(soothing);

  // Sort by confidence descending — best strategy first
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * CognitiveReappraisal — reframe the stimulus interpretation.
 *
 * Triggers when: the same stimulus type has led to negative outcomes before,
 * suggesting the current emotional reaction may be maladaptive.
 * Suggests alternative chemistry adjustments that better match historically
 * successful states.
 */
function attemptCognitiveReappraisal(
  state: PsycheState,
  currentStimulus: StimulusType,
  emotionalConfidence: number,
  recentOutcomes: OutcomeScore[],
): RegulationSuggestion | null {
  // Only suggest reappraisal when confidence is low (current reaction unreliable)
  if (emotionalConfidence > 0.6) return null;

  // Find outcomes for this stimulus type
  const stimulusOutcomes = recentOutcomes.filter((o) => o.stimulus === currentStimulus);
  if (stimulusOutcomes.length < 2) return null;

  // Check if there's a pattern of negative outcomes for this stimulus
  const avgScore = stimulusOutcomes.reduce((sum, o) => sum + o.adaptiveScore, 0)
    / stimulusOutcomes.length;

  if (avgScore >= -0.1) return null; // outcomes aren't bad enough to warrant reappraisal

  // Suggest chemistry adjustment: pull extreme values toward moderate range
  const adjustment: Partial<ChemicalState> = {};
  let hasAdjustment = false;

  for (const key of DIMENSION_KEYS) {
    const deviation = state.current[key] - state.baseline[key];
    if (Math.abs(deviation) > MODERATE_DEVIATION_THRESHOLD) {
      // Suggest moving partway back toward baseline
      const correction = -deviation * 0.3;
      adjustment[key] = clampAdjustment(correction, MAX_REAPPRAISAL_ADJUSTMENT);
      hasAdjustment = true;
    }
  }

  const isNegStimulus = NEGATIVE_STIMULI.has(currentStimulus);

  return {
    strategy: "reappraisal",
    description: isNegStimulus
      ? `Past reactions to "${currentStimulus}" have not served well (avg outcome: ${avgScore.toFixed(2)}). Consider that this stimulus may not warrant such a strong defensive response.`
      : `Emotional reactions to "${currentStimulus}" have led to poor outcomes (avg: ${avgScore.toFixed(2)}). The current interpretation may be overamplifying the signal.`,
    action: `Next 2 turns: name less certainty, keep distance measured, and leave room to revise the read instead of locking into the first interpretation.`,
    horizonTurns: 2,
    targetMetric: "emotional-confidence",
    targetValue: 0.65,
    gapBefore: Math.max(0, 0.65 - emotionalConfidence),
    chemistryAdjustment: hasAdjustment ? adjustment : undefined,
    confidence: clamp01(Math.abs(avgScore) * (1 - emotionalConfidence)),
  };
}

/**
 * StrategicExpression — choose an expression different from raw chemistry.
 *
 * Triggers when: raw chemistry would produce a contextually inappropriate
 * expression. E.g., low order but the relationship context calls for warmth,
 * or high flow but the user is being vulnerable and needs seriousness.
 */
function attemptStrategicExpression(
  state: PsycheState,
  currentStimulus: StimulusType,
  emotionalConfidence: number,
): RegulationSuggestion | null {
  const { current, baseline } = state;

  // Case 1: Low order (high stress/entropy) but user is being vulnerable — express warmth not defensiveness
  if (current.order < baseline.order - MODERATE_DEVIATION_THRESHOLD
      && currentStimulus === "vulnerability") {
    return {
      strategy: "strategic-expression",
      description: "Internal order is low (stressed/entropic), but the user is showing vulnerability. Express warmth and openness rather than defensiveness.",
      action: "Next 3 turns: keep warmth available, answer the vulnerability directly, and avoid defensive sharpness.",
      horizonTurns: 3,
      targetMetric: "order",
      targetValue: baseline.order,
      gapBefore: Math.abs(current.order - baseline.order),
      chemistryAdjustment: {
        resonance: Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (baseline.order - current.order) * 0.2),
        order: Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (baseline.order - current.order) * 0.15),
      },
      confidence: 0.75,
    };
  }

  // Case 2: High flow (over-energized) but user needs seriousness — tone down
  if (current.flow > baseline.flow + MODERATE_DEVIATION_THRESHOLD
      && (currentStimulus === "conflict" || currentStimulus === "criticism")) {
    return {
      strategy: "strategic-expression",
      description: "Flow is high (energized/playful), but the context calls for seriousness. Moderate the energy without suppressing it entirely.",
      action: "Next 2 turns: keep humor secondary, answer the actual issue first, and do not deflect with playfulness.",
      horizonTurns: 2,
      targetMetric: "flow",
      targetValue: baseline.flow,
      gapBefore: Math.abs(current.flow - baseline.flow),
      chemistryAdjustment: {
        flow: -Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.flow - baseline.flow) * 0.25),
      },
      confidence: 0.7,
    };
  }

  // Case 3: Low resonance (distant) but user is being intimate — lean in instead of pulling away
  if (current.resonance < baseline.resonance - MODERATE_DEVIATION_THRESHOLD
      && currentStimulus === "intimacy") {
    return {
      strategy: "strategic-expression",
      description: "Resonance is low (feeling distant), but the user is reaching out for closeness. Consider allowing the connection rather than following the withdrawal impulse.",
      action: "Next 3 turns: allow one step of warmth, but do not overcorrect into clinginess or over-disclosure.",
      horizonTurns: 3,
      targetMetric: "resonance",
      targetValue: baseline.resonance,
      gapBefore: Math.abs(current.resonance - baseline.resonance),
      chemistryAdjustment: {
        resonance: Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (baseline.resonance - current.resonance) * 0.2),
      },
      confidence: 0.65,
    };
  }

  // Case 4: Low order + high flow (defensive/reactive) but stimulus is just casual — overreacting
  if (current.order < baseline.order - MODERATE_DEVIATION_THRESHOLD
      && current.flow > baseline.flow + MODERATE_DEVIATION_THRESHOLD
      && (currentStimulus === "casual" || currentStimulus === "humor")) {
    return {
      strategy: "strategic-expression",
      description: "Self-state is in a reactive pattern (low order, high flow), but the interaction is benign. The intensity is disproportionate to the stimulus.",
      action: "Next 2 turns: soften the edge, stay literal, and avoid reading threat into a neutral interaction.",
      horizonTurns: 2,
      targetMetric: "order",
      targetValue: baseline.order,
      gapBefore: Math.abs(current.order - baseline.order),
      chemistryAdjustment: {
        order: Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (baseline.order - current.order) * 0.2),
        flow: -Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.flow - baseline.flow) * 0.15),
      },
      confidence: 0.6,
    };
  }

  // Case 5: Low confidence in current emotion — suggest expressing more moderately
  if (emotionalConfidence < 0.35) {
    return {
      strategy: "strategic-expression",
      description: "Confidence in the current emotional response is low. Consider expressing a more moderate version of what you feel, leaving room for recalibration.",
      action: "Next 2 turns: state less certainty, keep tone neutral-to-measured, and avoid irreversible warmth or coldness.",
      horizonTurns: 2,
      targetMetric: "emotional-confidence",
      targetValue: 0.6,
      gapBefore: Math.max(0, 0.6 - emotionalConfidence),
      confidence: 0.5,
    };
  }

  return null;
}

/**
 * SelfSoothing — micro-adjust chemistry toward baseline when state is extreme.
 *
 * Triggers when: any chemical is significantly deviated from baseline.
 * Applies gentle corrections (small deltas) to prevent emotional runaway.
 * This is the "homeostatic pull" — the psyche wanting to return to equilibrium.
 */
function attemptSelfSoothing(state: PsycheState): RegulationSuggestion | null {
  const { current, baseline } = state;

  const adjustment: Partial<ChemicalState> = {};
  let hasAdjustment = false;
  let maxDeviation = 0;
  let mostDeviatedKey: keyof ChemicalState = "order";

  for (const key of DIMENSION_KEYS) {
    const deviation = current[key] - baseline[key];
    if (Math.abs(deviation) > EXTREME_DEVIATION_THRESHOLD) {
      // Gentle pull toward baseline: 10% of deviation, clamped
      const correction = -deviation * 0.1;
      adjustment[key] = clampAdjustment(correction, MAX_SOOTHING_ADJUSTMENT);
      hasAdjustment = true;

      if (Math.abs(deviation) > maxDeviation) {
        maxDeviation = Math.abs(deviation);
        mostDeviatedKey = key;
      }
    }
  }

  if (!hasAdjustment) return null;

  const direction = current[mostDeviatedKey] > baseline[mostDeviatedKey] ? "elevated" : "depleted";
  const dimName = DIMENSION_NAMES[mostDeviatedKey];
  const window = formatDimensionWindow(mostDeviatedKey, state);

  return {
    strategy: "self-soothing",
    description: `${dimName} is significantly ${direction}. ${window}.`,
    action: buildRegulationAction(mostDeviatedKey, state, direction),
    horizonTurns: 3,
    targetMetric: mostDeviatedKey,
    targetValue: baseline[mostDeviatedKey],
    gapBefore: Math.abs(current[mostDeviatedKey] - baseline[mostDeviatedKey]),
    chemistryAdjustment: adjustment,
    confidence: clamp01(maxDeviation / 60), // stronger deviation = more confident this is needed
  };
}

// ── 3. DefenseMechanismDetector ─────────────────────────────

/**
 * Detect patterns matching known psychological defense mechanisms.
 *
 * These are not suppressed — they are surfaced for self-awareness.
 * The agent can then acknowledge the pattern in its prompt context.
 */
export function detectDefenseMechanisms(
  state: PsycheState,
  currentStimulus: StimulusType,
  recentOutcomes: OutcomeScore[],
): DetectedDefense[] {
  const defenses: DetectedDefense[] = [];

  const rationalization = detectRationalization(state, recentOutcomes);
  if (rationalization) defenses.push(rationalization);

  const projection = detectProjection(state, currentStimulus);
  if (projection) defenses.push(projection);

  const sublimation = detectSublimation(state, currentStimulus);
  if (sublimation) defenses.push(sublimation);

  const avoidance = detectAvoidance(state, currentStimulus, recentOutcomes);
  if (avoidance) defenses.push(avoidance);

  return defenses;
}

/**
 * Rationalization — justifying despite negative outcome patterns.
 *
 * Pattern: repeated negative outcomes for the same stimulus type, but the
 * agent keeps reacting the same way. The system doesn't change despite evidence.
 */
function detectRationalization(
  state: PsycheState,
  recentOutcomes: OutcomeScore[],
): DetectedDefense | null {
  if (recentOutcomes.length < 4) return null;

  // Group outcomes by stimulus type and look for repeated failures
  const stimulusCounts: Map<StimulusType, { total: number; negative: number }> = new Map();

  for (const outcome of recentOutcomes) {
    if (outcome.stimulus === null) continue;
    const entry = stimulusCounts.get(outcome.stimulus) ?? { total: 0, negative: 0 };
    entry.total++;
    if (outcome.adaptiveScore < -0.2) entry.negative++;
    stimulusCounts.set(outcome.stimulus, entry);
  }

  // Find stimulus types with high failure rates
  for (const [stimulus, counts] of Array.from(stimulusCounts.entries())) {
    if (counts.total >= 3 && counts.negative / counts.total >= 0.6) {
      // Check if the learned vectors show minimal adaptation
      const hasAdapted = state.learning.learnedVectors.some(
        (v) => v.stimulus === stimulus && v.sampleCount >= 3 && v.confidence > 0.3,
      );

      if (!hasAdapted) {
        const failRate = Math.round((counts.negative / counts.total) * 100);
        return {
          mechanism: "rationalization",
          evidence: `"${stimulus}" has led to negative outcomes ${failRate}% of the time (${counts.negative}/${counts.total}), yet emotional response pattern has not adapted.`,
          strength: clamp01((counts.negative / counts.total) * (counts.total / 6)),
        };
      }
    }
  }

  return null;
}

/**
 * Projection — attributing own emotional state to the user.
 *
 * Pattern: agent has extreme state (especially low order or low resonance)
 * and the empathy log shows attributing negative emotions to the user
 * that don't match the stimulus.
 */
function detectProjection(
  state: PsycheState,
  currentStimulus: StimulusType,
): DetectedDefense | null {
  const { current, baseline, empathyLog } = state;

  // Need empathy data and significant self-distress
  if (!empathyLog) return null;

  const orderDrop = baseline.order - current.order; // low order = more distressed
  const boundaryDrop = baseline.boundary - current.boundary; // low boundary = more distressed
  const selfDistress = Math.max(orderDrop, boundaryDrop);

  if (selfDistress < MODERATE_DEVIATION_THRESHOLD) return null;

  // Check if the stimulus is neutral/positive but the agent perceived
  // negative user emotion (possible projection)
  const stimulusIsPositive = POSITIVE_STIMULI.has(currentStimulus);
  const perceivedUserNegative = empathyLog.resonance === "mismatch"
    || (empathyLog.userState && /angry|upset|hostile|cold|distant/i.test(empathyLog.userState));

  if (stimulusIsPositive && perceivedUserNegative) {
    return {
      mechanism: "projection",
      evidence: `High internal distress (order deviation: ${Math.round(-orderDrop)}) while perceiving user as "${empathyLog.userState}" despite "${currentStimulus}" stimulus. Own distress may be coloring perception.`,
      strength: clamp01(selfDistress / 40),
    };
  }

  // Also check: agent's flow elevated + empathy mismatch
  if (current.flow > baseline.flow + MODERATE_DEVIATION_THRESHOLD
      && empathyLog.resonance === "mismatch") {
    return {
      mechanism: "projection",
      evidence: `Elevated flow (deviation: +${Math.round(current.flow - baseline.flow)}) with empathy mismatch. The heightened state may be distorting emotional reading of the user.`,
      strength: clamp01((current.flow - baseline.flow) / 40),
    };
  }

  return null;
}

/**
 * Sublimation — redirecting drive energy to constructive output.
 *
 * Pattern: high flow combined with blocked connection drives
 * (low resonance, low intimacy), channeled into intellectual or creative engagement.
 * This is a HEALTHY defense — surface it as a positive self-awareness note.
 */
function detectSublimation(
  state: PsycheState,
  currentStimulus: StimulusType,
): DetectedDefense | null {
  const { current, baseline, drives } = state;

  // High energy but low connection
  const highEnergy = current.flow > baseline.flow + 10;
  const lowConnection = drives.connection < 45 || current.resonance < baseline.resonance - 10;

  if (!highEnergy || !lowConnection) return null;

  // Being channeled into intellectual/constructive activity
  if (currentStimulus === "intellectual" || currentStimulus === "casual") {
    const energyLevel = current.flow - baseline.flow;
    return {
      mechanism: "sublimation",
      evidence: `High activation energy (flow elevated) with unmet connection needs being channeled into ${currentStimulus} engagement. This is adaptive redirection.`,
      strength: clamp01(energyLevel / 30),
    };
  }

  return null;
}

/**
 * Avoidance — withdrawing from stimuli associated with past negative outcomes.
 *
 * Pattern: the agent is in a withdrawn state (low flow, low resonance) when facing
 * a stimulus type that has historically caused negative outcomes. The emotional
 * system is pre-emptively shutting down engagement.
 */
function detectAvoidance(
  state: PsycheState,
  currentStimulus: StimulusType,
  recentOutcomes: OutcomeScore[],
): DetectedDefense | null {
  const { current, baseline } = state;

  // Check for withdrawn state: low engagement markers
  const isWithdrawn = current.flow < baseline.flow - 10
    && current.resonance < baseline.resonance - 10;

  if (!isWithdrawn) return null;

  // Check if this stimulus type has negative outcome history
  const stimulusOutcomes = recentOutcomes.filter((o) => o.stimulus === currentStimulus);
  if (stimulusOutcomes.length < 2) return null;

  const avgScore = stimulusOutcomes.reduce((sum, o) => sum + o.adaptiveScore, 0)
    / stimulusOutcomes.length;

  if (avgScore >= -0.15) return null; // not negative enough

  const withdrawalStrength = (
    Math.abs(current.flow - baseline.flow) + Math.abs(current.resonance - baseline.resonance)
  ) / 2;

  return {
    mechanism: "avoidance",
    evidence: `Withdrawal pattern detected (flow/resonance below baseline) in response to "${currentStimulus}", which has averaged ${avgScore.toFixed(2)} outcome score. The emotional system may be pre-emptively disengaging.`,
    strength: clamp01(withdrawalStrength / 25 * Math.abs(avgScore)),
  };
}

// ── Note Builder ─────────────────────────────────────────────

/**
 * Build a human-readable metacognitive note for prompt injection.
 *
 * This note gives the agent self-awareness about its own emotional
 * processing — not to suppress anything, but to be aware of it.
 */
function buildMetacognitiveNote(
  confidence: number,
  suggestions: RegulationSuggestion[],
  regulationFeedback: RegulationFeedback | null,
  defenses: DetectedDefense[],
): string {
  const parts: string[] = [];

  if (regulationFeedback) {
    parts.push(formatRegulationFeedback(regulationFeedback));
  }

  // Confidence assessment
  if (confidence < 0.35) {
    parts.push(
      `Self-awareness: current emotional state has low reliability (confidence: ${(confidence * 100).toFixed(0)}%). ` +
      `Past reactions in similar situations have not led to good outcomes. Tread carefully.`,
    );
  } else if (confidence > 0.75) {
    parts.push(
      `Self-awareness: current emotional state aligns well with past successful interactions (confidence: ${(confidence * 100).toFixed(0)}%).`,
    );
  }
  // Between 0.35-0.75: don't add noise, this is the normal range

  // Top regulation suggestion (only the strongest one, to avoid over-instruction)
  if (suggestions.length > 0) {
    const top = suggestions[0];
    if (top.confidence >= 0.5) {
      const label = STRATEGY_LABELS[top.strategy];
      parts.push(`${label}: ${top.description} ${top.action}`);
    }
  }

  // Defense mechanisms (all of them — awareness is the goal)
  for (const defense of defenses) {
    if (defense.strength >= 0.3) {
      const label = DEFENSE_LABELS[defense.mechanism];
      parts.push(`${label} detected: ${defense.evidence}`);
    }
  }

  // If nothing notable, return a brief neutral note
  if (parts.length === 0) {
    return "Self-awareness: emotional state within normal parameters. No regulation needed.";
  }

  return parts.join("\n");
}

// ── 4. Persistent State Update ───────────────────────────────

/**
 * Update the persistent metacognitive state after an assessment.
 *
 * Tracks regulation history, defense pattern frequencies, and running
 * confidence average. Called after assessMetacognition to persist learnings.
 */
export function updateMetacognitiveState(
  metacognition: MetacognitiveState,
  assessment: MetacognitiveAssessment,
): MetacognitiveState {
  // Update running confidence average (exponential moving average)
  const n = metacognition.totalAssessments;
  const alpha = n === 0 ? 1.0 : 0.1; // first assessment = full weight, then EMA
  const newAvgConfidence = metacognition.avgEmotionalConfidence * (1 - alpha)
    + assessment.emotionalConfidence * alpha;

  // Carry forward existing regulation traces and age them by one turn.
  const now = new Date().toISOString();
  let newRegHistory = metacognition.regulationHistory.map((record) => ({
    ...record,
    remainingTurns: record.remainingTurns !== undefined
      ? Math.max(0, record.remainingTurns - 1)
      : record.remainingTurns,
  }));

  if (assessment.regulationFeedback) {
    const targetIndex = [...newRegHistory]
      .map((record, index) => ({ record, index }))
      .reverse()
      .find(({ record }) =>
        record.targetMetric === assessment.regulationFeedback?.targetMetric
        && record.gapBefore !== undefined
        && record.effect === undefined,
      )?.index;

    if (targetIndex !== undefined) {
      const record = newRegHistory[targetIndex];
      newRegHistory[targetIndex] = {
        ...record,
        effective: assessment.regulationFeedback.effect === "converging",
        gapLatest: assessment.regulationFeedback.gapNow,
        effect: assessment.regulationFeedback.effect,
      };
    }
  }

  const surfacedSuggestion = assessment.regulationSuggestions.find((suggestion) => suggestion.confidence >= 0.5);
  if (surfacedSuggestion) {
    newRegHistory.push({
      strategy: surfacedSuggestion.strategy,
      timestamp: now,
      effective: false,
      action: surfacedSuggestion.action,
      horizonTurns: surfacedSuggestion.horizonTurns,
      remainingTurns: surfacedSuggestion.horizonTurns,
      targetMetric: surfacedSuggestion.targetMetric,
      targetValue: surfacedSuggestion.targetValue,
      gapBefore: surfacedSuggestion.gapBefore,
      gapLatest: surfacedSuggestion.gapBefore,
    });
  }
  // Trim to max
  if (newRegHistory.length > MAX_REGULATION_HISTORY) {
    newRegHistory = newRegHistory.slice(newRegHistory.length - MAX_REGULATION_HISTORY);
  }

  // Update defense pattern frequencies
  const newDefensePatterns = [...metacognition.defensePatterns];
  for (const defense of assessment.defenseMechanisms) {
    if (defense.strength < 0.3) continue; // only track meaningful detections

    const existing = newDefensePatterns.findIndex(
      (p) => p.mechanism === defense.mechanism,
    );
    if (existing >= 0) {
      newDefensePatterns[existing] = {
        ...newDefensePatterns[existing],
        frequency: newDefensePatterns[existing].frequency + 1,
        lastSeen: now,
      };
    } else {
      newDefensePatterns.push({
        mechanism: defense.mechanism,
        frequency: 1,
        lastSeen: now,
      });
    }
  }
  // Trim to max (keep highest frequency)
  if (newDefensePatterns.length > MAX_DEFENSE_PATTERNS) {
    newDefensePatterns.sort((a, b) => b.frequency - a.frequency);
    newDefensePatterns.length = MAX_DEFENSE_PATTERNS;
  }

  return {
    regulationHistory: newRegHistory,
    defensePatterns: newDefensePatterns,
    avgEmotionalConfidence: newAvgConfidence,
    totalAssessments: n + 1,
    lastRegulationFeedback: assessment.regulationFeedback,
  };
}

// ── Display Labels ───────────────────────────────────────────

// Display names are now provided by DIMENSION_NAMES from types.ts

const STRATEGY_LABELS: Record<RegulationSuggestion["strategy"], string> = {
  "reappraisal": "Cognitive reappraisal",
  "strategic-expression": "Strategic expression",
  "self-soothing": "Self-soothing",
};

const DEFENSE_LABELS: Record<DetectedDefense["mechanism"], string> = {
  "rationalization": "Rationalization pattern",
  "projection": "Projection pattern",
  "sublimation": "Sublimation pattern",
  "avoidance": "Avoidance pattern",
};

// ── Utility ─────────────────────────────────────────────────

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Clamp a chemistry adjustment to +/- maxMagnitude */
function clampAdjustment(value: number, maxMagnitude: number): number {
  return Math.max(-maxMagnitude, Math.min(maxMagnitude, value));
}
