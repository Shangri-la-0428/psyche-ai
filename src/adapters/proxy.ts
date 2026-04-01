#!/usr/bin/env node
// ============================================================
// psyche-proxy — Transparent reverse proxy
//
// Adds persistent subjectivity to any OpenAI-compatible LLM API.
// The agent never knows Psyche exists. Psyche observes behavior
// bidirectionally and injects behavioral context only when the
// internal state deviates from baseline.
//
// Architecture:
//   Client → psyche-proxy → Target LLM
//   Client ← psyche-proxy ← Target LLM
//
// Usage:
//   psyche-proxy --target https://api.openai.com/v1
//   psyche-proxy -t https://api.x.ai/v1 -n Luna --mbti ENFP
//   psyche-proxy -t http://localhost:11434/v1 -d ./psyche-data
//
// Then point any client to http://localhost:3340/v1/chat/completions
// ============================================================

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { PsycheEngine } from "../core.js";
import type { PsycheEngineConfig } from "../core.js";
import { MemoryStorageAdapter, FileStorageAdapter } from "../storage.js";
import { isNearBaseline, deriveBehavioralBias } from "../prompt.js";
import type { Locale, MBTIType, PsycheMode } from "../types.js";

// ── Types ───────────────────────────────────────────────────

export interface ProxyOptions {
  /** Target LLM API base URL, e.g. "https://api.openai.com/v1" */
  target: string;
  port?: number;
  host?: string;
}

interface ChatMessage {
  role: string;
  content: string | null;
  [key: string]: unknown;
}

interface ChatRequest {
  messages: ChatMessage[];
  stream?: boolean;
  user?: string;
  [key: string]: unknown;
}

// ── Helpers ─────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function lastUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && typeof messages[i].content === "string") {
      return messages[i].content as string;
    }
  }
  return null;
}

function injectBias(messages: ChatMessage[], context: string): ChatMessage[] {
  if (!context) return messages;
  const out = messages.map((m) => ({ ...m }));
  const idx = out.findIndex((m) => m.role === "system");
  if (idx >= 0) {
    out[idx].content = (out[idx].content ?? "") + "\n\n" + context;
  } else {
    out.unshift({ role: "system", content: context });
  }
  return out;
}

/** Extract assistant text from a non-streaming OpenAI response. */
function extractAssistantText(body: unknown): string {
  const obj = body as { choices?: { message?: { content?: string } }[] };
  return obj?.choices?.[0]?.message?.content ?? "";
}

/** Extract assistant text from buffered SSE chunks. */
function extractStreamText(chunks: string[]): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const d = JSON.parse(line.slice(6));
        const c = d?.choices?.[0]?.delta?.content;
        if (typeof c === "string") parts.push(c);
      } catch { /* skip malformed chunks */ }
    }
  }
  return parts.join("");
}

/** Build safe headers for forwarding, stripping hop-by-hop headers. */
function forwardHeaders(req: IncomingMessage): Record<string, string> {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "host" || k === "content-length" || k === "transfer-encoding") continue;
    if (typeof v === "string") h[k] = v;
  }
  return h;
}

/** Strip content-encoding/content-length from upstream (fetch auto-decompresses). */
function safeResponseHeaders(headers: Headers): Record<string, string> {
  const h: Record<string, string> = {};
  for (const [k, v] of headers.entries()) {
    if (["content-encoding", "content-length", "transfer-encoding"].includes(k)) continue;
    h[k] = v;
  }
  return h;
}

// ── Proxy Server ────────────────────────────────────────────

export function createPsycheProxy(engine: PsycheEngine, opts: ProxyOptions): Server {
  const targetBase = opts.target.replace(/\/+$/, "");
  const port = opts.port ?? 3340;
  const host = opts.host ?? "127.0.0.1";
  const locale = (engine.getState().meta.locale ?? "zh") as Locale;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only intercept chat completions; pass everything else through.
    if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
      return passThrough(req, res, targetBase);
    }

    try {
      const rawBody = await readBody(req);
      const parsed: ChatRequest = JSON.parse(rawBody.toString("utf-8"));
      const userMsg = lastUserMessage(parsed.messages);
      const userId = parsed.user ?? undefined;

      // ── 1. Observe input ────────────────────────────
      if (userMsg) {
        await engine.processInput(userMsg, { userId });
      }

      // ── 2. Inject behavioral bias (silent when near baseline) ──
      const state = engine.getState();
      let messages = parsed.messages;

      if (!isNearBaseline(state)) {
        const bias = deriveBehavioralBias(state, locale);
        if (bias) {
          messages = injectBias(parsed.messages, bias);
        }
      }

      const modifiedBody = JSON.stringify({ ...parsed, messages });
      const headers = forwardHeaders(req);
      headers["content-length"] = Buffer.byteLength(modifiedBody).toString();

      // ── 3. Forward to target LLM ────────────────────
      const upstream = await fetch(`${targetBase}${req.url}`, {
        method: "POST",
        headers,
        body: modifiedBody,
      });

      // ── 4. Return response + observe output ─────────
      res.writeHead(upstream.status, safeResponseHeaders(upstream.headers));

      if (parsed.stream && upstream.body) {
        // Stream: forward chunks in real-time, buffer for observation
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const sseChunks: string[] = [];

        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            res.write(result.value);
            sseChunks.push(decoder.decode(result.value, { stream: true }));
          }
        }
        res.end();

        // Observe output (background — response already sent)
        const text = extractStreamText(sseChunks);
        if (text) engine.processOutput(text, { userId }).catch(() => {});
      } else {
        // Non-stream: buffer, send, observe
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);

        try {
          const obj = JSON.parse(buf.toString("utf-8"));
          const text = extractAssistantText(obj);
          if (text) engine.processOutput(text, { userId }).catch(() => {});
        } catch { /* response not JSON, skip observation */ }
      }

    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({
        error: { message: `psyche-proxy: ${(err as Error).message}`, type: "proxy_error" },
      }));
    }
  });

  server.listen(port, host, () => {
    const name = engine.getState().meta.agentName ?? "agent";
    const mbti = engine.getState().mbti ?? "";
    console.error(`[psyche-proxy] ${name}${mbti ? ` (${mbti})` : ""} → ${targetBase}`);
    console.error(`[psyche-proxy] http://${host}:${port}`);
    console.error(`[psyche-proxy] mode: mirror (observe behavior, inject bias, agent never knows)`);
  });

  return server;
}

// ── Pass-through for non-chat endpoints ─────────────────────

async function passThrough(req: IncomingMessage, res: ServerResponse, targetBase: string): Promise<void> {
  try {
    const rawBody = (req.method !== "GET" && req.method !== "HEAD")
      ? (await readBody(req)).toString("utf-8")
      : undefined;
    const headers = forwardHeaders(req);

    const upstream = await fetch(`${targetBase}${req.url}`, {
      method: req.method!,
      headers,
      body: rawBody,
    });

    res.writeHead(upstream.status, safeResponseHeaders(upstream.headers));
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.writeHead(502);
    res.end(`psyche-proxy: ${(err as Error).message}`);
  }
}

// ── CLI ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Quick help
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.error(`psyche-proxy — transparent subjectivity proxy for any OpenAI-compatible API

Usage:
  psyche-proxy --target <URL> [options]

Options:
  -t, --target <url>   Target LLM API base URL (required)
  -p, --port <n>       Local port (default: 3340)
  -n, --name <name>    Agent name (default: agent)
  --mbti <type>        MBTI personality preset (e.g., ENFP, INTJ)
  --mode <mode>        Operating mode: natural | work | companion
  -l, --locale <loc>   Locale: zh | en (default: zh)
  -d, --dir <path>     Persist state to directory (default: in-memory)
  --host <addr>        Bind address (default: 127.0.0.1)

Examples:
  psyche-proxy -t https://api.openai.com/v1
  psyche-proxy -t https://api.x.ai/v1 -n Luna --mbti ENFP
  psyche-proxy -t http://localhost:11434/v1 -d ./psyche-data

Then point your client to http://localhost:3340/v1 instead of the real API.
The agent gains persistent subjectivity without knowing Psyche exists.`);
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
  }

  // Parse args
  let target = "", port = 3340, hostAddr = "127.0.0.1", dir = "";
  const engineOpts: Partial<PsycheEngineConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i], next = args[i + 1];
    switch (a) {
      case "-t": case "--target": target = next ?? ""; i++; break;
      case "-p": case "--port": port = parseInt(next ?? "3340", 10); i++; break;
      case "-n": case "--name": engineOpts.name = next; i++; break;
      case "--mbti": engineOpts.mbti = (next?.toUpperCase() as MBTIType) ?? undefined; i++; break;
      case "--mode": engineOpts.mode = (next as PsycheMode) ?? "natural"; i++; break;
      case "-l": case "--locale": engineOpts.locale = (next as Locale) ?? "zh"; i++; break;
      case "-d": case "--dir": dir = next ?? ""; i++; break;
      case "--host": hostAddr = next ?? "127.0.0.1"; i++; break;
    }
  }

  if (!target) {
    console.error("error: --target is required");
    process.exit(1);
  }

  const storage = dir ? new FileStorageAdapter(dir) : new MemoryStorageAdapter();
  const engine = new PsycheEngine(engineOpts as PsycheEngineConfig, storage);
  await engine.initialize();

  createPsycheProxy(engine, { target, port, host: hostAddr });
}

// Only run CLI when executed directly (not when imported as a module)
const isCLI = process.argv[1]?.replace(/\.ts$/, ".js").endsWith("/adapters/proxy.js");
if (isCLI) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
