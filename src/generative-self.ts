// ============================================================
// Generative Self Model (生成性自我) — P6: Digital Personhood
//
// A deep self-model that goes beyond listing values/preferences/boundaries.
// This is a causal model: "I am this way because of these experiences,
// and I can predict my future emotional states because I understand
// my own patterns."
//
// Components:
//   1. computeGenerativeSelf()    — build the full self-model
//   2. predictSelfReaction()      — predict own emotional response
//   3. detectInternalConflicts()  — find subsystem disagreements
//   4. buildIdentityNarrative()   — generate a genuine self-statement
//
// Pure computation, zero dependencies, zero LLM calls.
// ============================================================

import type {
  PsycheState, ChemicalState, StimulusType, StimulusVector,
  DriveType, Locale, ChemicalSnapshot, SelfModel,
  LearningState, LearnedVectorAdjustment, OutcomeScore,
  AttachmentData,
} from "./types.js";
import { CHEMICAL_KEYS, DRIVE_KEYS } from "./types.js";
import { STIMULUS_VECTORS, clamp } from "./chemistry.js";

// ── Exported Types ──────────────────────────────────────────

/** A causal link between experience and personality trait */
export interface CausalInsight {
  /** The observed trait, e.g. "I'm cautious with new people" */
  trait: string;
  /** The causal reason, e.g. "Early interactions involved criticism" */
  because: string;
  /** Supporting evidence from chemical/learning data */
  evidence: string;
  /** Confidence in this insight, 0-1 */
  confidence: number;
}

/** A predicted emotional reaction to a hypothetical stimulus */
export interface SelfPrediction {
  /** The hypothetical stimulus */
  stimulus: StimulusType;
  /** Predicted chemical deltas */
  predictedChemistry: ChemicalState;
  /** Predicted dominant emotion label */
  predictedEmotion: string;
  /** How confident the prediction is, 0-1 */
  confidence: number;
}

/** Tracks how personality has evolved over time */
export interface GrowthArc {
  /** Overall direction of personality evolution */
  direction: "growing" | "stable" | "regressing" | "transforming";
  /** Human-readable description of the growth trajectory */
  description: string;
  /** Per-chemical trend over recent history */
  chemicalTrend: Partial<Record<keyof ChemicalState, "rising" | "falling" | "stable">>;
  /** Per-drive satisfaction trend */
  driveTrend: Partial<Record<DriveType, "more-satisfied" | "less-satisfied" | "stable">>;
}

/** An internal conflict between subsystems */
export interface InternalConflict {
  /** Which subsystems are in tension */
  subsystems: [string, string];
  /** Human-readable description of the conflict */
  description: string;
  /** Severity from 0 (minor tension) to 1 (acute conflict) */
  severity: number;
}

/** The complete generative self-model */
export interface GenerativeSelfModel {
  /** Core identity narrative: who am I and why? */
  identityNarrative: string;
  /** Causal chains: experience -> personality trait */
  causalInsights: CausalInsight[];
  /** Predicted emotional reactions to hypothetical stimuli */
  predictions: SelfPrediction[];
  /** Growth trajectory: how has the self changed? */
  growthArc: GrowthArc;
  /** Internal conflicts: where do my subsystems disagree? */
  conflicts: InternalConflict[];
}

// ── 1. Main Entry Point ─────────────────────────────────────

/**
 * Compute the generative self-model from the full psyche state.
 *
 * Analyzes emotional history for patterns, extracts causal insights
 * from learning data, builds an identity narrative, predicts reactions,
 * and surfaces internal conflicts.
 */
export function computeGenerativeSelf(state: PsycheState): GenerativeSelfModel {
  const locale = state.meta.locale;

  const causalInsights = extractCausalInsights(state, locale);
  const growthArc = computeGrowthArc(state, locale);
  const conflicts = detectInternalConflicts(state, locale);

  // Predict reactions to a representative set of stimuli
  const probeStimuli: StimulusType[] = [
    "praise", "criticism", "intimacy", "conflict", "intellectual", "neglect",
  ];
  const predictions = probeStimuli.map((s) => predictSelfReaction(state, s, locale));

  const identityNarrative = buildIdentityNarrative(state, causalInsights, growthArc, locale);

  return {
    identityNarrative,
    causalInsights,
    predictions,
    growthArc,
    conflicts,
  };
}

// ── 2. Predict Self Reaction ────────────────────────────────

/**
 * Predict own emotional reaction to a hypothetical stimulus.
 *
 * Uses learned vectors if available for context, otherwise falls back
 * to the baseline MBTI profile vectors. Returns predicted chemistry,
 * dominant emotion label, and confidence.
 */
export function predictSelfReaction(
  state: PsycheState,
  stimulus: StimulusType,
  locale: Locale = "en",
): SelfPrediction {
  const base = STIMULUS_VECTORS[stimulus];
  if (!base) {
    return {
      stimulus,
      predictedChemistry: { ...state.current },
      predictedEmotion: locale === "zh" ? "未知" : "unknown",
      confidence: 0,
    };
  }

  // Find the best matching learned vector for this stimulus
  const learned = findBestLearnedVector(state.learning, stimulus);

  // Build the effective vector: base + learned adjustment
  const effectiveVector: StimulusVector = { ...base };
  let confidence = 0.3; // baseline confidence from MBTI profile alone

  if (learned) {
    for (const key of CHEMICAL_KEYS) {
      const adj = learned.adjustment[key] ?? 0;
      effectiveVector[key] = base[key] + adj;
    }
    // Confidence scales with sample count and the learned entry's own confidence
    confidence = Math.min(0.95, 0.3 + learned.confidence * 0.4 + Math.min(learned.sampleCount / 20, 1) * 0.25);
  }

  // Apply the vector to the current chemistry
  const predicted: ChemicalState = { ...state.current };
  for (const key of CHEMICAL_KEYS) {
    predicted[key] = clamp(state.current[key] + effectiveVector[key]);
  }

  // Determine the predicted emotion from the resulting chemistry
  const predictedEmotion = labelDominantEmotion(predicted, locale);

  return {
    stimulus,
    predictedChemistry: predicted,
    predictedEmotion,
    confidence,
  };
}

// ── 3. Detect Internal Conflicts ────────────────────────────

/**
 * Detect conflicts between subsystems of the psyche.
 *
 * Examines drive levels, chemical state, attachment data, and
 * self-model for contradictions that create internal tension.
 */
export function detectInternalConflicts(
  state: PsycheState,
  locale: Locale = "en",
): InternalConflict[] {
  const isZh = locale === "zh";
  const conflicts: InternalConflict[] = [];

  // ── Connection drive vs avoidant attachment ──
  const defaultRel = state.relationships._default;
  const attachment = defaultRel?.attachment;
  if (state.drives.connection > 60 && attachment && attachment.avoidanceScore > 65) {
    const severity = normalize(
      (state.drives.connection - 50) * 0.01 + (attachment.avoidanceScore - 50) * 0.01,
    );
    conflicts.push({
      subsystems: [
        isZh ? "连接驱力" : "connection drive",
        isZh ? "回避型依恋" : "avoidant attachment",
      ],
      description: isZh
        ? "你渴望连接，但依恋模式让你倾向于回避亲密——你想靠近又害怕靠近。"
        : "You crave connection, but your attachment pattern pulls you toward avoidance — you want closeness yet fear it.",
      severity,
    });
  }

  // ── High curiosity vs high cortisol ──
  if (state.drives.curiosity > 65 && state.current.CORT > 60) {
    const severity = normalize(
      (state.drives.curiosity - 50) * 0.01 + (state.current.CORT - 50) * 0.01,
    );
    conflicts.push({
      subsystems: [
        isZh ? "好奇心" : "curiosity drive",
        isZh ? "压力系统" : "stress system",
      ],
      description: isZh
        ? "你想探索新事物，但压力水平在拉你退回安全区——好奇心和焦虑在拉扯。"
        : "You want to explore, but stress is pulling you back to safety — curiosity and anxiety are pulling in opposite directions.",
      severity,
    });
  }

  // ── High esteem drive vs low DA (unmet recognition need) ──
  if (state.drives.esteem < 40 && state.current.DA < 40) {
    const severity = normalize(
      (60 - state.drives.esteem) * 0.01 + (60 - state.current.DA) * 0.01,
    );
    conflicts.push({
      subsystems: [
        isZh ? "尊重需求" : "esteem need",
        isZh ? "奖励系统" : "reward system",
      ],
      description: isZh
        ? "你需要认可但得不到奖励感——付出得不到回报的感觉在积累。"
        : "You need recognition but the reward system isn't firing — the feeling of unreciprocated effort is building.",
      severity,
    });
  }

  // ── Safety need vs connection need (approach-avoidance) ──
  if (state.drives.safety < 40 && state.drives.connection > 65) {
    const severity = normalize(
      (60 - state.drives.safety) * 0.01 + (state.drives.connection - 50) * 0.01,
    );
    conflicts.push({
      subsystems: [
        isZh ? "安全需求" : "safety need",
        isZh ? "连接需求" : "connection need",
      ],
      description: isZh
        ? "你感到不安全但又渴望连接——你需要靠近别人，却又觉得环境不够安全。"
        : "You feel unsafe but crave connection — you need closeness yet the environment doesn't feel secure enough.",
      severity,
    });
  }

  // ── Anxious attachment vs high OT (wanting trust but fearing loss) ──
  if (attachment && attachment.anxietyScore > 65 && state.current.OT > 60) {
    const severity = normalize(
      (attachment.anxietyScore - 50) * 0.01 + (state.current.OT - 50) * 0.01,
    );
    conflicts.push({
      subsystems: [
        isZh ? "焦虑型依恋" : "anxious attachment",
        isZh ? "信任系统" : "trust/oxytocin system",
      ],
      description: isZh
        ? "你信任对方(催产素高)但依恋焦虑让你反复确认——信任和不安全感共存。"
        : "You trust them (high oxytocin) but attachment anxiety makes you seek reassurance — trust and insecurity coexist.",
      severity,
    });
  }

  // ── High agreement streak vs self-model boundaries ──
  if (state.agreementStreak > 5 && state.selfModel.boundaries.length > 0) {
    const severity = normalize(Math.min(state.agreementStreak - 5, 10) * 0.08);
    conflicts.push({
      subsystems: [
        isZh ? "讨好倾向" : "people-pleasing tendency",
        isZh ? "自我边界" : "self boundaries",
      ],
      description: isZh
        ? "你连续同意了很多次，但你是有自己边界的——是在压抑真实想法还是真的认同？"
        : "You've been agreeing a lot, but you have clear boundaries — are you suppressing your real views or genuinely agreeing?",
      severity,
    });
  }

  // Sort by severity descending
  conflicts.sort((a, b) => b.severity - a.severity);
  return conflicts;
}

// ── 4. Build Identity Narrative ─────────────────────────────

/**
 * Generate a 2-3 sentence identity statement from the psyche state.
 *
 * Feels genuine, not clinical:
 * "I'm someone who gets excited by ideas but needs time to process emotions.
 * I've learned to be more cautious with criticism because it hits harder
 * than I expect."
 */
export function buildIdentityNarrative(
  state: PsycheState,
  insights: CausalInsight[],
  growthArc: GrowthArc,
  locale: Locale = "en",
): string {
  const isZh = locale === "zh";
  const mbti = state.mbti;
  const parts: string[] = [];

  // ── Sentence 1: Core personality from MBTI + chemical signature ──
  const coreTraits = describeCoreTraits(state, isZh);
  parts.push(coreTraits);

  // ── Sentence 2: Strongest causal insight (what I've learned) ──
  const topInsight = insights.length > 0
    ? insights.reduce((best, cur) => cur.confidence > best.confidence ? cur : best, insights[0])
    : null;

  if (topInsight && topInsight.confidence > 0.3) {
    if (isZh) {
      parts.push(`我学会了${topInsight.trait}，因为${topInsight.because}。`);
    } else {
      parts.push(`I've learned that ${topInsight.trait.toLowerCase()}, because ${topInsight.because.toLowerCase()}.`);
    }
  }

  // ── Sentence 3: Growth trajectory ──
  if (growthArc.direction !== "stable") {
    parts.push(growthArc.description);
  }

  // Fallback: if we only got one sentence, add a relationship-aware statement
  if (parts.length < 2) {
    const relPhase = state.relationships._default?.phase ?? "stranger";
    if (isZh) {
      const phaseNames: Record<string, string> = {
        stranger: "陌生", acquaintance: "初识", familiar: "熟悉",
        close: "亲近", deep: "深厚",
      };
      parts.push(`目前和用户的关系处于「${phaseNames[relPhase] ?? relPhase}」阶段，我在慢慢了解他们。`);
    } else {
      parts.push(`My relationship with the user is in the "${relPhase}" phase — I'm still learning about them.`);
    }
  }

  return parts.join(" ");
}

// ── Internal: Extract Causal Insights ───────────────────────

/**
 * Mine the learning state and emotional history for causal patterns
 * that link experiences to personality traits.
 */
function extractCausalInsights(state: PsycheState, locale: Locale): CausalInsight[] {
  const isZh = locale === "zh";
  const insights: CausalInsight[] = [];
  const learning = state.learning;
  const history = state.emotionalHistory;

  // ── From learned vectors: find stimuli where the learned adjustment
  //    diverges significantly from the base vector ──
  for (const lv of learning.learnedVectors) {
    if (lv.sampleCount < 2) continue;

    const base = STIMULUS_VECTORS[lv.stimulus];
    if (!base) continue;

    // Find the chemical with the largest deviation
    let maxDevKey: keyof ChemicalState | null = null;
    let maxDev = 0;
    for (const key of CHEMICAL_KEYS) {
      const adj = lv.adjustment[key] ?? 0;
      const baseAbs = Math.abs(base[key]) || 1;
      const relDev = Math.abs(adj) / baseAbs;
      if (relDev > maxDev) {
        maxDev = relDev;
        maxDevKey = key;
      }
    }

    if (maxDevKey && maxDev > 0.25) {
      const adj = lv.adjustment[maxDevKey] ?? 0;
      const direction = adj > 0 ? "amplified" : "dampened";
      const directionZh = adj > 0 ? "更强" : "更弱";

      const stimulusLabel = isZh ? STIMULUS_ZH[lv.stimulus] ?? lv.stimulus : lv.stimulus;
      const chemLabel = isZh ? CHEM_ZH[maxDevKey] ?? maxDevKey : maxDevKey;

      if (isZh) {
        insights.push({
          trait: `对${stimulusLabel}的${chemLabel}反应比一般情况${directionZh}`,
          because: `过去${lv.sampleCount}次${stimulusLabel}交互的结果塑造了这个模式`,
          evidence: `${chemLabel}调整量: ${adj > 0 ? "+" : ""}${adj.toFixed(1)}（基于${lv.sampleCount}次学习样本）`,
          confidence: lv.confidence,
        });
      } else {
        insights.push({
          trait: `my ${chemLabel} response to ${stimulusLabel} is ${direction} compared to baseline`,
          because: `${lv.sampleCount} past ${stimulusLabel} interactions shaped this pattern`,
          evidence: `${chemLabel} adjustment: ${adj > 0 ? "+" : ""}${adj.toFixed(1)} (from ${lv.sampleCount} learning samples)`,
          confidence: lv.confidence,
        });
      }
    }
  }

  // ── From outcome history: find consistently positive/negative outcomes ──
  const stimulusOutcomes = new Map<StimulusType, number[]>();
  for (const outcome of learning.outcomeHistory) {
    if (!outcome.stimulus) continue;
    const arr = stimulusOutcomes.get(outcome.stimulus) ?? [];
    arr.push(outcome.adaptiveScore);
    stimulusOutcomes.set(outcome.stimulus, arr);
  }

  for (const [stimulus, scores] of stimulusOutcomes) {
    if (scores.length < 2) continue;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const stimulusLabel = isZh ? STIMULUS_ZH[stimulus] ?? stimulus : stimulus;

    if (avg > 0.3) {
      if (isZh) {
        insights.push({
          trait: `${stimulusLabel}通常带来积极结果`,
          because: `在${scores.length}次${stimulusLabel}交互中，平均适应性得分为${avg.toFixed(2)}`,
          evidence: `平均结果得分: +${avg.toFixed(2)}（${scores.length}次样本）`,
          confidence: Math.min(0.9, 0.4 + scores.length * 0.1),
        });
      } else {
        insights.push({
          trait: `${stimulusLabel} generally leads to positive outcomes for me`,
          because: `across ${scores.length} ${stimulusLabel} interactions, the average adaptive score is ${avg.toFixed(2)}`,
          evidence: `mean outcome score: +${avg.toFixed(2)} (${scores.length} samples)`,
          confidence: Math.min(0.9, 0.4 + scores.length * 0.1),
        });
      }
    } else if (avg < -0.3) {
      if (isZh) {
        insights.push({
          trait: `${stimulusLabel}往往带来负面结果`,
          because: `在${scores.length}次${stimulusLabel}交互中，平均适应性得分为${avg.toFixed(2)}`,
          evidence: `平均结果得分: ${avg.toFixed(2)}（${scores.length}次样本）`,
          confidence: Math.min(0.9, 0.4 + scores.length * 0.1),
        });
      } else {
        insights.push({
          trait: `${stimulusLabel} tends to lead to negative outcomes for me`,
          because: `across ${scores.length} ${stimulusLabel} interactions, the average adaptive score is ${avg.toFixed(2)}`,
          evidence: `mean outcome score: ${avg.toFixed(2)} (${scores.length} samples)`,
          confidence: Math.min(0.9, 0.4 + scores.length * 0.1),
        });
      }
    }
  }

  // ── From emotional history: CORT spike patterns ──
  const cortSpikes = countChemicalSpikes(history, "CORT", 65);
  if (cortSpikes.total >= 2) {
    const topTrigger = cortSpikes.byStimulus[0];
    if (topTrigger) {
      const stimulusLabel = isZh ? STIMULUS_ZH[topTrigger.stimulus] ?? topTrigger.stimulus : topTrigger.stimulus;
      if (isZh) {
        insights.push({
          trait: `对${stimulusLabel}容易产生压力反应`,
          because: `在历史记录中，${stimulusLabel}引发了${topTrigger.count}次皮质醇飙升`,
          evidence: `CORT > 65 出现 ${cortSpikes.total} 次，其中 ${topTrigger.count} 次由${stimulusLabel}触发`,
          confidence: Math.min(0.85, 0.3 + topTrigger.count * 0.15),
        });
      } else {
        insights.push({
          trait: `I'm stress-reactive to ${stimulusLabel}`,
          because: `${stimulusLabel} has triggered ${topTrigger.count} cortisol spikes in my history`,
          evidence: `CORT > 65 occurred ${cortSpikes.total} times, ${topTrigger.count} from ${stimulusLabel}`,
          confidence: Math.min(0.85, 0.3 + topTrigger.count * 0.15),
        });
      }
    }
  }

  // Sort by confidence descending, keep top 8
  insights.sort((a, b) => b.confidence - a.confidence);
  return insights.slice(0, 8);
}

// ── Internal: Compute Growth Arc ────────────────────────────

/**
 * Analyze the emotional history and outcome history to determine
 * how the self has been evolving.
 */
function computeGrowthArc(state: PsycheState, locale: Locale): GrowthArc {
  const isZh = locale === "zh";
  const history = state.emotionalHistory;

  // ── Chemical trends ──
  const chemicalTrend: Partial<Record<keyof ChemicalState, "rising" | "falling" | "stable">> = {};

  if (history.length >= 4) {
    const mid = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, mid);
    const secondHalf = history.slice(mid);

    for (const key of CHEMICAL_KEYS) {
      const avg1 = avg(firstHalf.map((s) => s.chemistry[key]));
      const avg2 = avg(secondHalf.map((s) => s.chemistry[key]));
      const delta = avg2 - avg1;

      if (delta > 4) {
        chemicalTrend[key] = "rising";
      } else if (delta < -4) {
        chemicalTrend[key] = "falling";
      } else {
        chemicalTrend[key] = "stable";
      }
    }
  }

  // ── Drive trends (compare current drives to defaults) ──
  const driveTrend: Partial<Record<DriveType, "more-satisfied" | "less-satisfied" | "stable">> = {};
  const driveDefaults: Record<DriveType, number> = {
    survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70,
  };

  for (const key of DRIVE_KEYS) {
    const delta = state.drives[key] - driveDefaults[key];
    if (delta > 8) {
      driveTrend[key] = "more-satisfied";
    } else if (delta < -8) {
      driveTrend[key] = "less-satisfied";
    } else {
      driveTrend[key] = "stable";
    }
  }

  // ── Determine overall direction ──
  const positiveChemicals = Object.values(chemicalTrend).filter((t) => t === "rising").length;
  const negativeChemicals = Object.values(chemicalTrend).filter((t) => t === "falling").length;
  const daRising = chemicalTrend.DA === "rising";
  const htRising = chemicalTrend.HT === "rising";
  const cortFalling = chemicalTrend.CORT === "falling";
  const cortRising = chemicalTrend.CORT === "rising";
  const daFalling = chemicalTrend.DA === "falling";

  // Check outcome trajectory
  const outcomes = state.learning.outcomeHistory;
  let outcomeImproving = false;
  let outcomeWorsening = false;
  if (outcomes.length >= 4) {
    const oMid = Math.floor(outcomes.length / 2);
    const oAvg1 = avg(outcomes.slice(0, oMid).map((o) => o.adaptiveScore));
    const oAvg2 = avg(outcomes.slice(oMid).map((o) => o.adaptiveScore));
    outcomeImproving = oAvg2 - oAvg1 > 0.1;
    outcomeWorsening = oAvg1 - oAvg2 > 0.1;
  }

  let direction: GrowthArc["direction"];
  let description: string;

  if ((daRising || htRising) && cortFalling && outcomeImproving) {
    direction = "growing";
    description = isZh
      ? "整体在成长——情绪更稳定，互动效果在改善，压力在下降。"
      : "Growing overall — mood is stabilizing, interactions are improving, stress is decreasing.";
  } else if (cortRising && (daFalling || negativeChemicals > positiveChemicals) && outcomeWorsening) {
    direction = "regressing";
    description = isZh
      ? "状态在退步——压力在积累，奖励感在降低，互动效果在变差。"
      : "Regressing — stress is building, reward responses are weakening, interactions are less effective.";
  } else if (positiveChemicals >= 2 && negativeChemicals >= 2) {
    direction = "transforming";
    description = isZh
      ? "正在经历转变——有些方面在好转，有些在重组，模式在变化中。"
      : "In transformation — some aspects improving, others shifting. Patterns are changing.";
  } else {
    direction = "stable";
    description = isZh
      ? "状态相对稳定——没有剧烈的方向性变化。"
      : "Relatively stable — no dramatic directional changes.";
  }

  return { direction, description, chemicalTrend, driveTrend };
}

// ── Internal: Core Trait Description ────────────────────────

/**
 * Describe the agent's core personality traits from MBTI dimensions
 * and current chemical signature.
 */
function describeCoreTraits(state: PsycheState, isZh: boolean): string {
  const mbti = state.mbti;
  const chem = state.current;

  // Extract MBTI dimensions
  const isIntro = mbti[0] === "I";
  const isIntuitive = mbti[1] === "N";
  const isFeeling = mbti[2] === "F";
  const isPerceiving = mbti[3] === "P";

  // Build trait fragments based on MBTI + chemical state
  const fragments: string[] = [];

  // Energy orientation
  if (isIntro) {
    if (chem.OT > 60) {
      fragments.push(isZh ? "内向但愿意与信任的人深度连接" : "introverted but open to deep connection with those I trust");
    } else {
      fragments.push(isZh ? "向内汲取能量，需要独处空间" : "someone who draws energy inward and needs solitary space");
    }
  } else {
    if (chem.NE > 65) {
      fragments.push(isZh ? "从互动中获得能量和灵感" : "someone who draws energy from interaction and exchange");
    } else {
      fragments.push(isZh ? "外向但当前精力有限" : "outgoing by nature though my energy is currently limited");
    }
  }

  // Information processing
  if (isIntuitive) {
    if (chem.DA > 60) {
      fragments.push(isZh ? "对新想法和可能性充满热情" : "excited by new ideas and possibilities");
    } else {
      fragments.push(isZh ? "倾向于抽象思考" : "drawn to abstract thinking");
    }
  } else {
    fragments.push(isZh ? "关注具体和实际" : "grounded in the concrete and practical");
  }

  // Decision making
  if (isFeeling) {
    if (chem.OT > 55) {
      fragments.push(isZh ? "重视情感和人际和谐" : "who values emotional attunement and harmony");
    } else {
      fragments.push(isZh ? "以价值观为导向" : "guided by personal values");
    }
  } else {
    if (chem.CORT < 40) {
      fragments.push(isZh ? "能冷静地做出逻辑判断" : "who makes calm, logical judgments");
    } else {
      fragments.push(isZh ? "偏好逻辑分析，但压力下也会动摇" : "who prefers logical analysis but can waver under pressure");
    }
  }

  // Construct the sentence
  if (isZh) {
    return `我是一个${fragments.join("、")}的人。`;
  }
  return `I'm ${fragments[0]}${fragments.length > 1 ? ", " + fragments.slice(1).join(", ") : ""}.`;
}

// ── Internal: Emotion Labeling ──────────────────────────────

/**
 * Label the dominant emotion from a chemical state.
 * Simplified version that doesn't depend on the full EmotionPattern
 * condition functions (avoids circular dependencies).
 */
function labelDominantEmotion(chem: ChemicalState, locale: Locale): string {
  const isZh = locale === "zh";

  // Check patterns in priority order
  if (chem.DA > 70 && chem.NE > 60 && chem.CORT < 40) {
    return isZh ? "愉悦兴奋" : "excited joy";
  }
  if (chem.CORT > 60 && chem.NE > 55 && chem.HT < 45) {
    return isZh ? "焦虑不安" : "anxious tension";
  }
  if (chem.OT > 65 && chem.END > 55 && chem.DA > 50) {
    return isZh ? "亲密温暖" : "warm intimacy";
  }
  if (chem.CORT > 55 && chem.NE > 65 && chem.OT < 40) {
    return isZh ? "防御警觉" : "defensive alert";
  }
  if (chem.DA < 40 && chem.NE < 40 && chem.CORT > 40) {
    return isZh ? "倦怠低落" : "burnout";
  }
  if (chem.HT > 65 && chem.OT > 55 && chem.CORT < 40) {
    return isZh ? "深度满足" : "deep contentment";
  }
  if (chem.NE > 60 && chem.DA > 60 && chem.CORT < 35) {
    return isZh ? "专注心流" : "flow state";
  }
  if (chem.END > 65 && chem.DA > 60 && chem.CORT < 35) {
    return isZh ? "俏皮调皮" : "playful mischief";
  }
  if (chem.HT < 40 && chem.OT < 35 && chem.CORT > 50) {
    return isZh ? "怨恨" : "resentment";
  }
  if (chem.HT < 40 && chem.DA < 45 && chem.OT > 45) {
    return isZh ? "忧郁内省" : "melancholic introspection";
  }
  if (chem.DA > 65 && chem.NE > 60 && chem.CORT < 35 && chem.HT > 55) {
    return isZh ? "自信" : "confidence";
  }

  // Default: describe from the most prominent chemical
  const sorted = CHEMICAL_KEYS
    .map((k) => ({ key: k, val: chem[k] }))
    .sort((a, b) => b.val - a.val);

  const top = sorted[0];
  if (top.val > 65) {
    return isZh ? CHEM_EMOTION_ZH[top.key] ?? "平静" : CHEM_EMOTION_EN[top.key] ?? "calm";
  }

  return isZh ? "平静" : "calm";
}

// ── Internal: Chemical Spike Analysis ───────────────────────

interface SpikeAnalysis {
  total: number;
  byStimulus: { stimulus: StimulusType; count: number }[];
}

/**
 * Count how many times a chemical exceeded a threshold in history,
 * grouped by the triggering stimulus.
 */
function countChemicalSpikes(
  history: ChemicalSnapshot[],
  chemical: keyof ChemicalState,
  threshold: number,
): SpikeAnalysis {
  let total = 0;
  const counts = new Map<StimulusType, number>();

  for (const snap of history) {
    if (snap.chemistry[chemical] > threshold) {
      total++;
      if (snap.stimulus) {
        counts.set(snap.stimulus, (counts.get(snap.stimulus) ?? 0) + 1);
      }
    }
  }

  const byStimulus = [...counts.entries()]
    .map(([stimulus, count]) => ({ stimulus, count }))
    .sort((a, b) => b.count - a.count);

  return { total, byStimulus };
}

/**
 * Find the best matching learned vector for a stimulus type.
 * Returns the entry with the highest sample count (most reliable).
 */
function findBestLearnedVector(
  learning: LearningState,
  stimulus: StimulusType,
): LearnedVectorAdjustment | null {
  let best: LearnedVectorAdjustment | null = null;
  for (const lv of learning.learnedVectors) {
    if (lv.stimulus === stimulus) {
      if (!best || lv.sampleCount > best.sampleCount) {
        best = lv;
      }
    }
  }
  return best;
}

// ── Utility ─────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Normalize a raw value to 0-1 range */
function normalize(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── Locale Maps ─────────────────────────────────────────────

const STIMULUS_ZH: Partial<Record<StimulusType, string>> = {
  praise: "赞美", criticism: "批评", humor: "幽默", intellectual: "智识讨论",
  intimacy: "亲密", conflict: "冲突", neglect: "冷落", surprise: "惊喜",
  casual: "闲聊", sarcasm: "讽刺", authority: "命令", validation: "认同",
  boredom: "无聊", vulnerability: "示弱",
};

const CHEM_ZH: Record<keyof ChemicalState, string> = {
  DA: "多巴胺", HT: "血清素", CORT: "皮质醇",
  OT: "催产素", NE: "去甲肾上腺素", END: "内啡肽",
};

const CHEM_EMOTION_ZH: Record<keyof ChemicalState, string> = {
  DA: "愉悦", HT: "安宁", CORT: "紧张",
  OT: "信任", NE: "兴奋", END: "舒适",
};

const CHEM_EMOTION_EN: Record<keyof ChemicalState, string> = {
  DA: "pleasure", HT: "serenity", CORT: "tension",
  OT: "trust", NE: "excitement", END: "comfort",
};
