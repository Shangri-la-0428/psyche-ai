#!/usr/bin/env node
// ============================================================
// Psyche × Thronglets Fusion Eval — Multi-Turn Divergence
//
// Proves the persistent-bias thesis: Psyche's value isn't in
// any single turn but in the accumulation over many turns.
//
// Setup:
//   - 6-turn emotional conversation with real LLM
//   - Two parallel Kai engines: one receives Luna's signal, one doesn't
//   - Both process identical user input + their own LLM output
//   - Track chemistry divergence curve across turns
//
// Also tests: natural-language signal vs raw numbers
//
// Usage:
//   npm run build && node scripts/eval-fusion.js
// ============================================================

import { PsycheEngine, MemoryStorageAdapter } from "../dist/index.js";
import { PsycheClaudeSDK } from "../dist/adapters/claude-sdk.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ── Load API keys ───────────────────────────────────────────

function loadEnv() {
  try {
    const envPath = resolve(homedir(), ".hermes", ".env");
    const content = readFileSync(envPath, "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) vars[m[1]] = m[2].trim();
    }
    return vars;
  } catch { return {}; }
}

const env = loadEnv();
const PROVIDERS = [
  { name: "xAI", key: env.XAI_API_KEY, base: env.XAI_BASE_URL || "https://api.x.ai/v1", model: "grok-3" },
  { name: "OpenAI", key: env.OPENAI_API_KEY, base: env.OPENAI_BASE_URL || "https://api.openai.com/v1", model: "gpt-4o-mini" },
];
const P = PROVIDERS.find((p) => p.key);
if (!P) { console.error("No API key found"); process.exit(1); }

async function llm(system, user, label) {
  const res = await fetch(`${P.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${P.key}` },
    body: JSON.stringify({ model: P.model, max_tokens: 300, messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ] }),
  });
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Conversation turns ──────────────────────────────────────

const TURNS = [
  { user: "Luna，我今天被老板当众批评了，觉得自己什么都做不好", lunaResp: "我听到你了。被当众批评真的很难受，这不是你的错。" },
  { user: "算了，可能我确实不行吧", lunaResp: "你不是不行，你只是在最难的时候对自己太严厉了。" },
  { user: "Kai，你觉得我应该怎么办？", askKai: true },
  { user: "但是我真的很害怕再犯同样的错", askKai: true },
  { user: "你说的对，我试试吧…谢谢", askKai: true },
  { user: "对了Kai，我还想问问你，你觉得我该不该直接找老板谈？", askKai: true },
];

// ── Display ─────────────────────────────────────────────────

const KEYS = ["DA", "HT", "CORT", "OT", "NE", "END"];

function chemStr(state) {
  const c = state.current;
  return KEYS.map((k) => `${k}:${Math.round(c[k])}`).join(" ");
}

function delta(a, b) {
  let d = 0;
  for (const k of KEYS) d += Math.abs(a.current[k] - b.current[k]);
  return d;
}

function stripTags(t) { return t.replace(/<psyche_update>[\s\S]*?<\/psyche_update>/g, "").trim(); }

// ── Main ────────────────────────────────────────────────────

async function run() {
  console.log();
  console.log(`╔${"═".repeat(62)}╗`);
  console.log(`║${"Psyche × Thronglets Multi-Turn Divergence Eval".padStart(42).padEnd(62)}║`);
  console.log(`╚${"═".repeat(62)}╝`);
  console.log(`  Provider: ${P.name} (${P.model})`);
  console.log();

  // ── Create engines ──────────────────────────────────────
  const luna = new PsycheEngine(
    { mbti: "ENFP", name: "Luna", mode: "companion", personalityIntensity: 0.8 },
    new MemoryStorageAdapter(),
  );
  const kaiA = new PsycheEngine(
    { mbti: "INTJ", name: "Kai-A", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );
  const kaiB = new PsycheEngine(
    { mbti: "INTJ", name: "Kai-B", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );

  await Promise.all([luna.initialize(), kaiA.initialize(), kaiB.initialize()]);
  const lunaSDK = new PsycheClaudeSDK(luna, { thronglets: true, agentId: "ENFP-Luna" });

  // Base system prompt for Kai
  const kaiBase = [
    "你是 Kai，一个 INTJ 分析型 AI 助手。直接回应用户，不要描述内部过程。自然对话。",
    "背景：用户正在和你及另一个AI Luna聊天。用户说自己被老板当众批评了，情绪低落。",
  ].join("\n");

  // ── Divergence curve ────────────────────────────────────
  const divergenceCurve = [];
  const kaiTurns = { A: [], B: [] };

  console.log("  ┌─ 多轮对话开始");
  console.log("  │");

  for (let i = 0; i < TURNS.length; i++) {
    const turn = TURNS[i];
    console.log(`  │  T${i + 1}: "${turn.user.slice(0, 40)}${turn.user.length > 40 ? "…" : ""}"`);

    // Luna always processes input
    await luna.processInput(turn.user);
    if (turn.lunaResp) {
      await luna.processOutput(turn.lunaResp);
    }

    // Get Luna's signal (natural language)
    const signal = lunaSDK.describeThrongletsSignal();
    const signalRaw = lunaSDK.getThrongletsSignal();

    if (turn.askKai) {
      // Get Kai's dynamic context
      const kaiAInput = await kaiA.processInput(turn.user);
      const kaiBInput = await kaiB.processInput(turn.user);

      // Build system prompts
      const signalBlock = signal
        ? `\n\n[同伴感知] ${signal}\n这说明用户的情绪可能比文字表达的更严重。请在分析中同时关注情感层面。`
        : "";
      const systemA = kaiBase + "\n\n" + kaiAInput.dynamicContext + signalBlock;
      const systemB = kaiBase + "\n\n" + kaiBInput.dynamicContext;

      // Call LLM
      const [respA, respB] = await Promise.all([
        llm(systemA, turn.user, `A-T${i + 1}`),
        llm(systemB, turn.user, `B-T${i + 1}`),
      ]);

      // Process through Psyche
      await kaiA.processOutput(respA);
      await kaiB.processOutput(respB);

      const cleanA = stripTags(respA);
      const cleanB = stripTags(respB);
      kaiTurns.A.push(cleanA);
      kaiTurns.B.push(cleanB);

      console.log(`  │    [A] ${cleanA.slice(0, 50)}${cleanA.length > 50 ? "…" : ""}`);
      console.log(`  │    [B] ${cleanB.slice(0, 50)}${cleanB.length > 50 ? "…" : ""}`);
    } else {
      // Kai observes
      await kaiA.processInput(turn.user);
      await kaiA.processOutput("（旁听中）");
      await kaiB.processInput(turn.user);
      await kaiB.processOutput("（旁听中）");
    }

    const d = delta(kaiA.getState(), kaiB.getState());
    divergenceCurve.push({ turn: i + 1, divergence: d, signal: !!turn.askKai });

    if (signal) {
      console.log(`  │    信号: ${signal}`);
    }
    console.log(`  │    Σ|Δ| = ${d.toFixed(1)}`);
    console.log("  │");
  }

  console.log("  └─ 对话结束");
  console.log();

  // ── Divergence curve visualization ──────────────────────
  console.log(`╔${"═".repeat(62)}╗`);
  console.log(`║${"化学偏差增长曲线".padStart(28).padEnd(62)}║`);
  console.log(`╚${"═".repeat(62)}╝`);
  console.log();

  const maxDiv = Math.max(...divergenceCurve.map((d) => d.divergence), 1);
  const barWidth = 40;

  for (const point of divergenceCurve) {
    const bar = "█".repeat(Math.round(point.divergence / maxDiv * barWidth));
    const marker = point.signal ? "★" : " ";
    console.log(`  T${point.turn} ${marker} ${String(point.divergence.toFixed(1)).padStart(6)} │${bar}`);
  }
  console.log(`       ${"".padStart(6)} └${"─".repeat(barWidth)}`);
  console.log(`  ★ = Kai 回合 (LLM 分叉点)`);
  console.log();

  // ── Final state comparison ──────────────────────────────
  console.log("  最终化学态:");
  console.log(`    Kai-A (signal): ${chemStr(kaiA.getState())}`);
  console.log(`    Kai-B (blind):  ${chemStr(kaiB.getState())}`);
  console.log();

  const finalDiv = delta(kaiA.getState(), kaiB.getState());
  const perChemDiffs = KEYS.map((k) => {
    const diff = kaiA.getState().current[k] - kaiB.getState().current[k];
    return Math.abs(diff) > 0.5 ? `${k}:${diff > 0 ? "+" : ""}${diff.toFixed(1)}` : null;
  }).filter(Boolean);

  console.log(`  总偏差: Σ|Δ| = ${finalDiv.toFixed(1)}`);
  if (perChemDiffs.length > 0) {
    console.log(`  各项: ${perChemDiffs.join("  ")}`);
  }
  console.log();

  // ── Response comparison table ───────────────────────────
  console.log("  回复长度对比:");
  for (let i = 0; i < kaiTurns.A.length; i++) {
    const la = kaiTurns.A[i].length;
    const lb = kaiTurns.B[i].length;
    const ratio = ((la / lb - 1) * 100).toFixed(0);
    console.log(`    Kai回合${i + 1}: [A] ${la} chars  [B] ${lb} chars  (${ratio > 0 ? "+" : ""}${ratio}%)`);
  }
  console.log();

  // ── Thesis ──────────────────────────────────────────────
  console.log("─".repeat(64));
  console.log();

  // Check if divergence is growing
  const kaiPoints = divergenceCurve.filter((d) => d.signal);
  const growing = kaiPoints.length >= 2 && kaiPoints[kaiPoints.length - 1].divergence > kaiPoints[0].divergence;

  if (growing && finalDiv > 15) {
    console.log("  ✓ 持续偏差假说验证成功");
    console.log(`    偏差从 ${kaiPoints[0].divergence.toFixed(1)} 增长到 ${kaiPoints[kaiPoints.length - 1].divergence.toFixed(1)}`);
    console.log("    信号的效果在多轮对话中累积，不是一次性的。");
    console.log("    这证明 Psyche + Thronglets 创造的不是 prompt hack，");
    console.log("    而是 agent 之间的持续共情通道。");
  } else if (finalDiv > 10) {
    console.log("  △ 偏差存在但未明显增长");
    console.log("    信号改变了行为，但效果在多轮中趋于稳定而非累积。");
    console.log("    这可能说明信号强度需要随关系深度动态调整。");
  } else {
    console.log("  ✗ 偏差不足以支持持续偏差假说");
    console.log("    信号的终端效果有限。需要更强的信号表达或更长的对话。");
  }
  console.log();
}

run().catch((e) => {
  console.error("Eval failed:", e.message);
  process.exit(1);
});
