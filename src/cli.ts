#!/usr/bin/env node
// ============================================================
// psyche — Artificial Psyche CLI (v0.2)
//
// Usage:
//   psyche init <dir> [--mbti TYPE] [--name NAME] [--lang LOCALE] [--mode MODE] [--traits "O:80,C:40,E:90,A:60,N:30"] [--no-persist]
//   psyche status <dir> [--json] [--user ID]
//   psyche inject <dir> [--protocol] [--json] [--lang LOCALE] [--user ID]
//   psyche decay <dir>
//   psyche update <dir> '{"DA":80,"CORT":45}' [--user ID]
//   psyche mode <dir> <natural|work|companion>
//   psyche intensity              Show info about personality intensity config
//   psyche reset <dir> [--full]
//   psyche diagnose <dir> [--github]
//   psyche profiles [--json] [--mbti TYPE]
// ============================================================

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
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
import { runHealthCheck, generateReport, formatReport, toGitHubIssueBody, formatLogEntry } from "./diagnostics.js";
import type { SessionMetrics } from "./diagnostics.js";
import { getBaseline, getTemperament, getSensitivity, getDefaultSelfModel, traitsToBaseline } from "./profiles.js";
import { buildDynamicContext, buildProtocolContext } from "./prompt.js";
import { t } from "./i18n.js";
import type { MBTIType, PsycheState, Locale, PsycheMode, PersonalityTraits } from "./types.js";
import { CHEMICAL_KEYS, CHEMICAL_NAMES_ZH, DRIVE_KEYS, DRIVE_NAMES_ZH } from "./types.js";
import { isMBTIType, isChemicalKey, isLocale } from "./guards.js";
import { getPackageVersion } from "./update.js";

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

function printChemistry(state: PsycheState): void {
  const { current, baseline } = state;
  for (const key of CHEMICAL_KEYS) {
    const val = Math.round(current[key]);
    const base = baseline[key];
    const a = arrow(val, base);
    const label = `${key}`.padEnd(4);
    const nameZh = CHEMICAL_NAMES_ZH[key].padEnd(6);
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

async function cmdInit(dir: string, mbti?: string, name?: string, lang?: string, mode?: string, traits?: string, noPersist?: boolean): Promise<void> {
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

  console.log(`\nPsyche initialized for ${state.meta.agentName} (${state.mbti})\n`);
  printChemistry(state);
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
      _activeRelationship: { userId: userId ?? "_default", ...relationship },
    }, null, 2));
    return;
  }

  const emotion = describeEmotionalState(state.current, locale);
  const hint = getExpressionHint(state.current, locale);
  const elapsed = ((Date.now() - new Date(state.updatedAt).getTime()) / 60000).toFixed(1);

  console.log(`\n${state.meta.agentName} (${state.mbti}) — ${emotion}\n`);
  printChemistry(state);

  console.log();
  printDrives(state);
  printEmotions(state);
  console.log(`  Mode: ${state.meta.mode ?? "natural"} — ${t(`mode.${state.meta.mode ?? "natural"}`, locale)}`);

  console.log(`\n  Expression: ${hint}`);
  console.log(`  Relationship (${userId ?? "_default"}): trust ${relationship.trust}, intimacy ${relationship.intimacy} (${relationship.phase})`);
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

  for (const key of CHEMICAL_KEYS) {
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
    if (!isChemicalKey(key)) {
      die(`unknown chemical key: ${key}. Valid: ${CHEMICAL_KEYS.join(", ")}`);
    }
  }

  const updates = { current: parsed as unknown as PsycheState["current"] };
  const merged = mergeUpdates(state, updates, 25, userId);
  await saveState(absDir, merged);

  console.log(`\nChemistry updated for ${merged.meta.agentName}\n`);
  printChemistry(merged);
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
  state.emotionalHistory = [];

  if (full) {
    state.relationships = { _default: { trust: 50, intimacy: 30, phase: "acquaintance" } };
  }

  await saveState(absDir, state);
  await generatePsycheMd(absDir, state);

  console.log(`\n${state.meta.agentName} reset to baseline (${state.mbti})${full ? " [full reset including relationships]" : ""}\n`);
  printChemistry(state);
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
    for (const key of CHEMICAL_KEYS) {
      const val = baseline[key];
      const label = `${key}`.padEnd(4);
      const nameZh = CHEMICAL_NAMES_ZH[key].padEnd(6);
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
        `    ${t}  DA:${String(bl.DA).padStart(2)} HT:${String(bl.HT).padStart(2)} ` +
        `CORT:${String(bl.CORT).padStart(2)} OT:${String(bl.OT).padStart(2)} ` +
        `NE:${String(bl.NE).padStart(2)} END:${String(bl.END).padStart(2)}  ` +
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

// ── Usage ────────────────────────────────────────────────────

function usage(): void {
  console.log(`
psyche — Artificial Psyche CLI (v0.2)
Plug-and-play emotional intelligence for any AI agent.

Usage:
  psyche init <dir> [--mbti TYPE] [--name NAME] [--lang LOCALE] [--mode MODE] [--traits "O:80,C:40,..."] [--no-persist]
  psyche status <dir> [--json] [--user ID]
  psyche inject <dir> [--protocol] [--json] [--lang LOCALE] [--user ID]
  psyche decay <dir>
  psyche update <dir> '{"DA":80,"CORT":45}' [--user ID]
  psyche mode <dir> <natural|work|companion>
  psyche intensity              Show info about personality intensity config
  psyche reset <dir> [--full]
  psyche diagnose <dir> [--github]   Run health checks & show diagnostic report
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
  psyche update ./workspace-yu '{"DA":85,"CORT":20,"OT":70}'

  # See all 16 personality profiles
  psyche profiles
  psyche profiles --mbti ENFP
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
