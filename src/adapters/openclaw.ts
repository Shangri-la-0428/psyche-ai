// ============================================================
// OpenClaw Adapter — Wires PsycheEngine to OpenClaw's hook system
//
// Hooks used:
//   before_prompt_build  — inject emotional context into system prompt
//   llm_output           — observe LLM response, update chemistry
//   before_message_write — strip <psyche_update> tags before display
//   message_sending      — strip tags for external channels (Discord, etc.)
//   agent_end            — log final state
// ============================================================

import type { PsycheState, Locale } from "../types.js";
import { PsycheEngine } from "../core.js";
import { FileStorageAdapter } from "../storage.js";
import { loadState } from "../psyche-file.js";
import type { Logger } from "../psyche-file.js";

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
  maxChemicalDelta: number;
  compactMode: boolean;
}

function resolveConfig(raw?: Record<string, unknown>): OpenClawPsycheConfig {
  return {
    enabled: (raw?.enabled as boolean) ?? true,
    stripUpdateTags: (raw?.stripUpdateTags as boolean) ?? true,
    emotionalContagionRate: (raw?.emotionalContagionRate as number) ?? 0.2,
    maxChemicalDelta: (raw?.maxChemicalDelta as number) ?? 25,
    compactMode: (raw?.compactMode as boolean) ?? true,
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

      const state = await loadState(workspaceDir, logger);

      const storage = new FileStorageAdapter(workspaceDir);
      engine = new PsycheEngine({
        mbti: state.mbti,
        name: state.meta.agentName,
        locale: state.meta.locale,
        stripUpdateTags: config.stripUpdateTags,
        emotionalContagionRate: config.emotionalContagionRate,
        maxChemicalDelta: config.maxChemicalDelta,
        compactMode: config.compactMode,
      }, storage);
      await engine.initialize();
      engines.set(workspaceDir, engine);
      return engine;
    }

    // ── Hook 1: Classify user input & inject emotional context ──
    // before_prompt_build: event.text, ctx.workspaceDir

    api.on("before_prompt_build", async (event, ctx) => {
      const workspaceDir = ctx?.workspaceDir as string | undefined;
      if (!workspaceDir) return {};

      try {
        const engine = await getEngine(workspaceDir);
        const result = await engine.processInput(
          (event?.text as string) ?? "",
          { userId: ctx.userId as string | undefined },
        );

        const state = engine.getState();
        logger.info(
          `Psyche [input] stimulus=${result.stimulus ?? "none"} | ` +
          `DA:${Math.round(state.current.DA)} HT:${Math.round(state.current.HT)} ` +
          `CORT:${Math.round(state.current.CORT)} OT:${Math.round(state.current.OT)} | ` +
          `context=${result.dynamicContext.length}chars`,
        );

        // All context goes into system-level (invisible to user)
        const systemParts = [result.systemContext, result.dynamicContext].filter(Boolean);
        return {
          appendSystemContext: systemParts.join("\n\n"),
        };
      } catch (err) {
        logger.warn(`Psyche: failed to build context for ${workspaceDir}: ${err}`);
        return {};
      }
    }, { priority: 10 });

    // ── Hook 2: Observe LLM output, update chemistry ────────
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
          `DA:${Math.round(state.current.DA)} HT:${Math.round(state.current.HT)} ` +
          `CORT:${Math.round(state.current.CORT)} OT:${Math.round(state.current.OT)} | ` +
          `interactions=${state.meta.totalInteractions}`,
        );
      } catch (err) {
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
        const state = engine.getState();
        logger.info(
          `Psyche: session ended for ${state.meta.agentName}, ` +
          `chemistry saved (DA:${Math.round(state.current.DA)} ` +
          `HT:${Math.round(state.current.HT)} ` +
          `CORT:${Math.round(state.current.CORT)} ` +
          `OT:${Math.round(state.current.OT)} ` +
          `NE:${Math.round(state.current.NE)} ` +
          `END:${Math.round(state.current.END)})`,
        );
      }
    }, { priority: 50 });

    // ── CLI: psyche status command ───────────────────────────

    api.registerCli?.((cli: CliRegistrar) => {
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
