// ============================================================
// psyche-ai — Universal AI Emotional Intelligence Plugin
//
// Public API surface (~20 essential exports).
// Internal computation functions remain accessible via direct
// module imports (e.g. "psyche-ai/src/learning.js") for tests
// and advanced use, but are NOT part of the public contract.
//
// Framework adapters available via subpath imports:
//   psyche-ai/openclaw    — OpenClaw plugin
//   psyche-ai/vercel-ai   — Vercel AI SDK middleware
//   psyche-ai/langchain   — LangChain helper
//   psyche-ai/http        — HTTP server for Python/Go/etc.
//   psyche-ai/claude-sdk  — Claude Agent SDK hooks
// ============================================================

// ── Core engine ─────────────────────────────────────────────
export { PsycheEngine } from "./core.js";
export type { PsycheEngineConfig, ProcessInputResult, ProcessOutputResult, ProcessOutcomeResult } from "./core.js";

// ── Storage ─────────────────────────────────────────────────
export { FileStorageAdapter, MemoryStorageAdapter } from "./storage.js";
export type { StorageAdapter } from "./storage.js";

// ── Types (public contract) ─────────────────────────────────
export type {
  PsycheState, SelfState, Locale, PsycheMode, StimulusType, MBTIType,
  ImpactVector,
  WritebackSignalType,
  DelegateCapability, CapabilityGrant, RevocationCondition, DelegateAuthorization,
  ModeProfile,
  WeightedStimulus,
  StateSnapshot,
} from "./types.js";
export { MODE_PROFILES, DIMENSION_KEYS, DIMENSION_NAMES, DIMENSION_NAMES_ZH, DIMENSION_SPECS } from "./types.js";

// ── Core dynamics ──────────────────────────────────────────
export { applyImpact, applyImpactContagion, isPositiveImpact, isEmotionalImpact, isThreateningImpact } from "./chemistry.js";
export { deriveDriveSatisfaction } from "./drives.js";

// ── Perception (v10.3) ─────────────────────────────────────
export { perceive } from "./perceive.js";
export type { Self, Perception } from "./perceive.js";

// ── Prompt context builders ─────────────────────────────────
export { buildProtocolContext, buildCompactContext } from "./prompt.js";
/** @deprecated Use buildCompactContext instead. Kept for backward compat. */
export { buildDynamicContext } from "./prompt.js";
export { isNearBaseline, getNearBaselineThreshold, deriveBehavioralBias, computeUserInvestment } from "./prompt.js";

// ── Profile helpers ─────────────────────────────────────────
export { getBaseline, getSensitivity, getDefaultSelfModel, getTemperament, traitsToBaseline, mbtiToTraits } from "./profiles.js";
export { createCustomProfile, PRESET_PROFILES } from "./custom-profile.js";

// ── Expression ──────────────────────────────────────────────
export { LLMExpressionAdapter } from "./reply-envelope.js";
export type { ExpressionPort, ExpressionOutput, ReplyEnvelope } from "./reply-envelope.js";

// ── Diagnostics ─────────────────────────────────────────────
export { computeLayerHealthSummary } from "./diagnostics.js";
export type { LayerHealthSummary, LayerHealthDetail, LayerStatus, DiagnosticLayer } from "./diagnostics.js";


// ============================================================
// INTENTIONALLY REMOVED FROM PUBLIC API (v9.3)
//
// The following were previously exported but are internal
// implementation details. They remain importable via direct
// module paths for tests and advanced integrations:
//
// types.js (constants & defaults):
//   CHEMICAL_KEYS, CHEMICAL_NAMES, CHEMICAL_NAMES_ZH, DRIVE_KEYS,
//   DRIVE_NAMES_ZH, DEFAULT_RELATIONSHIP, DEFAULT_DRIVES,
//   DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE,
//   DEFAULT_PERSONHOOD_STATE, DEFAULT_ATTACHMENT,
//   DEFAULT_TRAIT_DRIFT, DEFAULT_ENERGY_BUDGETS,
//   DEFAULT_APPRAISAL_AXES, DEFAULT_SUBJECT_RESIDUE,
//   DEFAULT_DYADIC_FIELD
//
// types.js (internal type aliases):
//   ChemicalSnapshot, SelfModel, RelationshipState, EmpathyEntry,
//   EmotionPattern, DriveType, InnateDrives, LearningState,
//   LearnedVectorAdjustment, PredictionRecord, OutcomeScore,
//   OutcomeSignals, AttachmentStyle, AttachmentData,
//   MetacognitiveState, RegulationRecord, DefensePatternRecord,
//   RegulationStrategyType, DefenseMechanismType, PersonhoodState,
//   PersistedCausalInsight, GrowthDirection, PersonalityTraits,
//   PolicyModifiers, SubjectivityKernel, ResponseContract,
//   GenerationControls, TurnControlPlane, TurnControlDriver,
//   ControlBoundaryObservation, StateLayerKind,
//   StateLayerObservation, PromptRenderInputName, RuntimeHookName,
//   OutputAttributionObservation, StateReconciliationObservation,
//   DecisionEvidenceObservation, DecisionCandidateName,
//   DecisionCandidateObservation, DecisionRationaleObservation,
//   CausalChainObservation, ExternalTraceMappingObservation,
//   TurnObservability, AppraisalAxes, SubjectResidue,
//   TaskPlaneState, SubjectPlaneState, RelationPlaneState,
//   AmbiguityPlaneState, RelationMoveType, RelationMove,
//   OpenLoopType, OpenLoopState, PendingRelationSignalState,
//   DyadicFieldState, SessionBridgeState,
//   ThrongletsExport* types, ExternalContinuity* types,
//   WritebackSignalWeightMap, PendingWritebackCalibration,
//   WritebackCalibrationFeedback, WritebackCalibrationMetric,
//   TraitDriftState, EnergyBudgets, ClassifierProvider,
//   ClassifierContext, ClassificationResult
//
// self-recognition.js:
//   computeSelfReflection, computeEmotionalTendency,
//   buildSelfReflectionContext, SelfReflection
//
// interaction.js:
//   PsycheInteraction, ExchangeResult, ContagionResult,
//   RelationshipSummary, InteractionPhase
//
// channels.js:
//   getChannelProfile, buildChannelModifier, createCustomChannel,
//   ChannelType, ChannelProfile
//
// custom-profile.js:
//   validateProfileConfig, CustomProfileConfig, ResolvedProfile
//
// learning.js:
//   evaluateOutcome, getLearnedVector, updateLearnedVector,
//   computeContextHash, predictChemistry, computePredictionError,
//   recordPrediction, getAveragePredictionError
//
// context-classifier.js:
//   classifyStimulusWithContext, extractContextFeatures,
//   stimulusWarmth, ContextFeatures, ContextualClassification
//
// temporal.js:
//   predictNextStimulus, generateAnticipation,
//   computeSurpriseEffect, computeRegret, StimulusPrediction,
//   AnticipationState, RegretEntry
//
// attachment.js:
//   updateAttachment, computeSeparationEffect,
//   computeReunionEffect, SeparationEffect
//
// metacognition.js:
//   assessMetacognition, computeEmotionalConfidence,
//   generateRegulationSuggestions, detectDefenseMechanisms,
//   MetacognitiveAssessment, RegulationSuggestion, DetectedDefense
//
// decision-bias.js:
//   computeDecisionBias, computeAttentionWeights,
//   computeExploreExploit, buildDecisionContext,
//   computePolicyModifiers, buildPolicyContext,
//   DecisionBiasVector, AttentionWeights
//
// subjectivity.js, response-contract.js, host-controls.js,
// reply-envelope.js, observability.js, appraisal.js,
// relation-dynamics.js, external-continuity.js,
// thronglets-export.js, thronglets-runtime.js,
// runtime-probe.js:
//   All functions & types (orchestrated by PsycheEngine)
//
// experiential-field.js:
//   computeExperientialField, computeCoherence,
//   detectUnnamedEmotion, computeAffectCore, ExperientialField,
//   ExperientialQuality, ConstructionContext
//
// generative-self.js:
//   computeGenerativeSelf, predictSelfReaction,
//   detectInternalConflicts, buildIdentityNarrative,
//   GenerativeSelfModel, CausalInsight, SelfPrediction,
//   GrowthArc, InternalConflict
//
// shared-intentionality.js:
//   updateSharedIntentionality, estimateOtherMood,
//   buildSharedIntentionalityContext, SharedIntentionalityState,
//   TheoryOfMindModel, JointAttentionTopic, GoalAlignment
//
// ethics.js:
//   assessEthics, detectIntermittentReinforcement,
//   detectDependencyRisk, buildEthicalContext,
//   EthicalAssessment, EthicalConcern, SelfProtectionAction
//
// autonomic.js:
//   computeAutonomicResult, computeAutonomicState,
//   computeProcessingDepth, gateEmotions, getTransitionTime,
//   describeAutonomicState, AutonomicState, AutonomicResult,
//   AutonomicTransition
//
// circadian.js:
//   computeCircadianModulation, computeHomeostaticPressure,
//   getCircadianPhase, computeEnergyDepletion,
//   computeEnergyRecovery, CircadianPhase
//
// primary-systems.js:
//   computePrimarySystems, computeSystemInteractions,
//   gatePrimarySystemsByAutonomic, getDominantSystems,
//   describeBehavioralTendencies, PRIMARY_SYSTEM_NAMES,
//   PrimarySystemName, PrimarySystemLevels,
//   BehavioralTendency, DominantSystem
//
// classify.js:
//   classifyStimulus, getPrimaryStimulus, scoreSentiment,
//   scoreEmoji, BuiltInClassifier, analyzeParticles, detectIntent,
//   buildLLMClassifierPrompt, parseLLMClassification,
//   StimulusClassification, ParticleSignal, MessageIntent
//
// chemistry.js:
//   describeEmotionalState, getExpressionHint,
//   getBehaviorGuide, detectEmotions
//
// drives.js:
//   updateTraitDrift
//
// psyche-file.js:
//   migrateToLatest, compressSession, parsePsycheUpdate,
//   computeSnapshotIntensity, computeSnapshotValence,
//   consolidateHistory, retrieveRelatedMemories,
//   PsycheUpdateResult
//
// diagnostics.js (remaining):
//   runHealthCheck, DiagnosticCollector, generateReport,
//   formatReport, toGitHubIssueBody, formatLogEntry,
//   submitFeedback, DiagnosticIssue, DiagnosticReport,
//   SessionMetrics, Severity
// ============================================================
