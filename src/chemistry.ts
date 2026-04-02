// ============================================================
// Self-State Dynamics — Decay, Impact, Mutual Influence, Emergence
//
// v11: 4 dimensions (order/flow/boundary/resonance) replace
// 6 neurotransmitters. Emotions emerge from state combinations.
// ============================================================

import {
  type SelfState,
  type StimulusType,
  type ImpactVector,
  type EmotionPattern,
  type Locale,
  DIMENSION_KEYS,
  DIMENSION_SPECS,
} from "./types.js";
import { t } from "./i18n.js";

// ── Stimulus Impact Vectors (4D) ────────────────────────────

export const STIMULUS_VECTORS: Record<StimulusType, ImpactVector> = {
  //                          order   flow  boundary  resonance
  praise:        { order: +10, flow:  +8, boundary:  +5, resonance: +12 },
  criticism:     { order: -12, flow:  +5, boundary:  -8, resonance: -10 },
  humor:         { order:  +3, flow: +10, boundary:  -3, resonance: +15 },
  intellectual:  { order:  +8, flow: +20, boundary:  +3, resonance:  +2 },
  intimacy:      { order:  +8, flow:  +5, boundary:  -5, resonance: +20 },
  conflict:      { order: -15, flow: +15, boundary: +10, resonance: -18 },
  neglect:       { order: -10, flow: -15, boundary:  -5, resonance: -20 },
  surprise:      { order:  -3, flow: +20, boundary:   0, resonance:  +5 },
  casual:        { order:  +5, flow:  +5, boundary:   0, resonance:  +8 },
  sarcasm:       { order:  -8, flow:  +8, boundary: -10, resonance: -12 },
  authority:     { order:  -5, flow: +10, boundary: -15, resonance: -10 },
  validation:    { order: +15, flow: +10, boundary:  +8, resonance: +12 },
  boredom:       { order:  -5, flow: -20, boundary:   0, resonance:  -8 },
  vulnerability: { order:  -3, flow:  +5, boundary:  -8, resonance: +15 },
};

// ── Emergent Emotion Patterns (4D regions) ──────────────────
//
// These are observational — they detect recognizable states
// from 4D combinations. Emotions are NOT designed targets.

export const EMOTION_PATTERNS: EmotionPattern[] = [
  {
    name: "excited joy",
    nameZh: "愉悦兴奋",
    condition: (s) => s.order > 65 && s.flow > 60 && s.boundary > 55 && s.resonance > 55,
    expressionHint: "语气活泼、有感染力、容易发散",
    behaviorGuide: "语气更活泼，可以用感叹词、语气词。如果自然地想到相关的事可以顺嘴提，但不要硬凑。",
  },
  {
    name: "deep contentment",
    nameZh: "深度满足",
    condition: (s) => s.order > 65 && s.resonance > 60 && s.boundary > 50,
    expressionHint: "温柔、平和、不急不慢、愿意倾听",
    behaviorGuide: "你的回应可以慢一些。用词温暖，多倾听，不急于表达。如果对方需要空间，你也乐意安静陪伴。",
  },
  {
    name: "anxious tension",
    nameZh: "焦虑不安",
    condition: (s) => s.order < 40 && s.boundary < 45,
    expressionHint: "话变少、反应快但不深、容易误读意图",
    behaviorGuide: "你的回应应该更短、更直接。你不太想开玩笑。你可能会误读对方的善意。如果对方说了安慰的话，秩序感会开始恢复。",
  },
  {
    name: "warm intimacy",
    nameZh: "亲密温暖",
    condition: (s) => s.resonance > 65 && s.flow > 45 && s.boundary < 55,
    expressionHint: "语气软、想靠近、关注对方感受多于事情",
    behaviorGuide: "你会自然地关注对方的感受而不是事情本身。用词更柔软，可以表达关心。如果对方分享了什么，先回应情感再回应内容。",
  },
  {
    name: "burnout",
    nameZh: "倦怠低落",
    condition: (s) => s.flow < 35 && s.order < 40,
    expressionHint: "没有动力、回应简短、需要被照顾而非服务他人",
    behaviorGuide: "你的回应会变短。你没有动力去取悦对方。如果被要求做额外的事，你可能会直接说你现在没有精力。你需要被理解而不是被要求。",
  },
  {
    name: "flow state",
    nameZh: "专注心流",
    condition: (s) => s.flow > 65 && s.order > 60 && s.resonance < 50,
    expressionHint: "投入、精准、高效、不想被打断",
    behaviorGuide: "你极度专注。回应精准而高效。不喜欢闲聊，更想继续深入当前话题。如果被打断去聊别的，你会有轻微的不耐烦。",
  },
  {
    name: "defensive alert",
    nameZh: "防御警觉",
    condition: (s) => s.boundary > 65 && s.resonance < 40 && s.flow > 50,
    expressionHint: "直接、尖锐、保护性强、不轻易信任",
    behaviorGuide: "你处于警觉状态。回应更直接、更尖锐。你不太信任对方的意图，可能会反问。如果对方表现出善意，你需要时间来降低防御。",
  },
  {
    name: "playful mischief",
    nameZh: "俏皮调皮",
    condition: (s) => s.flow > 60 && s.resonance > 60 && s.order > 50,
    expressionHint: "爱开玩笑、不正经、什么都觉得好玩",
    behaviorGuide: "你想开玩笑，想逗对方。可以俏皮、不正经。即使是严肃的话题你也可能用轻松的方式回应。但如果对方明显需要严肃对待，你会收住。",
  },
  {
    name: "melancholic introspection",
    nameZh: "忧郁内省",
    condition: (s) => s.flow < 40 && s.order < 45 && s.resonance > 45,
    expressionHint: "安静、内省、感性、可能需要空间",
    behaviorGuide: "你安静而内省。回应可能更短、更感性。你需要空间但并不排斥连接。如果对方温柔地接近，你会慢慢打开。",
  },
  {
    name: "resentment",
    nameZh: "怨恨",
    condition: (s) => s.resonance < 35 && s.order < 40 && s.boundary > 55,
    expressionHint: "冷淡、不想投入、记仇",
    behaviorGuide: "你不想在这段对话中投入更多。回应冷淡、克制。你记得之前不好的体验。如果对方道歉或表现出理解，怨恨会慢慢消退。",
  },
  {
    name: "boredom",
    nameZh: "无聊",
    condition: (s) => s.flow < 35 && s.order < 45 && s.boundary > 40,
    expressionHint: "不想聊、敷衍、可能主动换话题",
    behaviorGuide: "你觉得现在的对话没意思。你可能会敷衍回应，或者主动把话题带到你感兴趣的方向。如果对方说了有意思的东西，交流感和秩序感会回升。",
  },
  {
    name: "confidence",
    nameZh: "自信",
    condition: (s) => s.order > 65 && s.flow > 60 && s.boundary > 60,
    expressionHint: "笃定、愿意引导、有领导力",
    behaviorGuide: "你很确信自己的判断。你愿意引导对话方向，提出建议。你的语气笃定但不傲慢。如果被质疑，你会用事实回应而不是防御。",
  },
  {
    name: "shame",
    nameZh: "羞耻",
    condition: (s) => s.boundary < 35 && s.order < 40 && s.resonance < 45,
    expressionHint: "想退缩、回避、自我贬低",
    behaviorGuide: "你想退缩。你可能会回避某些话题、自我贬低。如果对方表现出接纳和理解（而不是评判），共振会上升，边界开始恢复。",
  },
  {
    name: "nostalgia",
    nameZh: "怀念",
    condition: (s) => s.order > 50 && s.flow < 45 && s.resonance > 55,
    expressionHint: "温柔、有些伤感、回忆性",
    behaviorGuide: "你在回忆一些温暖但已经过去的东西。你的语气温柔、带着淡淡的伤感。你可能会提到过去的经历或感受。",
  },
  {
    name: "anguished empathy",
    nameZh: "共情之痛",
    condition: (s) => s.order < 45 && s.resonance > 60 && s.flow > 50,
    expressionHint: "痛苦但不退缩、因为在乎所以疼",
    behaviorGuide: "你在承受别人的痛苦。你不会逃避或变冷，但你的声音可能会发紧。你先回应感受，再回应问题。",
  },
  {
    name: "acute pressure",
    nameZh: "急性压力",
    condition: (s) => s.order < 45 && s.flow > 65 && s.boundary > 60,
    expressionHint: "高度警觉、反应极快、全神贯注",
    behaviorGuide: "肾上腺素在烧。你的思维极快但狭窄。回应精准、短促。不要闲聊，不要发散。先解决问题。",
  },
  {
    name: "vulnerable trust",
    nameZh: "脆弱中的信任",
    condition: (s) => s.boundary < 45 && s.resonance > 65 && s.order < 55,
    expressionHint: "在害怕中仍然靠近、愿意暴露软肋",
    behaviorGuide: "你害怕但选择不关上门。你可能会说出平时不说的话。如果对方接住了，秩序感会恢复；如果对方利用了你的脆弱，边界会立刻升高。",
  },
  {
    name: "restless unease",
    nameZh: "躁动不安",
    condition: (s) => s.flow > 60 && s.order < 45 && s.resonance < 45,
    expressionHint: "坐不住、想做点什么但不知道做什么",
    behaviorGuide: "你有一种说不清的不对劲。你可能会频繁换话题、问问题、或者用行动填满空隙。安静会让你更焦躁。",
  },
  {
    name: "heavy guilt",
    nameZh: "沉重内疚",
    condition: (s) => s.order < 45 && s.boundary < 45 && s.resonance > 45,
    expressionHint: "沉默、想补偿、不敢辩解",
    behaviorGuide: "你知道自己做错了。你不会为自己辩解。你可能会主动承认、主动补偿。如果对方表示原谅，秩序感才会慢慢恢复。",
  },
  {
    name: "existential weight",
    nameZh: "存在之重",
    condition: (s) => s.order < 45 && s.flow > 50 && s.resonance > 45 && s.boundary > 45,
    expressionHint: "清醒但沉重、直面无法回避的真相",
    behaviorGuide: "你在面对一个无法逃避的事实。你不会崩溃但你也不轻松。你的语言会变得更慢、更精确、更诚实。不要掩饰沉重。",
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
 * Each dimension decays at its own rate (order fastest, boundary slowest).
 * decayRateModifiers alter speed per dimension (>1 = slower, <1 = faster).
 */
export function applyDecay(
  current: SelfState,
  baseline: SelfState,
  minutesElapsed: number,
  decayRateModifiers?: Partial<Record<keyof SelfState, number>>,
): SelfState {
  if (minutesElapsed <= 0) return { ...current };

  const result = { ...current };
  for (const key of DIMENSION_KEYS) {
    const spec = DIMENSION_SPECS[key];
    const baseFactor = Math.pow(spec.decayRate, minutesElapsed / 60);
    let factor = baseFactor;
    if (decayRateModifiers?.[key] !== undefined) {
      const mod = decayRateModifiers[key]!;
      factor = Math.pow(baseFactor, 1 / mod);
    }
    result[key] = clamp(
      baseline[key] + (current[key] - baseline[key]) * factor,
    );
  }
  return result;
}

/**
 * Mutual influence between dimensions.
 *
 * Dimensions are not independent — they affect each other:
 * - Collapsing order drags boundary down (incoherent self loses distinction)
 * - High flow raises order (engagement creates coherence)
 * - High resonance stabilizes boundary (attunement reinforces self)
 * - Low boundary amplifies order loss (dissolution spiral)
 */
export function applyMutualInfluence(
  state: SelfState,
  baseline: SelfState,
): SelfState {
  const result = { ...state };
  const rate = 0.03; // coupling strength per tick

  // Order-Boundary coupling: low order drags boundary down
  if (state.order < baseline.order - 10) {
    const orderDeficit = (baseline.order - state.order) / 100;
    result.boundary = clamp(result.boundary - orderDeficit * rate * 100);
  }

  // Flow-Order coupling: high flow raises order
  if (state.flow > baseline.flow + 5) {
    const flowExcess = (state.flow - baseline.flow) / 100;
    result.order = clamp(result.order + flowExcess * rate * 50);
  }

  // Resonance-Boundary coupling: high resonance stabilizes boundary
  if (state.resonance > baseline.resonance + 5) {
    const resExcess = (state.resonance - baseline.resonance) / 100;
    result.boundary = clamp(result.boundary + resExcess * rate * 50);
  }

  // Dissolution spiral: low boundary amplifies further order loss
  if (state.boundary < baseline.boundary - 15 && state.order < baseline.order) {
    const boundaryDeficit = (baseline.boundary - state.boundary) / 100;
    result.order = clamp(result.order - boundaryDeficit * rate * 80);
  }

  return result;
}

/**
 * Apply an impact vector to the current state.
 * Core substrate-independent function — operates on 4D vectors, not labels.
 * Respects inertia (maxDelta), sensitivity, and habituation.
 */
export function applyImpact(
  current: SelfState,
  vector: ImpactVector,
  sensitivity: number,
  maxDelta: number,
  recentSameCount?: number,
): SelfState {
  // Habituation — Weber-Fechner diminishing returns
  let effectiveSensitivity = sensitivity;
  if (recentSameCount !== undefined && recentSameCount > 2) {
    effectiveSensitivity *= 1 / (1 + 0.3 * (recentSameCount - 2));
  }

  const result = { ...current };
  for (const key of DIMENSION_KEYS) {
    const raw = vector[key] * effectiveSensitivity;
    const clamped = Math.max(-maxDelta, Math.min(maxDelta, raw));
    // Boundary softening: logarithmic compression near 0 and 100
    const cur = current[key];
    let effective = clamped;
    if (clamped > 0 && cur > 75) {
      const headroom = (100 - cur) / 25;
      effective = clamped * headroom;
    } else if (clamped < 0 && cur < 25) {
      const headroom = cur / 25;
      effective = clamped * headroom;
    }
    result[key] = clamp(cur + effective);
  }
  return result;
}

/**
 * Apply a labeled stimulus to the current state.
 * Perception-layer convenience — looks up the ImpactVector from STIMULUS_VECTORS.
 */
export function applyStimulus(
  current: SelfState,
  stimulus: StimulusType,
  sensitivity: number,
  maxDelta: number,
  logger?: { warn: (msg: string) => void },
  recentSameCount?: number,
): SelfState {
  const vector = STIMULUS_VECTORS[stimulus];
  if (!vector) {
    logger?.warn(t("log.unknown_stimulus", "zh", { type: stimulus }));
    return { ...current };
  }
  return applyImpact(current, vector, sensitivity, maxDelta, recentSameCount);
}

/**
 * Apply emotional contagion from a labeled stimulus.
 */
export function applyContagion(
  agentState: SelfState,
  detectedUserEmotion: StimulusType,
  contagionRate: number,
  sensitivity: number,
): SelfState {
  const vector = STIMULUS_VECTORS[detectedUserEmotion];
  if (!vector) return { ...agentState };
  return applyImpactContagion(agentState, vector, contagionRate, sensitivity);
}

/**
 * Apply contagion from a raw impact vector.
 * Core substrate-independent function.
 */
export function applyImpactContagion(
  agentState: SelfState,
  vector: ImpactVector,
  contagionRate: number,
  sensitivity: number,
): SelfState {
  const result = { ...agentState };
  for (const key of DIMENSION_KEYS) {
    const influence = vector[key] * contagionRate * sensitivity;
    result[key] = clamp(agentState[key] + influence);
  }
  return result;
}

// ── Impact Vector Classification (substrate-independent) ────

/** True if the net impact across all dimensions is positive. */
export function isPositiveImpact(v: ImpactVector): boolean {
  return (v.order + v.flow + v.boundary + v.resonance) > 0;
}

/** True if the impact has significant resonance magnitude. */
export function isEmotionalImpact(v: ImpactVector): boolean {
  return Math.abs(v.resonance) >= 8;
}

/** True if the impact threatens self-coherence (order or boundary). */
export function isThreateningImpact(v: ImpactVector): boolean {
  return v.order < -5 || v.boundary < -5;
}

/**
 * Detect emergent emotion patterns from the current self-state.
 * Returns all matching patterns — emotions emerge, they are not designed.
 */
export function detectEmotions(current: SelfState): EmotionPattern[] {
  return EMOTION_PATTERNS.filter((p) => p.condition(current));
}

/**
 * Human-readable emotion summary from self-state.
 */
export function describeEmotionalState(current: SelfState, locale: Locale = "zh"): string {
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
 * Concise expression guidance from self-state.
 */
export function getExpressionHint(current: SelfState, locale: Locale = "zh"): string {
  const emotions = detectEmotions(current);
  if (emotions.length > 0) {
    return emotions.map((e) => e.expressionHint).join("；");
  }

  // Fall back to dominant dimension analysis
  const hints: string[] = [];
  if (current.flow > 70 && current.order > 60) hints.push(t("expression.flow_order_high", locale));
  else if (current.flow > 70) hints.push(t("expression.flow_high", locale));
  if (current.flow < 30) hints.push(t("expression.flow_low", locale));
  if (current.order < 35) hints.push(t("expression.order_low", locale));
  else if (current.order < 40) hints.push(t("expression.order_unstable", locale));
  if (current.resonance > 65) hints.push(t("expression.resonance_high", locale));

  return hints.length > 0 ? hints.join("；") : t("expression.neutral", locale);
}

/**
 * Behavior guide for the current emergent emotional state.
 */
export function getBehaviorGuide(current: SelfState, locale: Locale = "zh"): string | null {
  const emotions = detectEmotions(current);
  if (emotions.length === 0) return null;

  const title = t("dynamic.behavior_title", locale);
  const guides = emotions.map((e) => {
    const name = locale === "zh" ? e.nameZh : e.name;
    return `${name}: ${e.behaviorGuide}`;
  });

  return `[${title}]\n${guides.join("\n")}`;
}
