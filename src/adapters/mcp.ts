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
import type { PsycheEngineConfig, ProcessInputResult, LoopOutcome } from "../core.js";
import {
  fetchAmbientPriorsFromThronglets,
  resolveAmbientPriorsForTurn,
  type ThrongletsAmbientRuntimeOptions,
} from "../ambient-runtime.js";
import { MemoryStorageAdapter, FileStorageAdapter, resolveWorkspaceDir } from "../storage.js";
import {
  CURRENT_GOALS,
  normalizeCurrentTurnCorrection,
  resolveRuntimeActivePolicy,
  type ActivePolicyRule,
  type AmbientPriorView,
  type CurrentGoal,
  type MBTIType,
  type Locale,
  type PsycheMode,
} from "../types.js";
import { getPackageVersion } from "../update.js";
import { runDemo } from "../demo.js";
import { safeProcessInput, safeProcessOutput } from "./fail-open.js";

const PACKAGE_VERSION = await getPackageVersion();

// ── Config from env ────────────────────────────────────────

const MBTI = (process.env.PSYCHE_MBTI ?? "ENFP") as MBTIType;
const NAME = process.env.PSYCHE_NAME ?? "Assistant";
const MODE = (process.env.PSYCHE_MODE ?? "natural") as PsycheMode;
const LOCALE = (process.env.PSYCHE_LOCALE ?? "en") as Locale;
const PERSIST = process.env.PSYCHE_PERSIST !== "false";
const SIGIL_ID = process.env.PSYCHE_SIGIL_ID ?? undefined;
const WORKSPACE_OVERRIDE = process.env.PSYCHE_WORKSPACE;
const AMBIENT_MODE = process.env.PSYCHE_AMBIENT ?? "auto";
const INTENSITY = process.env.PSYCHE_INTENSITY
  ? Number(process.env.PSYCHE_INTENSITY)
  : 0.7;

export interface McpAmbientRuntimeOptions {
  mode?: "auto" | "off";
  thronglets?: ThrongletsAmbientRuntimeOptions;
  fetcher?: typeof fetchAmbientPriorsFromThronglets;
}

const DEFAULT_MCP_AMBIENT_OPTIONS: McpAmbientRuntimeOptions = {
  mode: AMBIENT_MODE === "off" ? "off" : "auto",
  thronglets: {
    binaryPath: process.env.THRONGLETS_BIN,
    dataDir: process.env.THRONGLETS_DATA_DIR,
    space: process.env.THRONGLETS_SPACE ?? "psyche",
  },
};

const CURRENT_GOAL_SCHEMA = z.enum(CURRENT_GOALS);

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
    else if (arg === "--sigil-id" && next) { overrides.sigilId = next; i++; }
    else if (arg === "--no-persist") { overrides.persist = false; }
  }
  return overrides;
}

// ── Turn cache for on-demand resource access ──────────────
// Single-client assumption: MCP stdio transport serves one host at a time.
// If this ever becomes multi-client, turn cache must be keyed per session.

let lastTurnResult: ProcessInputResult | null = null;

// ── Engine singleton ───────────────────────────────────────

let engine: PsycheEngine | null = null;

async function getEngine(): Promise<PsycheEngine> {
  if (engine) return engine;

  const cliArgs = parseCLIArgs();
  const sigilId = cliArgs.sigilId ?? SIGIL_ID;
  const cfg: PsycheEngineConfig = {
    mbti: cliArgs.mbti ?? MBTI,
    name: cliArgs.name ?? NAME,
    mode: cliArgs.mode ?? MODE,
    locale: cliArgs.locale ?? LOCALE,
    sigilId,
    personalityIntensity: cliArgs.personalityIntensity ?? INTENSITY,
    persist: cliArgs.persist ?? PERSIST,
    compactMode: true,
    diagnostics: true,
    throngletsBridge: {
      dataDir: process.env.THRONGLETS_DATA_DIR,
      space: process.env.THRONGLETS_SPACE ?? "psyche",
    },
  };

  const persist = cfg.persist !== false;
  // Default to a stable per-user writable root so hosts do not need to supply cwd.
  const workspace = resolveWorkspaceDir({
    workspace: WORKSPACE_OVERRIDE,
    sigilId,
    surface: "mcp",
  });
  const storage = persist
    ? new FileStorageAdapter(workspace)
    : new MemoryStorageAdapter();

  engine = new PsycheEngine(cfg, storage);
  await engine.initialize();
  return engine;
}

export async function resolveRuntimeAmbientPriors(
  text: string,
  explicit?: AmbientPriorView[],
  currentGoal?: CurrentGoal,
  activePolicy?: ActivePolicyRule[],
  currentTurnCorrectionOrOpts?: string | McpAmbientRuntimeOptions,
  opts: McpAmbientRuntimeOptions = DEFAULT_MCP_AMBIENT_OPTIONS,
): Promise<AmbientPriorView[] | undefined> {
  const currentTurnCorrection = typeof currentTurnCorrectionOrOpts === "string"
    ? currentTurnCorrectionOrOpts
    : undefined;
  const resolvedOpts = (
    typeof currentTurnCorrectionOrOpts === "object"
    && currentTurnCorrectionOrOpts !== null
  )
    ? currentTurnCorrectionOrOpts
    : opts;
  const normalizedCorrection = normalizeCurrentTurnCorrection(currentTurnCorrection);
  const resolvedActivePolicy = resolveRuntimeActivePolicy(activePolicy, normalizedCorrection);
  const throngletsOptions =
    resolvedOpts.thronglets || currentGoal || resolvedActivePolicy?.length || normalizedCorrection
      ? {
          ...(resolvedOpts.thronglets ?? {}),
          goal: currentGoal ?? resolvedOpts.thronglets?.goal,
          activePolicy: resolvedActivePolicy ?? resolvedOpts.thronglets?.activePolicy,
          currentTurnCorrection: normalizedCorrection ?? resolvedOpts.thronglets?.currentTurnCorrection,
        }
      : undefined;
  return resolveAmbientPriorsForTurn(text, {
    explicit,
    enabled: resolvedOpts.mode !== "off",
    currentGoal,
    currentTurnCorrection: normalizedCorrection,
    activePolicy: resolvedActivePolicy,
    thronglets: throngletsOptions,
    fetcher: resolvedOpts.fetcher ?? fetchAmbientPriorsFromThronglets,
  });
}

// ── MCP Server ─────────────────────────────────────────────

function createServer(): McpServer {
  return new McpServer({
  name: "psyche",
  version: PACKAGE_VERSION,
}, {
  capabilities: {
    resources: {},
    tools: {},
  },
});
}

const server = createServer();

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

// Helper: register a turn-scoped resource backed by lastTurnResult.
// Returns empty JSON when no turn has been processed yet (fail-open).
function turnResource(
  name: string,
  uri: string,
  description: string,
  pick: (r: ProcessInputResult) => Record<string, unknown>,
): void {
  server.resource(name, uri, { description, mimeType: "application/json" }, async (u: URL) => ({
    contents: [{
      uri: u.href,
      mimeType: "application/json",
      text: lastTurnResult ? JSON.stringify(pick(lastTurnResult)) : "{}",
    }],
  }));
}

turnResource(
  "turn-envelope",
  "psyche://turn/envelope",
  "Full ReplyEnvelope from the last process_input call — " +
  "SubjectivityKernel, ResponseContract, GenerationControls, " +
  "appraisal axes, policyModifiers, and writebackFeedback. " +
  "Use this when you need the structured ABI data (non-LLM substrates, debugging, analytics).",
  (r) => ({
    replyEnvelope: r.replyEnvelope,
    appraisal: r.appraisal,
    policyModifiers: r.policyModifiers,
    writebackFeedback: r.writebackFeedback,
    externalContinuity: r.externalContinuity,
  }),
);

turnResource(
  "turn-observability",
  "psyche://turn/observability",
  "Diagnostic metadata from the last process_input call — " +
  "control boundary, state layers, decision rationale, causal chain. " +
  "Use for debugging and auditing only.",
  (r) => ({
    observability: r.observability,
    stimulus: r.stimulus,
    stimulusConfidence: r.stimulusConfidence,
    policyContext: r.policyContext,
  }),
);

// ── Tools ──────────────────────────────────────────────────

server.tool(
  "process_input",
  "Process user input through the emotional engine. Returns a directive " +
  "(text to inject into system prompt), stimulus classification, generation controls, " +
  "and optional sparse continuity signals. " +
  "Full structured state (ReplyEnvelope, appraisal) available via psyche://turn/envelope resource. " +
  "Call this BEFORE generating a response to the user.",
  {
    text: z.string().describe("The user's message text"),
    userId: z.string().optional().describe("Optional user ID for multi-user relationship tracking"),
    ambientPriors: z.array(z.object({
      summary: z.string(),
      confidence: z.number().min(0).max(1),
      kind: z.enum(["failure-residue", "mixed-residue", "success-prior"]).optional(),
      policyState: z.enum(["policy-conflict", "method-conflict", "stable-path"]).optional(),
      goal: CURRENT_GOAL_SCHEMA.optional(),
      provider: z.string().optional(),
      refs: z.array(z.string()).optional(),
    })).optional().describe("Optional runtime ambient priors from the environment; consumed this turn only, not persisted as self-state"),
    currentGoal: CURRENT_GOAL_SCHEMA.optional().describe("Optional single current runtime goal for this turn"),
    activePolicy: z.array(z.object({
      id: z.string(),
      strength: z.enum(["hard", "soft"]),
      scope: z.enum(["task", "project"]),
      summary: z.string(),
    })).optional().describe("Optional explicit current-turn method policy view. Runtime-only; not persisted as self-state."),
    currentTurnCorrection: z.string().optional().describe("Optional explicit current-turn correction. Compiles into a task-scoped hard policy for this turn only."),
  },
  async ({ text, userId, ambientPriors, currentGoal, activePolicy, currentTurnCorrection }: {
    text: string;
    userId?: string;
    ambientPriors?: AmbientPriorView[];
    currentGoal?: CurrentGoal;
    activePolicy?: ActivePolicyRule[];
    currentTurnCorrection?: string;
  }) => {
    const eng = await getEngine();
    const resolvedActivePolicy = resolveRuntimeActivePolicy(activePolicy, currentTurnCorrection);
    const resolvedAmbientPriors = await resolveRuntimeAmbientPriors(
      text,
      ambientPriors,
      currentGoal,
      resolvedActivePolicy,
      currentTurnCorrection,
    );
    const result: ProcessInputResult = await safeProcessInput(eng, text, {
      userId,
      ambientPriors: resolvedAmbientPriors,
      currentGoal,
      activePolicy: resolvedActivePolicy,
      currentTurnCorrection,
    }, "mcp.processInput");

    // Cache full result for turn-scoped resources
    lastTurnResult = result;

    // Build slim response: only what the LLM host actually needs.
    // Full structured state available via psyche://turn/envelope resource.
    const slim: Record<string, unknown> = {
      directive: result.dynamicContext,
      stimulus: result.stimulus,
      maxTokens: result.generationControls?.maxTokens,
      requireConfirmation: result.generationControls?.requireConfirmation ?? false,
    };

    // Sparse signals — only when non-empty to keep payload minimal
    if (result.throngletsExports?.length) {
      slim.throngletsExports = result.throngletsExports;
    }
    if (result.sessionBridge) {
      slim.sessionBridge = result.sessionBridge;
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(slim),
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

    // LLM-specific alignment inference (adapter layer — the ONLY text-specific code).
    // Compare output length against last contract's maxChars to detect divergence.
    let outcome: LoopOutcome | undefined;
    if (lastTurnResult?.responseContract) {
      const maxLen = (lastTurnResult.responseContract.maxChars ?? 500) * 2;
      outcome = { alignment: text.length > maxLen ? "diverged" : "aligned" };
    }

    const result = await safeProcessOutput(
      eng,
      text,
      { userId, signals: signals as never, signalConfidence, outcome },
      "mcp.processOutput",
    );
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          cleanedText: result.cleanedText,
          stateChanged: result.stateChanged,
          ...(result.validationIssues?.length ? { validationIssues: result.validationIssues } : {}),
        }),
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

export async function runMcpServer(): Promise<void> {
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

export { server, getEngine };
