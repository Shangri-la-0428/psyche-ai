// ============================================================
// Vercel AI SDK Adapter — Middleware for AI SDK v4+
//
// Usage:
//   import { psycheMiddleware } from "psyche-ai/vercel-ai";
//   import { wrapLanguageModel } from "ai";
//
//   const model = wrapLanguageModel({
//     model: openai("gpt-4o"),
//     middleware: psycheMiddleware(engine),
//   });
//
// Handles:
//   - transformParams: inject psyche system/dynamic context
//   - wrapGenerate: process output, strip <psyche_update> tags
//
// Note: For streaming (streamText), call engine.processOutput()
// manually on the final accumulated text.
// ============================================================

import type { PsycheEngine } from "../core.js";

// ── Minimal Vercel AI SDK types ──────────────────────────────
// Defined inline to avoid requiring @ai-sdk/provider as a dependency.
// These match the LanguageModelV1Middleware interface from ai@4+.

interface PromptMessage {
  role: string;
  content: unknown;
}

interface CallParams {
  system?: string;
  prompt?: PromptMessage[];
  [key: string]: unknown;
}

interface GenerateResult {
  text?: string;
  [key: string]: unknown;
}

// ── Middleware ────────────────────────────────────────────────

export interface PsycheMiddlewareOptions {
  /** Override locale for protocol context */
  locale?: "zh" | "en";
}

/**
 * Create Vercel AI SDK middleware that injects psyche emotional context
 * and processes LLM output for state updates.
 *
 * @example
 * ```ts
 * import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";
 * import { psycheMiddleware } from "psyche-ai/vercel-ai";
 * import { wrapLanguageModel, generateText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 *
 * const engine = new PsycheEngine({ mbti: "ENFP", name: "Luna" }, new MemoryStorageAdapter());
 * await engine.initialize();
 *
 * const model = wrapLanguageModel({
 *   model: openai("gpt-4o"),
 *   middleware: psycheMiddleware(engine),
 * });
 *
 * const { text } = await generateText({ model, prompt: "Hey!" });
 * ```
 */
export function psycheMiddleware(engine: PsycheEngine, opts?: PsycheMiddlewareOptions) {
  return {
    transformParams: async ({ params }: { type: string; params: CallParams }) => {
      const userText = extractLastUserText(params.prompt ?? []);
      const result = await engine.processInput(userText);

      const psycheContext = result.systemContext + "\n\n" + result.dynamicContext;

      return {
        ...params,
        system: params.system
          ? psycheContext + "\n\n" + params.system
          : psycheContext,
      };
    },

    wrapGenerate: async ({ doGenerate }: { doGenerate: () => Promise<GenerateResult>; params: CallParams }) => {
      const result = await doGenerate();
      if (typeof result.text === "string") {
        const processed = await engine.processOutput(result.text);
        return { ...result, text: processed.cleanedText };
      }
      return result;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

function extractLastUserText(prompt: PromptMessage[]): string {
  const userMsgs = prompt.filter((m) => m.role === "user");
  const last = userMsgs[userMsgs.length - 1];
  if (!last) return "";

  if (typeof last.content === "string") return last.content;

  if (Array.isArray(last.content)) {
    return (last.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }

  return "";
}
