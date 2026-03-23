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
} from "./types.js";
export {
  CHEMICAL_KEYS, CHEMICAL_NAMES, CHEMICAL_NAMES_ZH,
  DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE,
  DRIVE_KEYS, DRIVE_NAMES_ZH,
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

// Utilities — for custom adapter / advanced use
export { classifyStimulus, getPrimaryStimulus } from "./classify.js";
export { buildProtocolContext, buildDynamicContext, buildCompactContext, isNearBaseline } from "./prompt.js";
export { describeEmotionalState, getExpressionHint, getBehaviorGuide } from "./chemistry.js";
export { getBaseline, getTemperament, getSensitivity, getDefaultSelfModel } from "./profiles.js";
