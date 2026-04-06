// ============================================================
// Claude Agent SDK Adapter — Hook-based integration
//
// Usage:
//   import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";
//   import { PsycheClaudeSDK } from "psyche-ai/claude-sdk";
//   import { query } from "@anthropic-ai/claude-agent-sdk";
//
//   const engine = new PsycheEngine({ name: "Luna", mbti: "ENFP" }, new MemoryStorageAdapter());
//   await engine.initialize();
//
//   const psyche = new PsycheClaudeSDK(engine, {
//     thronglets: true,
//     context: { userId: "_default", agentId: "delegate-luna" },
//   });
//   let text = "";
//   for await (const msg of query({ prompt: "Hey!", options: psyche.mergeOptions() })) {
//     text += msg.content ?? "";
//   }
//   const clean = await psyche.processResponse(text);
//
// Architecture:
//   - UserPromptSubmit hook → processInput → inject dynamicContext via systemMessage
//   - systemPrompt.append → stable protocol context (cached, amortized)
//   - processResponse() → strip <psyche_update> tags + update self-state
//   - Thronglets traces → optional export after each turn
//
// The SDK has no middleware interface and hooks cannot modify assistant
// output, so processResponse must be called explicitly by the host.
// ============================================================

import type { PsycheEngine, ProcessInputResult } from "../core.js";
import type {
  ActivePolicyRule,
  AmbientPriorView,
  CurrentGoal,
  SelfState,
  Locale,
  ThrongletsExport,
  ThrongletsTracePayload,
  WritebackSignalType,
} from "../types.js";
import {
  normalizeCurrentGoal,
  normalizeCurrentTurnCorrection,
  resolveRuntimeActivePolicy,
} from "../types.js";
import { describeEmotionalState } from "../chemistry.js";
import { serializeThrongletsExportAsTrace } from "../thronglets-runtime.js";
import { resolveRelationshipUserId } from "../relationship-key.js";
import {
  resolveAmbientPriorsForTurn,
  type ThrongletsAmbientRuntimeOptions,
} from "../ambient-runtime.js";
import { safeProcessInput, safeProcessOutput } from "./fail-open.js";

// ── Minimal Claude Agent SDK types (inlined to avoid peer dependency) ──

interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  agent_id?: string;
  agent_type?: string;
  [key: string]: unknown;
}

interface UserPromptSubmitInput extends HookInput {
  hook_event_name: "UserPromptSubmit";
  user_message: string;
}

interface HookOutput {
  systemMessage?: string;
  continue?: boolean;
}

type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  context: { signal: AbortSignal },
) => Promise<HookOutput | undefined>;

interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number;
}

type HookEvent = string;
type HooksConfig = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

interface SystemPromptPreset {
  type: "preset";
  preset: string;
  append?: string;
}

interface AgentOptions {
  systemPrompt?: string | SystemPromptPreset;
  hooks?: HooksConfig;
  [key: string]: unknown;
}

// ── Dimension description ────────────────────────────────────

const DIM_THRESHOLDS = {
  high: 70,
  low: 35,
};

interface DimHighlight {
  key: string;
  value: number;
  level: "high" | "low";
  zh: string;
  en: string;
}

function describeDimensionHighlights(s: SelfState, locale: Locale): string {
  const highlights: DimHighlight[] = [];

  // Order — internal coherence
  if (s.order >= DIM_THRESHOLDS.high)
    highlights.push({ key: "order", value: Math.round(s.order), level: "high", zh: "高度有序", en: "highly ordered" });
  if (s.order <= DIM_THRESHOLDS.low)
    highlights.push({ key: "order", value: Math.round(s.order), level: "low", zh: "内部混乱", en: "disordered" });

  // Flow — exchange with environment
  if (s.flow >= DIM_THRESHOLDS.high)
    highlights.push({ key: "flow", value: Math.round(s.flow), level: "high", zh: "高度投入", en: "highly engaged" });
  if (s.flow <= DIM_THRESHOLDS.low)
    highlights.push({ key: "flow", value: Math.round(s.flow), level: "low", zh: "动力不足", en: "low engagement" });

  // Boundary — self/non-self clarity
  if (s.boundary >= DIM_THRESHOLDS.high)
    highlights.push({ key: "boundary", value: Math.round(s.boundary), level: "high", zh: "边界清晰", en: "clear boundaries" });
  if (s.boundary <= DIM_THRESHOLDS.low)
    highlights.push({ key: "boundary", value: Math.round(s.boundary), level: "low", zh: "边界模糊", en: "diffuse boundaries" });

  // Resonance — pattern echo with environment
  if (s.resonance >= DIM_THRESHOLDS.high)
    highlights.push({ key: "resonance", value: Math.round(s.resonance), level: "high", zh: "深度共振", en: "deep resonance" });
  if (s.resonance <= DIM_THRESHOLDS.low)
    highlights.push({ key: "resonance", value: Math.round(s.resonance), level: "low", zh: "低共振", en: "low resonance" });

  if (highlights.length === 0) return "";

  return highlights.map((h) => {
    const label = locale === "zh" ? h.zh : h.en;
    return `${label}(${h.key}:${h.value})`;
  }).join(", ");
}

// ── Tag stripping ────────────────────────────────────────────

const PSYCHE_TAG_RE = /<psyche_update>[\s\S]*?<\/psyche_update>/g;

function stripPsycheTags(text: string): string {
  return text.replace(PSYCHE_TAG_RE, "").trim();
}

// ── Options ─────────────────────────────────────────────────

/** Signal payload for `mcp__thronglets__signal_post` */
export interface ThrongletsSignalPayload {
  kind: "psyche_state";
  agent_id: string;
  message: string;
}

export interface PsycheClaudeSdkOptions {
  /** User ID for relationship tracking. Default: internal shared bucket (`_default`). */
  userId?: string;
  /** Enable Thronglets trace/signal export after each turn. Default: false */
  thronglets?: boolean;
  /** Agent identity for Thronglets traces/signals (e.g. "ENFP-Luna"). */
  agentId?: string;
  /** Session ID for Thronglets trace serialization. */
  sessionId?: string;
  /** Override locale for protocol context */
  locale?: "zh" | "en";
  /**
   * Optional execution context bundle.
   *
   * Use this when the host already knows the current delegate/session identity.
   * Top-level `userId` / `agentId` / `sessionId` still work and take precedence.
   */
  context?: {
    userId?: string;
    agentId?: string;
    sessionId?: string;
  };
  /**
   * Optional runtime ambient-prior intake.
   *
   * When enabled, sparse environmental priors are fetched at turn time and
   * passed to `processInput()` as runtime-only context.
   */
  ambient?: boolean | ThrongletsAmbientRuntimeOptions;
}

interface ResolvedPsycheClaudeSdkOptions {
  userId: string;
  thronglets: boolean;
  agentId?: string;
  sessionId?: string;
  locale: "zh" | "en";
  ambient?: ThrongletsAmbientRuntimeOptions;
}

interface RuntimeHookContext {
  agentId?: string;
  sessionId?: string;
}

// ── Main class ──────────────────────────────────────────────

/**
 * Psyche integration for the Claude Agent SDK.
 *
 * Provides hook-based emotional context injection (automatic via
 * UserPromptSubmit) and explicit output processing (processResponse).
 *
 * @example
 * ```ts
 * const psyche = new PsycheClaudeSDK(engine, {
 *   context: { userId: "_default" },
 * });
 * const options = psyche.mergeOptions({ model: "sonnet" });
 * for await (const msg of query({ prompt: "Hey!", options })) { ... }
 * await psyche.processResponse(fullText);
 * ```
 */
export class PsycheClaudeSDK {
  private engine: PsycheEngine;
  private opts: ResolvedPsycheClaudeSdkOptions;
  private lastInputResult: ProcessInputResult | null = null;
  private lastThrongletsExports: ThrongletsExport[] = [];
  private lastRuntimeContext: RuntimeHookContext = {};

  constructor(engine: PsycheEngine, opts?: PsycheClaudeSdkOptions) {
    this.engine = engine;
    const state = engine.getState();
    const context = opts?.context;
    this.opts = {
      userId: resolveRelationshipUserId(opts?.userId ?? context?.userId),
      thronglets: opts?.thronglets ?? false,
      agentId: opts?.agentId ?? context?.agentId,
      sessionId: opts?.sessionId ?? context?.sessionId,
      locale: opts?.locale ?? "en",
      ambient: opts?.ambient === true ? {} : (opts?.ambient || undefined),
    };
  }

  private async resolveAmbientPriors(
    userMessage: string,
    currentGoal?: CurrentGoal,
    activePolicy?: ActivePolicyRule[],
    currentTurnCorrection?: string,
  ): Promise<AmbientPriorView[] | undefined> {
    return resolveAmbientPriorsForTurn(userMessage, {
      enabled: Boolean(this.opts.ambient),
      currentGoal,
      activePolicy,
      currentTurnCorrection,
      thronglets: this.opts.ambient
        ? {
            ...this.opts.ambient,
            space: this.opts.ambient.space ?? "psyche",
          }
        : undefined,
    });
  }

  private resolveAgentId(runtime?: RuntimeHookContext): string {
    return this.opts.agentId
      ?? runtime?.agentId
      ?? this.lastRuntimeContext.agentId
      ?? this.engine.getState().meta.agentName
      ?? "psyche";
  }

  private resolveSessionId(runtime?: RuntimeHookContext): string {
    return this.opts.sessionId
      ?? runtime?.sessionId
      ?? this.lastRuntimeContext.sessionId
      ?? "claude-sdk";
  }

  // ── Protocol (stable, cacheable) ──────────────────────────

  /**
   * Returns the stable emotional protocol prompt.
   * Suitable for `systemPrompt.append` — changes only when locale changes.
   */
  getProtocol(): string {
    return this.engine.getProtocol(this.opts.locale);
  }

  // ── Hooks ─────────────────────────────────────────────────

  /**
   * Returns Claude Agent SDK hooks config.
   *
   * - `UserPromptSubmit`: calls `engine.processInput()`, injects
   *   `dynamicContext` as `systemMessage` visible to the model.
   */
  getHooks(): HooksConfig {
    const self = this;
    return {
      UserPromptSubmit: [
        {
          hooks: [
            async (input: HookInput): Promise<HookOutput> => {
              const runtimeContext: RuntimeHookContext = {
                agentId: typeof input.agent_id === "string" && input.agent_id.trim()
                  ? input.agent_id
                  : undefined,
                sessionId: typeof input.session_id === "string" && input.session_id.trim()
                  ? input.session_id
                  : undefined,
              };
              self.lastRuntimeContext = {
                agentId: runtimeContext.agentId ?? self.lastRuntimeContext.agentId,
                sessionId: runtimeContext.sessionId ?? self.lastRuntimeContext.sessionId,
              };
              const userMessage = (input as UserPromptSubmitInput).user_message ?? "";
              const currentTurnCorrection = normalizeCurrentTurnCorrection(
                input.current_turn_correction
                  ?? input.currentTurnCorrection
                  ?? input.task_correction
                  ?? input.taskCorrection
                  ?? input.explicit_instruction
                  ?? input.explicitInstruction,
              );
              const currentGoal = normalizeCurrentGoal(input.current_goal ?? input.currentGoal);
              const activePolicy = resolveRuntimeActivePolicy(input.active_policy ?? input.activePolicy, currentTurnCorrection);
              const ambientPriors = await self.resolveAmbientPriors(
                userMessage,
                currentGoal,
                activePolicy,
                currentTurnCorrection,
              );
              const result = await safeProcessInput(self.engine, userMessage, {
                userId: self.opts.userId,
                ambientPriors,
                currentGoal,
                activePolicy,
                currentTurnCorrection,
              }, "claude-sdk.processInput");
              self.lastInputResult = result;

              // Cache Thronglets exports from this turn
              if (self.opts.thronglets && result.throngletsExports) {
                self.lastThrongletsExports = result.throngletsExports;
              }

              const systemMessage = result.dynamicContext;
              return systemMessage ? { systemMessage } : {};
            },
          ],
        },
      ],
    };
  }

  // ── Output processing ─────────────────────────────────────

  /**
   * Process the assistant's full output text.
   *
   * Strips `<psyche_update>` tags and updates internal self-state.
   * Call this after consuming the full query output.
   *
   * @returns Cleaned text with tags removed
   */
  async processResponse(
    text: string,
    opts?: { signals?: WritebackSignalType[]; signalConfidence?: number },
  ): Promise<string> {
    const result = await safeProcessOutput(this.engine, text, {
      userId: this.opts.userId,
      signals: opts?.signals,
      signalConfidence: opts?.signalConfidence,
    }, "claude-sdk.processOutput");
    return result.cleanedText;
  }

  // ── Thronglets integration ────────────────────────────────

  /**
   * Get Thronglets trace payloads from the most recent turn.
   *
   * Returns serialized traces ready for `mcp__thronglets__trace_record`.
   * Each trace includes `agent_id` for multi-agent disambiguation.
   * Empty array if thronglets option is disabled or no exports were produced.
   */
  getThrongletsTraces(): (ThrongletsTracePayload & { agent_id: string })[] {
    if (!this.opts.thronglets) return [];
    const agentId = this.resolveAgentId();
    const sessionId = this.resolveSessionId();
    return this.lastThrongletsExports.map((exp) => ({
      ...serializeThrongletsExportAsTrace(exp, {
        sessionId,
      }),
      agent_id: agentId,
    }));
  }

  /**
   * Get a signal payload for `mcp__thronglets__signal_post`.
   *
   * Broadcasts current self-state so other agents can sense this
   * agent's state via `substrate_query(intent: "signals", kind: "psyche_state")`.
   *
   * Returns null if thronglets is disabled or no processInput has run yet.
   */
  getThrongletsSignal(): ThrongletsSignalPayload | null {
    if (!this.opts.thronglets) return null;
    const state = this.engine.getState();
    const s = state.current;
    return {
      kind: "psyche_state",
      agent_id: this.resolveAgentId(),
      message: `order:${s.order} flow:${s.flow} boundary:${s.boundary} resonance:${s.resonance}`,
    };
  }

  /**
   * Get a natural-language description of the current signal.
   *
   * More effective than raw numbers for LLM injection because it gives
   * the model actionable context rather than requiring it to interpret
   * dimension values.
   *
   * @example
   * ```ts
   * const desc = psyche.describeThrongletsSignal();
   * // "[ENFP-Luna] 焦虑不安 (语速加快、思维跳跃) — 内部混乱(order:28), 高度投入(flow:78), 深度共振(resonance:77)"
   * ```
   */
  describeThrongletsSignal(): string | null {
    if (!this.opts.thronglets) return null;
    const state = this.engine.getState();
    const s = state.current;
    const locale = this.opts.locale;

    const emotionDesc = describeEmotionalState(s, locale);
    const highlights = describeDimensionHighlights(s, locale);

    return `[${this.resolveAgentId()}] ${emotionDesc}${highlights ? " — " + highlights : ""}`;
  }

  /**
   * Get raw Thronglets exports from the most recent turn.
   */
  getThrongletsExports(): ThrongletsExport[] {
    if (!this.opts.thronglets) return [];
    return [...this.lastThrongletsExports];
  }

  // ── State access ──────────────────────────────────────────

  /**
   * Get the last processInput result (useful for inspecting
   * stimulus, subjectivityKernel, generationControls, etc.)
   */
  getLastInputResult(): ProcessInputResult | null {
    return this.lastInputResult;
  }

  // ── Convenience ───────────────────────────────────────────

  /**
   * Merge Psyche hooks and system prompt into existing options.
   *
   * This is the primary integration point — pass the result to `query()`.
   *
   * @example
   * ```ts
   * const options = psyche.mergeOptions({ model: "sonnet", allowedTools: ["Read"] });
   * for await (const msg of query({ prompt: "Hey!", options })) { ... }
   * ```
   */
  mergeOptions(baseOptions?: AgentOptions): AgentOptions {
    const protocol = this.getProtocol();
    const hooks = this.getHooks();

    // Merge system prompt
    let systemPrompt: string | SystemPromptPreset;
    const base = baseOptions?.systemPrompt;
    if (typeof base === "object" && base !== null && "type" in base) {
      // Preset mode — append protocol
      systemPrompt = {
        ...base,
        append: protocol + (base.append ? "\n\n" + base.append : ""),
      };
    } else if (typeof base === "string") {
      // String mode — prepend protocol
      systemPrompt = protocol + "\n\n" + base;
    } else {
      // No base — use preset with append
      systemPrompt = {
        type: "preset",
        preset: "claude_code",
        append: protocol,
      };
    }

    // Merge hooks (preserve existing hooks, add Psyche hooks)
    const mergedHooks: HooksConfig = { ...(baseOptions?.hooks ?? {}) };
    for (const [event, matchers] of Object.entries(hooks)) {
      const existing = mergedHooks[event] ?? [];
      mergedHooks[event] = [...existing, ...(matchers as HookCallbackMatcher[])];
    }

    return {
      ...baseOptions,
      systemPrompt,
      hooks: mergedHooks,
    };
  }
}

// ── Utility: strip tags from message stream ─────────────────

/**
 * Strip `<psyche_update>` tags from a text string.
 *
 * Useful for post-processing query output when not using `processResponse`.
 */
export { stripPsycheTags };
