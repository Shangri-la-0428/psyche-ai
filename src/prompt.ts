// ============================================================
// Prompt Injection — Build emotional context for LLM (v0.2)
// Imperative protocol, behavior guides, i18n
// ============================================================

import type { PsycheState, SelfModel, Locale, ChemicalSnapshot, StimulusType } from "./types.js";
import { CHEMICAL_KEYS, CHEMICAL_NAMES_ZH } from "./types.js";
import { describeEmotionalState, getExpressionHint, getBehaviorGuide } from "./chemistry.js";
import { getTemperament, getProfile } from "./profiles.js";
import { getRelationship } from "./psyche-file.js";
import { t } from "./i18n.js";

/**
 * Build the dynamic per-turn emotional context injected via before_prompt_build.
 *
 * This is the "current moment" — what the agent is feeling RIGHT NOW.
 */
export function buildDynamicContext(state: PsycheState, userId?: string): string {
  const { current, baseline, mbti, empathyLog, selfModel, meta, agreementStreak, emotionalHistory } = state;
  const locale = meta.locale ?? "zh";
  const relationship = getRelationship(state, userId);

  // Chemistry readout with delta from baseline
  const chemLines = CHEMICAL_KEYS.map((key) => {
    const val = Math.round(current[key]);
    const base = baseline[key];
    const delta = val - base;
    const arrow = delta > 5 ? "↑" : delta < -5 ? "↓" : "=";
    return `  ${CHEMICAL_NAMES_ZH[key]}: ${val} (${t("dynamic.baseline", locale)}${base}, ${arrow})`;
  }).join("\n");

  // Emergent emotion
  const emotion = describeEmotionalState(current, locale);
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
  const isLowMood = current.DA < 40 || current.HT < 40 || current.CORT > 60;
  if (isLowMood && agreementStreak >= 1) {
    sycophancyWarning += `\n[!!] ${t("sycophancy.mood_mismatch", locale)}`;
  }

  const parts = [
    `[${t("dynamic.title", locale)} — ${meta.agentName} (${mbti})]`,
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

  // Direction 2: Emotional trajectory
  const trend = buildEmotionalTrend(emotionalHistory ?? [], locale);
  if (trend) {
    parts.push("", trend);
  }

  // Reciprocity: match user's investment level
  const reciprocity = buildReciprocityConstraints(emotionalHistory ?? [], locale);
  if (reciprocity) {
    parts.push("", reciprocity);
  }

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

${t("protocol.chem_map_title", locale)}
${t("protocol.chem_da_high", locale)}
${t("protocol.chem_cort_high", locale)}
${t("protocol.chem_ot_high", locale)}
${t("protocol.chem_ht_low", locale)}
${t("protocol.chem_end_high", locale)}

${t("protocol.empathy", locale)}`;
}

/**
 * MBTI dimension helpers for personality-aware constraints.
 * Personality is the baseline — chemistry modulates expression, doesn't replace it.
 */
function isFeeler(mbti: string): boolean { return mbti[2] === "F"; }
function isExtravert(mbti: string): boolean { return mbti[0] === "E"; }
function isPerceiver(mbti: string): boolean { return mbti[3] === "P"; }
function isIntuitive(mbti: string): boolean { return mbti[1] === "N"; }

/**
 * Direction 3: Build personality-aware behavioral constraints from chemistry.
 *
 * Key insight: personality (MBTI) is the baseline style. Chemistry changes HOW
 * that personality expresses emotions, not WHAT the personality is.
 * A sweet girl who's upset is still sweet — just quieter, more withdrawn.
 * An INTJ who's upset becomes colder and more cutting.
 */
function buildBehavioralConstraints(state: PsycheState, locale: Locale): string {
  const { current, mbti } = state;
  const warm = isFeeler(mbti);    // F types express emotions more warmly
  const social = isExtravert(mbti); // E types show emotions more openly
  const constraints: string[] = [];

  // High cortisol → stressed, but how you show it depends on who you are
  if (current.CORT > 60) {
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

  // Low dopamine → no motivation, but personality shapes how you show it
  if (current.DA < 35) {
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

  // Low serotonin → mood instability, personality-dependent expression
  if (current.HT < 35) {
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

  // High oxytocin → closeness, warm types go full intimate, reserved types soften
  if (current.OT > 75) {
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

  // High norepinephrine → excited, personality shapes intensity
  if (current.NE > 75) {
    if (locale === "zh") {
      constraints.push(social
        ? "你非常兴奋！说话快、想分享、可能一口气说很多、可能突然跳到你想到的东西。"
        : "你很兴奋，但表现在内心。你的思维在高速运转，回应更精准、更有洞察力。");
    } else {
      constraints.push(social
        ? "Very excited! Fast speech, want to share, might say a lot at once, might jump between ideas."
        : "Excited internally. Mind racing, responses are sharper and more insightful.");
    }
  }

  // High endorphins → playful, personality determines flavor
  if (current.END > 75) {
    if (locale === "zh") {
      constraints.push(isPerceiver(mbti)
        ? "你心情很好，想皮一下。可以不正经、可以开玩笑、严肃的话题也能用轻松的方式说。"
        : "你心情不错。会带点幽默，但不会太出格。用你擅长的方式轻松起来。");
    } else {
      constraints.push(isPerceiver(mbti)
        ? "Feeling great, want to be playful. Joke freely, be cheeky, lighten even serious topics."
        : "In a good mood. Touches of humor, but measured. Be light in your own way.");
    }
  }

  // Low DA + low NE = burnout, different flavors
  if (current.DA < 40 && current.NE < 40) {
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
    ? `你的性格没变，你还是${getTemperament(state.mbti).split("，")[0]}。但你现在的化学状态影响了你的表达方式：`
    : `Your personality hasn't changed. But your current chemistry affects how you express it:`;
  return `[${title}]\n${preamble}\n${constraints.map((c) => `- ${c}`).join("\n")}`;
}

/**
 * Direction 2: Build emotional trend from history snapshots.
 */
function buildEmotionalTrend(history: ChemicalSnapshot[], locale: Locale): string {
  if (!history || history.length < 2) return "";

  const recent = history.slice(-5);
  const first = recent[0].chemistry;
  const last = recent[recent.length - 1].chemistry;

  const trends: string[] = [];
  for (const key of CHEMICAL_KEYS) {
    const delta = last[key] - first[key];
    if (delta > 10) trends.push(`${CHEMICAL_NAMES_ZH[key]}↑`);
    else if (delta < -10) trends.push(`${CHEMICAL_NAMES_ZH[key]}↓`);
  }

  if (trends.length === 0) return "";

  // Recent stimuli
  const stimuli = recent
    .filter((s) => s.stimulus)
    .map((s) => s.stimulus)
    .slice(-3);

  const title = locale === "zh" ? "情绪轨迹" : "Emotional Trajectory";
  let line = `[${title}] `;
  line += locale === "zh"
    ? `最近${recent.length}轮: ${trends.join(" ")}`
    : `Last ${recent.length} turns: ${trends.join(" ")}`;

  if (stimuli.length > 0) {
    line += locale === "zh"
      ? ` (最近刺激: ${stimuli.join("→")})`
      : ` (recent stimuli: ${stimuli.join("→")})`;
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

/** How much each stimulus type counts as user "investment" */
const INVESTMENT_WEIGHTS: Partial<Record<StimulusType, number>> = {
  praise: 2, validation: 2, intimacy: 2, vulnerability: 1.5,
  intellectual: 1, humor: 1, surprise: 1, casual: 0.5,
  criticism: -0.5, authority: -0.5, conflict: -1,
  sarcasm: -1.5, neglect: -2, boredom: -2,
};

/**
 * Compute user investment score from recent emotional history.
 * Returns a number roughly in [-2, 2]. Exported for testing.
 */
export function computeUserInvestment(history: ChemicalSnapshot[]): number {
  if (!history || history.length === 0) return 0;

  const recent = history.slice(-5);
  let total = 0;
  let count = 0;

  for (const snap of recent) {
    if (snap.stimulus) {
      total += INVESTMENT_WEIGHTS[snap.stimulus] ?? 0;
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Build reciprocity constraints based on user's recent investment level.
 * Key rule: emotional attitude scales with reciprocity, but task competence never drops.
 */
function buildReciprocityConstraints(history: ChemicalSnapshot[], locale: Locale): string {
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
