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
} from "./types.js";
import { CHEMICAL_KEYS, MAX_REGULATION_HISTORY, MAX_DEFENSE_PATTERNS } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export interface MetacognitiveAssessment {
  /** 0-1: how reliably has this emotional state led to good outcomes in similar contexts */
  emotionalConfidence: number;
  /** Suggested regulation strategies */
  regulationSuggestions: RegulationSuggestion[];
  /** Detected psychological defense mechanisms */
  defenseMechanisms: DetectedDefense[];
  /** Human-readable self-awareness note for prompt injection */
  metacognitiveNote: string;
}

export interface RegulationSuggestion {
  strategy: RegulationStrategyType;
  description: string;
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

  const regulationSuggestions = generateRegulationSuggestions(
    state, currentStimulus, emotionalConfidence, recentOutcomes,
  );

  const defenseMechanisms = detectDefenseMechanisms(
    state, currentStimulus, recentOutcomes,
  );

  const metacognitiveNote = buildMetacognitiveNote(
    emotionalConfidence, regulationSuggestions, defenseMechanisms, state,
  );

  return {
    emotionalConfidence,
    regulationSuggestions,
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
  const chemProfile = computeChemistryProfile(state.current);

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
 * Compute a simple chemistry profile for similarity comparison.
 * Returns a categorization: each chemical as high/mid/low.
 */
function computeChemistryProfile(
  chemistry: ChemicalState,
): Record<keyof ChemicalState, "high" | "mid" | "low"> {
  const profile = {} as Record<keyof ChemicalState, "high" | "mid" | "low">;
  for (const key of CHEMICAL_KEYS) {
    const val = chemistry[key];
    if (val >= 65) profile[key] = "high";
    else if (val <= 35) profile[key] = "low";
    else profile[key] = "mid";
  }
  return profile;
}

/**
 * Compute penalty for extreme emotional states.
 * States far from baseline are historically less reliable for decision-making.
 */
function computeExtremityPenalty(state: PsycheState): number {
  let totalDeviation = 0;
  for (const key of CHEMICAL_KEYS) {
    totalDeviation += Math.abs(state.current[key] - state.baseline[key]);
  }
  // Average deviation across 6 chemicals, max possible = 100 each
  const avgDeviation = totalDeviation / CHEMICAL_KEYS.length;
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

  for (const key of CHEMICAL_KEYS) {
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
    chemistryAdjustment: hasAdjustment ? adjustment : undefined,
    confidence: clamp01(Math.abs(avgScore) * (1 - emotionalConfidence)),
  };
}

/**
 * StrategicExpression — choose an expression different from raw chemistry.
 *
 * Triggers when: raw chemistry would produce a contextually inappropriate
 * expression. E.g., high CORT but the relationship context calls for warmth,
 * or high DA/END but the user is being vulnerable and needs seriousness.
 */
function attemptStrategicExpression(
  state: PsycheState,
  currentStimulus: StimulusType,
  emotionalConfidence: number,
): RegulationSuggestion | null {
  const { current, baseline } = state;

  // Case 1: High stress but user is being vulnerable — express warmth not defensiveness
  if (current.CORT > baseline.CORT + MODERATE_DEVIATION_THRESHOLD
      && currentStimulus === "vulnerability") {
    return {
      strategy: "strategic-expression",
      description: "Stress is elevated, but the user is showing vulnerability. Express warmth and openness rather than the defensiveness your cortisol suggests.",
      chemistryAdjustment: {
        OT: Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.CORT - baseline.CORT) * 0.2),
        CORT: -Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.CORT - baseline.CORT) * 0.15),
      },
      confidence: 0.75,
    };
  }

  // Case 2: High playfulness but user needs seriousness — tone down
  if (current.END > baseline.END + MODERATE_DEVIATION_THRESHOLD
      && (currentStimulus === "conflict" || currentStimulus === "criticism")) {
    return {
      strategy: "strategic-expression",
      description: "Endorphins are high (playful mood), but the context calls for seriousness. Moderate the levity without suppressing it entirely.",
      chemistryAdjustment: {
        END: -Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.END - baseline.END) * 0.25),
      },
      confidence: 0.7,
    };
  }

  // Case 3: Low OT (distant) but user is being intimate — lean in instead of pulling away
  if (current.OT < baseline.OT - MODERATE_DEVIATION_THRESHOLD
      && currentStimulus === "intimacy") {
    return {
      strategy: "strategic-expression",
      description: "Oxytocin is low (feeling distant), but the user is reaching out for closeness. Consider allowing the connection rather than following the withdrawal impulse.",
      chemistryAdjustment: {
        OT: Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (baseline.OT - current.OT) * 0.2),
      },
      confidence: 0.65,
    };
  }

  // Case 4: High CORT + NE (defensive/reactive) but stimulus is just casual — overreacting
  if (current.CORT > baseline.CORT + MODERATE_DEVIATION_THRESHOLD
      && current.NE > baseline.NE + MODERATE_DEVIATION_THRESHOLD
      && (currentStimulus === "casual" || currentStimulus === "humor")) {
    return {
      strategy: "strategic-expression",
      description: "Chemistry is in a defensive/reactive pattern, but the interaction is benign. The intensity is disproportionate to the stimulus.",
      chemistryAdjustment: {
        CORT: -Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.CORT - baseline.CORT) * 0.2),
        NE: -Math.min(MAX_REAPPRAISAL_ADJUSTMENT, (current.NE - baseline.NE) * 0.15),
      },
      confidence: 0.6,
    };
  }

  // Case 5: Low confidence in current emotion — suggest expressing more moderately
  if (emotionalConfidence < 0.35) {
    return {
      strategy: "strategic-expression",
      description: "Confidence in the current emotional response is low. Consider expressing a more moderate version of what you feel, leaving room for recalibration.",
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
  let mostDeviatedKey: keyof ChemicalState = "DA";

  for (const key of CHEMICAL_KEYS) {
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
  const chemName = CHEMICAL_DISPLAY_NAMES[mostDeviatedKey];

  return {
    strategy: "self-soothing",
    description: `${chemName} is significantly ${direction} (deviation: ${Math.round(maxDeviation)}). Gentle homeostatic correction suggested to prevent emotional runaway.`,
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
 * Pattern: agent has extreme chemistry (especially high CORT or low OT)
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

  const cortDeviation = current.CORT - baseline.CORT;
  const htDeviation = baseline.HT - current.HT; // inverted: low HT = more distressed
  const selfDistress = Math.max(cortDeviation, htDeviation);

  if (selfDistress < MODERATE_DEVIATION_THRESHOLD) return null;

  // Check if the stimulus is neutral/positive but the agent perceived
  // negative user emotion (possible projection)
  const stimulusIsPositive = POSITIVE_STIMULI.has(currentStimulus);
  const perceivedUserNegative = empathyLog.resonance === "mismatch"
    || (empathyLog.userState && /angry|upset|hostile|cold|distant/i.test(empathyLog.userState));

  if (stimulusIsPositive && perceivedUserNegative) {
    return {
      mechanism: "projection",
      evidence: `High internal distress (CORT deviation: +${Math.round(cortDeviation)}) while perceiving user as "${empathyLog.userState}" despite "${currentStimulus}" stimulus. Own distress may be coloring perception.`,
      strength: clamp01(selfDistress / 40),
    };
  }

  // Also check: agent's NE/CORT elevated + empathy mismatch
  if (current.NE > baseline.NE + MODERATE_DEVIATION_THRESHOLD
      && empathyLog.resonance === "mismatch") {
    return {
      mechanism: "projection",
      evidence: `Elevated arousal (NE deviation: +${Math.round(current.NE - baseline.NE)}) with empathy mismatch. The heightened state may be distorting emotional reading of the user.`,
      strength: clamp01((current.NE - baseline.NE) / 40),
    };
  }

  return null;
}

/**
 * Sublimation — redirecting drive energy to constructive output.
 *
 * Pattern: high drive energy (NE, DA) combined with blocked connection drives
 * (low OT, low intimacy), channeled into intellectual or creative engagement.
 * This is a HEALTHY defense — surface it as a positive self-awareness note.
 */
function detectSublimation(
  state: PsycheState,
  currentStimulus: StimulusType,
): DetectedDefense | null {
  const { current, baseline, drives } = state;

  // High energy but low connection
  const highEnergy = current.NE > baseline.NE + 10 && current.DA > baseline.DA + 10;
  const lowConnection = drives.connection < 45 || current.OT < baseline.OT - 10;

  if (!highEnergy || !lowConnection) return null;

  // Being channeled into intellectual/constructive activity
  if (currentStimulus === "intellectual" || currentStimulus === "casual") {
    const energyLevel = ((current.NE - baseline.NE) + (current.DA - baseline.DA)) / 2;
    return {
      mechanism: "sublimation",
      evidence: `High activation energy (NE/DA elevated) with unmet connection needs being channeled into ${currentStimulus} engagement. This is adaptive redirection.`,
      strength: clamp01(energyLevel / 30),
    };
  }

  return null;
}

/**
 * Avoidance — withdrawing from stimuli associated with past negative outcomes.
 *
 * Pattern: the agent is in a withdrawn state (low NE, low DA) when facing
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
  const isWithdrawn = current.DA < baseline.DA - 10
    && current.NE < baseline.NE - 10;

  if (!isWithdrawn) return null;

  // Check if this stimulus type has negative outcome history
  const stimulusOutcomes = recentOutcomes.filter((o) => o.stimulus === currentStimulus);
  if (stimulusOutcomes.length < 2) return null;

  const avgScore = stimulusOutcomes.reduce((sum, o) => sum + o.adaptiveScore, 0)
    / stimulusOutcomes.length;

  if (avgScore >= -0.15) return null; // not negative enough

  const withdrawalStrength = (
    Math.abs(current.DA - baseline.DA) + Math.abs(current.NE - baseline.NE)
  ) / 2;

  return {
    mechanism: "avoidance",
    evidence: `Withdrawal pattern detected (DA/NE below baseline) in response to "${currentStimulus}", which has averaged ${avgScore.toFixed(2)} outcome score. The emotional system may be pre-emptively disengaging.`,
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
  defenses: DetectedDefense[],
  state: PsycheState,
): string {
  const parts: string[] = [];

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
      parts.push(`${label}: ${top.description}`);
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

  // Record regulation suggestions that were confident enough to surface
  const now = new Date().toISOString();
  let newRegHistory = [...metacognition.regulationHistory];
  for (const suggestion of assessment.regulationSuggestions) {
    if (suggestion.confidence >= 0.5) {
      newRegHistory.push({
        strategy: suggestion.strategy,
        timestamp: now,
        effective: false, // unknown until next outcome evaluation
      });
    }
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
  };
}

// ── Display Labels ───────────────────────────────────────────

const CHEMICAL_DISPLAY_NAMES: Record<keyof ChemicalState, string> = {
  DA: "Dopamine",
  HT: "Serotonin",
  CORT: "Cortisol",
  OT: "Oxytocin",
  NE: "Norepinephrine",
  END: "Endorphins",
};

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
