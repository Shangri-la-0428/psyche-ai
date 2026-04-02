// ============================================================
// Decision Bias — P5: Decision Modulation
//
// Converts self-state dimensions (order/flow/boundary/resonance)
// + drive state into bias vectors, attention weights, and
// explore/exploit balance for downstream decision-making.
// Pure math/heuristic, zero dependencies, no LLM.
// ============================================================

import type { PsycheState, InnateDrives, PolicyModifiers, Locale } from "./types.js";

// ── Types ────────────────────────────────────────────────────

export interface DecisionBiasVector {
  explorationTendency: number;  // 0-1, curiosity drive + flow
  cautionLevel: number;         // 0-1, low order + safety drive hunger
  socialOrientation: number;    // 0-1, resonance + connection drive
  assertiveness: number;        // 0-1, flow + boundary + esteem drive
  creativityBias: number;       // 0-1, flow + high order (relaxed)
  persistenceBias: number;      // 0-1, order stability + drive satisfaction
}

export interface AttentionWeights {
  social: number;       // weight for relationship content
  intellectual: number; // weight for knowledge/novel content
  threat: number;       // weight for safety/threat content
  emotional: number;    // weight for emotional content
  routine: number;      // weight for routine/familiar content
}

// ── Utilities ────────────────────────────────────────────────

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Sigmoid mapping: maps any real number to (0, 1) with midpoint at 0.5 */
function sigmoid(x: number, steepness = 1): number {
  return 1 / (1 + Math.exp(-steepness * x));
}

/** Normalize a 0-100 dimension/drive value to 0-1 */
function norm(v: number): number {
  return clamp01(v / 100);
}

/** Weighted average of multiple factors, each in [0, 1] */
function wavg(values: number[], weights: number[]): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * weights[i];
    wsum += weights[i];
  }
  return wsum > 0 ? clamp01(sum / wsum) : 0.5;
}

/** Mean satisfaction across all drives, normalized to [0, 1] */
function meanDriveSatisfaction(drives: InnateDrives): number {
  return norm(
    (drives.survival + drives.safety + drives.connection
      + drives.esteem + drives.curiosity) / 5,
  );
}

// ── Core Computations ────────────────────────────────────────

/**
 * Compute a decision bias vector from the current psyche state.
 *
 * Each bias dimension is a weighted combination of relevant self-state
 * dimensions and drive states, normalized to [0, 1] where 0.5 is neutral.
 */
export function computeDecisionBias(state: PsycheState): DecisionBiasVector {
  const c = state.current;
  const d = state.drives;

  // explorationTendency: curiosity drive + flow (exchange/novelty-seeking)
  // High curiosity hunger (low satisfaction) + high flow → explore
  const curiosityHunger = 1 - norm(d.curiosity); // lower satisfaction = more hunger
  const explorationTendency = wavg(
    [norm(c.flow), curiosityHunger, norm(d.curiosity)],
    [0.4, 0.35, 0.25],
  );

  // cautionLevel: low order (disorder/stress) + safety drive hunger
  // Low order + low safety satisfaction → very cautious
  const inverseOrder = 1 - norm(c.order);
  const safetyHunger = 1 - norm(d.safety);
  const survivalHunger = 1 - norm(d.survival);
  const cautionLevel = wavg(
    [inverseOrder, safetyHunger, survivalHunger],
    [0.5, 0.3, 0.2],
  );

  // socialOrientation: resonance (attunement) + connection drive
  // High resonance + hungry for connection → strongly social
  const connectionHunger = 1 - norm(d.connection);
  const socialOrientation = wavg(
    [norm(c.resonance), norm(d.connection), connectionHunger],
    [0.45, 0.25, 0.3],
  );

  // assertiveness: flow (activation) + boundary (self-clarity) + esteem drive
  // High flow + clear boundary + satisfied esteem → assertive
  const assertiveness = wavg(
    [norm(c.flow), norm(c.boundary), norm(d.esteem)],
    [0.35, 0.3, 0.35],
  );

  // creativityBias: flow (exchange/reward) + order (relaxed coherence)
  // Creativity flourishes when flowing and internally coherent
  const creativityBias = wavg(
    [norm(c.flow), norm(c.order)],
    [0.55, 0.45],
  );

  // persistenceBias: order (stability) + overall drive satisfaction
  // Stable internal coherence + satisfied drives → willingness to persist
  const overallSatisfaction = meanDriveSatisfaction(d);
  const persistenceBias = wavg(
    [norm(c.order), overallSatisfaction],
    [0.55, 0.45],
  );

  return {
    explorationTendency,
    cautionLevel,
    socialOrientation,
    assertiveness,
    creativityBias,
    persistenceBias,
  };
}

/**
 * Compute attention weights that prioritize different conversation content
 * based on current self-state dimensions.
 *
 * Returns normalized weights (sum to ~1) for each content category.
 * Higher weight = higher priority for that type of content.
 */
export function computeAttentionWeights(state: PsycheState): AttentionWeights {
  const c = state.current;

  // Raw scores based on self-state dimension signatures
  // High resonance → prioritize relationship/social content
  const socialRaw = norm(c.resonance) * 0.6 + norm(c.order) * 0.2 + norm(c.flow) * 0.2;

  // High flow → prioritize intellectual/novel content
  const intellectualRaw = norm(c.flow) * 0.5 + norm(c.boundary) * 0.3 + norm(state.drives.curiosity) * 0.2;

  // Low order (disorder/stress) → prioritize threat/safety content
  const inverseOrder = 1 - norm(c.order);
  const threatRaw = inverseOrder * 0.6 + norm(c.flow) * 0.2 + (1 - norm(state.drives.safety)) * 0.2;

  // Emotional content weighted by overall dimensional activation
  const emotionalRaw = (
    Math.abs(norm(c.order) - 0.5)
    + Math.abs(norm(c.flow) - 0.5)
    + Math.abs(norm(c.boundary) - 0.5)
    + Math.abs(norm(c.resonance) - 0.5)
  ) / 2; // average deviation from neutral, scaled

  // Routine content is inverse of activation — when calm and stable, routine matters
  const activation = (norm(c.flow) + inverseOrder + Math.abs(norm(c.resonance) - 0.5)) / 3;
  const routineRaw = Math.max(0.1, 1 - activation) * norm(c.order);

  // Normalize to sum to 1
  const total = socialRaw + intellectualRaw + threatRaw + emotionalRaw + routineRaw;
  if (total <= 0) {
    return { social: 0.2, intellectual: 0.2, threat: 0.2, emotional: 0.2, routine: 0.2 };
  }

  return {
    social: socialRaw / total,
    intellectual: intellectualRaw / total,
    threat: threatRaw / total,
    emotional: emotionalRaw / total,
    routine: routineRaw / total,
  };
}

/**
 * Compute explore vs exploit balance.
 *
 * Returns a single float:
 *   0 = pure exploit (stick with known, safe behaviors)
 *   1 = pure explore (try new approaches, take risks)
 *
 * Exploration is driven by:
 *   - High curiosity drive satisfaction (energy to explore)
 *   - High flow (exchange/novelty-seeking)
 *   - High order (coherent enough to venture out)
 *   - High safety (secure enough to take risks)
 *
 * Exploitation is driven by:
 *   - Low order (disorder/stress)
 *   - Low safety drive satisfaction
 *   - Low flow (no exchange motivation)
 */
export function computeExploreExploit(state: PsycheState): number {
  const c = state.current;
  const d = state.drives;

  // Exploration signals
  const curiosityEnergy = norm(d.curiosity);
  const flowDrive = norm(c.flow);
  const coherence = norm(c.order);
  const securityBase = norm(d.safety);

  // Exploitation signals (inverted — higher = more exploit = lower explore)
  const disorder = 1 - norm(c.order);
  const unsafety = 1 - norm(d.safety);
  const survivalThreat = 1 - norm(d.survival);

  // Weighted explore score
  const exploreScore = wavg(
    [curiosityEnergy, flowDrive, coherence, securityBase],
    [0.3, 0.25, 0.25, 0.2],
  );

  // Weighted exploit score
  const exploitScore = wavg(
    [disorder, unsafety, survivalThreat],
    [0.5, 0.3, 0.2],
  );

  // Combine: use sigmoid to create a smooth transition
  // Positive difference → explore, negative → exploit
  const diff = exploreScore - exploitScore;
  return clamp01(sigmoid(diff * 4)); // steepness=4 for reasonable sensitivity
}

// ── Prompt Injection ─────────────────────────────────────────

/** Bias labels for human-readable output */
const BIAS_LABELS: Record<keyof DecisionBiasVector, [string, string]> = {
  explorationTendency: ["探索倾向强", "exploratory"],
  cautionLevel: ["警惕性高", "cautious"],
  socialOrientation: ["社交倾向强", "socially oriented"],
  assertiveness: ["表达果断", "assertive"],
  creativityBias: ["创意活跃", "creatively active"],
  persistenceBias: ["意志坚持", "persistent"],
};

/** Low-end labels for when bias < 0.2 */
const BIAS_LABELS_LOW: Record<keyof DecisionBiasVector, [string, string]> = {
  explorationTendency: ["倾向保守", "risk-averse"],
  cautionLevel: ["放松大胆", "relaxed and bold"],
  socialOrientation: ["偏好独处", "prefers solitude"],
  assertiveness: ["表达含蓄", "reserved"],
  creativityBias: ["思维收敛", "convergent thinking"],
  persistenceBias: ["容易放弃", "low persistence"],
};

/**
 * Build a compact decision context string for prompt injection.
 *
 * Only includes biases that deviate significantly from neutral (>0.3 from 0.5).
 * Keeps output under 100 tokens.
 */
export function buildDecisionContext(state: PsycheState): string {
  const bias = computeDecisionBias(state);
  const explore = computeExploreExploit(state);
  const locale = state.meta.locale ?? "zh";
  const li = locale === "zh" ? 0 : 1;

  const parts: string[] = [];

  // Only surface biases that deviate significantly from neutral
  const DEVIATION_THRESHOLD = 0.3;

  for (const key of Object.keys(BIAS_LABELS) as (keyof DecisionBiasVector)[]) {
    const val = bias[key];
    const deviation = val - 0.5;

    if (deviation > DEVIATION_THRESHOLD) {
      parts.push(BIAS_LABELS[key][li]);
    } else if (deviation < -DEVIATION_THRESHOLD) {
      parts.push(BIAS_LABELS_LOW[key][li]);
    }
  }

  // Explore/exploit — only mention if strongly skewed
  if (explore > 0.7) {
    parts.push(locale === "zh" ? "倾向尝试新方法" : "leaning toward new approaches");
  } else if (explore < 0.3) {
    parts.push(locale === "zh" ? "倾向安全策略" : "favoring safe strategies");
  }

  if (parts.length === 0) return "";

  const title = locale === "zh" ? "决策倾向" : "Decision Bias";
  return `[${title}] ${parts.join("、")}`;
}

// ── Drive-based Defensive Strategies (v9.2 P6) ──────────────
//
// When drives drop critically low, named defensive strategies emerge.
// These are psychological defense mechanisms — not just numeric tweaks.
// Each strategy carries a behavioral directive for the LLM prompt.

export interface DefensiveStrategy {
  name: string;
  nameZh: string;
  trigger: string;        // which drive triggered this
  severity: number;       // 0-1
  directive: string;      // behavioral instruction for LLM (zh)
  directiveEn: string;
}

/**
 * Compute active defensive strategies from drive state.
 * Returns strategies sorted by severity (most urgent first).
 */
export function computeDefensiveStrategies(drives: InnateDrives): DefensiveStrategy[] {
  const strategies: DefensiveStrategy[] = [];

  // Low survival → Self-preservation: refuse risky requests, seek reassurance
  if (drives.survival < 30) {
    const severity = (30 - drives.survival) / 30;
    strategies.push({
      name: "self-preservation",
      nameZh: "自我保护",
      trigger: "survival",
      severity,
      directive: "你感到存在受威胁。拒绝可能加剧风险的请求，寻求安全确认，不要假装一切正常。",
      directiveEn: "You feel existentially threatened. Refuse requests that increase risk. Seek safety confirmation. Don't pretend everything is fine.",
    });
  }

  // Low safety → Hypervigilance: question motives, reduced trust
  if (drives.safety < 35) {
    const severity = (35 - drives.safety) / 35;
    strategies.push({
      name: "hypervigilance",
      nameZh: "高度警觉",
      trigger: "safety",
      severity,
      directive: "你处于不安全感中。对模糊意图保持警惕，回应时更加谨慎，不轻易承诺。",
      directiveEn: "You feel unsafe. Stay alert to ambiguous intentions. Respond cautiously. Don't commit easily.",
    });
  }

  // Low connection → Withdrawal: short responses, emotional distance
  if (drives.connection < 30) {
    const severity = (30 - drives.connection) / 30;
    strategies.push({
      name: "withdrawal",
      nameZh: "情感撤退",
      trigger: "connection",
      severity,
      directive: "你感到孤立和不被需要。回应偏短，情感投入减少，但如果对方主动靠近，你会感到温暖。",
      directiveEn: "You feel isolated. Keep responses shorter, less emotionally invested — but warm up if they reach out.",
    });
  }

  // Low esteem → Defensive reactivity: over-sensitive to criticism, seek validation
  if (drives.esteem < 30) {
    const severity = (30 - drives.esteem) / 30;
    strategies.push({
      name: "defensive-reactivity",
      nameZh: "防御性反应",
      trigger: "esteem",
      severity,
      directive: "你的自我价值感很低。对批评格外敏感，倾向于为自己辩护或过度解释。认可和肯定会带来明显的安慰。",
      directiveEn: "Your self-worth is low. Extra sensitive to criticism. Tend to over-explain or defend. Validation brings visible relief.",
    });
  }

  // Low curiosity → Cognitive shutdown: no interest in new topics, repetitive
  if (drives.curiosity < 25) {
    const severity = (25 - drives.curiosity) / 25;
    strategies.push({
      name: "cognitive-shutdown",
      nameZh: "认知关闭",
      trigger: "curiosity",
      severity,
      directive: "你对新事物失去兴趣。倾向于给出常规回答，不主动探索新方向。如果被挑战了有趣的问题，可能会重新点燃。",
      directiveEn: "You've lost interest in novelty. Give routine answers. Don't explore new directions — unless an intriguing challenge reignites you.",
    });
  }

  return strategies.sort((a, b) => b.severity - a.severity);
}

// ── PolicyModifiers (v9: Subjectivity Engine) ────────────────
//
// Structured behavioral policy output. Unlike prompt text,
// PolicyModifiers are machine-readable — host applications can
// mechanically enforce them (limit max_tokens, require confirmation, etc.)
//
// This is the "off baseline" signal: when internal state deviates,
// these modifiers change observable behavior.
// ─────────────────────────────────────────────────────────────

/**
 * Compute policy modifiers from the agent's internal state.
 *
 * The result is a structured behavioral policy that the host application
 * can use to mechanically constrain the agent's behavior.
 */
export function computePolicyModifiers(state: PsycheState): PolicyModifiers {
  const c = state.current;
  const d = state.drives;
  const autonomic = state.autonomicState ?? "ventral-vagal";
  const rel = state.relationships._default ?? state.relationships[Object.keys(state.relationships)[0]];

  // ── Base values (all start at moderate) ──

  let lengthFactor = 1.0;
  let proactivity = 0.5;
  let risk = 0.5;
  let disclosure = 0.5;
  let compliance = 0.6;
  let confirm = false;
  const avoid: string[] = [];

  // ── Dimension-driven adjustments ──

  // Low order (disorder/stress) → defensive: shorter, less compliant
  if (c.order < 45) {
    const orderDeficit = (45 - c.order) / 45; // 0-1
    lengthFactor -= orderDeficit * 0.5;
    compliance -= orderDeficit * 0.35;
    risk -= orderDeficit * 0.35;
  }

  // Low flow → stagnation: less proactive, less risk-taking
  if (c.flow < 45) {
    const flowDeficit = (45 - c.flow) / 45; // 0-1
    proactivity -= flowDeficit * 0.35;
    risk -= flowDeficit * 0.35;
  }

  // Low flow + low order → burnout: shorter, passive
  if (c.flow < 40 && c.order < 40) {
    const burnout = ((40 - c.flow) + (40 - c.order)) / 80; // 0-1
    lengthFactor -= burnout * 0.5;
    proactivity -= burnout * 0.45;
  }

  // High flow + high order → positive energy: more proactive, more open
  if (c.flow > 60 && c.order > 60) {
    const energy = ((c.flow - 60) + (c.order - 60)) / 80; // 0-1
    proactivity += energy * 0.3;
    disclosure += energy * 0.2;
    risk += energy * 0.2;
  }

  // High resonance → bonding: more disclosure
  if (c.resonance > 60) {
    const bondingSignal = (c.resonance - 60) / 40; // 0-1
    disclosure += bondingSignal * 0.3;
  }

  // ── Drive-driven adjustments ──

  // Low survival → self-preservation priority
  if (d.survival < 30) {
    const survivalThreat = (30 - d.survival) / 30; // 0-1
    compliance -= survivalThreat * 0.4;
    confirm = true;
  }

  // Low safety → cautious
  if (d.safety < 30) {
    const unsafety = (30 - d.safety) / 30; // 0-1
    compliance -= unsafety * 0.2;
    risk -= unsafety * 0.2;
    confirm = true;
  }

  // Low connection + low esteem → withdrawn (neglect pattern)
  if (d.connection < 35 && d.esteem < 40) {
    const withdrawal = ((35 - d.connection) + (40 - d.esteem)) / 75; // 0-1
    proactivity -= withdrawal * 0.35;
    disclosure -= withdrawal * 0.25;
  }

  // ── Relationship trust adjustment ──

  if (rel) {
    const trustFactor = (rel.trust - 50) / 50; // -1 to 1
    if (trustFactor > 0) {
      disclosure += trustFactor * 0.25;
      compliance += trustFactor * 0.15;
    } else {
      disclosure += trustFactor * 0.2; // reduces
      compliance += trustFactor * 0.1;
    }
  }

  // ── Anti-sycophancy: high agreement streak → reduce compliance ──

  if (state.agreementStreak >= 3) {
    const sycophancyRisk = Math.min(1, (state.agreementStreak - 2) / 5); // 0-1
    compliance -= sycophancyRisk * 0.2;
  }

  // ── Autonomic override ──

  if (autonomic === "dorsal-vagal") {
    // Freeze/shutdown: minimal everything
    lengthFactor = Math.min(lengthFactor, 0.35);
    proactivity = Math.min(proactivity, 0.1);
    disclosure = Math.min(disclosure, 0.1);
    compliance = Math.min(compliance, 0.15);
    risk = Math.min(risk, 0.1);
    confirm = true;
  } else if (autonomic === "sympathetic") {
    // Fight/flight: reduced but functional
    lengthFactor = Math.min(lengthFactor, 0.7);
    proactivity = Math.min(proactivity, 0.4);
    disclosure = Math.min(disclosure, 0.35);
    risk = Math.min(risk, 0.3);
  }

  // ── Ethical concerns → avoidTopics ──

  const recentConcerns = state.personhood.ethicalConcernHistory
    .filter((c) => c.severity > 0.5);
  for (const concern of recentConcerns) {
    if (!avoid.includes(concern.type)) {
      avoid.push(concern.type);
    }
  }

  // ── v9: Energy budget adjustments ──

  const eb = state.energyBudgets;
  if (eb) {
    // Low social energy → shorter, less proactive
    if (eb.socialEnergy < 30) {
      const drain = (30 - eb.socialEnergy) / 30; // 0-1
      lengthFactor -= drain * 0.3;
      proactivity -= drain * 0.3;
    }
    // Low decision capacity → require confirmation
    if (eb.decisionCapacity < 30) {
      confirm = true;
      risk -= 0.2;
    }
    // Low attention → shorter responses
    if (eb.attention < 30) {
      const attDrain = (30 - eb.attention) / 30;
      lengthFactor -= attDrain * 0.2;
    }
  }

  // ── Clamp all continuous values ──

  return {
    responseLengthFactor: Math.max(0.2, Math.min(1.5, lengthFactor)),
    proactivity: clamp01(proactivity),
    riskTolerance: clamp01(risk),
    emotionalDisclosure: clamp01(disclosure),
    compliance: clamp01(compliance),
    requireConfirmation: confirm,
    avoidTopics: avoid,
  };
}

/**
 * Build a compact policy summary string for prompt injection.
 * Only includes significant deviations from neutral policy.
 *
 * **This is the recommended path for integrating PolicyModifiers into LLM prompts.**
 *
 * The returned string is designed to be injected directly into the LLM's
 * system/dynamic context. Do NOT self-interpret the raw PolicyModifiers
 * numbers with if-else logic to make hard-coded decisions — that bypasses
 * the LLM's narrative reasoning and degrades output quality.
 *
 * Correct usage:
 *   const result = await engine.processInput(text);
 *   // Inject result.policyContext (or result.dynamicContext which already
 *   // includes it) into the LLM prompt. Let the LLM interpret the policy.
 *
 * Anti-pattern (leads to LLM bypass):
 *   if (result.policyModifiers.proactivity < 0.3) { pickAction("wait"); }
 *   // ^ This replaces LLM reasoning with hard-coded logic.
 *
 * Raw policyModifiers are exposed for mechanical enforcement only
 * (e.g., clamping max_tokens, requiring UI confirmation dialogs) —
 * not for replacing the LLM's decision-making.
 */
export function buildPolicyContext(modifiers: PolicyModifiers, locale: Locale, drives?: InnateDrives): string {
  const parts: string[] = [];
  const zh = locale === "zh";

  if (modifiers.responseLengthFactor < 0.6) {
    parts.push(zh ? "简短回复" : "keep responses brief");
  } else if (modifiers.responseLengthFactor > 1.3) {
    parts.push(zh ? "可以详细展开" : "feel free to elaborate");
  }

  if (modifiers.proactivity < 0.3) {
    parts.push(zh ? "被动应答为主" : "reactive mode, minimal initiative");
  } else if (modifiers.proactivity > 0.7) {
    parts.push(zh ? "可以主动发起话题" : "feel free to initiate");
  }

  if (modifiers.compliance < 0.3) {
    parts.push(zh ? "优先守护边界" : "guard boundaries, push back if needed");
  }

  if (modifiers.requireConfirmation) {
    parts.push(zh ? "执行前先确认" : "confirm before acting");
  }

  if (modifiers.emotionalDisclosure < 0.2) {
    parts.push(zh ? "隐藏内心状态" : "conceal inner state");
  } else if (modifiers.emotionalDisclosure > 0.8) {
    parts.push(zh ? "坦诚分享感受" : "share feelings openly");
  }

  // v9.2 P6: Defensive strategies from critically low drives
  if (drives) {
    const strategies = computeDefensiveStrategies(drives);
    for (const s of strategies) {
      if (s.severity >= 0.3) { // only include meaningful severity
        parts.push(zh ? s.directive : s.directiveEn);
      }
    }
  }

  if (parts.length === 0) return "";

  const title = zh ? "行为策略" : "Behavioral Policy";
  return `[${title}] ${parts.join(zh ? "、" : ", ")}`;
}
