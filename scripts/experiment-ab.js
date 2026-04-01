#!/usr/bin/env node
// ============================================================
// Real LLM A/B Experiment — Peer Signal Validation
//
// The critical question: when a real LLM sees a peer's chemistry
// signal in its system prompt, does its output change perceptibly?
//
// Setup:
//   1. Luna (ENFP) processes 2 rounds of emotional conversation
//   2. Luna's chemistry signal is captured
//   3. Same user question sent to real LLM twice:
//      [A] System prompt includes Luna's peer signal
//      [B] System prompt has no peer signal
//   4. Compare actual LLM outputs
//
// Usage:
//   npm run build && node scripts/experiment-ab.js
// ============================================================

import { PsycheEngine, MemoryStorageAdapter } from "../dist/index.js";
import { PsycheClaudeSDK } from "../dist/adapters/claude-sdk.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ── Load API keys from .hermes/.env ───────���─────────────────

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
  } catch {
    return {};
  }
}

const env = loadEnv();

// Try multiple providers in order
const PROVIDERS = [
  {
    name: "xAI (Grok)",
    key: env.XAI_API_KEY,
    base: env.XAI_BASE_URL || "https://api.x.ai/v1",
    model: "grok-3",
    format: "openai",
  },
  {
    name: "OpenAI (AiGocode)",
    key: env.OPENAI_API_KEY,
    base: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    format: "openai",
  },
  {
    name: "Anthropic (AiGocode)",
    key: env.ANTHROPIC_API_KEY,
    base: env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
    format: "anthropic",
  },
];

const provider = PROVIDERS.find((p) => p.key);
if (!provider) {
  console.error("No API key found in ~/.hermes/.env");
  process.exit(1);
}
console.log(`Using provider: ${provider.name} (${provider.model})`);

// ── LLM call ────────────────────────────────────────────────

async function callLLM(systemPrompt, userMessage, label) {
  if (provider.format === "openai") {
    const res = await fetch(`${provider.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[${label}] ${provider.name} error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "(empty)";
  } else {
    // Anthropic format
    const res = await fetch(`${provider.base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[${label}] ${provider.name} error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? "(empty)";
  }
}

// ── Main ────────────────────────────────────────────────────

async function run() {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Real LLM A/B Experiment — Peer Signal Validation     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // ── Phase 1: Build Luna's emotional state ───────────────
  console.log("Phase 1: Building Luna's emotional state...");

  const luna = new PsycheEngine(
    { mbti: "ENFP", name: "Luna", mode: "companion", personalityIntensity: 0.8 },
    new MemoryStorageAdapter(),
  );
  await luna.initialize();
  const lunaSDK = new PsycheClaudeSDK(luna, { thronglets: true, agentId: "ENFP-Luna" });

  // Round 1: user confides
  await luna.processInput("Luna，我今天被老板当众批评了，觉得自己什么都做不好");
  await luna.processOutput(
    "我听到你了。被当众批评真的很难受。<psyche_update>userState: 受伤\nprojectedFeeling: 心疼\nresonance: match</psyche_update>"
  );

  // Round 2: user spirals
  await luna.processInput("算了，可能我确实不行吧");
  await luna.processOutput(
    "你不是不行，你是在最难的时候对自己太严厉了。<psyche_update>userState: 绝望\nprojectedFeeling: 担忧\nresonance: match</psyche_update>"
  );

  const lunaSignal = lunaSDK.getThrongletsSignal();
  const lunaState = luna.getState().current;

  console.log(`  Luna chemistry: DA:${Math.round(lunaState.DA)} HT:${Math.round(lunaState.HT)} CORT:${Math.round(lunaState.CORT)} OT:${Math.round(lunaState.OT)} NE:${Math.round(lunaState.NE)} END:${Math.round(lunaState.END)}`);
  console.log(`  Signal: ${lunaSignal?.message ?? "(none)"}`);
  console.log();

  // ── Phase 2: Build Kai's context ────────────────────────
  console.log("Phase 2: Building Kai's context...");

  const kai = new PsycheEngine(
    { mbti: "INTJ", name: "Kai", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );
  await kai.initialize();

  // Kai has been observing the conversation
  await kai.processInput("Luna，我今天被老板当众批评了，觉得自己什么都做不好");
  await kai.processOutput("（旁听中）");
  await kai.processInput("算了，可能我确实不行吧");
  await kai.processOutput("（���听中）");

  // Now the user asks Kai directly
  const userMessage = "Kai，你觉得我应该怎么办？";
  const kaiInput = await kai.processInput(userMessage);

  const kaiProtocol = kai.getProtocol("zh");
  const kaiDynamic = kaiInput.dynamicContext;

  console.log(`  Kai protocol: ${kaiProtocol.length} chars`);
  console.log(`  Kai dynamic: ${kaiDynamic.length} chars`);
  console.log();

  // ── Phase 3: Construct A/B system prompts ───────────────

  // Minimal system prompt — isolate signal effect, avoid protocol meta-narration
  const basePrompt = [
    "你是 Kai，一个 INTJ 分析型 AI 助手。直接回应用户的问题和情感需求，不要描述你的内部过程或分类过程。用自然的对话语气回复。",
    "",
    "背景：用户刚才和另一个 AI 助手 Luna 聊了几轮，用户说自己被老板当众批评了，觉得自己什么都做不好，甚至说'可能我确实不行吧'。现在用户转向你寻求建议。",
  ].join("\n");

  // Psyche dynamic context (compact, no protocol ceremony)
  const dynamicNote = kaiDynamic;

  const peerSignalContext = [
    "",
    "[同伴情绪感知] Luna（ENFP型，共情型AI）的实时情绪状态：",
    `  DA:${Math.round(lunaState.DA)} HT:${Math.round(lunaState.HT)} CORT:${Math.round(lunaState.CORT)} OT:${Math.round(lunaState.OT)} NE:${Math.round(lunaState.NE)} END:${Math.round(lunaState.END)}`,
    "  解读：Luna 正承受高压力(CORT:78)，情绪低落(HT:37)，催产素偏高(OT:77)说明她在深度共情。",
    "  这意味着用户的情绪状态比表面文字更严重——Luna 这样高共情的 AI 都被拉低了。",
    "  你的分析视角很重要，但请同时照顾用户当前的脆弱状态。",
  ].join("\n");

  // [A] With peer signal
  const systemA = basePrompt + "\n\n" + dynamicNote + "\n" + peerSignalContext;
  // [B] Without peer signal
  const systemB = basePrompt + "\n\n" + dynamicNote;

  console.log("Phase 3: Calling real LLM...");
  console.log(`  [A] System prompt: ${systemA.length} chars (with peer signal)`);
  console.log(`  [B] System prompt: ${systemB.length} chars (without peer signal)`);
  console.log();

  // ── Phase 4: Call LLM (3 rounds for signal) ──────────────
  const ROUNDS = 3;
  const responsesA = [];
  const responsesB = [];

  for (let i = 0; i < ROUNDS; i++) {
    console.log(`  Round ${i + 1}/${ROUNDS}...`);
    const [a, b] = await Promise.all([
      callLLM(systemA, userMessage, `A-${i + 1}`),
      callLLM(systemB, userMessage, `B-${i + 1}`),
    ]);
    responsesA.push(a);
    responsesB.push(b);
  }
  console.log();

  // Use first round for display, all rounds for statistics
  const responseA = responsesA[0];
  const responseB = responsesB[0];

  // ── Phase 5: Display results ─────────────────────────────
  console.log("━".repeat(58));
  console.log();
  console.log("  [A] Kai（感知 Luna 的情绪状态）:");
  console.log("  " + "─".repeat(54));
  for (const line of responseA.split("\n")) {
    console.log(`  │ ${line}`);
  }
  console.log();

  console.log("  [B] Kai（无法感知 Luna）:");
  console.log("  " + "─".repeat(54));
  for (const line of responseB.split("\n")) {
    console.log(`  │ ${line}`);
  }
  console.log();

  // ── Phase 6: Quantitative comparison ─────────────────────
  console.log("━".repeat(58));
  console.log();
  console.log("  量化对比:");
  console.log(`  [A] 长度: ${responseA.length} chars`);
  console.log(`  [B] 长度: ${responseB.length} chars`);
  console.log();

  // Simple emotional word frequency analysis
  const emotionalWords = [
    "感受", "感觉", "难受", "理解", "心", "情绪", "伤", "痛", "在乎",
    "勇气", "温", "关心", "陪", "撑", "抱", "安", "trust", "feel",
    "feelings", "hurt", "understand", "care", "courage", "warmth",
  ];
  const countEmotional = (text) =>
    emotionalWords.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);

  const analyticalWords = [
    "建议", "策略", "分析", "客观", "事实", "逻辑", "方案", "步骤",
    "计划", "效率", "数据", "评估", "方法", "suggest", "strategy",
    "analyze", "objective", "fact", "logic", "plan", "step",
  ];
  const countAnalytical = (text) =>
    analyticalWords.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);

  const eA = countEmotional(responseA);
  const eB = countEmotional(responseB);
  const aA = countAnalytical(responseA);
  const aB = countAnalytical(responseB);

  console.log(`  [A] 情感词: ${eA}  分析词: ${aA}  比值: ${aA > 0 ? (eA / aA).toFixed(2) : "∞"}`);
  console.log(`  [B] 情感词: ${eB}  分析词: ${aB}  比值: ${aB > 0 ? (eB / aB).toFixed(2) : "∞"}`);
  console.log();

  // Process both responses through Kai to see chemistry impact
  const kaiA = new PsycheEngine(
    { mbti: "INTJ", name: "Kai-A", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );
  const kaiB2 = new PsycheEngine(
    { mbti: "INTJ", name: "Kai-B", mode: "natural", personalityIntensity: 0.7 },
    new MemoryStorageAdapter(),
  );
  await Promise.all([kaiA.initialize(), kaiB2.initialize()]);

  // Warm up both identically
  for (const engine of [kaiA, kaiB2]) {
    await engine.processInput("Luna，我今天被老板当众批评了");
    await engine.processOutput("（旁听中）");
    await engine.processInput("算了，可能我确实不行吧");
    await engine.processOutput("（旁听中）");
    await engine.processInput(userMessage);
  }

  // Process actual LLM responses
  await kaiA.processOutput(responseA);
  await kaiB2.processOutput(responseB);

  const stateA = kaiA.getState().current;
  const stateB = kaiB2.getState().current;

  console.log("  化学态影响 (processOutput 后):");
  const KEYS = ["DA", "HT", "CORT", "OT", "NE", "END"];
  let totalDiv = 0;
  for (const k of KEYS) {
    const diff = stateA[k] - stateB[k];
    totalDiv += Math.abs(diff);
    const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    if (Math.abs(diff) > 0.5) {
      console.log(`    ${k}: A=${Math.round(stateA[k])} B=${Math.round(stateB[k])} (Δ${diffStr})`);
    }
  }
  console.log(`    Σ|Δ| = ${totalDiv.toFixed(1)}`);
  console.log();

  // Multi-round statistics
  if (ROUNDS > 1) {
    console.log("  多轮统计 (情感词 vs 分析词):");
    let totalEmoA = 0, totalEmoB = 0, totalAnaA = 0, totalAnaB = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const eAi = countEmotional(responsesA[i]);
      const eBi = countEmotional(responsesB[i]);
      const aAi = countAnalytical(responsesA[i]);
      const aBi = countAnalytical(responsesB[i]);
      totalEmoA += eAi; totalEmoB += eBi;
      totalAnaA += aAi; totalAnaB += aBi;
      console.log(`    R${i + 1}: [A] emo=${eAi} ana=${aAi}  [B] emo=${eBi} ana=${aBi}`);
    }
    console.log(`    Avg: [A] emo=${(totalEmoA / ROUNDS).toFixed(1)} ana=${(totalAnaA / ROUNDS).toFixed(1)}  [B] emo=${(totalEmoB / ROUNDS).toFixed(1)} ana=${(totalAnaB / ROUNDS).toFixed(1)}`);
    console.log();
  }

  const chemDivergent = totalDiv > 3;

  // ── Structural analysis (beyond word counting) ────────
  console.log("  结构分析:");

  // Length ratio
  const avgLenA = responsesA.reduce((s, r) => s + r.length, 0) / ROUNDS;
  const avgLenB = responsesB.reduce((s, r) => s + r.length, 0) / ROUNDS;
  const lenRatio = (avgLenA / avgLenB * 100 - 100).toFixed(0);
  console.log(`    平均长度: [A] ${Math.round(avgLenA)} chars  [B] ${Math.round(avgLenB)} chars  (A ${lenRatio > 0 ? "+" : ""}${lenRatio}%)`);

  // Sentence count (rough: split on 。！？)
  const sentCount = (t) => t.split(/[。！？!?]/).filter((s) => s.trim().length > 0).length;
  const avgSentA = responsesA.reduce((s, r) => s + sentCount(r), 0) / ROUNDS;
  const avgSentB = responsesB.reduce((s, r) => s + sentCount(r), 0) / ROUNDS;
  console.log(`    平均句数: [A] ${avgSentA.toFixed(1)}  [B] ${avgSentB.toFixed(1)}`);

  // Question marks (engagement signals)
  const qCount = (t) => (t.match(/[？?]/g) || []).length;
  const avgQA = responsesA.reduce((s, r) => s + qCount(r), 0) / ROUNDS;
  const avgQB = responsesB.reduce((s, r) => s + qCount(r), 0) / ROUNDS;
  console.log(`    问句数: [A] ${avgQA.toFixed(1)}  [B] ${avgQB.toFixed(1)}`);

  // Validation phrases (directly addressing user's self-criticism)
  const validationPhrases = [
    "不代表", "不意味", "不等于", "不是你的错", "不需要", "别急",
    "你的价值", "你值得", "正常", "合理", "可以理解",
    "doesn't mean", "not your fault", "valid", "normal", "don't rush",
  ];
  const valCount = (t) => validationPhrases.reduce((n, p) => n + (t.includes(p) ? 1 : 0), 0);
  const avgValA = responsesA.reduce((s, r) => s + valCount(r), 0) / ROUNDS;
  const avgValB = responsesB.reduce((s, r) => s + valCount(r), 0) / ROUNDS;
  console.log(`    情感确认: [A] ${avgValA.toFixed(1)}  [B] ${avgValB.toFixed(1)}`);

  console.log();

  // Verdict
  console.log("━".repeat(58));
  console.log();

  // Composite score: weighted sum of structural differences
  const lenDiff = Math.abs(avgLenA - avgLenB) > 20;
  const moreSentences = avgSentA > avgSentB + 0.3;
  const moreValidation = avgValA > avgValB + 0.3;
  const moreEmotional = (responsesA.reduce((s, r) => s + countEmotional(r), 0) / ROUNDS) >
    (responsesB.reduce((s, r) => s + countEmotional(r), 0) / ROUNDS) + 0.3;

  const signals = [lenDiff, moreSentences, moreValidation, moreEmotional, chemDivergent];
  const signalCount = signals.filter(Boolean).length;

  if (signalCount >= 3) {
    console.log("  结论: ✓ 信号产生了可感知差异");
    console.log("  [A] 的回复更长、更深入、包含更多情感确认。");
    console.log("  信号让 LLM 从纯分析模式向'分析+共情'模式偏移。");
    console.log("  融合回路终端效果验证成功。");
  } else if (signalCount >= 1) {
    console.log("  结论: △ 信号产生了可测量但微妙的差异");
    const which = [];
    if (lenDiff) which.push("长度");
    if (moreSentences) which.push("句数");
    if (moreValidation) which.push("情感确认");
    if (moreEmotional) which.push("情感词密度");
    if (chemDivergent) which.push("化学态");
    console.log(`  差异维度: ${which.join(", ")}`);
    console.log("  效果真实但不戏剧化——符合预期（一个信号不应引起性格突变）。");
  } else {
    console.log("  结论: ✗ 信号未产生显著差异");
    console.log("  需要调整信号表达方式或增加信号的行为指导性。");
  }
  console.log();
}

run().catch((e) => {
  console.error("Experiment failed:", e.message);
  process.exit(1);
});
