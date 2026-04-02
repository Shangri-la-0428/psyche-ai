#!/usr/bin/env node
// ============================================================
// MCP Adapter — Model Context Protocol server for Psyche
//
// Enables any MCP-compatible AI (Claude Desktop, Cursor, Windsurf,
// Claude Code, etc.) to discover and use Psyche's emotional
// intelligence capabilities.
//
// Usage:
//   npx psyche-ai mcp                        # zero-config, ENFP default
//   npx psyche-ai mcp --mbti INTJ --name Kai
//   PSYCHE_MBTI=INFP PSYCHE_NAME=Luna npx psyche-ai mcp
//
// Configure in Claude Desktop / Cursor / Windsurf:
//   {
//     "mcpServers": {
//       "psyche": {
//         "command": "npx",
//         "args": ["-y", "psyche-ai", "mcp"],
//         "env": {
//           "PSYCHE_MBTI": "ENFP",
//           "PSYCHE_NAME": "Luna",
//           "PSYCHE_MODE": "natural",
//           "PSYCHE_LOCALE": "en"
//         }
//       }
//     }
//   }
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PsycheEngine } from "../core.js";
import type { PsycheEngineConfig, ProcessInputResult } from "../core.js";
import { MemoryStorageAdapter, FileStorageAdapter } from "../storage.js";
import type { MBTIType, Locale, PsycheMode } from "../types.js";
import { runDemo } from "../demo.js";

// ── Config from env ────────────────────────────────────────

const MBTI = (process.env.PSYCHE_MBTI ?? "ENFP") as MBTIType;
const NAME = process.env.PSYCHE_NAME ?? "Assistant";
const MODE = (process.env.PSYCHE_MODE ?? "natural") as PsycheMode;
const LOCALE = (process.env.PSYCHE_LOCALE ?? "en") as Locale;
const PERSIST = process.env.PSYCHE_PERSIST !== "false";
const WORKSPACE = process.env.PSYCHE_WORKSPACE ?? process.cwd();
const INTENSITY = process.env.PSYCHE_INTENSITY
  ? Number(process.env.PSYCHE_INTENSITY)
  : 0.7;

// ── Parse CLI args (--mbti, --name, --mode, --locale) ──────

function parseCLIArgs(): Partial<PsycheEngineConfig> {
  const args = process.argv.slice(2);
  const overrides: Partial<PsycheEngineConfig> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--mbti" && next) { overrides.mbti = next as MBTIType; i++; }
    else if (arg === "--name" && next) { overrides.name = next; i++; }
    else if (arg === "--mode" && next) { overrides.mode = next as PsycheMode; i++; }
    else if (arg === "--locale" && next) { overrides.locale = next as Locale; i++; }
    else if (arg === "--intensity" && next) { overrides.personalityIntensity = Number(next); i++; }
    else if (arg === "--no-persist") { overrides.persist = false; }
  }
  return overrides;
}

// ── Engine singleton ───────────────────────────────────────

let engine: PsycheEngine | null = null;

async function getEngine(): Promise<PsycheEngine> {
  if (engine) return engine;

  const cliArgs = parseCLIArgs();
  const cfg: PsycheEngineConfig = {
    mbti: cliArgs.mbti ?? MBTI,
    name: cliArgs.name ?? NAME,
    mode: cliArgs.mode ?? MODE,
    locale: cliArgs.locale ?? LOCALE,
    personalityIntensity: cliArgs.personalityIntensity ?? INTENSITY,
    persist: cliArgs.persist ?? PERSIST,
    compactMode: true,
    diagnostics: true,
  };

  const persist = cfg.persist !== false;
  const storage = persist
    ? new FileStorageAdapter(WORKSPACE)
    : new MemoryStorageAdapter();

  engine = new PsycheEngine(cfg, storage);
  await engine.initialize();
  return engine;
}

// ── MCP Server ─────────────────────────────────────────────

const server = new McpServer({
  name: "psyche",
  version: "9.2.3",
}, {
  capabilities: {
    resources: {},
    tools: {},
  },
});

// ── Resources ──────────────────────────────────────────────

server.resource(
  "protocol",
  "psyche://protocol",
  {
    description:
      "Psyche emotional protocol — inject into your system prompt to " +
      "give the AI agent an internal emotional life. Contains the full " +
      "emotional context framework including 4-dimensional self-state model (order/flow/boundary/resonance), " +
      "behavioral guidelines, and personality profile.",
    mimeType: "text/plain",
  },
  async (uri: URL) => {
    const eng = await getEngine();
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: eng.getProtocol(),
      }],
    };
  },
);

server.resource(
  "state",
  "psyche://state",
  {
    description:
      "Current emotional state — 4 self-state dimensions (order/flow/boundary/resonance), " +
      "innate drives, relationship data, trait drift, energy budgets. " +
      "Read this to understand how the agent is currently 'feeling'.",
    mimeType: "application/json",
  },
  async (uri: URL) => {
    const eng = await getEngine();
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(eng.getState(), null, 2),
      }],
    };
  },
);

// ── Tools ──────────────────────────────────────────────────

server.tool(
  "process_input",
  "Process user input through the emotional engine. Returns emotional " +
  "context to inject into the LLM system prompt (systemContext + dynamicContext), " +
  "detected stimulus type, a canonical replyEnvelope, compatibility aliases " +
  "(policyModifiers + subjectivityKernel + responseContract + generationControls), an optional " +
  "externalContinuity envelope, and sparse low-frequency throngletsExports " +
  "suitable for additive external continuity layers. " +
  "Call this BEFORE generating a response to the user.",
  {
    text: z.string().describe("The user's message text"),
    userId: z.string().optional().describe("Optional user ID for multi-user relationship tracking"),
  },
  async ({ text, userId }: { text: string; userId?: string }) => {
    const eng = await getEngine();
    const result: ProcessInputResult = await eng.processInput(text, { userId });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          systemContext: result.systemContext,
          dynamicContext: result.dynamicContext,
          stimulus: result.stimulus,
          replyEnvelope: result.replyEnvelope ?? null,
          policyModifiers: result.policyModifiers ?? null,
          subjectivityKernel: result.subjectivityKernel ?? null,
          responseContract: result.responseContract ?? null,
          generationControls: result.generationControls ?? null,
          sessionBridge: result.sessionBridge ?? null,
          writebackFeedback: result.writebackFeedback ?? null,
          externalContinuity: result.externalContinuity ?? null,
          throngletsExports: result.throngletsExports ?? null,
          policyContext: result.policyContext,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "process_output",
  "Process the LLM's response through the emotional engine. " +
  "Strips internal <psyche_update> tags and updates chemistry based on " +
  "emotional contagion. Call this AFTER generating a response.",
  {
    text: z.string().describe("The LLM's response text"),
    userId: z.string().optional().describe("Optional user ID"),
    signals: z.array(z.string()).optional().describe("Optional sparse writeback signals from the host"),
    signalConfidence: z.number().min(0).max(1).optional().describe("Optional confidence for the supplied signals"),
  },
  async ({ text, userId, signals, signalConfidence }: { text: string; userId?: string; signals?: string[]; signalConfidence?: number }) => {
    const eng = await getEngine();
    const result = await eng.processOutput(text, { userId, signals: signals as never, signalConfidence });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          cleanedText: result.cleanedText,
          stateChanged: result.stateChanged,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "get_state",
  "Get the current emotional state — self-state dimensions (order/flow/boundary/resonance), " +
  "drives, MBTI type, relationship data, and a human-readable status summary.",
  {},
  async () => {
    const eng = await getEngine();
    const state = eng.getState();
    const summary = eng.getStatusSummary();
    const { computeOverlay } = await import("../overlay.js");
    const overlay = computeOverlay({ current: state.current, baseline: state.baseline });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          summary,
          current: state.current,
          baseline: state.baseline,
          overlay,
          drives: state.drives,
          mbti: state.mbti,
          mode: state.meta?.mode,
          totalInteractions: state.meta?.totalInteractions,
          traitDrift: state.traitDrift,
          energyBudgets: state.energyBudgets,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "set_mode",
  "Switch operating mode. 'natural' = balanced emotional expression, " +
  "'work' = minimal emotions for professional tasks, " +
  "'companion' = full emotional depth for personal conversations.",
  {
    mode: z.enum(["natural", "work", "companion"]).describe("Operating mode"),
  },
  async ({ mode }: { mode: string }) => {
    const eng = await getEngine();
    // PsycheEngine stores mode in config, we need to reinitialize
    // For now, update via state manipulation
    const state = eng.getState();
    if (state.meta) {
      state.meta.mode = mode as PsycheMode;
    }
    return {
      content: [{
        type: "text" as const,
        text: `Mode switched to "${mode}".`,
      }],
    };
  },
);

server.tool(
  "get_status_summary",
  "Get a brief, human-readable emotional status summary — " +
  "a one-line description of how the agent is currently feeling. " +
  "Useful for quick checks without reading full state.",
  {},
  async () => {
    const eng = await getEngine();
    return {
      content: [{
        type: "text" as const,
        text: eng.getStatusSummary(),
      }],
    };
  },
);

server.tool(
  "end_session",
  "End the current session. Generates a diagnostic report, " +
  "compresses emotional history, and persists state to disk. " +
  "Call when the conversation is ending.",
  {
    userId: z.string().optional().describe("Optional user ID"),
  },
  async ({ userId }: { userId?: string }) => {
    const eng = await getEngine();
    const report = await eng.endSession({ userId });
    return {
      content: [{
        type: "text" as const,
        text: report
          ? JSON.stringify({ issues: report.issues, metrics: report.metrics }, null, 2)
          : "Session ended. No diagnostic report generated.",
      }],
    };
  },
);

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  // Intercept --demo flag before starting MCP server
  const args = process.argv.slice(2);
  if (args.includes("--demo")) {
    const locale = args.includes("--zh") ? "zh" : "en";
    let mbti = "ENFP";
    const mbtiIdx = args.indexOf("--mbti");
    if (mbtiIdx !== -1 && args[mbtiIdx + 1]) mbti = args[mbtiIdx + 1];
    const fast = args.includes("--fast");
    await runDemo({ locale, mbti, fast });
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`psyche-mcp fatal: ${err}\n`);
  process.exit(1);
});

export { server, getEngine };
