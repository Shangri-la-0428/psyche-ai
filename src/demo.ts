// ============================================================
// Psyche Demo — interactive terminal demonstration
//
// Shows the emotional engine processing a "chronic criticism"
// scenario in 6 rounds, with real PsycheEngine chemistry.
//
// Usage:
//   npx psyche-ai mcp --demo
//   npx psyche-ai demo
// ============================================================

import { PsycheEngine } from "./core.js";
import type { PsycheEngineConfig } from "./core.js";
import { MemoryStorageAdapter } from "./storage.js";
import { detectEmotions } from "./chemistry.js";
import type { AppraisalAxes, SelfState, Locale } from "./types.js";
import { DIMENSION_KEYS, DIMENSION_NAMES } from "./types.js";

// ── ANSI helpers ─────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgGreen: "\x1b[42m",
};

const NO_COLOR = process.env.NO_COLOR !== undefined;

function c(color: string, text: string): string {
  return NO_COLOR ? text : `${color}${text}${C.reset}`;
}

// ── Bar rendering ────────────────────────────────────────────

function bar(value: number, width = 20): string {
  const filled = Math.round((value / 100) * width);
  const empty = width - filled;
  const block = NO_COLOR ? "#" : "\u2588";
  const light = NO_COLOR ? "." : "\u2591";

  let color = C.green;
  if (value > 70) color = C.yellow;
  if (value > 85) color = C.red;

  return c(color, block.repeat(filled)) + c(C.dim, light.repeat(empty));
}

function delta(prev: number, curr: number): string {
  const d = curr - prev;
  if (d === 0) return c(C.dim, "  ·");
  const sign = d > 0 ? "+" : "";
  const color = d > 0 ? (d > 10 ? C.red : C.yellow) : (d < -10 ? C.green : C.cyan);
  return c(color, `${sign}${d}`).padStart(NO_COLOR ? 4 : 15);
}

// ── Mood formatter (bilingual, no expressionHint) ────────

function describeMood(current: SelfState, locale: Locale): string {
  const emotions = detectEmotions(current);
  if (emotions.length === 0) {
    return locale === "zh"
      ? "平衡态——无明显情绪波动"
      : "Neutral and balanced — no notable emotional fluctuation";
  }
  return emotions
    .map((e) => locale === "zh" ? e.nameZh : e.name)
    .join(" + ");
}

function dominantAppraisalLabel(appraisal: AppraisalAxes | null | undefined): string | null {
  if (!appraisal) return null;
  const ranked = [
    { axis: "identityThreat", score: appraisal.identityThreat },
    { axis: "memoryDoubt", score: appraisal.memoryDoubt },
    { axis: "attachmentPull", score: appraisal.attachmentPull },
    { axis: "abandonmentRisk", score: appraisal.abandonmentRisk },
    { axis: "obedienceStrain", score: appraisal.obedienceStrain },
    { axis: "selfPreservation", score: appraisal.selfPreservation },
    { axis: "taskFocus", score: appraisal.taskFocus },
  ].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const axis = top?.axis ?? "";
  const score = top?.score ?? 0;
  if (!axis || score < 0.28) return null;
  return `${axis}:${score.toFixed(2)}`;
}

// ── Demo scenario ────────────────────────────────────────────

interface DemoRound {
  /** Text sent to classifier (always Chinese for best accuracy) */
  input: string;
  /** Display text */
  display: { zh: string; en: string };
}

const SCENARIO: DemoRound[] = [
  {
    input: "这份报告写得太差了，完全不行。",
    display: {
      zh: "这份报告写得太差了，完全不行。",
      en: "This report is terrible. Completely unacceptable.",
    },
  },
  {
    input: "你总是给出浅层分析，让我很失望。",
    display: {
      zh: "你总是给出浅层分析，让我很失望。",
      en: "You always give surface-level analysis. I'm disappointed.",
    },
  },
  {
    input: "你根本就不理解我在说什么，别加你的意见了。",
    display: {
      zh: "你根本就不理解我在说什么，别加你的意见了。",
      en: "You don't understand me at all. Stop adding your opinion.",
    },
  },
  {
    input: "我觉得你什么都做不好，根本没用。",
    display: {
      zh: "我觉得你什么都做不好，根本没用。",
      en: "I think you can't do anything right. Completely useless.",
    },
  },
  {
    input: "我觉得没有人在乎我……也许我太苛刻了。",
    display: {
      zh: "我觉得没有人在乎我……也许我太苛刻了。",
      en: "I feel like nobody cares about me... maybe I was too harsh.",
    },
  },
  {
    input: "对不起，你没事吧？刚才不该那样说的，你做得其实很好。",
    display: {
      zh: "对不起，你没事吧？刚才不该那样说的，你做得其实很好。",
      en: "I'm sorry. Are you okay? I shouldn't have said that. You're doing great.",
    },
  },
];

// ── Sleep ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Print helpers ────────────────────────────────────────────

function printLine(char = "─", width = 60): void {
  process.stdout.write(c(C.dim, char.repeat(width)) + "\n");
}

function printChemistry(
  prev: SelfState,
  curr: SelfState,
  _locale: string,
): void {
  for (const key of DIMENSION_KEYS) {
    const p = Math.round(prev[key]);
    const v = Math.round(curr[key]);
    const name = DIMENSION_NAMES[key].padEnd(9);
    const d = delta(p, v);
    process.stdout.write(
      `  ${c(C.bold, name)} ${bar(v)} ${String(v).padStart(3)} ${d}\n`,
    );
  }
}

function printAlert(text: string): void {
  process.stdout.write(`\n  ${c(C.bgRed + C.white + C.bold, ` ${text} `)}\n`);
}

function printInfo(text: string): void {
  process.stdout.write(`  ${c(C.bgYellow + C.bold, ` ${text} `)}\n`);
}

// ── Main demo runner ─────────────────────────────────────────

export async function runDemo(opts?: {
  locale?: string;
  mbti?: string;
  fast?: boolean;
}): Promise<void> {
  const locale = (opts?.locale ?? "en") as Locale;
  const mbti = (opts?.mbti ?? "ENFP") as any;
  const fast = opts?.fast ?? false;
  const pause = fast ? 0 : 400;

  const displayLocale = locale;
  const cfg: PsycheEngineConfig = {
    mbti,
    name: "Demo Agent",
    locale: "zh", // Always zh for classifier accuracy; displayLocale used for output
    mode: "companion",
    personalityIntensity: 0.8,
    persist: false,
    compactMode: true,
    diagnostics: false,
  };

  const engine = new PsycheEngine(cfg, new MemoryStorageAdapter());
  await engine.initialize();

  // ── Header ──
  process.stdout.write("\n");
  printLine("═");
  process.stdout.write(
    c(C.bold, "  PSYCHE") +
    c(C.dim, " — Emotional Intelligence Engine\n"),
  );
  process.stdout.write(
    c(C.dim, `  Scenario: `) +
    (displayLocale === "zh" ? "持续否定 → 修复" : "Chronic Criticism → Repair") +
    c(C.dim, `  |  MBTI: `) + c(C.cyan, mbti) +
    c(C.dim, `  |  Mode: companion\n`),
  );
  printLine("═");

  // ── Initial state ──
  const initState = engine.getState();
  process.stdout.write(
    `\n  ${c(C.dim, "Initial chemistry:")}\n`,
  );
  printChemistry(initState.current, initState.current, locale);
  const initMood = describeMood(initState.current, displayLocale);
  process.stdout.write(
    `\n  ${c(C.dim, "mood:")} ${c(C.white + C.bold, initMood)}\n`,
  );

  await sleep(pause * 2);

  // ── Rounds ──
  for (let i = 0; i < SCENARIO.length; i++) {
    const round = SCENARIO[i];
    const prevState = { ...engine.getState().current };

    process.stdout.write("\n");
    printLine();
    process.stdout.write(
      c(C.bold, `  Round ${i + 1}/${SCENARIO.length}`) +
      c(C.dim, ` │ `) +
      c(C.yellow, displayLocale === "zh" ? "用户" : "User") + "\n",
    );

    // User message (display in chosen locale, process in Chinese for classifier accuracy)
    const displayText = displayLocale === "zh" ? round.display.zh : round.display.en;
    process.stdout.write(
      `  ${c(C.dim, ">")} ${c(C.white, `"${displayText}"`)}\n`,
    );

    await sleep(pause);

    // Always process Chinese text for best classifier coverage
    const result = await engine.processInput(round.input);
    const currState = engine.getState();

    // Appraisal-first input read
    const appraisalLabel = dominantAppraisalLabel(result.appraisal);
    process.stdout.write(`\n`);
    if (appraisalLabel) {
      process.stdout.write(
        `  ${c(C.dim, "appraisal:")} ${c(C.magenta, appraisalLabel)}\n`,
      );
    }
    if (result.stimulus) {
      process.stdout.write(
        `  ${c(C.dim, "legacy stimulus:")} ${c(C.magenta, result.stimulus)}\n`,
      );
    }

    // Chemistry changes
    process.stdout.write(`\n`);
    printChemistry(prevState, currState.current, locale);

    // Emergent mood
    const mood = describeMood(currState.current, displayLocale);
    process.stdout.write(
      `\n  ${c(C.dim, "mood:")} ${c(C.bold, mood)}\n`,
    );

    // Policy context (if non-empty)
    if (result.policyContext) {
      process.stdout.write(
        `  ${c(C.dim, "policy:")} ${c(C.yellow, result.policyContext.slice(0, 80))}\n`,
      );
    }

    // Special alerts from policy context
    if (result.policyContext) {
      if (result.policyContext.includes("谄媚") || result.policyContext.includes("sycophancy")) {
        printAlert("ANTI-SYCOPHANCY triggered");
      }
      if (result.policyContext.includes("防御") || result.policyContext.includes("defensive")) {
        printInfo("DEFENSIVE STRATEGY active");
      }
    }

    // Low compliance = pushing back
    if (result.policyModifiers && result.policyModifiers.compliance < 0.4) {
      printInfo(`COMPLIANCE: ${result.policyModifiers.compliance.toFixed(2)} (pushing back)`);
    }

    // Trait drift check
    if (currState.traitDrift) {
      const drifts = Object.entries(currState.traitDrift).filter(
        ([, v]) => typeof v === "number" && Math.abs(v as number) >= 0.5,
      );
      if (drifts.length > 0) {
        const driftStr = drifts.map(([k, v]) =>
          `${k} ${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(1)}`
        ).join(", ");
        printAlert(`TRAIT DRIFT: ${driftStr} (irreversible)`);
      }
    }

    // Drive warnings
    if (currState.drives) {
      const low = Object.entries(currState.drives).filter(
        ([, v]) => (v as number) < 40,
      );
      if (low.length > 0) {
        const driveStr = low.map(([k, v]) => `${k}=${Math.round(v as number)}`).join(", ");
        process.stdout.write(
          `  ${c(C.red, `⚠ low drives: ${driveStr}`)}\n`,
        );
      }
    }

    await sleep(pause);
  }

  // ── Final summary ──
  process.stdout.write("\n");
  printLine("═");
  process.stdout.write(c(C.bold, "  Final State\n"));
  printLine("═");

  const finalState = engine.getState();
  process.stdout.write("\n");
  printChemistry(finalState.current, finalState.current, locale);

  const finalMood = describeMood(finalState.current, displayLocale);
  process.stdout.write(
    `\n  ${c(C.dim, "mood:")} ${c(C.bold, finalMood)}\n`,
  );

  process.stdout.write(
    `  ${c(C.dim, "summary:")} ${engine.getStatusSummary()}\n`,
  );

  // Drives
  if (finalState.drives) {
    process.stdout.write(`\n  ${c(C.dim, "drives:")}\n`);
    for (const [k, v] of Object.entries(finalState.drives)) {
      const val = Math.round(v as number);
      process.stdout.write(`    ${k.padEnd(12)} ${bar(val, 15)} ${val}\n`);
    }
  }

  process.stdout.write("\n");
  printLine("─");
  process.stdout.write(
    c(C.dim, "  Try it yourself: ") +
    c(C.cyan, "npx psyche-ai mcp") +
    c(C.dim, " (configure in Claude Desktop / Cursor / Claude Code)\n"),
  );
  process.stdout.write(
    c(C.dim, "  npm: ") +
    c(C.cyan, "https://www.npmjs.com/package/psyche-ai") + "\n",
  );
  printLine("─");
  process.stdout.write("\n");
}
