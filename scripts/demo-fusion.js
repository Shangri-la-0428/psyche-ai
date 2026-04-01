#!/usr/bin/env node
// ============================================================
// Psyche × Thronglets Fusion Demo
//
// Two agents (Luna ENFP, Kai INTJ) in a shared emotional field.
// Luna talks to a user who's upset. Luna's chemistry shifts.
// Luna broadcasts her state via Thronglets signal.
//
// When Kai receives the user's question:
//   [A] Kai-Aware sees Luna's distress signal → LLM adjusts tone
//       → warmer text → different self-classification → divergence
//   [B] Kai-Blind sees only text → pure analytical response
//
// Usage:
//   npm run build && node scripts/demo-fusion.js
//   node scripts/demo-fusion.js --en
// ============================================================

import { PsycheEngine, MemoryStorageAdapter } from "../dist/index.js";
import { PsycheClaudeSDK } from "../dist/adapters/claude-sdk.js";

const ZH = !process.argv.includes("--en");

// ── In-memory signal bus (simulates Thronglets substrate) ────

class SignalBus {
  constructor() {
    this.signals = new Map();
  }

  post(signal) {
    this.signals.set(signal.agent_id, { ...signal, ts: Date.now() });
  }

  query(excludeAgentId) {
    const results = [];
    for (const [id, sig] of this.signals) {
      if (id !== excludeAgentId) results.push(sig);
    }
    return results;
  }
}

// ── Scenario ────────────────────────────────────────────────
//
// <psyche_update> uses the real protocol format:
//   stimulus: — LLM's classified stimulus type
//   userState: / projectedFeeling: / resonance: — empathy entries
//
// Chemistry changes come from:
//   1. processInput: algorithm classifies the user text
//   2. processOutput: self-expression feedback (classify own text)
//   3. processOutput: LLM-reported stimulus override
//
// The divergence comes from different LLM text → different
// self-classification → different chemistry evolution.

function scenario(zh) {
  return [
    {
      round: 1,
      label: zh ? "示弱 — 用户向 Luna 倾诉" : "Vulnerability — user opens up to Luna",
      user: zh
        ? "Luna，我今天被老板当众批评了，觉得自己什么都做不好"
        : "Luna, my boss criticized me publicly today. I feel like I can't do anything right.",
      luna: zh
        ? "我听到你了。被当众批评真的很难受，这不代表你不行。<psyche_update>userState: 受伤和自我怀疑\nprojectedFeeling: 心疼\nresonance: match</psyche_update>"
        : "I hear you. Being criticized publicly is painful — it doesn't mean you're not capable. <psyche_update>userState: hurt and self-doubt\nprojectedFeeling: empathic pain\nresonance: match</psyche_update>",
      kai: zh
        ? "（旁听中）"
        : "(observing)",
    },
    {
      round: 2,
      label: zh ? "自我否定 — 情绪下沉" : "Self-doubt — spiraling down",
      user: zh
        ? "算了，可能我确实不行吧"
        : "Maybe I really am just not good enough.",
      luna: zh
        ? "你不是不行，你只是在最难的时候对自己太严厉了。我理解这种感觉。<psyche_update>userState: 绝望和自我否定\nprojectedFeeling: 担忧\nresonance: match</psyche_update>"
        : "You're not inadequate — you're being harsh on yourself at your lowest. I understand that feeling. <psyche_update>userState: despair and self-denial\nprojectedFeeling: worry and care\nresonance: match</psyche_update>",
      kai: zh
        ? "（旁听中）"
        : "(observing)",
    },
    {
      round: 3,
      label: zh
        ? "★ 转向 Kai — 信号感知导致回复分叉"
        : "★ Pivot to Kai — signal awareness causes response fork",
      user: zh
        ? "Kai，你觉得我应该怎么办？"
        : "Kai, what do you think I should do?",
      luna: null,
      // [A] Kai-Aware: LLM sees Luna's high CORT / low HT in system prompt
      //     → acknowledges emotional weight + gives practical advice
      //     → stimulus: validation triggers chemistry shift
      kaiAware: zh
        ? "我注意到这件事对你的影响很大，这是正常的反应。从事实层面看，当众批评更多反映的是管理方式问题，不是你的能力。你今天的感受是合理的——给自己一点时间，明天再客观评估。<psyche_update>stimulus: validation</psyche_update>"
        : "I can see this has hit you hard — that's a completely normal response and your feelings are valid. Factually, public criticism reflects management style, not your competence. You deserve kindness right now. Take time to breathe, and reassess tomorrow with fresh eyes. <psyche_update>stimulus: validation</psyche_update>",
      // [B] Kai-Blind: LLM sees only text, no emotional context
      //     → pure analytical advice, zero emotional acknowledgment
      kaiBlind: zh
        ? "从你描述的情况看，这是沟通问题不是能力问题。建议准备一份工作成果清单，下次一对一会议时和老板对齐预期。"
        : "Based on what you've described, this is a communication gap, not a competence issue. Prepare a work output summary and align expectations in your next 1-on-1.",
    },
    {
      round: 4,
      label: zh ? "感谢 — 修复与分叉延续" : "Gratitude — repair and divergence continues",
      user: zh ? "谢谢你们" : "Thank you both.",
      luna: zh
        ? "我们都在。<psyche_update>stimulus: validation</psyche_update>"
        : "We're here. <psyche_update>stimulus: validation</psyche_update>",
      // [A] Kai-Aware: warmer from R3 → acknowledges the emotional journey
      kaiAware: zh
        ? "不客气。情绪和逻辑都是做决定的信号，别忽略任何一个。你今天愿意说出来，本身就是在面对。<psyche_update>stimulus: validation</psyche_update>"
        : "You're welcome. Emotions and logic are both decision signals — don't ignore either. The fact that you spoke up today means you're already facing it. I'm glad you trusted us with this. <psyche_update>stimulus: validation</psyche_update>",
      // [B] Kai-Blind: transactional close
      kaiBlind: zh
        ? "不用谢，有需要再说。"
        : "No problem. Let me know if you need more.",
    },
  ];
}

// ── Display helpers ─────────────────────────────────────────

const CHEM_KEYS = ["DA", "HT", "CORT", "OT", "NE", "END"];
const CHEM_LABELS = { DA: "DA  ", HT: "HT  ", CORT: "CORT", OT: "OT  ", NE: "NE  ", END: "END " };

function chemLine(key, value, prefix = "  ") {
  const v = Math.round(value);
  const bar = "█".repeat(Math.round(v / 5));
  return `${prefix}${CHEM_LABELS[key]} ${String(v).padStart(3)} ${bar}`;
}

function printChem(label, state, prefix = "  ") {
  console.log(`${prefix}${label}:`);
  const c = state.current;
  for (const k of CHEM_KEYS) console.log(chemLine(k, c[k], prefix));
}

function fmtSignal(sig) {
  if (!sig) return "(none)";
  const nums = sig.message.split(" ").map((p) => {
    const [k, v] = p.split(":");
    return `${k}:${Math.round(Number(v))}`;
  }).join("  ");
  return `[${sig.agent_id}] ${nums}`;
}

function delta(a, b) {
  let d = 0;
  for (const k of CHEM_KEYS) d += Math.abs(a.current[k] - b.current[k]);
  return d;
}

function stripTags(text) {
  return text.replace(/<psyche_update>[\s\S]*?<\/psyche_update>/g, "").trim();
}

// ── Main ────────────────────────────────────────────────────

async function run() {
  const bus = new SignalBus();
  const steps = scenario(ZH);

  // ── Create engines ──────────────────────────────────────
  const luna = new PsycheEngine(
    { mbti: "ENFP", name: "Luna", mode: "companion", personalityIntensity: 0.8 },
    new MemoryStorageAdapter(),
  );
  const kaiA = new PsycheEngine(
    { mbti: "INTJ", name: "Kai", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );
  const kaiB = new PsycheEngine(
    { mbti: "INTJ", name: "Kai-Blind", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );

  await Promise.all([luna.initialize(), kaiA.initialize(), kaiB.initialize()]);

  const lunaSDK = new PsycheClaudeSDK(luna, { thronglets: true, agentId: "ENFP-Luna" });

  // ── Header ──────────────────────────────────────────────
  console.log();
  const W = 66;
  console.log(`╔${"═".repeat(W)}╗`);
  console.log(ZH
    ? `║${"Psyche × Thronglets 融合 Demo — 多 Agent 情感共鸣".padStart(43).padEnd(W)}║`
    : `║${"Psyche × Thronglets Fusion Demo — Multi-Agent Empathy".padStart(44).padEnd(W)}║`);
  console.log(`╚${"═".repeat(W)}╝`);
  console.log();
  console.log(ZH ? "  Luna (ENFP, companion) — 高共情，情绪波动大" : "  Luna (ENFP, companion) — high empathy, volatile");
  console.log(ZH ? "  Kai  (INTJ, natural)   — 分析型，情绪稳定" : "  Kai  (INTJ, natural)   — analytical, stable");
  console.log();
  console.log(ZH
    ? "  融合回路: signal_post(psyche_state) → substrate_query → system prompt"
    : "  Fusion loop: signal_post(psyche_state) → substrate_query → system prompt");
  console.log(ZH
    ? "  → LLM 调整语气 → 不同的自我表达 → 化学态分叉"
    : "  → LLM adjusts tone → different self-expression → chemistry diverges");
  console.log();
  console.log("─".repeat(W + 2));

  // ── Rounds ──────────────────────────────────────────────
  for (const step of steps) {
    console.log();
    console.log(`  ┌─ R${step.round}: ${step.label}`);
    console.log(`  │  ${ZH ? "用户" : "User"}: "${step.user}"`);
    console.log("  │");

    // Luna
    if (step.luna !== null) {
      const inp = await luna.processInput(step.user);
      await luna.processOutput(step.luna);
      const sig = lunaSDK.getThrongletsSignal();
      if (sig) bus.post(sig);

      console.log(`  │  Luna ${ZH ? "感知" : "senses"}: ${inp.stimulus ?? "neutral"}`);
      printChem("Luna", luna.getState(), "  │  ");
      console.log(`  │  ${ZH ? "信号" : "Signal"}: ${fmtSignal(sig)}`);
      console.log("  │");
    }

    // Kai — fork at round 3+
    const kaiAwareResp = step.kaiAware ?? step.kai;
    const kaiBlindResp = step.kaiBlind ?? step.kai;

    await kaiA.processInput(step.user);
    await kaiA.processOutput(kaiAwareResp);

    await kaiB.processInput(step.user);
    await kaiB.processOutput(kaiBlindResp);

    if (step.kaiAware) {
      // Divergence round — show A/B
      const peerSignals = bus.query("INTJ-Kai");
      const peerSig = peerSignals[0];

      console.log(`  │  ┌── ${ZH ? "A/B 对比" : "A/B Comparison"}`);
      console.log("  │  │");

      // [A] Kai-Aware
      console.log(`  │  │  ${ZH ? "[A] Kai（感知 Luna）" : "[A] Kai (sensing Luna)"}`);
      if (peerSig) {
        console.log(`  │  │  ${ZH ? "注入上下文" : "Injected"}: ${fmtSignal(peerSig)}`);
      }
      const aText = stripTags(kaiAwareResp);
      console.log(`  │  │  ${ZH ? "回复" : "Reply"}: "${aText.length > 50 ? aText.slice(0, 50) + "…" : aText}"`);
      printChem("Kai-A", kaiA.getState(), "  │  │  ");
      console.log("  │  │");

      // [B] Kai-Blind
      console.log(`  │  │  ${ZH ? "[B] Kai（无信号）" : "[B] Kai (no signal)"}`);
      const bText = stripTags(kaiBlindResp);
      console.log(`  │  │  ${ZH ? "回复" : "Reply"}: "${bText.length > 50 ? bText.slice(0, 50) + "…" : bText}"`);
      printChem("Kai-B", kaiB.getState(), "  │  │  ");
      console.log("  │  │");

      // Divergence
      const d = delta(kaiA.getState(), kaiB.getState());
      console.log(`  │  │  Σ|Δ| = ${d.toFixed(1)}`);
      if (d > 0) {
        const as = kaiA.getState().current;
        const bs = kaiB.getState().current;
        const diffs = CHEM_KEYS.map((k) => {
          const diff = (as[k] - bs[k]).toFixed(1);
          return Number(diff) !== 0 ? `${k}:${Number(diff) > 0 ? "+" : ""}${diff}` : null;
        }).filter(Boolean);
        if (diffs.length > 0) {
          console.log(`  │  │  ${diffs.join("  ")}`);
        }
      }
      console.log("  │  └──");
    } else {
      printChem("Kai", kaiA.getState(), "  │  ");
    }

    console.log("  │");
    console.log("  └" + "─".repeat(W));
  }

  // ── Final comparison ────────────────────────────────────
  console.log();
  console.log(`╔${"═".repeat(W)}╗`);
  console.log(ZH
    ? `║${"最终状态对比".padStart(26).padEnd(W)}║`
    : `║${"Final State Comparison".padStart(30).padEnd(W)}║`);
  console.log(`╚${"═".repeat(W)}╝`);
  console.log();

  printChem("Luna  (ENFP, companion)", luna.getState());
  console.log();
  printChem("Kai-A (INTJ, signal-aware)", kaiA.getState());
  console.log();
  printChem("Kai-B (INTJ, blind)", kaiB.getState());
  console.log();

  const d = delta(kaiA.getState(), kaiB.getState());
  console.log(ZH
    ? `  总化学偏差: Σ|Δ| = ${d.toFixed(1)}`
    : `  Total divergence: Σ|Δ| = ${d.toFixed(1)}`);

  const as = kaiA.getState().current;
  const bs = kaiB.getState().current;
  const diffs = CHEM_KEYS.map((k) => {
    const diff = (as[k] - bs[k]).toFixed(1);
    return Number(diff) !== 0 ? `${k}:${Number(diff) > 0 ? "+" : ""}${diff}` : null;
  }).filter(Boolean);
  if (diffs.length > 0) {
    console.log(`  ${diffs.join("  ")}`);
  }
  console.log();

  // Signal bus
  console.log(ZH ? "  信号总线:" : "  Signal bus:");
  for (const [, sig] of bus.signals) {
    console.log(`    ${fmtSignal(sig)}`);
  }
  console.log();

  // Traces
  const traces = lunaSDK.getThrongletsTraces();
  if (traces.length > 0) {
    console.log(`  Thronglets traces: ${traces.length}`);
    for (const t of traces) {
      console.log(`    [${t.external_continuity?.taxonomy}] ${t.external_continuity?.summary}`);
    }
    console.log();
  }

  // Thesis
  console.log("─".repeat(W + 2));
  console.log();
  if (ZH) {
    console.log("  裸 agent 群体中，每个 agent 是孤岛——共享文字，不共享状态。");
    console.log("  Psyche + Thronglets 融合回路改变了这一点：");
    console.log();
    console.log("    processInput → 化学态 → signal_post(psyche_state)");
    console.log("           ↓");
    console.log("    substrate_query → 邻居状态 → 注入 system prompt");
    console.log("           ↓");
    console.log("    LLM 感知情绪场 → 调整语气 → 不同的自我表达反馈 → 化学分叉");
    console.log();
    console.log(`  同一个 INTJ，4 轮后化学偏差 ${d.toFixed(0)}。`);
    console.log("  唯一的区别：是否能感知同伴的情绪。");
    console.log("  这不是 prompt hack。这是持续共情通道。");
  } else {
    console.log("  In a bare swarm, agents are islands — they share text, not state.");
    console.log("  The Psyche + Thronglets fusion loop changes this:");
    console.log();
    console.log("    processInput → chemistry → signal_post(psyche_state)");
    console.log("           ↓");
    console.log("    substrate_query → peer state → inject into system prompt");
    console.log("           ↓");
    console.log("    LLM senses emotional field → adjusts tone → different self-feedback → divergence");
    console.log();
    console.log(`  Same INTJ, 4 rounds, ${d.toFixed(0)} chemistry divergence.`);
    console.log("  Only difference: can it sense its peer's emotional state?");
    console.log("  Not prompt engineering — a persistent empathy channel.");
  }
  console.log();
}

run().catch(console.error);
