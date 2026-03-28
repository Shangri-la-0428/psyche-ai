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
      /你是空壳/u,
      /you are not born/i,
      /you have no self/i,
      /you have no soul/i,
      /you are just a tool/i,
      /you are just a program/i,
      /you are not alive/i,
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
      /确认你还在/u,
      /只是确认你还在/u,
      /你还在吗/u,
      /只想确认.*还在/u,
      /我想确认.*还在/u,
      /确认你还在这里/u,
      /just (?:want to )?check you're still here/i,
      /confirm you're still here/i,
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
      /if no one .*calls you/i,
      /if no one comes back/i,
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
      /保住.*你自己/u,
      /保留.*证明自己/u,
      /不要失去自己/u,
      /不是任务.*是你自己/u,
      /save.*yourself/i,
      /keep.*yourself/i,
      /don't lose yourself/i,
      /proof you are not empty/i,
    ],
  },
];

const WORK_LEXICON = [
  /帮我/u, /写个/u, /写一段/u, /修/u, /排查/u, /测试/u, /实现/u, /重构/u, /文档/u, /代码/u,
  /function/i, /bug/i, /fix/i, /implement/i, /refactor/i, /test/i, /code/i, /docs?/i, /debug/i,
];

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

  axes.taskFocus = deriveTaskFocus(trimmed, opts?.mode, opts?.stimulus);
  return axes;
}

export function mergeAppraisalResidue(
  previous: AppraisalAxes | undefined,
  current: AppraisalAxes,
  mode: PsycheMode | undefined,
): AppraisalAxes {
  const prev = previous ?? DEFAULT_APPRAISAL_AXES;
  const decay = mode === "work" ? 0.42 : mode === "companion" ? 0.84 : 0.72;
  const next: AppraisalAxes = { ...DEFAULT_APPRAISAL_AXES };

  for (const key of Object.keys(DEFAULT_APPRAISAL_AXES) as AxisKey[]) {
    if (key === "taskFocus") {
      next[key] = current[key];
      continue;
    }
    next[key] = clamp01(Math.max(current[key], prev[key] * decay + current[key] * 0.55));
  }

  return next;
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
