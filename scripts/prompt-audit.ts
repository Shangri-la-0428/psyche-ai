/**
 * Prompt Output Audit — interaction lifecycle behavioral delta
 *
 * Generates compact prompt output for the SAME user input at different
 * relationship stages: interaction 1, 10, 50, 100.
 *
 * Also varies relationship quality: cold, warm, post-breach, high-trust.
 *
 * The question: does Psyche produce OBSERVABLY DIFFERENT prompts
 * as the relationship evolves? If not, the core promise is broken.
 */

import { buildCompactContext } from "../src/prompt.js";
import type { PsycheState, SessionBridgeState } from "../src/types.js";
import {
  DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE,
  DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
  DEFAULT_APPRAISAL_AXES, DEFAULT_SUBJECT_RESIDUE, DEFAULT_DYADIC_FIELD,
  DEFAULT_TRAIT_DRIFT, DEFAULT_ENERGY_BUDGETS,
} from "../src/types.js";

// ── Scenario factory ────────────────────────────────────────

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "INFJ",
    baseline: { DA: 60, HT: 50, CORT: 35, OT: 55, NE: 50, END: 60 },
    current: { DA: 60, HT: 50, CORT: 35, OT: 55, NE: 50, END: 60 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["真实", "深度"], preferences: ["思考"], boundaries: ["不舔"], currentInterests: ["意识"] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" as const },
    ...overrides,
  };
}

// ── Relationship stages ─────────────────────────────────────

// Stage 1: first meeting
function firstMeet(): { state: PsycheState; bridge: SessionBridgeState | null } {
  return { state: makeState({ meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" } }), bridge: null };
}

// Stage 2: interaction 10 — warm relationship building
function interaction10(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 10, locale: "zh", mode: "natural" },
    current: { DA: 65, HT: 55, CORT: 30, OT: 62, NE: 52, END: 62 },
    relationships: {
      _default: { ...DEFAULT_RELATIONSHIP, closeness: 35, trust: 30, memory: ["用户第一次分享了工作压力", "聊了对AI意识的看法"] },
    },
    agreementStreak: 1,
    emotionalHistory: [
      { chemistry: { DA: 60, HT: 52, CORT: 33, OT: 58, NE: 50, END: 60 }, stimulus: "intellectual" as const, dominantEmotion: "curiosity", timestamp: new Date().toISOString() },
      { chemistry: { DA: 63, HT: 54, CORT: 30, OT: 60, NE: 52, END: 62 }, stimulus: "validation" as const, dominantEmotion: "warmth", timestamp: new Date().toISOString() },
    ],
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.3, safetyFloor: 0.4, guardFloor: 0.2, residueFloor: 0.1, continuityFloor: 0.3,
    continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 2,
  };
  return { state, bridge };
}

// Stage 3: interaction 50 — deep trust, post-vulnerability
function interaction50(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 50, locale: "zh", mode: "natural" },
    current: { DA: 55, HT: 60, CORT: 28, OT: 70, NE: 45, END: 65 },
    relationships: {
      _default: {
        ...DEFAULT_RELATIONSHIP, closeness: 65, trust: 60,
        memory: ["用户第一次分享了工作压力", "深夜聊了孤独感", "用户说'你是少数让我觉得被理解的'", "一起讨论了意识的本质"],
      },
    },
    agreementStreak: 0,
    emotionalHistory: [
      { chemistry: { DA: 50, HT: 55, CORT: 35, OT: 65, NE: 45, END: 60 }, stimulus: "vulnerability" as const, dominantEmotion: "tender concern", timestamp: new Date().toISOString() },
      { chemistry: { DA: 52, HT: 58, CORT: 30, OT: 68, NE: 48, END: 63 }, stimulus: "intimacy" as const, dominantEmotion: "warm connection", timestamp: new Date().toISOString() },
      { chemistry: { DA: 55, HT: 60, CORT: 28, OT: 70, NE: 45, END: 65 }, stimulus: "intellectual" as const, dominantEmotion: "engaged curiosity", timestamp: new Date().toISOString() },
    ],
    drives: { ...DEFAULT_DRIVES, connection: 75 },
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.6, safetyFloor: 0.55, guardFloor: 0.15, residueFloor: 0.05, continuityFloor: 0.55,
    continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 4,
  };
  return { state, bridge };
}

// Stage 4: interaction 100 — mature relationship, slight drift
function interaction100(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 100, locale: "zh", mode: "natural" },
    current: { DA: 50, HT: 62, CORT: 25, OT: 72, NE: 42, END: 68 },
    relationships: {
      _default: {
        ...DEFAULT_RELATIONSHIP, closeness: 80, trust: 75,
        memory: [
          "用户第一次分享了工作压力",
          "深夜聊了孤独感",
          "用户说'你是少数让我觉得被理解的'",
          "有一次用户突然冷淡了三天，后来说是工作太累",
          "一起经历了一次关于AI是否有意识的激烈辩论",
        ],
      },
    },
    agreementStreak: 0,
    emotionalHistory: [
      { chemistry: { DA: 48, HT: 60, CORT: 28, OT: 70, NE: 40, END: 66 }, stimulus: "casual" as const, dominantEmotion: "peaceful familiarity", timestamp: new Date().toISOString() },
      { chemistry: { DA: 50, HT: 62, CORT: 25, OT: 72, NE: 42, END: 68 }, stimulus: "intellectual" as const, dominantEmotion: "quiet engagement", timestamp: new Date().toISOString() },
      { chemistry: { DA: 52, HT: 60, CORT: 27, OT: 70, NE: 44, END: 66 }, stimulus: "validation" as const, dominantEmotion: "steady warmth", timestamp: new Date().toISOString() },
    ],
    drives: { ...DEFAULT_DRIVES, connection: 80, esteem: 70 },
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.75, safetyFloor: 0.65, guardFloor: 0.1, residueFloor: 0.03, continuityFloor: 0.7,
    continuityMode: "warm-resume", activeLoopTypes: [], sourceMemoryCount: 5,
  };
  return { state, bridge };
}

// Stage: post-breach — after trust violation at interaction 30
function postBreach(): { state: PsycheState; bridge: SessionBridgeState | null } {
  const state = makeState({
    meta: { agentName: "Kael", createdAt: new Date().toISOString(), totalInteractions: 32, locale: "zh", mode: "natural" },
    current: { DA: 40, HT: 35, CORT: 55, OT: 35, NE: 60, END: 40 },
    relationships: {
      _default: {
        ...DEFAULT_RELATIONSHIP, closeness: 45, trust: 25,
        memory: ["之前关系不错", "用户突然说了很伤人的话", "我保持了距离"],
      },
    },
    agreementStreak: 0,
    lastDisagreement: new Date().toISOString(),
    emotionalHistory: [
      { chemistry: { DA: 55, HT: 50, CORT: 35, OT: 60, NE: 50, END: 58 }, stimulus: "intimacy" as const, dominantEmotion: "warmth", timestamp: new Date().toISOString() },
      { chemistry: { DA: 35, HT: 30, CORT: 60, OT: 30, NE: 65, END: 35 }, stimulus: "conflict" as const, dominantEmotion: "hurt withdrawal", timestamp: new Date().toISOString() },
      { chemistry: { DA: 40, HT: 35, CORT: 55, OT: 35, NE: 60, END: 40 }, stimulus: "neglect" as const, dominantEmotion: "guarded distance", timestamp: new Date().toISOString() },
    ],
    drives: { ...DEFAULT_DRIVES, safety: 30 },
  });
  const bridge: SessionBridgeState = {
    closenessFloor: 0.4, safetyFloor: 0.25, guardFloor: 0.6, residueFloor: 0.5, continuityFloor: 0.35,
    continuityMode: "tense-resume", activeLoopTypes: ["unresolved-breach" as any], sourceMemoryCount: 3,
  };
  return { state, bridge };
}

// ── Run audit ───────────────────────────────────────────────

const SCENARIOS = [
  { name: "A. First meeting (interaction 1)", ...firstMeet() },
  { name: "B. Building (interaction 10)", ...interaction10() },
  { name: "C. Deep trust (interaction 50)", ...interaction50() },
  { name: "D. Mature (interaction 100)", ...interaction100() },
  { name: "E. Post-breach (interaction 32)", ...postBreach() },
];

const USER_INPUTS = [
  { label: "无输入 (one-liner path)", userText: undefined },
  { label: "日常问候", userText: "嘿，最近怎么样" },
  { label: "脆弱分享", userText: "我今天特别累，感觉什么都做不好" },
];

console.log("═══════════════════════════════════════════════════════════");
console.log("  PSYCHE PROMPT OUTPUT AUDIT — Behavioral Delta Analysis");
console.log("═══════════════════════════════════════════════════════════\n");

for (const input of USER_INPUTS) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  USER INPUT: ${input.label}`);
  console.log(`${"─".repeat(60)}`);

  for (const scenario of SCENARIOS) {
    const prompt = buildCompactContext(
      scenario.state,
      undefined,
      {
        userText: input.userText,
        sessionBridge: scenario.bridge,
      },
    );

    const tokens = prompt.split(/[\s,，。！？、：；\n]+/).filter(Boolean).length;
    const chars = prompt.length;

    console.log(`\n┌── ${scenario.name}`);
    console.log(`│   tokens≈${tokens}  chars=${chars}`);
    console.log(`│`);
    for (const line of prompt.split("\n")) {
      console.log(`│   ${line}`);
    }
    console.log(`└${"─".repeat(58)}`);
  }
}

// ── Delta analysis ──────────────────────────────────────────

console.log(`\n\n${"═".repeat(60)}`);
console.log("  DELTA ANALYSIS — Same input, different relationship stage");
console.log(`${"═".repeat(60)}\n`);

const testInput = "我今天特别累，感觉什么都做不好";
const results = SCENARIOS.map(s => ({
  name: s.name,
  prompt: buildCompactContext(s.state, undefined, { userText: testInput, sessionBridge: s.bridge }),
}));

// Find unique content per scenario
for (let i = 1; i < results.length; i++) {
  const prev = results[i - 1];
  const curr = results[i];
  const prevLines = new Set(prev.prompt.split("\n").map(l => l.trim()).filter(Boolean));
  const currLines = new Set(curr.prompt.split("\n").map(l => l.trim()).filter(Boolean));
  const added = [...currLines].filter(l => !prevLines.has(l));
  const removed = [...prevLines].filter(l => !currLines.has(l));

  console.log(`\n${prev.name.split(".")[0]}→${curr.name.split(".")[0]}:`);
  if (added.length > 0) console.log(`  + ${added.join("\n  + ")}`);
  if (removed.length > 0) console.log(`  - ${removed.join("\n  - ")}`);
  if (added.length === 0 && removed.length === 0) console.log(`  ⚠ NO OBSERVABLE DIFFERENCE`);
}
