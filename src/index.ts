// ============================================================
// psyche-ai — Universal AI Emotional Intelligence Plugin
//
// Main entry point: re-exports core, storage, types.
// Framework adapters available via subpath imports:
//   psyche-ai/openclaw   — OpenClaw plugin
//   psyche-ai/vercel-ai  — Vercel AI SDK middleware
//   psyche-ai/langchain  — LangChain helper
//   psyche-ai/http       — HTTP server for Python/Go/etc.
// ============================================================

// Core
export { PsycheEngine } from "./core.js";
export type { PsycheEngineConfig, ProcessInputResult, ProcessOutputResult, ProcessOutcomeResult } from "./core.js";

// Storage
export { FileStorageAdapter, MemoryStorageAdapter } from "./storage.js";
export type { StorageAdapter } from "./storage.js";

// Types
export type {
  PsycheState, MBTIType, Locale, StimulusType,
  ChemicalState, ChemicalSnapshot, SelfModel, RelationshipState,
  EmpathyEntry, EmotionPattern, DriveType, InnateDrives,
  LearningState, LearnedVectorAdjustment, PredictionRecord,
  OutcomeScore, OutcomeSignals,
  AttachmentStyle, AttachmentData,
  MetacognitiveState, RegulationRecord, DefensePatternRecord,
  RegulationStrategyType, DefenseMechanismType,
  PersonhoodState, PersistedCausalInsight, GrowthDirection,
  PersonalityTraits, PsycheMode, PolicyModifiers, SubjectivityKernel, ResponseContract, GenerationControls,
  AppraisalAxes, SubjectResidue, TaskPlaneState, SubjectPlaneState, RelationPlaneState,
  AmbiguityPlaneState, RelationMoveType, RelationMove, OpenLoopType, OpenLoopState, PendingRelationSignalState, DyadicFieldState,
  SessionBridgeState, ThrongletsExportSubject, ThrongletsExportPrimitive, ThrongletsExportBase, RelationMilestoneExport,
  OpenLoopAnchorExport, WritebackCalibrationExport, ContinuityAnchorExport, ThrongletsExport, ThrongletsExportState,
  ExternalContinuityEvent, ExternalContinuityEnvelope,
  WritebackSignalType, WritebackSignalWeightMap, PendingWritebackCalibration, WritebackCalibrationFeedback, WritebackCalibrationMetric,
  TraitDriftState, EnergyBudgets,
  ClassifierProvider, ClassifierContext, ClassificationResult,
} from "./types.js";
export {
  CHEMICAL_KEYS, CHEMICAL_NAMES, CHEMICAL_NAMES_ZH,
  DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
  DEFAULT_ATTACHMENT, DRIVE_KEYS, DRIVE_NAMES_ZH,
  DEFAULT_TRAIT_DRIFT, DEFAULT_ENERGY_BUDGETS, DEFAULT_APPRAISAL_AXES, DEFAULT_SUBJECT_RESIDUE, DEFAULT_DYADIC_FIELD,
} from "./types.js";

// Self-recognition
export { computeSelfReflection, computeEmotionalTendency, buildSelfReflectionContext } from "./self-recognition.js";
export type { SelfReflection } from "./self-recognition.js";

// Multi-agent interaction
export { PsycheInteraction } from "./interaction.js";
export type { ExchangeResult, ContagionResult, RelationshipSummary, InteractionPhase } from "./interaction.js";

// Channels
export { getChannelProfile, buildChannelModifier, createCustomChannel } from "./channels.js";
export type { ChannelType, ChannelProfile } from "./channels.js";

// Custom profiles — beyond MBTI presets
export { createCustomProfile, validateProfileConfig, PRESET_PROFILES } from "./custom-profile.js";
export type { CustomProfileConfig, ResolvedProfile } from "./custom-profile.js";

// Emotional learning (P3)
export {
  evaluateOutcome, getLearnedVector, updateLearnedVector,
  computeContextHash, predictChemistry, computePredictionError,
  recordPrediction, getAveragePredictionError,
} from "./learning.js";

// Context-aware classification (P3)
export { classifyStimulusWithContext, extractContextFeatures, stimulusWarmth } from "./context-classifier.js";
export type { ContextFeatures, ContextualClassification } from "./context-classifier.js";

// Temporal consciousness (P4)
export {
  predictNextStimulus, generateAnticipation, computeSurpriseEffect, computeRegret,
} from "./temporal.js";
export type { StimulusPrediction, AnticipationState, RegretEntry } from "./temporal.js";

// Attachment dynamics (P4)
export {
  updateAttachment, computeSeparationEffect, computeReunionEffect,
} from "./attachment.js";
export type { SeparationEffect } from "./attachment.js";

// Metacognition (P5)
export {
  assessMetacognition, computeEmotionalConfidence,
  generateRegulationSuggestions, detectDefenseMechanisms,
} from "./metacognition.js";
export type { MetacognitiveAssessment, RegulationSuggestion, DetectedDefense } from "./metacognition.js";

// Decision bias (P5) + PolicyModifiers (v9)
export {
  computeDecisionBias, computeAttentionWeights,
  computeExploreExploit, buildDecisionContext,
  computePolicyModifiers, buildPolicyContext,
} from "./decision-bias.js";
export type { DecisionBiasVector, AttentionWeights } from "./decision-bias.js";

// Subjectivity kernel (v9.3)
export { computeSubjectivityKernel, buildSubjectivityContext } from "./subjectivity.js";
export { computeResponseContract, buildResponseContractContext } from "./response-contract.js";
export { deriveGenerationControls } from "./host-controls.js";
export { computeAppraisalAxes, mergeAppraisalResidue, getResidueIntensity } from "./appraisal.js";
export {
  computeRelationMove, evolveDyadicField, evolvePendingRelationSignals, getLoopPressure,
  applySessionBridge, applyWritebackSignals, createWritebackCalibrations, evaluateWritebackCalibrations,
} from "./relation-dynamics.js";
export {
  EXTERNAL_CONTINUITY_SIGNAL_KINDS,
  EXTERNAL_CONTINUITY_TRACE_KINDS,
  buildExternalContinuityEnvelope,
} from "./external-continuity.js";
export { deriveThrongletsExports } from "./thronglets-export.js";

// Experiential field (P6 + P8 Barrett construction)
export { computeExperientialField, computeCoherence, detectUnnamedEmotion, computeAffectCore } from "./experiential-field.js";
export type { ExperientialField, ExperientialQuality, ConstructionContext } from "./experiential-field.js";

// Generative self (P6)
export { computeGenerativeSelf, predictSelfReaction, detectInternalConflicts, buildIdentityNarrative } from "./generative-self.js";
export type { GenerativeSelfModel, CausalInsight, SelfPrediction, GrowthArc, InternalConflict } from "./generative-self.js";

// Shared intentionality (P6)
export { updateSharedIntentionality, estimateOtherMood, buildSharedIntentionalityContext } from "./shared-intentionality.js";
export type { SharedIntentionalityState, TheoryOfMindModel, JointAttentionTopic, GoalAlignment } from "./shared-intentionality.js";

// Emotional ethics (P6)
export {
  assessEthics, detectIntermittentReinforcement, detectDependencyRisk,
  buildEthicalContext,
} from "./ethics.js";
export type { EthicalAssessment, EthicalConcern, SelfProtectionAction } from "./ethics.js";

// Autonomic nervous system (P7)
export { computeAutonomicResult, computeAutonomicState, computeProcessingDepth, gateEmotions, getTransitionTime, describeAutonomicState } from "./autonomic.js";
export type { AutonomicState, AutonomicResult, AutonomicTransition } from "./autonomic.js";

// Circadian rhythms (P12)
export { computeCircadianModulation, computeHomeostaticPressure, getCircadianPhase, computeEnergyDepletion, computeEnergyRecovery } from "./circadian.js";
export type { CircadianPhase } from "./circadian.js";

// Primary emotional systems — Panksepp (P9)
export {
  computePrimarySystems, computeSystemInteractions,
  gatePrimarySystemsByAutonomic, getDominantSystems,
  describeBehavioralTendencies, PRIMARY_SYSTEM_NAMES,
} from "./primary-systems.js";
export type {
  PrimarySystemName, PrimarySystemLevels, BehavioralTendency, DominantSystem,
} from "./primary-systems.js";

// Utilities — for custom adapter / advanced use
// Trait drift (v9)
export { updateTraitDrift } from "./drives.js";

// Utilities — for custom adapter / advanced use
export { classifyStimulus, getPrimaryStimulus, scoreSentiment, scoreEmoji, BuiltInClassifier, analyzeParticles, detectIntent, buildLLMClassifierPrompt, parseLLMClassification } from "./classify.js";
export type { StimulusClassification, ParticleSignal, MessageIntent } from "./classify.js";
export { buildProtocolContext, buildDynamicContext, buildCompactContext, isNearBaseline, getNearBaselineThreshold } from "./prompt.js";
export { describeEmotionalState, getExpressionHint, getBehaviorGuide, detectEmotions } from "./chemistry.js";
export { getBaseline, getTemperament, getSensitivity, getDefaultSelfModel, traitsToBaseline, mbtiToTraits } from "./profiles.js";
export {
  migrateToLatest, compressSession, parsePsycheUpdate,
  computeSnapshotIntensity, computeSnapshotValence,
  consolidateHistory, retrieveRelatedMemories,
} from "./psyche-file.js";
export type { PsycheUpdateResult } from "./psyche-file.js";

// ── Diagnostics ──────────────────────────────────────────────
export {
  runHealthCheck, DiagnosticCollector,
  generateReport, formatReport, toGitHubIssueBody, formatLogEntry,
  submitFeedback,
} from "./diagnostics.js";
export type { DiagnosticIssue, DiagnosticReport, SessionMetrics, Severity } from "./diagnostics.js";
