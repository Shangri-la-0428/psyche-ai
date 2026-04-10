#!/usr/bin/env node
// ============================================================
// psyche — Artificial Psyche CLI (v0.2)
//
// Usage:
//   psyche init <dir> [--mbti TYPE] [--name NAME] [--lang LOCALE] [--mode MODE] [--traits "O:80,C:40,E:90,A:60,N:30"] [--no-persist]
//   psyche status <dir> [--json] [--user ID]
//   psyche inject <dir> [--protocol] [--json] [--lang LOCALE] [--user ID]
//   psyche decay <dir>
//   psyche update <dir> '{"order":80,"flow":65}' [--user ID]
//   psyche mode <dir> <natural|work|companion>
//   psyche intensity              Show info about personality intensity config
//   psyche reset <dir> [--full]
//   psyche diagnose <dir> [--github]
//   psyche upgrade [--check]
//   psyche probe [--json]
//   psyche profiles [--json] [--mbti TYPE]
//   psyche emit <dir> [--json] [--user ID]    Derive Thronglets exports and output to stdout
//   psyche setup [--name NAME] [--mbti TYPE] [--locale LOCALE] [--proxy --target URL] [--dry-run]
//   psyche mcp [--mbti TYPE] [--name NAME]   Start MCP server (stdio)
// ============================================================

import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir, access, rename, rm } from "node:fs/promises";
import {
  loadState,
  saveState,
  decayAndSave,
  initializeState,
  mergeUpdates,
  generatePsycheMd,
  getRelationship,
} from "./psyche-file.js";
import type { Logger } from "./psyche-file.js";
import { describeEmotionalState, getExpressionHint, detectEmotions } from "./chemistry.js";
import { generateReport, formatReport, toGitHubIssueBody } from "./diagnostics.js";
import type { SessionMetrics } from "./diagnostics.js";
import { getBaseline, getTemperament, getSensitivity, getDefaultSelfModel, traitsToBaseline } from "./profiles.js";
import { buildDynamicContext, buildProtocolContext } from "./prompt.js";
import type { AppraisalAxes } from "./types.js";
import { DEFAULT_RELATIONSHIP_USER_ID, resolveRelationshipUserId } from "./relationship-key.js";
import { t } from "./i18n.js";
import type { MBTIType, PsycheState, Locale, PsycheMode, PersonalityTraits } from "./types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DYADIC_FIELD, DIMENSION_KEYS, DIMENSION_NAMES_ZH, DRIVE_KEYS, DRIVE_NAMES_ZH } from "./types.js";
import { isMBTIType, isDimensionKey, isLocale } from "./guards.js";
import { getPackageVersion, selfUpdate } from "./update.js";
import { runRuntimeProbe } from "./runtime-probe.js";
import { defaultWorkspaceRoot } from "./storage.js";

// ── Logger ───────────────────────────────────────────────────

const cliLogger: Logger = {
  info: (msg: string) => console.error(`[info] ${msg}`),
  warn: (msg: string) => console.error(`[warn] ${msg}`),
  debug: () => {}, // silent in CLI unless DEBUG
};

// ── Helpers ──────────────────────────────────────────────────

function bar(value: number, width = 30): string {
  const filled = Math.round((value / 100) * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

function arrow(current: number, baseline: number): string {
  const delta = current - baseline;
  if (delta > 5) return "\u2191";
  if (delta < -5) return "\u2193";
  return "=";
}

function printState(state: PsycheState): void {
  const { current, baseline } = state;
  for (const key of DIMENSION_KEYS) {
    const val = Math.round(current[key]);
    const base = baseline[key];
    const a = arrow(val, base);
    const label = `${key}`.padEnd(10);
    const nameZh = DIMENSION_NAMES_ZH[key].padEnd(4);
    console.log(
      `  ${label} ${nameZh} ${bar(val)} ${String(val).padStart(3)} (base:${base} ${a})`,
    );
  }
}

function printDrives(state: PsycheState): void {
  const icons: Record<string, string> = { survival: "🛡️", safety: "🏠", connection: "🤝", esteem: "⭐", curiosity: "🔍" };
  for (const key of DRIVE_KEYS) {
    const val = Math.round(state.drives[key]);
    const icon = icons[key] ?? "·";
    const status = val >= 60 ? "🟢" : val >= 40 ? "🟡" : "🔴";
    const nameZh = DRIVE_NAMES_ZH[key].padEnd(6);
    console.log(`  ${icon} ${nameZh} ${bar(val, 20)} ${String(val).padStart(3)} ${status}`);
  }
}

function printEmotions(state: PsycheState): void {
  const emotions = detectEmotions(state.current);
  if (emotions.length > 0) {
    const names = emotions.map((e) => e.nameZh).join("、");
    console.log(`  涌现情绪: ${names}`);
  } else {
    console.log(`  涌现情绪: 平静`);
  }
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ── Commands ─────────────────────────────────────────────────

async function cmdInit(dir: string, mbti?: string, name?: string, lang?: string, mode?: string, traits?: string, _noPersist?: boolean): Promise<void> {
  const absDir = resolve(dir);

  const opts: { mbti?: MBTIType; name?: string; locale?: Locale } = {};
  if (mbti) {
    const upper = mbti.toUpperCase();
    if (!isMBTIType(upper)) die(`invalid MBTI type: ${mbti}. Valid: INTJ, INTP, ENTJ, ...`);
    opts.mbti = upper as MBTIType;
  }
  if (name) opts.name = name;
  if (lang) {
    if (!isLocale(lang)) die(`invalid locale: ${lang}. Valid: zh, en`);
    opts.locale = lang as Locale;
  }

  if (mode) {
    const validModes = ["natural", "work", "companion"];
    if (!validModes.includes(mode)) die(`invalid mode: ${mode}. Valid: ${validModes.join(", ")}`);
  }

  // Parse traits string like "O:80,C:40,E:90,A:60,N:30"
  let parsedTraits: PersonalityTraits | undefined;
  if (traits) {
    const traitMap: Record<string, keyof PersonalityTraits> = {
      O: "openness", C: "conscientiousness", E: "extraversion", A: "agreeableness", N: "neuroticism",
    };
    const parsed: Partial<PersonalityTraits> = {};
    for (const pair of traits.split(",")) {
      const [key, val] = pair.trim().split(":");
      const traitKey = traitMap[key?.toUpperCase()];
      if (!traitKey) die(`invalid trait key: ${key}. Valid: O, C, E, A, N`);
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0 || num > 100) die(`trait value must be 0-100: ${val}`);
      parsed[traitKey] = num;
    }
    if (Object.keys(parsed).length !== 5) die("all 5 traits required: O, C, E, A, N");
    parsedTraits = parsed as PersonalityTraits;
  }

  const state = await initializeState(absDir, opts, cliLogger);

  // Apply parsed traits to override baseline
  if (parsedTraits) {
    const { baseline } = traitsToBaseline(parsedTraits);
    state.baseline = baseline;
    state.current = { ...baseline };
    await saveState(absDir, state);
    await generatePsycheMd(absDir, state);
  }

  // Apply mode after initialization
  if (mode) {
    state.meta.mode = mode as PsycheMode;
    await saveState(absDir, state);
  }

  console.log(`\nPsyche initialized for ${state.meta.agentName}${state.mbti ? ` (preset: ${state.mbti})` : ""}\n`);
  printState(state);
  console.log(`\nFiles created:`);
  console.log(`  ${absDir}/psyche-state.json`);
  console.log(`  ${absDir}/PSYCHE.md`);
  console.log(`\nPSYCHE.md contains the full protocol. Drop it into any agent's context.`);
}

async function cmdStatus(dir: string, json: boolean, userId?: string): Promise<void> {
  const absDir = resolve(dir);
  const state = await loadState(absDir, cliLogger);
  const locale = state.meta.locale ?? "zh";
  const relationship = getRelationship(state, userId);

  if (json) {
    const emotion = describeEmotionalState(state.current, locale);
    const hint = getExpressionHint(state.current, locale);
    console.log(JSON.stringify({
      ...state,
      _derived: { emotion, expressionHint: hint },
      _activeRelationship: { userId: resolveRelationshipUserId(userId), ...relationship },
    }, null, 2));
    return;
  }

  const emotion = describeEmotionalState(state.current, locale);
  const hint = getExpressionHint(state.current, locale);
  const elapsed = ((Date.now() - new Date(state.updatedAt).getTime()) / 60000).toFixed(1);

  const baselineSummary = [
    state.baseline.flow < 55 ? "introvert" : "extrovert",
    state.baseline.flow > state.baseline.order ? "intuitive" : "sensing",
    state.baseline.resonance >= 50 ? "feeling" : "thinking",
  ].join("/");
  console.log(`\n${state.meta.agentName} (${baselineSummary}) — ${emotion}\n`);
  printState(state);

  console.log();
  printDrives(state);
  printEmotions(state);
  console.log(`  Mode: ${state.meta.mode ?? "natural"} — ${t(`mode.${state.meta.mode ?? "natural"}`, locale)}`);

  console.log(`\n  Expression: ${hint}`);
  console.log(`  Relationship (${resolveRelationshipUserId(userId)}): trust ${relationship.trust}, intimacy ${relationship.intimacy} (${relationship.phase})`);
  console.log(`  Interactions: ${state.meta.totalInteractions}`);
  console.log(`  Agreement streak: ${state.agreementStreak}`);
  console.log(`  Last update: ${elapsed} min ago`);

  if (state.empathyLog) {
    console.log(`\n  Last empathy:`);
    console.log(`    User state: ${state.empathyLog.userState}`);
    console.log(`    Projected:  ${state.empathyLog.projectedFeeling}`);
    console.log(`    Resonance:  ${state.empathyLog.resonance}`);
  }

  // Show all tracked relationships
  const relKeys = Object.keys(state.relationships);
  if (relKeys.length > 1) {
    console.log(`\n  Relationships:`);
    for (const k of relKeys) {
      const r = state.relationships[k];
      console.log(`    ${k}: trust ${r.trust}, intimacy ${r.intimacy} (${r.phase})`);
    }
  }
  console.log();
}

async function cmdInject(dir: string, protocol: boolean, json: boolean, lang?: string, userId?: string): Promise<void> {
  const absDir = resolve(dir);
  const state = await decayAndSave(absDir, await loadState(absDir, cliLogger));
  const locale: Locale = lang && isLocale(lang) ? lang as Locale : (state.meta.locale ?? "zh");
  const dynamic = buildDynamicContext(state, userId);

  if (json) {
    const output: Record<string, string> = { dynamic };
    if (protocol) output.protocol = buildProtocolContext(locale);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (protocol) {
    console.log(buildProtocolContext(locale));
    console.log("\n---\n");
  }
  console.log(dynamic);
}

async function cmdDecay(dir: string): Promise<void> {
  const absDir = resolve(dir);
  const before = await loadState(absDir, cliLogger);
  const after = await decayAndSave(absDir, before);

  const elapsed = ((Date.now() - new Date(before.updatedAt).getTime()) / 60000).toFixed(1);
  console.log(`\nDecay applied (${elapsed} min elapsed)\n`);

  for (const key of DIMENSION_KEYS) {
    const bVal = Math.round(before.current[key]);
    const aVal = Math.round(after.current[key]);
    if (bVal !== aVal) {
      console.log(`  ${key}: ${bVal} → ${aVal}`);
    }
  }
  console.log();
}

async function cmdUpdate(dir: string, updateJson: string, userId?: string): Promise<void> {
  const absDir = resolve(dir);
  const state = await loadState(absDir, cliLogger);

  let parsed: Record<string, number>;
  try {
    parsed = JSON.parse(updateJson);
  } catch {
    die(`invalid JSON: ${updateJson}`);
  }

  // Validate keys using type guard
  for (const key of Object.keys(parsed)) {
    if (!isDimensionKey(key)) {
      die(`unknown dimension key: ${key}. Valid: ${DIMENSION_KEYS.join(", ")}`);
    }
  }

  const updates = { current: parsed as unknown as PsycheState["current"] };
  const merged = mergeUpdates(state, updates, 25, userId);
  await saveState(absDir, merged);

  console.log(`\nState updated for ${merged.meta.agentName}\n`);
  printState(merged);
  console.log();
}

async function cmdReset(dir: string, full: boolean): Promise<void> {
  const absDir = resolve(dir);
  const state = await loadState(absDir, cliLogger);

  state.current = { ...state.baseline };
  state.drives = { survival: 80, safety: 70, connection: 60, esteem: 60, curiosity: 70 };
  state.updatedAt = new Date().toISOString();
  state.empathyLog = null;
  state.agreementStreak = 0;
  state.lastDisagreement = null;
  state.stateHistory = [];

  if (full) {
    state.relationships = { [DEFAULT_RELATIONSHIP_USER_ID]: { trust: 50, intimacy: 30, phase: "acquaintance" } };
  }

  await saveState(absDir, state);
  await generatePsycheMd(absDir, state);

  console.log(`\n${state.meta.agentName} reset to baseline${full ? " [full reset including relationships]" : ""}\n`);
  printState(state);
  console.log();
}

function cmdProfiles(json: boolean, mbti?: string): void {
  if (mbti) {
    const upper = mbti.toUpperCase();
    if (!isMBTIType(upper)) die(`invalid MBTI type: ${mbti}`);

    const mbtiType = upper as MBTIType;
    const baseline = getBaseline(mbtiType);
    const temperament = getTemperament(mbtiType);
    const sensitivity = getSensitivity(mbtiType);
    const selfModel = getDefaultSelfModel(mbtiType);

    if (json) {
      console.log(JSON.stringify({ mbti: upper, baseline, sensitivity, temperament, selfModel }, null, 2));
      return;
    }

    console.log(`\n${upper} — ${temperament}\n`);
    console.log(`  Sensitivity: ${sensitivity}`);
    for (const key of DIMENSION_KEYS) {
      const val = baseline[key];
      const label = `${key}`.padEnd(10);
      const nameZh = DIMENSION_NAMES_ZH[key].padEnd(4);
      console.log(`  ${label} ${nameZh} ${bar(val)} ${val}`);
    }
    console.log(`\n  Values: ${selfModel.values.join(", ")}`);
    console.log(`  Boundaries: ${selfModel.boundaries.join(", ")}`);
    console.log();
    return;
  }

  // List all profiles
  const ALL_MBTI: MBTIType[] = [
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
  ];

  if (json) {
    const all = ALL_MBTI.map((t) => ({
      mbti: t,
      baseline: getBaseline(t),
      sensitivity: getSensitivity(t),
      temperament: getTemperament(t),
    }));
    console.log(JSON.stringify(all, null, 2));
    return;
  }

  console.log("\n16 MBTI Personality Profiles\n");
  const groups = [
    { name: "Analysts (NT)", types: ["INTJ", "INTP", "ENTJ", "ENTP"] },
    { name: "Diplomats (NF)", types: ["INFJ", "INFP", "ENFJ", "ENFP"] },
    { name: "Sentinels (SJ)", types: ["ISTJ", "ISFJ", "ESTJ", "ESFJ"] },
    { name: "Explorers (SP)", types: ["ISTP", "ISFP", "ESTP", "ESFP"] },
  ];

  for (const group of groups) {
    console.log(`  ${group.name}:`);
    for (const t of group.types) {
      const mbtiType = t as MBTIType;
      const bl = getBaseline(mbtiType);
      const temperament = getTemperament(mbtiType);
      const sens = getSensitivity(mbtiType);
      console.log(
        `    ${t}  order:${String(bl.order).padStart(2)} flow:${String(bl.flow).padStart(2)} ` +
        `boundary:${String(bl.boundary).padStart(2)} resonance:${String(bl.resonance).padStart(2)}  ` +
        `sens:${sens}  ${temperament.slice(0, 30)}...`,
      );
    }
    console.log();
  }
}

async function cmdMode(dir: string, newMode: string): Promise<void> {
  const absDir = resolve(dir);
  const validModes = ["natural", "work", "companion"];
  if (!validModes.includes(newMode)) die(`invalid mode: ${newMode}. Valid: ${validModes.join(", ")}`);

  const state = await loadState(absDir, cliLogger);
  state.meta.mode = newMode as PsycheMode;
  await saveState(absDir, state);

  console.log(`\n${state.meta.agentName} mode set to: ${newMode}\n`);
}

function cmdIntensity(): void {
  console.log(`
Personality intensity controls how strongly Psyche affects AI behavior.

  0.0 = Traditional warm AI (no emotional variation)
  0.5 = Subtle emotional responses
  0.7 = Default
  1.0 = Full Psyche experience

Set via PsycheEngine config:
  new PsycheEngine({ personalityIntensity: 0.7 }, storage)

Or in OpenClaw plugin config:
  { "personalityIntensity": 0.7 }
`);
}

async function cmdDiagnose(dir: string, github: boolean): Promise<void> {
  const absDir = resolve(dir);
  const state = await loadState(absDir, cliLogger);

  // Try to load last session metrics from diagnostics.jsonl
  const logPath = resolve(absDir, "diagnostics.jsonl");
  let lastMetrics: SessionMetrics | null = null;
  try {
    const logContent = await readFile(logPath, "utf-8");
    const lines = logContent.trim().split("\n").filter(Boolean);
    if (lines.length > 0) {
      const lastEntry = JSON.parse(lines[lines.length - 1]);
      // Reconstruct partial metrics from log entry
      lastMetrics = {
        inputCount: lastEntry.inputs ?? 0,
        classifiedCount: Math.round((lastEntry.classifyRate ?? 0) * (lastEntry.inputs ?? 0)),
        appraisalHitCount: Math.round((lastEntry.appraisalRate ?? 0) * (lastEntry.inputs ?? 0)),
        semanticHitCount: Math.round((lastEntry.recognitionRate ?? lastEntry.classifyRate ?? 0) * (lastEntry.inputs ?? 0)),
        stimulusDistribution: {},
        avgConfidence: lastEntry.classifyRate ?? 0,
        totalChemistryDelta: lastEntry.chemDelta ?? 0,
        maxChemistryDelta: 0,
        errors: [],
        startedAt: lastEntry.t ?? new Date().toISOString(),
        lastActivityAt: lastEntry.t ?? new Date().toISOString(),
      };
    }
  } catch {
    // No log file yet — that's fine
  }

  // Build metrics (use last session or empty)
  const metrics: SessionMetrics = lastMetrics ?? {
    inputCount: 0,
    classifiedCount: 0,
    appraisalHitCount: 0,
    semanticHitCount: 0,
    stimulusDistribution: {},
    avgConfidence: 0,
    totalChemistryDelta: 0,
    maxChemistryDelta: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  const report = generateReport(state, metrics, await getPackageVersion());

  if (github) {
    console.log(toGitHubIssueBody(report));
  } else {
    console.log("\n" + formatReport(report) + "\n");

    // Show log history summary if available
    try {
      const logContent = await readFile(logPath, "utf-8");
      const lines = logContent.trim().split("\n").filter(Boolean);
      if (lines.length > 1) {
        console.log(`  ${lines.length} session(s) logged in diagnostics.jsonl\n`);
      }
    } catch {
      console.log("  No diagnostics.jsonl yet — will be created after first OpenClaw session.\n");
    }
  }
}

async function cmdUpgrade(checkOnly: boolean): Promise<void> {
  const result = await selfUpdate({ checkOnly });
  console.log(result.message);
}

function summarizeProbeAppraisal(appraisal: AppraisalAxes | null | undefined): string {
  if (!appraisal) return "null";
  const top = Object.entries(appraisal)
    .filter(([, value]) => value > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  if (top.length === 0) return "none";
  return top.map(([axis, value]) => `${axis}=${value.toFixed(2)}`).join(", ");
}

async function cmdProbe(json: boolean): Promise<void> {
  const result = await runRuntimeProbe();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.ok) {
    console.log("\nPsyche runtime probe: FAILED\n");
    console.log(`  version: ${result.version}`);
    console.log(`  entry: ${result.entry}`);
    console.log(`  load path: ${result.loadPath}`);
    console.log(`  module path: ${result.modulePath}`);
    console.log(`  cli path: ${result.cliPath}`);
    console.log(`  error: ${result.error ?? "unknown error"}`);
    return;
  }

  console.log("\nPsyche runtime probe: OK\n");
  console.log(`  version: ${result.version}`);
  console.log(`  entry: ${result.entry}`);
  console.log(`  load path: ${result.loadPath}`);
  console.log(`  module path: ${result.modulePath}`);
  console.log(`  cli path: ${result.cliPath}`);
  console.log(
    `  processInput: ok (appraisal=${summarizeProbeAppraisal(result.appraisal)}, legacyStimulus=${result.legacyStimulus ?? "null"})`,
  );
  console.log(`  processOutput: ok (stateChanged=${String(result.stateChanged)})`);
  console.log(`  replyEnvelope: ${result.canonicalHostSurface ? "present" : "missing"}`);
  console.log(`  externalContinuity: ${result.externalContinuityAvailable ? "present" : "missing"}`);
  if (result.trajectory) {
    console.log(
      `  trajectory: ${result.trajectory.kind ?? "none"} (${result.trajectory.description ?? "no sustained motion detected"})`,
    );
  }
  if (result.degradation) {
    console.log(
      `  degradation: subjective=${result.degradation.subjectiveStatus}, delegate=${result.degradation.delegateStatus}, issues=${result.degradation.issueCount}`,
    );
  }
  if (result.boundaryStress) {
    console.log(
      `  boundaryStress: delta=${result.boundaryStress.boundaryDelta.toFixed(2)}, peakDyadic=${result.boundaryStress.peakDyadicBoundaryPressure.toFixed(2)}`,
    );
  }
}

// ── Usage ────────────────────────────────────────────────────

// ── Setup ───────────────────────────────────────────────────
// Auto-detect MCP clients and inject psyche-mcp config.

interface MCPTarget {
  name: string;
  configPath: string;
  format: "json" | "codex_toml";
  mcpKey?: string; // key in JSON where mcpServers lives
}

function getMCPTargets(): MCPTarget[] {
  const home = homedir();
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";

  const targets: MCPTarget[] = [];

  // Claude Desktop
  if (isMac) {
    targets.push({
      name: "Claude Desktop",
      configPath: join(home, "Library/Application Support/Claude/claude_desktop_config.json"),
      format: "json",
      mcpKey: "mcpServers",
    });
  } else if (isWin) {
    targets.push({
      name: "Claude Desktop",
      configPath: join(process.env.APPDATA ?? join(home, "AppData/Roaming"), "Claude/claude_desktop_config.json"),
      format: "json",
      mcpKey: "mcpServers",
    });
  }

  // Cursor
  targets.push({
    name: "Cursor",
    configPath: join(home, ".cursor/mcp.json"),
    format: "json",
    mcpKey: "mcpServers",
  });

  // Claude Code
  targets.push({
    name: "Claude Code",
    configPath: join(home, ".claude/settings.json"),
    format: "json",
    mcpKey: "mcpServers",
  });

  // Windsurf
  targets.push({
    name: "Windsurf",
    configPath: join(home, ".windsurf/mcp.json"),
    format: "json",
    mcpKey: "mcpServers",
  });

  targets.push({
    name: "Codex",
    configPath: join(home, ".codex/config.toml"),
    format: "codex_toml",
  });

  return targets;
}

function escapeTomlString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function renderTomlStringArray(values: string[]): string {
  if (values.length === 0) return "[]";
  return `[\n${values.map((value) => `  "${escapeTomlString(value)}",`).join("\n")}\n]`;
}

function parseTomlAssignmentKey(line: string): string | null {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
  return match?.[1] ?? null;
}

type TomlEntry = { key: string | null; lines: string[] };

type TomlContinuationState = {
  bracketDepth: number;
  braceDepth: number;
  inMultilineBasicString: boolean;
  inMultilineLiteralString: boolean;
};

function scanTomlContinuationState(
  text: string,
  state: TomlContinuationState,
): TomlContinuationState {
  let i = 0;
  let inBasicString = false;
  let inLiteralString = false;
  let escaped = false;

  while (i < text.length) {
    const rest = text.slice(i);

    if (state.inMultilineBasicString) {
      if (rest.startsWith('"""')) {
        state.inMultilineBasicString = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }

    if (state.inMultilineLiteralString) {
      if (rest.startsWith("'''")) {
        state.inMultilineLiteralString = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }

    const ch = text[i];

    if (inBasicString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inBasicString = false;
      }
      i += 1;
      continue;
    }

    if (inLiteralString) {
      if (ch === "'") {
        inLiteralString = false;
      }
      i += 1;
      continue;
    }

    if (ch === "#") {
      break;
    }

    if (rest.startsWith('"""')) {
      state.inMultilineBasicString = true;
      i += 3;
      continue;
    }

    if (rest.startsWith("'''")) {
      state.inMultilineLiteralString = true;
      i += 3;
      continue;
    }

    if (ch === '"') {
      inBasicString = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inLiteralString = true;
      i += 1;
      continue;
    }

    if (ch === "[") {
      state.bracketDepth += 1;
    } else if (ch === "]") {
      state.bracketDepth = Math.max(0, state.bracketDepth - 1);
    } else if (ch === "{") {
      state.braceDepth += 1;
    } else if (ch === "}") {
      state.braceDepth = Math.max(0, state.braceDepth - 1);
    }

    i += 1;
  }

  return state;
}

function collectTomlEntries(lines: string[]): TomlEntry[] {
  const entries: TomlEntry[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i] ?? "";
    const key = parseTomlAssignmentKey(line);
    if (!key) {
      entries.push({ key: null, lines: [line] });
      i += 1;
      continue;
    }

    const value = line.split("=", 2)[1] ?? "";
    const state: TomlContinuationState = {
      bracketDepth: 0,
      braceDepth: 0,
      inMultilineBasicString: false,
      inMultilineLiteralString: false,
    };
    const entryLines = [line];
    scanTomlContinuationState(value, state);

    while (
      i + 1 < lines.length &&
      (state.bracketDepth > 0 ||
        state.braceDepth > 0 ||
        state.inMultilineBasicString ||
        state.inMultilineLiteralString)
    ) {
      i += 1;
      const nextLine = lines[i] ?? "";
      entryLines.push(nextLine);
      scanTomlContinuationState(nextLine, state);
    }

    entries.push({ key, lines: entryLines });
    i += 1;
  }
  return entries;
}

function filterTomlAssignments(lines: string[], blockedKeys: Set<string>): string[] {
  return collectTomlEntries(lines)
    .filter((entry) => !entry.key || !blockedKeys.has(entry.key))
    .flatMap((entry) => entry.lines);
}

function renderCodexMcpServer(
  serverId: string,
  entry: { command: string; args: string[]; env: Record<string, string> },
  existing?: { serverLines: string[]; envLines: string[] },
): string {
  const serverExtras = filterTomlAssignments(existing?.serverLines ?? [], new Set(["command", "args"]));
  const lines = [
    `[mcp_servers.${serverId}]`,
    `command = "${escapeTomlString(entry.command)}"`,
    `args = ${renderTomlStringArray(entry.args)}`,
    ...serverExtras,
  ];
  const envExtras = filterTomlAssignments(
    existing?.envLines ?? [],
    new Set(Object.keys(entry.env)),
  );
  const envEntries = Object.entries(entry.env);
  if (envEntries.length > 0 || envExtras.length > 0) {
    lines.push("", `[mcp_servers.${serverId}.env]`);
    lines.push(...envExtras);
    for (const [key, value] of envEntries) {
      lines.push(`${key} = "${escapeTomlString(value)}"`);
    }
  }
  return lines.join("\n");
}

function upsertCodexMcpServer(content: string, serverId: string, entry: { command: string; args: string[]; env: Record<string, string> }): { content: string; changed: boolean } {
  const normalized = content.replaceAll("\r\n", "\n");
  const lines = normalized === "" ? [] : normalized.split("\n");
  const kept: string[] = [];
  const existing = { serverLines: [] as string[], envLines: [] as string[] };

  for (let i = 0; i < lines.length;) {
    const match = lines[i]?.match(/^\[(.+)\]\s*$/);
    const section = match?.[1];
    if (section === `mcp_servers.${serverId}` || section === `mcp_servers.${serverId}.env`) {
      let currentSection = section;
      i += 1;
      while (i < lines.length) {
        const nextMatch = lines[i]?.match(/^\[(.+)\]\s*$/);
        const nextSection = nextMatch?.[1];
        if (nextSection) {
          if (nextSection === `mcp_servers.${serverId}` || nextSection === `mcp_servers.${serverId}.env`) {
            currentSection = nextSection;
            i += 1;
            continue;
          }
          break;
        }
        const target = currentSection.endsWith(".env") ? existing.envLines : existing.serverLines;
        target.push(lines[i] ?? "");
        i += 1;
      }
      continue;
    }

    kept.push(lines[i]);
    i += 1;
  }

  const trimmed = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const block = renderCodexMcpServer(serverId, entry, existing);
  const next = trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  return { content: next, changed: next !== normalized };
}

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function writeTextAtomic(path: string, content: string): Promise<void> {
  const absPath = resolve(path);
  const dir = resolve(absPath, "..");
  await mkdir(dir, { recursive: true });
  const base = absPath.split("/").pop() ?? "file";
  const tmpPath = join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  await writeFile(tmpPath, content, "utf-8");
  try {
    await rename(tmpPath, absPath);
  } catch (error: any) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") {
      try { await rm(tmpPath, { force: true }); } catch { /* noop */ }
      throw error;
    }
    await rm(absPath, { force: true });
    await rename(tmpPath, absPath);
  }
}

async function cmdSetup(opts: {
  name: string; mbti: string; locale: string;
  proxy: boolean; target: string; port: number;
  dryRun: boolean;
}): Promise<void> {
  const { name, mbti, locale, proxy, target, port, dryRun } = opts;
  const env: Record<string, string> = {};
  env.PSYCHE_WORKSPACE = defaultWorkspaceRoot("mcp");
  if (name) env.PSYCHE_NAME = name;
  if (mbti) env.PSYCHE_MBTI = mbti.toUpperCase();
  if (locale) env.PSYCHE_LOCALE = locale;

  let actions = 0;

  // ── 1. MCP clients ────────────────────────────────────
  const mcpEntry = { command: "npx", args: ["-y", "psyche-ai", "mcp"], env };
  const { execFileSync } = await import("node:child_process");

  // Claude Code — use `claude mcp add` for hot-reload (no restart needed)
  let claudeCodeDone = false;
  try {
    const out = execFileSync("claude", ["mcp", "list"], { encoding: "utf-8", timeout: 5000 });
    if (out.includes("psyche")) {
      console.log("  ✓ Claude Code — already configured");
      claudeCodeDone = true;
    } else if (dryRun) {
      console.log("  → Claude Code — would configure via `claude mcp add`");
      claudeCodeDone = true; actions++;
    } else {
      const addArgs = [
        "mcp",
        "add",
        "-s",
        "user",
        "psyche",
        "-e",
        "PSYCHE_WORKSPACE=" + env.PSYCHE_WORKSPACE,
        "-e",
        "PSYCHE_LOCALE=" + (locale || "zh"),
      ];
      if (name) addArgs.push("-e", "PSYCHE_NAME=" + name);
      if (mbti) addArgs.push("-e", "PSYCHE_MBTI=" + mbti.toUpperCase());
      addArgs.push("--", "npx", "-y", "psyche-ai", "mcp");
      execFileSync("claude", addArgs, { encoding: "utf-8", timeout: 10000 });
      console.log("  ✓ Claude Code — configured (live, no restart needed)");
      claudeCodeDone = true; actions++;
    }
  } catch { /* claude CLI not available, fall through to JSON method */ }

  // Other clients — edit config JSON
  for (const t of getMCPTargets()) {
    if (claudeCodeDone && t.name === "Claude Code") continue;

    const dir = resolve(t.configPath, "..");
    if (!(await fileExists(dir))) continue;

    if (t.format === "codex_toml") {
      const existing = await fileExists(t.configPath) ? await readFile(t.configPath, "utf-8") : "";
      const result = upsertCodexMcpServer(existing, "psyche", mcpEntry);
      if (!result.changed) { console.log(`  ✓ ${t.name} — already configured`); continue; }

      if (dryRun) { console.log(`  → ${t.name} — would configure`); actions++; continue; }

      await writeTextAtomic(t.configPath, result.content);
      console.log(`  ✓ ${t.name} (restart to activate)`);
      actions++;
      continue;
    }

    const mcpKey = t.mcpKey;
    if (!mcpKey) continue;

    let cfg: Record<string, any> = {};
    if (await fileExists(t.configPath)) {
      try { cfg = JSON.parse(await readFile(t.configPath, "utf-8")); } catch { /* fresh */ }
    }

    const servers = cfg[mcpKey] ?? {};
    if (servers["psyche"]) { console.log(`  ✓ ${t.name} — already configured`); continue; }

    servers["psyche"] = mcpEntry;
    cfg[mcpKey] = servers;

    if (dryRun) { console.log(`  → ${t.name} — would configure`); actions++; continue; }

    await writeTextAtomic(t.configPath, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`  ✓ ${t.name} (restart to activate)`);
    actions++;
  }

  // ── 2. Proxy + env var ────────────────────────────────
  if (proxy && target) {
    const proxyUrl = `http://127.0.0.1:${port}/v1`;
    const shell = process.env.SHELL ?? "/bin/zsh";
    const rcFile = shell.includes("zsh") ? join(homedir(), ".zshrc")
                 : shell.includes("bash") ? join(homedir(), ".bashrc")
                 : null;

    // Determine which env var to set based on target URL
    const envVar = target.includes("anthropic") ? "ANTHROPIC_BASE_URL" : "OPENAI_BASE_URL";
    const exportLine = `export ${envVar}="${proxyUrl}" # psyche-proxy`;

    // Build proxy launch command
    const proxyArgs = [`-t`, target, `-p`, String(port)];
    if (name) proxyArgs.push(`-n`, name);
    if (mbti) proxyArgs.push(`--mbti`, mbti.toUpperCase());
    if (locale) proxyArgs.push(`-l`, locale);
    const launchCmd = `npx psyche-proxy ${proxyArgs.join(" ")}`;

    if (dryRun) {
      console.log(`  → proxy — would start: ${launchCmd}`);
      if (rcFile) console.log(`  → shell — would append to ${rcFile}: ${exportLine}`);
      actions++;
    } else {
      // Append env var to shell rc (idempotent)
      if (rcFile) {
        const rc = await fileExists(rcFile) ? await readFile(rcFile, "utf-8") : "";
        if (!rc.includes("# psyche-proxy")) {
          await writeTextAtomic(rcFile, rc + (rc.endsWith("\n") ? "" : "\n") + exportLine + "\n");
          console.log(`  ✓ ${envVar} → ${proxyUrl} (${rcFile})`);
        } else {
          console.log(`  ✓ shell env — already configured`);
        }
      }

      // Start proxy in background
      const { spawn } = await import("node:child_process");
      const child = spawn("npx", ["-y", "psyche-proxy", ...proxyArgs], {
        detached: true, stdio: "ignore",
      });
      child.unref();
      console.log(`  ✓ proxy — pid ${child.pid} → ${target}`);
      actions++;
    }
  }

  // ── Summary ───────────────────────────────────────────
  if (actions === 0) {
    console.log("  Nothing to do. All targets already configured.");
  } else if (!dryRun) {
    console.log("\nDone. Claude Code is live. Other MCP clients need restart.");
  }
}

// ── Thronglets export bridge ────────────────────────────────

async function cmdEmit(dir: string, json: boolean, userId?: string): Promise<void> {
  const absDir = resolve(dir);
  const state = await loadState(absDir, cliLogger);
  if (!state) process.exit(0); // no state → silent exit (hook-safe)

  const key = resolveRelationshipUserId(userId);
  const relationship = state.relationships[key] ?? DEFAULT_RELATIONSHIP;
  const field = state.dyadicFields?.[key] ?? DEFAULT_DYADIC_FIELD;
  const pendingSignals = state.pendingRelationSignals?.[key] ?? [];

  const { deriveThrongletsExports } = await import("./thronglets-export.js");
  const result = deriveThrongletsExports(state, {
    relationContext: { key, relationship, field, pendingSignals },
    sessionBridge: null, // not persisted — continuity-anchor exports only via MCP
    writebackFeedback: state.lastWritebackFeedback ?? [],
    now: new Date().toISOString(),
  });

  // Save updated dedup state so repeated calls don't re-emit
  if (result.exports.length > 0) {
    await saveState(absDir, result.state);
  }

  if (json) {
    console.log(JSON.stringify({ throngletsExports: result.exports }));
  } else {
    if (result.exports.length === 0) {
      console.log("no new exports");
    } else {
      for (const exp of result.exports) {
        console.log(`  ${exp.kind}: ${exp.key}`);
      }
    }
  }
}

function usage(): void {
  console.log(`
psyche — Artificial Psyche CLI (v0.2)
Plug-and-play emotional intelligence for any AI agent.

Usage:
  psyche init <dir> [--mbti TYPE] [--name NAME] [--lang LOCALE] [--mode MODE] [--traits "O:80,C:40,..."] [--no-persist]
  psyche status <dir> [--json] [--user ID]
  psyche inject <dir> [--protocol] [--json] [--lang LOCALE] [--user ID]
  psyche decay <dir>
  psyche update <dir> '{"order":80,"flow":65}' [--user ID]
  psyche mode <dir> <natural|work|companion>
  psyche intensity              Show info about personality intensity config
  psyche reset <dir> [--full]
  psyche diagnose <dir> [--github]   Run health checks & show diagnostic report
  psyche emit <dir> [--json] [--user ID]   Derive Thronglets exports to stdout
  psyche mcp [--mbti TYPE] [--name NAME]   Start MCP server (stdio)
  psyche setup [--proxy -t URL] [-n NAME] [--mbti TYPE]  Auto-configure MCP + proxy
  psyche upgrade [--check]           Check/apply package updates safely
  psyche probe [--json]              Verify the runtime is truly callable
  psyche profiles [--mbti TYPE] [--json]

Options:
  --lang     Locale (zh or en, default: zh)
  --user     User ID for multi-user relationship tracking
  --json     Output as JSON

Examples:
  # Give your OpenClaw agent emotions
  psyche init ~/Desktop/OpenClaw/workspace-yu

  # Give Claude Code emotions (English)
  psyche init . --mbti ENFP --name Claude --lang en

  # Check how your agent is feeling
  psyche status ./workspace-yu

  # Check relationship with a specific user
  psyche status ./workspace-yu --user alice

  # Get the prompt text to inject into any AI system
  psyche inject ./workspace-yu --protocol --lang en

  # After a conversation, update the emotional state
  psyche update ./workspace-yu '{"order":70,"flow":85,"boundary":50,"resonance":65}'

  # See all 16 personality profiles
  psyche profiles
  psyche profiles --mbti ENFP

  # Auto-configure all MCP clients (one command, done)
  psyche setup
  psyche setup --name Luna

  # Universal proxy — works with any agent using OpenAI SDK
  psyche setup --proxy -t https://api.openai.com/v1

  # Check for new package versions without applying them
  psyche upgrade --check

  # Prove this environment can really call Psyche
  psyche probe --json
	`);
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    usage();
    return;
  }

  const command = args[0];
  const rest = args.slice(1);

  try {
    switch (command) {
      case "init": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            mbti: { type: "string" },
            name: { type: "string" },
            lang: { type: "string" },
            mode: { type: "string" },
            traits: { type: "string" },
            "no-persist": { type: "boolean", default: false },
          },
          allowPositionals: true,
        });
        if (positionals.length === 0) die("missing <dir> argument");
        await cmdInit(positionals[0], values.mbti, values.name, values.lang, values.mode, values.traits, values["no-persist"]);
        break;
      }

      case "status": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            json: { type: "boolean", default: false },
            user: { type: "string" },
          },
          allowPositionals: true,
        });
        if (positionals.length === 0) die("missing <dir> argument");
        await cmdStatus(positionals[0], values.json ?? false, values.user);
        break;
      }

      case "inject": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            json: { type: "boolean", default: false },
            protocol: { type: "boolean", default: false },
            lang: { type: "string" },
            user: { type: "string" },
          },
          allowPositionals: true,
        });
        if (positionals.length === 0) die("missing <dir> argument");
        await cmdInject(positionals[0], values.protocol ?? false, values.json ?? false, values.lang, values.user);
        break;
      }

      case "decay": {
        if (rest.length === 0) die("missing <dir> argument");
        await cmdDecay(rest[0]);
        break;
      }

      case "update": {
        const nonFlag = rest.filter((a) => !a.startsWith("--"));
        if (nonFlag.length < 2) die("usage: psyche update <dir> '{\"DA\":80}'");
        const { values } = parseArgs({
          args: rest.filter((a) => a.startsWith("--")),
          options: {
            user: { type: "string" },
          },
          allowPositionals: true,
        });
        await cmdUpdate(nonFlag[0], nonFlag[1], values.user);
        break;
      }

      case "reset": {
        const { values: resetVals, positionals: resetPos } = parseArgs({
          args: rest,
          options: {
            full: { type: "boolean", default: false },
          },
          allowPositionals: true,
        });
        if (resetPos.length === 0) die("missing <dir> argument");
        await cmdReset(resetPos[0], resetVals.full ?? false);
        break;
      }

      case "profiles": {
        const { values } = parseArgs({
          args: rest,
          options: {
            json: { type: "boolean", default: false },
            mbti: { type: "string" },
          },
          allowPositionals: true,
        });
        cmdProfiles(values.json ?? false, values.mbti);
        break;
      }

      case "diagnose": {
        const { values: diagVals, positionals: diagPos } = parseArgs({
          args: rest,
          options: {
            github: { type: "boolean", default: false },
          },
          allowPositionals: true,
        });
        if (diagPos.length === 0) die("missing <dir> argument");
        await cmdDiagnose(diagPos[0], diagVals.github ?? false);
        break;
      }

      case "mode": {
        if (rest.length < 2) die("usage: psyche mode <dir> <natural|work|companion>");
        await cmdMode(rest[0], rest[1]);
        break;
      }

      case "intensity": {
        cmdIntensity();
        break;
      }

      case "upgrade": {
        const { values } = parseArgs({
          args: rest,
          options: {
            check: { type: "boolean", default: false },
          },
          allowPositionals: true,
        });
        await cmdUpgrade(values.check ?? false);
        break;
      }

      case "probe": {
        const { values } = parseArgs({
          args: rest,
          options: {
            json: { type: "boolean", default: false },
          },
          allowPositionals: true,
        });
        await cmdProbe(values.json ?? false);
        break;
      }

      case "emit": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            json: { type: "boolean", default: false },
            user: { type: "string" },
          },
          allowPositionals: true,
        });
        const emitDir = positionals[0] ?? defaultWorkspaceRoot();
        await cmdEmit(emitDir, values.json ?? false, values.user as string | undefined);
        break;
      }

      case "mcp": {
        // Delegate to the MCP adapter through an explicit entrypoint.
        const { runMcpServer } = await import("./adapters/mcp.js");
        await runMcpServer();
        return;
      }

      case "setup": {
        const { values } = parseArgs({
          args: rest,
          options: {
            name: { type: "string", short: "n" },
            mbti: { type: "string" },
            locale: { type: "string", short: "l" },
            proxy: { type: "boolean", default: false },
            target: { type: "string", short: "t" },
            port: { type: "string", short: "p" },
            "dry-run": { type: "boolean", default: false },
          },
          allowPositionals: true,
        });
        console.log("\npsyche setup — auto-configuring MCP clients\n");
        await cmdSetup({
          name: (values.name as string) ?? "",
          mbti: (values.mbti as string) ?? "",
          locale: (values.locale as string) ?? "",
          proxy: values.proxy ?? false,
          target: (values.target as string) ?? "",
          port: parseInt((values.port as string) ?? "3340", 10),
          dryRun: values["dry-run"] ?? false,
        });
        break;
      }

      default:
        die(`unknown command: ${command}. Run 'psyche help' for usage.`);
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      die(`directory or state file not found. Run 'psyche init <dir>' first.`);
    }
    if (error.code === "EACCES" || error.code === "EPERM") {
      die(`permission denied: ${error.path ?? "unknown path"}`);
    }
    die(error.message ?? String(err));
  }
}

main();
