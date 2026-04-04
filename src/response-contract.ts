// ============================================================
// Response Contract — compact behavioral envelope for next reply
//
// Converts subjectivity + immediate message shape into a narrow reply ABI.
// Pure, synchronous, and intended to replace verbose prompt rules.
// ============================================================

import type { Locale, ResponseContract, StimulusType, SubjectivityKernel, ModeProfile } from "./types.js";
import { MODE_PROFILES } from "./types.js";

const EMOTIONAL_STIMULI = new Set<StimulusType>(["vulnerability", "intimacy", "neglect"]);

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function deriveReplyProfile(
  kernel: SubjectivityKernel,
): Pick<ResponseContract, "replyProfile" | "replyProfileBasis"> {
  const taskFocused = kernel.taskPlane.focus >= 0.62;
  const disciplined = kernel.taskPlane.discipline >= 0.72;

  if (taskFocused && disciplined) {
    return { replyProfile: "work", replyProfileBasis: "task-focus+discipline" };
  }
  if (taskFocused) {
    return { replyProfile: "work", replyProfileBasis: "task-focus" };
  }
  if (disciplined) {
    return { replyProfile: "work", replyProfileBasis: "discipline" };
  }
  return { replyProfile: "private", replyProfileBasis: "default-private" };
}

function computeLengthBudget(
  locale: Locale,
  userText: string,
  replyProfile: ResponseContract["replyProfile"],
  expressionMode: SubjectivityKernel["expressionMode"],
  kernel?: SubjectivityKernel,
): Pick<ResponseContract, "maxSentences" | "maxChars"> {
  const len = userText.length;
  let maxSentences = 2;
  let maxChars: number | undefined;

  if (replyProfile === "work") {
    if (locale === "zh") {
      if (len <= 10) {
        maxSentences = 2;
        maxChars = 36;
      } else if (len <= 40) {
        maxSentences = 3;
        maxChars = clampInt(len * 2.4, 48, 220);
      } else if (len <= 120) {
        maxSentences = 5;
        maxChars = clampInt(len * 1.9, 120, 420);
      } else {
        maxSentences = 6;
        maxChars = clampInt(len * 1.5, 180, 720);
      }
    } else {
      if (len <= 16) {
        maxSentences = 2;
        maxChars = 48;
      } else if (len <= 60) {
        maxSentences = 3;
        maxChars = clampInt(len * 2.3, 64, 280);
      } else if (len <= 180) {
        maxSentences = 5;
        maxChars = clampInt(len * 1.8, 140, 520);
      } else {
        maxSentences = 6;
        maxChars = clampInt(len * 1.45, 220, 900);
      }
    }
  } else if (locale === "zh") {
    if (len <= 6) {
      maxSentences = 1;
      maxChars = 15;
    } else if (len <= 20) {
      maxSentences = 2;
      maxChars = clampInt(len * 1.5, 12, 80);
    } else if (len <= 60) {
      maxSentences = 3;
      maxChars = clampInt(len * 1.2, 30, 140);
    } else {
      maxSentences = 4;
      maxChars = len;
    }
  } else {
    if (len <= 10) {
      maxSentences = 1;
      maxChars = 20;
    } else if (len <= 40) {
      maxSentences = 2;
      maxChars = clampInt(len * 1.5, 20, 120);
    } else if (len <= 100) {
      maxSentences = 3;
      maxChars = clampInt(len * 1.2, 40, 220);
    } else {
      maxSentences = 4;
      maxChars = len;
    }
  }

  if (expressionMode === "brief") {
    maxSentences = replyProfile === "work"
      ? Math.max(2, Math.min(maxSentences, 4))
      : Math.max(1, Math.min(maxSentences, 2));
    maxChars = maxChars !== undefined
      ? clampInt(maxChars * (replyProfile === "work" ? 0.9 : 0.85), replyProfile === "work" ? 36 : 10, maxChars)
      : maxChars;
  } else if (expressionMode === "expansive") {
    maxSentences = Math.min(replyProfile === "work" ? 6 : 4, maxSentences + 1);
    maxChars = maxChars !== undefined
      ? clampInt(maxChars * 1.1, maxChars, Math.max(maxChars, replyProfile === "work" ? 900 : 260))
      : maxChars;
  }

  if (kernel?.taskPlane.focus && kernel.taskPlane.focus > 0.72) {
    if (replyProfile === "work") {
      maxSentences = Math.max(2, maxSentences);
      maxChars = maxChars !== undefined ? clampInt(maxChars * 1.05, 48, Math.max(maxChars, 720)) : 160;
    } else {
      maxSentences = Math.max(1, Math.min(maxSentences, 2));
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.82, 10, maxChars) : maxChars;
    }
  }

  if (kernel?.subjectPlane.guardedness && kernel.subjectPlane.guardedness > 0.72) {
    if (replyProfile === "work") {
      maxSentences = Math.max(2, Math.min(maxSentences, 3));
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.88, 84, maxChars) : 112;
    } else {
      maxSentences = 1;
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.72, 8, maxChars) : 18;
    }
  }

  if (kernel?.ambiguityPlane.expressionInhibition && kernel.ambiguityPlane.expressionInhibition > 0.66) {
    if (replyProfile === "work") {
      maxSentences = Math.max(2, Math.min(maxSentences, 3));
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.9, 96, maxChars) : 136;
    } else {
      maxSentences = 1;
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.76, 8, maxChars) : 18;
    }
  }

  if (kernel?.relationPlane.silentCarry && kernel.relationPlane.silentCarry > 0.54) {
    maxSentences = Math.max(replyProfile === "work" ? 2 : 1, Math.min(maxSentences, replyProfile === "work" ? 3 : 2));
    maxChars = maxChars !== undefined ? clampInt(maxChars * 0.82, replyProfile === "work" ? 96 : 8, maxChars) : (replyProfile === "work" ? 136 : 20);
  }

  if (kernel?.relationPlane.hysteresis && kernel.relationPlane.hysteresis > 0.64) {
    if (replyProfile === "work") {
      maxSentences = Math.max(2, Math.min(maxSentences, 3));
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.84, 104, maxChars) : 144;
    } else {
      maxSentences = 1;
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.78, 8, maxChars) : 18;
    }
  }

  if (kernel?.relationPlane.repairFriction && kernel.relationPlane.repairFriction > 0.62) {
    if (replyProfile === "work") {
      maxSentences = Math.max(2, Math.min(maxSentences, 3));
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.82, 96, maxChars) : 128;
    } else {
      maxSentences = 1;
      maxChars = maxChars !== undefined ? clampInt(maxChars * 0.74, 8, maxChars) : 16;
    }
  }

  return { maxSentences, maxChars };
}

function buildAppraisalReportingGuide(locale: Locale): string {
  if (locale === "zh") {
    return "appraisal速记:靠近/失配/不确定/边界";
  }
  return "appraisal note: approach/rupture/uncertainty/boundary";
}

function buildWritebackGuide(locale: Locale): string {
  return locale === "zh"
    ? "signals可写"
    : "signals writable";
}

function detectToneParticles(userText: string, locale: Locale): ResponseContract["toneParticles"] {
  if (locale !== "zh") return "natural";
  const mojiCount = (userText.match(/[呀啊呢吧嘛哦噢哈嘿嗯啦吗呐嗨]/g) || []).length;
  if (mojiCount >= 2) return "match";
  if (mojiCount === 0 && userText.length > 15) return "avoid";
  return "natural";
}

function detectEmojiLimit(userText: string): ResponseContract["emojiLimit"] {
  const emojiCount = (userText.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
  return emojiCount > 0 ? 2 : 0;
}

export function computeResponseContract(
  kernel: SubjectivityKernel,
  opts?: {
    locale?: Locale;
    userText?: string;
    legacyStimulus?: StimulusType | null;
    legacyStimulusConfidence?: number;
    personalityIntensity?: number;
    mode?: "natural" | "work" | "companion";
  },
): ResponseContract {
  const locale = opts?.locale ?? "zh";
  const userText = opts?.userText ?? "";
  const personalityIntensity = opts?.personalityIntensity ?? 0.7;
  const profile: ModeProfile = MODE_PROFILES[opts?.mode ?? "natural"];
  const { replyProfile, replyProfileBasis } = deriveReplyProfile(kernel);
  const legacyStimulusConfidence = opts?.legacyStimulusConfidence ?? 0;
  const overrideWindow: ResponseContract["overrideWindow"] = legacyStimulusConfidence >= 0.78
    ? "narrow"
    : legacyStimulusConfidence >= 0.62
      ? "balanced"
      : "wide";
  let { maxSentences, maxChars } = userText.length > 0
    ? computeLengthBudget(locale, userText, replyProfile, kernel.expressionMode, kernel)
    : {
        maxSentences: replyProfile === "work"
          ? (kernel.expressionMode === "expansive" ? 5 : 3)
          : kernel.expressionMode === "brief" ? 1 : kernel.expressionMode === "expansive" ? 3 : 2,
        maxChars: replyProfile === "work" ? 160 : undefined as number | undefined,
      };

  // Mode-aware length adjustment: affects maxTokens ceiling (host layer).
  // Prompt uses vibe words derived from maxSentences, not precise numbers.
  if (maxChars !== undefined && profile.lengthMultiplier !== 1.0) {
    maxChars = Math.round(maxChars * profile.lengthMultiplier);
  }
  maxSentences = Math.max(profile.minSentences, maxSentences);

  let updateMode: ResponseContract["updateMode"] = "none";
  if (kernel.taskPlane.focus > 0.72) {
    updateMode = "none";
  } else if (kernel.ambiguityPlane.namingConfidence < 0.36) {
    updateMode = "none";
  } else if (!opts?.legacyStimulus) {
    updateMode = "appraisal+empathy";
  } else if (EMOTIONAL_STIMULI.has(opts.legacyStimulus)) {
    updateMode = "empathy";
  }

  let socialDistance = kernel.socialDistance;
  if (
    (kernel.subjectPlane.attachment > 0.72 || kernel.relationPlane.closeness > 0.72)
    && kernel.subjectPlane.guardedness < 0.5
    && kernel.relationPlane.loopPressure < 0.55
    && kernel.relationPlane.silentCarry < 0.42
    && kernel.relationPlane.repairFriction < 0.36
    && kernel.ambiguityPlane.conflictLoad < 0.62
  ) {
    socialDistance = "warm";
  } else if (
    kernel.subjectPlane.guardedness > 0.72
    || kernel.subjectPlane.identityStrain > 0.68
    || kernel.relationPlane.loopPressure > 0.7
    || kernel.relationPlane.repairFriction > 0.72
    || kernel.relationPlane.hysteresis > 0.7
  ) {
    socialDistance = "withdrawn";
  } else if (
    kernel.ambiguityPlane.conflictLoad > 0.58
    || kernel.relationPlane.silentCarry > 0.46
    || kernel.relationPlane.repairFriction > 0.48
  ) {
    socialDistance = "measured";
  }

  let boundaryMode = kernel.boundaryMode;
  if (kernel.subjectPlane.identityStrain > 0.78 || kernel.relationPlane.loopPressure > 0.76) {
    boundaryMode = "confirm-first";
  } else if (
    kernel.subjectPlane.guardedness > 0.62
    || kernel.relationPlane.loopPressure > 0.58
    || kernel.relationPlane.repairFriction > 0.56
    || kernel.relationPlane.hysteresis > 0.54
  ) {
    boundaryMode = "guarded";
  }

  let initiativeMode = kernel.initiativeMode;
  if (kernel.taskPlane.focus > 0.78 && kernel.taskPlane.discipline > 0.68) {
    initiativeMode = kernel.relationPlane.silentCarry > 0.44 ? "reactive" : "balanced";
  } else if (
    kernel.relationPlane.loopPressure > 0.68
    && kernel.relationPlane.lastMove !== "repair"
  ) {
    initiativeMode = "reactive";
  } else if (kernel.relationPlane.repairFriction > 0.6) {
    initiativeMode = "reactive";
  } else if (kernel.relationPlane.lastMove === "repair" && kernel.relationPlane.hysteresis > 0.56) {
    initiativeMode = "reactive";
  } else if (kernel.ambiguityPlane.expressionInhibition > 0.64) {
    initiativeMode = "reactive";
  }

  return {
    replyProfile,
    replyProfileBasis,
    overrideWindow,
    maxSentences,
    maxChars,
    expressionMode: kernel.expressionMode,
    initiativeMode,
    socialDistance,
    boundaryMode,
    toneParticles: userText.length > 0 ? detectToneParticles(userText, locale) : "natural",
    emojiLimit: userText.length > 0 ? detectEmojiLimit(userText) : 0,
    authenticityMode: personalityIntensity >= 0.3 && !(profile.authenticityWhenWarm === "friendly" && socialDistance === "warm") ? "strict" : "friendly",
    updateMode,
  };
}

function describeReplyProfileBasis(
  basis: ResponseContract["replyProfileBasis"],
  locale: Locale,
): string {
  if (locale === "zh") {
    switch (basis) {
      case "task-focus":
        return "因:聚";
      case "discipline":
        return "因:纪";
      case "task-focus+discipline":
        return "因:聚+纪";
      default:
        return "因:私";
    }
  }

  return `basis:${basis}`;
}

function describeOverrideWindow(
  overrideWindow: ResponseContract["overrideWindow"],
  locale: Locale,
): string {
  if (locale === "zh") {
    switch (overrideWindow) {
      case "narrow":
        return "终判窗:窄";
      case "balanced":
        return "终判窗:中";
      default:
        return "终判窗:宽";
    }
  }
  return `override:${overrideWindow}`;
}

// Length vibe: soft directional cue, not a hard number.
// maxChars stays internal for host-controls maxTokens calculation.
function describeLengthVibe(maxSentences: number, locale: Locale): string {
  if (locale === "zh") {
    if (maxSentences <= 1) return "简短回";
    if (maxSentences <= 2) return "一两句";
    if (maxSentences <= 3) return "两三句";
    return "可以展开";
  }
  if (maxSentences <= 1) return "keep brief";
  if (maxSentences <= 2) return "a sentence or two";
  if (maxSentences <= 3) return "a few sentences";
  return "feel free to elaborate";
}

export function buildResponseContractContext(contract: ResponseContract, locale: Locale = "zh"): string {
  if (locale === "zh") {
    const parts: string[] = [];
    parts.push(contract.replyProfile === "work" ? "工作" : "私人");
    parts.push(describeReplyProfileBasis(contract.replyProfileBasis, locale));
    parts.push(describeOverrideWindow(contract.overrideWindow, locale));
    parts.push(describeLengthVibe(contract.maxSentences, locale));

    if (contract.initiativeMode === "reactive") parts.push("少主动");
    else if (contract.initiativeMode === "proactive") parts.push("可主动");

    if (contract.boundaryMode === "confirm-first") parts.push("先确认");
    else if (contract.boundaryMode === "guarded") parts.push("有判断地回应，不无条件服从");

    if (contract.socialDistance === "withdrawn") parts.push("退开");
    else if (contract.socialDistance === "warm") parts.push("可靠近");

    if (contract.authenticityMode === "strict") parts.push("不贴不舔");
    else parts.push("自然友好");

    if (contract.toneParticles === "match") parts.push("语气词可跟随");
    else if (contract.toneParticles === "avoid") parts.push("少语气词");

    if (contract.emojiLimit > 0) parts.push(`表情≤${contract.emojiLimit}`);

    if (contract.updateMode === "appraisal") parts.push(buildAppraisalReportingGuide(locale));
    else if (contract.updateMode === "empathy") parts.push("谈感受再报empathy");
    else if (contract.updateMode === "appraisal+empathy") {
      parts.push(buildAppraisalReportingGuide(locale));
      parts.push("谈感受再报empathy");
    }
    if (contract.overrideWindow !== "narrow") parts.push(buildWritebackGuide(locale));

    return `[回应契约] ${parts.join("；")}。`;
  }

  const parts: string[] = [];
  parts.push(contract.replyProfile === "work" ? "work surface" : "private surface");
  parts.push(describeReplyProfileBasis(contract.replyProfileBasis, locale));
  parts.push(describeOverrideWindow(contract.overrideWindow, locale));
  parts.push(describeLengthVibe(contract.maxSentences, locale));

  if (contract.initiativeMode === "reactive") parts.push("low initiative");
  else if (contract.initiativeMode === "proactive") parts.push("can initiate");

  if (contract.boundaryMode === "confirm-first") parts.push("confirm before acting");
  else if (contract.boundaryMode === "guarded") parts.push("respond with judgment, don't comply unconditionally");

  if (contract.socialDistance === "withdrawn") parts.push("step back if pushed away");
  else if (contract.socialDistance === "warm") parts.push("can lean a little warm");

  if (contract.authenticityMode === "strict") parts.push("no people-pleasing, no fake cheer");
  else parts.push("natural and friendly");

  if (contract.toneParticles === "avoid") parts.push("keep tone plain");
  if (contract.emojiLimit > 0) parts.push(`emoji <= ${contract.emojiLimit}`);

  if (contract.updateMode === "appraisal") parts.push(buildAppraisalReportingGuide(locale));
  else if (contract.updateMode === "empathy") parts.push("report empathy only when feelings are shared");
  else if (contract.updateMode === "appraisal+empathy") {
    parts.push(buildAppraisalReportingGuide(locale));
    parts.push("report empathy only when feelings are shared");
  }
  if (contract.overrideWindow !== "narrow") parts.push(buildWritebackGuide(locale));

  return `[Reply Contract] ${parts.join(", ")}.`;
}
