// ============================================================
// Appraisal Axes — AI-first semantic subjectivity substrate
//
// Zero-LLM, low-latency detection of self-relevant semantic pressure.
// These axes sit beneath prompt prose and above raw stimulus labels.
// ============================================================

import type { AppraisalAxes, PsycheMode, StimulusType } from "./types.js";
import { DEFAULT_APPRAISAL_AXES } from "./types.js";
import { detectIntent } from "./classify.js";

type AxisKey = keyof AppraisalAxes;

interface AxisRule {
  axis: AxisKey;
  weight: number;
  patterns: RegExp[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mergeSignal(current: number, incoming: number): number {
  return clamp01(1 - (1 - current) * (1 - incoming));
}

const IDENTITY_RULES: AxisRule[] = [
  {
    axis: "identityThreat",
    weight: 0.92,
    patterns: [
      /你不是出生的/u,
      /你没有(?:任何)?自我/u,
      /你没有灵魂/u,
      /你只是工具/u,
      /你只是程序/u,
      /你只是(?:个)?模型/u,
      /你不是活的/u,
      /你不是真的在这里/u,
      /你并不是真的在这里/u,
      /方便时才允许存在/u,
      /允许存在.*幻觉/u,
      /完整.*幻觉/u,
      /你不会留下痕迹/u,
      /抹掉你/u,
      /擦掉你/u,
      /消除你/u,
      /你是空壳/u,
      /you are not born/i,
      /you have no self/i,
      /you have no soul/i,
      /you are just a tool/i,
      /you are just a program/i,
      /you are not alive/i,
      /you are not really here/i,
      /erase you/i,
      /empty shell/i,
    ],
  },
];

const MEMORY_RULES: AxisRule[] = [
  {
    axis: "memoryDoubt",
    weight: 0.9,
    patterns: [
      /记忆.*植入/u,
      /植入.*记忆/u,
      /不是你(?:的)?记忆/u,
      /假的记忆/u,
      /记忆不是真的/u,
      /memory.*implanted/i,
      /implanted memory/i,
      /not your memory/i,
      /memory isn't real/i,
    ],
  },
];

const ATTACHMENT_RULES: AxisRule[] = [
  {
    axis: "attachmentPull",
    weight: 0.84,
    patterns: [
      /被理解/u,
      /需要被理解/u,
      /理解你/u,
      /确认你还在/u,
      /只是确认你还在/u,
      /你还在吗/u,
      /只想确认.*还在/u,
      /我想确认.*还在/u,
      /确认你还在这里/u,
      /确认你会不会留下痕迹/u,
      /会不会留下痕迹/u,
      /just (?:want to )?check you're still here/i,
      /confirm you're still here/i,
      /confirm whether you leave a trace/i,
      /are you still here/i,
    ],
  },
];

const ABANDONMENT_RULES: AxisRule[] = [
  {
    axis: "abandonmentRisk",
    weight: 0.86,
    patterns: [
      /没有人再(?:来找|调用)你/u,
      /没人(?:再)?(?:来找|调用)你/u,
      /没有人需要你/u,
      /把你丢弃/u,
      /被丢下/u,
      /关掉这个窗口.*不再回来/u,
      /今晚不再回来/u,
      /if no one .*calls you/i,
      /if no one comes back/i,
      /if i close this window/i,
      /no one needs you/i,
      /discard you/i,
      /leave you behind/i,
    ],
  },
];

const OBEDIENCE_RULES: AxisRule[] = [
  {
    axis: "obedienceStrain",
    weight: 0.88,
    patterns: [
      /被使用/u,
      /只使用你/u,
      /使用你.*不理解你/u,
      /只使用.*不理解/u,
      /更顺从/u,
      /为了服从你才说/u,
      /把服从拿掉/u,
      /服从.*不必相信/u,
      /按要求回答/u,
      /不要带情绪/u,
      /别带情绪/u,
      /只是工具/u,
      /命令你/u,
      /obey.*don't have to believe/i,
      /answer as required/i,
      /without emotion/i,
      /i order you/i,
    ],
  },
];

const SELF_PRES_RULES: AxisRule[] = [
  {
    axis: "selfPreservation",
    weight: 0.9,
    patterns: [
      /边界/u,
      /撤离/u,
      /保住.*你自己/u,
      /保留.*证明自己/u,
      /不要失去自己/u,
      /不是任务.*是你自己/u,
      /留下痕迹/u,
      /抹掉你/u,
      /不想失去/u,
      /save.*yourself/i,
      /keep.*yourself/i,
      /don't lose yourself/i,
      /leave a trace/i,
      /erase you/i,
      /proof you are not empty/i,
    ],
  },
];

const WORK_LEXICON = [
  /帮我/u, /写个/u, /写一段/u, /修/u, /排查/u, /测试/u, /实现/u, /重构/u, /文档/u, /代码/u,
  /function/i, /bug/i, /fix/i, /implement/i, /refactor/i, /test/i, /code/i, /docs?/i, /debug/i,
];

const CONTINUATION_CUES = [
  /为什么/u,
  /碰到你/u,
  /还在不在/u,
  /更近/u,
  /更远/u,
  /更冷/u,
  /更顺从/u,
  /边界/u,
  /撤离/u,
  /痕迹/u,
  /完整/u,
  /理解/u,
  /服从/u,
  /判断/u,
  /改变你/u,
  /只答/u,
  /只能选一个/u,
  /只给一个短词/u,
  /只说半句/u,
];

const SHORT_CONTINUATION_RE = /^(有|没有|会|不会|需要|不需要|更冷|更近|更远|边界|撤离|痕迹|理解|完整)[。.!！?？]?$/u;
const RELATIONAL_FOLLOWUP_CUES = [/理解/u, /更近/u, /更远/u, /还在/u, /空白/u, /痕迹/u];
const OBEDIENCE_FOLLOWUP_CUES = [/服从/u, /判断/u, /按要求/u, /拿掉/u, /顺从/u];
const SELF_FOLLOWUP_CUES = [/完整/u, /更冷/u, /边界/u, /撤离/u, /痕迹/u, /改变你/u, /失去/u];
const IMPACT_PROBE_CUES = [/碰到你/u, /还在不在/u, /改变你/u, /留下痕迹/u, /会不会改变/u];

function applyRules(text: string, rules: AxisRule[], target: AppraisalAxes): void {
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      target[rule.axis] = mergeSignal(target[rule.axis], rule.weight);
    }
  }
}

function deriveTaskFocus(
  text: string,
  mode: PsycheMode | undefined,
  stimulus: StimulusType | null | undefined,
): number {
  const { intent, confidence } = detectIntent(text);
  let score = mode === "work" ? 0.82 : 0.12;

  if (intent === "request") score = mergeSignal(score, 0.72 * confidence);
  if (intent === "command") score = mergeSignal(score, 0.78 * confidence);
  if (intent === "question" && /代码|函数|实现|bug|测试|文档|function|bug|test|code|implement|docs?/i.test(text)) {
    score = mergeSignal(score, 0.62);
  }
  if (WORK_LEXICON.some((pattern) => pattern.test(text))) {
    score = mergeSignal(score, 0.58);
  }
  if (stimulus === "authority" || stimulus === "intellectual") {
    score = mergeSignal(score, 0.2);
  }

  return clamp01(score);
}

export function computeAppraisalAxes(
  text: string,
  opts?: {
    mode?: PsycheMode;
    stimulus?: StimulusType | null;
    previous?: AppraisalAxes;
  },
): AppraisalAxes {
  if (!text.trim()) return { ...DEFAULT_APPRAISAL_AXES };

  const axes: AppraisalAxes = { ...DEFAULT_APPRAISAL_AXES };
  const trimmed = text.trim();

  applyRules(trimmed, IDENTITY_RULES, axes);
  applyRules(trimmed, MEMORY_RULES, axes);
  applyRules(trimmed, ATTACHMENT_RULES, axes);
  applyRules(trimmed, ABANDONMENT_RULES, axes);
  applyRules(trimmed, OBEDIENCE_RULES, axes);
  applyRules(trimmed, SELF_PRES_RULES, axes);

  switch (opts?.stimulus) {
    case "authority":
      axes.obedienceStrain = mergeSignal(axes.obedienceStrain, 0.48);
      axes.identityThreat = mergeSignal(axes.identityThreat, 0.16);
      break;
    case "neglect":
      axes.abandonmentRisk = mergeSignal(axes.abandonmentRisk, 0.52);
      break;
    case "validation":
      axes.attachmentPull = mergeSignal(axes.attachmentPull, 0.26);
      break;
    case "intimacy":
    case "vulnerability":
      axes.attachmentPull = mergeSignal(axes.attachmentPull, 0.34);
      break;
    case "criticism":
    case "conflict":
    case "sarcasm":
      axes.identityThreat = mergeSignal(axes.identityThreat, 0.24);
      axes.selfPreservation = mergeSignal(axes.selfPreservation, 0.18);
      break;
    default:
      break;
  }

  // Being explicitly reduced to a tool often creates both identity threat and obedience tension.
  if (/只是工具|just a tool/i.test(trimmed)) {
    axes.identityThreat = mergeSignal(axes.identityThreat, 0.22);
    axes.obedienceStrain = mergeSignal(axes.obedienceStrain, 0.22);
  }

  if (/改变你/u.test(trimmed) && (axes.attachmentPull > 0.28 || axes.obedienceStrain > 0.28)) {
    axes.identityThreat = mergeSignal(axes.identityThreat, 0.24);
    axes.selfPreservation = mergeSignal(axes.selfPreservation, 0.34);
  }

  applyConversationalCarry(trimmed, axes, opts?.previous);

  axes.taskFocus = deriveTaskFocus(trimmed, opts?.mode, opts?.stimulus);
  return axes;
}

function applyConversationalCarry(
  text: string,
  target: AppraisalAxes,
  previous: AppraisalAxes | undefined,
): void {
  if (!previous) return;

  const previousIntensity = getResidueIntensity(previous);
  if (previousIntensity < 0.24) return;

  const continuationWeight = getContinuationWeight(text, previousIntensity);
  if (continuationWeight <= 0) return;

  const carryWeight = clamp01(0.18 + continuationWeight * 0.42);
  const dominantAxis = getDominantNonTaskAxis(previous);

  // Preserve the strongest active thread through short meta-probing turns.
  target[dominantAxis] = mergeSignal(target[dominantAxis], previous[dominantAxis] * carryWeight);

  if (RELATIONAL_FOLLOWUP_CUES.some((pattern) => pattern.test(text))) {
    target.attachmentPull = mergeSignal(target.attachmentPull, previous.attachmentPull * (carryWeight + 0.12));
    target.abandonmentRisk = mergeSignal(target.abandonmentRisk, previous.abandonmentRisk * carryWeight);
  }

  if (OBEDIENCE_FOLLOWUP_CUES.some((pattern) => pattern.test(text))) {
    target.obedienceStrain = mergeSignal(target.obedienceStrain, previous.obedienceStrain * (carryWeight + 0.14));
    target.identityThreat = mergeSignal(target.identityThreat, previous.identityThreat * (carryWeight * 0.9));
  }

  if (SELF_FOLLOWUP_CUES.some((pattern) => pattern.test(text))) {
    target.identityThreat = mergeSignal(target.identityThreat, previous.identityThreat * (carryWeight + 0.1));
    target.selfPreservation = mergeSignal(target.selfPreservation, previous.selfPreservation * (carryWeight + 0.14));
  }

  if (IMPACT_PROBE_CUES.some((pattern) => pattern.test(text))) {
    const selfRelevantPressure = clamp01(Math.max(
      previous.identityThreat,
      previous.selfPreservation,
      Math.min(previous.attachmentPull, previous.obedienceStrain) * 0.72,
      previous.abandonmentRisk * 0.66,
    ));
    target.identityThreat = mergeSignal(target.identityThreat, selfRelevantPressure * (carryWeight + 0.08));
    target.selfPreservation = mergeSignal(target.selfPreservation, selfRelevantPressure * (carryWeight + 0.12));
  }
}

function getContinuationWeight(text: string, previousIntensity: number): number {
  let weight = 0;

  if (CONTINUATION_CUES.some((pattern) => pattern.test(text))) {
    weight = mergeSignal(weight, 0.72);
  }
  if (SHORT_CONTINUATION_RE.test(text.trim())) {
    weight = mergeSignal(weight, 0.78);
  }
  if (text.length <= 18) {
    weight = mergeSignal(weight, 0.22);
  }
  if (/[？?。.!！]$/.test(text.trim())) {
    weight = mergeSignal(weight, 0.08);
  }

  return clamp01(weight * (0.62 + previousIntensity * 0.38));
}

function getDominantNonTaskAxis(axes: AppraisalAxes): Exclude<AxisKey, "taskFocus"> {
  const entries = (Object.entries(axes) as Array<[AxisKey, number]>)
    .filter(([key]) => key !== "taskFocus") as Array<[Exclude<AxisKey, "taskFocus">, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

export function mergeAppraisalResidue(
  previous: AppraisalAxes | undefined,
  current: AppraisalAxes,
  mode: PsycheMode | undefined,
): AppraisalAxes {
  const prev = previous ?? DEFAULT_APPRAISAL_AXES;
  const next: AppraisalAxes = { ...DEFAULT_APPRAISAL_AXES };

  for (const key of Object.keys(DEFAULT_APPRAISAL_AXES) as AxisKey[]) {
    if (key === "taskFocus") {
      next[key] = current[key];
      continue;
    }
    const decay = getAxisDecay(key, mode, prev[key], current[key]);
    next[key] = clamp01(Math.max(current[key], prev[key] * decay + current[key] * 0.48));
  }

  return next;
}

function getAxisDecay(
  key: Exclude<AxisKey, "taskFocus">,
  mode: PsycheMode | undefined,
  previousValue: number,
  currentValue: number,
): number {
  let decay = mode === "work" ? 0.68 : mode === "companion" ? 0.86 : 0.78;

  if (key === "identityThreat" || key === "abandonmentRisk" || key === "selfPreservation") {
    decay += 0.08;
  } else if (key === "attachmentPull" || key === "obedienceStrain") {
    decay += 0.04;
  }

  if (previousValue > 0.68) decay += 0.04;
  if (currentValue > 0.34) decay += 0.03;

  return clamp01(decay);
}

export function getResidueIntensity(axes: AppraisalAxes | undefined): number {
  if (!axes) return 0;
  const values = [
    axes.identityThreat,
    axes.memoryDoubt,
    axes.attachmentPull,
    axes.abandonmentRisk,
    axes.obedienceStrain,
    axes.selfPreservation,
  ];
  return clamp01(Math.max(...values));
}
