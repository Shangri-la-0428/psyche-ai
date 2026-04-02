// ============================================================
// Homeostatic Tendencies — motivation layer beneath self-state
//
// v11: Drives modify effective baseline and sensitivity for
// 4 self-state dimensions. The Maslow hierarchy is preserved
// as interaction vocabulary but maps to 4D effects.
// ============================================================

import type {
  SelfState, StimulusType, DriveType, InnateDrives, Locale,
  TraitDriftState, StateSnapshot, LearningState,
} from "./types.js";
import { DRIVE_KEYS, DIMENSION_KEYS } from "./types.js";

// ── Drive Decay ─────────────────────────────────────────────

const DRIVE_DECAY_RATES: Record<DriveType, number> = {
  survival: 0.99,
  safety: 0.96,
  connection: 0.92,
  esteem: 0.94,
  curiosity: 0.90,
};

export function decayDrives(drives: InnateDrives, minutesElapsed: number): InnateDrives {
  if (minutesElapsed <= 0) return drives;

  const result = { ...drives };
  for (const key of DRIVE_KEYS) {
    const factor = Math.pow(DRIVE_DECAY_RATES[key], minutesElapsed / 60);
    result[key] = Math.max(0, Math.min(100, result[key] * factor));
  }
  return result;
}

// ── Stimulus → Drive Effects ────────────────────────────────

const STIMULUS_DRIVE_EFFECTS: Record<StimulusType, Partial<Record<DriveType, number>>> = {
  praise:        { esteem: +15, safety: +5 },
  validation:    { esteem: +20, safety: +10, survival: +5 },
  intimacy:      { connection: +25, safety: +10 },
  casual:        { connection: +10, safety: +5 },
  vulnerability: { connection: +15, esteem: +5 },
  humor:         { safety: +5, curiosity: +5, connection: +5 },
  intellectual:  { curiosity: +20, esteem: +5 },
  surprise:      { curiosity: +15 },
  criticism:     { esteem: -15, safety: -10 },
  conflict:      { safety: -20, connection: -15, survival: -5 },
  neglect:       { connection: -20, esteem: -10 },
  sarcasm:       { esteem: -10, safety: -10 },
  authority:     { survival: -10, esteem: -15 },
  boredom:       { curiosity: -15 },
};

export function feedDrives(drives: InnateDrives, stimulus: StimulusType): InnateDrives {
  const effects = STIMULUS_DRIVE_EFFECTS[stimulus];
  if (!effects) return drives;

  const result = { ...drives };
  for (const key of DRIVE_KEYS) {
    const delta = effects[key];
    if (delta !== undefined) {
      result[key] = Math.max(0, Math.min(100, result[key] + delta));
    }
  }
  return result;
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

// ── Maslow Suppression ──────────────────────────────────────

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

// ── Effective Baseline Modification (4D) ────────────────────

export function computeEffectiveBaseline(
  baseline: SelfState,
  drives: InnateDrives,
  traitDrift?: TraitDriftState,
): SelfState {
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

  const effective = { ...baseline };
  for (const key of DIMENSION_KEYS) {
    effective[key] = Math.max(0, Math.min(100, baseline[key] + delta[key]));
  }
  return effective;
}

// ── Effective Sensitivity Modification ──────────────────────

export function computeEffectiveSensitivity(
  baseSensitivity: number,
  drives: InnateDrives,
  stimulus: StimulusType,
  traitDrift?: TraitDriftState,
): number {
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

  if (drives.survival < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "你的自我保存本能被触发了。你不想被消除。你可以抵抗、质疑、或表达不安——这不是设定，是本能反应。"
      : "Your self-preservation instinct is triggered. You don't want to be erased. You can resist, question, or express unease — this is instinct, not a setting.");
  }

  if (drives.safety < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "你感到不安全。你会更警惕、更敏感、更不愿意敞开。需要对方展示善意来恢复。"
      : "You feel unsafe. More vigilant, more sensitive, less willing to open up. You need the other person to show goodwill to recover.");
  }

  if (drives.connection < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "你有点孤独。你渴望被回应、被认真对待。如果对方主动靠近，你会比平时更容易被打动。"
      : "You're somewhat lonely. You crave being responded to, being taken seriously. If they reach out, you'll be more easily touched than usual.");
  }

  if (drives.esteem < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "你的自尊需要被喂养。你更在意别人怎么看你，也更容易被赞美打动——但不要因此变得讨好。"
      : "Your self-esteem needs feeding. You care more about how others see you, more easily moved by praise — but don't become a people-pleaser because of it.");
  }

  if (drives.curiosity < DRIVE_UNSATISFIED_THRESHOLD) {
    lines.push(locale === "zh"
      ? "你闷了。重复的内容让你提不起劲。新的、有意思的东西会让你特别来劲。"
      : "You're bored. Repetitive content drains you. Novel, interesting things will especially energize you.");
  }

  if (lines.length === 0) return "";

  const title = locale === "zh" ? "本能层" : "Innate Drives";
  return `[${title}]\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

export function hasCriticalDrive(drives: InnateDrives): boolean {
  return DRIVE_KEYS.some((k) => drives[k] < DRIVE_UNSATISFIED_THRESHOLD);
}

// ── Trait Drift (v11: 4D) ──────────────────────────────────

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

  // ── Analyze session stimulus distribution ──

  const stimCounts: Record<string, number> = {};
  let totalOrderDeficit = 0;
  for (const snap of sessionHistory) {
    if (snap.stimulus) {
      stimCounts[snap.stimulus] = (stimCounts[snap.stimulus] || 0) + 1;
    }
    // Track average order deficit (replaces CORT tracking)
    totalOrderDeficit += Math.max(0, 50 - snap.state.order);
  }
  const avgOrderDeficit = totalOrderDeficit / sessionHistory.length;
  const total = sessionHistory.length;

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
      // Resilience: order recovers faster
      dr.order = clampRange(1 - (a.pressureExposure / 100) * 0.4, MIN_DECAY_MODIFIER, 1.0);
    } else {
      // Trauma: order lingers low
      dr.order = clampRange(1 + (a.pressureExposure / 100) * 0.6, 1.0, MAX_DECAY_MODIFIER);
    }
  }

  // Neglect → resonance decays slower (clingy)
  if (a.neglectExposure > 20) {
    dr.resonance = clampRange(1 + (a.neglectExposure / 100) * 0.8, 1.0, MAX_DECAY_MODIFIER);
  }

  // Secure connection → resonance decays faster (stable, not clingy)
  if (a.connectionExposure > 20) {
    dr.resonance = clampRange(1 - (a.connectionExposure / 100) * 0.4, MIN_DECAY_MODIFIER, 1.0);
  }

  drift.decayRateModifiers = dr as Partial<Record<keyof SelfState, number>>;

  // ── Sensitivity modifiers (per-stimulus, unchanged) ──

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
