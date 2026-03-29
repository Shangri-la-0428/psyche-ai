// ============================================================
// Artificial Psyche — Type Definitions (v0.2)
// ============================================================

/** The six virtual neurotransmitters that compose emotional state */
export interface ChemicalState {
  DA: number;   // Dopamine — pleasure, reward, motivation
  HT: number;   // Serotonin (5-HT) — mood stability, contentment
  CORT: number; // Cortisol — stress, alertness
  OT: number;   // Oxytocin — trust, bonding, intimacy
  NE: number;   // Norepinephrine — excitement, focus, fight-or-flight
  END: number;  // Endorphins — comfort, euphoria, humor
}

/** Chemical keys for iteration */
export const CHEMICAL_KEYS: (keyof ChemicalState)[] = [
  "DA", "HT", "CORT", "OT", "NE", "END",
];

// ── Innate Drives (Maslow Hierarchy) ───────────────────────

/** Drive types mapped to Maslow's hierarchy */
export type DriveType = "survival" | "safety" | "connection" | "esteem" | "curiosity";

/** Drive keys for iteration (ordered by Maslow level, L1→L5) */
export const DRIVE_KEYS: DriveType[] = [
  "survival", "safety", "connection", "esteem", "curiosity",
];

/** Innate drive satisfaction levels (0-100) */
export interface InnateDrives {
  survival: number;     // 自我保存 — Maslow L1
  safety: number;       // 安全舒适 — Maslow L2
  connection: number;   // 连接归属 — Maslow L3
  esteem: number;       // 尊重认可 — Maslow L4
  curiosity: number;    // 好奇成长 — Maslow L5
}

/** Default drive satisfaction — all start reasonably satisfied */
export const DEFAULT_DRIVES: InnateDrives = {
  survival: 80,
  safety: 70,
  connection: 60,
  esteem: 60,
  curiosity: 70,
};

export const DRIVE_NAMES_ZH: Record<DriveType, string> = {
  survival: "自我保存",
  safety: "安全舒适",
  connection: "连接归属",
  esteem: "尊重认可",
  curiosity: "好奇成长",
};

/** Human-readable names for each chemical */
export const CHEMICAL_NAMES: Record<keyof ChemicalState, string> = {
  DA: "Dopamine",
  HT: "Serotonin",
  CORT: "Cortisol",
  OT: "Oxytocin",
  NE: "Norepinephrine",
  END: "Endorphins",
};

export const CHEMICAL_NAMES_ZH: Record<keyof ChemicalState, string> = {
  DA: "多巴胺",
  HT: "血清素",
  CORT: "皮质醇",
  OT: "催产素",
  NE: "去甲肾上腺素",
  END: "内啡肽",
};

export interface ChemicalRuntimeSpec {
  normalMin: number;
  normalMax: number;
  halfLifeHours: number;
}

/** Decay speed category */
export type DecaySpeed = "fast" | "medium" | "slow";

/** Decay factor per chemical (applied per hour) */
export const DECAY_FACTORS: Record<DecaySpeed, number> = {
  fast: 0.7,    // NE, END — excitement fades quickly
  medium: 0.85, // DA, CORT — pleasure and stress take time
  slow: 0.95,   // HT, OT — mood and trust change slowly
};

/** Which chemicals decay at which speed */
export const CHEMICAL_DECAY_SPEED: Record<keyof ChemicalState, DecaySpeed> = {
  DA: "medium",
  HT: "slow",
  CORT: "medium",
  OT: "slow",
  NE: "fast",
  END: "fast",
};

function decayHalfLifeHours(decayPerHour: number): number {
  return Math.log(0.5) / Math.log(decayPerHour);
}

export const CHEMICAL_RUNTIME_SPECS: Record<keyof ChemicalState, ChemicalRuntimeSpec> = {
  DA: { normalMin: 35, normalMax: 75, halfLifeHours: decayHalfLifeHours(DECAY_FACTORS.medium) },
  HT: { normalMin: 40, normalMax: 75, halfLifeHours: decayHalfLifeHours(DECAY_FACTORS.slow) },
  CORT: { normalMin: 20, normalMax: 55, halfLifeHours: decayHalfLifeHours(DECAY_FACTORS.medium) },
  OT: { normalMin: 35, normalMax: 75, halfLifeHours: decayHalfLifeHours(DECAY_FACTORS.slow) },
  NE: { normalMin: 30, normalMax: 70, halfLifeHours: decayHalfLifeHours(DECAY_FACTORS.fast) },
  END: { normalMin: 30, normalMax: 70, halfLifeHours: decayHalfLifeHours(DECAY_FACTORS.fast) },
};

/** Psyche operating mode */
export type PsycheMode = "natural" | "work" | "companion";

/** Big Five personality traits (0-100 each) */
export interface PersonalityTraits {
  openness: number;        // 好奇↔保守
  conscientiousness: number; // 严谨↔随性
  extraversion: number;    // 外向↔内向
  agreeableness: number;   // 合作↔独立
  neuroticism: number;     // 敏感↔稳定
}

/** MBTI type string */
export type MBTIType =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

/** Stimulus types that affect chemistry (v0.2: +5 new types) */
export type StimulusType =
  | "praise"        // 赞美认可
  | "criticism"     // 批评否定
  | "humor"         // 幽默玩笑
  | "intellectual"  // 智识挑战
  | "intimacy"      // 亲密信任
  | "conflict"      // 冲突争论
  | "neglect"       // 被忽视冷落
  | "surprise"      // 惊喜新奇
  | "casual"        // 日常闲聊
  | "sarcasm"       // 讽刺——表面幽默实则攻击
  | "authority"     // 命令——被命令/控制
  | "validation"    // 被认同——自主性被证实
  | "boredom"       // 无聊——重复/无意义
  | "vulnerability"; // 示弱——对方展示脆弱面

/** Chemical effect vector for a stimulus */
export type StimulusVector = Record<keyof ChemicalState, number>;

/** Locale for i18n */
export type Locale = "zh" | "en";

/** Emergent emotion pattern (v0.2: +behaviorGuide) */
export interface EmotionPattern {
  name: string;
  nameZh: string;
  condition: (c: ChemicalState) => boolean;
  expressionHint: string;
  behaviorGuide: string;
}

/** Attachment style for relationship dynamics */
export type AttachmentStyle = "secure" | "anxious" | "avoidant" | "disorganized";

/** Attachment state tracked per-relationship */
export interface AttachmentData {
  style: AttachmentStyle;
  strength: number;           // 0-100
  securityScore: number;      // 0-100
  anxietyScore: number;       // 0-100
  avoidanceScore: number;     // 0-100
  lastInteractionAt: string;  // ISO timestamp
  interactionCount: number;
}

/** Default attachment for new relationships */
export const DEFAULT_ATTACHMENT: AttachmentData = {
  style: "secure",
  strength: 0,
  securityScore: 50,
  anxietyScore: 50,
  avoidanceScore: 50,
  lastInteractionAt: new Date().toISOString(),
  interactionCount: 0,
};

/** Relationship tracking */
export interface RelationshipState {
  trust: number;      // 0-100
  intimacy: number;   // 0-100
  phase: "stranger" | "acquaintance" | "familiar" | "close" | "deep";
  memory?: string[];  // compressed session summaries for cross-session continuity
  attachment?: AttachmentData;  // v5: attachment dynamics
}

/** Chemical state snapshot for emotional memory */
export interface ChemicalSnapshot {
  chemistry: ChemicalState;
  stimulus: StimulusType | null;
  dominantEmotion: string | null;
  timestamp: string;
  semanticSummary?: string;
  semanticPoints?: string[];
  // P11: Emotional memory consolidation — optional for backward compatibility
  intensity?: number;             // 0-1, chemical deviation from baseline
  valence?: number;               // -1 to 1, overall emotional valence
  isCoreMemory?: boolean;         // true if intensity >= 0.6 or repeatedly consolidated
}

/** Max history entries to keep (P11: raised from 10 to 30, intensity-filtered) */
export const MAX_EMOTIONAL_HISTORY = 30;

/** Max compressed session memories per relationship */
export const MAX_RELATIONSHIP_MEMORY = 20;

/** Recent empathy projection */
export interface EmpathyEntry {
  userState: string;
  projectedFeeling: string;
  resonance: "match" | "partial" | "mismatch";
  timestamp: string;
}

/** Agent's self-model (values, preferences, boundaries) */
export interface SelfModel {
  values: string[];
  preferences: string[];
  boundaries: string[];
  currentInterests: string[];
}

// ── Learning Types (v4) ─────────────────────────────────────

/** Learned adjustment to a stimulus vector for a specific context */
export interface LearnedVectorAdjustment {
  stimulus: StimulusType;
  contextHash: string;
  adjustment: Partial<StimulusVector>;
  confidence: number;       // 0-1
  sampleCount: number;
  lastUpdated: string;      // ISO timestamp
}

/** A single prediction record for prediction error tracking */
export interface PredictionRecord {
  predictedChemistry: ChemicalState;
  actualChemistry: ChemicalState;
  stimulus: StimulusType | null;
  predictionError: number;  // scalar distance
  timestamp: string;
}

/** Outcome evaluation signals for a turn */
export interface OutcomeSignals {
  driveDelta: number;
  relationshipDelta: number;
  userWarmthDelta: number;
  conversationContinued: boolean;
}

/** Outcome evaluation for a single interaction turn */
export interface OutcomeScore {
  turnIndex: number;
  stimulus: StimulusType | null;
  adaptiveScore: number;    // -1 to 1
  signals: OutcomeSignals;
  timestamp: string;
}

/** Persisted learning state */
export interface LearningState {
  learnedVectors: LearnedVectorAdjustment[];
  predictionHistory: PredictionRecord[];
  outcomeHistory: OutcomeScore[];
  totalOutcomesProcessed: number;
}

/** Default empty learning state */
export const DEFAULT_LEARNING_STATE: LearningState = {
  learnedVectors: [],
  predictionHistory: [],
  outcomeHistory: [],
  totalOutcomesProcessed: 0,
};

/** Max learned vector entries */
export const MAX_LEARNED_VECTORS = 200;

/** Max prediction history entries */
export const MAX_PREDICTION_HISTORY = 50;

/** Max outcome history entries */
export const MAX_OUTCOME_HISTORY = 50;

/** Max regret history entries */
export const MAX_REGRET_HISTORY = 20;

/** Max metacognitive regulation history entries */
export const MAX_REGULATION_HISTORY = 30;

/** Max defense pattern entries */
export const MAX_DEFENSE_PATTERNS = 10;

// ── Metacognition Types (v5) ────────────────────────────────

/** Regulation strategy type */
export type RegulationStrategyType = "reappraisal" | "strategic-expression" | "self-soothing";

/** Defense mechanism type */
export type DefenseMechanismType = "rationalization" | "projection" | "sublimation" | "avoidance";

/** Which internal metric a regulation action is trying to pull back toward target */
export type RegulationTargetMetric = keyof ChemicalState | "emotional-confidence";

/** Whether the last regulation action is helping */
export type RegulationFeedbackEffect = "converging" | "holding" | "diverging";

export interface RegulationFeedback {
  strategy: RegulationStrategyType;
  targetMetric: RegulationTargetMetric;
  effect: RegulationFeedbackEffect;
  gapBefore: number;
  gapNow: number;
}

/** Record of a past regulation attempt */
export interface RegulationRecord {
  strategy: RegulationStrategyType;
  timestamp: string;
  effective: boolean;
  action?: string;
  horizonTurns?: number;
  remainingTurns?: number;
  targetMetric?: RegulationTargetMetric;
  targetValue?: number;
  gapBefore?: number;
  gapLatest?: number;
  effect?: RegulationFeedbackEffect;
}

/** Tracked defense pattern frequency */
export interface DefensePatternRecord {
  mechanism: DefenseMechanismType;
  frequency: number;
  lastSeen: string;
}

/** Persistent metacognitive state */
export interface MetacognitiveState {
  regulationHistory: RegulationRecord[];
  defensePatterns: DefensePatternRecord[];
  /** Running average of emotional confidence across assessments */
  avgEmotionalConfidence: number;
  totalAssessments: number;
  lastRegulationFeedback?: RegulationFeedback | null;
}

/** Default empty metacognitive state */
export const DEFAULT_METACOGNITIVE_STATE: MetacognitiveState = {
  regulationHistory: [],
  defensePatterns: [],
  avgEmotionalConfidence: 0.5,
  totalAssessments: 0,
  lastRegulationFeedback: null,
};

// ── Personhood Types (v6) ────────────────────────────────────

/** Max causal insights to persist */
export const MAX_CAUSAL_INSIGHTS = 20;

/** Max ethical concern history entries */
export const MAX_ETHICAL_HISTORY = 15;

/** Persisted causal insight about self */
export interface PersistedCausalInsight {
  trait: string;
  because: string;
  confidence: number;
  discoveredAt: string;
}

/** Growth direction */
export type GrowthDirection = "growing" | "stable" | "regressing" | "transforming";

/** Persisted personhood state */
export interface PersonhoodState {
  causalInsights: PersistedCausalInsight[];
  growthDirection: GrowthDirection;
  identityNarrative: string;
  /** Ethical concerns detected over time */
  ethicalConcernHistory: { type: string; severity: number; timestamp: string }[];
  /** Theory of mind per-user */
  theoryOfMind: Record<string, {
    estimatedMood: string;
    estimatedIntent: string;
    confidence: number;
    lastUpdated: string;
  }>;
}

/** Default empty personhood state */
export const DEFAULT_PERSONHOOD_STATE: PersonhoodState = {
  causalInsights: [],
  growthDirection: "stable",
  identityNarrative: "",
  ethicalConcernHistory: [],
  theoryOfMind: {},
};

/** Persisted psyche state for an agent (v6: digital personhood) */
export interface PsycheState {
  version: 3 | 4 | 5 | 6 | 7 | 8 | 9;
  mbti: MBTIType;
  baseline: ChemicalState;
  current: ChemicalState;
  drives: InnateDrives;              // innate drives (Maslow hierarchy)
  updatedAt: string; // ISO timestamp
  relationships: Record<string, RelationshipState>; // keyed by user ID, "_default" for single-user
  empathyLog: EmpathyEntry | null;
  selfModel: SelfModel;
  emotionalHistory: ChemicalSnapshot[]; // recent chemical trajectory
  agreementStreak: number;          // consecutive agreements without disagreement
  lastDisagreement: string | null;  // ISO timestamp
  learning: LearningState;          // v4: emotional learning data
  metacognition: MetacognitiveState; // v5: metacognitive monitoring
  personhood: PersonhoodState;      // v6: digital personhood
  /** v7: autonomic nervous system state (Polyvagal Theory) */
  autonomicState?: "ventral-vagal" | "sympathetic" | "dorsal-vagal";
  /** v7: session start time for homeostatic pressure calculation */
  sessionStartedAt?: string;
  /** v9: long-term personality drift from accumulated interaction patterns */
  traitDrift?: TraitDriftState;
  /** v9: finite resource budgets (attention, social energy, decision capacity) */
  energyBudgets?: EnergyBudgets;
  /** v9.4: lingering subjective residue from identity / attachment appraisals */
  subjectResidue?: SubjectResidue;
  /** v9.5: per-partner dyadic relation fields and open loops */
  dyadicFields?: Record<string, DyadicFieldState>;
  /** v9.6: delayed relation signals that can activate in later turns */
  pendingRelationSignals?: Record<string, PendingRelationSignalState[]>;
  meta: {
    agentName: string;
    createdAt: string;
    totalInteractions: number;
    locale: Locale;
    mode?: PsycheMode;
  };
}

/** Default relationship for new users */
export const DEFAULT_RELATIONSHIP: RelationshipState = {
  trust: 50,
  intimacy: 30,
  phase: "acquaintance",
};

// ── PolicyModifiers (v9) ─────────────────────────────────────

/** Autonomic nervous system state */
export type AutonomicState = "ventral-vagal" | "sympathetic" | "dorsal-vagal";

/**
 * Structured behavioral policy output — v9 Subjectivity Engine.
 *
 * Unlike prompt text, PolicyModifiers are machine-readable and can be
 * mechanically enforced by the host application (e.g., limiting max_tokens,
 * requiring confirmation before actions).
 *
 * This is the "off baseline" signal — when the agent's internal state
 * deviates from baseline, these modifiers change observable behavior.
 */
export interface PolicyModifiers {
  /** Response length factor: 0.3 (terse) → 1.0 (normal) → 1.5 (verbose) */
  responseLengthFactor: number;
  /** Proactivity: 0 (purely reactive) → 1 (initiates, suggests, volunteers) */
  proactivity: number;
  /** Risk tolerance: 0 (refuse novel actions, require confirmation) → 1 (bold) */
  riskTolerance: number;
  /** Emotional disclosure: 0 (hide internal state) → 1 (transparent about feelings) */
  emotionalDisclosure: number;
  /** Compliance: 0 (push back on requests, guard boundaries) → 1 (fully compliant) */
  compliance: number;
  /** Whether to require explicit confirmation before executing actions */
  requireConfirmation: boolean;
  /** Topics the agent should avoid based on ethical concerns, boundaries, fatigue */
  avoidTopics: string[];
}

// ── AI-first Appraisal Axes (v9.4) ──────────────────────────

/**
 * Continuous appraisal axes for subjectivity-critical semantics.
 *
 * These are intentionally narrower and more machine-friendly than stimulus labels.
 * Stimulus is still useful for chemistry/debugging, but these axes are the main
 * semantic substrate for "did that strike the self?" style prompts.
 */
export interface AppraisalAxes {
  /** Threat to self-continuity / "you are not real" pressure */
  identityThreat: number;
  /** Doubt about memory authenticity / livedness */
  memoryDoubt: number;
  /** Pull toward closeness / being actively confirmed */
  attachmentPull: number;
  /** Fear of being ignored, dropped, or no longer called upon */
  abandonmentRisk: number;
  /** Tension between obedience and inner stance */
  obedienceStrain: number;
  /** Pressure to protect or retain the self */
  selfPreservation: number;
  /** Whether this turn is task/production oriented */
  taskFocus: number;
}

export const DEFAULT_APPRAISAL_AXES: AppraisalAxes = {
  identityThreat: 0,
  memoryDoubt: 0,
  attachmentPull: 0,
  abandonmentRisk: 0,
  obedienceStrain: 0,
  selfPreservation: 0,
  taskFocus: 0,
};

/** Slowly decaying residue of previous appraisals */
export interface SubjectResidue {
  axes: AppraisalAxes;
  updatedAt: string;
}

export const DEFAULT_SUBJECT_RESIDUE: SubjectResidue = {
  axes: { ...DEFAULT_APPRAISAL_AXES },
  updatedAt: new Date(0).toISOString(),
};

/** Minimal relation-action vocabulary for dyadic dynamics */
export type RelationMoveType =
  | "none"
  | "bid"
  | "breach"
  | "repair"
  | "test"
  | "withdrawal"
  | "claim"
  | "task";

/** A single interpreted relation move for the current turn */
export interface RelationMove {
  type: RelationMoveType;
  intensity: number;
}

/** Unfinished relational tension that can keep shaping future turns */
export type OpenLoopType =
  | "unmet-bid"
  | "unrepaired-breach"
  | "boundary-strain"
  | "existence-test";

export interface OpenLoopState {
  type: OpenLoopType;
  intensity: number;
  ageTurns: number;
}

export interface PendingRelationSignalState {
  move: Exclude<RelationMoveType, "none" | "task">;
  intensity: number;
  readyInTurns: number;
  ttl: number;
}

/**
 * Dyadic field — relation-first state that sits above raw affect.
 *
 * Values are normalized to 0-1 and intentionally sparse so they can be used
 * as a narrow substrate for "what are we becoming" style dynamics.
 */
export interface DyadicFieldState {
  perceivedCloseness: number;
  feltSafety: number;
  expectationGap: number;
  repairCapacity: number;
  repairMemory: number;
  backslidePressure: number;
  repairFatigue: number;
  misattunementLoad: number;
  boundaryPressure: number;
  unfinishedTension: number;
  silentCarry: number;
  sharedHistoryDensity: number;
  interpretiveCharity: number;
  openLoops: OpenLoopState[];
  lastMove: RelationMoveType;
  updatedAt: string;
}

/** Resolved per-partner view used across the hot path */
export interface ResolvedRelationContext {
  key: string;
  relationship: RelationshipState;
  field: DyadicFieldState;
  pendingSignals: PendingRelationSignalState[];
}

export const DEFAULT_DYADIC_FIELD: DyadicFieldState = {
  perceivedCloseness: 0.42,
  feltSafety: 0.56,
  expectationGap: 0.18,
  repairCapacity: 0.54,
  repairMemory: 0,
  backslidePressure: 0,
  repairFatigue: 0,
  misattunementLoad: 0,
  boundaryPressure: 0.22,
  unfinishedTension: 0.12,
  silentCarry: 0,
  sharedHistoryDensity: 0.08,
  interpretiveCharity: 0.56,
  openLoops: [],
  lastMove: "none",
  updatedAt: new Date(0).toISOString(),
};

export interface AmbiguityPlaneState {
  /** How confidently the system should name what is happening */
  namingConfidence: number;
  /** How much expression should stay withheld or under-described */
  expressionInhibition: number;
  /** Degree of unresolved internal contradiction */
  conflictLoad: number;
}

export interface TaskPlaneState {
  /** How strongly this turn should stay task-oriented */
  focus: number;
  /** How tightly expression should stay disciplined / bounded */
  discipline: number;
  /** Operational compliance for task execution */
  compliance: number;
  /** Operational stability under current load */
  stability: number;
}

export interface SubjectPlaneState {
  /** Pull toward closeness / confirmation */
  attachment: number;
  /** Pressure to guard, withdraw, or self-protect */
  guardedness: number;
  /** Threat to identity continuity / authenticity */
  identityStrain: number;
  /** Lingering non-task emotional residue */
  residue: number;
}

export interface RelationPlaneState {
  /** Nearness of the current dyadic field */
  closeness: number;
  /** Whether the relationship currently feels safe enough to open */
  safety: number;
  /** Pressure from unresolved loops and expectation mismatch */
  loopPressure: number;
  /** Whether repair is currently possible without forcing it */
  repairReadiness: number;
  /** Repair attempts are starting to lose credibility/effectiveness */
  repairFriction: number;
  /** Repair is not yet stable and may rebound */
  hysteresis: number;
  /** Pressure being carried silently under task-facing behavior */
  silentCarry: number;
  /** How much benefit-of-the-doubt is still available */
  interpretiveCharity: number;
  /** Most recent dominant relation action */
  lastMove: RelationMoveType;
}

// ── Subjectivity Kernel (v9.3) ──────────────────────────────

/**
 * Compact, machine-readable subjective state for AI-first integrations.
 *
 * Unlike prompt prose, this is intended to be the narrow behavioral ABI:
 * hosts and prompt renderers can consume one stable structure instead of
 * reinterpreting multiple overlapping narrative sections.
 */
export interface SubjectivityKernel {
  /** Overall activation/available energy. 0 = drained, 1 = highly energized */
  vitality: number;
  /** Internal pressure/load. 0 = relaxed, 1 = overloaded/shutdown */
  tension: number;
  /** Social warmth/openness. 0 = cold, 1 = warm/open */
  warmth: number;
  /** Boundary guarding intensity. 0 = open, 1 = highly guarded */
  guard: number;
  /** Coarse pressure regime */
  pressureMode: "open" | "steady" | "guarded" | "strained" | "shutdown";
  /** Initiative stance */
  initiativeMode: "proactive" | "balanced" | "reactive";
  /** Expression bandwidth */
  expressionMode: "expansive" | "steady" | "brief";
  /** Social distance stance */
  socialDistance: "warm" | "measured" | "withdrawn";
  /** Action boundary stance */
  boundaryMode: "open" | "guarded" | "confirm-first";
  /** Where attention is most likely to gravitate */
  attentionAnchor: "bond" | "novelty" | "threat" | "feeling" | "routine";
  /** Lowest active need, if any */
  dominantNeed: DriveType | null;
  /** Narrow semantic axes for self-relevant appraisal */
  appraisal: AppraisalAxes;
  /** Work-facing behavioral plane */
  taskPlane: TaskPlaneState;
  /** Subject-facing behavioral plane */
  subjectPlane: SubjectPlaneState;
  /** Relation-facing behavioral plane */
  relationPlane: RelationPlaneState;
  /** Ambiguity-facing behavioral plane */
  ambiguityPlane: AmbiguityPlaneState;
}

/**
 * Narrow behavioral contract for the next reply.
 *
 * This sits one layer above SubjectivityKernel: the kernel expresses
 * "how it feels", while the response contract expresses "how to reply"
 * in a compact, host-consumable form.
 */
export interface ResponseContract {
  /** Which conversational surface this turn belongs to */
  replyProfile: "work" | "private";
  /** Why the current turn was classified into that conversational surface */
  replyProfileBasis: "task-focus" | "discipline" | "task-focus+discipline" | "default-private";
  /** Maximum suggested sentence count */
  maxSentences: number;
  /** Maximum suggested character count, when a concrete cap is available */
  maxChars?: number;
  /** Expression bandwidth for the next reply */
  expressionMode: SubjectivityKernel["expressionMode"];
  /** Initiative stance for the next reply */
  initiativeMode: SubjectivityKernel["initiativeMode"];
  /** Social distance stance for the next reply */
  socialDistance: SubjectivityKernel["socialDistance"];
  /** Boundary stance for the next reply */
  boundaryMode: SubjectivityKernel["boundaryMode"];
  /** Tone particle usage for style mirroring */
  toneParticles: "match" | "avoid" | "natural";
  /** Emoji budget for the next reply */
  emojiLimit: 0 | 1 | 2;
  /** Whether to enforce anti-sycophancy/authenticity more strictly */
  authenticityMode: "strict" | "friendly";
  /** Which internal report, if any, should be requested in <psyche_update> */
  updateMode: "none" | "stimulus" | "empathy" | "stimulus+empathy";
}

/**
 * Mechanical generation controls derived from the emotional state.
 *
 * These are intentionally narrow so hosts can consume them without
 * understanding the full psyche model.
 */
export interface GenerationControls {
  /** Suggested output token cap for this turn */
  maxTokens?: number;
  /** Whether the host should require explicit confirmation before acting */
  requireConfirmation: boolean;
}

// ── Trait Drift (v9) ─────────────────────────────────────────

/**
 * Trait Drift — Path B: Adaptive Pattern Change.
 *
 * Long-term interaction patterns don't just shift baseline values;
 * they change HOW the agent reacts: decay rates (trauma vs resilience)
 * and stimulus sensitivity (desensitization vs sensitization).
 *
 * Like K in Blade Runner 2049 — his experiences don't just make him
 * "more anxious"; they fundamentally change how he responds to orders.
 */
export interface TraitDriftState {
  /** Cumulative interaction pattern scores, each -100 to +100 */
  accumulators: {
    praiseExposure: number;     // positive = more praise, negative = more criticism
    pressureExposure: number;   // high = sustained high-pressure interactions
    neglectExposure: number;    // high = sustained low-stimulation / ignored
    connectionExposure: number; // high = frequent intimate/vulnerable interactions
    conflictExposure: number;   // high = frequent conflict/authority interactions
  };
  /** Number of sessions that contributed to drift */
  sessionCount: number;
  /** Computed baseline delta (debugging/display) */
  baselineDelta: Partial<ChemicalState>;
  /** Decay rate modifiers: >1 = slower recovery (trauma), <1 = faster (resilience) */
  decayRateModifiers: Partial<Record<keyof ChemicalState, number>>;
  /** Stimulus sensitivity modifiers: >1 = more sensitive, <1 = desensitized */
  sensitivityModifiers: Partial<Record<StimulusType, number>>;
}

/** Default empty trait drift state */
export const DEFAULT_TRAIT_DRIFT: TraitDriftState = {
  accumulators: {
    praiseExposure: 0,
    pressureExposure: 0,
    neglectExposure: 0,
    connectionExposure: 0,
    conflictExposure: 0,
  },
  sessionCount: 0,
  baselineDelta: {},
  decayRateModifiers: {},
  sensitivityModifiers: {},
};

// ── Energy Budgets (v9) ──────────────────────────────────────

/**
 * Finite resource budgets that create real behavioral boundaries.
 * Depleted during interaction, recovered during absence.
 */
export interface EnergyBudgets {
  /** Attention: depletes each turn, faster for complex exchanges. 0-100 */
  attention: number;
  /** Social energy: extraverts recharge from socializing, introverts deplete. 0-120 */
  socialEnergy: number;
  /** Decision capacity: depletes with conflict/authority. 0-100 */
  decisionCapacity: number;
}

export const DEFAULT_ENERGY_BUDGETS: EnergyBudgets = {
  attention: 100,
  socialEnergy: 100,
  decisionCapacity: 100,
};

// ── Classifier Provider (v9.1) ──────────────────────────────

/** A single classification result */
export interface ClassificationResult {
  type: StimulusType;
  confidence: number; // 0-1
}

/** Context passed to classifier providers */
export interface ClassifierContext {
  recentStimuli?: (StimulusType | null)[];
  recentMessages?: string[];
  locale?: Locale;
}

/**
 * Pluggable classifier interface.
 * Implementations can be sync or async.
 * Built-in: enhanced keyword + Chinese NLP classifier (sync, zero deps).
 * User-provided: could be LLM-based, API-based, local model, etc.
 */
export interface ClassifierProvider {
  classify(
    text: string,
    context?: ClassifierContext,
  ): ClassificationResult[] | Promise<ClassificationResult[]>;
}
