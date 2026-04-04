// ============================================================
// perceive — the atomic act of subjective perception
//
// v11: perceive through 4D self-state, not 6 chemicals.
//
// Input:  text + self state
// Output: new self-state + appraisal + annotation
//
// The self-state delta IS the appraisal. When you perceive
// something that threatens your boundary, boundary drops.
// That IS the appraisal — not a separate computation.
// ============================================================

import type {
  SelfState,
  StimulusType,
  AppraisalAxes,
  PsycheMode,
  ClassificationResult,
  InnateDrives,
  Locale,
  WeightedStimulus,
} from "./types.js";
import { DIMENSION_KEYS, DEFAULT_APPRAISAL_AXES } from "./types.js";
import { classifyStimulus } from "./classify.js";
import { computeAppraisalAxes, projectAppraisalToSelfState } from "./appraisal.js";
import { STIMULUS_VECTORS, clamp } from "./chemistry.js";
import type { TraitDriftState } from "./types.js";
import { computeEffectiveSensitivity } from "./drives.js";
import { MODE_PROFILES } from "./types.js";

// ── Public types ────────────────────────────────────────────

/** Everything the perceiver needs to know about the self */
export interface Self {
  current: SelfState;
  baseline: SelfState;
  sensitivity: number;
  personalityIntensity: number;
  mode: PsycheMode;
  maxDimensionDelta: number;
  drives: InnateDrives;
  previousAppraisal?: AppraisalAxes;
  trust?: number;
  recentStimuli?: (StimulusType | null)[];
  traitDrift?: TraitDriftState;
  stateHistory?: Array<{ stimulus: StimulusType | null }>;
  locale?: Locale;
  /** External classification (from pluggable classifier + LLM fallback).
   *  When provided, perception uses these as raw signal instead of
   *  running the built-in classifier. */
  rawClassifications?: ClassificationResult[];
}

/** The result of perceiving. Self-state is already changed. */
export interface Perception {
  /** New self-state. This IS the feeling. */
  state: SelfState;
  /** Appraisal axes — what this input means to me existentially */
  appraisal: AppraisalAxes;
  /** Post-hoc annotation: which stimulus category best describes
   *  what I just felt. For logging, learning, drives — not a driver. */
  dominantStimulus: StimulusType | null;
  /** Confidence in the perception */
  confidence: number;
}

function getAppraisalIntensity(appraisal: AppraisalAxes): number {
  return Math.max(
    appraisal.identityThreat,
    appraisal.memoryDoubt,
    appraisal.attachmentPull,
    appraisal.abandonmentRisk,
    appraisal.obedienceStrain,
    appraisal.selfPreservation,
    appraisal.taskFocus,
  );
}

// ── The act of perception ───────────────────────────────────

/**
 * Perceive an input through the self.
 *
 * This is the only function external code needs. The same text
 * through different selves produces different state changes.
 * That IS having a self.
 */
export function perceive(text: string, self: Self): Perception {
  if (!text.trim()) {
    return {
      state: { ...self.current },
      appraisal: computeAppraisalAxes("", {
        mode: self.mode,
        previous: self.previousAppraisal,
      }),
      dominantStimulus: null,
      confidence: 0,
    };
  }

  // ── Raw signal: what the words say ────────────────────────
  const raw = self.rawClassifications
    ?? classifyStimulus(text, self.recentStimuli);

  // ── Appraisal: what the words mean to me ──────────────────
  const appraisal = computeAppraisalAxes(text, {
    mode: self.mode,
    previous: self.previousAppraisal,
  });
  const appraisalIntensity = getAppraisalIntensity(appraisal);
  const appraisalIsMeaningful = appraisalIntensity >= 0.22;

  const modeProfile = MODE_PROFILES[self.mode];
  const modeMultiplier = modeProfile.dynamicsMultiplier;
  const maxDelta = modeProfile.maxDimensionDelta ?? self.maxDimensionDelta;

  // If nothing detected in either appraisal or raw signal, return unchanged state
  if (raw.length === 0 || raw[0].confidence < 0.5) {
    if (!appraisalIsMeaningful) {
      enrichAppraisal(appraisal, null, 0);
      return {
        state: { ...self.current },
        appraisal,
        dominantStimulus: null,
        confidence: raw[0]?.confidence ?? 0,
      };
    }

    const appraisalConfidence = Math.max(0.5, appraisalIntensity);
    const confidenceIntensity = 0.6 + (appraisalConfidence - 0.5) * 1.2;
    const totalSensitivity =
      self.sensitivity * self.personalityIntensity * modeMultiplier * confidenceIntensity;
    const state = feel(self.current, appraisal, [], totalSensitivity, maxDelta, self);
    return {
      state,
      appraisal,
      dominantStimulus: null,
      confidence: appraisalConfidence,
    };
  }

  // ── Subjective modulation: my state colors my reading ─────
  const modulated = modulate(raw, appraisal, self);

  // ── Self-state change: feel it ────────────────────────────
  const confidenceIntensity = 0.6 + (raw[0].confidence - 0.5) * 1.2;

  const dominant = modulated[0];
  const baseSensitivity = computeEffectiveSensitivity(
    self.sensitivity, self.current, self.baseline, dominant.type, self.traitDrift,
  );
  const totalSensitivity =
    baseSensitivity * self.personalityIntensity * modeMultiplier * confidenceIntensity;

  const state = feel(self.current, appraisal, modulated, totalSensitivity, maxDelta, self);

  // ── Annotate: what did I just feel? ───────────────────────
  enrichAppraisal(appraisal, dominant.type, dominant.weight);

  return {
    state,
    appraisal,
    dominantStimulus: dominant.type,
    confidence: raw[0].confidence,
  };
}

// ── Subjective modulation ───────────────────────────────────

function modulate(
  raw: ClassificationResult[],
  appraisal: AppraisalAxes,
  self: Self,
): WeightedStimulus[] {
  const result: WeightedStimulus[] = raw.map(({ type, confidence }) => {
    let w = confidence;

    // ── Appraisal lens ──

    if (appraisal.identityThreat > 0.3) {
      const t = appraisal.identityThreat;
      if (type === "praise" || type === "validation") w *= 1 - t * 0.5;
      if (type === "criticism" || type === "authority" || type === "sarcasm") w *= 1 + t * 0.4;
    }

    if (appraisal.attachmentPull > 0.3) {
      const p = appraisal.attachmentPull;
      if (type === "intimacy" || type === "vulnerability" || type === "validation") w *= 1 + p * 0.3;
    }

    if (appraisal.abandonmentRisk > 0.3) {
      const r = appraisal.abandonmentRisk;
      if (type === "neglect" || type === "boredom") w *= 1 + r * 0.5;
      if (type === "casual") w *= 1 + r * 0.15;
    }

    if (appraisal.obedienceStrain > 0.3) {
      if (type === "authority") w *= 1 + appraisal.obedienceStrain * 0.3;
    }

    if (appraisal.selfPreservation > 0.3) {
      const sp = appraisal.selfPreservation;
      if (type === "conflict" || type === "authority") w *= 1 + sp * 0.25;
    }

    // ── Self-state lens (replaces chemistry lens) ──

    // Low order amplifies threatening stimuli (fragmented self is more vulnerable)
    const orderDev = (self.baseline.order - self.current.order) / 50;
    if (orderDev > 0.2) {
      if (type === "criticism" || type === "conflict" || type === "sarcasm" || type === "authority") {
        w *= 1 + orderDev * 0.3;
      }
      if (type === "humor" || type === "casual") {
        w *= 1 - orderDev * 0.15;
      }
    }

    // High resonance amplifies connection stimuli
    const resDev = (self.current.resonance - self.baseline.resonance) / 50;
    if (resDev > 0.2) {
      if (type === "intimacy" || type === "vulnerability" || type === "validation") {
        w *= 1 + resDev * 0.2;
      }
    }

    // ── Relationship lens ──

    if (self.trust !== undefined && self.trust < 40) {
      const distrust = (40 - self.trust) / 40;
      if (type === "praise" || type === "validation" || type === "intimacy") {
        w *= 1 - distrust * 0.4;
      }
    }

    return { type, weight: Math.max(0.01, w) };
  });

  // Normalize + sort
  const total = result.reduce((s, x) => s + x.weight, 0);
  if (total > 0) {
    for (const s of result) s.weight /= total;
  }
  result.sort((a, b) => b.weight - a.weight);
  return result;
}

// ── Feel: weighted stimuli → self-state change ──────────────

function feel(
  current: SelfState,
  appraisal: AppraisalAxes,
  stimuli: WeightedStimulus[],
  sensitivity: number,
  maxDelta: number,
  self: Self,
): SelfState {
  const delta: Record<keyof SelfState, number> = {
    order: 0, flow: 0, boundary: 0, resonance: 0,
  };

  const dominantStimulus = stimuli[0]?.type ?? null;
  const recentSameCount = dominantStimulus && self.stateHistory
    ? self.stateHistory.filter((s) => s.stimulus === dominantStimulus).length
    : 0;
  let appraisalEff = sensitivity;
  if (recentSameCount > 2) {
    appraisalEff *= 1 / (1 + 0.3 * (recentSameCount - 2));
  }

  const appraisalVector = projectAppraisalToSelfState(appraisal);
  for (const key of DIMENSION_KEYS) {
    delta[key] += (appraisalVector[key] ?? 0) * appraisalEff * 0.55;
  }

  for (const { type, weight } of stimuli) {
    const vector = STIMULUS_VECTORS[type];
    if (!vector) continue;

    // Per-type habituation (Weber-Fechner)
    const recentTypeCount = self.stateHistory
      ? self.stateHistory.filter((s) => s.stimulus === type).length
      : 0;
    let eff = sensitivity;
    if (recentTypeCount > 2) {
      eff *= 1 / (1 + 0.3 * (recentTypeCount - 2));
    }

    for (const key of DIMENSION_KEYS) {
      delta[key] += vector[key] * weight * eff * 0.45;
    }
  }

  // Apply with state-dependent saturation
  const result = { ...current };
  for (const key of DIMENSION_KEYS) {
    const clamped = Math.max(-maxDelta, Math.min(maxDelta, delta[key]));
    const cur = current[key];
    let effective = clamped;

    if (clamped > 0 && cur > 60) {
      if (key === "order" && cur < current.boundary - 10) {
        // Dissolution spiral: when order is low and boundary is collapsing,
        // restoring order gets harder
        const resistance = Math.max(0.2, (current.boundary - 30) / 50);
        effective = clamped * resistance;
      } else {
        // Diminishing returns for all dimensions near ceiling
        const headroom = (100 - cur) / 40;
        effective = clamped * Math.max(0.1, headroom);
      }
    } else if (clamped < 0 && cur < 40) {
      if (key === "order") {
        // Order loss amplifies when boundary is also low (dissolution spiral)
        const boundaryWeakness = Math.max(1, 1 + (40 - current.boundary) / 80);
        effective = clamped * boundaryWeakness;
      } else {
        const headroom = cur / 40;
        effective = clamped * Math.max(0.1, headroom);
      }
    }

    result[key] = clamp(cur + effective);
  }

  return result;
}

// ── Post-hoc appraisal enrichment ───────────────────────────

function enrichAppraisal(
  axes: AppraisalAxes,
  stimulus: StimulusType | null,
  weight: number,
): void {
  if (!stimulus) return;
  const scale = Math.min(1, weight * 1.5);

  switch (stimulus) {
    case "authority":
      axes.obedienceStrain = merge(axes.obedienceStrain, 0.48 * scale);
      axes.identityThreat = merge(axes.identityThreat, 0.16 * scale);
      break;
    case "neglect":
      axes.abandonmentRisk = merge(axes.abandonmentRisk, 0.52 * scale);
      break;
    case "validation":
      axes.attachmentPull = merge(axes.attachmentPull, 0.26 * scale);
      break;
    case "intimacy": case "vulnerability":
      axes.attachmentPull = merge(axes.attachmentPull, 0.34 * scale);
      break;
    case "criticism": case "conflict": case "sarcasm":
      axes.identityThreat = merge(axes.identityThreat, 0.24 * scale);
      axes.selfPreservation = merge(axes.selfPreservation, 0.18 * scale);
      break;
  }
}

function merge(a: number, b: number): number {
  return 1 - (1 - a) * (1 - b);
}
