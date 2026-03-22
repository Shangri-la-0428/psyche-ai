// ============================================================
// OpenClaw Adapter — Wires PsycheEngine to OpenClaw's hook system
//
// Usage:
//   import openclawPlugin from "psyche-ai/openclaw";
//   // Then register via OpenClaw's plugin system
// ============================================================

import type { PsycheState, Locale } from "../types.js";
import { PsycheEngine } from "../core.js";
import { FileStorageAdapter } from "../storage.js";
import { loadState } from "../psyche-file.js";
import type { Logger } from "../psyche-file.js";

// ── OpenClaw Plugin API Types ────────────────────────────────

interface PluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: Logger;
  on(
    event: string,
    handler: (event: HookEvent, ctx: HookContext) => Promise<Record<string, unknown> | void>,
    opts?: { priority: number },
  ): void;
  registerCli?(
    handler: (cli: CliRegistrar) => void,
    opts: { commands: string[] },
  ): void;
}

interface HookEvent {
  text?: string;
  content?: string;
}

interface HookContext {
  workspaceDir?: string;
  userId?: string;
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
}

function resolveConfig(raw?: Record<string, unknown>): OpenClawPsycheConfig {
  return {
    enabled: (raw?.enabled as boolean) ?? true,
    stripUpdateTags: (raw?.stripUpdateTags as boolean) ?? true,
    emotionalContagionRate: (raw?.emotionalContagionRate as number) ?? 0.2,
    maxChemicalDelta: (raw?.maxChemicalDelta as number) ?? 25,
  };
}

// ── Plugin Definition ────────────────────────────────────────

const plugin = {
  id: "psyche",
  name: "Artificial Psyche",
  description: "Virtual endocrine system, empathy engine, and agency for OpenClaw agents",
  version: "1.0.0",

  register(api: PluginApi) {
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

      // Use existing loadState for workspace-specific detection
      // (reads IDENTITY.md, SOUL.md for MBTI/name, generates PSYCHE.md)
      const state = await loadState(workspaceDir, logger);

      const storage = new FileStorageAdapter(workspaceDir);
      engine = new PsycheEngine({
        mbti: state.mbti,
        name: state.meta.agentName,
        locale: state.meta.locale,
        stripUpdateTags: config.stripUpdateTags,
        emotionalContagionRate: config.emotionalContagionRate,
        maxChemicalDelta: config.maxChemicalDelta,
      }, storage);
      await engine.initialize();
      engines.set(workspaceDir, engine);
      return engine;
    }

    // ── Hook 1: Classify user input & inject emotional context ──

    api.on("before_prompt_build", async (event: HookEvent, ctx: HookContext) => {
      const workspaceDir = ctx?.workspaceDir;
      if (!workspaceDir) return {};

      try {
        const engine = await getEngine(workspaceDir);
        const result = await engine.processInput(event?.text ?? "", { userId: ctx.userId });

        return {
          appendSystemContext: result.systemContext,
          prependContext: result.dynamicContext,
        };
      } catch (err) {
        logger.warn(`Psyche: failed to build context for ${workspaceDir}: ${err}`);
        return {};
      }
    }, { priority: 10 });

    // ── Hook 2: Parse psyche_update from LLM output ──────────

    api.on("llm_output", async (event: HookEvent, ctx: HookContext) => {
      const workspaceDir = ctx?.workspaceDir;
      if (!workspaceDir) return;

      const text = event?.text ?? event?.content ?? "";
      if (!text) return;

      try {
        const engine = await getEngine(workspaceDir);
        const result = await engine.processOutput(text, { userId: ctx.userId });

        const state = engine.getState();
        logger.info(
          `Psyche: state updated for ${state.meta.agentName} ` +
          `(interactions: ${state.meta.totalInteractions}, ` +
          `agreementStreak: ${state.agreementStreak})`,
        );

        // Return cleaned text if tags were stripped
        if (result.cleanedText !== text) {
          return { text: result.cleanedText, content: result.cleanedText };
        }
      } catch (err) {
        logger.warn(`Psyche: failed to process output: ${err}`);
      }
    }, { priority: 50 });

    // ── Hook 3: Strip <psyche_update> from visible output ────

    if (config.stripUpdateTags) {
      api.on("message_sending", async (event: HookEvent, _ctx: HookContext) => {
        const content = event?.content;
        if (typeof content !== "string") return {};
        if (!content.includes("<psyche_update>")) return {};

        const cleaned = content
          .replace(/<psyche_update>[\s\S]*?<\/psyche_update>/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        return { content: cleaned };
      }, { priority: 90 });
    }

    // ── Hook 4: Log state on session end ─────────────────────

    api.on("agent_end", async (_event: HookEvent, ctx: HookContext) => {
      const workspaceDir = ctx?.workspaceDir;
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

    logger.info("Psyche plugin ready — 4 hooks registered");
  },
};

export default plugin;
