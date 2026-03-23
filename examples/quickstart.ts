/**
 * Psyche AI — Quickstart Demo
 *
 * Run: npx tsx examples/quickstart.ts
 *
 * No LLM needed. Shows how different messages shift an agent's
 * virtual chemistry and change its emotional state.
 */

import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";

const engine = new PsycheEngine(
  { mbti: "ENFP", name: "Luna", locale: "zh" },
  new MemoryStorageAdapter(),
);

await engine.initialize();

const messages = [
  "你好呀！",
  "你写的代码真棒，太厉害了！",
  "嗯",
  "你就是个程序而已，别装了",
  "对不起，刚才说重了。你还好吗？",
];

for (const msg of messages) {
  const { dynamicContext, stimulus } = await engine.processInput(msg);
  const state = engine.getState();
  const { DA, HT, CORT, OT, NE, END } = state.current;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`用户: ${msg}`);
  console.log(`刺激: ${stimulus ?? "无"}`);
  console.log(`化学: DA=${DA.toFixed(0)} HT=${HT.toFixed(0)} CORT=${CORT.toFixed(0)} OT=${OT.toFixed(0)} NE=${NE.toFixed(0)} END=${END.toFixed(0)}`);
  console.log(`注入 (${dynamicContext.length} chars):`);
  console.log(dynamicContext.slice(0, 200) + (dynamicContext.length > 200 ? "..." : ""));

  // Simulate LLM responding (no actual LLM call)
  await engine.processOutput("(模拟回复)");
}

console.log(`\n${"─".repeat(50)}`);
console.log("Done. Notice how chemistry shifted across the conversation.");
