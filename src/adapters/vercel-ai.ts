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
//   - wrapStream: buffer stream, detect & strip tags at end
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

interface StreamChunk {
  type: string;
  [key: string]: unknown;
}

// ── Tag stripping ────────────────────────────────────────────

// ── Middleware ────────────────────────────────────────────────

export interface PsycheMiddlewareOptions {
  /** Override locale for protocol context */
  locale?: "zh" | "en";
}

/**
 * Create Vercel AI SDK middleware that injects psyche emotional context
 * and processes LLM output for state updates.
 *
 * Supports both generateText (wrapGenerate) and streamText (wrapStream).
 *
 * @example
 * ```ts
 * import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";
 * import { psycheMiddleware } from "psyche-ai/vercel-ai";
 * import { wrapLanguageModel, generateText, streamText } from "ai";
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
 * // Non-streaming
 * const { text } = await generateText({ model, prompt: "Hey!" });
 *
 * // Streaming — tags are buffered and stripped automatically
 * const stream = streamText({ model, prompt: "Hey!" });
 * for await (const chunk of stream.textStream) { process.stdout.write(chunk); }
 * ```
 */
export function psycheMiddleware(engine: PsycheEngine, _opts?: PsycheMiddlewareOptions) {
  return {
    transformParams: async ({ params }: { type: string; params: CallParams }) => {
      const userText = extractLastUserText(params.prompt ?? []);
      const result = await engine.processInput(userText);
      const envelope = result.replyEnvelope;
      const generationControls = envelope?.generationControls ?? result.generationControls;
      const controls = {
        ...(generationControls ?? {}),
        maxTokens: generationControls?.maxTokens !== undefined && typeof params.maxTokens === "number"
          ? Math.min(params.maxTokens, generationControls.maxTokens)
          : generationControls?.maxTokens ?? (typeof params.maxTokens === "number" ? params.maxTokens : undefined),
      };

      const psycheContext = result.systemContext + "\n\n" + result.dynamicContext;

      return {
        ...params,
        ...(controls.maxTokens !== undefined ? { maxTokens: controls.maxTokens } : {}),
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

    wrapStream: async ({ doStream }: { doStream: () => Promise<{ stream: AsyncIterable<StreamChunk> }>; params: CallParams }) => {
      const { stream: innerStream } = await doStream();

      // Buffer text chunks, detect <psyche_update> at end, strip from output
      let fullText = "";
      async function* transformStream(): AsyncIterable<StreamChunk> {
        // Buffering strategy:
        // Stream text chunks through normally UNTIL we see '<psyche_update>'.
        // Once detected, buffer everything from that point on and strip the tag.
        // At finish, process the full text through the engine.
        let bufferStart = -1;
        let buffer = "";

        for await (const chunk of innerStream) {
          if (chunk.type === "text-delta") {
            const text = (chunk as { type: string; textDelta: string }).textDelta ?? "";
            fullText += text;

            if (bufferStart < 0) {
              // Check if tag is starting in the accumulated text
              const tagStart = fullText.indexOf("<psyche_update>");
              if (tagStart >= 0) {
                // Yield any text before the tag that hasn't been yielded
                const preTag = text.substring(0, Math.max(0, text.length - (fullText.length - tagStart)));
                if (preTag) {
                  yield { ...chunk, textDelta: preTag } as StreamChunk;
                }
                bufferStart = tagStart;
                buffer = fullText.substring(tagStart);
              } else {
                // Check if we might be in a partial tag (< at end)
                const partialIdx = fullText.lastIndexOf("<");
                if (partialIdx >= 0 && fullText.substring(partialIdx).length < 16) {
                  // Might be start of <psyche_update>, hold back
                  const safe = text.substring(0, Math.max(0, text.length - (fullText.length - partialIdx)));
                  if (safe) {
                    yield { ...chunk, textDelta: safe } as StreamChunk;
                  }
                } else {
                  yield chunk;
                }
              }
            } else {
              // Already buffering inside a tag — don't yield
              buffer += text;

              // Check if the closing tag appeared
              if (buffer.includes("</psyche_update>")) {
                // Tag complete — strip it, yield any remaining text after the tag
                const afterTag = fullText.substring(
                  fullText.indexOf("</psyche_update>") + "</psyche_update>".length,
                );
                if (afterTag.trim()) {
                  yield { type: "text-delta", textDelta: afterTag.trim() } as StreamChunk;
                }
                bufferStart = -1;
                buffer = "";
              }
            }
          } else if (chunk.type === "finish") {
            // Process full text through engine before finishing
            if (fullText) {
              await engine.processOutput(fullText);
            }
            yield chunk;
          } else {
            yield chunk;
          }
        }
      }

      return { stream: transformStream() };
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
