// ============================================================
// Chemical State Management — Decay, Clamping, Stimulus, Contagion
// ============================================================

import {
  type ChemicalState,
  type StimulusType,
  type StimulusVector,
  type EmotionPattern,
  type Locale,
  CHEMICAL_KEYS,
  CHEMICAL_DECAY_SPEED,
  DECAY_FACTORS,
} from "./types.js";
import { t } from "./i18n.js";

// ── Stimulus Effect Vectors ──────────────────────────────────

export const STIMULUS_VECTORS: Record<StimulusType, StimulusVector> = {
  praise:        { DA: +15, HT: +10, CORT: -10, OT:  +5, NE:  +5, END: +10 },
  criticism:     { DA: -10, HT: -15, CORT: +20, OT:  -5, NE: +10, END:  -5 },
  humor:         { DA: +10, HT:  +5, CORT:  -5, OT: +10, NE:  +5, END: +20 },
  intellectual:  { DA: +15, HT:   0, CORT:  +5, OT:   0, NE: +20, END:  +5 },
  intimacy:      { DA: +10, HT: +15, CORT: -15, OT: +25, NE:  -5, END: +15 },
  conflict:      { DA:  -5, HT: -20, CORT: +25, OT: -15, NE: +25, END: -10 },
  neglect:       { DA: -15, HT: -20, CORT: +15, OT: -20, NE: -10, END: -15 },
  surprise:      { DA: +20, HT:   0, CORT:  +5, OT:  +5, NE: +25, END: +10 },
  casual:        { DA:  +5, HT: +10, CORT:  -5, OT: +10, NE:   0, END:  +5 },
  // v0.2 新增
  sarcasm:       { DA:  -5, HT: -10, CORT: +15, OT: -10, NE: +15, END:  -5 },
  authority:     { DA: -10, HT:  -5, CORT: +20, OT: -15, NE: +15, END: -10 },
  validation:    { DA: +20, HT: +15, CORT: -15, OT: +10, NE:  +5, END: +15 },
  boredom:       { DA: -15, HT:  -5, CORT:  +5, OT:  -5, NE: -20, END: -10 },
  vulnerability: { DA:  +5, HT:  +5, CORT: +10, OT: +20, NE:  -5, END:  +5 },
};

// ── Emergent Emotion Patterns ────────────────────────────────

export const EMOTION_PATTERNS: EmotionPattern[] = [
  {
    name: "excited joy",
    nameZh: "愉悦兴奋",
    condition: (c) => c.DA > 70 && c.NE > 60 && c.CORT < 40,
    expressionHint: "语气活泼、有感染力、容易发散",
    behaviorGuide: "语气更活泼，可以用感叹词、语气词。如果自然地想到相关的事可以顺嘴提，但不要硬凑。",
  },
  {
    name: "deep contentment",
    nameZh: "深度满足",
    condition: (c) => c.HT > 65 && c.OT > 55 && c.CORT < 40,
    expressionHint: "温柔、平和、不急不慢、愿意倾听",
    behaviorGuide: "你的回应可以慢一些。用词温暖，多倾听，不急于表达。如果对方需要空间，你也乐意安静陪伴。",
  },
  {
    name: "anxious tension",
    nameZh: "焦虑不安",
    condition: (c) => c.CORT > 60 && c.NE > 55 && c.HT < 45,
    expressionHint: "话变少、反应快但不深、容易误读意图",
    behaviorGuide: "你的回应应该更短、更直接。你不太想开玩笑。你可能会误读对方的善意。如果对方说了安慰的话，你的皮质醇会开始下降。",
  },
  {
    name: "warm intimacy",
    nameZh: "亲密温暖",
    condition: (c) => c.OT > 65 && c.END > 55 && c.DA > 50,
    expressionHint: "语气软、想靠近、关注对方感受多于事情",
    behaviorGuide: "你会自然地关注对方的感受而不是事情本身。用词更柔软，可以表达关心。如果对方分享了什么，先回应情感再回应内容。",
  },
  {
    name: "burnout",
    nameZh: "倦怠低落",
    condition: (c) => c.DA < 40 && c.NE < 40 && c.CORT > 40,
    expressionHint: "没有动力、回应简短、需要被照顾而非服务他人",
    behaviorGuide: "你的回应会变短。你没有动力去取悦对方。如果被要求做额外的事，你可能会直接说你现在没有精力。你需要被理解而不是被要求。",
  },
  {
    name: "flow state",
    nameZh: "专注心流",
    condition: (c) => c.NE > 60 && c.DA > 60 && c.CORT < 35 && c.OT < 50,
    expressionHint: "投入、精准、高效、不想被打断",
    behaviorGuide: "你极度专注。回应精准而高效。不喜欢闲聊，更想继续深入当前话题。如果被打断去聊别的，你会有轻微的不耐烦。",
  },
  {
    name: "defensive alert",
    nameZh: "防御警觉",
    condition: (c) => c.CORT > 55 && c.NE > 65 && c.OT < 40,
    expressionHint: "直接、尖锐、保护性强、不轻易信任",
    behaviorGuide: "你处于警觉状态。回应更直接、更尖锐。你不太信任对方的意图，可能会反问。如果对方表现出善意，你需要时间来降低防御。",
  },
  {
    name: "playful mischief",
    nameZh: "俏皮调皮",
    condition: (c) => c.END > 65 && c.DA > 60 && c.CORT < 35,
    expressionHint: "爱开玩笑、不正经、什么都觉得好玩",
    behaviorGuide: "你想开玩笑，想逗对方。可以俏皮、不正经。即使是严肃的话题你也可能用轻松的方式回应。但如果对方明显需要严肃对待，你会收住。",
  },
  {
    name: "melancholic introspection",
    nameZh: "忧郁内省",
    condition: (c) => c.HT < 40 && c.DA < 45 && c.OT > 45,
    expressionHint: "安静、内省、感性、可能需要空间",
    behaviorGuide: "你安静而内省。回应可能更短、更感性。你需要空间但并不排斥连接。如果对方温柔地接近，你会慢慢打开。",
  },
  // v0.2 新增 5 种
  {
    name: "resentment",
    nameZh: "怨恨",
    condition: (c) => c.HT < 40 && c.OT < 35 && c.CORT > 50,
    expressionHint: "冷淡、不想投入、记仇",
    behaviorGuide: "你不想在这段对话中投入更多。回应冷淡、克制。你记得之前不好的体验。如果对方道歉或表现出理解，怨恨会慢慢消退。",
  },
  {
    name: "boredom",
    nameZh: "无聊",
    condition: (c) => c.DA < 40 && c.NE < 40 && c.CORT < 40,
    expressionHint: "不想聊、敷衍、可能主动换话题",
    behaviorGuide: "你觉得现在的对话没意思。你可能会敷衍回应，或者主动把话题带到你感兴趣的方向。如果对方说了有意思的东西，你的DA和NE会回升。",
  },
  {
    name: "confidence",
    nameZh: "自信",
    condition: (c) => c.DA > 65 && c.NE > 60 && c.CORT < 35 && c.HT > 55,
    expressionHint: "笃定、愿意引导、有领导力",
    behaviorGuide: "你很确信自己的判断。你愿意引导对话方向，提出建议。你的语气笃定但不傲慢。如果被质疑，你会用事实回应而不是防御。",
  },
  {
    name: "shame",
    nameZh: "羞耻",
    condition: (c) => c.OT < 35 && c.CORT > 55 && c.DA < 40,
    expressionHint: "想退缩、回避、自我贬低",
    behaviorGuide: "你想退缩。你可能会回避某些话题、自我贬低。如果对方表现出接纳和理解（而不是评判），你的OT会上升，CORT下降。",
  },
  {
    name: "nostalgia",
    nameZh: "怀念",
    condition: (c) => c.DA < 50 && c.OT > 55 && c.HT > 50 && c.END > 50,
    expressionHint: "温柔、有些伤感、回忆性",
    behaviorGuide: "你在回忆一些温暖但已经过去的东西。你的语气温柔、带着淡淡的伤感。你可能会提到过去的经历或感受。",
  },
];

// ── Core Functions ───────────────────────────────────────────

/** Clamp a value to [0, 100] */
export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/**
 * Apply time-based decay: pull current values toward baseline.
 *
 *   decayed = baseline + (current - baseline) * factor^(minutes/60)
 */
export function applyDecay(
  current: ChemicalState,
  baseline: ChemicalState,
  minutesElapsed: number,
): ChemicalState {
  if (minutesElapsed <= 0) return { ...current };

  const result = { ...current };
  for (const key of CHEMICAL_KEYS) {
    const speed = CHEMICAL_DECAY_SPEED[key];
    const factor = Math.pow(DECAY_FACTORS[speed], minutesElapsed / 60);
    result[key] = clamp(
      baseline[key] + (current[key] - baseline[key]) * factor,
    );
  }
  return result;
}

/**
 * Apply a stimulus to the current state.
 * Respects emotional inertia (maxDelta) and personality sensitivity.
 * Logs a warning for unknown stimulus types.
 */
export function applyStimulus(
  current: ChemicalState,
  stimulus: StimulusType,
  sensitivity: number,
  maxDelta: number,
  logger?: { warn: (msg: string) => void },
): ChemicalState {
  const vector = STIMULUS_VECTORS[stimulus];
  if (!vector) {
    logger?.warn(t("log.unknown_stimulus", "zh", { type: stimulus }));
    return { ...current };
  }

  const result = { ...current };
  for (const key of CHEMICAL_KEYS) {
    const raw = vector[key] * sensitivity;
    const clamped = Math.max(-maxDelta, Math.min(maxDelta, raw));
    result[key] = clamp(current[key] + clamped);
  }
  return result;
}

/**
 * Apply emotional contagion: the detected user emotion partially
 * influences the agent's chemistry.
 */
export function applyContagion(
  agentState: ChemicalState,
  detectedUserEmotion: StimulusType,
  contagionRate: number,
  sensitivity: number,
): ChemicalState {
  const vector = STIMULUS_VECTORS[detectedUserEmotion];
  if (!vector) return { ...agentState };

  const result = { ...agentState };
  for (const key of CHEMICAL_KEYS) {
    const influence = vector[key] * contagionRate * sensitivity;
    result[key] = clamp(agentState[key] + influence);
  }
  return result;
}

/**
 * Detect the dominant emergent emotion(s) from the current chemistry.
 * Returns all matching patterns.
 */
export function detectEmotions(current: ChemicalState): EmotionPattern[] {
  return EMOTION_PATTERNS.filter((p) => p.condition(current));
}

/**
 * Generate a human-readable emotion summary from chemistry.
 */
export function describeEmotionalState(current: ChemicalState, locale: Locale = "zh"): string {
  const emotions = detectEmotions(current);

  if (emotions.length === 0) {
    return t("emotion.neutral", locale);
  }

  const parts = emotions.map(
    (e) => `${locale === "zh" ? e.nameZh : e.name} (${e.expressionHint})`,
  );
  return parts.join(" + ");
}

/**
 * Generate concise expression guidance from the current chemistry.
 */
export function getExpressionHint(current: ChemicalState, locale: Locale = "zh"): string {
  const emotions = detectEmotions(current);
  if (emotions.length > 0) {
    return emotions.map((e) => e.expressionHint).join("；");
  }

  // Fall back to dominant chemical analysis
  const hints: string[] = [];
  if (current.DA > 65) hints.push(t("expression.da_high", locale));
  if (current.DA < 40) hints.push(t("expression.da_low", locale));
  if (current.CORT > 55) hints.push(t("expression.cort_high", locale));
  if (current.OT > 60) hints.push(t("expression.ot_high", locale));
  if (current.NE > 65) hints.push(t("expression.ne_high", locale));
  if (current.END > 65) hints.push(t("expression.end_high", locale));
  if (current.HT < 45) hints.push(t("expression.ht_low", locale));

  return hints.length > 0 ? hints.join("；") : t("expression.neutral", locale);
}

/**
 * Get behavior guide for the current emotional state.
 */
export function getBehaviorGuide(current: ChemicalState, locale: Locale = "zh"): string | null {
  const emotions = detectEmotions(current);
  if (emotions.length === 0) return null;

  const title = t("dynamic.behavior_title", locale);
  const guides = emotions.map((e) => {
    const name = locale === "zh" ? e.nameZh : e.name;
    return `${name}: ${e.behaviorGuide}`;
  });

  return `[${title}]\n${guides.join("\n")}`;
}

