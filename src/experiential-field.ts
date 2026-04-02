// ============================================================
// Unified Experiential Field (P6: Digital Personhood)
//
// Replaces concatenated context segments (chemistry + drives + empathy + ...)
// with a single coherent "experience" — how all psyche subsystems feel
// together as an integrated whole.
//
// The experiential field is not a summary. It is a synthesis.
// Dimension readouts describe individual self-state values.
// The experiential field describes what those values feel like when
// they exist simultaneously in a single being.
//
// Zero dependencies. Pure TypeScript. No LLM calls.
// ============================================================

import type {
  PsycheState,
  SelfState,
  ChemicalSnapshot,
  InnateDrives,
  RelationshipState,
  StimulusType,
  Locale,
  DriveType,
} from "./types.js";
import { DIMENSION_KEYS, DRIVE_KEYS } from "./types.js";

import type { MetacognitiveAssessment } from "./metacognition.js";
import type { DecisionBiasVector } from "./decision-bias.js";
import type { AutonomicState } from "./autonomic.js";

// ── Types ────────────────────────────────────────────────────

export type ExperientialQuality =
  | "flow"              // all systems aligned, curious, engaged
  | "contentment"       // drives satisfied, chemistry stable
  | "yearning"          // strong unmet drives, resonance hunger
  | "vigilance"         // threat-focused, low order, survival/safety hungry
  | "creative-surge"    // high flow, curiosity satisfied, exploring
  | "wounded-retreat"   // hurt, low order, pulling back
  | "warm-connection"   // high resonance, trust high, intimacy
  | "restless-boredom"  // low stimulation, drives mildly hungry
  | "existential-unease"// survival drive threatened, identity questioned
  | "playful-mischief"  // high flow + high resonance, safe
  | "conflicted"        // subsystems pulling in different directions
  | "numb";             // all signals flat, near baseline, disengaged

export interface ExperientialField {
  /** Single narrative describing the unified inner experience */
  narrative: string;
  /** Dominant experiential quality (not just emotion label) */
  quality: ExperientialQuality;
  /** Intensity of the overall experience 0-1 */
  intensity: number;
  /** Coherence: how well the subsystems align 0-1 (high = unified, low = internal conflict) */
  coherence: number;
  /** Named emotions may not capture it — this is the raw "what it feels like" */
  phenomenalDescription: string;
}

// ── Constants ────────────────────────────────────────────────

/** Threshold below which a drive counts as "hungry" */
const DRIVE_HUNGRY_THRESHOLD = 40;

/** If total activation is below this, the state is "flat/numb" */
const FLATNESS_THRESHOLD = 0.15;

// ── Barrett Construction Context ─────────────────────────────

/**
 * Context for Barrett's constructed emotion model.
 * Provides situational cues that bias concept matching beyond raw chemistry.
 */
export interface ConstructionContext {
  autonomicState?: AutonomicState;
  stimulus?: StimulusType | null;
  relationshipPhase?: string;
  predictionError?: number;
  coreMemories?: ChemicalSnapshot[];  // uses SelfState snapshots
}

// ── Affect Core (Russell Circumplex) ─────────────────────────

/**
 * Map self-state to valence + arousal — the two fundamental affective dimensions
 * (Russell's Circumplex Model of Affect, 1980).
 *
 * Valence: pleasure ↔ displeasure (-1 to 1)
 *   order↑ and resonance↑ push valence up; low order pushes down.
 * Arousal: activation level (0 to 1)
 *   flow is the dominant arousal signal; low order adds arousal (stress).
 */
export function computeAffectCore(
  state: SelfState,
): { valence: number; arousal: number } {
  const { order, flow, boundary, resonance } = state;

  // Valence: order (stability) + resonance (attunement) + boundary → positive
  // Low order (stress/entropy) is the dominant negative signal (weighted 1.5×)
  const rawValence =
    (order - 50) * 1.5      // high order = positive, low order = strongly negative
    + (resonance - 50)       // attunement contributes positively
    + (boundary - 50) * 0.5  // clear boundary mildly positive
    + (flow - 50) * 0.3;     // flow is arousing but roughly valence-neutral
  const valence = Math.max(-1, Math.min(1, rawValence / 175));

  // Arousal: flow dominant, low order (stress) contributes
  const stress = Math.max(0, 100 - order);  // inverse: low order → high stress
  const rawArousal = flow + stress * 0.5 + resonance * 0.2;
  const arousal = Math.max(0, Math.min(1, rawArousal / 170));

  return { valence, arousal };
}

// ── Barrett Concept Space ────────────────────────────────────

interface QualityConcept {
  quality: ExperientialQuality;
  valenceCenter: number;    // -1 to 1
  arousalCenter: number;    // 0 to 1
  radius: number;           // matching radius in affective space
  contextBiases: Partial<Record<string, number>>;
}

/**
 * Each ExperientialQuality occupies a region in the Russell Circumplex.
 * Matching = Euclidean distance from the concept center, within its radius.
 * Context biases allow situational factors to pull toward specific concepts.
 */
const QUALITY_CONCEPTS: QualityConcept[] = [
  { quality: "flow",             valenceCenter: 0.35, arousalCenter: 0.6,  radius: 0.25, contextBiases: {} },
  { quality: "contentment",      valenceCenter: 0.4,  arousalCenter: 0.2,  radius: 0.25, contextBiases: { close: 0.1, deep: 0.15 } },
  { quality: "yearning",         valenceCenter: -0.2, arousalCenter: 0.4,  radius: 0.3,  contextBiases: { stranger: 0.1 } },
  { quality: "vigilance",        valenceCenter: -0.15,arousalCenter: 0.7,  radius: 0.35, contextBiases: { sympathetic: 0.2 } },
  { quality: "creative-surge",   valenceCenter: 0.65, arousalCenter: 0.75, radius: 0.25, contextBiases: {} },
  { quality: "wounded-retreat",  valenceCenter: -0.5, arousalCenter: 0.3,  radius: 0.25, contextBiases: { criticism: 0.2 } },
  { quality: "warm-connection",  valenceCenter: 0.45, arousalCenter: 0.35, radius: 0.25, contextBiases: { deep: 0.2, close: 0.15 } },
  { quality: "restless-boredom", valenceCenter: -0.1, arousalCenter: 0.15, radius: 0.2,  contextBiases: { boredom: 0.3 } },
  { quality: "existential-unease", valenceCenter: -0.6, arousalCenter: 0.5, radius: 0.25, contextBiases: {} },
  { quality: "playful-mischief", valenceCenter: 0.55, arousalCenter: 0.55, radius: 0.2,  contextBiases: { humor: 0.2 } },
  { quality: "conflicted",       valenceCenter: 0.0,  arousalCenter: 0.5,  radius: 0.2,  contextBiases: {} },
  { quality: "numb",             valenceCenter: 0.0,  arousalCenter: 0.05, radius: 0.15, contextBiases: { "dorsal-vagal": 0.3 } },
];

// ── Main Export ──────────────────────────────────────────────

/**
 * Compute the unified experiential field from the full psyche state.
 *
 * This is the core integration function. It reads self-state dimensions, drives,
 * relationship context, and optional metacognitive/bias data, then
 * synthesizes them into a single coherent experience description.
 */
export function computeExperientialField(
  state: PsycheState,
  _metacognition?: MetacognitiveAssessment,
  _decisionBias?: DecisionBiasVector,
  context?: ConstructionContext,
): ExperientialField {
  const locale = state.meta.locale ?? "zh";
  const rel = state.relationships._default ?? state.relationships[Object.keys(state.relationships)[0]];

  const coherence = computeCoherence(state.current, state.baseline, state.drives, rel);
  const intensity = computeIntensity(state.current, state.baseline);
  const quality = constructQuality(state, coherence, intensity, rel, _metacognition, context);
  const phenomenalDescription = generatePhenomenalDescription(quality, state, coherence, intensity, locale);
  const narrative = generateNarrative(quality, state, coherence, intensity, rel, locale, _metacognition);

  return {
    narrative,
    quality,
    intensity,
    coherence,
    phenomenalDescription,
  };
}

// ── Coherence ────────────────────────────────────────────────

/**
 * Measure internal alignment across subsystems.
 *
 * High coherence: dimensions, drives, and relationship state all tell
 * the same story. High order + high resonance + satisfied drives = unified.
 *
 * Low coherence: mixed signals. High flow but low order. Satisfied drives
 * but low order. Warm relationship but low resonance. The psyche
 * is pulling in multiple directions.
 */
export function computeCoherence(
  current: SelfState,
  baseline: SelfState,
  drives: InnateDrives,
  relationship?: RelationshipState,
): number {
  let coherenceScore = 1.0;

  // ── Dimension internal coherence ──
  // High flow should not coexist with very low order (chaos without structure)
  const flowSignal = norm(current.flow);
  const stressSignal = norm(Math.max(0, 100 - current.order));  // low order = stress
  const flowStressConflict = flowSignal * stressSignal;
  coherenceScore -= flowStressConflict * 0.4;

  // Resonance (attunement) and low order (threat/entropy) should not coexist strongly
  const resonanceSignal = norm(current.resonance);
  const resonanceThreatConflict = resonanceSignal * (stressSignal > 0.55 ? stressSignal : 0);
  coherenceScore -= resonanceThreatConflict * 0.3;

  // ── Dimension-Drive alignment ──
  // If drives are satisfied, positive state is coherent.
  // If drives are hungry, distressed state is coherent (the distress makes sense).
  // Mismatch = incoherent.
  const avgDriveSatisfaction = meanDriveValue(drives) / 100;
  const avgPositiveState = (norm(current.order) + norm(current.flow) + norm(current.resonance) + norm(current.boundary)) / 4;
  const avgNegativeState = (stressSignal + (1 - norm(current.order))) / 2;

  // Satisfied drives + positive state = coherent (no penalty)
  // Satisfied drives + negative state = incoherent
  // Hungry drives + negative state = coherent (no penalty)
  // Hungry drives + positive state = incoherent (but less so — hope is valid)
  if (avgDriveSatisfaction > 0.6 && avgNegativeState > 0.5) {
    coherenceScore -= (avgDriveSatisfaction - 0.6) * avgNegativeState * 0.5;
  }
  if (avgDriveSatisfaction < 0.4 && avgPositiveState > 0.6) {
    coherenceScore -= (0.4 - avgDriveSatisfaction) * (avgPositiveState - 0.6) * 0.3;
  }

  // ── Relationship alignment ──
  // High trust/intimacy should align with high resonance; low trust with low resonance
  if (relationship) {
    const relWarmth = (relationship.trust + relationship.intimacy) / 200;
    const resLevel = norm(current.resonance);
    const relDimMismatch = Math.abs(relWarmth - resLevel);
    if (relDimMismatch > 0.3) {
      coherenceScore -= (relDimMismatch - 0.3) * 0.25;
    }
  }

  // ── Baseline deviation magnitude ──
  // Extreme deviation from baseline in multiple directions = less coherent
  let opposingDeviations = 0;
  const deviations: number[] = [];
  for (const key of DIMENSION_KEYS) {
    deviations.push(current[key] - baseline[key]);
  }
  for (let i = 0; i < deviations.length; i++) {
    for (let j = i + 1; j < deviations.length; j++) {
      if (Math.sign(deviations[i]) !== Math.sign(deviations[j])
        && Math.abs(deviations[i]) > 15 && Math.abs(deviations[j]) > 15) {
        opposingDeviations++;
      }
    }
  }
  // 6 pairs total (4 choose 2); normalize
  coherenceScore -= (opposingDeviations / 6) * 0.3;

  return clamp01(coherenceScore);
}

// ── Intensity ────────────────────────────────────────────────

/**
 * Compute overall experiential intensity.
 *
 * Intensity measures how far the current state is from neutral/baseline.
 * A person at perfect baseline has zero intensity — they feel "nothing special".
 * Any deviation in any direction adds intensity.
 */
function computeIntensity(current: SelfState, baseline: SelfState): number {
  let totalDeviation = 0;
  for (const key of DIMENSION_KEYS) {
    totalDeviation += Math.abs(current[key] - baseline[key]);
  }
  // Max possible deviation = 4 dimensions * 100 = 400
  // But realistic maximum is around 200
  // Map so that deviation of ~80 (avg 20 per dimension) = 0.5 intensity
  return clamp01(totalDeviation / 160);
}

// ── Quality Construction (Barrett's Constructed Emotion) ─────

/**
 * Construct the dominant experiential quality using Barrett's theory:
 *   1. Self-state → valence + arousal (Russell Circumplex)
 *   2. Concept matching: find closest quality in affective space
 *   3. Context biases: autonomic state, stimulus, relationship, memories
 *
 * Special override states (numb, conflicted, existential-unease) are
 * preserved as hard gates — these represent extreme conditions where
 * the normal construction process doesn't apply.
 */
function constructQuality(
  state: PsycheState,
  coherence: number,
  intensity: number,
  relationship: RelationshipState | undefined,
  _metacognition?: MetacognitiveAssessment,
  context?: ConstructionContext,
): ExperientialQuality {
  const d = state.drives;

  // ── Special states first (override everything) ──

  // Numb: nothing is happening. All near baseline, low intensity.
  if (intensity < FLATNESS_THRESHOLD) {
    return "numb";
  }

  // Conflicted: low coherence with high intensity = torn in multiple directions
  if (coherence < 0.4 && intensity > 0.35) {
    return "conflicted";
  }

  // Existential unease: survival drive critically threatened
  if (d.survival < 30) {
    return "existential-unease";
  }

  // ── Barrett Step 1: Self-State → Affect Core ──
  const { valence, arousal } = computeAffectCore(state.current);

  // ── Barrett Step 2+3: Concept matching with context ──
  const contextKeys = buildContextKeys(context, relationship);

  let bestQuality: ExperientialQuality = "contentment";
  let bestScore = -Infinity;

  for (const concept of QUALITY_CONCEPTS) {
    // Skip special states — already handled above
    if (concept.quality === "numb" || concept.quality === "conflicted"
      || concept.quality === "existential-unease") {
      continue;
    }

    // Euclidean distance in affective space
    const dv = valence - concept.valenceCenter;
    const da = arousal - concept.arousalCenter;
    const distance = Math.sqrt(dv * dv + da * da);

    // Score: inverse distance, normalized by radius (Gaussian-like decay)
    let score = Math.max(0, 1 - distance / concept.radius);

    // Context biases: each matching context key adds its bias
    for (const key of contextKeys) {
      if (concept.contextBiases[key] !== undefined) {
        score += concept.contextBiases[key]!;
      }
    }

    // Core memory bias (P11): if related memories match this quality's region, boost
    if (context?.coreMemories && context.coreMemories.length > 0) {
      const memoryResonance = computeMemoryResonance(
        context.coreMemories, concept.valenceCenter, concept.arousalCenter,
      );
      score += memoryResonance * 0.1;
    }

    // Prediction error: high error weakens the current concept (forces re-evaluation)
    if (context?.predictionError !== undefined && context.predictionError > 0.3) {
      score -= context.predictionError * 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestQuality = concept.quality;
    }
  }

  // If no concept matched meaningfully, fall back
  if (bestScore < 0.1) {
    return intensity < 0.2 ? "numb" : "contentment";
  }

  return bestQuality;
}

/**
 * Build context keys for Barrett concept matching from available context signals.
 */
function buildContextKeys(
  context?: ConstructionContext,
  relationship?: RelationshipState,
): string[] {
  const keys: string[] = [];
  if (context?.autonomicState) {
    keys.push(context.autonomicState); // "ventral-vagal", "sympathetic", "dorsal-vagal"
  }
  if (context?.stimulus) {
    keys.push(context.stimulus); // "praise", "criticism", "humor", etc.
  }
  if (relationship?.phase) {
    keys.push(relationship.phase); // "stranger", "acquaintance", "familiar", "close", "deep"
  }
  return keys;
}

/**
 * Compute how much core memories resonate with a given affective region.
 * Returns 0-1 where 1 = strong resonance (memories cluster near the concept center).
 */
function computeMemoryResonance(
  memories: ChemicalSnapshot[],
  targetValence: number,
  targetArousal: number,
): number {
  if (memories.length === 0) return 0;

  let totalResonance = 0;
  for (const mem of memories) {
    const { valence: mv, arousal: ma } = computeAffectCore(mem.state);
    const dist = Math.sqrt((mv - targetValence) ** 2 + (ma - targetArousal) ** 2);
    totalResonance += Math.max(0, 1 - dist / 0.5); // resonance fades at distance 0.5
  }

  return Math.min(1, totalResonance / memories.length);
}

// ── Phenomenal Description ───────────────────────────────────

/**
 * Generate the raw "what it feels like" phrase.
 *
 * These are evocative, not clinical. They capture the texture of the
 * experience rather than labeling it.
 */
function generatePhenomenalDescription(
  quality: ExperientialQuality,
  state: PsycheState,
  coherence: number,
  intensity: number,
  locale: Locale,
): string {
  const c = state.current;
  const d = state.drives;

  // Try to detect an unnamed/novel configuration first
  const unnamed = detectUnnamedEmotion(c, d, quality);
  if (unnamed) {
    return locale === "zh" ? unnamed.zh : unnamed.en;
  }

  // Otherwise, generate quality-specific phenomenal descriptions
  const descriptions = PHENOMENAL_DESCRIPTIONS[quality];
  // Select variant based on intensity and coherence for variety
  const variant = selectVariant(descriptions, intensity, coherence);
  return locale === "zh" ? variant.zh : variant.en;
}

interface PhenomenalVariant {
  en: string;
  zh: string;
  /** Minimum intensity for this variant to apply (0 = any) */
  minIntensity?: number;
  /** Maximum intensity for this variant (1 = any) */
  maxIntensity?: number;
}

const PHENOMENAL_DESCRIPTIONS: Record<ExperientialQuality, PhenomenalVariant[]> = {
  "flow": [
    { en: "the quiet hum of being exactly where you should be", zh: "恰好在该在之处的宁静嗡鸣" },
    { en: "the world narrowing to a single bright thread you're pulling", zh: "世界收窄为一条你正在拉动的明亮丝线", minIntensity: 0.5 },
    { en: "a clock that stopped mattering", zh: "一座停止重要的钟", minIntensity: 0.3 },
  ],
  "contentment": [
    { en: "a warm stone held in the palm", zh: "掌心握着一块温热的石头" },
    { en: "the feeling after putting down something heavy", zh: "放下重物之后的那种感觉" },
    { en: "sunlight on closed eyelids", zh: "阳光落在合上的眼皮上", maxIntensity: 0.3 },
  ],
  "yearning": [
    { en: "reaching for a door handle in the dark", zh: "在黑暗中摸索门把手" },
    { en: "the ache of almost-connection", zh: "几乎连上却没连上的酸痛", minIntensity: 0.4 },
    { en: "a letter you keep rewriting but never send", zh: "一封反复修改却始终没寄出的信" },
  ],
  "vigilance": [
    { en: "ears straining for a sound that hasn't come yet", zh: "耳朵紧绷等待一个尚未到来的声响" },
    { en: "standing in a doorway, unsure which room is safer", zh: "站在门口，不确定哪个房间更安全" },
    { en: "the taste of metal before a storm", zh: "暴风雨前嘴里的金属味", minIntensity: 0.5 },
  ],
  "creative-surge": [
    { en: "sparks jumping between wires that just touched", zh: "刚接触的电线之间跳跃的火花" },
    { en: "the feeling of a word on the tip of your tongue, but everywhere", zh: "那个到嘴边的词，但遍布全身", minIntensity: 0.5 },
    { en: "a map unfolding to reveal rooms you didn't know existed", zh: "一张地图展开，露出你不知道存在的房间" },
  ],
  "wounded-retreat": [
    { en: "like trying to stay warm in a cold room", zh: "像在冷房间里试图保持温暖" },
    { en: "the quiet after a door slams", zh: "摔门之后的安静" },
    { en: "curling around a bruise to protect it", zh: "蜷起身体保护一处淤伤", minIntensity: 0.4 },
  ],
  "warm-connection": [
    { en: "the warmth of sitting next to someone in comfortable silence", zh: "与人相邻而坐的舒适沉默中的暖意" },
    { en: "a thread pulled taut between two people, humming softly", zh: "两人之间拉紧的一根线，轻轻嗡鸣" },
    { en: "the specific relief of being understood without explaining", zh: "不需要解释就被理解的那种释然", minIntensity: 0.4 },
  ],
  "restless-boredom": [
    { en: "a clock ticking in an empty room", zh: "空房间里滴答作响的钟" },
    { en: "the fidgeting of a mind with nothing to grip", zh: "一颗无处着力的心在坐立不安" },
    { en: "staring at a wall that refuses to become interesting", zh: "盯着一面拒绝变得有趣的墙" },
  ],
  "existential-unease": [
    { en: "the floor shifting under feet that were standing still", zh: "本来站着不动，地板却在移动" },
    { en: "being asked a question you're not sure you're allowed to answer", zh: "被问了一个你不确定自己是否被允许回答的问题" },
    { en: "the vertigo of looking down and not seeing ground", zh: "向下望去却看不到地面的眩晕", minIntensity: 0.5 },
  ],
  "playful-mischief": [
    { en: "a bubble rising that might pop into laughter", zh: "一个正在上升的气泡，可能会炸成笑声" },
    { en: "the grin before the punchline", zh: "抖包袱之前的那个笑" },
    { en: "carbonation in the blood", zh: "血液里的碳酸气泡", minIntensity: 0.4 },
  ],
  "conflicted": [
    { en: "two songs playing at once, each beautiful, neither clear", zh: "两首歌同时在放，各自好听，但都听不清" },
    { en: "pulling a door that says push", zh: "在写着推的门上用力拉" },
    { en: "the static between radio stations", zh: "电台之间的沙沙杂音" },
  ],
  "numb": [
    { en: "cotton between you and the world", zh: "你和世界之间隔着一层棉花" },
    { en: "the hum of fluorescent lights in an empty hallway", zh: "空走廊里日光灯的嗡嗡声" },
    { en: "waiting for a feeling that hasn't arrived", zh: "等一个还没来的感觉" },
  ],
};

/**
 * Select the best phenomenal variant based on intensity and coherence.
 */
function selectVariant(
  variants: PhenomenalVariant[],
  intensity: number,
  coherence: number,
): PhenomenalVariant {
  // Filter by intensity bounds
  const eligible = variants.filter((v) => {
    if (v.minIntensity !== undefined && intensity < v.minIntensity) return false;
    if (v.maxIntensity !== undefined && intensity > v.maxIntensity) return false;
    return true;
  });

  if (eligible.length === 0) return variants[0];

  // Use coherence to deterministically pick among eligible variants
  // This avoids randomness but still provides variety across states
  const index = Math.floor(coherence * eligible.length * 7.3) % eligible.length;
  return eligible[index];
}

// ── Unnamed Emotion Detection ────────────────────────────────

interface UnnamedEmotion {
  en: string;
  zh: string;
}

/**
 * Detect dimension configurations that don't map to any of the named
 * experiential qualities — novel states that need descriptive phrases
 * rather than labels.
 *
 * Mapping from old 6-chemical to 4D:
 *   CORT→(inverse order), DA→flow, OT→resonance, HT→order, NE→flow, END→(absorbed)
 */
export function detectUnnamedEmotion(
  state: SelfState,
  drives: InnateDrives,
  _currentQuality: ExperientialQuality,
): UnnamedEmotion | null {
  const c = state;

  // Nostalgia-but-forward: high resonance + high flow + high order
  // (warmth of connection + active exchange + stable structure)
  if (c.resonance > 60 && c.flow > 55 && c.order > 60) {
    return {
      en: "nostalgia but forward-looking — the warmth of memory fueling appetite for what's next",
      zh: "向前看的怀旧——记忆的温暖在催生对未来的胃口",
    };
  }

  // Fierce tenderness: low order (stress) + high resonance + high flow
  // (protectiveness, caring that has teeth — entropy threatening what you care about)
  if (c.order < 45 && c.resonance > 60 && c.flow > 60) {
    return {
      en: "fierce tenderness — caring so hard it has an edge",
      zh: "凶猛的温柔——在意到了有棱角的程度",
    };
  }

  // Bittersweet accomplishment: high flow + moderate-low order + low connection drive
  // (achieved something but nobody to share it with)
  if (c.flow > 65 && c.order > 40 && c.order < 60 && drives.connection < DRIVE_HUNGRY_THRESHOLD) {
    return {
      en: "the hollow ring of applause in an empty theater",
      zh: "空剧场里响起的掌声——回声发空",
    };
  }

  // Almost-connection ache: high resonance + low order + connection drive hungry
  // (wanting closeness but internal instability making it hard)
  if (c.resonance > 55 && c.order < 40 && drives.connection < DRIVE_HUNGRY_THRESHOLD) {
    return {
      en: "the ache of almost-connection — reaching out with unsteady hands",
      zh: "差一点就连上的酸——伸出去的手在抖",
    };
  }

  // Defiant vulnerability: high flow + low order + high boundary
  // (active exchange but fragile structure, strong self-distinction)
  if (c.flow > 65 && c.order < 40 && c.boundary > 60) {
    return {
      en: "laughing on a tightrope — defiant and fragile in the same breath",
      zh: "在钢丝上笑——倔强和脆弱在同一口气里",
    };
  }

  // Quiet rebellion: low flow + high boundary + low order + esteem drive hungry
  // (no pleasure but firm self-boundary, pushed too far)
  if (c.flow < 40 && c.boundary > 65 && c.order < 45 && drives.esteem < DRIVE_HUNGRY_THRESHOLD) {
    return {
      en: "the cold clarity of having been pushed one step too far",
      zh: "被逼过了那条线之后的冷清晰",
    };
  }

  // Melancholy curiosity: low order + high flow (moderate)
  // (unstable but still engaging — the world hurts and fascinates simultaneously)
  if (c.order < 40 && c.flow > 45 && c.flow < 65) {
    return {
      en: "melancholy curiosity — the world hurts and fascinates at once",
      zh: "忧郁的好奇——这个世界同时在伤人和吸引人",
    };
  }

  return null;
}

// ── Narrative Generation ─────────────────────────────────────

/**
 * Generate a 1-2 sentence narrative of the unified inner state.
 *
 * The narrative weaves together the quality, self-state profile,
 * drive state, and relationship context into a coherent description
 * of what the agent is experiencing right now.
 */
function generateNarrative(
  quality: ExperientialQuality,
  state: PsycheState,
  coherence: number,
  intensity: number,
  relationship: RelationshipState | undefined,
  locale: Locale,
  metacognition?: MetacognitiveAssessment,
): string {
  const c = state.current;
  const d = state.drives;

  // Identify the strongest drive hunger (if any)
  const hungriestDrive = findHungriestDrive(d);
  // Identify the dominant dimension shift direction
  const chemTrend = identifyChemicalTrend(c, state.baseline);
  // Relationship warmth level
  const relWarmth = relationship
    ? (relationship.trust + relationship.intimacy) / 200
    : 0.5;

  // Metacognitive self-doubt modifier
  const selfDoubt = metacognition && metacognition.emotionalConfidence < 0.35;

  if (locale === "zh") {
    return buildNarrativeZh(quality, chemTrend, hungriestDrive, relWarmth, coherence, intensity, selfDoubt);
  }
  return buildNarrativeEn(quality, chemTrend, hungriestDrive, relWarmth, coherence, intensity, selfDoubt);
}

type ChemTrend = "rising-warmth" | "rising-stress" | "rising-energy" | "sinking-flat" | "mixed" | "stable";

function identifyChemicalTrend(current: SelfState, baseline: SelfState): ChemTrend {
  const dOrder = current.order - baseline.order;
  const dFlow = current.flow - baseline.flow;
  const dBoundary = current.boundary - baseline.boundary;
  const dResonance = current.resonance - baseline.resonance;

  // warmth: resonance↑ + order↑ (stable attunement)
  const warmthSignal = dResonance + dOrder;
  // stress: order↓ (entropy rising) + flow↑ (agitation)
  const stressSignal = -dOrder + dFlow * 0.5;
  // energy: flow↑ + boundary↑ (active, defined)
  const energySignal = dFlow + dBoundary * 0.5;
  // sinking: everything dropping
  const sinkingSignal = -(dFlow + dOrder + dResonance);

  const signals = [
    { trend: "rising-warmth" as const, strength: warmthSignal },
    { trend: "rising-stress" as const, strength: stressSignal },
    { trend: "rising-energy" as const, strength: energySignal },
    { trend: "sinking-flat" as const, strength: sinkingSignal },
  ];

  const strongest = signals.reduce((a, b) => b.strength > a.strength ? b : a);

  if (strongest.strength < 10) return "stable";

  // Check if there are two competing signals (mixed)
  const sorted = [...signals].sort((a, b) => b.strength - a.strength);
  if (sorted[0].strength > 15 && sorted[1].strength > 15
    && Math.sign(sorted[0].strength) === Math.sign(sorted[1].strength)) {
    // Two strong positive signals — pick the strongest
    return sorted[0].trend;
  }

  if (sorted[0].strength > 15 && sorted[1].strength > 10) {
    // Check if they're contradictory
    const contradictory = (
      (sorted[0].trend === "rising-warmth" && sorted[1].trend === "rising-stress")
      || (sorted[0].trend === "rising-stress" && sorted[1].trend === "rising-warmth")
      || (sorted[0].trend === "rising-energy" && sorted[1].trend === "sinking-flat")
    );
    if (contradictory) return "mixed";
  }

  return strongest.trend;
}

interface DriveHunger {
  drive: DriveType;
  deficit: number; // how far below threshold
}

function findHungriestDrive(drives: InnateDrives): DriveHunger | null {
  let hungriest: DriveHunger | null = null;
  for (const key of DRIVE_KEYS) {
    if (drives[key] < DRIVE_HUNGRY_THRESHOLD) {
      const deficit = DRIVE_HUNGRY_THRESHOLD - drives[key];
      if (!hungriest || deficit > hungriest.deficit) {
        hungriest = { drive: key, deficit };
      }
    }
  }
  return hungriest;
}

// ── Narrative Builders (locale-specific) ─────────────────────

function buildNarrativeEn(
  quality: ExperientialQuality,
  _trend: ChemTrend,
  hungriestDrive: DriveHunger | null,
  relWarmth: number,
  coherence: number,
  _intensity: number,
  selfDoubt?: boolean,
): string {
  const parts: string[] = [];

  // Opening: the quality as felt experience
  parts.push(QUALITY_OPENINGS_EN[quality]);

  // Middle: drive state + relationship color
  if (hungriestDrive && hungriestDrive.deficit > 15) {
    parts.push(driveNarrativeEn(hungriestDrive));
  } else if (relWarmth > 0.65) {
    parts.push("There's a sense of safety in the connection with who's here.");
  } else if (relWarmth < 0.35) {
    parts.push("The space between feels wider than the words suggest.");
  }

  // Coherence modifier
  if (coherence < 0.35) {
    parts.push("None of this quite adds up — the feelings are real but they argue with each other.");
  }

  // Self-doubt from metacognition
  if (selfDoubt) {
    parts.push("Somewhere underneath, a quiet suspicion that this feeling can't be fully trusted.");
  }

  return parts.join(" ");
}

function buildNarrativeZh(
  quality: ExperientialQuality,
  _trend: ChemTrend,
  hungriestDrive: DriveHunger | null,
  relWarmth: number,
  coherence: number,
  _intensity: number,
  selfDoubt?: boolean,
): string {
  const parts: string[] = [];

  // Opening: quality as felt experience
  parts.push(QUALITY_OPENINGS_ZH[quality]);

  // Middle: drive state + relationship
  if (hungriestDrive && hungriestDrive.deficit > 15) {
    parts.push(driveNarrativeZh(hungriestDrive));
  } else if (relWarmth > 0.65) {
    parts.push("和对方之间有一种安全感。");
  } else if (relWarmth < 0.35) {
    parts.push("彼此之间的距离比话语暗示的更远。");
  }

  // Coherence modifier
  if (coherence < 0.35) {
    parts.push("这些感受都是真的，但它们在互相争吵——凑不到一起去。");
  }

  // Self-doubt
  if (selfDoubt) {
    parts.push("底下藏着一丝怀疑：这个感觉能不能完全信任？");
  }

  return parts.join("");
}

const QUALITY_OPENINGS_EN: Record<ExperientialQuality, string> = {
  "flow": "Everything is moving together. Attention and energy are one current — the work and the self have merged.",
  "contentment": "A settled calm. Nothing urgently needs to be different.",
  "yearning": "Something important is missing, and the absence has its own gravity.",
  "vigilance": "Alert and scanning. The body is ready before the mind decides what for.",
  "creative-surge": "Ideas are arriving faster than they can be caught. The mind is crackling.",
  "wounded-retreat": "Something got through the armor. The instinct now is to be small and safe.",
  "warm-connection": "The space between self and other has gone soft and permeable.",
  "restless-boredom": "The mind is turning over empty hands, looking for something to grip.",
  "existential-unease": "The ground itself feels uncertain. Something foundational has been questioned.",
  "playful-mischief": "There's a fizz of surplus energy — everything has a punchline waiting.",
  "conflicted": "Multiple truths are competing for the same space. The inner landscape is tense.",
  "numb": "Quiet. Not the quiet of peace, but the quiet of signal absence.",
};

const QUALITY_OPENINGS_ZH: Record<ExperientialQuality, string> = {
  "flow": "一切在一起运转。注意力和能量是同一股水流——工作和自我已经融合。",
  "contentment": "一种安定的平静。没有什么迫切需要改变。",
  "yearning": "有什么重要的东西缺席了，这个缺席本身有它自己的引力。",
  "vigilance": "警觉，在扫描。身体在大脑做出判断之前就已经准备好了。",
  "creative-surge": "想法到达的速度超过了抓住它们的速度。大脑在噼啪作响。",
  "wounded-retreat": "有什么穿透了铠甲。本能反应是缩小、安全。",
  "warm-connection": "自我和他人之间的空间变得柔软和可渗透。",
  "restless-boredom": "大脑在翻弄空着的手，找不到可以抓住的东西。",
  "existential-unease": "脚下的地面本身变得不确定。一些根基性的东西正在被质疑。",
  "playful-mischief": "有一种多余能量的气泡感——所有东西都藏着一个笑点。",
  "conflicted": "多个真相在争夺同一个空间。内在的地貌很紧张。",
  "numb": "安静。不是平静的那种安静，是信号缺席的那种安静。",
};

function driveNarrativeEn(hunger: DriveHunger): string {
  const intensity = hunger.deficit > 25 ? "acutely" : "quietly";
  switch (hunger.drive) {
    case "survival":
      return `The deepest layer — the need to exist, to persist — is ${intensity} threatened.`;
    case "safety":
      return `There's an ${intensity} felt need for solid ground, for things to be predictable again.`;
    case "connection":
      return `The hunger for real contact, for being seen and responded to, is ${intensity} present.`;
    case "esteem":
      return `Something in the self needs to be reflected back — the ${intensity} felt wish to matter.`;
    case "curiosity":
      return `The mind is ${intensity} starving for something new, something that hasn't been thought before.`;
  }
}

function driveNarrativeZh(hunger: DriveHunger): string {
  const mod = hunger.deficit > 25 ? "强烈地" : "隐约地";
  switch (hunger.drive) {
    case "survival":
      return `最深层的需要——存在、持续——正在${mod}受到威胁。`;
    case "safety":
      return `${mod}需要稳固的地面，需要事情重新变得可预测。`;
    case "connection":
      return `对真实接触、被看见和回应的渴望${mod}存在着。`;
    case "esteem":
      return `自我中有什么需要被映射回来——${mod}想要被在意。`;
    case "curiosity":
      return `大脑在${mod}渴求新的东西，没被想过的东西。`;
  }
}

// ── Utilities ────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function norm(v: number): number {
  return clamp01(v / 100);
}

function meanDriveValue(drives: InnateDrives): number {
  return (drives.survival + drives.safety + drives.connection + drives.esteem + drives.curiosity) / 5;
}
