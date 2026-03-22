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

/** Relationship tracking */
export interface RelationshipState {
  trust: number;      // 0-100
  intimacy: number;   // 0-100
  phase: "stranger" | "acquaintance" | "familiar" | "close" | "deep";
  memory?: string[];  // compressed session summaries for cross-session continuity
}

/** Chemical state snapshot for emotional memory */
export interface ChemicalSnapshot {
  chemistry: ChemicalState;
  stimulus: StimulusType | null;
  dominantEmotion: string | null;
  timestamp: string;
}

/** Max history entries to keep */
export const MAX_EMOTIONAL_HISTORY = 10;

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

/** Persisted psyche state for an agent (v0.3: innate drives) */
export interface PsycheState {
  version: 3;
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
  meta: {
    agentName: string;
    createdAt: string;
    totalInteractions: number;
    locale: Locale;
  };
}

/** Default relationship for new users */
export const DEFAULT_RELATIONSHIP: RelationshipState = {
  trust: 50,
  intimacy: 30,
  phase: "acquaintance",
};
