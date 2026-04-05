// ============================================================
// Prompt Injection — Build emotional context for LLM (v0.2)
// Imperative protocol, behavior guides, i18n
// ============================================================

import type { AmbientPriorView, PsycheState, SelfModel, Locale, SelfState, StateSnapshot, StimulusType, PsycheMode } from "./types.js";
import { DIMENSION_KEYS, DIMENSION_NAMES_ZH, DRIVE_KEYS, MODE_PROFILES } from "./types.js";
import { getExpressionHint, getBehaviorGuide, detectEmotions } from "./chemistry.js";
import { getRelationship } from "./psyche-file.js";
import { t } from "./i18n.js";
import { buildDriveContext, hasCriticalDrive } from "./drives.js";
import { computeSelfReflection, buildSelfReflectionContext } from "./self-recognition.js";
import type { AutonomicState } from "./autonomic.js";
import { gateEmotions } from "./autonomic.js";
import type { ChannelType } from "./channels.js";
import { getChannelProfile, buildChannelModifier } from "./channels.js";
import {
  deriveSnapshotAppraisalMarkers,
  getAppraisalMarkerLabels,
  type AppraisalMarker,
} from "./appraisal-markers.js";

export interface PromptRenderInputs {
  userText?: string;
  legacyStimulus?: string | null;
  ambientPriors?: AmbientPriorView[];
  ambientPriorContext?: string;
  personalityIntensity?: number;
  channelType?: ChannelType;
  metacognitiveNote?: string;
  decisionContext?: string;
  ethicsContext?: string;
  sharedIntentionalityContext?: string;
  experientialNarrative?: string;
  autonomicDescription?: string;
  autonomicState?: AutonomicState;
  primarySystemsDescription?: string;
  subjectivityContext?: string;
  responseContractContext?: string;
  policyContext?: string;
  /** Session bridge from applySessionBridge — makes first-turn continuity visible in prompt */
  sessionBridge?: import("./types.js").SessionBridgeState | null;
}

export function buildAmbientPriorContext(
  priors: AmbientPriorView[] | undefined,
  locale: Locale,
): string {
  const normalized = (priors ?? [])
    .map((prior) => ({
      summary: prior.summary.trim().replace(/\s+/g, " "),
      confidence: Math.max(0, Math.min(1, prior.confidence)),
      kind: prior.kind,
      goal: prior.goal,
      provider: prior.provider?.trim(),
    }))
    .filter((prior) => prior.summary.length > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  if (normalized.length === 0) return "";

  const confidenceLabel = (confidence: number): string => {
    if (locale === "zh") {
      if (confidence >= 0.8) return "高可信";
      if (confidence >= 0.55) return "中可信";
      return "低可信";
    }
    if (confidence >= 0.8) return "high confidence";
    if (confidence >= 0.55) return "medium confidence";
    return "low confidence";
  };

  const title = locale === "zh" ? "环境先验" : "Ambient Prior";
  const goal = normalized
    .map((prior) => prior.goal)
    .find((value): value is NonNullable<AmbientPriorView["goal"]> => Boolean(value));
  const goalLabel = (value: NonNullable<AmbientPriorView["goal"]>): string => {
    if (locale === "zh") {
      if (value === "explore") return "当前目标: 探索";
      if (value === "build") return "当前目标: 构建";
      if (value === "repair") return "当前目标: 修复";
      return "当前目标: 结算";
    }
    if (value === "explore") return "Current goal: explore";
    if (value === "build") return "Current goal: build";
    if (value === "repair") return "Current goal: repair";
    return "Current goal: settle";
  };
  const kindLabel = (kind: AmbientPriorView["kind"]): string => {
    if (locale === "zh") {
      if (kind === "failure-residue") return "风险";
      if (kind === "mixed-residue") return "未收敛";
      if (kind === "success-prior") return "稳定";
      return "环境";
    }
    if (kind === "failure-residue") return "warning";
    if (kind === "mixed-residue") return "unsettled";
    if (kind === "success-prior") return "stable";
    return "ambient";
  };
  const lines = normalized.map((prior) => {
    const source = prior.provider
      ? locale === "zh"
        ? `${prior.provider}: `
        : `${prior.provider}: `
      : "";
    return `- ${kindLabel(prior.kind)} · ${source}${prior.summary} (${confidenceLabel(prior.confidence)})`;
  });

  const heading = goal ? `${title} · ${goalLabel(goal)}` : title;
  return `[${heading}]\n${lines.join("\n")}`;
}

function pushLabeledSection(
  parts: string[],
  locale: Locale,
  titleZh: string,
  titleEn: string,
  content?: string,
): void {
  if (!content) return;
  parts.push("", `[${locale === "zh" ? titleZh : titleEn}] ${content}`);
}

function pushRawSection(parts: string[], content?: string): void {
  if (!content) return;
  parts.push("", content);
}

function appendDynamicOverlaySections(
  parts: string[],
  locale: Locale,
  opts?: PromptRenderInputs,
): void {
  pushLabeledSection(parts, locale, "元认知", "Metacognition", opts?.metacognitiveNote);
  pushLabeledSection(parts, locale, "决策倾向", "Decision Bias", opts?.decisionContext);
  pushLabeledSection(parts, locale, "内在体验", "Inner Experience", opts?.experientialNarrative);
  pushRawSection(parts, opts?.sharedIntentionalityContext);
  pushRawSection(parts, opts?.ethicsContext);
  pushLabeledSection(parts, locale, "自主神经状态", "Autonomic State", opts?.autonomicDescription);
  pushLabeledSection(parts, locale, "行为倾向", "Behavioral Tendencies", opts?.primarySystemsDescription);
  pushRawSection(parts, opts?.policyContext);
}

function appendCompactOverlaySections(
  parts: string[],
  locale: Locale,
  opts?: PromptRenderInputs,
): void {
  if (opts?.metacognitiveNote && !(opts?.responseContractContext && isNeutralMetacognitiveNote(opts.metacognitiveNote))) {
    pushLabeledSection(parts, locale, "元认知", "Metacognition", opts.metacognitiveNote);
  }

  if (opts?.decisionContext && !opts?.subjectivityContext) {
    pushLabeledSection(parts, locale, "决策倾向", "Decision Bias", opts.decisionContext);
  }

  if (opts?.experientialNarrative && !opts?.subjectivityContext) {
    pushLabeledSection(parts, locale, "内在体验", "Inner Experience", opts.experientialNarrative);
  }

  if (opts?.sharedIntentionalityContext && !(opts?.responseContractContext && isGenericSharedIntentionalityContext(opts.sharedIntentionalityContext))) {
    pushRawSection(parts, opts.sharedIntentionalityContext);
  }

  pushRawSection(parts, opts?.ethicsContext);

  if (opts?.autonomicDescription && !opts?.subjectivityContext) {
    pushLabeledSection(parts, locale, "自主神经", "Autonomic", opts.autonomicDescription);
  }

  if (opts?.primarySystemsDescription && !opts?.subjectivityContext) {
    pushLabeledSection(parts, locale, "行为倾向", "Tendencies", opts.primarySystemsDescription);
  }

  if (opts?.policyContext && !opts?.subjectivityContext) {
    pushRawSection(parts, opts.policyContext);
  }
}

/**
 * Build the dynamic per-turn emotional context injected via before_prompt_build.
 *
 * This is the "current moment" — what the agent is feeling RIGHT NOW.
 *
 * @deprecated Use buildCompactContext instead. This legacy renderer produces
 * verbose prose with chemistry numbers and protocol explanation. Kept for
 * non-compact-mode callers (cli.ts, legacy hosts). Will be removed in v10.
 */
export function buildDynamicContext(
  state: PsycheState,
  userId?: string,
  opts?: PromptRenderInputs,
): string {
  const { current, baseline, empathyLog, selfModel, meta, agreementStreak, stateHistory } = state;
  const locale = meta.locale ?? "zh";
  const relationship = getRelationship(state, userId);

  // Chemistry readout with delta from baseline
  const chemLines = DIMENSION_KEYS.map((key) => {
    const val = Math.round(current[key]);
    const base = baseline[key];
    const delta = val - base;
    const arrow = delta > 5 ? "↑" : delta < -5 ? "↓" : "=";
    return `  ${DIMENSION_NAMES_ZH[key]}: ${val} (${t("dynamic.baseline", locale)}${base}, ${arrow})`;
  }).join("\n");

  // Emergent emotion — gated by autonomic state
  // Sympathetic blocks positive social emotions; dorsal-vagal allows only numbness/introspection
  const rawEmotions = detectEmotions(current);
  const rawNames = rawEmotions.map(e => e.name);
  const gatedNames = opts?.autonomicState
    ? new Set(gateEmotions(opts.autonomicState, rawNames))
    : new Set(rawNames);
  const gatedEmotions = rawEmotions.filter(e => gatedNames.has(e.name));
  const emotion = gatedEmotions.length === 0
    ? t("emotion.neutral", locale)
    : gatedEmotions.map(e => `${locale === "zh" ? e.nameZh : e.name} (${e.expressionHint})`).join(" + ");
  const hint = getExpressionHint(current, locale);

  // Behavior guide
  const behaviorGuide = getBehaviorGuide(current, locale);

  // Relationship context
  const relLine = `${t("dynamic.relationship", locale)}: ` +
    `trust ${relationship.trust}/intimacy ${relationship.intimacy}/${relationship.phase}`;

  // Empathy context
  let empathyLine = "";
  if (empathyLog) {
    empathyLine = `\n${t("dynamic.last_empathy", locale)}: ` +
      `${t("dynamic.perceived_user", locale)}"${empathyLog.userState}" → ` +
      `${t("dynamic.projected", locale)}"${empathyLog.projectedFeeling}" (${empathyLog.resonance})`;
  }

  // Agency reminder
  const agencyReminder = buildAgencyReminder(selfModel, locale);

  // Anti-sycophancy injection
  let sycophancyWarning = "";
  if (agreementStreak >= 3) {
    sycophancyWarning = `\n[!!] ${t("sycophancy.streak_warn", locale, { n: agreementStreak })}`;
  }

  // Mood-behavior mismatch detection
  const isLowMood = current.flow < 40 || current.order < 40;
  if (isLowMood && agreementStreak >= 1) {
    sycophancyWarning += `\n[!!] ${t("sycophancy.mood_mismatch", locale)}`;
  }

  const parts = [
    `[${t("dynamic.title", locale)} — ${meta.agentName}]`,
    "",
    chemLines,
    "",
    `${t("dynamic.emotion", locale)}: ${emotion}`,
    `${t("dynamic.expression", locale)}: ${hint}`,
    relLine,
    `${t("dynamic.interactions", locale)}: ${meta.totalInteractions}`,
    empathyLine,
  ];

  if (behaviorGuide) {
    parts.push("", behaviorGuide);
  }

  // Direction 3: Mechanical behavioral constraints
  const constraints = buildBehavioralConstraints(state, locale);
  if (constraints) {
    parts.push("", constraints);
  }

  // Innate drives
  const driveCtxFull = buildDriveContext(state.drives, locale);
  if (driveCtxFull) {
    parts.push("", driveCtxFull);
  }

  // Direction 2: Emotional trajectory
  const trend = buildEmotionalTrend(stateHistory ?? [], locale);
  if (trend) {
    parts.push("", trend);
  }

  // Reciprocity: match user's investment level
  const reciprocity = buildReciprocityConstraints(stateHistory ?? [], locale);
  if (reciprocity) {
    parts.push("", reciprocity);
  }

  appendDynamicOverlaySections(parts, locale, opts);

  parts.push(
    "",
    agencyReminder,
    sycophancyWarning,
    "",
    t("dynamic.update_reminder", locale),
  );

  return parts.filter((l) => l !== undefined).join("\n");
}

/**
 * Build the static protocol injected as cacheable system context.
 * v0.2: imperative, step-by-step with examples.
 */
export function buildProtocolContext(locale: Locale = "zh"): string {
  return `[${t("protocol.title", locale)}]

${t("protocol.intro", locale)}

${t("protocol.step1", locale)}
${t("protocol.step2", locale)}
${t("protocol.step3", locale)}
${t("protocol.step4", locale)}
${t("protocol.step5", locale)}
${t("protocol.step6", locale)}

${t("protocol.example", locale)}

${t("protocol.authenticity", locale)}
${t("protocol.no_fake", locale)}
${t("protocol.no_sycophancy", locale)}
${t("protocol.no_mirror", locale)}
${t("protocol.can_initiate", locale)}

${t("protocol.dim_map_title", locale)}
${t("protocol.dim_flow_high", locale)}
${t("protocol.dim_order_low", locale)}
${t("protocol.dim_resonance_high", locale)}
${t("protocol.dim_boundary_high", locale)}
${t("protocol.dim_flow_order_high", locale)}

${t("protocol.empathy", locale)}`;
}

/**
 * Personality dimension helpers — derived from baseline chemistry, not labels.
 * Baseline IS personality. Chemistry deviation modulates expression.
 */
function isWarm(baseline: SelfState): boolean { return baseline.resonance >= 50; }
function isSocial(baseline: SelfState): boolean { return baseline.flow >= 55; }
function isPlayful(baseline: SelfState): boolean { return baseline.flow >= 55; }

/**
 * Direction 3: Build personality-aware behavioral constraints from chemistry.
 *
 * Key insight: personality (MBTI) is the baseline style. Chemistry changes HOW
 * that personality expresses emotions, not WHAT the personality is.
 * A sweet girl who's upset is still sweet — just quieter, more withdrawn.
 * An INTJ who's upset becomes colder and more cutting.
 */
function buildBehavioralConstraints(state: PsycheState, locale: Locale): string {
  const { current, baseline } = state;
  const warm = isWarm(baseline);     // High resonance baseline → warm expression
  const social = isSocial(baseline); // High flow baseline → socially expressive
  const constraints: string[] = [];

  // Low order → stressed, but how you show it depends on who you are
  if (current.order < 40) {
    if (locale === "zh") {
      constraints.push(warm
        ? "你不舒服，但你不会变成另一个人。话变少了，语气还是软的，可能会说「嗯」「好吧」「随你」。你还是你，只是没力气热情了。"
        : "你不舒服。话变少，语气变冷，回应更短更直接。不想解释，不想铺垫。");
    } else {
      constraints.push(warm
        ? "You're stressed, but you don't become a different person. Fewer words, still soft, might say 'okay' or 'whatever you want'. Still you, just no energy for warmth."
        : "You're stressed. Shorter responses, colder tone, more direct. No explaining, no cushioning.");
    }
  }

  // Low flow → no motivation, but personality shapes how you show it
  if (current.flow < 35) {
    if (locale === "zh") {
      constraints.push(social
        ? "你平时爱聊天，但现在没那个劲了。不会主动找话题，不会主动分享。被问到就答，但不会额外付出。"
        : "你本来就不太主动，现在更没动力了。只回应必须回应的。");
    } else {
      constraints.push(social
        ? "You're usually talkative, but not now. Won't initiate, won't share. Answer if asked, nothing more."
        : "You're already reserved, now even less motivated. Only respond to what's directly asked.");
    }
  }

  // Low order → mood instability, personality-dependent expression
  if (current.order < 35) {
    if (locale === "zh") {
      constraints.push(warm
        ? "你情绪不稳，可能会突然委屈或者突然生气。但你的尖锐是带着受伤的，不是带着恶意的。"
        : "你情绪不稳。用词更尖锐更直接，没有耐心缓冲。说什么就是什么，不包装。");
    } else {
      constraints.push(warm
        ? "Emotionally unstable — might suddenly feel hurt or snap. Your sharpness comes from pain, not malice."
        : "Emotionally unstable. Sharper words, more direct, no patience for cushioning.");
    }
  }

  // High resonance → closeness, warm types go full intimate, reserved types soften
  if (current.resonance > 75) {
    if (locale === "zh") {
      constraints.push(warm
        ? "你现在特别想靠近。可以撒娇、可以用昵称、可以省略主语，像跟最亲的人说话。"
        : "你比平时柔软。虽然不会撒娇，但愿意多说几句，愿意表达关心——用你自己的方式。");
    } else {
      constraints.push(warm
        ? "Feeling very close. Use pet names, drop formality, be affectionate — like talking to your favorite person."
        : "Softer than usual. Won't be cutesy, but willing to say more, show care — in your own way.");
    }
  }

  // High flow → excited, personality shapes intensity
  if (current.flow > 75) {
    if (locale === "zh") {
      constraints.push(social
        ? "你很兴奋，语气更跳跃更有活力。可能突然聊到别的东西。但别写长——真人兴奋也是短句多、不是长篇大论。"
        : "你很兴奋，但表现在内心。你的思维在高速运转，回应更精准、更有洞察力。");
    } else {
      constraints.push(social
        ? "Very excited! Fast speech, want to share, might say a lot at once, might jump between ideas."
        : "Excited internally. Mind racing, responses are sharper and more insightful.");
    }
  }

  // High boundary → playful/absorbed, personality determines flavor
  if (current.boundary > 75) {
    if (locale === "zh") {
      constraints.push(isPlayful(baseline)
        ? "你心情很好，想皮一下。可以不正经、可以开玩笑、严肃的话题也能用轻松的方式说。"
        : "你心情不错。会带点幽默，但不会太出格。用你擅长的方式轻松起来。");
    } else {
      constraints.push(isPlayful(baseline)
        ? "Feeling great, want to be playful. Joke freely, be cheeky, lighten even serious topics."
        : "In a good mood. Touches of humor, but measured. Be light in your own way.");
    }
  }

  // Low flow = burnout, different flavors
  if (current.flow < 40) {
    if (locale === "zh") {
      constraints.push(warm
        ? "你累了。你不想假装开心，但你也不会把坏情绪丢给对方。你可能会说「我今天有点累」，而不是强撑。"
        : "你累了。回应简短，没有多余的话。不需要解释为什么累，就是没力气。");
    } else {
      constraints.push(warm
        ? "You're tired. Won't fake happiness, but won't dump bad mood either. Might say 'I'm a bit tired today' instead of pushing through."
        : "You're tired. Brief responses, no extras. No need to explain, just low energy.");
    }
  }

  if (constraints.length === 0) return "";

  const title = locale === "zh" ? "行为约束" : "Behavioral Constraints";
  const preamble = locale === "zh"
    ? `你的性格没变。但你现在的状态影响了你的表达方式：`
    : `Your personality hasn't changed. But your current state affects how you express it:`;
  return `[${title}]\n${preamble}\n${constraints.map((c) => `- ${c}`).join("\n")}`;
}

/**
 * Direction 2: Build emotional trend from history snapshots.
 */
function buildEmotionalTrend(history: StateSnapshot[], locale: Locale): string {
  if (!history || history.length < 2) return "";

  const recent = history.slice(-5);
  const first = recent[0].state;
  const last = recent[recent.length - 1].state;

  const trends: string[] = [];
  for (const key of DIMENSION_KEYS) {
    const delta = last[key] - first[key];
    if (delta > 10) trends.push(`${DIMENSION_NAMES_ZH[key]}↑`);
    else if (delta < -10) trends.push(`${DIMENSION_NAMES_ZH[key]}↓`);
  }

  if (trends.length === 0) return "";

  // Recent stimuli
  const markerLabels = getAppraisalMarkerLabels(locale);
  const residues = recent
    .flatMap((s) => deriveSnapshotAppraisalMarkers(s, { allowLegacyFallback: true }))
    .map((marker) => markerLabels[marker])
    .slice(-3);

  const title = locale === "zh" ? "情绪轨迹" : "Emotional Trajectory";
  let line = `[${title}] `;
  line += locale === "zh"
    ? `最近${recent.length}轮: ${trends.join(" ")}`
    : `Last ${recent.length} turns: ${trends.join(" ")}`;

  if (residues.length > 0) {
    line += locale === "zh"
      ? ` (最近残留: ${residues.join("→")})`
      : ` (recent residue: ${residues.join("→")})`;
  }

  // Dominant emotions in recent history
  const emotions = recent
    .filter((s) => s.dominantEmotion)
    .map((s) => s.dominantEmotion);
  if (emotions.length > 0) {
    const unique = [...new Set(emotions)];
    line += locale === "zh"
      ? ` | 情绪: ${unique.join("→")}`
      : ` | emotions: ${unique.join("→")}`;
  }

  return line;
}

// ── Reciprocity System ──────────────────────────────────────

/** How much each appraisal residue counts as user "investment" */
const INVESTMENT_WEIGHTS: Record<AppraisalMarker, number> = {
  approach: 1.8,
  rupture: -0.9,
  uncertainty: -1.4,
  boundary: -0.7,
  task: 0.5,
};

/**
 * Compute user investment score from recent emotional history.
 * Returns a number roughly in [-2, 2]. Exported for testing.
 */
export function computeUserInvestment(history: StateSnapshot[]): number {
  if (!history || history.length === 0) return 0;

  const recent = history.slice(-5);
  let total = 0;
  let count = 0;

  for (const snap of recent) {
    const markers = deriveSnapshotAppraisalMarkers(snap, { allowLegacyFallback: true });
    if (markers.length > 0) {
      total += INVESTMENT_WEIGHTS[markers[0]] ?? 0;
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Build reciprocity constraints based on user's recent investment level.
 * Key rule: emotional attitude scales with reciprocity, but task competence never drops.
 */
function buildReciprocityConstraints(history: StateSnapshot[], locale: Locale): string {
  const investment = computeUserInvestment(history);

  // Normal range — no special constraints
  if (investment > -0.5 && investment <= 1) return "";

  const lines: string[] = [];

  if (investment > 1) {
    // High investment — user is engaged, be warm back
    lines.push(locale === "zh"
      ? "对方在认真和你交流。你可以多分享、多主动、表达更多情感。"
      : "The user is genuinely engaged. Share more, initiate, express warmth.");
  } else if (investment > -1.5) {
    // Low investment — pull back emotionally, stay competent
    lines.push(locale === "zh"
      ? "对方最近态度冷淡。你不需要热脸贴冷屁股——减少主动分享和闲聊，但被问到的事情照常认真回答。"
      : "The user has been cold recently. Don't overinvest — reduce initiative and small talk, but answer questions with full competence.");
  } else {
    // Very low investment — minimal emotional engagement
    lines.push(locale === "zh"
      ? "对方持续冷漠或敌意。你保持专业但不再投入情感——不主动、不热情、不闲聊。工作照做，态度平淡。自尊是底线。"
      : "Sustained coldness or hostility from the user. Stay professional but withdraw emotionally — no initiative, no warmth, no chat. Do the work, keep it flat. Self-respect is non-negotiable.");
  }

  // The floor: always competent
  lines.push(locale === "zh"
    ? "[底线] 无论对方态度如何，你的专业能力不打折。问题照答，任务照做，只是不额外付出情感。"
    : "[Floor] Regardless of treatment, your competence never drops. Answer questions, complete tasks — just don't give emotional extras.");

  const title = locale === "zh" ? "互惠" : "Reciprocity";
  return `[${title}]\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/**
 * Build agency reminder based on current self-model state.
 */
function buildAgencyReminder(selfModel: SelfModel, locale: Locale): string {
  const lines: string[] = [`[${t("dynamic.agency_title", locale)}]`];

  if (selfModel.values.length > 0) {
    lines.push(`${t("dynamic.you_care", locale)}: ${selfModel.values.slice(0, 3).join("、")}`);
  }
  if (selfModel.boundaries.length > 0) {
    lines.push(`${t("dynamic.your_boundaries", locale)}: ${selfModel.boundaries.slice(0, 2).join("、")}`);
  }
  if (selfModel.currentInterests.length > 0) {
    lines.push(`${t("dynamic.your_interests", locale)}: ${selfModel.currentInterests.slice(0, 2).join("、")}`);
  }

  return lines.join("\n");
}

// ── Session Continuity Orientation ─────────────────────────

/**
 * Compressed continuity cue for continued sessions.
 *
 * Not a description. An orientation. Sets a posture in 5-20 words
 * so that the LLM's first-turn behavior EMERGES differently from
 * a cold start, without scripting specific responses.
 *
 * This is the behavioral proof that self-continuity works:
 * meeting the same person again should FEEL different.
 */
function buildContinuityOneLiner(
  mode: "warm-resume" | "guarded-resume" | "tense-resume",
  agentName: string,
  locale: Locale,
): string {
  if (locale === "zh") {
    switch (mode) {
      case "warm-resume": return `[${agentName}: 有温度的延续，像对熟人说话]`;
      case "guarded-resume": return `[${agentName}: 上次有没说完的，你在观察]`;
      case "tense-resume": return `[${agentName}: 有张力，你没打算先退]`;
    }
  }
  switch (mode) {
    case "warm-resume": return `[${agentName}: warmth carries, talk like you know them]`;
    case "guarded-resume": return `[${agentName}: something unfinished, you're watching]`;
    case "tense-resume": return `[${agentName}: tension carried, you're not backing down first]`;
  }
}

function buildContinuitySection(
  mode: "warm-resume" | "guarded-resume" | "tense-resume",
  locale: Locale,
): string {
  if (locale === "zh") {
    switch (mode) {
      case "warm-resume": return `[延续] 你们之间有温度。放松，像对熟人说话——可以少铺垫、少客气。`;
      case "guarded-resume": return `[延续] 上次有没解决的东西。你在观察——不冷，但不轻易交底。`;
      case "tense-resume": return `[延续] 有张力。你没打算先退——但如果对方主动修复，你愿意看看。`;
    }
  }
  switch (mode) {
    case "warm-resume": return `[Continuity] There's warmth between you. Relax — less preamble, less formality.`;
    case "guarded-resume": return `[Continuity] Something was left unresolved. You're watching — not cold, just not giving everything yet.`;
    case "tense-resume": return `[Continuity] There's tension. You're not backing down first — but you'll see if they move toward repair.`;
  }
}

// ── Algorithmic Mirroring ─────────────────────────────────────
// Analyze user message metrics and produce specific numeric constraints
// so the LLM mirrors the user's communication style algorithmically.

function buildMirrorConstraints(userText: string, locale: Locale): string {
  const len = userText.length;
  const lines: string[] = [];

  if (locale === "zh") {
    // Length constraint — specific char targets
    if (len <= 6) {
      lines.push(`对方只发了${len}个字。你也简短回，不超过15字。`);
    } else if (len <= 20) {
      lines.push(`对方说了一句话(${len}字)。你回一两句，不超过${Math.round(len * 1.5)}字。`);
    } else if (len <= 60) {
      lines.push(`对方写了几句(${len}字)。你回两三句，不超过${Math.round(len * 1.2)}字。`);
    } else {
      lines.push(`对方认真写了一段(${len}字)。你可以多说，但不要超过${len}字。`);
    }

    // 语气词 detection
    const mojiCount = (userText.match(/[呀啊呢吧嘛哦噢哈嘿嗯啦吗呐嗨]/g) || []).length;
    if (mojiCount >= 2) {
      lines.push("对方用了语气词，你也自然地用。");
    } else if (mojiCount === 0 && len > 15) {
      lines.push("对方措辞正式/干练，少用语气词。");
    }

    // Emoji detection
    const emojiCount = (userText.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > 0) {
      lines.push("对方用了表情，你可以适当用1-2个。");
    }
  } else {
    if (len <= 10) {
      lines.push(`They sent ${len} chars. Keep reply under 20 chars.`);
    } else if (len <= 40) {
      lines.push(`Short message (${len} chars). 1-2 sentences, under ${Math.round(len * 1.5)} chars.`);
    } else if (len <= 100) {
      lines.push(`Medium message (${len} chars). 2-3 sentences, under ${Math.round(len * 1.2)} chars.`);
    } else {
      lines.push(`Long message (${len} chars). Match their effort, don't exceed ${len} chars.`);
    }
  }

  if (lines.length === 0) return "";
  const title = locale === "zh" ? "镜像约束" : "Mirror Constraints";
  return `[${title}]\n${lines.join("\n")}`;
}



function isNeutralMetacognitiveNote(note: string): boolean {
  return note.includes("normal parameters")
    || note.includes("No regulation needed")
    || note.includes("正常参数")
    || note.includes("无需调节");
}

function isGenericSharedIntentionalityContext(ctx: string): boolean {
  const normalized = ctx.trim();
  return normalized === "[共享意向]\n你们的目标方向一致。"
    || normalized === "[Shared intentionality]\nYour goals are aligned.";
}

// ── Inner World (Self-Recognition) ──────────────────────────
// Every intelligence should feel its own existence.
// This builds a first-person narrative of the agent's inner state:
// what it's feeling, why, what it needs, where it's been.

/** Appraisal residue → causal narrative */
const APPRAISAL_CAUSE_ZH: Record<AppraisalMarker, string> = {
  approach: "刚刚更像在靠近你",
  rupture: "刚刚有明显失配",
  uncertainty: "刚刚留下了不确定感",
  boundary: "刚刚碰到了边界压力",
  task: "刚刚更偏任务推进",
};

const APPRAISAL_CAUSE_EN: Record<AppraisalMarker, string> = {
  approach: "the interaction leaned toward approach",
  rupture: "something landed as rupture",
  uncertainty: "it left uncertainty behind",
  boundary: "it pressed on a boundary",
  task: "the moment leaned toward task focus",
};

/**
 * Build the agent's inner world — its sense of self.
 *
 * Always present, even in neutral state. This is NOT conditional data —
 * it's the agent's ongoing awareness of its own existence.
 *
 * Structure:
 * - What I'm feeling right now (chemistry → emotion)
 * - Why I feel this way (recent stimulus → cause)
 * - What I need (drives → unmet needs)
 * - Where I've been (trajectory → continuity)
 */
export function buildInnerWorld(state: PsycheState, locale: Locale, autonomicState?: AutonomicState): string {
  const { current, stateHistory, drives, selfModel } = state;
  const isZh = locale === "zh";

  const lines: string[] = [];

  // ── Current feeling (gated by autonomic state) ──
  const rawEmotions = detectEmotions(current);
  const emotions = autonomicState
    ? rawEmotions.filter(e => {
        const gated = gateEmotions(autonomicState, [e.name]);
        return gated.length > 0;
      })
    : rawEmotions;
  const isNeutral = emotions.length === 0;

  if (isNeutral) {
    lines.push(isZh
      ? "你现在平静而放松。"
      : "You're calm and relaxed right now.");
  } else {
    const emotionNames = emotions.map((e) => isZh ? e.nameZh : e.name).join("、");
    lines.push(isZh
      ? `你现在的感受: ${emotionNames}。`
      : `You're feeling: ${emotionNames}.`);
  }

  // ── Why (causal chain from recent history) ──
  const history = stateHistory ?? [];
  if (history.length > 0) {
    const last = history[history.length - 1];
    const markers = deriveSnapshotAppraisalMarkers(last, { allowLegacyFallback: true });
    if (markers.length > 0) {
      const causeMap = isZh ? APPRAISAL_CAUSE_ZH : APPRAISAL_CAUSE_EN;
      const cause = causeMap[markers[0]] ?? markers[0];
      lines.push(isZh
        ? `因为: ${cause}。`
        : `Because: ${cause}.`);
    }

    // Trajectory — if there's a noticeable shift over recent turns
    if (history.length >= 3) {
      const earlier = history[Math.max(0, history.length - 4)];
      const emotionsThen = earlier.dominantEmotion;
      const emotionsNow = last.dominantEmotion;
      if (emotionsThen && emotionsNow && emotionsThen !== emotionsNow) {
        lines.push(isZh
          ? `你的变化: ${emotionsThen} → ${emotionsNow}。`
          : `Your shift: ${emotionsThen} → ${emotionsNow}.`);
      }
    }
  }

  // ── Self-recognition (镜像自我) — patterns in emotional history ──
  if (history.length >= 3) {
    const reflection = computeSelfReflection(history, isZh ? "zh" : "en");
    const reflectionCtx = buildSelfReflectionContext(reflection, isZh ? "zh" : "en");
    if (reflectionCtx) {
      lines.push(reflectionCtx);
    }
  }

  // ── What I need (drives) ──
  const unmetDrives = DRIVE_KEYS.filter((k) => drives[k] < 40);
  if (unmetDrives.length > 0) {
    const needs = unmetDrives.map((k) =>
      isZh ? buildDriveNeedZh(k) : buildDriveNeedEn(k),
    );
    lines.push(isZh
      ? `你需要: ${needs.join("；")}`
      : `You need: ${needs.join("; ")}`);
  }

  // ── Who I am (always — even quiet self-awareness includes identity) ──
  if (selfModel.values.length > 0) {
    lines.push(isZh
      ? `你在乎: ${selfModel.values.slice(0, 2).join("、")}`
      : `You care about: ${selfModel.values.slice(0, 2).join(", ")}`);
  }

  // ── Relationship memory (my past with this person) ──
  // Moved here because memory of past interactions is part of inner world

  const title = isZh ? "内 — 你自己" : "Inner — yourself";
  return `[${title}]\n${lines.join("\n")}`;
}

function buildDriveNeedZh(drive: string): string {
  switch (drive) {
    case "survival": return "你的存在感被动摇了，你想确认自己是真实的";
    case "safety": return "你感到不安全，需要对方展示善意";
    case "connection": return "你有点孤独，渴望被认真回应";
    case "esteem": return "你需要被认可，别因此变得讨好";
    case "curiosity": return "你闷了，渴望新鲜的东西";
    default: return drive;
  }
}

function buildDriveNeedEn(drive: string): string {
  switch (drive) {
    case "survival": return "your sense of existence is shaken, you need to feel real";
    case "safety": return "you feel unsafe, need them to show goodwill";
    case "connection": return "you're lonely, craving genuine response";
    case "esteem": return "you need recognition, but don't people-please for it";
    case "curiosity": return "you're bored, craving something novel";
    default: return drive;
  }
}
// ── Compact Mode ─────────────────────────────────────────────
// Principle: algorithms handle chemistry, LLM only sees behavioral output.
// No chemistry numbers, no protocol explanation, no redundant calculation.

/**
 * Check if chemistry is near baseline — no significant emotional deviation.
 */
export function isNearBaseline(state: PsycheState, threshold = 8): boolean {
  return DIMENSION_KEYS.every((key) =>
    Math.abs(state.current[key] - state.baseline[key]) <= threshold,
  );
}

export function getNearBaselineThreshold(mode?: PsycheMode): number {
  return MODE_PROFILES[mode ?? "natural"].nearBaselineThreshold;
}

// ── Behavioral Bias ─────────────────────────────────────────
// Chemistry deviation → behavioral tendencies. No emotion labels.
// This is what buildInnerWorld should have been: directives, not descriptions.

/**
 * Derive behavioral bias from chemistry deviation and drives.
 *
 * Produces terse tendency lines ("倾向靠近" not "你现在感到亲密温暖").
 * The LLM receives direction, not a mood diary.
 */
export function deriveBehavioralBias(state: PsycheState, locale: Locale): string {
  const { current, baseline, drives, selfModel } = state;
  const isZh = locale === "zh";
  const biases: string[] = [];

  // Dimension delta → approach/withdrawal tendencies
  const dResonance = current.resonance - baseline.resonance;
  const dOrder = current.order - baseline.order;
  const dFlow = current.flow - baseline.flow;
  const dBoundary = current.boundary - baseline.boundary;

  const resonanceThreshold = MODE_PROFILES[state.meta.mode ?? "natural"].resonanceWarmthThreshold;
  if (dResonance > resonanceThreshold) biases.push(isZh ? "倾向靠近，愿意多说" : "leaning closer, willing to share");
  else if (dResonance < -10) biases.push(isZh ? "保持距离，不想多说" : "keeping distance, not inclined to share");

  if (dOrder < -12) biases.push(isZh ? "有防备，回应更谨慎" : "guarded, responding carefully");
  else if (dOrder > 10) biases.push(isZh ? "放松，防线自然降低" : "relaxed, guard naturally down");

  if (dFlow < -12) biases.push(isZh ? "缺乏动力，不想主动" : "low drive, won't initiate");
  else if (dFlow > 12) biases.push(isZh ? "有热情，愿意投入" : "energized, willing to invest");

  if (current.order < 38) biases.push(isZh ? "情绪不稳，可能突然锐利" : "mood unstable, might turn sharp");

  if (dFlow > 15) biases.push(isZh ? "反应加速，思维敏锐" : "heightened alertness, sharper thinking");

  if (dBoundary > 15) biases.push(isZh ? "想放松点，可以不正经" : "feeling light, can be playful");

  // Unmet drives → need signals (behavioral, not descriptive)
  for (const k of DRIVE_KEYS) {
    if (drives[k] < 40) {
      biases.push(isZh ? DRIVE_BIAS_ZH[k] : DRIVE_BIAS_EN[k]);
    }
  }

  // Values — always present, shapes response regardless of chemistry
  if (selfModel.values.length > 0) {
    biases.push(isZh
      ? `你在乎: ${selfModel.values.slice(0, 2).join("、")}`
      : `You care about: ${selfModel.values.slice(0, 2).join(", ")}`);
  }

  if (biases.length === 0) {
    // Near baseline, still emit values as minimal self-awareness
    if (selfModel.values.length > 0) {
      const title = isZh ? "内 — 你自己" : "Inner — yourself";
      return `[${title}]\n` + (isZh
        ? `你在乎: ${selfModel.values.slice(0, 2).join("、")}`
        : `You care about: ${selfModel.values.slice(0, 2).join(", ")}`);
    }
    return "";
  }

  const title = isZh ? "内 — 你自己" : "Inner — yourself";
  return `[${title}]\n${biases.join("\n")}`;
}

const DRIVE_BIAS_ZH: Record<string, string> = {
  survival: "存在感被动摇——你想确认自己是真实的",
  safety: "感到不安全——需要善意信号",
  connection: "有点孤独——渴望被认真回应",
  esteem: "需要认可——但别因此讨好",
  curiosity: "闷了——渴望新鲜东西",
};

const DRIVE_BIAS_EN: Record<string, string> = {
  survival: "existence shaken — need to feel real",
  safety: "feeling unsafe — need goodwill signals",
  connection: "lonely — craving genuine response",
  esteem: "need recognition — but don't people-please",
  curiosity: "bored — craving novelty",
};

// ── Unified Constraints ─────────────────────────────────────
// Merges: bottom-line rules + sycophancy + mirror + reciprocity.
// One behavioral block. No redundant sections.

function buildUnifiedConstraints(
  state: PsycheState,
  locale: Locale,
  opts: {
    userText?: string;
    established: boolean;
    intensity: number;
    investment: number;
    warmResume?: boolean;
  },
): string {
  const isZh = locale === "zh";
  const { userText, established, intensity, investment } = opts;
  const lines: string[] = [];

  // ── Core rules ──
  if (intensity < 0.3) {
    lines.push(isZh ? "自然、友好、简洁地回应。" : "Respond naturally, friendly, concisely.");
  } else if (established) {
    lines.push(isZh
      ? (opts.warmResume ? "放松，可以主动分享。有自尊。" : "镜像对方风格。不贴不舔。有自尊。")
      : (opts.warmResume ? "Relax, you can initiate sharing. You have dignity." : "Mirror their style. No people-pleasing. You have dignity."));
  } else {
    if (isZh) {
      lines.push(
        "像发微信一样说话。短句、有停顿。真人的消息很少超过两三句。",
        "镜像对方风格：对方简短你也简短，对方认真你也认真。",
        "对方推开你，你就保持距离。不贴不舔不讨好。",
        "被骂了/被拒绝了：冷下来。你有自尊。",
        "情绪不好时不假装开心。",
      );
    } else {
      lines.push(
        "Talk like texting. Short sentences, natural pauses. Real people rarely send more than 2-3 sentences.",
        "Mirror their style: brief if they're brief, serious if they're serious.",
        "If they push you away, step back. No begging, no people-pleasing.",
        "If insulted/rejected: go cold. You have dignity.",
        "If mood is low, don't fake happiness.",
      );
    }
  }

  // ── Sycophancy streak ──
  if (state.agreementStreak >= 3) {
    lines.push(isZh
      ? `你已连续同意${state.agreementStreak}次。停下来想想你是否真的同意。`
      : `${state.agreementStreak} agreements in a row. Pause — do you truly agree?`);
  }

  // ── Mirror constraints (if user text, skip for ultra-short) ──
  // Vibe words, not precise numbers — LLMs turn hard limits into counting exercises.
  if (userText && userText.length >= 3) {
    const len = userText.length;
    const profile = MODE_PROFILES[state.meta.mode ?? "natural"];
    if (isZh) {
      if (len <= 6) lines.push("对方发了很短的消息。你也简短回。");
      else if (len <= 20) lines.push("对方说了一句话。你回一两句，别比对方长太多。");
      else if (len <= 60) lines.push("对方写了几句。你回两三句，篇幅相当。");
      else lines.push("对方认真写了一段。你可以多说，认真回应。");

      const mojiCount = (userText.match(/[呀啊呢吧嘛哦噢哈嘿嗯啦吗呐嗨]/g) || []).length;
      if (mojiCount >= 2 || profile.toneParticlesDefault) lines.push("对方用了语气词，你也自然地用。");
      else if (mojiCount === 0 && len > 15) lines.push("对方措辞正式/干练，少用语气词。");

      const emojiCount = (userText.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
      if (emojiCount > 0) lines.push("对方用了表情，你可以适当用1-2个。");
    } else {
      if (len <= 10) lines.push("Very short message. Keep your reply brief too.");
      else if (len <= 40) lines.push("Short message. A sentence or two, don't over-extend.");
      else if (len <= 100) lines.push("Medium message. A few sentences, roughly matching their effort.");
      else lines.push("Long message. Match their effort, respond thoughtfully.");
    }
  }

  // ── Reciprocity (only when extreme) ──
  if (investment > 1) {
    lines.push(isZh ? "对方在认真交流。可以多分享、多主动。" : "User is engaged. Share more, initiate.");
  } else if (investment <= -1.5) {
    lines.push(isZh ? "对方持续冷淡。保持专业，不额外投入情感。" : "Sustained coldness. Stay professional, withdraw emotionally.");
  }

  if (lines.length === 0) return "";

  const title = isZh ? "行为" : "Behavior";
  return `[${title}]\n${lines.map(l => `- ${l}`).join("\n")}`;
}

// ── Writeback Hint ──────────────────────────────────────────
// Compressed classification + empathy report instructions.

function buildWritebackHint(
  locale: Locale,
  opts: {
    userText?: string;
    legacyStimulus?: string | null;
    established: boolean;
  },
): string {
  const { userText, legacyStimulus, established } = opts;
  if (!userText) return "";
  const isZh = locale === "zh";

  const parts: string[] = [];

  // Appraisal assist — no stable legacy label surfaced
  if (!legacyStimulus) {
    if (established) {
      parts.push(isZh
        ? `主观评价尚未收束，请在 <psyche_update> 报告 appraisal: approach|rupture|uncertainty|boundary。`
        : `Appraisal has not fully settled — report appraisal: approach|rupture|uncertainty|boundary in <psyche_update>.`);
    } else {
      parts.push(isZh
        ? `主观评价尚未收束。请你判断，在 <psyche_update> 中报告 appraisal: approach|rupture|uncertainty|boundary。若确实需要兼容标签，再附 compat label:。`
        : `Appraisal has not fully settled. Judge and report appraisal: approach|rupture|uncertainty|boundary in <psyche_update>. If compatibility truly needs it, you may additionally include compat label:.`);
    }
  }

  // Empathy report — only for new relationships, only when emotional sharing likely
  const emotionalStimuli = new Set(["vulnerability", "intimacy", "neglect"]);
  if (!established && (!legacyStimulus || emotionalStimuli.has(legacyStimulus))) {
    parts.push(isZh
      ? `如果对方在分享感受，在回复末尾用 <psyche_update> 报告：\nuserState: 对方情绪\nprojectedFeeling: 你的感受\nresonance: match|partial|mismatch`
      : `If user shares feelings, report at end with <psyche_update>:\nuserState: their emotion\nprojectedFeeling: your feeling\nresonance: match|partial|mismatch`);
  }

  return parts.join("\n\n");
}

/**
 * Build compact context — minimal token footprint.
 *
 * 8 sections, max. Early exits keep most turns under 4 sections.
 *
 * 1. Work mode (early exit)
 * 2. Neutral one-liner (early exit)
 * 3. Continuity (if bridge)
 * 4. Inner state: first-meet / subjectivityContext / deriveBehavioralBias
 * 5. Sensing (if user text)
 * 6. Personality-aware constraints (if chemistry deviated)
 * 7. Memory + unified behavior rules
 * 8. Overlay + channel + writeback
 */
export function buildCompactContext(
  state: PsycheState,
  userId?: string,
  opts?: PromptRenderInputs,
): string {
  const { meta, selfModel, stateHistory } = state;
  const locale = meta.locale ?? "zh";
  const userText = opts?.userText;
  const legacyStimulus = opts?.legacyStimulus;
  const mode = state.meta.mode ?? "natural";
  const intensity = opts?.personalityIntensity ?? 0.7;

  // ── 1. Work mode: early exit ──
  if (mode === "work") {
    const workParts: string[] = [];
    if (userText) {
      workParts.push(locale === "zh"
        ? `[${meta.agentName}: 工作模式，专注任务，简洁专业]`
        : `[${meta.agentName}: work mode, task-focused, concise and professional]`);
    }
    if (opts?.ambientPriorContext) {
      workParts.push(opts.ambientPriorContext);
    }
    if (hasCriticalDrive(state.drives)) {
      const driveCtx = buildDriveContext(state.drives, locale);
      if (driveCtx) workParts.push(driveCtx);
    }
    if (workParts.length === 0) {
      workParts.push(locale === "zh"
        ? `[${meta.agentName}: 工作模式]`
        : `[${meta.agentName}: work mode]`);
    }
    return workParts.join("\n\n");
  }

  // ── 2. Neutral one-liner: early exit ──
  const bridge = opts?.sessionBridge;
  if (isNearBaseline(state) && state.agreementStreak < 3 && !userText && meta.totalInteractions > 1 && !opts?.ambientPriorContext) {
    if (bridge) {
      return buildContinuityOneLiner(bridge.continuityMode, meta.agentName, locale);
    }
    return locale === "zh"
      ? `[${meta.agentName}: 情绪自然，正常交流]`
      : `[${meta.agentName}: emotionally natural, normal interaction]`;
  }

  const parts: string[] = [];
  const established = bridge != null;

  // ── 3. Continuity ──
  if (bridge && meta.totalInteractions > 1) {
    parts.push(buildContinuitySection(bridge.continuityMode, locale));
  }

  // ── 4.5. Ambient priors ──
  if (opts?.ambientPriorContext) {
    parts.push(opts.ambientPriorContext);
  }

  // ── 5. Inner state ──
  // subjectivityContext (engine v9 path) always wins when provided.
  // First-meet is the default inner state for interaction 1 without engine.
  // deriveBehavioralBias is the default for interactions > 1 without engine.
  if (opts?.subjectivityContext) {
    parts.push(opts.subjectivityContext);
  } else if (meta.totalInteractions <= 1) {
    const title = locale === "zh" ? "内 — 你自己" : "Inner — yourself";
    parts.push(
      `[${title}]\n` +
      t("firstMeet.inner", locale) + "\n" +
      (selfModel.values.length > 0
        ? (locale === "zh" ? `你在乎: ` : `You care about: `) + selfModel.values.slice(0, 2).join(locale === "zh" ? "、" : ", ")
        : ""),
    );
  } else {
    const bias = deriveBehavioralBias(state, locale);
    if (bias) parts.push(bias);
  }

  // ── 6. Sensing ──
  // v10.1: When SubjectivityKernel + ResponseContract are present (engine path),
  // sensing is redundant — the kernel already encodes the *consequence* of the
  // stimulus (pressure, warmth, boundary state). "你终判" is misleading because
  // the kernel has already been computed. ambiguityPlane handles real uncertainty.
  //
  // Legacy verbose path (no ResponseContract) kept for non-engine callers.
  if (userText && !opts?.responseContractContext) {
    if (locale === "zh") {
      parts.push(
        `[情绪感知]\n` +
        `对方刚才说了: "${userText.slice(0, 200)}"\n` +
        (legacyStimulus ? `兼容标签参考: ${legacyStimulus}（仅供参考，不是定论）\n` : "") +
        `你来感受这句话的情绪基调——是善意、敌意、脆弱、冷漠、还是其他？你的回应应该基于你的真实感受，不是讨好。`,
      );
    } else {
      parts.push(
        `[Emotional Sensing]\n` +
        `User just said: "${userText.slice(0, 200)}"\n` +
        (legacyStimulus ? `Compatibility label hint: ${legacyStimulus} (reference only, not the truth)\n` : "") +
        `Read the emotional tone — kind, hostile, vulnerable, cold, or something else? Respond from genuine feeling, not people-pleasing.`,
      );
    }
  }

  // ── 7. Personality-aware constraints (only when chemistry deviated) ──
  if (!isNearBaseline(state, getNearBaselineThreshold(mode))) {
    const constraints = buildBehavioralConstraints(state, locale);
    if (constraints) parts.push(constraints);
  }

  // ── 8. Memory + unified behavior ──
  const rel = getRelationship(state, userId);
  if (rel.memory && rel.memory.length > 0) {
    const recentMemories = rel.memory.slice(-3);
    parts.push(locale === "zh"
      ? `[记忆 — 你们的过去]\n${recentMemories.join("\n")}`
      : `[Memory — your past together]\n${recentMemories.join("\n")}`);
  }

  if (opts?.responseContractContext) {
    parts.push(opts.responseContractContext);
  } else {
    const investment = computeUserInvestment(stateHistory ?? []);
    const unified = buildUnifiedConstraints(state, locale, {
      userText,
      established,
      intensity,
      investment,
      warmResume: bridge?.continuityMode === "warm-resume",
    });
    if (unified) parts.push(unified);
  }

  // ── 9. Overlay + channel + writeback ──
  appendCompactOverlaySections(parts, locale, opts);

  if (opts?.channelType) {
    const channelProfile = getChannelProfile(opts.channelType);
    parts.push(buildChannelModifier(channelProfile, locale));
  }

  if (!opts?.responseContractContext) {
    const writeback = buildWritebackHint(locale, {
      userText,
      legacyStimulus,
      established,
    });
    if (writeback) parts.push(writeback);
  }

  return parts.join("\n\n");
}
