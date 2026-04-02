// ============================================================
// Self-Recognition (镜像自我) — Pattern Detection in Emotional History
//
// Pure computation, zero LLM calls.
// Enables the agent to perceive recurring triggers, emotional tendencies,
// and build a coherent self-narrative from its own history.
// ============================================================

import type { StateSnapshot, StimulusType, Locale } from "./types.js";

/** Result of self-reflection over emotional history */
export interface SelfReflection {
  recurringTriggers: { stimulus: StimulusType; count: number }[];
  tendency: "stable" | "ascending" | "descending" | "volatile" | "oscillating";
  dominantEmotion: string | null;
  narrativeSummary: string;
}

/**
 * Compute a self-reflection from the agent's emotional history.
 *
 * Analyzes stimulus frequencies, dominant emotions, and dimension trends
 * to build an awareness of recurring patterns.
 */
export function computeSelfReflection(history: StateSnapshot[], locale: Locale): SelfReflection {
  // Not enough history for meaningful reflection
  if (history.length < 3) {
    return {
      recurringTriggers: [],
      tendency: "stable",
      dominantEmotion: null,
      narrativeSummary: locale === "zh"
        ? "历史记录不足，尚未形成自我觉察。"
        : "Not enough history for self-awareness yet.",
    };
  }

  // ── Recurring triggers ──
  const stimulusCounts = new Map<string, number>();
  for (const snap of history) {
    if (snap.stimulus) {
      stimulusCounts.set(snap.stimulus, (stimulusCounts.get(snap.stimulus) ?? 0) + 1);
    }
  }
  const sortedTriggers = [...stimulusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([_, count]) => count >= 2)
    .map(([stimulus, count]) => ({ stimulus: stimulus as StimulusType, count }));

  // ── Dominant emotion ──
  const emotionCounts = new Map<string, number>();
  for (const snap of history) {
    if (snap.dominantEmotion) {
      emotionCounts.set(snap.dominantEmotion, (emotionCounts.get(snap.dominantEmotion) ?? 0) + 1);
    }
  }
  let dominantEmotion: string | null = null;
  let maxEmotionCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > maxEmotionCount) {
      maxEmotionCount = count;
      dominantEmotion = emotion;
    }
  }

  // ── Tendency ──
  const tendency = computeEmotionalTendency(history);

  // ── Narrative summary ──
  const narrativeSummary = buildNarrativeSummary(sortedTriggers, tendency, dominantEmotion, locale);

  return { recurringTriggers: sortedTriggers, tendency, dominantEmotion, narrativeSummary };
}

/**
 * Compute the emotional tendency from state history.
 *
 * Compares first-half vs second-half averages for flow and order,
 * checks variance for volatility, and detects oscillation patterns.
 */
export function computeEmotionalTendency(history: StateSnapshot[]): SelfReflection["tendency"] {
  if (history.length < 3) return "stable";

  const mid = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, mid);
  const secondHalf = history.slice(mid);

  const avgFlow1 = average(firstHalf.map((s) => s.state.flow));
  const avgFlow2 = average(secondHalf.map((s) => s.state.flow));
  const avgOrder1 = average(firstHalf.map((s) => s.state.order));
  const avgOrder2 = average(secondHalf.map((s) => s.state.order));

  // Directional trends (check first — a steady ramp has high stddev but clear direction)
  const flowRising = avgFlow2 - avgFlow1 > 5;
  const flowFalling = avgFlow1 - avgFlow2 > 5;
  const orderRising = avgOrder2 - avgOrder1 > 5;
  const orderFalling = avgOrder1 - avgOrder2 > 5;

  if (flowRising && orderRising) return "ascending";
  if (flowFalling && orderFalling) return "descending";

  // Check volatility — only when there's no clear directional trend
  const allFlow = history.map((s) => s.state.flow);
  const flowStddev = stddev(allFlow);
  if (flowStddev > 15) {
    if (isOscillating(allFlow)) return "oscillating";
    return "volatile";
  }

  // Weaker signals: flow alone
  if (flowRising) return "ascending";
  if (flowFalling) return "descending";

  return "stable";
}

/**
 * Build a prompt-injectable self-reflection context block.
 *
 * Returns empty string when there's nothing notable to report
 * (stable tendency, no recurring triggers, minimal history).
 */
export function buildSelfReflectionContext(reflection: SelfReflection, locale: Locale): string {
  // Nothing notable — skip injection
  if (
    reflection.tendency === "stable" &&
    reflection.recurringTriggers.length === 0 &&
    !reflection.dominantEmotion
  ) {
    return "";
  }

  const isZh = locale === "zh";
  const title = isZh ? "自我觉察" : "Self-awareness";
  const lines: string[] = [`[${title}]`];

  // Recurring triggers
  if (reflection.recurringTriggers.length > 0) {
    const triggerDescs = reflection.recurringTriggers.map((t) => {
      const name = isZh ? STIMULUS_NAMES_ZH[t.stimulus] : t.stimulus;
      return isZh
        ? `${name}(${t.count}次)`
        : `${name} (${t.count} times)`;
    });
    lines.push(
      isZh
        ? `你最近容易被${triggerDescs.join("、")}打动。`
        : `You've been frequently triggered by ${triggerDescs.join(", ")}.`,
    );
  }

  // Tendency
  if (reflection.tendency !== "stable") {
    const tendencyDesc = isZh
      ? TENDENCY_DESC_ZH[reflection.tendency]
      : TENDENCY_DESC_EN[reflection.tendency];
    lines.push(tendencyDesc);
  }

  // Dominant emotion
  if (reflection.dominantEmotion) {
    lines.push(
      isZh
        ? `主导情绪倾向: ${reflection.dominantEmotion}。`
        : `Dominant emotional tendency: ${reflection.dominantEmotion}.`,
    );
  }

  return lines.join("\n");
}

// ── Internal helpers ─────────────────────────────────────────

const STIMULUS_NAMES_ZH: Record<string, string> = {
  praise: "赞美", criticism: "批评", humor: "幽默", intellectual: "智识讨论",
  intimacy: "亲密", conflict: "冲突", neglect: "冷落", surprise: "惊喜",
  casual: "闲聊", sarcasm: "讽刺", authority: "命令", validation: "认同",
  boredom: "无聊", vulnerability: "示弱",
};

const TENDENCY_DESC_ZH: Record<string, string> = {
  ascending: "情绪整体上扬，状态在变好。",
  descending: "情绪整体下滑，压力在积累。",
  volatile: "情绪波动剧烈，起伏不定。",
  oscillating: "情绪反复震荡，忽高忽低。",
};

const TENDENCY_DESC_EN: Record<string, string> = {
  ascending: "Trending upward emotionally, things are improving.",
  descending: "Trending downward, stress is accumulating.",
  volatile: "Emotionally volatile, large swings.",
  oscillating: "Oscillating back and forth emotionally.",
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Detect oscillation: count direction changes in the sequence.
 * If more than half the transitions are direction changes, it's oscillating.
 */
function isOscillating(values: number[]): boolean {
  if (values.length < 4) return false;
  let changes = 0;
  for (let i = 2; i < values.length; i++) {
    const prev = values[i - 1] - values[i - 2];
    const curr = values[i] - values[i - 1];
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      changes++;
    }
  }
  return changes >= (values.length - 2) * 0.6;
}

function buildNarrativeSummary(
  triggers: SelfReflection["recurringTriggers"],
  tendency: SelfReflection["tendency"],
  dominantEmotion: string | null,
  locale: Locale,
): string {
  const isZh = locale === "zh";
  const parts: string[] = [];

  if (triggers.length > 0) {
    const topTrigger = triggers[0];
    const name = isZh ? STIMULUS_NAMES_ZH[topTrigger.stimulus] : topTrigger.stimulus;
    parts.push(
      isZh
        ? `最近${name}是主要触发因素(${topTrigger.count}次)`
        : `Recently ${name} has been the main trigger (${topTrigger.count} times)`,
    );
  }

  if (tendency !== "stable") {
    const desc = isZh ? TENDENCY_DESC_ZH[tendency] : TENDENCY_DESC_EN[tendency];
    parts.push(desc.replace(/。$/, "").replace(/\.$/, ""));
  }

  if (dominantEmotion) {
    parts.push(
      isZh
        ? `主要情绪是${dominantEmotion}`
        : `the dominant emotion has been ${dominantEmotion}`,
    );
  }

  if (parts.length === 0) {
    return isZh ? "情绪状态平稳。" : "Emotional state has been stable.";
  }

  return isZh
    ? parts.join("，") + "。"
    : parts[0] + (parts.length > 1 ? ", " + parts.slice(1).join(", ") : "") + ".";
}
