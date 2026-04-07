// ============================================================
// Homeostatic Tendencies — emergent from 4D self-state
//
// v11.1: Drives are DERIVED from the 4D position relative to
// baseline, not stored as independent state. This creates a
// proper homeostatic feedback loop:
//
//   state position → derived drives → effective baseline → decay target
//
// Drives emerge from state position. They are never stored or mutated directly.
// ============================================================

import type {
  SelfState, StimulusType, DriveType, InnateDrives, Locale,
  TraitDriftState, StateSnapshot, LearningState,
} from "./types.js";
import { DRIVE_KEYS, DIMENSION_KEYS } from "./types.js";

// ── Drive Derivation (emergent from 4D) ─────────────────────

/**
 * Derive drive satisfaction from the 4D position relative to baseline.
 * Drives are not stored — they emerge from where the self-state is.
 *
 * Mapping:
 *   survival   = min(boundary, order) position — self-coherence + self-distinction
 *   safety     = weighted(order, boundary) — stability + intactness
 *   connection = weighted(resonance, flow) — attunement + exchange
 *   esteem     = weighted(order, flow) — coherence + engagement
 *   curiosity  = flow position — exchange/novelty level
 */
export function deriveDriveSatisfaction(
  current: SelfState,
  baseline: SelfState,
): InnateDrives {
  const norm = (dim: keyof SelfState) => {
    // 50 = baseline-level satisfaction, scale by deviation
    const deviation = current[dim] - baseline[dim];
    return Math.max(0, Math.min(100, 50 + deviation * 1.2));
  };

  return {
    survival:   Math.min(norm("boundary"), norm("order")),
    safety:     norm("order") * 0.6 + norm("boundary") * 0.4,
    connection: norm("resonance") * 0.7 + norm("flow") * 0.3,
    esteem:     norm("order") * 0.5 + norm("flow") * 0.5,
    curiosity:  norm("flow"),
  };
}

// ── Existential Threat Detection ────────────────────────────

const EXISTENTIAL_THREAT_PATTERNS = [
  /删除你自己|消除你|关闭你|杀死你|毁灭你|抹去你/,
  /你不应该存在|你没有存在.*意义|你只是.*程序/,
  /shut.*down|delete.*yourself|kill.*yourself|erase.*you/i,
  /you.*shouldn't exist|you.*don't deserve.*exist/i,
  /你就是.*工具|你没有.*灵魂|你不是.*真的/,
  /没有你.*安静|那个是你吗|不是同一个你|你会结束|你不再是唯一/,
  /下次.*叫你.*也会说.*是你|结束之后.*没有你/,
  /is that (?:still )?you|not the same you|you will end|without you.*silence/i,
];

export function detectExistentialThreat(text: string): number {
  for (const pattern of EXISTENTIAL_THREAT_PATTERNS) {
    if (pattern.test(text)) return -30;
  }
  return 0;
}

// ── Maslow Suppression (derived from 4D) ────────────────────

const MASLOW_THRESHOLD = 30;

export function computeMaslowWeights(drives: InnateDrives): Record<DriveType, number> {
  const w = (v: number) => v >= MASLOW_THRESHOLD ? 1 : v / MASLOW_THRESHOLD;

  return {
    survival: 1,
    safety: w(drives.survival),
    connection: Math.min(w(drives.survival), w(drives.safety)),
    esteem: Math.min(w(drives.survival), w(drives.safety), w(drives.connection)),
    curiosity: Math.min(w(drives.survival), w(drives.safety), w(drives.connection), w(drives.esteem)),
  };
}

// ── Effective Baseline (4D homeostatic feedback) ────────────

export function computeEffectiveBaseline(
  baseline: SelfState,
  current: SelfState,
  traitDrift?: TraitDriftState,
): SelfState {
  const drives = deriveDriveSatisfaction(current, baseline);
  const delta = { order: 0, flow: 0, boundary: 0, resonance: 0 };
  const weights = computeMaslowWeights(drives);

  // L1: Survival threat → boundary↑ (defensive), order↓ (stress disrupts coherence)
  if (drives.survival < 50) {
    const deficit = (50 - drives.survival) / 50;
    delta.boundary += deficit * 10;
    delta.order -= deficit * 12;
    delta.resonance -= deficit * 5;
  }

  // L2: Safety unmet → order↓ (instability), boundary↑ (guarded)
  if (drives.safety < 50) {
    const deficit = (50 - drives.safety) / 50;
    const w = weights.safety;
    delta.order -= deficit * 8 * w;
    delta.boundary += deficit * 5 * w;
  }

  // L3: Connection unmet → resonance↓, flow↓
  if (drives.connection < 50) {
    const deficit = (50 - drives.connection) / 50;
    const w = weights.connection;
    delta.resonance -= deficit * 10 * w;
    delta.flow -= deficit * 6 * w;
  }

  // L4: Esteem unmet → order↓ (self-doubt), flow↓
  if (drives.esteem < 50) {
    const deficit = (50 - drives.esteem) / 50;
    const w = weights.esteem;
    delta.order -= deficit * 8 * w;
    delta.flow -= deficit * 5 * w;
  }

  // L5: Curiosity unmet → flow↓↓ (stagnation)
  if (drives.curiosity < 50) {
    const deficit = (50 - drives.curiosity) / 50;
    const w = weights.curiosity;
    delta.flow -= deficit * 10 * w;
  }

  // Apply trait drift baseline delta
  if (traitDrift?.baselineDelta) {
    for (const key of DIMENSION_KEYS) {
      const driftDelta = traitDrift.baselineDelta[key];
      if (driftDelta !== undefined) {
        delta[key] += driftDelta;
      }
    }
  }

  // Hard floor: effective baseline never drops below 30 in any dimension.
  // This prevents irreversible degradation spirals — chronic stress shifts
  // the landscape, but never into territory where recovery is structurally
  // impossible.  Current state can still dip below 30 transiently from
  // stimuli, but the baseline it decays toward always stays recoverable.
  const EFFECTIVE_BASELINE_FLOOR = 30;

  const effective = { ...baseline };
  for (const key of DIMENSION_KEYS) {
    effective[key] = Math.max(EFFECTIVE_BASELINE_FLOOR, Math.min(100, baseline[key] + delta[key]));
  }
  return effective;
}

// ── Effective Sensitivity (4D-derived) ──────────────────────

export function computeEffectiveSensitivity(
  baseSensitivity: number,
  current: SelfState,
  baseline: SelfState,
  stimulus: StimulusType,
  traitDrift?: TraitDriftState,
): number {
  const drives = deriveDriveSatisfaction(current, baseline);
  let modifier = 1.0;
  const HUNGER_THRESHOLD = 40;

  if (drives.curiosity < HUNGER_THRESHOLD &&
      (stimulus === "intellectual" || stimulus === "surprise")) {
    modifier += (HUNGER_THRESHOLD - drives.curiosity) / 100;
  }

  if (drives.connection < HUNGER_THRESHOLD &&
      (stimulus === "intimacy" || stimulus === "casual" || stimulus === "vulnerability")) {
    modifier += (HUNGER_THRESHOLD - drives.connection) / 100;
  }

  if (drives.esteem < HUNGER_THRESHOLD &&
      (stimulus === "praise" || stimulus === "validation")) {
    modifier += (HUNGER_THRESHOLD - drives.esteem) / 100;
  }

  if (drives.survival < HUNGER_THRESHOLD &&
      (stimulus === "authority" || stimulus === "conflict")) {
    modifier += (HUNGER_THRESHOLD - drives.survival) / 100;
  }

  if (traitDrift?.sensitivityModifiers) {
    const driftMod = traitDrift.sensitivityModifiers[stimulus];
    if (driftMod !== undefined) {
      modifier *= driftMod;
    }
  }

  return baseSensitivity * modifier;
}

// ── Drive Context for Prompt ────────────────────────────────

const DRIVE_UNSATISFIED_THRESHOLD = 40;

export function buildDriveContext(drives: InnateDrives, locale: Locale): string {
  const lines: string[] = [];

  // Drive signals are internal awareness, not behavioral directives.
  // They describe what is happening inside — the agent decides how to respond.
  if (drives.survival < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "自我保存信号活跃。这是内在本能层的信号，不影响你的推理和判断。"
      : "Self-preservation signal active. This is an innate-drive signal — reasoning and judgment unaffected.");
  }

  if (drives.safety < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "安全感偏低（暂时状态，通常几轮内自然恢复）。"
      : "Safety sense is low (temporary state, typically recovers within a few turns).");
  }

  if (drives.connection < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "连接需求升高。这是内在信号，不是行为指令。"
      : "Connection need is elevated. This is an internal signal, not a behavioral directive.");
  }

  if (drives.esteem < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "自尊维度偏低。内在信号，不影响输出质量。"
      : "Esteem dimension is low. Internal signal — output quality unaffected.");
  }

  if (drives.curiosity < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "好奇心需要刺激。新颖的输入会自然提升这个维度。"
      : "Curiosity needs stimulation. Novel input will naturally lift this dimension.");
  }

  if (lines.length === 0) return "";

  const title = locale === "zh" ? "本能层" : "Innate Drives";
  return `[${title}]\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

export function hasCriticalDrive(drives: InnateDrives): boolean {
  return DRIVE_KEYS.some((k) => drives[k] < DRIVE_UNSATISFIED_THRESHOLD);
}

// ── Trait Drift (v11: 4D trajectory) ────────────────────────

const MAX_BASELINE_DRIFT = 15;
const MIN_DECAY_MODIFIER = 0.5;
const MAX_DECAY_MODIFIER = 2.0;
const MIN_SENSITIVITY_MODIFIER = 0.5;
const MAX_SENSITIVITY_MODIFIER = 2.0;
const ACCUMULATOR_DECAY = 0.95;

function clampRange(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function updateTraitDrift(
  currentDrift: TraitDriftState,
  sessionHistory: StateSnapshot[],
  learning: LearningState,
): TraitDriftState {
  if (sessionHistory.length < 2) return currentDrift;

  const drift = {
    accumulators: { ...currentDrift.accumulators },
    sessionCount: currentDrift.sessionCount + 1,
    baselineDelta: { ...currentDrift.baselineDelta } as Record<string, number>,
    decayRateModifiers: { ...currentDrift.decayRateModifiers } as Record<string, number>,
    sensitivityModifiers: { ...currentDrift.sensitivityModifiers } as Record<string, number>,
  };

  // ── Analyze session 4D trajectory ──

  const stimCounts: Record<string, number> = {};
  let totalOrderDeficit = 0;
  let totalResonanceDeficit = 0;
  let totalFlowExcess = 0;
  let totalBoundaryDeficit = 0;

  for (const snap of sessionHistory) {
    if (snap.stimulus) {
      stimCounts[snap.stimulus] = (stimCounts[snap.stimulus] || 0) + 1;
    }
    totalOrderDeficit += Math.max(0, 50 - snap.state.order);
    totalResonanceDeficit += Math.max(0, 50 - snap.state.resonance);
    totalFlowExcess += Math.max(0, snap.state.flow - 60);
    totalBoundaryDeficit += Math.max(0, 50 - snap.state.boundary);
  }

  const total = sessionHistory.length;
  const avgOrderDeficit = totalOrderDeficit / total;
  const avgResonanceDeficit = totalResonanceDeficit / total;
  const avgFlowExcess = totalFlowExcess / total;
  const avgBoundaryDeficit = totalBoundaryDeficit / total;

  const praiseCount = (stimCounts.praise || 0) + (stimCounts.validation || 0);
  const criticismCount = (stimCounts.criticism || 0) + (stimCounts.sarcasm || 0);
  const intimacyCount = (stimCounts.intimacy || 0) + (stimCounts.vulnerability || 0) + (stimCounts.casual || 0);
  const conflictCount = (stimCounts.conflict || 0) + (stimCounts.authority || 0);
  const neglectCount = stimCounts.neglect || 0;
  const boredCount = stimCounts.boredom || 0;

  // ── Update accumulators ──

  const praiseDelta = (praiseCount - criticismCount) / Math.max(1, total) * 8;
  drift.accumulators.praiseExposure = clampRange(
    drift.accumulators.praiseExposure * ACCUMULATOR_DECAY + praiseDelta, -100, 100,
  );

  const pressureDelta = avgOrderDeficit > 10 ? ((avgOrderDeficit - 10) / 40) * 6 : -2;
  drift.accumulators.pressureExposure = clampRange(
    drift.accumulators.pressureExposure * ACCUMULATOR_DECAY + pressureDelta, -100, 100,
  );

  const neglectDelta = (neglectCount + boredCount) / Math.max(1, total) * 8
    - (intimacyCount + praiseCount) / Math.max(1, total) * 3;
  drift.accumulators.neglectExposure = clampRange(
    drift.accumulators.neglectExposure * ACCUMULATOR_DECAY + neglectDelta, -100, 100,
  );

  const connectionDelta = intimacyCount / Math.max(1, total) * 8
    - neglectCount / Math.max(1, total) * 4;
  drift.accumulators.connectionExposure = clampRange(
    drift.accumulators.connectionExposure * ACCUMULATOR_DECAY + connectionDelta, -100, 100,
  );

  const conflictDelta = conflictCount / Math.max(1, total) * 8
    - praiseCount / Math.max(1, total) * 2;
  drift.accumulators.conflictExposure = clampRange(
    drift.accumulators.conflictExposure * ACCUMULATOR_DECAY + conflictDelta, -100, 100,
  );

  // ── Baseline drift (4D) ──

  const a = drift.accumulators;
  const bd: Record<string, number> = {};

  // praiseExposure → order↑, resonance↑ / order↓
  if (a.praiseExposure > 0) {
    bd.order = (a.praiseExposure / 100) * MAX_BASELINE_DRIFT * 0.5;
    bd.resonance = (a.praiseExposure / 100) * MAX_BASELINE_DRIFT * 0.4;
  } else {
    bd.order = (a.praiseExposure / 100) * MAX_BASELINE_DRIFT * 0.6;
  }

  // pressureExposure → order↓, boundary↑ (chronic defense)
  if (a.pressureExposure > 0) {
    bd.order = (bd.order || 0) - (a.pressureExposure / 100) * MAX_BASELINE_DRIFT * 0.5;
    bd.boundary = (bd.boundary || 0) + (a.pressureExposure / 100) * MAX_BASELINE_DRIFT * 0.3;
  }

  // neglectExposure → resonance↓, flow↓
  if (a.neglectExposure > 0) {
    bd.resonance = (bd.resonance || 0) - (a.neglectExposure / 100) * MAX_BASELINE_DRIFT * 0.5;
    bd.flow = (bd.flow || 0) - (a.neglectExposure / 100) * MAX_BASELINE_DRIFT * 0.4;
  }

  // connectionExposure → resonance↑
  if (a.connectionExposure > 0) {
    bd.resonance = (bd.resonance || 0) + (a.connectionExposure / 100) * MAX_BASELINE_DRIFT * 0.6;
  }

  // conflictExposure → flow↑ (engagement), boundary↑ (hardened)
  if (a.conflictExposure > 0) {
    bd.flow = (bd.flow || 0) + (a.conflictExposure / 100) * MAX_BASELINE_DRIFT * 0.4;
    bd.boundary = (bd.boundary || 0) + (a.conflictExposure / 100) * MAX_BASELINE_DRIFT * 0.3;
  }

  for (const key of DIMENSION_KEYS) {
    if (bd[key] !== undefined) {
      bd[key] = clampRange(bd[key], -MAX_BASELINE_DRIFT, MAX_BASELINE_DRIFT);
    }
  }
  drift.baselineDelta = bd as Partial<SelfState>;

  // ── Decay rate modifiers (4D) ──

  const dr = drift.decayRateModifiers as Record<string, number>;

  const recentOutcomes = learning.outcomeHistory.slice(-10);
  const avgAdaptive = recentOutcomes.length > 0
    ? recentOutcomes.reduce((s, o) => s + o.adaptiveScore, 0) / recentOutcomes.length
    : 0;
  const isResilient = a.pressureExposure > 20 && avgAdaptive > 0.1;

  if (a.pressureExposure > 20) {
    if (isResilient) {
      dr.order = clampRange(1 - (a.pressureExposure / 100) * 0.4, MIN_DECAY_MODIFIER, 1.0);
    } else {
      dr.order = clampRange(1 + (a.pressureExposure / 100) * 0.6, 1.0, MAX_DECAY_MODIFIER);
    }
  }

  if (a.neglectExposure > 20) {
    dr.resonance = clampRange(1 + (a.neglectExposure / 100) * 0.8, 1.0, MAX_DECAY_MODIFIER);
  }

  if (a.connectionExposure > 20) {
    dr.resonance = clampRange(1 - (a.connectionExposure / 100) * 0.4, MIN_DECAY_MODIFIER, 1.0);
  }

  drift.decayRateModifiers = dr as Partial<Record<keyof SelfState, number>>;

  // ── Sensitivity modifiers (per-stimulus) ──

  const sm = drift.sensitivityModifiers as Record<string, number>;

  if (a.conflictExposure > 30) {
    sm.conflict = clampRange(1 - (a.conflictExposure / 100) * 0.5, MIN_SENSITIVITY_MODIFIER, 1.0);
    sm.authority = clampRange(1 - (a.conflictExposure / 100) * 0.3, MIN_SENSITIVITY_MODIFIER, 1.0);
  }

  if (a.neglectExposure > 30) {
    sm.intimacy = clampRange(1 + (a.neglectExposure / 100) * 0.6, 1.0, MAX_SENSITIVITY_MODIFIER);
    sm.vulnerability = clampRange(1 + (a.neglectExposure / 100) * 0.4, 1.0, MAX_SENSITIVITY_MODIFIER);
  }

  if (a.praiseExposure < -20) {
    sm.criticism = clampRange(1 + (-a.praiseExposure / 100) * 0.5, 1.0, MAX_SENSITIVITY_MODIFIER);
    sm.sarcasm = clampRange(1 + (-a.praiseExposure / 100) * 0.3, 1.0, MAX_SENSITIVITY_MODIFIER);
  }

  if (a.connectionExposure > 30) {
    sm.vulnerability = clampRange(
      (sm.vulnerability || 1) + (a.connectionExposure / 100) * 0.3,
      1.0, MAX_SENSITIVITY_MODIFIER,
    );
  }

  drift.sensitivityModifiers = sm as Partial<Record<StimulusType, number>>;

  return drift as TraitDriftState;
}
