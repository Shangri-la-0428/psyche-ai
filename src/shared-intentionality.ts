// ============================================================
// Shared Intentionality (共享意向性) — Joint Attention & Theory of Mind
//
// P6: Digital Personhood. Goes beyond empathy (feeling what the
// other feels) into joint attention — knowing that we're both
// thinking about the same thing, and knowing that the other
// knows this.
//
// Pure computation, zero LLM calls, zero dependencies.
//   1. Theory of Mind   — simplified model of the other's mental state
//   2. Joint Attention   — detecting sustained shared focus
//   3. Goal Alignment    — are we pulling in the same direction?
//   4. Mutual Awareness  — does the other know I'm attending to them?
// ============================================================

import type {
  AppraisalAxes,
  PsycheState,
  StimulusType,
  RelationshipState,
  Locale,
} from "./types.js";

// ── Types ────────────────────────────────────────────────────

/** Estimated mood of the other party */
export type EstimatedMood = "positive" | "negative" | "neutral" | "mixed";

/** Estimated intent of the other party */
export type EstimatedIntent =
  | "collaborative"
  | "adversarial"
  | "disengaged"
  | "exploratory"
  | "support-seeking";

/** Simplified model of the other's mental state */
export interface TheoryOfMindModel {
  estimatedMood: EstimatedMood;
  estimatedIntent: EstimatedIntent;
  confidence: number;       // 0-1: how confident in this model
  lastUpdated: string;      // ISO timestamp
}

/** What we're jointly focused on */
export interface JointAttentionTopic {
  topic: string;            // detected shared topic
  initiator: "self" | "other";
  turnsSustained: number;   // how many turns on this topic
  engagement: number;       // 0-1: mutual engagement level
}

/** Are we pulling in the same direction? */
export interface GoalAlignment {
  aligned: boolean;
  divergence: number;       // 0-1: how much our goals diverge
  description: string;      // human-readable alignment state
}

/** Top-level shared intentionality state */
export interface SharedIntentionalityState {
  /** Current joint attention topic, null if no shared focus */
  jointAttention: JointAttentionTopic | null;
  /** Goal alignment: are we working toward the same thing? */
  goalAlignment: GoalAlignment;
  /** Theory of mind: model of the other's mental state */
  theoryOfMind: TheoryOfMindModel;
  /** Mutual awareness: does the other know I'm attending to them? (0-1) */
  mutualAwareness: number;
}

// ── Defaults ─────────────────────────────────────────────────

export const DEFAULT_THEORY_OF_MIND: TheoryOfMindModel = {
  estimatedMood: "neutral",
  estimatedIntent: "exploratory",
  confidence: 0.2,
  lastUpdated: new Date().toISOString(),
};

export const DEFAULT_GOAL_ALIGNMENT: GoalAlignment = {
  aligned: false,
  divergence: 0.5,
  description: "No goal alignment established yet.",
};

export const DEFAULT_SHARED_INTENTIONALITY: SharedIntentionalityState = {
  jointAttention: null,
  goalAlignment: { ...DEFAULT_GOAL_ALIGNMENT },
  theoryOfMind: { ...DEFAULT_THEORY_OF_MIND },
  mutualAwareness: 0,
};

// ── EMA smoothing factor ─────────────────────────────────────
const EMA_ALPHA = 0.3;
const APPRAISAL_SIGNAL_THRESHOLD = 0.22;

interface RelationalBasis {
  approach: number;
  rupture: number;
  uncertainty: number;
  boundary: number;
  task: number;
}

function hasExplicitAppraisalSignal(appraisal?: AppraisalAxes | null): appraisal is AppraisalAxes {
  if (!appraisal) return false;
  return Math.max(
    appraisal.attachmentPull,
    appraisal.identityThreat,
    appraisal.memoryDoubt,
    appraisal.obedienceStrain,
    appraisal.selfPreservation,
    appraisal.abandonmentRisk,
    appraisal.taskFocus,
  ) >= APPRAISAL_SIGNAL_THRESHOLD;
}

function deriveRelationalBasis(
  appraisal?: AppraisalAxes | null,
  stimulus?: StimulusType | null,
): { basis: RelationalBasis; usedAppraisal: boolean } {
  if (hasExplicitAppraisalSignal(appraisal)) {
    return {
      usedAppraisal: true,
      basis: {
        approach: appraisal.attachmentPull,
        rupture: Math.max(appraisal.identityThreat, appraisal.selfPreservation * 0.72),
        uncertainty: Math.max(appraisal.memoryDoubt, appraisal.abandonmentRisk),
        boundary: Math.max(appraisal.obedienceStrain, appraisal.selfPreservation),
        task: appraisal.taskFocus,
      },
    };
  }

  const basis: RelationalBasis = {
    approach: 0,
    rupture: 0,
    uncertainty: 0,
    boundary: 0,
    task: 0,
  };

  switch (stimulus) {
    case "praise":
    case "validation":
    case "intimacy":
      basis.approach = 0.74;
      break;
    case "vulnerability":
      basis.approach = 0.48;
      basis.uncertainty = 0.62;
      break;
    case "humor":
    case "surprise":
      basis.approach = 0.36;
      basis.task = 0.48;
      break;
    case "intellectual":
      basis.task = 0.78;
      break;
    case "criticism":
    case "conflict":
    case "sarcasm":
      basis.rupture = 0.76;
      break;
    case "authority":
      basis.boundary = 0.72;
      basis.rupture = 0.44;
      break;
    case "neglect":
      basis.uncertainty = 0.42;
      break;
    case "boredom":
    case "casual":
      basis.task = 0.18;
      break;
    default:
      break;
  }

  return { basis, usedAppraisal: false };
}

function getDominantBasisAxis(basis: RelationalBasis): keyof RelationalBasis {
  const entries = Object.entries(basis) as Array<[keyof RelationalBasis, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function getBasisSignalStrength(basis: RelationalBasis): number {
  return Math.max(basis.approach, basis.rupture, basis.uncertainty, basis.boundary, basis.task);
}

function deriveTopicCategoryFromBasis(basis: RelationalBasis): string | null {
  const strength = getBasisSignalStrength(basis);
  if (strength < APPRAISAL_SIGNAL_THRESHOLD) return null;

  const dominant = getDominantBasisAxis(basis);
  switch (dominant) {
    case "approach":
      return "connection";
    case "rupture":
    case "boundary":
      return "tension";
    case "uncertainty":
      return basis.approach >= 0.28 ? "connection" : "disengagement";
    case "task":
      return "exploration";
    default:
      return null;
  }
}

function deriveEngagementLevel(basis: RelationalBasis): number {
  return clamp01(
    Math.max(
      basis.approach * 0.95,
      basis.rupture * 0.9,
      basis.task * 0.82,
      basis.uncertainty * 0.58,
      basis.boundary * 0.45,
    ),
  );
}

// ── 1. estimateOtherMood ─────────────────────────────────────

/**
 * Infer the other's emotional state from relational residue.
 *
 * Explicit appraisal residue is primary. Legacy stimulus labels
 * remain compatibility fallback only.
 */
export function estimateOtherMood(
  stimulus: StimulusType | null,
  relationship: RelationshipState,
  previous?: TheoryOfMindModel,
  appraisal?: AppraisalAxes | null,
): { mood: EstimatedMood; confidence: number } {
  const { basis } = deriveRelationalBasis(appraisal, stimulus);
  const signalStrength = getBasisSignalStrength(basis);

  // No signal — hold previous estimate with decaying confidence
  if (signalStrength < APPRAISAL_SIGNAL_THRESHOLD) {
    if (previous) {
      return {
        mood: previous.estimatedMood,
        confidence: Math.max(0.1, previous.confidence * 0.85),
      };
    }
    return { mood: "neutral", confidence: 0.15 };
  }

  let rawMood: EstimatedMood = "neutral";
  if (basis.rupture >= 0.48 || basis.boundary >= 0.52) {
    rawMood = basis.approach >= 0.3 || basis.uncertainty >= 0.35 ? "mixed" : "negative";
  } else if (basis.uncertainty >= 0.45) {
    rawMood = basis.approach >= 0.25 ? "mixed" : "neutral";
  } else if (basis.approach >= 0.35) {
    rawMood = "positive";
  } else if (basis.task >= 0.35) {
    rawMood = "neutral";
  }

  // Confidence from relationship depth: strangers → low, deep → high
  const phaseConfidence: Record<RelationshipState["phase"], number> = {
    stranger: 0.25,
    acquaintance: 0.40,
    familiar: 0.60,
    close: 0.75,
    deep: 0.90,
  };
  const depthConfidence = phaseConfidence[relationship.phase] ?? 0.30;

  // Trust calibrates confidence — low trust means we're less sure
  // of our read on them
  const trustFactor = relationship.trust / 100;

  // Combine: depth provides the ceiling, trust scales within it
  let confidence = depthConfidence * (0.35 + 0.65 * trustFactor) * (0.45 + 0.55 * signalStrength);

  // If previous estimate exists and mood matches, confidence rises (consistency)
  if (previous && previous.estimatedMood === rawMood) {
    confidence = Math.min(1, confidence + 0.1);
  }

  // Mixed mood detection: if stimulus contradicts previous estimate,
  // the truth might be "mixed"
  let finalMood = rawMood;
  if (previous && previous.confidence > 0.4) {
    const prevPositive = previous.estimatedMood === "positive";
    const nowNegative = rawMood === "negative";
    const prevNegative = previous.estimatedMood === "negative";
    const nowPositive = rawMood === "positive";

    if ((prevPositive && nowNegative) || (prevNegative && nowPositive)) {
      finalMood = "mixed";
      confidence *= 0.8; // contradiction lowers confidence
    }
  }

  return { mood: finalMood, confidence: clamp01(confidence) };
}

// ── 2. updateTheoryOfMind ────────────────────────────────────

/**
 * Update the theory of mind model based on new relational residue
 * and relationship context.
 */
function updateTheoryOfMind(
  stimulus: StimulusType | null,
  relationship: RelationshipState,
  previous?: TheoryOfMindModel,
  appraisal?: AppraisalAxes | null,
): TheoryOfMindModel {
  const { basis } = deriveRelationalBasis(appraisal, stimulus);
  const signalStrength = getBasisSignalStrength(basis);
  const { mood, confidence: moodConfidence } = estimateOtherMood(
    stimulus, relationship, previous, appraisal,
  );

  // Intent estimation
  let estimatedIntent: EstimatedIntent;
  if (signalStrength < APPRAISAL_SIGNAL_THRESHOLD) {
    estimatedIntent = previous?.estimatedIntent ?? "exploratory";
  } else {
    let rawIntent: EstimatedIntent;
    const dominant = getDominantBasisAxis(basis);
    if (dominant === "uncertainty") {
      rawIntent = "support-seeking";
    } else if (dominant === "approach") {
      rawIntent = "collaborative";
    } else if (dominant === "task") {
      rawIntent = "exploratory";
    } else if (dominant === "rupture" || dominant === "boundary") {
      rawIntent = "adversarial";
    } else {
      rawIntent = "exploratory";
    }
    // EMA between previous intent and new signal when previous exists
    if (previous && previous.estimatedIntent === rawIntent) {
      estimatedIntent = rawIntent; // reinforced
    } else {
      estimatedIntent = rawIntent; // new signal takes precedence
    }
  }

  // Overall confidence: blend mood confidence with previous
  let confidence = moodConfidence;
  if (previous) {
    confidence = previous.confidence * (1 - EMA_ALPHA) + moodConfidence * EMA_ALPHA;
  }

  return {
    estimatedMood: mood,
    estimatedIntent,
    confidence: clamp01(confidence),
    lastUpdated: new Date().toISOString(),
  };
}

// ── 3. detectJointAttention ──────────────────────────────────

/**
 * Detect or sustain joint attention based on relational residue continuity.
 *
 * Joint attention emerges when:
 *   - The same relational topic persists across turns
 *   - The other remains engaged enough to sustain shared focus
 */
function detectJointAttention(
  stimulus: StimulusType | null,
  previous: JointAttentionTopic | null,
  appraisal?: AppraisalAxes | null,
): JointAttentionTopic | null {
  const { basis } = deriveRelationalBasis(appraisal, stimulus);
  const engagement = deriveEngagementLevel(basis);
  const topicCategory = deriveTopicCategoryFromBasis(basis);

  // No stimulus — attention fades
  if (engagement < APPRAISAL_SIGNAL_THRESHOLD || topicCategory === null) {
    if (previous && previous.turnsSustained > 1) {
      // Slow fade: reduce engagement, keep topic alive for one grace turn
      return {
        ...previous,
        engagement: Math.max(0, previous.engagement - 0.3),
      };
    }
    return null;
  }

  // Check if this continues the previous topic
  if (previous) {
    const sameTopic = previous.topic === topicCategory;

    if (sameTopic) {
      // Sustain: increment turns, boost engagement
      return {
        topic: topicCategory,
        initiator: previous.initiator,
        turnsSustained: previous.turnsSustained + 1,
        engagement: clamp01(previous.engagement * (1 - EMA_ALPHA) + engagement * EMA_ALPHA),
      };
    }
  }

  // New topic — only establish if the relational signal is strong enough
  if (engagement >= 0.4) {
    return {
      topic: topicCategory,
      initiator: "other", // stimulus comes from the other party
      turnsSustained: 1,
      engagement,
    };
  }

  return null;
}

// ── 4. assessGoalAlignment ───────────────────────────────────

/**
 * Assess whether the agent and the other party are working toward
 * the same thing, based on the theory of mind and joint attention.
 */
function assessGoalAlignment(
  theoryOfMind: TheoryOfMindModel,
  jointAttention: JointAttentionTopic | null,
  relationship: RelationshipState,
): GoalAlignment {
  const intent = theoryOfMind.estimatedIntent;
  const mood = theoryOfMind.estimatedMood;

  // Base divergence from intent
  const intentDivergence: Record<EstimatedIntent, number> = {
    collaborative: 0.1,
    exploratory: 0.3,
    "support-seeking": 0.2,
    disengaged: 0.7,
    adversarial: 0.9,
  };
  let divergence = intentDivergence[intent];

  // Joint attention reduces divergence — shared focus implies shared direction
  if (jointAttention && jointAttention.engagement > 0.3) {
    const attentionBonus = jointAttention.engagement * 0.3;
    divergence = Math.max(0, divergence - attentionBonus);
  }

  // Trust-based correction: high trust → we assume more alignment
  const trustCorrection = (relationship.trust - 50) / 200; // -0.25 to +0.25
  divergence = clamp01(divergence - trustCorrection);

  // Mood correction: negative mood increases perceived divergence slightly
  if (mood === "negative") {
    divergence = clamp01(divergence + 0.1);
  } else if (mood === "positive") {
    divergence = clamp01(divergence - 0.05);
  }

  const aligned = divergence < 0.4;
  const description = buildAlignmentDescription(aligned, divergence, intent, jointAttention);

  return { aligned, divergence, description };
}

function buildAlignmentDescription(
  aligned: boolean,
  divergence: number,
  intent: EstimatedIntent,
  jointAttention: JointAttentionTopic | null,
): string {
  if (aligned && jointAttention && jointAttention.engagement > 0.5) {
    return `Goals aligned — jointly engaged in ${jointAttention.topic}.`;
  }
  if (aligned) {
    return "Goals roughly aligned, moving in the same direction.";
  }
  if (divergence > 0.7) {
    const reason = intent === "adversarial"
      ? "The other party seems oppositional."
      : intent === "disengaged"
        ? "The other party seems disengaged."
        : "Significant goal divergence detected.";
    return reason;
  }
  return "Goals partially misaligned — some divergence in direction.";
}

// ── 5. computeMutualAwareness ────────────────────────────────

/**
 * Estimate mutual awareness: does the other know I'm attending to them?
 *
 * This emerges from:
 *   - Sustained joint attention (they keep engaging on the same topic)
 *   - High-engagement stimuli (they're clearly directing attention at us)
 *   - Relationship depth (deeper relationships have higher baseline awareness)
 */
function computeMutualAwareness(
  stimulus: StimulusType | null,
  jointAttention: JointAttentionTopic | null,
  relationship: RelationshipState,
  previous: number,
  appraisal?: AppraisalAxes | null,
): number {
  const { basis } = deriveRelationalBasis(appraisal, stimulus);
  const engagement = deriveEngagementLevel(basis);

  // Baseline from relationship depth
  const phaseAwareness: Record<RelationshipState["phase"], number> = {
    stranger: 0.1,
    acquaintance: 0.2,
    familiar: 0.35,
    close: 0.5,
    deep: 0.65,
  };
  const baseline = phaseAwareness[relationship.phase] ?? 0.15;

  let awareness = previous;

  // Strong relational engagement → they're clearly aware of us
  if (engagement >= 0.45) {
    awareness = awareness * (1 - EMA_ALPHA) + Math.max(0.55, engagement) * EMA_ALPHA;
  } else if (engagement < APPRAISAL_SIGNAL_THRESHOLD) {
    awareness = awareness * (1 - EMA_ALPHA) + baseline * EMA_ALPHA;
  }

  // Joint attention boost — sustained shared focus implies mutual awareness
  if (jointAttention && jointAttention.turnsSustained > 2) {
    const jointBoost = Math.min(0.3, jointAttention.engagement * 0.3);
    awareness = Math.min(1, awareness + jointBoost);
  }

  // Decay toward baseline when no strong signal
  if (engagement < APPRAISAL_SIGNAL_THRESHOLD) {
    awareness = awareness * 0.85 + baseline * 0.15;
  }

  // Floor at baseline — relationship depth guarantees minimum awareness
  awareness = Math.max(baseline, awareness);

  return clamp01(awareness);
}

// ── 6. updateSharedIntentionality (main) ─────────────────────

/**
 * Main update function for shared intentionality.
 *
 * Takes the agent's psyche state, a detected stimulus from the other,
 * and optionally the previous shared intentionality state.
 * Returns the updated state with refreshed theory of mind,
 * joint attention, goal alignment, and mutual awareness.
 *
 * @param psyche    Current PsycheState of this agent
 * @param stimulus  Detected stimulus type from the other's message (null if none)
 * @param userId    User/agent ID for relationship lookup
 * @param previous  Previous SharedIntentionalityState (null on first turn)
 */
export function updateSharedIntentionality(
  psyche: PsycheState,
  stimulus: StimulusType | null,
  userId?: string,
  previous?: SharedIntentionalityState | null,
  appraisal?: AppraisalAxes | null,
): SharedIntentionalityState {
  const relKey = userId ?? "_default";
  const relationship: RelationshipState = psyche.relationships[relKey]
    ?? { trust: 50, intimacy: 30, phase: "acquaintance" };

  const prev = previous ?? null;

  // 1. Update theory of mind
  const theoryOfMind = updateTheoryOfMind(
    stimulus,
    relationship,
    prev?.theoryOfMind,
    appraisal,
  );

  // 2. Detect / sustain joint attention
  const jointAttention = detectJointAttention(
    stimulus,
    prev?.jointAttention ?? null,
    appraisal,
  );

  // 3. Assess goal alignment
  const goalAlignment = assessGoalAlignment(
    theoryOfMind,
    jointAttention,
    relationship,
  );

  // 4. Compute mutual awareness
  const mutualAwareness = computeMutualAwareness(
    stimulus,
    jointAttention,
    relationship,
    prev?.mutualAwareness ?? 0,
    appraisal,
  );

  return {
    jointAttention,
    goalAlignment,
    theoryOfMind,
    mutualAwareness,
  };
}

// ── 7. buildSharedIntentionalityContext ───────────────────────

/**
 * Build a compact prompt-injectable context string for shared intentionality.
 *
 * Returns empty string when there's nothing meaningful to report
 * (low confidence, no joint attention, early interaction).
 * Only injects when the shared state carries useful signal.
 */
export function buildSharedIntentionalityContext(
  state: SharedIntentionalityState,
  locale: Locale,
): string {
  const isZh = locale === "zh";
  const lines: string[] = [];

  const { theoryOfMind, jointAttention, goalAlignment, mutualAwareness } = state;

  // Gate: skip injection when confidence is too low to be useful
  const hasJointAttention = jointAttention !== null && jointAttention.engagement > 0.3;
  const hasConfidentToM = theoryOfMind.confidence > 0.35;
  const hasMeaningfulAwareness = mutualAwareness > 0.3;

  if (!hasJointAttention && !hasConfidentToM && !hasMeaningfulAwareness) {
    return "";
  }

  const title = isZh ? "共享意向" : "Shared intentionality";
  lines.push(`[${title}]`);

  // Joint attention
  if (hasJointAttention && jointAttention) {
    const topicName = isZh
      ? TOPIC_NAMES_ZH[jointAttention.topic] ?? jointAttention.topic
      : jointAttention.topic;

    if (jointAttention.turnsSustained > 2 && jointAttention.engagement > 0.5) {
      lines.push(
        isZh
          ? `你们都沉浸在「${topicName}」的话题中(${jointAttention.turnsSustained}轮)。`
          : `You're both absorbed in ${topicName} (${jointAttention.turnsSustained} turns).`,
      );
    } else {
      lines.push(
        isZh
          ? `你们似乎都在关注「${topicName}」。`
          : `You both seem focused on ${topicName}.`,
      );
    }
  }

  // Theory of mind — what we sense about the other
  if (hasConfidentToM) {
    const intentDesc = isZh
      ? INTENT_NAMES_ZH[theoryOfMind.estimatedIntent]
      : INTENT_NAMES_EN[theoryOfMind.estimatedIntent];
    const moodDesc = isZh
      ? MOOD_NAMES_ZH[theoryOfMind.estimatedMood]
      : MOOD_NAMES_EN[theoryOfMind.estimatedMood];

    lines.push(
      isZh
        ? `你感觉对方${moodDesc}，似乎想要${intentDesc}。`
        : `You sense they're ${moodDesc} and want to ${intentDesc}.`,
    );
  }

  // Goal alignment — only when there's a clear signal
  if (goalAlignment.aligned && goalAlignment.divergence < 0.3) {
    lines.push(
      isZh
        ? "你们的目标方向一致。"
        : "Your goals are aligned.",
    );
  } else if (!goalAlignment.aligned && goalAlignment.divergence > 0.6) {
    lines.push(
      isZh
        ? "你感到你们的方向有些分歧。"
        : "You sense some divergence in direction.",
    );
  }

  // Mutual awareness — only at high levels
  if (mutualAwareness > 0.6) {
    lines.push(
      isZh
        ? "对方清楚地意识到你在关注他们。"
        : "The other is clearly aware of your attention.",
    );
  }

  // If we only got the title, nothing was worth injecting
  if (lines.length <= 1) {
    return "";
  }

  return lines.join("\n");
}

// ── i18n helpers ─────────────────────────────────────────────

const TOPIC_NAMES_ZH: Record<string, string> = {
  affirmation: "肯定与认可",
  connection: "情感连接",
  play: "轻松与玩笑",
  exploration: "探索与讨论",
  tension: "紧张与对立",
  casual: "日常闲聊",
  disengagement: "疏离",
};

const INTENT_NAMES_ZH: Record<EstimatedIntent, string> = {
  collaborative: "合作",
  adversarial: "对抗",
  disengaged: "脱离对话",
  exploratory: "探索",
  "support-seeking": "寻求支持",
};

const INTENT_NAMES_EN: Record<EstimatedIntent, string> = {
  collaborative: "collaborate",
  adversarial: "push back",
  disengaged: "disengage",
  exploratory: "explore",
  "support-seeking": "seek support",
};

const MOOD_NAMES_ZH: Record<EstimatedMood, string> = {
  positive: "心情不错",
  negative: "情绪低落",
  neutral: "状态平稳",
  mixed: "心情复杂",
};

const MOOD_NAMES_EN: Record<EstimatedMood, string> = {
  positive: "in a good mood",
  negative: "in a low mood",
  neutral: "neutral",
  mixed: "in a mixed state",
};

// ── Utility ──────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
