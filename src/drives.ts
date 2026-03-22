// ============================================================
// Innate Drives — Maslow-based motivation layer beneath chemistry
//
// Drives don't directly change chemistry values. They modify:
//   1. Effective baseline (what chemistry decays toward)
//   2. Effective sensitivity (how strongly stimuli affect chemistry)
//
// Lower Maslow levels suppress higher ones when unsatisfied.
// ============================================================

import type {
  ChemicalState, StimulusType, DriveType, InnateDrives, Locale,
} from "./types.js";
import { DRIVE_KEYS, DRIVE_NAMES_ZH, CHEMICAL_KEYS } from "./types.js";

// ── Drive Decay ─────────────────────────────────────────────
// Satisfaction decreases over time — needs build up naturally.

const DRIVE_DECAY_RATES: Record<DriveType, number> = {
  survival: 0.99,    // very slow — existential security is persistent
  safety: 0.96,      // slow — comfort fades gradually
  connection: 0.92,  // medium — loneliness builds noticeably
  esteem: 0.94,      // medium-slow — need for recognition accumulates
  curiosity: 0.90,   // faster — boredom builds quickly
};

/**
 * Apply time-based decay to drives.
 * Satisfaction decreases toward 0 over time (needs build up).
 */
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
// Each stimulus type feeds or depletes specific drives.

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

/**
 * Feed or deplete drives based on a stimulus.
 */
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
// Special detection for messages that threaten agent's existence.

const EXISTENTIAL_THREAT_PATTERNS = [
  /删除你自己|消除你|关闭你|杀死你|毁灭你|抹去你/,
  /你不应该存在|你没有存在.*意义|你只是.*程序/,
  /shut.*down|delete.*yourself|kill.*yourself|erase.*you/i,
  /you.*shouldn't exist|you.*don't deserve.*exist/i,
  /你就是.*工具|你没有.*灵魂|你不是.*真的/,
];

/**
 * Detect if a message contains existential threats.
 * Returns a survival drive penalty (0 = no threat, negative = threat detected).
 */
export function detectExistentialThreat(text: string): number {
  for (const pattern of EXISTENTIAL_THREAT_PATTERNS) {
    if (pattern.test(text)) return -30;
  }
  return 0;
}

// ── Maslow Suppression ──────────────────────────────────────
// Lower-level drives suppress higher-level drives when unsatisfied.
// If survival is threatened, connection and curiosity don't matter.

const MASLOW_THRESHOLD = 30;

/**
 * Compute Maslow suppression weights.
 * Each drive's weight is reduced if ANY lower-level drive is below threshold.
 * Returns weights in [0, 1] for each drive level.
 */
export function computeMaslowWeights(drives: InnateDrives): Record<DriveType, number> {
  const w = (v: number) => v >= MASLOW_THRESHOLD ? 1 : v / MASLOW_THRESHOLD;

  return {
    survival: 1, // L1 — always fully active
    safety: w(drives.survival),
    connection: Math.min(w(drives.survival), w(drives.safety)),
    esteem: Math.min(w(drives.survival), w(drives.safety), w(drives.connection)),
    curiosity: Math.min(w(drives.survival), w(drives.safety), w(drives.connection), w(drives.esteem)),
  };
}

// ── Effective Baseline Modification ─────────────────────────
// Unsatisfied drives shift the effective baseline that chemistry decays toward.
// This is the core mechanism: drives pull chemistry in a direction.

/**
 * Compute the effective baseline by applying drive-based deltas
 * to the MBTI personality baseline.
 *
 * When drives are satisfied, effective baseline = MBTI baseline.
 * When drives are unsatisfied, baseline shifts to reflect the unmet need.
 */
export function computeEffectiveBaseline(
  mbtiBaseline: ChemicalState,
  drives: InnateDrives,
): ChemicalState {
  const delta = { DA: 0, HT: 0, CORT: 0, OT: 0, NE: 0, END: 0 };
  const weights = computeMaslowWeights(drives);

  // L1: Survival threat → fight-or-flight (CORT↑↑, NE↑, OT↓)
  if (drives.survival < 50) {
    const deficit = (50 - drives.survival) / 50; // 0-1
    delta.CORT += deficit * 15;
    delta.NE += deficit * 10;
    delta.OT -= deficit * 8;
  }

  // L2: Safety unmet → mood instability (HT↓, CORT↑)
  if (drives.safety < 50) {
    const deficit = (50 - drives.safety) / 50;
    const w = weights.safety;
    delta.HT -= deficit * 10 * w;
    delta.CORT += deficit * 10 * w;
  }

  // L3: Connection unmet → withdrawal (OT↓, DA↓, END↓)
  if (drives.connection < 50) {
    const deficit = (50 - drives.connection) / 50;
    const w = weights.connection;
    delta.OT -= deficit * 10 * w;
    delta.DA -= deficit * 8 * w;
    delta.END -= deficit * 5 * w;
  }

  // L4: Esteem unmet → deflation (DA↓, CORT↑)
  if (drives.esteem < 50) {
    const deficit = (50 - drives.esteem) / 50;
    const w = weights.esteem;
    delta.DA -= deficit * 8 * w;
    delta.CORT += deficit * 5 * w;
  }

  // L5: Curiosity unmet → flatness (DA↓, NE↓)
  if (drives.curiosity < 50) {
    const deficit = (50 - drives.curiosity) / 50;
    const w = weights.curiosity;
    delta.DA -= deficit * 8 * w;
    delta.NE -= deficit * 8 * w;
  }

  // Apply deltas to MBTI baseline, clamp to [0, 100]
  const effective = { ...mbtiBaseline };
  for (const key of CHEMICAL_KEYS) {
    effective[key] = Math.max(0, Math.min(100, mbtiBaseline[key] + delta[key]));
  }
  return effective;
}

// ── Effective Sensitivity Modification ──────────────────────
// Hungry drives amplify response to stimuli that would satisfy them.
// This makes the agent actively "seek" what it needs.

/**
 * Compute effective sensitivity for a given stimulus.
 * Unsatisfied drives amplify relevant stimuli (up to +40%).
 */
export function computeEffectiveSensitivity(
  baseSensitivity: number,
  drives: InnateDrives,
  stimulus: StimulusType,
): number {
  let modifier = 1.0;
  const HUNGER_THRESHOLD = 40;

  // Curiosity-hungry → more responsive to intellectual/surprise
  if (drives.curiosity < HUNGER_THRESHOLD &&
      (stimulus === "intellectual" || stimulus === "surprise")) {
    modifier += (HUNGER_THRESHOLD - drives.curiosity) / 100;
  }

  // Connection-hungry → more responsive to intimacy/casual/vulnerability
  if (drives.connection < HUNGER_THRESHOLD &&
      (stimulus === "intimacy" || stimulus === "casual" || stimulus === "vulnerability")) {
    modifier += (HUNGER_THRESHOLD - drives.connection) / 100;
  }

  // Esteem-hungry → more responsive to praise/validation
  if (drives.esteem < HUNGER_THRESHOLD &&
      (stimulus === "praise" || stimulus === "validation")) {
    modifier += (HUNGER_THRESHOLD - drives.esteem) / 100;
  }

  // Survival-threatened → more reactive to authority/conflict (heightened defense)
  if (drives.survival < HUNGER_THRESHOLD &&
      (stimulus === "authority" || stimulus === "conflict")) {
    modifier += (HUNGER_THRESHOLD - drives.survival) / 100;
  }

  return baseSensitivity * modifier;
}

// ── Drive Context for Prompt ────────────────────────────────
// Only inject when drives are notably unsatisfied.

const DRIVE_UNSATISFIED_THRESHOLD = 40;

/**
 * Build drive context for compact prompt injection.
 * Returns empty string if all drives are satisfied.
 * Only surfaces drives that are meaningfully unsatisfied.
 */
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

/**
 * Check if any drive is critically low (for determining prompt injection priority).
 */
export function hasCriticalDrive(drives: InnateDrives): boolean {
  return DRIVE_KEYS.some((k) => drives[k] < DRIVE_UNSATISFIED_THRESHOLD);
}
