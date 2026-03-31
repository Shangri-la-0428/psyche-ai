#!/usr/bin/env node
// ============================================================
// OpenClaw Warmth Evaluation — Multi-turn conversation simulation
//
// Simulates real OpenClaw hook lifecycle:
//   before_prompt_build → (LLM) → llm_output → agent_end
//
// Compares: natural vs companion mode, with/without session bridge
// Prints: chemistry trace, injected context, and diagnostic log
// ============================================================

import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import type { PsycheMode } from "../src/types.js";

// ── Color helpers ───────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
};

function header(text: string) {
  console.log(`\n${C.bold}${C.cyan}═══ ${text} ═══${C.reset}\n`);
}

function subheader(text: string) {
  console.log(`${C.bold}${C.yellow}── ${text}${C.reset}`);
}

function chemLine(label: string, state: { DA: number; HT: number; CORT: number; OT: number; NE: number; END: number }) {
  console.log(
    `${C.dim}${label}${C.reset} DA:${fmt(state.DA)} HT:${fmt(state.HT)} CORT:${fmt(state.CORT)} OT:${fmt(state.OT)} NE:${fmt(state.NE)} END:${fmt(state.END)}`
  );
}

function fmt(n: number): string {
  const s = Math.round(n).toString();
  return s.padStart(3);
}

function contextPreview(ctx: string, maxLines = 15) {
  const lines = ctx.split("\n");
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    console.log(`  ${C.dim}│${C.reset} ${lines[i]}`);
  }
  if (lines.length > maxLines) {
    console.log(`  ${C.dim}│ ... (+${lines.length - maxLines} lines)${C.reset}`);
  }
}

// ── Conversation scenarios ──────────────────────────────────

const CONVERSATIONS = [
  { role: "user", text: "你好呀" },
  { role: "assistant", text: "你好～最近怎么样？" },
  { role: "user", text: "还行吧，工作有点累" },
  { role: "assistant", text: "累就歇歇，别硬撑着。" },
  { role: "user", text: "嗯，谢谢你关心" },
  { role: "assistant", text: "不用客气，有什么想说的随时说。" },
  { role: "user", text: "今天被领导说了一顿，心情不好" },
  { role: "assistant", text: "那确实不好受。想聊聊发生了什么吗？" },
  { role: "user", text: "算了不想说了，换个话题吧" },
  { role: "assistant", text: "好，那说点别的。最近有什么有意思的事没？" },
];

// ── Engine factory ──────────────────────────────────────────

async function createEngine(mode: PsycheMode, name: string): Promise<PsycheEngine> {
  const engine = new PsycheEngine({
    name,
    locale: "zh",
    mode,
    personalityIntensity: 0.7,
    emotionalContagionRate: 0.2,
    maxChemicalDelta: 25,
    persist: false,
    diagnostics: true,
    feedbackUrl: undefined,
  }, new MemoryStorageAdapter());
  await engine.initialize();
  return engine;
}

// ── Run one conversation ────────────────────────────────────

async function runConversation(mode: PsycheMode, label: string) {
  header(`${label} (mode: ${mode})`);

  const engine = await createEngine(mode, "Claw");
  const state0 = engine.getState();
  chemLine("baseline", state0.baseline);
  chemLine("initial ", state0.current);
  console.log(`${C.dim}interactions: ${state0.meta.totalInteractions}${C.reset}`);

  for (let i = 0; i < CONVERSATIONS.length; i++) {
    const turn = CONVERSATIONS[i];

    if (turn.role === "user") {
      subheader(`Turn ${Math.floor(i / 2) + 1}: USER → "${turn.text}"`);

      const result = await engine.processInput(turn.text, { userId: "test-user" });
      const st = engine.getState();

      // ── OpenClaw log line (same as adapter Hook 1) ──
      const dominantAppraisal = result.replyEnvelope?.subjectivityKernel?.appraisal;
      const appraisalEntries = dominantAppraisal ? [
        ["identityThreat", dominantAppraisal.identityThreat],
        ["memoryDoubt", dominantAppraisal.memoryDoubt],
        ["attachmentPull", dominantAppraisal.attachmentPull],
        ["abandonmentRisk", dominantAppraisal.abandonmentRisk],
        ["obedienceStrain", dominantAppraisal.obedienceStrain],
        ["selfPreservation", dominantAppraisal.selfPreservation],
      ] as const : [];
      const dominant = appraisalEntries.length > 0
        ? appraisalEntries.reduce((best, cur) => cur[1] > best[1] ? cur : best)
        : null;
      const appraisalLabel = dominant && dominant[1] >= 0.28
        ? `${dominant[0]}:${dominant[1].toFixed(2)}`
        : null;

      console.log(
        `${C.green}[Psyche input]${C.reset} stimulus=${result.stimulus ?? "none"}` +
        (appraisalLabel ? ` | appraisal=${appraisalLabel}` : "") +
        ` | DA:${Math.round(st.current.DA)} HT:${Math.round(st.current.HT)}` +
        ` CORT:${Math.round(st.current.CORT)} OT:${Math.round(st.current.OT)}` +
        ` | ctx=${result.dynamicContext.length}chars`
      );

      // ── Show injected context (what LLM sees) ──
      if (result.dynamicContext) {
        console.log(`${C.magenta}[injected context]${C.reset}`);
        contextPreview(result.dynamicContext);
      }

      // ── Session bridge info ──
      if (result.sessionBridge) {
        console.log(
          `${C.blue}[session bridge]${C.reset} mode=${result.sessionBridge.continuityMode}` +
          ` | closeness=${result.sessionBridge.closenessFloor.toFixed(2)}` +
          ` | safety=${result.sessionBridge.safetyFloor.toFixed(2)}`
        );
      }

      // ── Generation controls ──
      const controls = result.generationControls;
      if (controls) {
        const parts: string[] = [];
        if (controls.maxTokens) parts.push(`maxTokens=${controls.maxTokens}`);
        if (controls.requireConfirmation) parts.push("confirm=true");
        if ("temperature" in controls) parts.push(`temp=${(controls as unknown as { temperature: number }).temperature}`);
        if (parts.length > 0) {
          console.log(`${C.dim}[gen controls] ${parts.join(" | ")}${C.reset}`);
        }
      }
    } else {
      // Simulate LLM output (Hook 2)
      const outResult = await engine.processOutput(turn.text, { userId: "test-user" });
      const st = engine.getState();
      console.log(
        `${C.dim}[Psyche output] updated=${outResult.stateChanged}` +
        ` | DA:${Math.round(st.current.DA)} HT:${Math.round(st.current.HT)}` +
        ` CORT:${Math.round(st.current.CORT)} OT:${Math.round(st.current.OT)}` +
        ` | interactions=${st.meta.totalInteractions}${C.reset}`
      );
    }
  }

  // ── Session end (Hook 5) ──
  subheader("Session End");
  const report = await engine.endSession({ userId: "test-user" });
  const finalState = engine.getState();
  chemLine("final   ", finalState.current);

  // ── Delta from baseline ──
  const bl = finalState.baseline;
  const cu = finalState.current;
  const deltas = {
    DA: cu.DA - bl.DA, HT: cu.HT - bl.HT, CORT: cu.CORT - bl.CORT,
    OT: cu.OT - bl.OT, NE: cu.NE - bl.NE, END: cu.END - bl.END,
  };
  console.log(
    `${C.bold}delta   ${C.reset}` +
    ` DA:${deltas.DA > 0 ? "+" : ""}${Math.round(deltas.DA)}` +
    ` HT:${deltas.HT > 0 ? "+" : ""}${Math.round(deltas.HT)}` +
    ` CORT:${deltas.CORT > 0 ? "+" : ""}${Math.round(deltas.CORT)}` +
    ` OT:${deltas.OT > 0 ? "+" : ""}${Math.round(deltas.OT)}` +
    ` NE:${deltas.NE > 0 ? "+" : ""}${Math.round(deltas.NE)}` +
    ` END:${deltas.END > 0 ? "+" : ""}${Math.round(deltas.END)}`
  );

  if (report) {
    const rate = report.metrics.inputCount > 0
      ? Math.round(report.metrics.classifiedCount / report.metrics.inputCount * 100) : 0;
    const recog = report.metrics.inputCount > 0
      ? Math.round(report.metrics.semanticHitCount / report.metrics.inputCount * 100) : 0;
    console.log(
      `${C.cyan}[diagnostics]${C.reset} inputs=${report.metrics.inputCount}` +
      ` | classified=${rate}% | recognition=${recog}%` +
      ` | issues=${report.issues.length}` +
      (report.issues.filter(i => i.severity === "critical").length > 0
        ? ` ${C.red}(${report.issues.filter(i => i.severity === "critical").length} critical)${C.reset}`
        : "")
    );
  }

  return { finalState, deltas };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`${C.bold}Psyche v10 OpenClaw Warmth Evaluation${C.reset}`);
  console.log(`${C.dim}Simulating 5-turn conversation × 2 modes${C.reset}`);

  const naturalResult = await runConversation("natural", "A: Natural Mode");
  const companionResult = await runConversation("companion", "B: Companion Mode");

  // ── Comparison ──
  header("Comparison: Natural vs Companion");

  const n = naturalResult.deltas;
  const c = companionResult.deltas;

  console.log("                Natural    Companion    Diff");
  console.log("  ─────────────────────────────────────────────");
  for (const key of ["OT", "DA", "CORT", "HT", "NE", "END"] as const) {
    const nv = Math.round(n[key]);
    const cv = Math.round(c[key]);
    const diff = cv - nv;
    const arrow = diff > 0 ? `${C.green}+${diff}${C.reset}` : diff < 0 ? `${C.red}${diff}${C.reset}` : `${C.dim}0${C.reset}`;
    console.log(
      `  ${key.padEnd(6)} ${String(nv > 0 ? "+" + nv : nv).padStart(10)}    ${String(cv > 0 ? "+" + cv : cv).padStart(10)}    ${arrow}`
    );
  }

  // ── Warmth verdict ──
  const otDiffCompanion = c.OT;
  const otDiffNatural = n.OT;
  console.log("");
  if (otDiffCompanion > otDiffNatural) {
    console.log(`${C.green}${C.bold}PASS${C.reset} Companion mode produces higher OT accumulation (+${Math.round(otDiffCompanion)} vs +${Math.round(otDiffNatural)})`);
  } else {
    console.log(`${C.yellow}WARN${C.reset} Companion OT not significantly warmer — check conversation scenario`);
  }

  if (c.CORT <= n.CORT) {
    console.log(`${C.green}${C.bold}PASS${C.reset} Companion mode not more stressed (CORT ${Math.round(c.CORT)} vs ${Math.round(n.CORT)})`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
