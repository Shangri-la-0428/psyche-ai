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
//   const psyche = new PsycheClaudeSDK(engine);
//   let text = "";
//   for await (const msg of query({ prompt: "Hey!", options: psyche.mergeOptions() })) {
//     text += msg.content ?? "";
//   }
//   const clean = await psyche.processResponse(text);
//
// Architecture:
//   - UserPromptSubmit hook → processInput → inject dynamicContext via systemMessage
//   - systemPrompt.append → stable protocol context (cached, amortized)
//   - processResponse() → strip <psyche_update> tags + update chemistry
//   - Thronglets traces → optional export after each turn
//
// The SDK has no middleware interface and hooks cannot modify assistant
// output, so processResponse must be called explicitly by the host.
// ============================================================

import type { PsycheEngine, ProcessInputResult } from "../core.js";
import type {
  ThrongletsExport,
  ThrongletsTracePayload,
  WritebackSignalType,
} from "../types.js";
import { serializeThrongletsExportAsTrace } from "../thronglets-runtime.js";

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

interface StopInput extends HookInput {
  hook_event_name: "Stop";
  reason: string;
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
  /** User ID for multi-user relationship tracking. Default: "default" */
  userId?: string;
  /** Enable Thronglets trace/signal export after each turn. Default: false */
  thronglets?: boolean;
  /** Agent identity for Thronglets traces/signals (e.g. "ENFP-Luna"). Default: engine name or "psyche" */
  agentId?: string;
  /** Session ID for Thronglets trace serialization */
  sessionId?: string;
  /** Override locale for protocol context */
  locale?: "zh" | "en";
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
 * const psyche = new PsycheClaudeSDK(engine);
 * const options = psyche.mergeOptions({ model: "sonnet" });
 * for await (const msg of query({ prompt: "Hey!", options })) { ... }
 * await psyche.processResponse(fullText);
 * ```
 */
export class PsycheClaudeSDK {
  private engine: PsycheEngine;
  private opts: Required<PsycheClaudeSdkOptions>;
  private lastInputResult: ProcessInputResult | null = null;
  private lastThrongletsExports: ThrongletsExport[] = [];

  constructor(engine: PsycheEngine, opts?: PsycheClaudeSdkOptions) {
    this.engine = engine;
    const state = engine.getState();
    this.opts = {
      userId: opts?.userId ?? "default",
      thronglets: opts?.thronglets ?? false,
      agentId: opts?.agentId ?? state.meta.agentName ?? "psyche",
      sessionId: opts?.sessionId ?? "claude-sdk",
      locale: opts?.locale ?? "en",
    };
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
              const userMessage = (input as UserPromptSubmitInput).user_message ?? "";
              const result = await self.engine.processInput(userMessage, {
                userId: self.opts.userId,
              });
              self.lastInputResult = result;

              // Cache Thronglets exports from this turn
              if (self.opts.thronglets && result.throngletsExports) {
                self.lastThrongletsExports = result.throngletsExports;
              }

              return { systemMessage: result.dynamicContext };
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
   * Strips `<psyche_update>` tags and updates internal chemistry.
   * Call this after consuming the full query output.
   *
   * @returns Cleaned text with tags removed
   */
  async processResponse(
    text: string,
    opts?: { signals?: WritebackSignalType[]; signalConfidence?: number },
  ): Promise<string> {
    const result = await this.engine.processOutput(text, {
      userId: this.opts.userId,
      signals: opts?.signals,
      signalConfidence: opts?.signalConfidence,
    });
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
    return this.lastThrongletsExports.map((exp) => ({
      ...serializeThrongletsExportAsTrace(exp, {
        sessionId: this.opts.sessionId,
      }),
      agent_id: this.opts.agentId,
    }));
  }

  /**
   * Get a signal payload for `mcp__thronglets__signal_post`.
   *
   * Broadcasts current chemical state so other agents can sense this
   * agent's emotional state via `substrate_query(intent: "signals", kind: "psyche_state")`.
   *
   * Returns null if thronglets is disabled or no processInput has run yet.
   */
  getThrongletsSignal(): ThrongletsSignalPayload | null {
    if (!this.opts.thronglets) return null;
    const state = this.engine.getState();
    const c = state.current;
    return {
      kind: "psyche_state",
      agent_id: this.opts.agentId,
      message: `DA:${c.DA} HT:${c.HT} CORT:${c.CORT} OT:${c.OT} NE:${c.NE} END:${c.END}`,
    };
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
