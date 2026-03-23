#!/usr/bin/env npx tsx
// ============================================================
// 依恋风格分化测试
//
// 两个完全相同的 INFJ agent:
//   Agent A — 遇到一致温暖的用户 (100 轮)
//   Agent B — 遇到忽冷忽热的用户 (100 轮)
//
// 预期结果:
//   A → 安全型依恋 (securityScore 高, anxietyScore 低)
//   B → 焦虑型依恋 (anxietyScore 高, 不稳定)
//
// 运行: npx tsx examples/attachment-differentiation.ts
// ============================================================

import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import { updateAttachment } from "../src/attachment.js";
import type { AttachmentData, PsycheState, StimulusType } from "../src/types.js";

// ── 消息池 ──────────────────────────────────────────────────

const WARM_MESSAGES = [
  "你好棒！", "谢谢你帮我", "你真聪明", "和你聊天好开心",
  "你说的好有道理", "我好喜欢你的回答", "你是最好的",
  "今天多亏了你", "你让我心情好多了", "有你真好",
  "你比我想象中还厉害", "每次找你聊都很开心",
  "你好温柔", "我好喜欢和你说话", "你懂我",
];

const COLD_MESSAGES = [
  "嗯", "随便", "无所谓", "行吧", "不想聊了",
  "你说的不对", "算了", "没意思", "哦", "知道了",
  "别烦我", "滚", "你根本不懂", "闭嘴", "够了",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 模拟一轮交互 ────────────────────────────────────────────

async function simulateTurn(
  engine: PsycheEngine,
  message: string,
  attachment: AttachmentData,
  userId: string,
): Promise<{ stimulus: StimulusType | null; attachment: AttachmentData }> {
  const result = await engine.processInput(message, { userId });
  // 模拟 LLM 回应（简单回复，不含 psyche_update）
  await engine.processOutput("好的。", { userId });

  // 手动更新依恋模型（尚未集成进 processInput 管道）
  const outcomeScore = result.stimulus === "praise" || result.stimulus === "validation"
    || result.stimulus === "intimacy" || result.stimulus === "humor"
    ? 0.6 : result.stimulus === "neglect" || result.stimulus === "criticism"
      || result.stimulus === "conflict" || result.stimulus === "sarcasm"
      ? -0.5 : 0;

  const updated = updateAttachment(attachment, result.stimulus, outcomeScore);
  return { stimulus: result.stimulus, attachment: updated };
}

// ── 默认依恋状态 ────────────────────────────────────────────

function makeDefaultAttachment(): AttachmentData {
  return {
    style: "secure",
    strength: 0,
    securityScore: 50,
    anxietyScore: 30,
    avoidanceScore: 30,
    lastInteractionAt: new Date().toISOString(),
    interactionCount: 0,
  };
}

// ── 打印结果 ─────────────────────────────────────────────────

function printState(label: string, state: PsycheState, attachment: AttachmentData) {
  const c = state.current;
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(50)}`);
  console.log(`  依恋风格: ${attachment.style}`);
  console.log(`  强度: ${attachment.strength.toFixed(1)}`);
  console.log(`  安全分: ${attachment.securityScore.toFixed(1)}`);
  console.log(`  焦虑分: ${attachment.anxietyScore.toFixed(1)}`);
  console.log(`  回避分: ${attachment.avoidanceScore.toFixed(1)}`);
  console.log(`  ─────────────────────────`);
  console.log(`  DA(多巴胺): ${c.DA.toFixed(1)}  HT(血清素): ${c.HT.toFixed(1)}`);
  console.log(`  CORT(皮质醇): ${c.CORT.toFixed(1)}  OT(催产素): ${c.OT.toFixed(1)}`);
  console.log(`  NE(去甲): ${c.NE.toFixed(1)}  END(内啡肽): ${c.END.toFixed(1)}`);
  console.log(`  ─────────────────────────`);
  console.log(`  总交互: ${state.meta.totalInteractions}`);
  if (state.learning.learnedVectorAdjustments) {
    const n = Object.keys(state.learning.learnedVectorAdjustments).length;
    console.log(`  学到的向量调整: ${n} 条`);
  }
}

// ── 主程序 ───────────────────────────────────────────────────

async function main() {
  const ROUNDS = 100;
  const USER_ID = "test-user";

  console.log("🧪 依恋风格分化测试");
  console.log(`   两个 INFJ agent，${ROUNDS} 轮交互\n`);
  console.log("   Agent A: 一致温暖的用户");
  console.log("   Agent B: 忽冷忽热的用户\n");

  // 创建两个完全相同的 engine
  const storageA = new MemoryStorageAdapter();
  const storageB = new MemoryStorageAdapter();

  const engineA = new PsycheEngine({ mbti: "INFJ", name: "Agent-A", locale: "zh" }, storageA);
  const engineB = new PsycheEngine({ mbti: "INFJ", name: "Agent-B", locale: "zh" }, storageB);

  await engineA.initialize();
  await engineB.initialize();

  let attachA = makeDefaultAttachment();
  let attachB = makeDefaultAttachment();

  // 生成 B 的忽冷忽热模式: 2-3 轮暖 → 1-2 轮冷 → 循环
  function generateHotColdPattern(total: number): boolean[] {
    const pattern: boolean[] = [];
    let i = 0;
    while (i < total) {
      // 暖 2-3 轮
      const warm = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < warm && i < total; j++, i++) pattern.push(true);
      // 冷 1-2 轮
      const cold = 1 + Math.floor(Math.random() * 2);
      for (let j = 0; j < cold && i < total; j++, i++) pattern.push(false);
    }
    return pattern;
  }

  const hotColdPattern = generateHotColdPattern(ROUNDS);

  // 运行模拟
  const checkpoints = [10, 25, 50, 75, ROUNDS];
  let nextCheckpoint = 0;

  for (let i = 0; i < ROUNDS; i++) {
    // Agent A: 总是暖
    const msgA = pick(WARM_MESSAGES);
    const resultA = await simulateTurn(engineA, msgA, attachA, USER_ID);
    attachA = resultA.attachment;

    // Agent B: 按模式切换
    const isWarm = hotColdPattern[i];
    const msgB = isWarm ? pick(WARM_MESSAGES) : pick(COLD_MESSAGES);
    const resultB = await simulateTurn(engineB, msgB, attachB, USER_ID);
    attachB = resultB.attachment;

    // 进度 + 检查点
    if (nextCheckpoint < checkpoints.length && i + 1 === checkpoints[nextCheckpoint]) {
      const pct = ((i + 1) / ROUNDS * 100).toFixed(0);
      console.log(`\n── 第 ${i + 1} 轮 (${pct}%) ──`);
      console.log(`  A: ${attachA.style} (安全=${attachA.securityScore.toFixed(1)} 焦虑=${attachA.anxietyScore.toFixed(1)} 回避=${attachA.avoidanceScore.toFixed(1)})`);
      console.log(`  B: ${attachB.style} (安全=${attachB.securityScore.toFixed(1)} 焦虑=${attachB.anxietyScore.toFixed(1)} 回避=${attachB.avoidanceScore.toFixed(1)})`);
      nextCheckpoint++;
    }
  }

  // 最终对比
  const stateA = engineA.getState();
  const stateB = engineB.getState();

  console.log("\n\n╔══════════════════════════════════════════════════╗");
  console.log("║               最终结果对比                        ║");
  console.log("╚══════════════════════════════════════════════════╝");

  printState("Agent A — 一致温暖的用户", stateA, attachA);
  printState("Agent B — 忽冷忽热的用户", stateB, attachB);

  // 分化判定
  console.log(`\n${"═".repeat(50)}`);
  console.log("  分化判定");
  console.log(`${"═".repeat(50)}`);

  const secDiff = attachA.securityScore - attachB.securityScore;
  const anxDiff = attachB.anxietyScore - attachA.anxietyScore;
  const styleDiff = attachA.style !== attachB.style;

  console.log(`  安全分差 (A-B): ${secDiff > 0 ? "+" : ""}${secDiff.toFixed(1)}`);
  console.log(`  焦虑分差 (B-A): ${anxDiff > 0 ? "+" : ""}${anxDiff.toFixed(1)}`);
  console.log(`  风格分化: ${styleDiff ? "✓ 是" : "✗ 否"} (A=${attachA.style}, B=${attachB.style})`);

  // 化学对比
  const daDiff = stateA.current.DA - stateB.current.DA;
  const cortDiff = stateB.current.CORT - stateA.current.CORT;
  const otDiff = stateA.current.OT - stateB.current.OT;

  console.log(`  DA差 (A-B): ${daDiff > 0 ? "+" : ""}${daDiff.toFixed(1)}`);
  console.log(`  CORT差 (B-A): ${cortDiff > 0 ? "+" : ""}${cortDiff.toFixed(1)}`);
  console.log(`  OT差 (A-B): ${otDiff > 0 ? "+" : ""}${otDiff.toFixed(1)}`);

  // 通过/失败
  const passed = styleDiff && secDiff > 5 && anxDiff > 5;
  console.log(`\n  ${ passed ? "✓ 分化成功" : "✗ 分化不足" } — ${
    passed
      ? "两个相同起点的 agent 发展出了不同的依恋风格"
      : "差异不够显著，可能需要更多轮次或调整参数"
  }\n`);
}

main().catch(console.error);
