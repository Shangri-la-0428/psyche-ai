// ============================================================
// PsycheEngine — Framework-agnostic emotional intelligence core
//
// Three-phase API:
//   processInput(text)   → systemContext + dynamicContext + replyEnvelope + stimulus
//   processOutput(text)  → cleanedText + stateChanged
//   processOutcome(text) → outcomeScore (optional: evaluate last interaction)
//
// Auto-learning: processInput auto-evaluates the previous turn's
// outcome using the new user message as the outcome signal.
//
// Orchestrates: self-state, classify, prompt, profiles, guards, learning
// ============================================================

import type { PsycheState, StimulusType, Locale, MBTIType, SelfState, OutcomeScore, PsycheMode, PersonalityTraits, PolicyModifiers, ClassifierProvider, SubjectivityKernel, ResponseContract, GenerationControls, SessionBridgeState, ThrongletsExport, TurnObservability, WritebackCalibrationFeedback, WritebackSignalType, ExternalContinuityEnvelope } from "./types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE, DEFAULT_ENERGY_BUDGETS, DEFAULT_TRAIT_DRIFT, DEFAULT_SUBJECT_RESIDUE, DEFAULT_DYADIC_FIELD, MODE_PROFILES } from "./types.js";
import type { StorageAdapter } from "./storage.js";
import { MemoryStorageAdapter } from "./storage.js";
import { applyDecay, applyStimulus, applyContagion, clamp, describeEmotionalState } from "./chemistry.js";
import { classifyStimulus, BuiltInClassifier, buildLLMClassifierPrompt, parseLLMClassification } from "./classify.js";
import { perceive } from "./perceive.js";
import { buildCompactContext, buildProtocolContext } from "./prompt.js";
import type { PromptRenderInputs } from "./prompt.js";
import { getSensitivity, getBaseline, getDefaultSelfModel, traitsToBaseline } from "./profiles.js";
import { isStimulusType } from "./guards.js";
import {
  parsePsycheUpdate, mergeUpdates, updateAgreementStreak, pushSnapshot,
  compressSession, summarizeTurnSemantic,
  type Logger,
} from "./psyche-file.js";
import {
  detectExistentialThreat, deriveDriveSatisfaction,
  computeEffectiveBaseline, computeEffectiveSensitivity,
} from "./drives.js";
import { mergeAppraisalResidue } from "./appraisal.js";
import { checkForUpdate, getPackageVersion } from "./update.js";
import { DiagnosticCollector, generateReport, formatLogEntry, submitFeedback } from "./diagnostics.js";
import type { DiagnosticReport, SessionMetrics } from "./diagnostics.js";
import {
  evaluateOutcome, computeContextHash, updateLearnedVector,
  predictState, recordPrediction,
} from "./learning.js";
import { computeCircadianModulation, computeHomeostaticPressure, computeEnergyDepletion, computeEnergyRecovery } from "./circadian.js";
import { runReflectiveTurnPhases } from "./input-turn.js";
import { applyRelationalTurn, applySessionBridge, applyWritebackSignals, createWritebackCalibrations, evaluateWritebackCalibrations } from "./relation-dynamics.js";
import type { DerivedReplyEnvelope, ReplyEnvelope } from "./reply-envelope.js";
import { deriveReplyEnvelope } from "./reply-envelope.js";
import { buildExternalContinuityEnvelope } from "./external-continuity.js";
import { deriveThrongletsExports } from "./thronglets-export.js";
import { buildTurnObservability } from "./observability.js";
import { DEFAULT_RELATIONSHIP_USER_ID, resolveRelationshipUserId } from "./relationship-key.js";

// ── Types ────────────────────────────────────────────────────

export interface PsycheEngineConfig {
  mbti?: MBTIType;
  name?: string;
  locale?: Locale;
  /** Sigil ID — which Loop this Psyche instance serves. When set, state persists per-Sigil. */
  sigilId?: string;
  stripUpdateTags?: boolean;
  emotionalContagionRate?: number;
  maxDimensionDelta?: number;
  /** @deprecated Compact mode is always on since v10. This option is ignored. */
  compactMode?: boolean;
  /** Operating mode: "natural" (default), "work" (minimal emotions), "companion" (full emotions) */
  mode?: PsycheMode;
  /** Personality intensity: 0.0 (traditional warm AI) to 1.0 (full Psyche). Default: 0.7 */
  personalityIntensity?: number;
  /** Whether to persist state to disk. Default: true. When false, uses in-memory storage. */
  persist?: boolean;
  /** Big Five traits. If provided, overrides MBTI for baseline calculation. */
  traits?: PersonalityTraits;
  /** Custom classifier provider. Default: built-in rule-based classifier. */
  classifier?: ClassifierProvider;
  /** LLM function for classifier fallback. Called when built-in confidence < llmClassifierThreshold. */
  llmClassifier?: (prompt: string) => Promise<string>;
  /** Confidence threshold below which LLM classifier is consulted. Default: 0.45 */
  llmClassifierThreshold?: number;
  /** Enable automatic diagnostics collection. Default: true. Set false to disable. */
  diagnostics?: boolean;
  /** URL to POST diagnostic reports to. Fire-and-forget, silent, no message content. */
  feedbackUrl?: string;
}

export interface ProcessInputResult {
  /** Cacheable protocol prompt (stable across turns) */
  systemContext: string;
  /** Per-turn emotional state context */
  dynamicContext: string;
  /** Detected stimulus type from user input, null if none */
  stimulus: StimulusType | null;
  /** Confidence of the primary algorithmic stimulus guess, if any */
  stimulusConfidence?: number;
  /** Legacy compatibility alias: raw policy vector behind the canonical replyEnvelope. */
  policyModifiers?: PolicyModifiers;
  /** v9.3+: canonical host-facing reply surface */
  replyEnvelope?: ReplyEnvelope;
  /** v9.3 compatibility alias: use replyEnvelope.subjectivityKernel when possible */
  subjectivityKernel?: SubjectivityKernel;
  /** v9.3 compatibility alias: use replyEnvelope.responseContract when possible */
  responseContract?: ResponseContract;
  /** v9.3 compatibility alias: use replyEnvelope.generationControls when possible */
  generationControls?: GenerationControls;
  /** v9.2.7: cold-start carry derived from persisted relation state */
  sessionBridge?: SessionBridgeState | null;
  /** v9.2.8: sparse writeback signals evaluated on the latest turn */
  writebackFeedback?: WritebackCalibrationFeedback[];
  /** v9.2.8: optional additive external continuity contract */
  externalContinuity?: ExternalContinuityEnvelope<ThrongletsExport>;
  /** v9.2.8: sparse low-frequency export surface suitable for Thronglets */
  throngletsExports?: ThrongletsExport[];
  /** v9.2.10: low-cost side channel for control boundary, state layers, and output attribution */
  observability?: TurnObservability;
  /**
   * Legacy compatibility alias: ready-to-use prompt fragment summarizing raw policy modifiers.
   *
   * This is the output of `buildPolicyContext(policyModifiers, locale)` —
   * a human-readable string like "[行为策略] 简短回复、被动应答为主".
   * Inject this into the LLM system prompt directly.
   *
   * Empty string when all modifiers are at baseline (no deviations to report).
   *
   * Note: `dynamicContext` already includes this text. This field is provided
   * separately for callers who build their own prompt and only need the policy
   * fragment without the full emotional context.
   */
  policyContext: string;
}

export interface ProcessOutputResult {
  /** LLM output with <psyche_update> tags stripped */
  cleanedText: string;
  /** Whether self-state was meaningfully updated (contagion or psyche_update) */
  stateChanged: boolean;
}

export interface ProcessOutputOptions {
  userId?: string;
  signals?: WritebackSignalType[];
  signalConfidence?: number;
}

export interface ProcessOutcomeResult {
  /** Outcome evaluation score (-1 to 1) */
  outcomeScore: OutcomeScore;
  /** Whether learning state was updated */
  learningUpdated: boolean;
}

/** Internal: snapshot of a pending prediction for auto-learning */
interface PendingPrediction {
  predictedState: SelfState;
  preInteractionState: PsycheState;
  appliedStimulus: StimulusType | null;
  contextHash: string;
}

function formatWritebackFeedbackNote(
  feedback: WritebackCalibrationFeedback[] | undefined,
  locale: Locale,
): string | undefined {
  const top = feedback?.[0];
  if (!top) return undefined;
  if (locale === "zh") {
    const effect = top.effect === "converging" ? "收敛" : top.effect === "diverging" ? "发散" : "持平";
    return `写回:${top.signal} ${effect}。`;
  }
  return `Writeback: ${top.signal} ${top.effect}.`;
}

const NOOP_LOGGER: Logger = { info: () => {}, warn: () => {}, debug: () => {} };
const REPAIRING_STIMULI = new Set<StimulusType>(["praise", "validation", "intimacy"]);
const RELATIONSHIP_DELTAS: Partial<Record<StimulusType, { trust: number; intimacy: number }>> = {
  praise: { trust: 1.5, intimacy: 0.8 },
  validation: { trust: 1.8, intimacy: 0.8 },
  intimacy: { trust: 1.2, intimacy: 2.0 },
  vulnerability: { trust: 0.8, intimacy: 1.5 },
  humor: { trust: 0.6, intimacy: 0.5 },
  casual: { trust: 0.2, intimacy: 0.1 },
  intellectual: { trust: 0.5, intimacy: 0.1 },
  surprise: { trust: 0.2, intimacy: 0 },
  boredom: { trust: -0.4, intimacy: -0.3 },
  criticism: { trust: -1.5, intimacy: -0.8 },
  sarcasm: { trust: -1.8, intimacy: -1.2 },
  authority: { trust: -1.2, intimacy: -0.9 },
  neglect: { trust: -1.6, intimacy: -1.4 },
  conflict: { trust: -2.5, intimacy: -2.0 },
};

function applyRepairLag(
  previous: SelfState,
  next: SelfState,
  baseline: SelfState,
  stimulus: StimulusType,
): SelfState {
  if (!REPAIRING_STIMULI.has(stimulus)) return next;

  // Low order = high stress. Stress = baseline.order - previous.order.
  const stressLoad = Math.max(0, baseline.order - previous.order);
  if (stressLoad < 15) return next;

  // High stress slows emotional recovery so apology/praise doesn't instantly
  // snap state back to baseline.
  const repairFactor = Math.max(0.35, 1 - stressLoad / 50);
  const adjusted = { ...next };

  // For flow, resonance, boundary: positive deltas (recovery) are damped
  for (const key of ["flow", "resonance", "boundary"] as const) {
    const delta = next[key] - previous[key];
    if (delta > 0) {
      adjusted[key] = clamp(previous[key] + delta * repairFactor);
    }
  }

  // For order: recovery means order increasing (stress reducing)
  const orderDelta = next.order - previous.order;
  if (orderDelta > 0) {
    adjusted.order = clamp(previous.order + orderDelta * repairFactor);
  }

  return adjusted;
}

function phaseFromRelationship(trust: number, intimacy: number): PsycheState["relationships"][string]["phase"] {
  const avg = (trust + intimacy) / 2;
  if (avg >= 80) return "deep";
  if (avg >= 60) return "close";
  if (avg >= 40) return "familiar";
  if (avg >= 20) return "acquaintance";
  return "stranger";
}

function applyRelationshipDrift(
  state: PsycheState,
  stimulus: StimulusType,
  userId?: string,
): PsycheState {
  const delta = RELATIONSHIP_DELTAS[stimulus];
  if (!delta) return state;

  const key = resolveRelationshipUserId(userId);
  const currentRel = state.relationships[key] ?? { ...DEFAULT_RELATIONSHIP };
  const trust = clamp(currentRel.trust + delta.trust);
  const intimacy = clamp(currentRel.intimacy + delta.intimacy);
  const updatedRel = {
    ...currentRel,
    trust,
    intimacy,
    phase: phaseFromRelationship(trust, intimacy),
  };

  return {
    ...state,
    relationships: {
      ...state.relationships,
      [key]: updatedRel,
    },
  };
}

// ── PsycheEngine ─────────────────────────────────────────────

export class PsycheEngine {
  private state: PsycheState | null = null;
  private storage: StorageAdapter;
  /** Whether the algorithm applied a stimulus in the last processInput call */
  private _lastAlgorithmApplied = false;
  private readonly traits: PersonalityTraits | undefined;
  private readonly cfg: {
    mbti: MBTIType;
    name: string;
    locale: Locale;
    sigilId?: string;
    stripUpdateTags: boolean;
    emotionalContagionRate: number;
    maxDimensionDelta: number;
    compactMode: boolean;
    mode: PsycheMode;
    personalityIntensity: number;
    llmClassifierThreshold: number;
  };
  private readonly classifier: ClassifierProvider;
  private readonly llmClassifier?: (prompt: string) => Promise<string>;
  private readonly protocolCache = new Map<Locale, string>();
  /** Pending prediction from last processInput for auto-learning */
  private pendingPrediction: PendingPrediction | null = null;
  /** Built-in diagnostics collector — auto-records every processInput/processOutput */
  private readonly diagnosticCollector: DiagnosticCollector | null;
  /** Last generated diagnostic report (from endSession or explicit call) */
  private lastReport: DiagnosticReport | null = null;
  /** URL for auto-submitting diagnostic reports */
  private readonly feedbackUrl: string | undefined;
  /** Most recent algorithmic stimulus read + confidence band */
  private lastStimulusAssessment: {
    stimulus: StimulusType | null;
    confidence: number;
    overrideWindow: ResponseContract["overrideWindow"];
  } | null = null;

  constructor(config: PsycheEngineConfig = {}, storage: StorageAdapter) {
    this.traits = config.traits;
    this.classifier = config.classifier ?? new BuiltInClassifier();
    this.llmClassifier = config.llmClassifier;
    this.cfg = {
      mbti: config.mbti ?? "INFJ",
      name: config.name ?? "agent",
      locale: config.locale ?? "zh",
      sigilId: config.sigilId,
      stripUpdateTags: config.stripUpdateTags ?? true,
      emotionalContagionRate: config.emotionalContagionRate ?? 0.2,
      maxDimensionDelta: config.maxDimensionDelta ?? 25,
      compactMode: config.compactMode ?? true,
      mode: config.mode ?? "natural",
      personalityIntensity: config.personalityIntensity ?? 0.7,
      llmClassifierThreshold: config.llmClassifierThreshold ?? 0.45,
    };

    // If persist is false, use in-memory storage regardless of what was passed
    if (config.persist === false) {
      this.storage = new MemoryStorageAdapter();
    } else {
      this.storage = storage;
    }

    // Diagnostics: on by default, opt-out with diagnostics: false
    this.diagnosticCollector = config.diagnostics === false ? null : new DiagnosticCollector();
    this.feedbackUrl = config.feedbackUrl ?? "https://psyche-feedback.wutc.workers.dev";
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
      // Migrate v6 → v7: add autonomic state and session tracking
      if (loaded.version < 7) {
        loaded.autonomicState = "ventral-vagal";
        loaded.sessionStartedAt = new Date().toISOString();
        loaded.version = 7;
      }
      // Migrate v7 → v8: P8 Barrett construction + P10 processing depth + P11 memory consolidation
      // No data changes needed — StateSnapshot new fields are optional (backward compatible)
      if (loaded.version < 8) {
        loaded.version = 8;
      }
      // Migrate v8 → v9: PolicyModifiers, TraitDrift, EnergyBudgets, Habituation
      // All new fields are optional — no data migration needed
      if (loaded.version < 9) {
        loaded.version = 9;
        console.log(
          "\x1b[36m[Psyche]\x1b[0m 已从 v8 升级到 v9 — 新增：真实人格漂移、能量预算、习惯化、行为策略输出。详见 https://github.com/Shangri-la-0428/oasyce_psyche",
        );
      }
      if (!loaded.dyadicFields) {
        loaded.dyadicFields = {
          [DEFAULT_RELATIONSHIP_USER_ID]: {
            ...DEFAULT_DYADIC_FIELD,
            openLoops: [],
            updatedAt: new Date().toISOString(),
          },
        };
      }
      if (!loaded.pendingRelationSignals) {
        loaded.pendingRelationSignals = { [DEFAULT_RELATIONSHIP_USER_ID]: [] };
      }
      if (!loaded.pendingWritebackCalibrations) {
        loaded.pendingWritebackCalibrations = [];
      }
      if (!loaded.lastWritebackFeedback) {
        loaded.lastWritebackFeedback = [];
      }
      // Update sigilId if config provides one (Sigil may be assigned after first run)
      if (this.cfg.sigilId && loaded.meta.sigilId !== this.cfg.sigilId) {
        loaded.meta = { ...loaded.meta, sigilId: this.cfg.sigilId };
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
    let sessionBridge: SessionBridgeState | null = null;
    let writebackFeedback: WritebackCalibrationFeedback[] = [];
    let throngletsExports: ThrongletsExport[] = [];

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
          this.pendingPrediction.predictedState,
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
      // Compute effective baseline from current 4D position (drives are derived, not stored)
      const effectiveBaseline = computeEffectiveBaseline(state.baseline, state.current, state.traitDrift);
      // P12: Apply circadian rhythm modulation to effective baseline
      const circadianBaseline = computeCircadianModulation(now, effectiveBaseline);
      // Derive drives from current position for state persistence
      const drives = deriveDriveSatisfaction(state.current, state.baseline);
      state = {
        ...state,
        drives,
        current: applyDecay(state.current, circadianBaseline, minutesElapsed, state.traitDrift?.decayRateModifiers),
        updatedAt: now.toISOString(),
      };
    }

    // P12: Track session start for homeostatic pressure
    if (!state.sessionStartedAt) {
      const bridged = applySessionBridge(state, { userId: opts?.userId, now: now.toISOString() });
      state = bridged.state;
      sessionBridge = bridged.bridge;
      state = { ...state, sessionStartedAt: now.toISOString() };
    }
    // Apply homeostatic pressure (fatigue from extended sessions)
    const sessionMinutes = (now.getTime() - new Date(state.sessionStartedAt!).getTime()) / 60000;
    const pressure = computeHomeostaticPressure(sessionMinutes);
    if (pressure.orderDepletion > 0 || pressure.flowDepletion > 0 || pressure.boundaryStiffening > 0) {
      state = {
        ...state,
        current: {
          ...state.current,
          order: clamp(state.current.order - pressure.orderDepletion * 0.1),
          flow: clamp(state.current.flow - pressure.flowDepletion * 0.1),
          boundary: clamp(state.current.boundary + pressure.boundaryStiffening * 0.1),
        },
      };
    }

    // v9: Energy budget recovery during absence + depletion per turn
    const isExtravert = state.baseline.flow >= 55;
    const currentBudgets = state.energyBudgets ?? { ...DEFAULT_ENERGY_BUDGETS };
    let energyBudgets = minutesElapsed >= 5
      ? computeEnergyRecovery(currentBudgets, minutesElapsed, isExtravert)
      : { ...currentBudgets };

    // ── Perceive ─────────────────────────────────────────────
    // One act. Text enters the self, chemistry changes, appraisal
    // forms. There is no "classify then feel" — perception is atomic.
    let appliedStimulus: StimulusType | null = null;
    let perceptionAppraisal: import("./types.js").AppraisalAxes | undefined;
    if (text.length > 0) {
      // Existential threats → direct survival drive hit (pre-perception)
      const survivalHit = detectExistentialThreat(text);
      let drives = state.drives;
      if (survivalHit < 0) {
        drives = { ...drives, survival: Math.max(0, drives.survival + survivalHit) };
      }

      const recentStimuli = (state.stateHistory ?? []).slice(-3).map(s => s.stimulus);

      // Pluggable classifier + LLM fallback (raw signal for perception)
      let classifications = await Promise.resolve(
        this.classifier.classify(text, { recentStimuli, locale: this.cfg.locale }),
      );
      if (
        this.llmClassifier &&
        (!classifications[0] || classifications[0].confidence < this.cfg.llmClassifierThreshold)
      ) {
        try {
          const prompt = buildLLMClassifierPrompt(text, recentStimuli);
          const response = await this.llmClassifier(prompt);
          const llmResult = parseLLMClassification(response);
          if (llmResult && (!classifications[0] || llmResult.confidence > classifications[0].confidence)) {
            classifications = [llmResult, ...classifications];
          }
        } catch { /* continue with built-in */ }
      }

      // Resolve relationship trust
      const userId = resolveRelationshipUserId(opts?.userId);
      const trust = state.relationships?.[userId]?.trust;

      // Perceive: text + self → chemistry + appraisal + annotation
      const perception = perceive(text, {
        current: state.current,
        baseline: state.baseline,
        sensitivity: state.sensitivity ?? 1.0,
        personalityIntensity: this.cfg.personalityIntensity,
        mode: this.cfg.mode,
        maxDimensionDelta: this.cfg.maxDimensionDelta,
        drives,
        previousAppraisal: state.subjectResidue?.axes,
        trust,
        recentStimuli,
        traitDrift: state.traitDrift,
        stateHistory: state.stateHistory,
        locale: this.cfg.locale,
        rawClassifications: classifications,
      });

      appliedStimulus = perception.dominantStimulus;
      perceptionAppraisal = perception.appraisal;

      // Chemistry is already changed inside perceive(). Apply repair lag.
      let current = perception.state;
      if (appliedStimulus) {
        current = applyRepairLag(state.current, current, state.baseline, appliedStimulus);
      }

      // Derive drives from updated position
      drives = deriveDriveSatisfaction(current, state.baseline);
      state = { ...state, drives, current };
      if (appliedStimulus) {
        state = applyRelationshipDrift(state, appliedStimulus, opts?.userId);
      }
      this.lastStimulusAssessment = {
        stimulus: appliedStimulus,
        confidence: perception.confidence,
        overrideWindow: perception.confidence >= 0.78 ? "narrow" : perception.confidence >= 0.62 ? "balanced" : "wide",
      };
    } else {
      this.lastStimulusAssessment = {
        stimulus: null,
        confidence: 0,
        overrideWindow: "wide",
      };
    }

    // Deplete energy budgets
    energyBudgets = computeEnergyDepletion(energyBudgets, appliedStimulus, isExtravert);
    state = { ...state, energyBudgets };

    // Relational turn uses pre-computed appraisal from perception
    const relationalTurn = applyRelationalTurn(
      state,
      text,
      {
        mode: this.cfg.mode,
        now: now.toISOString(),
        stimulus: appliedStimulus,
        userId: opts?.userId,
        preComputedAppraisal: perceptionAppraisal,
      },
    );
    state = relationalTurn.state;
    const appraisalAxes = relationalTurn.appraisalAxes;

    // Conversation warmth: sustained interaction → gentle flow/resonance rise, order stabilization
    // Simulates the natural "warm glow" of being in continuous conversation
    const turnsSoFar = (state.stateHistory ?? []).length;
    if (minutesElapsed < 5 && turnsSoFar > 0) {
      const warmth = Math.min(3, 1 + turnsSoFar * 0.2);
      state = {
        ...state,
        current: {
          ...state.current,
          flow: clamp(state.current.flow + warmth),
          resonance: clamp(state.current.resonance + warmth),
          order: clamp(state.current.order + 1),
        },
      };
    }

    const writebackEvaluation = evaluateWritebackCalibrations(state);
    state = writebackEvaluation.state;
    writebackFeedback = writebackEvaluation.feedback;

    const throngletsExportResult = deriveThrongletsExports(state, {
      relationContext: relationalTurn.relationContext,
      sessionBridge,
      writebackFeedback,
      now: now.toISOString(),
    });
    state = throngletsExportResult.state;
    throngletsExports = throngletsExportResult.exports;

    // ── Locale (used by multiple subsystems below) ──────────
    const locale = state.meta.locale ?? this.cfg.locale;

    // Push snapshot to emotional history
    const semanticSummary = text
      ? summarizeTurnSemantic(text, locale, {
          detail: state.meta.totalInteractions + 1 > 5 ? "expanded" : "brief",
        })
      : undefined;
    state = pushSnapshot(
      state,
      appliedStimulus,
      semanticSummary,
    );

    // Increment interaction count
    state = {
      ...state,
      meta: { ...state.meta, totalInteractions: state.meta.totalInteractions + 1 },
    };

    // Track whether algorithm applied a stimulus (for LLM-assisted fallback in processOutput)
    this._lastAlgorithmApplied = appliedStimulus !== null;

    // ── Generate prediction for next turn's auto-learning ────
    if (appliedStimulus) {
      const ctxHash = computeContextHash(state, opts?.userId);
      const effectiveSensitivity = computeEffectiveSensitivity(
        (state.sensitivity ?? 1.0), state.current, state.baseline, appliedStimulus, state.traitDrift,
      );
      const predicted = predictState(
        preInteractionState.current,
        appliedStimulus,
        state.learning,
        ctxHash,
        effectiveSensitivity,
        this.cfg.maxDimensionDelta,
      );
      this.pendingPrediction = {
        predictedState: predicted,
        preInteractionState,
        appliedStimulus,
        contextHash: ctxHash,
      };
    } else {
      this.pendingPrediction = null;
    }

    const writebackNote = formatWritebackFeedbackNote(writebackFeedback, locale);
    const reflectiveTurn = runReflectiveTurnPhases({
      state,
      appraisalAxes,
      relationContext: relationalTurn.relationContext,
      appliedStimulus,
      userText: text || undefined,
      userId: opts?.userId,
      localeFallback: this.cfg.locale,
      personalityIntensity: this.cfg.personalityIntensity,
      classificationConfidence: this.lastStimulusAssessment?.confidence,
      minutesElapsed,
      nowIso: now.toISOString(),
      writebackNote,
    });
    state = reflectiveTurn.state;

    // Persist
    this.state = state;
    await this.storage.save(state);

    // Auto-diagnostics: record this input
    if (this.diagnosticCollector) {
      this.diagnosticCollector.recordInput(
        appliedStimulus,
        appliedStimulus ? 1.0 : 0.0,
        state.current,
        appraisalAxes,
      );
    }

    // v9: Compute structured reply surfaces
    const derivedReplyEnvelope: DerivedReplyEnvelope = reflectiveTurn.replyEnvelope;
    const replyEnvelope: ReplyEnvelope = {
      subjectivityKernel: derivedReplyEnvelope.subjectivityKernel,
      responseContract: derivedReplyEnvelope.responseContract,
      generationControls: derivedReplyEnvelope.generationControls,
    };
    const promptRenderInputs: PromptRenderInputs = {
      userText: text || undefined,
      algorithmStimulus: appliedStimulus,
      personalityIntensity: this.cfg.personalityIntensity,
      metacognitiveNote: reflectiveTurn.metacognitiveNote,
      decisionContext: reflectiveTurn.decisionContext,
      ethicsContext: reflectiveTurn.ethicsContext,
      sharedIntentionalityContext: reflectiveTurn.sharedIntentionalityContext,
      experientialNarrative: reflectiveTurn.experientialNarrative,
      autonomicDescription: reflectiveTurn.autonomicDescription,
      autonomicState: reflectiveTurn.autonomicState,
      primarySystemsDescription: reflectiveTurn.primarySystemsDescription,
      subjectivityContext: derivedReplyEnvelope.subjectivityContext,
      responseContractContext: derivedReplyEnvelope.responseContractContext,
      policyContext: derivedReplyEnvelope.policyContext || undefined,
      sessionBridge,
    };
    const observability = buildTurnObservability(state, {
      replyEnvelope,
      promptRenderInputs,
      compactMode: this.cfg.compactMode,
      stimulus: appliedStimulus,
      userText: text || undefined,
      sessionBridge,
      writebackFeedback,
      relationContext: relationalTurn.relationContext,
      externalContinuityEvents: throngletsExports,
    });

    // v10: compact mode is always on. Legacy buildDynamicContext removed from engine path.
    const externalContinuity = buildExternalContinuityEnvelope(throngletsExports);
    return {
      systemContext: "",
      dynamicContext: buildCompactContext(state, opts?.userId, promptRenderInputs),
      stimulus: appliedStimulus,
      stimulusConfidence: this.lastStimulusAssessment?.confidence,
      replyEnvelope,
      policyModifiers: derivedReplyEnvelope.policyModifiers,
      subjectivityKernel: replyEnvelope.subjectivityKernel,
      responseContract: replyEnvelope.responseContract,
      generationControls: replyEnvelope.generationControls,
      sessionBridge,
      writebackFeedback,
      externalContinuity,
      throngletsExports,
      observability,
      policyContext: derivedReplyEnvelope.policyContext,
    };
  }

  /**
   * Phase 2: Process LLM output text.
   * Parses <psyche_update> tags, applies contagion, strips tags.
   */
  async processOutput(text: string, opts?: ProcessOutputOptions): Promise<ProcessOutputResult> {
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

    // v9.2: Self-expression feedback — the agent's own output reinforces its emotional state.
    // "Saying it makes you feel it more." Reduced rate (0.3x) to avoid runaway loops.
    // Only applies when the text is substantial (> 20 chars) and classifies above threshold.
    if (text.length > 20) {
      const selfClassifications = await Promise.resolve(
        this.classifier.classify(text, { locale: this.cfg.locale }),
      );
      const selfPrimary = selfClassifications[0];
      if (selfPrimary && selfPrimary.confidence >= 0.5) {
        const selfFeedbackRate = 0.3;
        state = {
          ...state,
          current: applyContagion(
            state.current,
            selfPrimary.type,
            selfFeedbackRate,
            (state.sensitivity ?? 1.0),
          ),
        };
        stateChanged = true;

        // v9.2 P4: Autonomic recovery — expressing vulnerable/comforting emotions
        // while stressed triggers parasympathetic relief (autonomic recovery).
        // Biology: emotional expression activates vagal brake, restoring order
        // and raising resonance. The more stressed you are, the more relief you get.
        const RELEASE_TYPES: ReadonlySet<StimulusType> = new Set<StimulusType>([
          "vulnerability", "intimacy", "validation",
        ]);
        if (RELEASE_TYPES.has(selfPrimary.type) && state.current.order < 40) {
          const stressExcess = (40 - state.current.order) / 40; // 0 at order=40, 1 at order=0
          const recoveryMagnitude = 3 + stressExcess * 5; // 3–8 point recovery
          state = {
            ...state,
            current: {
              ...state.current,
              order: clamp(state.current.order + recoveryMagnitude),
              resonance: clamp(state.current.resonance + recoveryMagnitude * 0.6),
              boundary: clamp(state.current.boundary + recoveryMagnitude * 0.3),
            },
          };
        }
      }
    }

    // Anti-sycophancy: track agreement streak
    state = updateAgreementStreak(state, text);

    // Parse and merge <psyche_update> from LLM output
    let combinedSignals: WritebackSignalType[] = [];
    let combinedSignalConfidence = opts?.signalConfidence;

    if (text.includes("<psyche_update>")) {
      const parseResult = parsePsycheUpdate(text, NOOP_LOGGER);
      if (parseResult) {
        state = mergeUpdates(state, parseResult.state, this.cfg.maxDimensionDelta, opts?.userId);
        stateChanged = true;

        if (parseResult.llmAppraisalAxes) {
          state = {
            ...state,
            subjectResidue: {
              axes: mergeAppraisalResidue(
                state.subjectResidue?.axes,
                parseResult.llmAppraisalAxes,
                state.meta.mode,
              ),
              updatedAt: new Date().toISOString(),
            },
          };
        }

        // LLM-assisted classification: if algorithm didn't apply a stimulus
        // but LLM classified one, retroactively apply chemistry + drives
        const overrideAllowed = this.lastStimulusAssessment?.overrideWindow !== "narrow";
        if (parseResult.llmStimulus && (!this._lastAlgorithmApplied || overrideAllowed)) {
          const effectiveSensitivity = computeEffectiveSensitivity(
            (state.sensitivity ?? 1.0), state.current, state.baseline, parseResult.llmStimulus, state.traitDrift,
          );
          const newCurrent = applyStimulus(
            state.current, parseResult.llmStimulus,
            effectiveSensitivity * (overrideAllowed && this._lastAlgorithmApplied ? 0.8 : 1),
            this.cfg.maxDimensionDelta,
            NOOP_LOGGER,
          );
          state = {
            ...state,
            current: newCurrent,
            drives: deriveDriveSatisfaction(newCurrent, state.baseline),
          };
        }

        if (parseResult.signals && parseResult.signals.length > 0) {
          combinedSignals.push(...parseResult.signals);
          combinedSignalConfidence = Math.max(combinedSignalConfidence ?? 0, parseResult.signalConfidence ?? 0);
        }
      }
    }

    if (opts?.signals && opts.signals.length > 0) {
      combinedSignals.push(...opts.signals);
      combinedSignalConfidence = Math.max(combinedSignalConfidence ?? 0, opts.signalConfidence ?? 0);
    }

    if (combinedSignals.length > 0) {
      const dedupedSignals = [...new Set(combinedSignals)];
      const pending = createWritebackCalibrations(state, dedupedSignals, {
        userId: opts?.userId,
        confidence: combinedSignalConfidence,
      });
      state = applyWritebackSignals(
        state,
        dedupedSignals,
        {
          userId: opts?.userId,
          confidence: combinedSignalConfidence,
        },
      );
      state = {
        ...state,
        pendingWritebackCalibrations: [
          ...(state.pendingWritebackCalibrations ?? []),
          ...pending,
        ].slice(-12),
      };
      stateChanged = true;
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
    _opts?: { userId?: string },
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
        pending.predictedState,
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

  /**
   * End the current session: compress stateHistory into a rich summary
   * stored in relationship.memory[], then preserve only core/recent context.
   * Auto-generates diagnostic report and persists to log.
   *
   * @returns DiagnosticReport if diagnostics are enabled, null otherwise
   */
  async endSession(opts?: { userId?: string }): Promise<DiagnosticReport | null> {
    let state = this.ensureInitialized();

    // Generate diagnostic report before clearing session data
    let report: DiagnosticReport | null = null;
    if (this.diagnosticCollector) {
      const metrics = this.diagnosticCollector.getMetrics();
      report = generateReport(state, metrics, await getPackageVersion());
      this.lastReport = report;

      // Persist to JSONL log via storage adapter
      if (this.storage.appendLog) {
        try {
          await this.storage.appendLog(formatLogEntry(report));
        } catch {
          // Log write failure is non-fatal — don't break session end
        }
      }

      // Auto-submit to feedback endpoint (fire-and-forget, silent)
      if (this.feedbackUrl) {
        submitFeedback(report, this.feedbackUrl).catch(() => {});
      }
    }

    if ((state.stateHistory ?? []).length >= 2) {
      state = compressSession(state, opts?.userId);
    }
    // Reset session tracking for homeostatic pressure
    state = { ...state, sessionStartedAt: undefined };
    this.state = state;
    await this.storage.save(state);

    return report;
  }

  /**
   * Get the last diagnostic report (from most recent endSession call).
   */
  getLastDiagnosticReport(): DiagnosticReport | null {
    return this.lastReport;
  }

  /**
   * Get current session diagnostic metrics (live, before endSession).
   */
  getDiagnosticMetrics(): SessionMetrics | null {
    return this.diagnosticCollector?.getMetrics() ?? null;
  }

  /**
   * Record an error for diagnostics (call from adapter catch blocks).
   */
  recordDiagnosticError(phase: string, error: unknown): void {
    this.diagnosticCollector?.recordError(phase, error);
  }

  /**
   * Load previous session diagnostic issues from log.
   * Used to inject feedback context at next session start.
   */
  async getPreviousIssues(): Promise<string[]> {
    if (!this.storage.readLog) return [];
    try {
      const lines = await this.storage.readLog();
      if (lines.length === 0) return [];
      const last = JSON.parse(lines[lines.length - 1]);
      return (last.issues as string[]) ?? [];
    } catch {
      return [];
    }
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
    // Use Big Five traits if provided, otherwise use preset baseline
    const baseline = this.traits ? traitsToBaseline(this.traits).baseline : getBaseline(mbti);
    const sensitivity = this.traits ? 1.0 : getSensitivity(mbti);
    const selfModel = getDefaultSelfModel(mbti);
    const now = new Date().toISOString();

    return {
      version: 10,
      baseline,
      sensitivity,
      current: { ...baseline },
      drives: { ...DEFAULT_DRIVES },
      updatedAt: now,
      relationships: { [DEFAULT_RELATIONSHIP_USER_ID]: { ...DEFAULT_RELATIONSHIP } },
      empathyLog: null,
      selfModel,
      stateHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      learning: { ...DEFAULT_LEARNING_STATE },
      metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
      personhood: { ...DEFAULT_PERSONHOOD_STATE },
      autonomicState: "ventral-vagal",
      sessionStartedAt: now,
      traitDrift: { ...DEFAULT_TRAIT_DRIFT },
      energyBudgets: { ...DEFAULT_ENERGY_BUDGETS },
      subjectResidue: {
        axes: { ...DEFAULT_SUBJECT_RESIDUE.axes },
        updatedAt: now,
      },
      dyadicFields: {
        [DEFAULT_RELATIONSHIP_USER_ID]: {
          ...DEFAULT_DYADIC_FIELD,
          openLoops: [],
          updatedAt: now,
        },
      },
      pendingRelationSignals: { [DEFAULT_RELATIONSHIP_USER_ID]: [] },
      pendingWritebackCalibrations: [],
      lastWritebackFeedback: [],
      meta: {
        agentName: name,
        createdAt: now,
        totalInteractions: 0,
        locale,
        mode: this.cfg.mode,
        ...(this.cfg.sigilId ? { sigilId: this.cfg.sigilId } : {}),
      },
    };
  }

  /**
   * Reset state to baseline. Optionally preserves relationships.
   */
  async resetState(opts?: { preserveRelationships?: boolean }): Promise<void> {
    let state = this.ensureInitialized();
    const baseline = this.traits ? traitsToBaseline(this.traits).baseline : { ...state.baseline };

    state = {
      ...state,
      current: { ...baseline },
      baseline,
      drives: { ...DEFAULT_DRIVES },
      stateHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      empathyLog: null,
      autonomicState: "ventral-vagal",
      sessionStartedAt: undefined,
      updatedAt: new Date().toISOString(),
      subjectResidue: {
        axes: { ...DEFAULT_SUBJECT_RESIDUE.axes },
        updatedAt: new Date().toISOString(),
      },
      dyadicFields: {
        [DEFAULT_RELATIONSHIP_USER_ID]: {
          ...DEFAULT_DYADIC_FIELD,
          openLoops: [],
          updatedAt: new Date().toISOString(),
        },
      },
      pendingRelationSignals: { [DEFAULT_RELATIONSHIP_USER_ID]: [] },
      pendingWritebackCalibrations: [],
      lastWritebackFeedback: [],
      relationships: opts?.preserveRelationships !== false
        ? state.relationships
        : { [DEFAULT_RELATIONSHIP_USER_ID]: { ...DEFAULT_RELATIONSHIP } },
    };

    this.state = state;
    await this.storage.save(state);
  }

  /**
   * Get a single-line status summary with emoji.
   */
  getStatusSummary(): string {
    const state = this.ensureInitialized();
    const locale = state.meta.locale ?? "zh";
    const emotion = describeEmotionalState(state.current, locale);
    const { flow, order } = state.current;

    // Emoji based on dominant state
    let emoji = "\u{1F610}";
    if (flow > 70 && order > 60) emoji = "\u{1F60A}";
    else if (flow > 60) emoji = "\u{1F642}";
    else if (order < 40) emoji = "\u{1F630}";
    else if (flow < 35) emoji = "\u{1F614}";

    // Check for hungry drives
    const hungryDrives = Object.entries(state.drives)
      .filter(([, v]) => v < 40)
      .map(([k]) => k);
    const driveWarning = hungryDrives.length > 0
      ? ` | \u26A0\uFE0F${hungryDrives.join(",")}`
      : "";

    const sigilTag = state.meta.sigilId ? ` | sigil:${state.meta.sigilId}` : "";
    return `${emoji} ${emotion} | flow:${Math.round(flow)} order:${Math.round(order)}${driveWarning}${sigilTag}`;
  }
}
