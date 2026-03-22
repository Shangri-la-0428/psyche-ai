// ============================================================
// PsycheEngine — Framework-agnostic emotional intelligence core
//
// Two-phase API:
//   processInput(text)  → systemContext + dynamicContext + stimulus
//   processOutput(text) → cleanedText + stateChanged
//
// Orchestrates: chemistry, classify, prompt, profiles, guards
// ============================================================

import type { PsycheState, StimulusType, Locale, MBTIType } from "./types.js";
import { DEFAULT_RELATIONSHIP } from "./types.js";
import type { StorageAdapter } from "./storage.js";
import { applyDecay, applyStimulus, applyContagion } from "./chemistry.js";
import { classifyStimulus } from "./classify.js";
import { buildDynamicContext, buildProtocolContext } from "./prompt.js";
import { getSensitivity, getBaseline, getDefaultSelfModel } from "./profiles.js";
import { isStimulusType } from "./guards.js";
import {
  parsePsycheUpdate, mergeUpdates, updateAgreementStreak, pushSnapshot,
} from "./psyche-file.js";

// ── Types ────────────────────────────────────────────────────

export interface PsycheEngineConfig {
  mbti?: MBTIType;
  name?: string;
  locale?: Locale;
  stripUpdateTags?: boolean;
  emotionalContagionRate?: number;
  maxChemicalDelta?: number;
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

// Silent logger for library use
const NOOP_LOGGER = { info: () => {}, warn: () => {}, debug: () => {} };

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
  };
  private readonly protocolCache = new Map<Locale, string>();

  constructor(config: PsycheEngineConfig = {}, storage: StorageAdapter) {
    this.storage = storage;
    this.cfg = {
      mbti: config.mbti ?? "INFJ",
      name: config.name ?? "agent",
      locale: config.locale ?? "zh",
      stripUpdateTags: config.stripUpdateTags ?? true,
      emotionalContagionRate: config.emotionalContagionRate ?? 0.2,
      maxChemicalDelta: config.maxChemicalDelta ?? 25,
    };
  }

  /**
   * Load or create initial state. Must be called before processInput/processOutput.
   */
  async initialize(): Promise<void> {
    const loaded = await this.storage.load();
    if (loaded) {
      this.state = loaded;
    } else {
      this.state = this.createDefaultState();
      await this.storage.save(this.state);
    }
  }

  /**
   * Phase 1: Process user input text.
   * Classifies stimulus, applies chemistry, builds context for LLM injection.
   */
  async processInput(text: string, opts?: { userId?: string }): Promise<ProcessInputResult> {
    let state = this.ensureInitialized();

    // Time decay toward baseline
    const now = new Date();
    const minutesElapsed = (now.getTime() - new Date(state.updatedAt).getTime()) / 60000;
    if (minutesElapsed >= 1) {
      state = {
        ...state,
        current: applyDecay(state.current, state.baseline, minutesElapsed),
        updatedAt: now.toISOString(),
      };
    }

    // Classify user stimulus and apply chemistry
    let appliedStimulus: StimulusType | null = null;
    if (text.length > 0) {
      const classifications = classifyStimulus(text);
      const primary = classifications[0];
      if (primary && primary.confidence >= 0.5) {
        appliedStimulus = primary.type;
        state = {
          ...state,
          current: applyStimulus(
            state.current, primary.type,
            getSensitivity(state.mbti),
            this.cfg.maxChemicalDelta,
            NOOP_LOGGER,
          ),
        };
      }
    }

    // Push snapshot to emotional history
    state = pushSnapshot(state, appliedStimulus);

    // Persist
    this.state = state;
    await this.storage.save(state);

    const locale = state.meta.locale ?? this.cfg.locale;
    return {
      systemContext: this.getProtocol(locale),
      dynamicContext: buildDynamicContext(state, opts?.userId),
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
      version: 2,
      mbti,
      baseline,
      current: { ...baseline },
      updatedAt: now,
      relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
      empathyLog: null,
      selfModel,
      emotionalHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      meta: {
        agentName: name,
        createdAt: now,
        totalInteractions: 0,
        locale,
      },
    };
  }
}
