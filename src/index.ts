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
export type { PsycheEngineConfig, ProcessInputResult, ProcessOutputResult } from "./core.js";

// Storage
export { FileStorageAdapter, MemoryStorageAdapter } from "./storage.js";
export type { StorageAdapter } from "./storage.js";

// Types
export type {
  PsycheState, MBTIType, Locale, StimulusType,
  ChemicalState, ChemicalSnapshot, SelfModel, RelationshipState,
  EmpathyEntry, EmotionPattern, DriveType, InnateDrives,
} from "./types.js";
export {
  CHEMICAL_KEYS, CHEMICAL_NAMES, CHEMICAL_NAMES_ZH,
  DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DRIVE_KEYS, DRIVE_NAMES_ZH,
} from "./types.js";

// Utilities — for custom adapter / advanced use
export { classifyStimulus, getPrimaryStimulus } from "./classify.js";
export { buildProtocolContext, buildDynamicContext, buildCompactContext, isNearBaseline } from "./prompt.js";
export { describeEmotionalState, getExpressionHint, getBehaviorGuide } from "./chemistry.js";
export { getBaseline, getTemperament, getSensitivity, getDefaultSelfModel } from "./profiles.js";
