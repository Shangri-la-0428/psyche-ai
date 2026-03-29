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

import type { PsycheState, StimulusType, Locale, MBTIType, ChemicalState, OutcomeScore, PsycheMode, PersonalityTraits, PolicyModifiers, ClassifierProvider, SubjectivityKernel, ResponseContract, GenerationControls } from "./types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE, DEFAULT_ENERGY_BUDGETS, DEFAULT_TRAIT_DRIFT, DEFAULT_SUBJECT_RESIDUE, DEFAULT_DYADIC_FIELD } from "./types.js";
import type { StorageAdapter } from "./storage.js";
import { MemoryStorageAdapter } from "./storage.js";
import { applyDecay, applyStimulus, applyContagion, clamp, describeEmotionalState } from "./chemistry.js";
import { classifyStimulus, BuiltInClassifier, buildLLMClassifierPrompt, parseLLMClassification } from "./classify.js";
import { buildDynamicContext, buildProtocolContext, buildCompactContext } from "./prompt.js";
import { getSensitivity, getBaseline, getDefaultSelfModel, traitsToBaseline } from "./profiles.js";
import { isStimulusType } from "./guards.js";
import {
  parsePsycheUpdate, mergeUpdates, updateAgreementStreak, pushSnapshot,
  compressSession, summarizeTurnSemantic,
  type Logger,
} from "./psyche-file.js";
import {
  decayDrives, feedDrives, detectExistentialThreat,
  computeEffectiveBaseline, computeEffectiveSensitivity,
} from "./drives.js";
import { checkForUpdate, getPackageVersion } from "./update.js";
import { DiagnosticCollector, generateReport, formatLogEntry, runHealthCheck, submitFeedback } from "./diagnostics.js";
import type { DiagnosticReport, SessionMetrics } from "./diagnostics.js";
import {
  evaluateOutcome, computeContextHash, updateLearnedVector,
  predictChemistry, recordPrediction,
} from "./learning.js";
import { assessMetacognition } from "./metacognition.js";
import { buildDecisionContext, computePolicyModifiers, buildPolicyContext } from "./decision-bias.js";
import { computeExperientialField, type ConstructionContext } from "./experiential-field.js";
import { computeGenerativeSelf, buildIdentityNarrative } from "./generative-self.js";
import { updateSharedIntentionality, buildSharedIntentionalityContext } from "./shared-intentionality.js";
import { assessEthics, buildEthicalContext } from "./ethics.js";
import { computeCircadianModulation, computeHomeostaticPressure, computeEnergyDepletion, computeEnergyRecovery } from "./circadian.js";
import { computeAutonomicResult, type AutonomicResult } from "./autonomic.js";
import {
  computePrimarySystems, computeSystemInteractions,
  gatePrimarySystemsByAutonomic, describeBehavioralTendencies,
} from "./primary-systems.js";
import { computeSubjectivityKernel, buildSubjectivityContext } from "./subjectivity.js";
import { computeResponseContract, buildResponseContractContext } from "./response-contract.js";
import { deriveGenerationControls } from "./host-controls.js";
import { computeAppraisalAxes, mergeAppraisalResidue } from "./appraisal.js";
import { computeRelationMove, evolveDyadicField, evolvePendingRelationSignals } from "./relation-dynamics.js";

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
  /** v9: Structured behavioral policy modifiers — machine-readable "off baseline" signals */
  policyModifiers?: PolicyModifiers;
  /** v9.3: Compact machine-readable subjective state for AI-first hosts */
  subjectivityKernel?: SubjectivityKernel;
  /** v9.3: Compact next-reply behavioral envelope */
  responseContract?: ResponseContract;
  /** v9.3: Mechanical host controls derived from the reply envelope */
  generationControls?: GenerationControls;
  /**
   * v9: Ready-to-use LLM prompt fragment summarizing current behavioral policy.
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
  previous: ChemicalState,
  next: ChemicalState,
  baseline: ChemicalState,
  stimulus: StimulusType,
): ChemicalState {
  if (!REPAIRING_STIMULI.has(stimulus)) return next;

  const stressLoad = Math.max(0, previous.CORT - baseline.CORT);
  if (stressLoad < 15) return next;

  // High stress slows emotional recovery so apology/praise doesn't instantly
  // snap chemistry back to baseline.
  const repairFactor = Math.max(0.35, 1 - stressLoad / 50);
  const adjusted = { ...next };

  for (const key of ["DA", "HT", "OT", "END"] as const) {
    const delta = next[key] - previous[key];
    if (delta > 0) {
      adjusted[key] = clamp(previous[key] + delta * repairFactor);
    }
  }

  const cortDelta = next.CORT - previous.CORT;
  if (cortDelta < 0) {
    adjusted.CORT = clamp(previous.CORT + cortDelta * repairFactor);
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

  const key = userId ?? "_default";
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
    stripUpdateTags: boolean;
    emotionalContagionRate: number;
    maxChemicalDelta: number;
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

  constructor(config: PsycheEngineConfig = {}, storage: StorageAdapter) {
    this.traits = config.traits;
    this.classifier = config.classifier ?? new BuiltInClassifier();
    this.llmClassifier = config.llmClassifier;
    this.cfg = {
      mbti: config.mbti ?? "INFJ",
      name: config.name ?? "agent",
      locale: config.locale ?? "zh",
      stripUpdateTags: config.stripUpdateTags ?? true,
      emotionalContagionRate: config.emotionalContagionRate ?? 0.2,
      maxChemicalDelta: config.maxChemicalDelta ?? 25,
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
      // No data changes needed — ChemicalSnapshot new fields are optional (backward compatible)
      if (loaded.version < 8) {
        loaded.version = 8;
      }
      // Migrate v8 → v9: PolicyModifiers, TraitDrift, EnergyBudgets, Habituation
      // All new fields are optional — no data migration needed
      if (loaded.version < 9) {
        loaded.version = 9;
        console.log(
          "\x1b[36m[Psyche]\x1b[0m 已从 v8 升级到 v9 — 新增：真实人格漂移、能量预算、习惯化、行为策略输出。详见 https://github.com/Shangri-la-0428/psyche-ai",
        );
      }
      if (!loaded.dyadicFields) {
        loaded.dyadicFields = {
          _default: {
            ...DEFAULT_DYADIC_FIELD,
            openLoops: [],
            updatedAt: new Date().toISOString(),
          },
        };
      }
      if (!loaded.pendingRelationSignals) {
        loaded.pendingRelationSignals = { _default: [] };
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
      const effectiveBaseline = computeEffectiveBaseline(state.baseline, decayedDrives, state.traitDrift);
      // P12: Apply circadian rhythm modulation to effective baseline
      const circadianBaseline = computeCircadianModulation(now, effectiveBaseline);
      state = {
        ...state,
        drives: decayedDrives,
        current: applyDecay(state.current, circadianBaseline, minutesElapsed, state.traitDrift?.decayRateModifiers),
        updatedAt: now.toISOString(),
      };
    }

    // P12: Track session start for homeostatic pressure
    if (!state.sessionStartedAt) {
      state = { ...state, sessionStartedAt: now.toISOString() };
    }
    // Apply homeostatic pressure (fatigue from extended sessions)
    const sessionMinutes = (now.getTime() - new Date(state.sessionStartedAt!).getTime()) / 60000;
    const pressure = computeHomeostaticPressure(sessionMinutes);
    if (pressure.cortAccumulation > 0 || pressure.daDepletion > 0 || pressure.neDepletion > 0) {
      state = {
        ...state,
        current: {
          ...state.current,
          CORT: clamp(state.current.CORT + pressure.cortAccumulation * 0.1),
          DA: clamp(state.current.DA - pressure.daDepletion * 0.1),
          NE: clamp(state.current.NE - pressure.neDepletion * 0.1),
        },
      };
    }

    // v9: Energy budget recovery during absence + depletion per turn
    const isExtravert = this.cfg.mbti.startsWith("E");
    const currentBudgets = state.energyBudgets ?? { ...DEFAULT_ENERGY_BUDGETS };
    let energyBudgets = minutesElapsed >= 5
      ? computeEnergyRecovery(currentBudgets, minutesElapsed, isExtravert)
      : { ...currentBudgets };

    // Classify user stimulus and apply chemistry
    let appliedStimulus: StimulusType | null = null;
    if (text.length > 0) {
      // Check for existential threats → direct survival drive hit
      const survivalHit = detectExistentialThreat(text);
      let drives = state.drives;
      if (survivalHit < 0) {
        drives = { ...drives, survival: Math.max(0, drives.survival + survivalHit) };
      }

      const recentStimuli = (state.emotionalHistory ?? []).slice(-3).map(s => s.stimulus);
      // v9.1: Use pluggable classifier
      let classifications = await Promise.resolve(
        this.classifier.classify(text, { recentStimuli, locale: this.cfg.locale }),
      );
      // v9.1: LLM fallback when confidence is low
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
        } catch {
          // LLM call failed — continue with built-in result
        }
      }
      const primary = classifications[0];
      let current = state.current;
      if (primary && primary.confidence >= 0.5) {
        appliedStimulus = primary.type;
        const preStimulus = current;
        // Feed drives from stimulus, then apply stimulus with drive-modified sensitivity
        drives = feedDrives(drives, primary.type);
        const effectiveSensitivity = computeEffectiveSensitivity(
          getSensitivity(state.mbti), drives, primary.type, state.traitDrift,
        );
        // v9.2: Confidence modulates intensity — a 0.95 life-or-death dilemma
        // hits ~1.7x harder than a 0.55 mild disagreement.
        // Maps [0.5, 1.0] → [0.6, 1.2] via linear interpolation.
        const confidenceIntensity = 0.6 + (primary.confidence - 0.5) * 1.2;
        const modeMultiplier = this.cfg.mode === "work" ? 0.3 : this.cfg.mode === "companion" ? 1.5 : 1.0;
        const effectiveMaxDelta = this.cfg.mode === "work" ? 5 : this.cfg.maxChemicalDelta;
        // v9: Habituation — count recent same-type stimuli in this session
        const recentSameCount = (state.emotionalHistory ?? [])
          .filter(s => s.stimulus === primary.type).length + 1; // +1 for current
        current = applyStimulus(
          current, primary.type,
          effectiveSensitivity * this.cfg.personalityIntensity * modeMultiplier * confidenceIntensity,
          effectiveMaxDelta,
          NOOP_LOGGER,
          recentSameCount,
        );
        current = applyRepairLag(preStimulus, current, state.baseline, primary.type);
      }

      state = { ...state, drives, current };
      if (appliedStimulus) {
        state = applyRelationshipDrift(state, appliedStimulus, opts?.userId);
      }
    }

    // v9: Deplete energy budgets from this interaction turn
    energyBudgets = computeEnergyDepletion(energyBudgets, appliedStimulus, isExtravert);
    state = { ...state, energyBudgets };

    const appraisalAxes = computeAppraisalAxes(text, {
      mode: this.cfg.mode,
      stimulus: appliedStimulus,
      previous: state.subjectResidue?.axes,
    });
    state = {
      ...state,
      subjectResidue: {
        axes: mergeAppraisalResidue(state.subjectResidue?.axes, appraisalAxes, this.cfg.mode),
        updatedAt: now.toISOString(),
      },
    };
    const dyadKey = opts?.userId ?? "_default";
    const relationMove = computeRelationMove(text, {
      appraisal: appraisalAxes,
      stimulus: appliedStimulus,
      mode: this.cfg.mode,
      field: state.dyadicFields?.[dyadKey],
      relationship: state.relationships[dyadKey] ?? state.relationships._default,
    });
    const delayedRelation = evolvePendingRelationSignals(
      state.pendingRelationSignals?.[dyadKey],
      relationMove,
      appraisalAxes,
      { mode: this.cfg.mode },
    );
    state = {
      ...state,
      dyadicFields: {
        ...(state.dyadicFields ?? {}),
        [dyadKey]: evolveDyadicField(
          state.dyadicFields?.[dyadKey],
          relationMove,
          appraisalAxes,
          {
            mode: this.cfg.mode,
            now: now.toISOString(),
            delayedPressure: delayedRelation.delayedPressure,
          },
        ),
      },
      pendingRelationSignals: {
        ...(state.pendingRelationSignals ?? {}),
        [dyadKey]: delayedRelation.signals,
      },
    };

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

    // ── Locale (used by multiple subsystems below) ──────────
    const locale = state.meta.locale ?? this.cfg.locale;

    // ── P7+P10: Autonomic nervous system + Processing depth ────
    const autonomicResult = computeAutonomicResult(
      state.current,
      state.drives,
      state.autonomicState ?? null,
      minutesElapsed,
      locale,
      state.baseline,
      state.energyBudgets,
    );
    state = {
      ...state,
      autonomicState: autonomicResult.state,
    };
    const skip = new Set(autonomicResult.skippedStages);

    // ── P9: Primary emotional systems (Panksepp) ──────────────
    const rawSystems = computePrimarySystems(state.current, state.drives, appliedStimulus);
    const interactedSystems = computeSystemInteractions(rawSystems);
    const gatedSystems = gatePrimarySystemsByAutonomic(interactedSystems, autonomicResult.state);
    const primarySystemsDescription = describeBehavioralTendencies(gatedSystems, locale);

    // ── Metacognition: assess emotional state before acting ────
    // P10: Skip metacognition when processingDepth < 0.2 (System 1 mode)
    let metacognitiveAssessment: ReturnType<typeof assessMetacognition> | null = null;
    if (!skip.has("metacognition")) {
      metacognitiveAssessment = assessMetacognition(
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
    }

    // Push snapshot to emotional history
    state = pushSnapshot(
      state,
      appliedStimulus,
      text ? summarizeTurnSemantic(text, locale) : undefined,
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
        getSensitivity(state.mbti), state.drives, appliedStimulus, state.traitDrift,
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

    // ── P6: Digital Personhood computations (P10-gated) ────────

    // Experiential field — unified inner experience (P8: Barrett construction context)
    const constructionContext: ConstructionContext = {
      autonomicState: autonomicResult.state,
      stimulus: appliedStimulus,
      relationshipPhase: (state.relationships._default ?? state.relationships[Object.keys(state.relationships)[0]])?.phase,
      predictionError: state.learning.predictionHistory.length > 0
        ? state.learning.predictionHistory[state.learning.predictionHistory.length - 1].predictionError
        : undefined,
    };
    const experientialField = skip.has("experiential-field")
      ? null
      : computeExperientialField(state, metacognitiveAssessment ?? undefined, undefined, constructionContext);

    // Shared intentionality — theory of mind + joint attention
    const sharedState = skip.has("shared-intentionality")
      ? null
      : updateSharedIntentionality(state, appliedStimulus, opts?.userId);

    // Ethics — emotional self-care check
    const ethicalAssessment = skip.has("ethics")
      ? null
      : assessEthics(state);

    // Generative self — update identity narrative periodically (every 10 turns)
    if (!skip.has("generative-self")
      && state.meta.totalInteractions % 10 === 0 && state.meta.totalInteractions > 0) {
      const selfModel = computeGenerativeSelf(state);
      state = {
        ...state,
        personhood: {
          ...state.personhood,
          identityNarrative: selfModel.identityNarrative,
          growthDirection: selfModel.growthArc.direction,
          causalInsights: selfModel.causalInsights.slice(0, 20).map((ci) => ({
            trait: ci.trait,
            because: ci.because,
            confidence: ci.confidence,
            discoveredAt: new Date().toISOString(),
          })),
        },
      };
    }

    // Persist ethical concerns if significant
    if (ethicalAssessment && ethicalAssessment.ethicalHealth < 0.7) {
      const newConcerns = ethicalAssessment.concerns
        .filter((c) => c.severity > 0.4)
        .map((c) => ({ type: c.type, severity: c.severity, timestamp: new Date().toISOString() }));
      if (newConcerns.length > 0) {
        state = {
          ...state,
          personhood: {
            ...state.personhood,
            ethicalConcernHistory: [
              ...state.personhood.ethicalConcernHistory.slice(-14),
              ...newConcerns,
            ],
          },
        };
      }
    }

    // Persist theory of mind
    if (sharedState && sharedState.theoryOfMind.confidence > 0.3) {
      const userId = opts?.userId ?? "_default";
      state = {
        ...state,
        personhood: {
          ...state.personhood,
          theoryOfMind: {
            ...state.personhood.theoryOfMind,
            [userId]: {
              estimatedMood: sharedState.theoryOfMind.estimatedMood,
              estimatedIntent: sharedState.theoryOfMind.estimatedIntent,
              confidence: sharedState.theoryOfMind.confidence,
              lastUpdated: sharedState.theoryOfMind.lastUpdated,
            },
          },
        },
      };
    }

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

    // Build metacognitive and decision context strings
    const metacogNote = metacognitiveAssessment?.metacognitiveNote;
    const decisionCtx = buildDecisionContext(state);
    const ethicsCtx = ethicalAssessment ? buildEthicalContext(ethicalAssessment, locale) : undefined;
    const sharedCtx = sharedState ? buildSharedIntentionalityContext(sharedState, locale) : undefined;
    const experientialNarrative = experientialField?.narrative || undefined;

    // v9: Compute structured policy modifiers
    const policyModifiers = computePolicyModifiers(state);
    const subjectivityKernel = computeSubjectivityKernel(state, policyModifiers, appraisalAxes, opts?.userId);
    const subjectivityCtx = buildSubjectivityContext(subjectivityKernel, locale);
    const responseContract = computeResponseContract(subjectivityKernel, {
      locale,
      userText: text || undefined,
      algorithmStimulus: appliedStimulus,
      personalityIntensity: this.cfg.personalityIntensity,
    });
    const responseContractCtx = buildResponseContractContext(responseContract, locale);
    const policyCtx = buildPolicyContext(policyModifiers, locale, state.drives);
    const generationControls = deriveGenerationControls({
      responseContract,
      policyModifiers,
    });

    // P10: Append processing depth info to autonomic description when depth is low
    let autonomicDesc: string | undefined;
    if (autonomicResult.state !== "ventral-vagal") {
      autonomicDesc = autonomicResult.description;
      if (autonomicResult.processingDepth < 0.5) {
        const depthNote = locale === "en"
          ? " Reflective capacity reduced — intuitive reactions."
          : "反思能力降低——直觉反应中。";
        autonomicDesc += depthNote;
      }
    }

    if (this.cfg.compactMode) {
      return {
        systemContext: "",
        dynamicContext: buildCompactContext(state, opts?.userId, {
          userText: text || undefined,
          algorithmStimulus: appliedStimulus,
          personalityIntensity: this.cfg.personalityIntensity,
          metacognitiveNote: metacogNote || undefined,
          decisionContext: decisionCtx || undefined,
          ethicsContext: ethicsCtx || undefined,
          sharedIntentionalityContext: sharedCtx || undefined,
          experientialNarrative: experientialNarrative,
          autonomicDescription: autonomicDesc,
          autonomicState: autonomicResult.state,
          primarySystemsDescription: primarySystemsDescription || undefined,
          subjectivityContext: subjectivityCtx,
          responseContractContext: responseContractCtx,
          policyContext: policyCtx || undefined,
        }),
        stimulus: appliedStimulus,
        policyModifiers,
        subjectivityKernel,
        responseContract,
        generationControls,
        policyContext: policyCtx,
      };
    }

    return {
      systemContext: this.getProtocol(locale),
      dynamicContext: buildDynamicContext(state, opts?.userId, {
        metacognitiveNote: metacogNote || undefined,
        decisionContext: decisionCtx || undefined,
        ethicsContext: ethicsCtx || undefined,
        sharedIntentionalityContext: sharedCtx || undefined,
        experientialNarrative: experientialNarrative,
        autonomicDescription: autonomicDesc,
        autonomicState: autonomicResult.state,
        primarySystemsDescription: primarySystemsDescription || undefined,
        policyContext: policyCtx || undefined,
      }),
      stimulus: appliedStimulus,
      policyModifiers,
      subjectivityKernel,
      responseContract,
      generationControls,
      policyContext: policyCtx,
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
            getSensitivity(state.mbti),
          ),
        };
        stateChanged = true;

        // v9.2 P4: Autonomic recovery — expressing vulnerable/comforting emotions
        // while stressed triggers parasympathetic relief (post-cry cortisol drop).
        // Biology: emotional expression activates vagal brake, releasing endorphins
        // and lowering cortisol. The more stressed you are, the more relief you get.
        const RELEASE_TYPES: ReadonlySet<StimulusType> = new Set<StimulusType>([
          "vulnerability", "intimacy", "validation",
        ]);
        if (RELEASE_TYPES.has(selfPrimary.type) && state.current.CORT > 60) {
          const stressExcess = (state.current.CORT - 60) / 40; // 0 at CORT=60, 1 at CORT=100
          const recoveryMagnitude = 3 + stressExcess * 5; // 3–8 point CORT drop
          state = {
            ...state,
            current: {
              ...state.current,
              CORT: clamp(state.current.CORT - recoveryMagnitude),
              END: clamp(state.current.END + recoveryMagnitude * 0.6),
              HT: clamp(state.current.HT + recoveryMagnitude * 0.3),
            },
          };
        }
      }
    }

    // Anti-sycophancy: track agreement streak
    state = updateAgreementStreak(state, text);

    // Parse and merge <psyche_update> from LLM output
    if (text.includes("<psyche_update>")) {
      const parseResult = parsePsycheUpdate(text, NOOP_LOGGER);
      if (parseResult) {
        state = mergeUpdates(state, parseResult.state, this.cfg.maxChemicalDelta, opts?.userId);
        stateChanged = true;

        // LLM-assisted classification: if algorithm didn't apply a stimulus
        // but LLM classified one, retroactively apply chemistry + drives
        if (parseResult.llmStimulus && !this._lastAlgorithmApplied) {
          state = {
            ...state,
            drives: feedDrives(state.drives, parseResult.llmStimulus),
          };
          const effectiveSensitivity = computeEffectiveSensitivity(
            getSensitivity(state.mbti), state.drives, parseResult.llmStimulus, state.traitDrift,
          );
          state = {
            ...state,
            current: applyStimulus(
              state.current, parseResult.llmStimulus,
              effectiveSensitivity,
              this.cfg.maxChemicalDelta,
              NOOP_LOGGER,
            ),
          };
        }
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

  /**
   * End the current session: compress emotionalHistory into a rich summary
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

    if ((state.emotionalHistory ?? []).length >= 2) {
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
    // Use Big Five traits if provided, otherwise use MBTI baseline
    const baseline = this.traits ? traitsToBaseline(this.traits).baseline : getBaseline(mbti);
    const selfModel = getDefaultSelfModel(mbti);
    const now = new Date().toISOString();

    return {
      version: 9,
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
      autonomicState: "ventral-vagal",
      sessionStartedAt: now,
      traitDrift: { ...DEFAULT_TRAIT_DRIFT },
      energyBudgets: { ...DEFAULT_ENERGY_BUDGETS },
      subjectResidue: {
        axes: { ...DEFAULT_SUBJECT_RESIDUE.axes },
        updatedAt: now,
      },
      dyadicFields: {
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          openLoops: [],
          updatedAt: now,
        },
      },
      pendingRelationSignals: { _default: [] },
      meta: {
        agentName: name,
        createdAt: now,
        totalInteractions: 0,
        locale,
        mode: this.cfg.mode,
      },
    };
  }

  /**
   * Reset state to baseline. Optionally preserves relationships.
   */
  async resetState(opts?: { preserveRelationships?: boolean }): Promise<void> {
    let state = this.ensureInitialized();
    const baseline = this.traits ? traitsToBaseline(this.traits).baseline : getBaseline(state.mbti);

    state = {
      ...state,
      current: { ...baseline },
      baseline,
      drives: { ...DEFAULT_DRIVES },
      emotionalHistory: [],
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
        _default: {
          ...DEFAULT_DYADIC_FIELD,
          openLoops: [],
          updatedAt: new Date().toISOString(),
        },
      },
      pendingRelationSignals: { _default: [] },
      relationships: opts?.preserveRelationships !== false
        ? state.relationships
        : { _default: { ...DEFAULT_RELATIONSHIP } },
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
    const { DA, CORT } = state.current;

    // Emoji based on dominant state
    let emoji = "\u{1F610}";
    if (DA > 70 && CORT < 40) emoji = "\u{1F60A}";
    else if (DA > 60) emoji = "\u{1F642}";
    else if (CORT > 60) emoji = "\u{1F630}";
    else if (DA < 35) emoji = "\u{1F614}";

    // Check for hungry drives
    const hungryDrives = Object.entries(state.drives)
      .filter(([, v]) => v < 40)
      .map(([k]) => k);
    const driveWarning = hungryDrives.length > 0
      ? ` | \u26A0\uFE0F${hungryDrives.join(",")}`
      : "";

    return `${emoji} ${emotion} | DA:${Math.round(DA)} CORT:${Math.round(CORT)}${driveWarning}`;
  }
}
