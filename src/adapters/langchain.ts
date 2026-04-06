// ============================================================
// LangChain Adapter — Helper class for LangChain integration
//
// Usage:
//   import { PsycheLangChain } from "psyche-ai/langchain";
//
//   const psyche = new PsycheLangChain(engine);
//   const systemMsg = await psyche.getSystemMessage(userInput);
//   // Use with LangChain's ChatModel, chains, etc.
//
// Note: This is a utility class, not a LangChain Runnable.
// It provides the hooks you need to wire psyche into any
// LangChain pipeline without requiring langchain as a dependency.
// ============================================================

import type { PsycheEngine } from "../core.js";
import type { ActivePolicyRule, AmbientPriorView, CurrentGoal } from "../types.js";
import {
  normalizeCurrentGoal,
  normalizeCurrentTurnCorrection,
  resolveRuntimeActivePolicy,
} from "../types.js";
import {
  resolveAmbientPriorsForTurn,
  type ThrongletsAmbientRuntimeOptions,
} from "../ambient-runtime.js";
import { composePsycheContext, safeProcessInput, safeProcessOutput } from "./fail-open.js";
import { coerceWritebackSignalInput } from "../writeback-signals.js";

export interface PsycheLangChainOptions {
  ambient?: boolean | ThrongletsAmbientRuntimeOptions;
}

/**
 * LangChain integration helper for PsycheEngine.
 *
 * @example
 * ```ts
 * import { ChatOpenAI } from "@langchain/openai";
 * import { SystemMessage, HumanMessage } from "@langchain/core/messages";
 * import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";
 * import { PsycheLangChain } from "psyche-ai/langchain";
 *
 * const engine = new PsycheEngine({ mbti: "ENFP" }, new MemoryStorageAdapter());
 * await engine.initialize();
 * const psyche = new PsycheLangChain(engine);
 *
 * const userInput = "You're amazing!";
 * const systemMsg = await psyche.getSystemMessage(userInput);
 *
 * const llm = new ChatOpenAI({ model: "gpt-4o" });
 * const response = await llm.invoke([
 *   new SystemMessage(systemMsg),
 *   new HumanMessage(userInput),
 * ]);
 *
 * const cleaned = await psyche.processResponse(response.content as string);
 * ```
 */
export class PsycheLangChain {
  constructor(
    private readonly engine: PsycheEngine,
    private readonly opts: PsycheLangChainOptions = {},
  ) {}

  private async resolveAmbientPriors(
    userText: string,
    currentGoal?: CurrentGoal,
    activePolicy?: ActivePolicyRule[],
    currentTurnCorrection?: string,
  ): Promise<AmbientPriorView[] | undefined> {
    const ambient = this.opts.ambient;
    return resolveAmbientPriorsForTurn(userText, {
      enabled: Boolean(ambient),
      currentGoal,
      activePolicy,
      currentTurnCorrection,
      thronglets: ambient
        ? {
            ...(ambient === true ? {} : ambient),
            space: ambient === true ? "psyche" : (ambient.space ?? "psyche"),
          }
        : undefined,
    });
  }

  /**
   * Get the system message to inject into the LLM call.
   * Combines the protocol (cacheable) and dynamic context (per-turn).
   *
   * Call this BEFORE the LLM invocation.
   */
  async getSystemMessage(
    userText: string,
    opts?: {
      userId?: string;
      currentGoal?: CurrentGoal;
      activePolicy?: ActivePolicyRule[];
      currentTurnCorrection?: string;
    },
  ): Promise<string> {
    const currentTurnCorrection = normalizeCurrentTurnCorrection(opts?.currentTurnCorrection);
    const currentGoal = normalizeCurrentGoal(opts?.currentGoal);
    const activePolicy = resolveRuntimeActivePolicy(opts?.activePolicy, currentTurnCorrection);
    const result = await safeProcessInput(this.engine, userText, {
      ...opts,
      currentGoal,
      activePolicy,
      currentTurnCorrection,
      ambientPriors: await this.resolveAmbientPriors(userText, currentGoal, activePolicy, currentTurnCorrection),
    }, "langchain.processInput");
    return composePsycheContext(result);
  }

  /**
   * Prepare both prompt text and mechanical invocation hints for a LangChain call.
   *
   * Hosts can wire `maxTokens` and confirmation UX directly from this result
   * instead of re-parsing prompt prose.
   */
  async prepareInvocation(
    userText: string,
    opts?: {
      userId?: string;
      maxTokens?: number;
      currentGoal?: CurrentGoal;
      activePolicy?: ActivePolicyRule[];
      currentTurnCorrection?: string;
    },
  ): Promise<{ systemMessage: string; maxTokens?: number; requireConfirmation: boolean }> {
    const currentTurnCorrection = normalizeCurrentTurnCorrection(opts?.currentTurnCorrection);
    const currentGoal = normalizeCurrentGoal(opts?.currentGoal);
    const activePolicy = resolveRuntimeActivePolicy(opts?.activePolicy, currentTurnCorrection);
    const result = await safeProcessInput(this.engine, userText, {
      ...opts,
      currentGoal,
      activePolicy,
      currentTurnCorrection,
      ambientPriors: await this.resolveAmbientPriors(userText, currentGoal, activePolicy, currentTurnCorrection),
    }, "langchain.processInput");
    const generationControls = result.replyEnvelope?.generationControls ?? result.generationControls;
    const controls = {
      ...(generationControls ?? {}),
      maxTokens: generationControls?.maxTokens !== undefined && opts?.maxTokens !== undefined
        ? Math.min(opts.maxTokens, generationControls.maxTokens)
        : generationControls?.maxTokens ?? opts?.maxTokens,
    };
    return {
      systemMessage: composePsycheContext(result),
      maxTokens: controls.maxTokens,
      requireConfirmation: controls.requireConfirmation ?? false,
    };
  }

  /**
   * Process the LLM response text.
   * Strips <psyche_update> tags and updates internal state.
   *
   * Call this AFTER the LLM invocation, before showing output to the user.
   */
  async processResponse(
    text: string,
    opts?: { userId?: string; signals?: string[]; signalConfidence?: number },
  ): Promise<string> {
    const result = await safeProcessOutput(this.engine, text, {
      userId: opts?.userId,
      signals: coerceWritebackSignalInput(opts?.signals),
      signalConfidence: opts?.signalConfidence,
    }, "langchain.processOutput");
    return result.cleanedText;
  }
}
