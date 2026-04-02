// ============================================================
// Multi-Agent Emotional Interaction Module
//
// Enables two PsycheEngine instances to emotionally interact:
//   exchange()            — Agent A's output becomes Agent B's input
//   crossContagion()      — Bidirectional emotional contagion
//   getRelationshipSummary() — How two agents perceive each other
// ============================================================

import type { PsycheEngine, ProcessInputResult, ProcessOutputResult } from "./core.js";
import type { SelfState, StimulusType } from "./types.js";
import { DIMENSION_KEYS } from "./types.js";
import { applyContagion, detectEmotions } from "./chemistry.js";
import { classifyStimulus } from "./classify.js";

// ── Types ────────────────────────────────────────────────────

/** Result of a single directed exchange (A speaks, B receives) */
export interface ExchangeResult {
  /** processOutput result from the speaking engine */
  outputResult: ProcessOutputResult;
  /** processInput result from the receiving engine */
  inputResult: ProcessInputResult;
  /** Stimulus detected in the speaker's cleaned text */
  detectedStimulus: StimulusType | null;
}

/** Snapshot of cross-contagion effect */
export interface ContagionResult {
  /** Chemistry deltas applied to engine A */
  deltaA: Partial<Record<keyof SelfState, number>>;
  /** Chemistry deltas applied to engine B */
  deltaB: Partial<Record<keyof SelfState, number>>;
  /** Whether any meaningful change occurred */
  changed: boolean;
}

/** Relationship phase between two agents */
export type InteractionPhase =
  | "strangers"
  | "acquaintances"
  | "familiar"
  | "attuned";

/** Summary of how two agents relate emotionally */
export interface RelationshipSummary {
  /** Total exchanges recorded */
  totalExchanges: number;
  /** Relationship phase based on interaction depth */
  phase: InteractionPhase;
  /** Average emotional valence of A's outputs toward B (-1 to 1) */
  averageValenceAtoB: number;
  /** Average emotional valence of B's outputs toward A (-1 to 1) */
  averageValenceBtoA: number;
  /** How similar their current chemistry is (0-1, 1 = identical) */
  stateSimilarity: number;
  /** Dominant emotion patterns for each agent */
  emotionsA: string[];
  emotionsB: string[];
  /** Human-readable description */
  description: string;
}

/** Internal record of a single exchange event */
interface ExchangeRecord {
  fromId: string;
  toId: string;
  stimulus: StimulusType | null;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────

/** Compute valence from a stimulus type: positive > 0, negative < 0 */
function stimulusValence(stimulus: StimulusType | null): number {
  if (!stimulus) return 0;
  const VALENCE_MAP: Record<StimulusType, number> = {
    praise: 0.8,
    validation: 0.7,
    intimacy: 0.9,
    humor: 0.6,
    surprise: 0.4,
    casual: 0.1,
    intellectual: 0.3,
    vulnerability: 0.2,
    sarcasm: -0.5,
    criticism: -0.6,
    authority: -0.4,
    conflict: -0.8,
    neglect: -0.7,
    boredom: -0.3,
  };
  return VALENCE_MAP[stimulus] ?? 0;
}

/** Cosine similarity between two SelfState vectors, normalized to 0-1 */
function stateSimilarity(a: SelfState, b: SelfState): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const key of DIMENSION_KEYS) {
    dotProduct += a[key] * b[key];
    normA += a[key] * a[key];
    normB += b[key] * b[key];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  // Cosine similarity is already in [-1, 1] for non-negative vectors it's [0, 1]
  return dotProduct / denominator;
}

/** Determine interaction phase from exchange count */
function phaseFromCount(count: number): InteractionPhase {
  if (count < 3) return "strangers";
  if (count < 10) return "acquaintances";
  if (count < 25) return "familiar";
  return "attuned";
}

/** Unique ID for an engine — uses agent name from state */
function engineId(engine: PsycheEngine): string {
  return engine.getState().meta.agentName;
}

// ── PsycheInteraction ────────────────────────────────────────

export class PsycheInteraction {
  private readonly engineA: PsycheEngine;
  private readonly engineB: PsycheEngine;
  private readonly history: ExchangeRecord[] = [];

  /** Maximum exchange records to retain */
  private static readonly MAX_HISTORY = 100;

  constructor(engineA: PsycheEngine, engineB: PsycheEngine) {
    this.engineA = engineA;
    this.engineB = engineB;
  }

  /**
   * Directed exchange: `fromEngine` speaks, `toEngine` receives.
   *
   * Flow:
   *   1. fromEngine.processOutput(text) — apply contagion + strip tags
   *   2. classifyStimulus on cleaned text
   *   3. toEngine.processInput(cleanedText) — apply stimulus chemistry
   *   4. Record exchange in history
   */
  async exchange(
    fromEngine: PsycheEngine,
    toEngine: PsycheEngine,
    text: string,
  ): Promise<ExchangeResult> {
    this.validateEngine(fromEngine);
    this.validateEngine(toEngine);

    // Phase 1: Speaker processes their output
    const outputResult = await fromEngine.processOutput(text);

    // Phase 2: Classify the cleaned text to determine its emotional impact
    const classifications = classifyStimulus(outputResult.cleanedText);
    const primary = classifications[0];
    const detectedStimulus = (primary && primary.confidence >= 0.4)
      ? primary.type
      : null;

    // Phase 3: Receiver processes the cleaned text as input
    const inputResult = await toEngine.processInput(outputResult.cleanedText);

    // Phase 4: Record in interaction history
    this.recordExchange(fromEngine, toEngine, detectedStimulus);

    return { outputResult, inputResult, detectedStimulus };
  }

  /**
   * Bidirectional emotional contagion between two engines.
   *
   * Each engine's dominant emotion slightly shifts the other's chemistry.
   * This simulates the unconscious emotional synchronization that happens
   * when two agents interact over time.
   *
   * @param engineA  First engine
   * @param engineB  Second engine
   * @param rate     Contagion rate (0-1, default 0.15). Lower than single-agent
   *                 contagion since this represents ambient influence, not
   *                 direct stimulus.
   */
  async crossContagion(
    engineA: PsycheEngine,
    engineB: PsycheEngine,
    rate: number = 0.15,
  ): Promise<ContagionResult> {
    this.validateEngine(engineA);
    this.validateEngine(engineB);

    const stateA = engineA.getState();
    const stateB = engineB.getState();

    // Detect dominant emotions from each engine's chemistry
    // Classify dominant emotion into a stimulus type for contagion
    const stimA = this.dominantEmotionAsStimulus(stateA.current);
    const stimB = this.dominantEmotionAsStimulus(stateB.current);

    let changed = false;
    const deltaA: Partial<Record<keyof SelfState, number>> = {};
    const deltaB: Partial<Record<keyof SelfState, number>> = {};

    // B's emotion influences A
    if (stimB) {
      const beforeA = { ...stateA.current };
      const afterA = applyContagion(stateA.current, stimB, rate, 1.0);
      for (const key of DIMENSION_KEYS) {
        const d = afterA[key] - beforeA[key];
        if (Math.abs(d) > 0.01) {
          deltaA[key] = d;
          changed = true;
        }
      }
      // Apply through a processOutput pass to persist the state change
      // We use an empty string to trigger contagion without side effects
      if (changed && stateA.empathyLog?.userState !== stimB) {
        // Mutate empathy log temporarily for contagion, then process
        await this.applyContagionDelta(engineA, afterA);
      }
    }

    // A's emotion influences B
    if (stimA) {
      const beforeB = { ...stateB.current };
      const afterB = applyContagion(stateB.current, stimA, rate, 1.0);
      for (const key of DIMENSION_KEYS) {
        const d = afterB[key] - beforeB[key];
        if (Math.abs(d) > 0.01) {
          deltaB[key] = d;
          changed = true;
        }
      }
      if (changed) {
        await this.applyContagionDelta(engineB, afterB);
      }
    }

    return { deltaA, deltaB, changed };
  }

  /**
   * Summarize the emotional relationship between two engines based on
   * their interaction history and current chemistry.
   */
  getRelationshipSummary(
    engineA: PsycheEngine,
    engineB: PsycheEngine,
  ): RelationshipSummary {
    this.validateEngine(engineA);
    this.validateEngine(engineB);

    const idA = engineId(engineA);
    const idB = engineId(engineB);
    const stateA = engineA.getState();
    const stateB = engineB.getState();

    // Filter history for this pair
    const pairHistory = this.history.filter(
      (r) =>
        (r.fromId === idA && r.toId === idB) ||
        (r.fromId === idB && r.toId === idA),
    );

    const totalExchanges = pairHistory.length;
    const phase = phaseFromCount(totalExchanges);

    // Compute directional valences
    const aToBRecords = pairHistory.filter((r) => r.fromId === idA);
    const bToARecords = pairHistory.filter((r) => r.fromId === idB);

    const averageValenceAtoB = aToBRecords.length > 0
      ? aToBRecords.reduce((sum, r) => sum + stimulusValence(r.stimulus), 0) / aToBRecords.length
      : 0;

    const averageValenceBtoA = bToARecords.length > 0
      ? bToARecords.reduce((sum, r) => sum + stimulusValence(r.stimulus), 0) / bToARecords.length
      : 0;

    // State similarity
    const similarity = stateSimilarity(stateA.current, stateB.current);

    // Dominant emotions
    const emotionsA = detectEmotions(stateA.current).map((e) => e.name);
    const emotionsB = detectEmotions(stateB.current).map((e) => e.name);

    // Build description
    const description = this.buildDescription(
      idA, idB, phase, totalExchanges,
      averageValenceAtoB, averageValenceBtoA,
      similarity, emotionsA, emotionsB,
    );

    return {
      totalExchanges,
      phase,
      averageValenceAtoB,
      averageValenceBtoA,
      stateSimilarity: similarity,
      emotionsA,
      emotionsB,
      description,
    };
  }

  /** Get the raw exchange history (read-only copy) */
  getHistory(): readonly ExchangeRecord[] {
    return [...this.history];
  }

  // ── Private ────────────────────────────────────────────────

  private validateEngine(engine: PsycheEngine): void {
    if (engine !== this.engineA && engine !== this.engineB) {
      throw new Error(
        "Engine not part of this interaction. Use engines passed to the constructor.",
      );
    }
  }

  private recordExchange(
    from: PsycheEngine,
    to: PsycheEngine,
    stimulus: StimulusType | null,
  ): void {
    this.history.push({
      fromId: engineId(from),
      toId: engineId(to),
      stimulus,
      timestamp: new Date().toISOString(),
    });

    // Trim old history
    if (this.history.length > PsycheInteraction.MAX_HISTORY) {
      this.history.splice(0, this.history.length - PsycheInteraction.MAX_HISTORY);
    }
  }

  /**
   * Map the dominant emotion pattern to the closest StimulusType
   * for cross-contagion purposes.
   */
  private dominantEmotionAsStimulus(chemistry: SelfState): StimulusType | null {
    const emotions = detectEmotions(chemistry);
    if (emotions.length === 0) return null;

    const name = emotions[0].name;

    // Map emergent emotions to stimulus types that produce similar chemistry
    const EMOTION_TO_STIMULUS: Record<string, StimulusType> = {
      "excited joy": "praise",
      "deep contentment": "intimacy",
      "anxious tension": "conflict",
      "warm intimacy": "intimacy",
      "burnout": "neglect",
      "flow state": "intellectual",
      "defensive alert": "conflict",
      "playful mischief": "humor",
      "melancholic introspection": "vulnerability",
      "resentment": "sarcasm",
      "boredom": "boredom",
      "confidence": "validation",
      "shame": "criticism",
      "nostalgia": "vulnerability",
    };

    return EMOTION_TO_STIMULUS[name] ?? null;
  }

  /**
   * Apply a computed contagion delta to an engine by running a minimal
   * processOutput pass. The delta is applied through the engine's own
   * state management to keep persistence consistent.
   */
  private async applyContagionDelta(
    engine: PsycheEngine,
    targetChemistry: SelfState,
  ): Promise<void> {
    // Build a synthetic psyche_update that nudges toward the target
    const state = engine.getState();
    const parts: string[] = [];
    for (const key of DIMENSION_KEYS) {
      const target = Math.round(targetChemistry[key]);
      if (target !== Math.round(state.current[key])) {
        parts.push(`${key}: ${target}`);
      }
    }

    if (parts.length > 0) {
      const syntheticTag = `<psyche_update>\n${parts.join("\n")}\n</psyche_update>`;
      await engine.processOutput(syntheticTag);
    }
  }

  private buildDescription(
    idA: string,
    idB: string,
    phase: InteractionPhase,
    totalExchanges: number,
    valenceAtoB: number,
    valenceBtoA: number,
    similarity: number,
    emotionsA: string[],
    emotionsB: string[],
  ): string {
    const phaseDescriptions: Record<InteractionPhase, string> = {
      strangers: "have barely interacted",
      acquaintances: "are getting to know each other",
      familiar: "have an established rapport",
      attuned: "are deeply attuned to each other",
    };

    const lines: string[] = [];
    lines.push(
      `${idA} and ${idB} ${phaseDescriptions[phase]} (${totalExchanges} exchanges).`,
    );

    // Directional sentiment
    if (totalExchanges > 0) {
      const sentimentLabel = (v: number): string => {
        if (v > 0.4) return "warm and positive";
        if (v > 0.1) return "mildly positive";
        if (v > -0.1) return "neutral";
        if (v > -0.4) return "slightly tense";
        return "negative and strained";
      };

      lines.push(
        `${idA}'s tone toward ${idB} has been ${sentimentLabel(valenceAtoB)}.`,
      );
      lines.push(
        `${idB}'s tone toward ${idA} has been ${sentimentLabel(valenceBtoA)}.`,
      );
    }

    // Emotional alignment
    if (similarity > 0.95) {
      lines.push("Their emotional states are highly synchronized.");
    } else if (similarity > 0.8) {
      lines.push("Their emotional states are moderately aligned.");
    } else {
      lines.push("Their emotional states are divergent.");
    }

    // Current emotions
    if (emotionsA.length > 0) {
      lines.push(`${idA} is currently feeling: ${emotionsA.join(", ")}.`);
    }
    if (emotionsB.length > 0) {
      lines.push(`${idB} is currently feeling: ${emotionsB.join(", ")}.`);
    }

    return lines.join(" ");
  }
}
