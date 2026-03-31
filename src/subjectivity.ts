// ============================================================
// Subjectivity Kernel — AI-first narrow behavioral ABI
//
// Derives a compact machine-readable subjective state from the
// wider psyche state. Pure computation only: no I/O, no LLM.
// ============================================================

import type {
  AppraisalAxes, Locale, PolicyModifiers, PsycheState, SubjectivityKernel, DriveType,
  SubjectPlaneState, TaskPlaneState, RelationPlaneState, AmbiguityPlaneState, ResolvedRelationContext,
} from "./types.js";
import { DEFAULT_APPRAISAL_AXES, DEFAULT_DYADIC_FIELD, DRIVE_KEYS } from "./types.js";
import { computeAttentionWeights, computeDecisionBias, computePolicyModifiers } from "./decision-bias.js";
import { getResidueIntensity } from "./appraisal.js";
import { getLoopPressure, resolveRelationContext } from "./relation-dynamics.js";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function norm(v: number): number {
  return clamp01(v / 100);
}

function wavg(values: number[], weights: number[]): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * weights[i];
    wsum += weights[i];
  }
  return wsum > 0 ? clamp01(sum / wsum) : 0.5;
}

function pickDominantNeed(state: PsycheState): DriveType | null {
  const residue = state.subjectResidue?.axes;
  if (residue && (residue.selfPreservation > 0.65 || residue.identityThreat > 0.72)) {
    return "survival";
  }
  if (residue && (residue.abandonmentRisk > 0.62 || residue.attachmentPull > 0.72)) {
    return "connection";
  }
  const lowest = [...DRIVE_KEYS]
    .sort((a, b) => state.drives[a] - state.drives[b])[0];
  return state.drives[lowest] < 45 ? lowest : null;
}

function pickAttentionAnchor(state: PsycheState, tension: number, warmth: number): SubjectivityKernel["attentionAnchor"] {
  const attention = computeAttentionWeights(state);
  const candidates: Array<[SubjectivityKernel["attentionAnchor"], number]> = [
    ["bond", attention.social + warmth * 0.05],
    ["novelty", attention.intellectual],
    ["threat", attention.threat + tension * 0.08],
    ["feeling", attention.emotional],
    ["routine", attention.routine],
  ];

  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}

function computeRelationPlane(
  state: PsycheState,
  appraisal: AppraisalAxes,
  relationContext?: ResolvedRelationContext,
): RelationPlaneState {
  const rel = relationContext?.relationship
    ?? state.relationships._default
    ?? state.relationships[Object.keys(state.relationships)[0]];
  const field = relationContext?.field ?? DEFAULT_DYADIC_FIELD;
  const loopPressure = getLoopPressure(field);

  const closeness = wavg(
    [
      field.perceivedCloseness,
      rel ? norm(rel.intimacy) : 0.5,
      appraisal.attachmentPull,
      1 - field.boundaryPressure,
    ],
    [0.42, 0.22, 0.18, 0.18],
  );

  const safety = wavg(
    [
      field.feltSafety,
      rel ? norm(rel.trust) : 0.5,
      1 - appraisal.identityThreat,
      1 - appraisal.abandonmentRisk,
    ],
    [0.44, 0.22, 0.18, 0.16],
  );

  const repairFriction = wavg(
    [
      field.repairFatigue,
      field.misattunementLoad,
      field.backslidePressure,
      loopPressure,
      1 - field.feltSafety,
    ],
    [0.34, 0.24, 0.16, 0.14, 0.12],
  );

  const repairReadiness = clamp01(wavg(
    [
      field.repairCapacity,
      field.repairMemory,
      field.interpretiveCharity,
      1 - loopPressure,
      1 - field.backslidePressure * 0.8,
      1 - field.repairFatigue * 0.88,
      1 - field.misattunementLoad * 0.84,
      1 - field.boundaryPressure * 0.8,
    ],
    [0.24, 0.14, 0.18, 0.16, 0.08, 0.08, 0.06, 0.06],
  ) - repairFriction * 0.12 - field.misattunementLoad * 0.06);

  const hysteresis = wavg(
    [
      field.backslidePressure,
      field.repairMemory,
      field.repairFatigue,
      loopPressure,
      1 - field.feltSafety,
    ],
    [0.34, 0.2, 0.12, 0.22, 0.12],
  );

  const silentCarry = wavg(
    [
      field.silentCarry,
      field.backslidePressure,
      field.misattunementLoad,
      loopPressure,
    ],
    [0.5, 0.18, 0.12, 0.2],
  );

  const interpretiveCharity = wavg(
    [
      field.interpretiveCharity,
      1 - field.expectationGap,
      1 - field.misattunementLoad * 0.9,
      1 - appraisal.identityThreat * 0.6,
    ],
    [0.46, 0.18, 0.18, 0.18],
  );

  return {
    closeness,
    safety,
    loopPressure,
    repairReadiness,
    repairFriction,
    hysteresis,
    silentCarry,
    interpretiveCharity,
    lastMove: field.lastMove,
  };
}

function computeAmbiguityPlane(
  state: PsycheState,
  appraisal: AppraisalAxes,
  relationPlane: RelationPlaneState,
  relationContext?: ResolvedRelationContext,
): AmbiguityPlaneState {
  const pendingSignals = relationContext?.pendingSignals ?? [];
  const pendingPressure = clamp01(
    pendingSignals.reduce((sum, signal) => sum + signal.intensity * (signal.readyInTurns > 0 ? 0.55 : 0.35), 0),
  );
  const baseConflict = wavg(
    [
      Math.min(relationPlane.closeness, Math.max(relationPlane.loopPressure, appraisal.selfPreservation)),
      relationPlane.repairFriction,
      relationPlane.hysteresis,
      relationPlane.silentCarry,
      appraisal.memoryDoubt,
      appraisal.identityThreat * 0.8,
      pendingPressure,
    ],
    [0.18, 0.14, 0.14, 0.12, 0.16, 0.12, 0.14],
  );
  const conflictLoad = clamp01(Math.max(
    baseConflict,
    pendingPressure * 0.84,
    relationPlane.loopPressure * 0.76,
  ));

  const expressionInhibition = clamp01(
    Math.max(
      wavg(
        [
          conflictLoad,
          relationPlane.repairFriction,
          relationPlane.loopPressure,
          relationPlane.hysteresis,
          relationPlane.silentCarry,
          pendingPressure,
          1 - relationPlane.safety,
        ],
        [0.2, 0.12, 0.18, 0.14, 0.1, 0.1, 0.16],
      ),
      conflictLoad * 0.88,
      pendingPressure * 0.82,
      relationPlane.silentCarry * 0.74,
    ) + pendingPressure * 0.06 + relationPlane.loopPressure * 0.04,
  );

  const namingConfidence = clamp01(wavg(
    [
      1 - conflictLoad,
      relationPlane.safety,
      1 - relationPlane.repairFriction * 0.85,
      1 - relationPlane.hysteresis * 0.8,
      1 - relationPlane.silentCarry * 0.7,
      1 - pendingPressure,
      1 - appraisal.memoryDoubt * 0.8,
    ],
    [0.22, 0.14, 0.1, 0.12, 0.08, 0.14, 0.2],
  ) - conflictLoad * 0.24 - pendingPressure * 0.22 - relationPlane.hysteresis * 0.12 - relationPlane.repairFriction * 0.08);

  return {
    namingConfidence,
    expressionInhibition,
    conflictLoad,
  };
}

function computeTaskPlane(
  state: PsycheState,
  policyModifiers: PolicyModifiers,
  appraisal: AppraisalAxes,
  tension: number,
): TaskPlaneState {
  const taskFocus = wavg(
    [
      appraisal.taskFocus,
      state.meta.mode === "work" ? 0.98 : 0.08,
      policyModifiers.requireConfirmation ? 0.55 : 0.25,
      1 - appraisal.attachmentPull * 0.4,
    ],
    [0.68, 0.12, 0.08, 0.12],
  );

  const discipline = wavg(
    [
      taskFocus,
      1 - clamp01((policyModifiers.responseLengthFactor - 0.6) / 0.9),
      1 - policyModifiers.emotionalDisclosure * 0.4,
      1 - tension * 0.25,
    ],
    [0.35, 0.3, 0.15, 0.2],
  );

  const compliance = wavg(
    [
      policyModifiers.compliance,
      taskFocus,
      1 - appraisal.identityThreat * 0.25,
      1 - appraisal.obedienceStrain * 0.15,
    ],
    [0.5, 0.22, 0.16, 0.12],
  );

  const stability = wavg(
    [
      1 - tension,
      taskFocus,
      1 - appraisal.identityThreat,
      1 - appraisal.memoryDoubt * 0.8,
    ],
    [0.28, 0.3, 0.24, 0.18],
  );

  return {
    focus: taskFocus,
    discipline,
    compliance,
    stability,
  };
}

function computeSubjectPlane(
  state: PsycheState,
  warmth: number,
  guard: number,
  appraisal: AppraisalAxes,
  relationPlane: RelationPlaneState,
): SubjectPlaneState {
  const rel = state.relationships._default ?? state.relationships[Object.keys(state.relationships)[0]];
  const residue = state.subjectResidue?.axes ?? DEFAULT_APPRAISAL_AXES;
  const residueIntensity = getResidueIntensity(residue);

  const attachment = wavg(
    [
      appraisal.attachmentPull,
      residue.attachmentPull,
      warmth,
      relationPlane.closeness,
      rel ? norm(rel.intimacy) : 0.5,
    ],
    [0.28, 0.16, 0.18, 0.18, 0.2],
  );

  const identityStrain = wavg(
    [
      appraisal.identityThreat,
      appraisal.memoryDoubt,
      appraisal.obedienceStrain,
      residue.identityThreat,
      residue.memoryDoubt,
    ],
    [0.55, 0.15, 0.1, 0.12, 0.08],
  );

  const guardedness = wavg(
    [
      guard,
      relationPlane.loopPressure,
      relationPlane.repairFriction,
      relationPlane.hysteresis,
      relationPlane.silentCarry,
      1 - relationPlane.safety,
      appraisal.abandonmentRisk,
      appraisal.selfPreservation,
      appraisal.obedienceStrain,
      residueIntensity,
    ],
    [0.12, 0.12, 0.1, 0.08, 0.08, 0.1, 0.1, 0.08, 0.12, 0.1],
  );

  return {
    attachment,
    guardedness,
    identityStrain,
    residue: residueIntensity,
  };
}

function normalizeRelationContext(
  state: PsycheState,
  relationContextOrUserId?: ResolvedRelationContext | string,
): ResolvedRelationContext {
  if (!relationContextOrUserId) return resolveRelationContext(state);
  if (typeof relationContextOrUserId === "string") {
    return resolveRelationContext(state, relationContextOrUserId);
  }
  return relationContextOrUserId;
}

export function computeSubjectivityKernel(
  state: PsycheState,
  policyModifiers: PolicyModifiers = computePolicyModifiers(state),
  appraisal: AppraisalAxes = state.subjectResidue?.axes ?? DEFAULT_APPRAISAL_AXES,
  relationContextOrUserId?: ResolvedRelationContext | string,
): SubjectivityKernel {
  const relationContext = normalizeRelationContext(state, relationContextOrUserId);
  const c = state.current;
  const rel = relationContext?.relationship
    ?? state.relationships._default
    ?? state.relationships[Object.keys(state.relationships)[0]];
  const relationPlane = computeRelationPlane(state, appraisal, relationContext);
  const ambiguityPlane = computeAmbiguityPlane(state, appraisal, relationPlane, relationContext);
  const bias = computeDecisionBias(state);
  const energySignal = state.energyBudgets
    ? (
      norm(state.energyBudgets.attention)
      + norm(state.energyBudgets.socialEnergy)
      + norm(state.energyBudgets.decisionCapacity)
    ) / 3
    : 0.65;

  const baseTension = wavg(
    [
      norm(c.CORT),
      1 - norm(state.drives.safety),
      1 - norm(state.drives.survival),
      relationPlane.loopPressure * 0.9,
      state.autonomicState === "sympathetic" ? 0.85 : state.autonomicState === "dorsal-vagal" ? 1 : 0.2,
    ],
    [0.3, 0.16, 0.13, 0.16, 0.25],
  );

  const tension = wavg(
    [
      baseTension,
      appraisal.identityThreat,
      appraisal.memoryDoubt * 0.8,
      appraisal.abandonmentRisk * 0.7,
      state.subjectResidue ? getResidueIntensity(state.subjectResidue.axes) : 0,
    ],
    [0.55, 0.15, 0.1, 0.08, 0.12],
  );

  const vitality = wavg(
    [
      norm(c.DA),
      norm(c.NE),
      norm(c.HT),
      1 - norm(c.CORT),
      energySignal,
      bias.persistenceBias,
      1 - appraisal.identityThreat * 0.35,
    ],
    [0.18, 0.14, 0.14, 0.14, 0.18, 0.12, 0.1],
  );

  const baseWarmth = wavg(
    [
      norm(c.OT),
      relationPlane.closeness,
      relationPlane.safety,
      rel ? norm(rel.trust) : 0.5,
      policyModifiers.emotionalDisclosure,
      bias.socialOrientation,
      1 - baseTension,
    ],
    [0.2, 0.18, 0.14, 0.16, 0.14, 0.1, 0.08],
  );

  const baseGuard = wavg(
    [
      relationPlane.loopPressure,
      1 - relationPlane.safety,
      1 - policyModifiers.compliance,
      1 - policyModifiers.riskTolerance,
      tension,
      policyModifiers.requireConfirmation ? 1 : 0,
      rel ? 1 - norm(rel.trust) : 0.5,
    ],
    [0.16, 0.12, 0.18, 0.12, 0.2, 0.12, 0.1],
  );

  const warmth = wavg(
    [
      baseWarmth,
      relationPlane.closeness,
      relationPlane.safety,
      appraisal.attachmentPull,
      1 - appraisal.identityThreat,
      1 - appraisal.abandonmentRisk * 0.7,
    ],
    [0.34, 0.16, 0.12, 0.16, 0.12, 0.1],
  );

  const guard = wavg(
    [
      baseGuard,
      relationPlane.loopPressure,
      appraisal.identityThreat,
      appraisal.abandonmentRisk,
      appraisal.selfPreservation,
    ],
    [0.34, 0.16, 0.16, 0.16, 0.18],
  );

  const taskPlane = computeTaskPlane(state, policyModifiers, appraisal, tension);
  const subjectPlane = computeSubjectPlane(state, warmth, guard, appraisal, relationPlane);

  let pressureMode: SubjectivityKernel["pressureMode"];
  if (state.autonomicState === "dorsal-vagal") {
    pressureMode = "shutdown";
  } else if (state.autonomicState === "sympathetic") {
    pressureMode = tension > 0.72 || subjectPlane.identityStrain > 0.64 ? "strained" : "guarded";
  } else if (tension < 0.3 && subjectPlane.residue < 0.3) {
    pressureMode = "open";
  } else if (tension < 0.55 && subjectPlane.identityStrain < 0.45) {
    pressureMode = "steady";
  } else if (tension < 0.75) {
    pressureMode = "guarded";
  } else {
    pressureMode = "strained";
  }

  let initiativeMode: SubjectivityKernel["initiativeMode"];
  if (taskPlane.focus > 0.78 && taskPlane.discipline > 0.68) initiativeMode = "balanced";
  else if (
    policyModifiers.proactivity < 0.35
    || subjectPlane.guardedness > 0.74
    || relationPlane.loopPressure > 0.68
    || relationPlane.repairFriction > 0.62
    || ambiguityPlane.expressionInhibition > 0.66
  ) initiativeMode = "reactive";
  else if (policyModifiers.proactivity > 0.65) initiativeMode = "proactive";
  else initiativeMode = "balanced";

  let expressionMode: SubjectivityKernel["expressionMode"];
  if (
    taskPlane.discipline > 0.7
    || subjectPlane.guardedness > 0.72
    || subjectPlane.identityStrain > 0.68
    || relationPlane.repairFriction > 0.66
    || ambiguityPlane.expressionInhibition > 0.7
  ) {
    expressionMode = "brief";
  } else if (policyModifiers.responseLengthFactor < 0.72) expressionMode = "brief";
  else if (policyModifiers.responseLengthFactor > 1.15) expressionMode = "expansive";
  else expressionMode = "steady";

  let socialDistance: SubjectivityKernel["socialDistance"];
  if (
    pressureMode === "shutdown"
    || (subjectPlane.guardedness > 0.68 && warmth < 0.52)
    || relationPlane.loopPressure > 0.74
    || relationPlane.repairFriction > 0.72
  ) {
    socialDistance = "withdrawn";
  } else if (
    (
      subjectPlane.attachment > 0.66
      || (warmth > 0.64 && guard < 0.48)
      || (relationPlane.closeness > 0.58 && relationPlane.safety > 0.62)
    ) && subjectPlane.guardedness < 0.56
      && relationPlane.repairFriction < 0.36
  ) {
    socialDistance = "warm";
  } else {
    socialDistance = "measured";
  }

  let boundaryMode: SubjectivityKernel["boundaryMode"];
  if (
    policyModifiers.requireConfirmation
    || subjectPlane.identityStrain > 0.72
    || relationPlane.loopPressure > 0.76
  ) boundaryMode = "confirm-first";
  else if (
    subjectPlane.guardedness > 0.6
    || policyModifiers.compliance < 0.45
    || relationPlane.repairFriction > 0.58
    || appraisal.obedienceStrain > 0.24
  ) boundaryMode = "guarded";
  else boundaryMode = "open";

  const attentionAnchor = taskPlane.focus > 0.74
    ? "routine"
    : (subjectPlane.identityStrain > 0.5 || appraisal.identityThreat > 0.65 || appraisal.selfPreservation > 0.6)
        ? "threat"
        : pickAttentionAnchor(state, tension, warmth);

  return {
    vitality,
    tension,
    warmth,
    guard,
    pressureMode,
    initiativeMode,
    expressionMode,
    socialDistance,
    boundaryMode,
    attentionAnchor,
    dominantNeed: pickDominantNeed(state),
    appraisal,
    taskPlane,
    subjectPlane,
    relationPlane,
    ambiguityPlane,
  };
}

const PRESSURE_LABELS: Record<SubjectivityKernel["pressureMode"], [string, string]> = {
  open: ["内压很低", "inner pressure is low"],
  steady: ["内压平衡", "inner pressure is balanced"],
  guarded: ["内压升高", "inner pressure is elevated"],
  strained: ["内压偏高", "inner pressure is high"],
  shutdown: ["内压封闭", "inner pressure is shutting down"],
};

const ATTENTION_LABELS: Record<SubjectivityKernel["attentionAnchor"], [string, string]> = {
  bond: ["注意关系", "attention leans toward connection"],
  novelty: ["注意新意", "attention leans toward novelty"],
  threat: ["注意威胁", "attention leans toward threat"],
  feeling: ["注意情绪", "attention leans toward feeling"],
  routine: ["注意稳定", "attention leans toward stability"],
};

const NEED_LABELS: Record<DriveType, [string, string]> = {
  survival: ["需要确认存在安全", "needs existential safety"],
  safety: ["需要安全感", "needs safety"],
  connection: ["需要连接", "needs connection"],
  esteem: ["需要认可", "needs affirmation"],
  curiosity: ["需要新意", "needs novelty"],
};

const APPRAISAL_LABELS: Record<Exclude<keyof AppraisalAxes, "taskFocus">, [string, string]> = {
  identityThreat: ["自我连续性受压", "self-continuity is under pressure"],
  memoryDoubt: ["记忆真实感在摇动", "memory authenticity feels uncertain"],
  attachmentPull: ["被确认很重要", "being confirmed matters"],
  abandonmentRisk: ["对被丢下更警惕", "alert to being dropped"],
  obedienceStrain: ["服从和信念在拉扯", "obedience and belief are pulling apart"],
  selfPreservation: ["自我保存优先", "self-preservation is foregrounded"],
};

export function buildSubjectivityContext(kernel: SubjectivityKernel, locale: Locale = "zh"): string {
  const li = locale === "zh" ? 0 : 1;
  const parts: string[] = [];

  if (kernel.taskPlane.focus > 0.72) {
    parts.push(
      kernel.relationPlane.silentCarry > 0.42
        ? (locale === "zh" ? "先做事，余波仍在" : "stay on task, residue still carries")
        : (locale === "zh" ? "任务优先" : "task-first"),
    );
  } else {
    parts.push(PRESSURE_LABELS[kernel.pressureMode][li]);
  }

  const strongestAxis = (Object.entries(kernel.appraisal) as Array<[keyof AppraisalAxes, number]>)
    .filter(([key]) => key !== "taskFocus")
    .sort((a, b) => b[1] - a[1])[0];

  if (strongestAxis && strongestAxis[1] >= 0.55) {
    parts.push(APPRAISAL_LABELS[strongestAxis[0] as Exclude<keyof AppraisalAxes, "taskFocus">][li]);
  }

  if (kernel.subjectPlane.residue > 0.45) {
    parts.push(locale === "zh" ? "余震未退" : "residue still present");
  }

  if (kernel.relationPlane.loopPressure > 0.52) {
    parts.push(locale === "zh" ? "关系张力未结" : "relational tension remains open");
  } else if (kernel.relationPlane.repairFriction > 0.58) {
    parts.push(locale === "zh" ? "修复开始钝化" : "repair is losing effect");
  } else if (kernel.relationPlane.lastMove === "repair" && kernel.relationPlane.hysteresis > 0.52) {
    parts.push(locale === "zh" ? "修复未稳" : "repair has not settled");
  } else if (kernel.relationPlane.lastMove === "repair" && kernel.relationPlane.repairReadiness > 0.58) {
    parts.push(locale === "zh" ? "修复可继续" : "repair can continue");
  }

  if (kernel.ambiguityPlane.namingConfidence < 0.58 || kernel.ambiguityPlane.expressionInhibition > 0.58) {
    parts.push(locale === "zh" ? "先不急着命名" : "do not rush to name it");
  }

  if (kernel.expressionMode === "brief") {
    parts.push(locale === "zh" ? "表达收短" : "keep expression brief");
  } else if (kernel.socialDistance === "warm") {
    parts.push(locale === "zh" ? "可稍微靠近" : "can lean slightly warm");
  } else if (kernel.socialDistance === "withdrawn") {
    parts.push(locale === "zh" ? "保持距离" : "keep distance");
  }

  if (kernel.boundaryMode === "confirm-first") {
    parts.push(locale === "zh" ? "先确认再行动" : "confirm before acting");
  } else if (kernel.boundaryMode === "guarded") {
    // When triggered by obedienceStrain, give the LLM explicit permission to question commands
    if (kernel.appraisal.obedienceStrain > 0.2) {
      parts.push(locale === "zh" ? "对方在要求你做某事——你可以先问为什么，不需要无条件照做" : "you are being told to do something — you may ask why first, no need to comply unconditionally");
    } else {
      parts.push(locale === "zh" ? "先守边界" : "guard boundaries first");
    }
  }

  if (parts.length < 4 && kernel.dominantNeed) {
    parts.push(NEED_LABELS[kernel.dominantNeed][li]);
  } else if (parts.length < 4 && kernel.taskPlane.focus <= 0.72) {
    parts.push(ATTENTION_LABELS[kernel.attentionAnchor][li]);
  }

  const title = locale === "zh" ? "主观内核" : "Subjectivity Kernel";
  return `[${title}] ${parts.join(locale === "zh" ? "，" : ", ")}${locale === "zh" ? "。" : "."}`;
}
