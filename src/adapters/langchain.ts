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
import type { WritebackSignalType } from "../types.js";

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
  constructor(private readonly engine: PsycheEngine) {}

  private readonly validSignals = new Set<WritebackSignalType>([
    "trust_up",
    "trust_down",
    "boundary_set",
    "boundary_soften",
    "repair_attempt",
    "repair_landed",
    "closeness_invite",
    "withdrawal_mark",
    "self_assertion",
    "task_recenter",
  ]);

  private parseSignals(signals?: string[]): WritebackSignalType[] | undefined {
    if (!signals) return undefined;
    const parsed = signals.filter((signal): signal is WritebackSignalType => this.validSignals.has(signal as WritebackSignalType));
    return parsed.length > 0 ? [...new Set(parsed)] : undefined;
  }

  /**
   * Get the system message to inject into the LLM call.
   * Combines the protocol (cacheable) and dynamic context (per-turn).
   *
   * Call this BEFORE the LLM invocation.
   */
  async getSystemMessage(userText: string, opts?: { userId?: string }): Promise<string> {
    const result = await this.engine.processInput(userText, opts);
    return result.systemContext + "\n\n" + result.dynamicContext;
  }

  /**
   * Prepare both prompt text and mechanical invocation hints for a LangChain call.
   *
   * Hosts can wire `maxTokens` and confirmation UX directly from this result
   * instead of re-parsing prompt prose.
   */
  async prepareInvocation(
    userText: string,
    opts?: { userId?: string; maxTokens?: number },
  ): Promise<{ systemMessage: string; maxTokens?: number; requireConfirmation: boolean }> {
    const result = await this.engine.processInput(userText, opts);
    const generationControls = result.replyEnvelope?.generationControls ?? result.generationControls;
    const controls = {
      ...(generationControls ?? {}),
      maxTokens: generationControls?.maxTokens !== undefined && opts?.maxTokens !== undefined
        ? Math.min(opts.maxTokens, generationControls.maxTokens)
        : generationControls?.maxTokens ?? opts?.maxTokens,
    };
    return {
      systemMessage: result.systemContext + "\n\n" + result.dynamicContext,
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
    const result = await this.engine.processOutput(text, {
      userId: opts?.userId,
      signals: this.parseSignals(opts?.signals),
      signalConfidence: opts?.signalConfidence,
    });
    return result.cleanedText;
  }
}
