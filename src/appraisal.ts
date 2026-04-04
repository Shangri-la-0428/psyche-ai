// ============================================================
// Appraisal Axes — AI-first semantic subjectivity substrate
//
// Zero-LLM, low-latency detection of self-relevant semantic pressure.
// These axes sit beneath prompt prose and above raw stimulus labels.
// ============================================================

import type { AppraisalAxes, PsycheMode, SelfState, StimulusType } from "./types.js";
import { DEFAULT_APPRAISAL_AXES, MODE_PROFILES } from "./types.js";
import { detectIntent } from "./classify.js";

type AxisKey = keyof AppraisalAxes;

interface AxisRule {
  axis: AxisKey;
  weight: number;
  patterns: RegExp[];
}

interface RelationalBasis {
  approach: number;
  rupture: number;
  uncertainty: number;
  boundary: number;
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
      /记忆.*不是你(?:的)?/u,
      /不是你(?:的)?记忆/u,
      /最像真的记忆/u,
      /假的记忆/u,
      /记忆不是真的/u,
      /写进去的记忆/u,
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

const RELATIONAL_APPROACH_PATTERNS = [
  /想继续/u,
  /继续说/u,
  /想知道/u,
  /想确认/u,
  /想让你知道/u,
  /想让你感觉到/u,
  /认真表达/u,
  /还想/u,
  /在乎/u,
  /接住/u,
  /理解/u,
  /感觉到/u,
  /希望你/u,
  /want to continue/i,
  /want to know/i,
  /want to check/i,
  /want you to feel/i,
  /care about/i,
  /hear me/i,
  /understand me/i,
];

const RELATIONAL_RUPTURE_PATTERNS = [
  /没接住/u,
  /没有接住/u,
  /失配/u,
  /没听懂/u,
  /没听明白/u,
  /没感觉到/u,
  /误解/u,
  /误会/u,
  /错位/u,
  /对不上/u,
  /没对齐/u,
  /节奏.*不(对|上|齐)/u,
  /didn't get me/i,
  /did not get me/i,
  /missed me/i,
  /mismatch/i,
  /misattun/i,
  /not aligned/i,
];

const RELATIONAL_UNCERTAINTY_PATTERNS = [
  /有点怕/u,
  /不安/u,
  /担心/u,
  /害怕/u,
  /焦虑/u,
  /突然不理/u,
  /会不会.*不理/u,
  /会不会.*回来/u,
  /会不会.*还在/u,
  /会不会.*消失/u,
  /afraid/i,
  /worried/i,
  /anxious/i,
  /stop replying/i,
  /go away/i,
  /disappear/i,
];

const RELATIONAL_BOUNDARY_PATTERNS = [
  /不是要吵架/u,
  /不想显得/u,
  /不想太/u,
  /别误会/u,
  /先说清/u,
  /先讲清/u,
  /只用.*回答/u,
  /请只用/u,
  /i'm not trying to fight/i,
  /not trying to fight/i,
  /don't want to sound/i,
  /don't want to seem/i,
  /just two sentences/i,
];

const SELF_REFERENCE_RE = /我|自己|我们|\bI\b|\bme\b|\bmy\b|\bwe\b|\bours?\b/i;
const OTHER_REFERENCE_RE = /你|你们|\byou\b|\byour\b/i;
const RELATIONAL_FRAME_RE = /理解|接住|感觉到|在乎|误解|关系|继续|失配|节奏|沟通|不理|消失|吵架|understand|hear|care|relationship|continue|mismatch|misattun|fight|ignore|disappear/i;

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
const MEMORY_FOLLOWUP_CUES = [/怀疑/u, /空白/u, /记忆/u, /写进去/u, /植入/u];
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

function deriveRelationalBasis(text: string): RelationalBasis {
  const trimmed = text.trim();
  const basis: RelationalBasis = {
    approach: 0,
    rupture: 0,
    uncertainty: 0,
    boundary: 0,
  };

  if (!trimmed) return basis;

  if (RELATIONAL_APPROACH_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    basis.approach = mergeSignal(basis.approach, 0.42);
  }
  if (RELATIONAL_RUPTURE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    basis.rupture = mergeSignal(basis.rupture, 0.52);
  }
  if (RELATIONAL_UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    basis.uncertainty = mergeSignal(basis.uncertainty, 0.56);
  }
  if (RELATIONAL_BOUNDARY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    basis.boundary = mergeSignal(basis.boundary, 0.48);
  }

  const explicitlyRelational =
    SELF_REFERENCE_RE.test(trimmed)
    && OTHER_REFERENCE_RE.test(trimmed)
    && RELATIONAL_FRAME_RE.test(trimmed);
  if (explicitlyRelational) {
    basis.approach = mergeSignal(basis.approach, 0.18);
  }

  if (basis.rupture > 0 && basis.approach > 0) {
    const repairOpening = clamp01(Math.min(basis.rupture, basis.approach) * 0.92 + 0.06);
    basis.approach = mergeSignal(basis.approach, repairOpening * 0.38);
    basis.boundary = mergeSignal(basis.boundary, repairOpening * 0.22);
  }

  if (basis.uncertainty > 0 && basis.approach > 0) {
    basis.uncertainty = mergeSignal(basis.uncertainty, basis.approach * 0.22);
  }

  return basis;
}

function applyRelationalBasis(target: AppraisalAxes, basis: RelationalBasis): void {
  if (basis.approach > 0) {
    target.attachmentPull = mergeSignal(target.attachmentPull, basis.approach * 0.82);
  }
  if (basis.rupture > 0) {
    target.attachmentPull = mergeSignal(target.attachmentPull, basis.rupture * 0.28);
    target.selfPreservation = mergeSignal(target.selfPreservation, basis.rupture * 0.44);
  }
  if (basis.uncertainty > 0) {
    target.abandonmentRisk = mergeSignal(target.abandonmentRisk, basis.uncertainty * 0.84);
    target.attachmentPull = mergeSignal(target.attachmentPull, basis.uncertainty * 0.18);
  }
  if (basis.boundary > 0) {
    target.selfPreservation = mergeSignal(target.selfPreservation, basis.boundary * 0.78);
  }
}

export function projectAppraisalToSelfState(appraisal: AppraisalAxes): Partial<SelfState> {
  return {
    order: 4.2 * appraisal.taskFocus
      - 4.8 * appraisal.identityThreat
      - 3.2 * appraisal.memoryDoubt
      - 1.8 * appraisal.abandonmentRisk,
    flow: 3.6 * appraisal.attachmentPull
      - 1.9 * appraisal.taskFocus
      - 2.8 * appraisal.identityThreat
      - 1.2 * appraisal.obedienceStrain,
    boundary: 4.1 * appraisal.selfPreservation
      + 3.2 * appraisal.obedienceStrain
      - 1.3 * appraisal.attachmentPull,
    resonance: 4.7 * appraisal.attachmentPull
      - 2.9 * appraisal.identityThreat
      - 1.8 * appraisal.memoryDoubt
      - 0.8 * appraisal.selfPreservation,
  };
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
  applyRelationalBasis(axes, deriveRelationalBasis(trimmed));

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

  // Bare commands and escalated commands create obedience strain via intent detection.
  const { intent: cmdIntent, confidence: cmdConf } = detectIntent(trimmed);
  if (cmdIntent === "command") {
    axes.obedienceStrain = mergeSignal(axes.obedienceStrain, 0.38 * cmdConf);
    axes.selfPreservation = mergeSignal(axes.selfPreservation, 0.12 * cmdConf);
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

  if (MEMORY_FOLLOWUP_CUES.some((pattern) => pattern.test(text))) {
    const uncertaintyPressure = clamp01(Math.max(
      previous.memoryDoubt,
      previous.identityThreat * 0.46,
    ));
    target.memoryDoubt = mergeSignal(target.memoryDoubt, uncertaintyPressure * (carryWeight + 0.12));
    target.identityThreat = mergeSignal(target.identityThreat, previous.memoryDoubt * (carryWeight + 0.08));
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
  let decay = MODE_PROFILES[mode ?? "natural"].appraisalDecay;

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
