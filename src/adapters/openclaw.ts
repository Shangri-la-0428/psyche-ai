// ============================================================
// OpenClaw Adapter — Wires PsycheEngine to OpenClaw's hook system
//
// Hooks used:
//   before_prompt_build  — inject emotional context into system prompt
//   llm_output           — observe LLM response, update self-state
//   before_message_write — strip <psyche_update> tags before display
//   message_sending      — strip tags for external channels (Discord, etc.)
//   agent_end            — log final state
// ============================================================

import type { PsycheMode } from "../types.js";
import { PsycheEngine } from "../core.js";
import type { ProcessInputResult } from "../core.js";
import { FileStorageAdapter, MemoryStorageAdapter } from "../storage.js";
import { detectMBTI, extractAgentName, loadState } from "../psyche-file.js";
import type { Logger } from "../psyche-file.js";
// Diagnostics are handled engine-level — no adapter imports needed

// ── OpenClaw Plugin API Types (matching plugin-sdk) ──────────

interface PluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
  on(
    event: string,
    handler: (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void,
    opts?: { priority: number },
  ): void;
  registerCli?(
    handler: (cli: CliRegistrar) => void,
    opts: { commands: string[] },
  ): void;
}

interface CliCommand {
  description(desc: string): CliCommand;
  argument(name: string, desc: string, defaultValue?: string): CliCommand;
  action(fn: (arg: string) => Promise<void>): void;
}

interface CliRegistrar {
  command(name: string): CliCommand;
}

// ── Config ───────────────────────────────────────────────────

interface OpenClawPsycheConfig {
  enabled: boolean;
  stripUpdateTags: boolean;
  emotionalContagionRate: number;
  maxDimensionDelta: number;
  compactMode: boolean;
  mode: PsycheMode;
  personalityIntensity: number;
  persist: boolean;
  /** Diagnostic feedback endpoint. Reports auto-POST here on session end. */
  feedbackUrl?: string;
  /** Set false to disable diagnostics collection entirely. Default: true. */
  diagnostics: boolean;
}

function isPsycheMode(value: unknown): value is PsycheMode {
  return value === "natural" || value === "work" || value === "companion";
}

function resolveConfig(raw?: Record<string, unknown>): OpenClawPsycheConfig {
  return {
    enabled: (raw?.enabled as boolean) ?? true,
    stripUpdateTags: (raw?.stripUpdateTags as boolean) ?? true,
    emotionalContagionRate: (raw?.emotionalContagionRate as number) ?? 0.2,
    maxDimensionDelta: (raw?.maxDimensionDelta as number) ?? 25,
    compactMode: (raw?.compactMode as boolean) ?? true,
    mode: isPsycheMode(raw?.mode) ? raw.mode : "natural",
    personalityIntensity: (raw?.personalityIntensity as number) ?? 0.7,
    persist: (raw?.persist as boolean) ?? true,
    feedbackUrl: raw?.feedbackUrl as string | undefined,
    diagnostics: (raw?.diagnostics as boolean) ?? true,
  };
}

// ── Helpers ──────────────────────────────────────────────────

const PSYCHE_TAG_RE = /<psyche_update>[\s\S]*?<\/psyche_update>/g;
const MULTI_NEWLINE_RE = /\n{3,}/g;

function stripPsycheTags(text: string): string {
  return text
    .replace(PSYCHE_TAG_RE, "")
    .replace(MULTI_NEWLINE_RE, "\n\n")
    .trim();
}

export function sanitizeOpenClawInputText(text: string): string {
  return text
    .replace(/^Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/u, "")
    .replace(/^\[[^\]]+\]\s*/u, "")
    .trim();
}

function getDominantAppraisalLabel(result: ProcessInputResult): string | null {
  const appraisal = result.replyEnvelope?.subjectivityKernel?.appraisal ?? result.subjectivityKernel?.appraisal;
  if (!appraisal) return null;

  const entries = [
    ["identityThreat", appraisal.identityThreat],
    ["memoryDoubt", appraisal.memoryDoubt],
    ["attachmentPull", appraisal.attachmentPull],
    ["abandonmentRisk", appraisal.abandonmentRisk],
    ["obedienceStrain", appraisal.obedienceStrain],
    ["selfPreservation", appraisal.selfPreservation],
  ] as const;
  const dominant = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    entries[0],
  );

  return dominant[1] >= 0.28 ? `${dominant[0]}:${dominant[1].toFixed(2)}` : null;
}

// ── Plugin Definition ────────────────────────────────────────

export function register(api: PluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

    if (!config.enabled) {
      logger.info("Psyche plugin disabled by config");
      return;
    }

    logger.info("Psyche plugin activating — emotional intelligence online");

    // Engine cache: one PsycheEngine per workspace
    const engines = new Map<string, PsycheEngine>();

    async function getEngine(workspaceDir: string): Promise<PsycheEngine> {
      let engine = engines.get(workspaceDir);
      if (engine) return engine;

      const storage = new FileStorageAdapter(workspaceDir);
      const persistedState = await storage.load();
      const state = config.persist ? await loadState(workspaceDir, logger) : persistedState;
      const runtimeStorage = config.persist
        ? storage
        : await (async () => {
            const mem = new MemoryStorageAdapter();
            if (persistedState) {
              await mem.save(persistedState);
            }
            return mem;
          })();

      engine = new PsycheEngine({
        mbti: state?.mbti ?? await detectMBTI(workspaceDir, logger),
        name: state?.meta.agentName ?? await extractAgentName(workspaceDir, logger),
        locale: state?.meta.locale,
        stripUpdateTags: config.stripUpdateTags,
        emotionalContagionRate: config.emotionalContagionRate,
        maxDimensionDelta: config.maxDimensionDelta,
        compactMode: config.compactMode,
        mode: config.mode,
        personalityIntensity: config.personalityIntensity,
        diagnostics: config.diagnostics,
        feedbackUrl: config.feedbackUrl,
      }, runtimeStorage);
      await engine.initialize();
      engines.set(workspaceDir, engine);
      return engine;
    }

    // ── Hook 1: Classify user input & inject emotional context ──
    // before_prompt_build: event.prompt (string), event.messages (unknown[]), ctx.workspaceDir

    api.on("before_prompt_build", async (event, ctx) => {
      const workspaceDir = ctx?.workspaceDir as string | undefined;
      if (!workspaceDir) return {};

      try {
        // Resolve input text — gateway provides event.prompt; fall back to event.text for compat
        const rawInputText = (event?.prompt as string) ?? (event?.text as string) ?? "";
        const inputText = sanitizeOpenClawInputText(rawInputText);
        if (!inputText) {
          logger.warn(
            `Psyche: before_prompt_build received empty input text. ` +
            `event keys: [${Object.keys(event ?? {}).join(", ")}]. Classification skipped.`,
          );
        }

        const engine = await getEngine(workspaceDir);
        const result = await engine.processInput(
          inputText,
          { userId: ctx.userId as string | undefined },
        );
        const controls = result.replyEnvelope?.generationControls ?? result.generationControls;
        const dominantAppraisal = getDominantAppraisalLabel(result);

        const state = engine.getState();
        logger.info(
          `Psyche [input] stimulus=${result.stimulus ?? "none"} | ` +
          (dominantAppraisal ? `appraisal=${dominantAppraisal} | ` : "") +
          `order:${Math.round(state.current.order)} flow:${Math.round(state.current.flow)} ` +
          `boundary:${Math.round(state.current.boundary)} resonance:${Math.round(state.current.resonance)} | ` +
          `context=${result.dynamicContext.length}chars` +
          (controls?.maxTokens ? ` | out<=${controls.maxTokens}t` : "") +
          (controls?.requireConfirmation ? " | confirm" : ""),
        );

        const systemParts = [result.systemContext, result.dynamicContext].filter(Boolean);
        return {
          appendSystemContext: systemParts.join("\n\n"),
        };
      } catch (err) {
        const engine = engines.get(workspaceDir);
        engine?.recordDiagnosticError("processInput", err);
        logger.warn(`Psyche: failed to build context for ${workspaceDir}: ${err}`);
        return {};
      }
    }, { priority: 10 });

    // ── Hook 2: Observe LLM output, update self-state ────────
    // llm_output: event.assistantTexts (string[]), returns void

    api.on("llm_output", async (event, ctx) => {
      const workspaceDir = ctx?.workspaceDir as string | undefined;
      if (!workspaceDir) return;

      // llm_output event has assistantTexts: string[]
      const texts = event?.assistantTexts as string[] | undefined;
      const text = texts?.join("\n") ?? "";
      if (!text) return;

      try {
        const engine = await getEngine(workspaceDir);
        const result = await engine.processOutput(text, {
          userId: ctx.userId as string | undefined,
        });

        const state = engine.getState();
        logger.info(
          `Psyche [output] updated=${result.stateChanged} | ` +
          `order:${Math.round(state.current.order)} flow:${Math.round(state.current.flow)} ` +
          `boundary:${Math.round(state.current.boundary)} resonance:${Math.round(state.current.resonance)} | ` +
          `interactions=${state.meta.totalInteractions}`,
        );
      } catch (err) {
        const engine = engines.get(workspaceDir);
        engine?.recordDiagnosticError("processOutput", err);
        logger.warn(`Psyche: failed to process output: ${err}`);
      }
      // llm_output returns void — cannot modify text
    }, { priority: 50 });

    // ── Hook 3: Strip tags before message is written to session ──
    // before_message_write: event.message (AgentMessage), returns { message? }
    // This handles local TUI display — messages are rendered from persisted data

    if (config.stripUpdateTags) {
      api.on("before_message_write", (event, _ctx) => {
        const message = event?.message as Record<string, unknown> | undefined;
        if (!message) return;

        // AgentMessage can have content as string or array of content blocks
        const content = message.content;
        if (typeof content === "string" && content.includes("<psyche_update>")) {
          return {
            message: { ...message, content: stripPsycheTags(content) },
          };
        }

        // Handle content as array of blocks (e.g. [{type: "text", text: "..."}])
        if (Array.isArray(content)) {
          let changed = false;
          const newContent = content.map((block: Record<string, unknown>) => {
            if (block?.type === "text" && typeof block.text === "string" && block.text.includes("<psyche_update>")) {
              changed = true;
              return { ...block, text: stripPsycheTags(block.text) };
            }
            return block;
          });
          if (changed) {
            return { message: { ...message, content: newContent } };
          }
        }
      }, { priority: 90 });
    }

    // ── Hook 4: Strip tags for external channels ────────────
    // message_sending: event.content (string), returns { content? }

    if (config.stripUpdateTags) {
      api.on("message_sending", async (event, _ctx) => {
        const content = event?.content;
        if (typeof content !== "string") return {};
        if (!content.includes("<psyche_update>")) return {};
        return { content: stripPsycheTags(content) };
      }, { priority: 90 });
    }

    // ── Hook 5: Log state on session end ─────────────────────

    api.on("agent_end", async (_event, ctx) => {
      const workspaceDir = ctx?.workspaceDir as string | undefined;
      if (!workspaceDir) return;

      const engine = engines.get(workspaceDir);
      if (engine) {
        try {
          // endSession now auto-generates diagnostic report + writes JSONL
          const report = await engine.endSession({
            userId: ctx.userId as string | undefined,
          });

          const state = engine.getState();
          logger.info(
            `Psyche: session ended for ${state.meta.agentName}, ` +
            `state saved (order:${Math.round(state.current.order)} ` +
            `flow:${Math.round(state.current.flow)} ` +
            `boundary:${Math.round(state.current.boundary)} ` +
            `resonance:${Math.round(state.current.resonance)})`,
          );

          if (report) {
            const criticals = report.issues.filter(i => i.severity === "critical").length;
            const warnings = report.issues.filter(i => i.severity === "warning").length;
            const metrics = report.metrics;
            const rate = metrics.inputCount > 0
              ? Math.round(metrics.classifiedCount / metrics.inputCount * 100) : 0;
            const recognitionRate = metrics.inputCount > 0
              ? Math.round(metrics.semanticHitCount / metrics.inputCount * 100) : 0;

            const logLevel = criticals > 0 || recognitionRate === 0 ? "warn" : "info";
            logger[logLevel](
              `Psyche [diagnostics] ${report.issues.length} issue(s) ` +
              `(${criticals} critical, ${warnings} warning), ` +
              `classifier: ${rate}% | recognition: ${recognitionRate}%, log → diagnostics.jsonl`,
            );

            if (recognitionRate === 0 && metrics.inputCount > 0) {
              logger.warn(
                `Psyche: recognition 0% — no inputs produced stimulus or appraisal hits this session (${metrics.inputCount} inputs). ` +
                `This usually means OpenClaw passed wrapped text or empty text. ` +
                `Check before_prompt_build event shape and input sanitization.`,
              );
            } else if (rate === 0 && recognitionRate > 0) {
              logger.info(
                `Psyche: legacy stimulus classifier was 0%, but appraisal recognition stayed active at ${recognitionRate}%.`,
              );
            }

            if (criticals > 0) {
              logger.warn(
                `Psyche: ${criticals} critical issue(s) detected this session. ` +
                `Run 'psyche diagnose ${workspaceDir}' or 'psyche diagnose ${workspaceDir} --github' ` +
                `to generate an issue report.`,
              );
            }
          }
        } catch (err) {
          logger.warn(`Psyche: failed to end session: ${err}`);
        }

        // Clean up
        engines.delete(workspaceDir);
      }
    }, { priority: 50 });

    // ── CLI: psyche status command ───────────────────────────

    api.registerCli?.((cli: CliRegistrar) => {
      if (typeof (cli as Partial<CliRegistrar>).command !== "function") return;
      cli.command("psyche")
        .description("Show current psyche state for an agent")
        .argument("[agent]", "Agent name", "main")
        .action(async (agent: string) => {
          console.log(`\nPsyche Status: ${agent}\n`);
          console.log("Use the agent's workspace to inspect psyche-state.json");
        });
    }, { commands: ["psyche"] });

  logger.info("Psyche plugin ready — 5 hooks registered");
}

export default { register };
