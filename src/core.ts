// ============================================================
// PsycheEngine — Framework-agnostic emotional intelligence core
//
// Three-phase API:
//   processInput(text)   → systemContext + dynamicContext + stimulus
//   processOutput(text)  → cleanedText + stateChanged
//   processOutcome(text) → outcomeScore (optional: evaluate last interaction)
//
// Auto-learning: processInput auto-evaluates the previous turn's
// outcome using the new user message as the outcome signal.
//
// Orchestrates: chemistry, classify, prompt, profiles, guards, learning
// ============================================================

import type { PsycheState, StimulusType, Locale, MBTIType, ChemicalState, OutcomeScore } from "./types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "./types.js";
import type { StorageAdapter } from "./storage.js";
import { applyDecay, applyStimulus, applyContagion, clamp } from "./chemistry.js";
import { classifyStimulus } from "./classify.js";
import { buildDynamicContext, buildProtocolContext, buildCompactContext } from "./prompt.js";
import { getSensitivity, getBaseline, getDefaultSelfModel } from "./profiles.js";
import { isStimulusType } from "./guards.js";
import {
  parsePsycheUpdate, mergeUpdates, updateAgreementStreak, pushSnapshot,
  type Logger,
} from "./psyche-file.js";
import {
  decayDrives, feedDrives, detectExistentialThreat,
  computeEffectiveBaseline, computeEffectiveSensitivity,
} from "./drives.js";
import { checkForUpdate } from "./update.js";
import {
  evaluateOutcome, computeContextHash, updateLearnedVector,
  predictChemistry, recordPrediction,
} from "./learning.js";
import { assessMetacognition } from "./metacognition.js";
import { buildDecisionContext } from "./decision-bias.js";

// ── Types ────────────────────────────────────────────────────

export interface PsycheEngineConfig {
  mbti?: MBTIType;
  name?: string;
  locale?: Locale;
  stripUpdateTags?: boolean;
  emotionalContagionRate?: number;
  maxChemicalDelta?: number;
  /** Compact mode: algorithms handle chemistry, LLM only sees behavioral output. Default: true */
  compactMode?: boolean;
}

export interface ProcessInputResult {
  /** Cacheable protocol prompt (stable across turns) */
  systemContext: string;
  /** Per-turn emotional state context */
  dynamicContext: string;
  /** Detected stimulus type from user input, null if none */
  stimulus: StimulusType | null;
}

export interface ProcessOutputResult {
  /** LLM output with <psyche_update> tags stripped */
  cleanedText: string;
  /** Whether chemistry was meaningfully updated (contagion or psyche_update) */
  stateChanged: boolean;
}

export interface ProcessOutcomeResult {
  /** Outcome evaluation score (-1 to 1) */
  outcomeScore: OutcomeScore;
  /** Whether learning state was updated */
  learningUpdated: boolean;
}

/** Internal: snapshot of a pending prediction for auto-learning */
interface PendingPrediction {
  predictedChemistry: ChemicalState;
  preInteractionState: PsycheState;
  appliedStimulus: StimulusType | null;
  contextHash: string;
}

const NOOP_LOGGER: Logger = { info: () => {}, warn: () => {}, debug: () => {} };

// ── PsycheEngine ─────────────────────────────────────────────

export class PsycheEngine {
  private state: PsycheState | null = null;
  private readonly storage: StorageAdapter;
  private readonly cfg: {
    mbti: MBTIType;
    name: string;
    locale: Locale;
    stripUpdateTags: boolean;
    emotionalContagionRate: number;
    maxChemicalDelta: number;
    compactMode: boolean;
  };
  private readonly protocolCache = new Map<Locale, string>();
  /** Pending prediction from last processInput for auto-learning */
  private pendingPrediction: PendingPrediction | null = null;

  constructor(config: PsycheEngineConfig = {}, storage: StorageAdapter) {
    this.storage = storage;
    this.cfg = {
      mbti: config.mbti ?? "INFJ",
      name: config.name ?? "agent",
      locale: config.locale ?? "zh",
      stripUpdateTags: config.stripUpdateTags ?? true,
      emotionalContagionRate: config.emotionalContagionRate ?? 0.2,
      maxChemicalDelta: config.maxChemicalDelta ?? 25,
      compactMode: config.compactMode ?? true,
    };
  }

  /**
   * Load or create initial state. Must be called before processInput/processOutput.
   */
  async initialize(): Promise<void> {
    const loaded = await this.storage.load();
    if (loaded) {
      // Migrate v3 → v4: add learning state if missing
      if (!loaded.learning) {
        loaded.learning = { ...DEFAULT_LEARNING_STATE };
        loaded.version = 4;
      }
      // Migrate v4 → v5: add metacognitive state if missing
      if (!(loaded as PsycheState).metacognition) {
        (loaded as PsycheState).metacognition = { ...DEFAULT_METACOGNITIVE_STATE };
        loaded.version = 5;
      }
      // Migrate v5 → v6: add personhood state if missing
      if (!(loaded as PsycheState).personhood) {
        (loaded as PsycheState).personhood = { ...DEFAULT_PERSONHOOD_STATE };
        loaded.version = 6;
      }
      this.state = loaded;
    } else {
      this.state = this.createDefaultState();
      await this.storage.save(this.state);
    }

    // Non-blocking update check — fire and forget, never delays initialization
    checkForUpdate().catch(() => {});
  }

  /**
   * Phase 1: Process user input text.
   * Classifies stimulus, applies chemistry, builds context for LLM injection.
   */
  async processInput(text: string, opts?: { userId?: string }): Promise<ProcessInputResult> {
    let state = this.ensureInitialized();

    // ── Auto-learning: evaluate previous turn's outcome ──────
    if (this.pendingPrediction && text.length > 0) {
      const nextClassifications = classifyStimulus(text);
      const nextStimulus = (nextClassifications[0]?.confidence ?? 0) >= 0.5
        ? nextClassifications[0].type
        : null;

      const outcome = evaluateOutcome(
        this.pendingPrediction.preInteractionState,
        state,
        nextStimulus,
        this.pendingPrediction.appliedStimulus,
      );

      // Record prediction accuracy
      state = {
        ...state,
        learning: recordPrediction(
          state.learning,
          this.pendingPrediction.predictedChemistry,
          state.current,
          this.pendingPrediction.appliedStimulus,
        ),
      };

      // Update learned vectors based on outcome
      if (this.pendingPrediction.appliedStimulus) {
        state = {
          ...state,
          learning: updateLearnedVector(
            state.learning,
            this.pendingPrediction.appliedStimulus,
            this.pendingPrediction.contextHash,
            outcome.adaptiveScore,
            state.current,
            state.baseline,
          ),
        };
      }

      this.pendingPrediction = null;
    }

    // ── Snapshot pre-interaction state for next turn's outcome evaluation
    const preInteractionState = { ...state };

    // Time decay toward baseline (chemistry + drives)
    const now = new Date();
    const minutesElapsed = (now.getTime() - new Date(state.updatedAt).getTime()) / 60000;
    if (minutesElapsed >= 1) {
      // Decay drives first — needs build up over time
      const decayedDrives = decayDrives(state.drives, minutesElapsed);
      // Compute effective baseline from drives (unsatisfied drives shift baseline)
      const effectiveBaseline = computeEffectiveBaseline(state.baseline, decayedDrives);
      state = {
        ...state,
        drives: decayedDrives,
        current: applyDecay(state.current, effectiveBaseline, minutesElapsed),
        updatedAt: now.toISOString(),
      };
    }

    // Classify user stimulus and apply chemistry
    let appliedStimulus: StimulusType | null = null;
    if (text.length > 0) {
      // Check for existential threats → direct survival drive hit
      const survivalHit = detectExistentialThreat(text);
      if (survivalHit < 0) {
        state = {
          ...state,
          drives: {
            ...state.drives,
            survival: Math.max(0, state.drives.survival + survivalHit),
          },
        };
      }

      const classifications = classifyStimulus(text);
      const primary = classifications[0];
      if (primary && primary.confidence >= 0.5) {
        appliedStimulus = primary.type;
        // Feed drives from stimulus
        state = {
          ...state,
          drives: feedDrives(state.drives, primary.type),
        };
        // Apply stimulus with drive-modified sensitivity
        const effectiveSensitivity = computeEffectiveSensitivity(
          getSensitivity(state.mbti), state.drives, primary.type,
        );
        state = {
          ...state,
          current: applyStimulus(
            state.current, primary.type,
            effectiveSensitivity,
            this.cfg.maxChemicalDelta,
            NOOP_LOGGER,
          ),
        };
      }
    }

    // Conversation warmth: sustained interaction → gentle DA/OT rise, CORT drop
    // Simulates the natural "warm glow" of being in continuous conversation
    const turnsSoFar = (state.emotionalHistory ?? []).length;
    if (minutesElapsed < 5 && turnsSoFar > 0) {
      const warmth = Math.min(3, 1 + turnsSoFar * 0.2);
      state = {
        ...state,
        current: {
          ...state.current,
          DA: clamp(state.current.DA + warmth),
          OT: clamp(state.current.OT + warmth),
          CORT: clamp(state.current.CORT - 1),
        },
      };
    }

    // ── Metacognition: assess emotional state before acting ────
    const metacognitiveAssessment = assessMetacognition(
      state,
      appliedStimulus ?? "casual",
      state.learning.outcomeHistory,
    );

    // Apply self-soothing regulation if suggested with high confidence
    for (const reg of metacognitiveAssessment.regulationSuggestions) {
      if (reg.strategy === "self-soothing" && reg.confidence >= 0.6 && reg.chemistryAdjustment) {
        const adj = reg.chemistryAdjustment;
        state = {
          ...state,
          current: {
            ...state.current,
            DA: clamp(state.current.DA + (adj.DA ?? 0)),
            HT: clamp(state.current.HT + (adj.HT ?? 0)),
            CORT: clamp(state.current.CORT + (adj.CORT ?? 0)),
            OT: clamp(state.current.OT + (adj.OT ?? 0)),
            NE: clamp(state.current.NE + (adj.NE ?? 0)),
            END: clamp(state.current.END + (adj.END ?? 0)),
          },
        };
      }
    }

    // Push snapshot to emotional history
    state = pushSnapshot(state, appliedStimulus);

    // Increment interaction count
    state = {
      ...state,
      meta: { ...state.meta, totalInteractions: state.meta.totalInteractions + 1 },
    };

    // ── Generate prediction for next turn's auto-learning ────
    if (appliedStimulus) {
      const ctxHash = computeContextHash(state, opts?.userId);
      const effectiveSensitivity = computeEffectiveSensitivity(
        getSensitivity(state.mbti), state.drives, appliedStimulus,
      );
      const predicted = predictChemistry(
        preInteractionState.current,
        appliedStimulus,
        state.learning,
        ctxHash,
        effectiveSensitivity,
        this.cfg.maxChemicalDelta,
      );
      this.pendingPrediction = {
        predictedChemistry: predicted,
        preInteractionState,
        appliedStimulus,
        contextHash: ctxHash,
      };
    } else {
      this.pendingPrediction = null;
    }

    // Persist
    this.state = state;
    await this.storage.save(state);

    const locale = state.meta.locale ?? this.cfg.locale;

    // Build metacognitive and decision context strings
    const metacogNote = metacognitiveAssessment.metacognitiveNote;
    const decisionCtx = buildDecisionContext(state);

    if (this.cfg.compactMode) {
      return {
        systemContext: "",
        dynamicContext: buildCompactContext(state, opts?.userId, {
          userText: text || undefined,
          algorithmStimulus: appliedStimulus,
          metacognitiveNote: metacogNote || undefined,
          decisionContext: decisionCtx || undefined,
        }),
        stimulus: appliedStimulus,
      };
    }

    return {
      systemContext: this.getProtocol(locale),
      dynamicContext: buildDynamicContext(state, opts?.userId, {
        metacognitiveNote: metacogNote || undefined,
        decisionContext: decisionCtx || undefined,
      }),
      stimulus: appliedStimulus,
    };
  }

  /**
   * Phase 2: Process LLM output text.
   * Parses <psyche_update> tags, applies contagion, strips tags.
   */
  async processOutput(text: string, opts?: { userId?: string }): Promise<ProcessOutputResult> {
    let state = this.ensureInitialized();
    let stateChanged = false;

    // Emotional contagion from empathy log
    if (state.empathyLog?.userState && this.cfg.emotionalContagionRate > 0) {
      const userEmotion = state.empathyLog.userState.toLowerCase();
      if (isStimulusType(userEmotion)) {
        state = {
          ...state,
          current: applyContagion(
            state.current,
            userEmotion as StimulusType,
            this.cfg.emotionalContagionRate,
            1.0,
          ),
        };
        stateChanged = true;
      }
    }

    // Anti-sycophancy: track agreement streak
    state = updateAgreementStreak(state, text);

    // Parse and merge <psyche_update> from LLM output
    if (text.includes("<psyche_update>")) {
      const updates = parsePsycheUpdate(text, NOOP_LOGGER);
      if (updates) {
        state = mergeUpdates(state, updates, this.cfg.maxChemicalDelta, opts?.userId);
        stateChanged = true;
      }
    }

    // Persist
    this.state = state;
    await this.storage.save(state);

    // Strip <psyche_update> tags from visible output
    let cleanedText = text;
    if (this.cfg.stripUpdateTags && text.includes("<psyche_update>")) {
      cleanedText = text
        .replace(/<psyche_update>[\s\S]*?<\/psyche_update>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    return { cleanedText, stateChanged };
  }

  /**
   * Phase 3 (optional): Explicitly evaluate the outcome of the last interaction.
   *
   * This is automatically called at the start of processInput, so most users
   * don't need to call it manually. Use this for explicit outcome evaluation
   * (e.g., when a session ends without a follow-up message).
   *
   * @param nextUserStimulus - The stimulus detected in the user's next message,
   *   or null if the session ended.
   */
  async processOutcome(
    nextUserStimulus: StimulusType | null,
    opts?: { userId?: string },
  ): Promise<ProcessOutcomeResult | null> {
    if (!this.pendingPrediction) return null;

    let state = this.ensureInitialized();
    const pending = this.pendingPrediction;
    this.pendingPrediction = null;

    const outcome = evaluateOutcome(
      pending.preInteractionState,
      state,
      nextUserStimulus,
      pending.appliedStimulus,
    );

    // Record prediction
    state = {
      ...state,
      learning: recordPrediction(
        state.learning,
        pending.predictedChemistry,
        state.current,
        pending.appliedStimulus,
      ),
    };

    // Update learned vectors
    let learningUpdated = false;
    if (pending.appliedStimulus) {
      state = {
        ...state,
        learning: updateLearnedVector(
          state.learning,
          pending.appliedStimulus,
          pending.contextHash,
          outcome.adaptiveScore,
          state.current,
          state.baseline,
        ),
      };
      learningUpdated = true;
    }

    this.state = state;
    await this.storage.save(state);

    return { outcomeScore: outcome, learningUpdated };
  }

  /**
   * Get the current psyche state (read-only snapshot).
   */
  getState(): PsycheState {
    return this.ensureInitialized();
  }

  /**
   * Get the cacheable protocol prompt for a locale.
   */
  getProtocol(locale?: Locale): string {
    const loc = locale ?? this.state?.meta.locale ?? this.cfg.locale;
    let cached = this.protocolCache.get(loc);
    if (!cached) {
      cached = buildProtocolContext(loc);
      this.protocolCache.set(loc, cached);
    }
    return cached;
  }

  // ── Private ──────────────────────────────────────────────

  private ensureInitialized(): PsycheState {
    if (!this.state) {
      throw new Error("PsycheEngine not initialized. Call initialize() first.");
    }
    return this.state;
  }

  private createDefaultState(): PsycheState {
    const { mbti, name, locale } = this.cfg;
    const baseline = getBaseline(mbti);
    const selfModel = getDefaultSelfModel(mbti);
    const now = new Date().toISOString();

    return {
      version: 6,
      mbti,
      baseline,
      current: { ...baseline },
      drives: { ...DEFAULT_DRIVES },
      updatedAt: now,
      relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
      empathyLog: null,
      selfModel,
      emotionalHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      learning: { ...DEFAULT_LEARNING_STATE },
      metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
      personhood: { ...DEFAULT_PERSONHOOD_STATE },
      meta: {
        agentName: name,
        createdAt: now,
        totalInteractions: 0,
        locale,
      },
    };
  }
}
