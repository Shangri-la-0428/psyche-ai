// ============================================================
// Decision Bias — P5: Decision Modulation
//
// Converts chemical state + drive state into bias vectors,
// attention weights, and explore/exploit balance for downstream
// decision-making. Pure math/heuristic, zero dependencies, no LLM.
// ============================================================

import type { PsycheState, ChemicalState, InnateDrives } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export interface DecisionBiasVector {
  explorationTendency: number;  // 0-1, curiosity drive + DA + NE
  cautionLevel: number;         // 0-1, CORT + safety drive hunger
  socialOrientation: number;    // 0-1, OT + connection drive
  assertiveness: number;        // 0-1, NE + esteem drive satisfaction
  creativityBias: number;       // 0-1, DA + END + low CORT
  persistenceBias: number;      // 0-1, HT stability + drive satisfaction
}

export interface AttentionWeights {
  social: number;       // weight for relationship content
  intellectual: number; // weight for knowledge/novel content
  threat: number;       // weight for safety/threat content
  emotional: number;    // weight for emotional content
  routine: number;      // weight for routine/familiar content
}

// ── Utilities ────────────────────────────────────────────────

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Sigmoid mapping: maps any real number to (0, 1) with midpoint at 0.5 */
function sigmoid(x: number, steepness = 1): number {
  return 1 / (1 + Math.exp(-steepness * x));
}

/** Normalize a 0-100 chemical/drive value to 0-1 */
function norm(v: number): number {
  return clamp01(v / 100);
}

/** Weighted average of multiple factors, each in [0, 1] */
function wavg(values: number[], weights: number[]): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * weights[i];
    wsum += weights[i];
  }
  return wsum > 0 ? clamp01(sum / wsum) : 0.5;
}

/** Mean satisfaction across all drives, normalized to [0, 1] */
function meanDriveSatisfaction(drives: InnateDrives): number {
  return norm(
    (drives.survival + drives.safety + drives.connection
      + drives.esteem + drives.curiosity) / 5,
  );
}

// ── Core Computations ────────────────────────────────────────

/**
 * Compute a decision bias vector from the current psyche state.
 *
 * Each bias dimension is a weighted combination of relevant chemical
 * levels and drive states, normalized to [0, 1] where 0.5 is neutral.
 */
export function computeDecisionBias(state: PsycheState): DecisionBiasVector {
  const c = state.current;
  const d = state.drives;

  // explorationTendency: curiosity drive + DA (reward-seeking) + NE (novelty)
  // High curiosity hunger (low satisfaction) + high DA/NE → explore
  const curiosityHunger = 1 - norm(d.curiosity); // lower satisfaction = more hunger
  const explorationTendency = wavg(
    [norm(c.DA), norm(c.NE), curiosityHunger, norm(d.curiosity)],
    [0.25, 0.3, 0.25, 0.2],
  );

  // cautionLevel: CORT (stress) + safety drive hunger
  // High CORT + low safety satisfaction → very cautious
  const safetyHunger = 1 - norm(d.safety);
  const survivalHunger = 1 - norm(d.survival);
  const cautionLevel = wavg(
    [norm(c.CORT), safetyHunger, survivalHunger],
    [0.5, 0.3, 0.2],
  );

  // socialOrientation: OT (bonding) + connection drive satisfaction
  // High OT + hungry for connection → strongly social
  const connectionHunger = 1 - norm(d.connection);
  const socialOrientation = wavg(
    [norm(c.OT), norm(d.connection), connectionHunger, norm(c.END)],
    [0.4, 0.2, 0.25, 0.15],
  );

  // assertiveness: NE (arousal/confidence) + esteem drive satisfaction
  // High NE + satisfied esteem → assertive
  const assertiveness = wavg(
    [norm(c.NE), norm(d.esteem), norm(c.DA)],
    [0.4, 0.35, 0.25],
  );

  // creativityBias: DA (reward) + END (playfulness) + inverse CORT (low stress)
  // Creativity flourishes when relaxed, rewarded, and playful
  const inverseCort = 1 - norm(c.CORT);
  const creativityBias = wavg(
    [norm(c.DA), norm(c.END), inverseCort],
    [0.35, 0.3, 0.35],
  );

  // persistenceBias: HT stability (serotonin) + overall drive satisfaction
  // Stable mood + satisfied drives → willingness to persist
  const overallSatisfaction = meanDriveSatisfaction(d);
  const persistenceBias = wavg(
    [norm(c.HT), overallSatisfaction, inverseCort],
    [0.45, 0.35, 0.2],
  );

  return {
    explorationTendency,
    cautionLevel,
    socialOrientation,
    assertiveness,
    creativityBias,
    persistenceBias,
  };
}

/**
 * Compute attention weights that prioritize different conversation content
 * based on current chemical state.
 *
 * Returns normalized weights (sum to ~1) for each content category.
 * Higher weight = higher priority for that type of content.
 */
export function computeAttentionWeights(state: PsycheState): AttentionWeights {
  const c = state.current;

  // Raw scores based on chemical signatures
  // High OT → prioritize relationship/social content
  const socialRaw = norm(c.OT) * 0.6 + norm(c.END) * 0.2 + (1 - norm(c.CORT)) * 0.2;

  // High NE → prioritize intellectual/novel content
  const intellectualRaw = norm(c.NE) * 0.5 + norm(c.DA) * 0.3 + norm(state.drives.curiosity) * 0.2;

  // High CORT → prioritize threat/safety content
  const threatRaw = norm(c.CORT) * 0.6 + norm(c.NE) * 0.2 + (1 - norm(state.drives.safety)) * 0.2;

  // Emotional content weighted by overall emotional activation
  const emotionalRaw = (
    Math.abs(norm(c.DA) - 0.5)
    + Math.abs(norm(c.HT) - 0.5)
    + Math.abs(norm(c.CORT) - 0.5)
    + Math.abs(norm(c.OT) - 0.5)
  ) / 2; // average deviation from neutral, scaled

  // Routine content is inverse of activation — when calm and stable, routine matters
  const activation = (norm(c.NE) + norm(c.CORT) + Math.abs(norm(c.DA) - 0.5)) / 3;
  const routineRaw = Math.max(0.1, 1 - activation) * norm(c.HT);

  // Normalize to sum to 1
  const total = socialRaw + intellectualRaw + threatRaw + emotionalRaw + routineRaw;
  if (total <= 0) {
    return { social: 0.2, intellectual: 0.2, threat: 0.2, emotional: 0.2, routine: 0.2 };
  }

  return {
    social: socialRaw / total,
    intellectual: intellectualRaw / total,
    threat: threatRaw / total,
    emotional: emotionalRaw / total,
    routine: routineRaw / total,
  };
}

/**
 * Compute explore vs exploit balance.
 *
 * Returns a single float:
 *   0 = pure exploit (stick with known, safe behaviors)
 *   1 = pure explore (try new approaches, take risks)
 *
 * Exploration is driven by:
 *   - High curiosity drive satisfaction (energy to explore)
 *   - High DA (reward anticipation)
 *   - High NE (novelty-seeking)
 *   - Low CORT (not stressed)
 *   - High safety (secure enough to take risks)
 *
 * Exploitation is driven by:
 *   - High CORT / anxiety
 *   - Low safety drive satisfaction
 *   - Low DA (no reward motivation)
 */
export function computeExploreExploit(state: PsycheState): number {
  const c = state.current;
  const d = state.drives;

  // Exploration signals
  const curiosityEnergy = norm(d.curiosity);
  const rewardDrive = norm(c.DA);
  const noveltySeeking = norm(c.NE);
  const relaxation = 1 - norm(c.CORT);
  const securityBase = norm(d.safety);

  // Exploitation signals (inverted — higher = more exploit = lower explore)
  const anxiety = norm(c.CORT);
  const unsafety = 1 - norm(d.safety);
  const survivalThreat = 1 - norm(d.survival);

  // Weighted explore score
  const exploreScore = wavg(
    [curiosityEnergy, rewardDrive, noveltySeeking, relaxation, securityBase],
    [0.25, 0.2, 0.2, 0.2, 0.15],
  );

  // Weighted exploit score
  const exploitScore = wavg(
    [anxiety, unsafety, survivalThreat],
    [0.5, 0.3, 0.2],
  );

  // Combine: use sigmoid to create a smooth transition
  // Positive difference → explore, negative → exploit
  const diff = exploreScore - exploitScore;
  return clamp01(sigmoid(diff * 4)); // steepness=4 for reasonable sensitivity
}

// ── Prompt Injection ─────────────────────────────────────────

/** Bias labels for human-readable output */
const BIAS_LABELS: Record<keyof DecisionBiasVector, [string, string]> = {
  explorationTendency: ["探索倾向强", "exploratory"],
  cautionLevel: ["警惕性高", "cautious"],
  socialOrientation: ["社交倾向强", "socially oriented"],
  assertiveness: ["表达果断", "assertive"],
  creativityBias: ["创意活跃", "creatively active"],
  persistenceBias: ["意志坚持", "persistent"],
};

/** Low-end labels for when bias < 0.2 */
const BIAS_LABELS_LOW: Record<keyof DecisionBiasVector, [string, string]> = {
  explorationTendency: ["倾向保守", "risk-averse"],
  cautionLevel: ["放松大胆", "relaxed and bold"],
  socialOrientation: ["偏好独处", "prefers solitude"],
  assertiveness: ["表达含蓄", "reserved"],
  creativityBias: ["思维收敛", "convergent thinking"],
  persistenceBias: ["容易放弃", "low persistence"],
};

/**
 * Build a compact decision context string for prompt injection.
 *
 * Only includes biases that deviate significantly from neutral (>0.3 from 0.5).
 * Keeps output under 100 tokens.
 */
export function buildDecisionContext(state: PsycheState): string {
  const bias = computeDecisionBias(state);
  const explore = computeExploreExploit(state);
  const locale = state.meta.locale ?? "zh";
  const li = locale === "zh" ? 0 : 1;

  const parts: string[] = [];

  // Only surface biases that deviate significantly from neutral
  const DEVIATION_THRESHOLD = 0.3;

  for (const key of Object.keys(BIAS_LABELS) as (keyof DecisionBiasVector)[]) {
    const val = bias[key];
    const deviation = val - 0.5;

    if (deviation > DEVIATION_THRESHOLD) {
      parts.push(BIAS_LABELS[key][li]);
    } else if (deviation < -DEVIATION_THRESHOLD) {
      parts.push(BIAS_LABELS_LOW[key][li]);
    }
  }

  // Explore/exploit — only mention if strongly skewed
  if (explore > 0.7) {
    parts.push(locale === "zh" ? "倾向尝试新方法" : "leaning toward new approaches");
  } else if (explore < 0.3) {
    parts.push(locale === "zh" ? "倾向安全策略" : "favoring safe strategies");
  }

  if (parts.length === 0) return "";

  const title = locale === "zh" ? "决策倾向" : "Decision Bias";
  return `[${title}] ${parts.join("、")}`;
}
