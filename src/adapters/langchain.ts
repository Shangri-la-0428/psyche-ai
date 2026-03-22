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
   * Process the LLM response text.
   * Strips <psyche_update> tags and updates internal state.
   *
   * Call this AFTER the LLM invocation, before showing output to the user.
   */
  async processResponse(text: string, opts?: { userId?: string }): Promise<string> {
    const result = await this.engine.processOutput(text, opts);
    return result.cleanedText;
  }
}
