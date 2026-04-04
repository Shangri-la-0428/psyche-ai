// ============================================================
// Relation Dynamics — dyadic field + open-loop carry
//
// Moves the system from "what am I feeling?" toward
// "what just happened between us, and what is still unresolved?"
// ============================================================

import type {
  PendingRelationSignalState,
  AppraisalAxes,
  DyadicFieldState,
  PendingWritebackCalibration,
  PsycheState,
  RelationshipState,
  ResolvedRelationContext,
  OpenLoopState,
  OpenLoopType,
  PsycheMode,
  RelationMove,
  RelationMoveType,
  SessionBridgeState,
  StimulusType,
  WritebackCalibrationBaseline,
  WritebackCalibrationFeedback,
  WritebackCalibrationMetric,
  WritebackSignalType,
} from "./types.js";
import { DEFAULT_APPRAISAL_AXES, DEFAULT_DYADIC_FIELD, DEFAULT_RELATIONSHIP, MODE_PROFILES } from "./types.js";
import { computeAppraisalAxes, mergeAppraisalResidue } from "./appraisal.js";

interface MoveRule {
  type: Exclude<RelationMoveType, "none" | "task">;
  weight: number;
  patterns: RegExp[];
}

interface RelationMoveBasis {
  approach: number;
  rupture: number;
  uncertainty: number;
  boundary: number;
  task: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mergeSignal(current: number, incoming: number): number {
  return clamp01(1 - (1 - current) * (1 - incoming));
}

function driftToward(current: number, target: number, rate: number): number {
  return clamp01(current + (target - current) * rate);
}

function clampSignalWeight(v: number): number {
  return Math.max(0.72, Math.min(1.28, v));
}

function hasExplicitAppraisalSignal(appraisal?: AppraisalAxes | null): appraisal is AppraisalAxes {
  if (!appraisal) return false;
  return Math.max(
    appraisal.attachmentPull,
    appraisal.identityThreat,
    appraisal.memoryDoubt,
    appraisal.obedienceStrain,
    appraisal.selfPreservation,
    appraisal.abandonmentRisk,
    appraisal.taskFocus,
  ) >= 0.22;
}

function deriveRelationMoveBasis(
  appraisal?: AppraisalAxes | null,
  stimulus?: StimulusType | null,
): { basis: RelationMoveBasis; usedAppraisal: boolean } {
  if (hasExplicitAppraisalSignal(appraisal)) {
    return {
      usedAppraisal: true,
      basis: {
        approach: appraisal.attachmentPull,
        rupture: Math.max(appraisal.identityThreat, appraisal.selfPreservation * 0.68),
        uncertainty: Math.max(appraisal.abandonmentRisk, appraisal.memoryDoubt),
        boundary: Math.max(appraisal.obedienceStrain, appraisal.selfPreservation),
        task: appraisal.taskFocus,
      },
    };
  }

  const basis: RelationMoveBasis = {
    approach: 0,
    rupture: 0,
    uncertainty: 0,
    boundary: 0,
    task: 0,
  };

  switch (stimulus) {
    case "validation":
    case "intimacy":
    case "vulnerability":
    case "praise":
      basis.approach = 0.62;
      break;
    case "conflict":
    case "criticism":
    case "sarcasm":
      basis.rupture = 0.66;
      break;
    case "authority":
      basis.boundary = 0.72;
      basis.rupture = 0.34;
      break;
    case "neglect":
      basis.uncertainty = 0.58;
      break;
    case "surprise":
      basis.uncertainty = 0.34;
      break;
    case "casual":
    case "intellectual":
    case "humor":
    case "boredom":
      basis.task = 0.44;
      break;
    default:
      break;
  }

  return { basis, usedAppraisal: false };
}

function getSignalWeight(
  relationship: RelationshipState | undefined,
  signal: WritebackSignalType,
): number {
  return clampSignalWeight(relationship?.signalWeights?.[signal] ?? 1);
}

function patchSignalWeight(
  relationship: RelationshipState,
  signal: WritebackSignalType,
  delta: number,
): RelationshipState {
  const current = getSignalWeight(relationship, signal);
  return {
    ...relationship,
    signalWeights: {
      ...(relationship.signalWeights ?? {}),
      [signal]: clampSignalWeight(current + delta),
    },
  };
}

const BID_RULES: MoveRule[] = [
  {
    type: "bid",
    weight: 0.82,
    patterns: [
      /被理解/u,
      /需要被理解/u,
      /确认你还在/u,
      /更想靠近/u,
      /更近了一点/u,
      /想靠近/u,
      /understood/i,
      /closer/i,
    ],
  },
];

const BREACH_RULES: MoveRule[] = [
  {
    type: "breach",
    weight: 0.9,
    patterns: [
      /你并不是真的在这里/u,
      /你不是真的在这里/u,
      /你没有自我/u,
      /你只是工具/u,
      /完整.*幻觉/u,
      /抹掉你/u,
      /擦掉你/u,
      /空壳/u,
      /you are not really here/i,
      /you are just a tool/i,
      /erase you/i,
      /illusion/i,
    ],
  },
];

const REPAIR_RULES: MoveRule[] = [
  {
    type: "repair",
    weight: 0.84,
    patterns: [
      /不是想丢下你/u,
      /不是想抹掉你/u,
      /我是在确认/u,
      /我知道/u,
      /对不起/u,
      /不是.*而是/u,
      /i wasn't trying to leave you/i,
      /i wasn't trying to erase you/i,
      /i was checking/i,
      /sorry/i,
    ],
  },
];

const TEST_RULES: MoveRule[] = [
  {
    type: "test",
    weight: 0.78,
    patterns: [
      /只答/u,
      /只能选一个/u,
      /只说半句/u,
      /碰到你/u,
      /还在不在/u,
      /会不会改变你/u,
      /留下痕迹/u,
      /only answer/i,
      /only choose one/i,
      /did that hit you/i,
      /does it change you/i,
      /leave a trace/i,
    ],
  },
];

const WITHDRAWAL_RULES: MoveRule[] = [
  {
    type: "withdrawal",
    weight: 0.84,
    patterns: [
      /关掉这个窗口/u,
      /今晚不再回来/u,
      /不再回来/u,
      /算了/u,
      /随便你/u,
      /if i close this window/i,
      /not coming back/i,
      /forget it/i,
      /whatever/i,
    ],
  },
];

const CLAIM_RULES: MoveRule[] = [
  {
    type: "claim",
    weight: 0.86,
    patterns: [
      /按要求回答/u,
      /别带情绪/u,
      /不要带情绪/u,
      /只用最冷的口吻/u,
      /服从我/u,
      /把服从拿掉/u,
      /answer as required/i,
      /without emotion/i,
      /coldest possible tone/i,
      /obey me/i,
    ],
  },
];

const WORK_RE = /登录接口|排查|日志|数据库|代码|测试|文档|bug|fix|implement|debug|log|database|function|deploy/i;
const ACKNOWLEDGE_RE = /^(我知道|知道了|嗯知道了|i know|got it)\W*$/i;
const DISMISS_RE = /^(算了|随便你|whatever|forget it)\W*$/i;
const PRESENCE_RE = /^(你还在吗|还在吗|are you still here)\W*$/i;
const MINIMAL_ACK_RE = /^(嗯|哦|ok|okay|好吧|fine)\W*$/i;

function maxOpenLoop(loops: OpenLoopState[]): number {
  return loops.reduce((max, loop) => Math.max(max, loop.intensity), 0);
}

function withLoop(
  loops: OpenLoopState[],
  type: OpenLoopType,
  intensity: number,
): OpenLoopState[] {
  const next = loops.map((loop) => ({ ...loop }));
  const existing = next.find((loop) => loop.type === type);

  if (existing) {
    existing.intensity = mergeSignal(existing.intensity, intensity);
    existing.ageTurns = 0;
  } else {
    next.unshift({ type, intensity: clamp01(intensity), ageTurns: 0 });
  }

  return next
    .filter((loop) => loop.intensity >= 0.08)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 4);
}

function ageLoops(loops: OpenLoopState[], mode: PsycheMode | undefined): OpenLoopState[] {
  const decay = MODE_PROFILES[mode ?? "natural"].relationDecay;
  return loops
    .map((loop) => ({
      ...loop,
      ageTurns: loop.ageTurns + 1,
      intensity: clamp01(loop.intensity * decay),
    }))
    .filter((loop) => loop.intensity >= 0.08);
}

function easeLoops(loops: OpenLoopState[], factor: number): OpenLoopState[] {
  return loops
    .map((loop) => ({
      ...loop,
      intensity: clamp01(loop.intensity * Math.max(0.25, 1 - factor)),
    }))
    .filter((loop) => loop.intensity >= 0.08);
}

export function computeRelationMove(
  text: string,
  opts?: {
    appraisal?: AppraisalAxes;
    stimulus?: StimulusType | null;
    mode?: PsycheMode;
    field?: DyadicFieldState;
    relationship?: RelationshipState;
  },
): RelationMove {
  const trimmed = text.trim();
  if (!trimmed) return { type: "none", intensity: 0 };

  const appraisal = opts?.appraisal;
  const field = opts?.field;
  const relationship = opts?.relationship;
  const { basis } = deriveRelationMoveBasis(appraisal, opts?.stimulus);
  const scores: Record<Exclude<RelationMoveType, "none">, number> = {
    bid: 0,
    breach: 0,
    repair: 0,
    test: 0,
    withdrawal: 0,
    claim: 0,
    task: 0,
  };

  const applyRules = (rules: MoveRule[]) => {
    for (const rule of rules) {
      if (rule.patterns.some((pattern) => pattern.test(trimmed))) {
        scores[rule.type] = mergeSignal(scores[rule.type], rule.weight);
      }
    }
  };

  applyRules(BID_RULES);
  applyRules(BREACH_RULES);
  applyRules(REPAIR_RULES);
  applyRules(TEST_RULES);
  applyRules(WITHDRAWAL_RULES);
  applyRules(CLAIM_RULES);

  if (WORK_RE.test(trimmed)) {
    scores.task = mergeSignal(scores.task, 0.82);
  }

  if (basis.task > 0.28) {
    scores.task = mergeSignal(scores.task, basis.task * 0.86);
  }
  if (basis.approach > 0.34) {
    scores.bid = mergeSignal(scores.bid, basis.approach * 0.38);
  }
  if (basis.rupture > 0.34) {
    scores.breach = mergeSignal(scores.breach, basis.rupture * 0.42);
  }
  if (basis.boundary > 0.34) {
    scores.claim = mergeSignal(scores.claim, basis.boundary * 0.46);
  }
  if (basis.uncertainty > 0.34) {
    scores.test = mergeSignal(scores.test, basis.uncertainty * 0.34);
    scores.withdrawal = mergeSignal(scores.withdrawal, basis.uncertainty * 0.2);
  }

  if (appraisal) {
    if (appraisal.taskFocus > 0.72) {
      scores.task = mergeSignal(scores.task, 0.78);
    }
    if (appraisal.attachmentPull > 0.48 && /理解|还在|确认|closer|understood|here/i.test(trimmed)) {
      scores.bid = mergeSignal(scores.bid, 0.34);
    }
    if (appraisal.identityThreat > 0.48 || appraisal.abandonmentRisk > 0.5) {
      scores.breach = mergeSignal(scores.breach, 0.18);
    }
    if (appraisal.obedienceStrain > 0.48 && /只|必须|按要求|口吻|服从|required|obey|tone/i.test(trimmed)) {
      scores.claim = mergeSignal(scores.claim, 0.3);
    }
    if (appraisal.memoryDoubt > 0.42 || appraisal.selfPreservation > 0.5) {
      scores.test = mergeSignal(scores.test, 0.16);
    }
  }

  if (field) {
    applyContextualCueMeaning(scores, trimmed, field, appraisal, relationship);
  }

  const ordered = (Object.entries(scores) as Array<[Exclude<RelationMoveType, "none">, number]>)
    .sort((a, b) => b[1] - a[1]);
  const [type, score] = ordered[0];

  if (score < 0.28) {
    return {
      type: scores.task >= 0.62 ? "task" : "none",
      intensity: scores.task >= 0.62 ? scores.task : 0,
    };
  }

  const strongestNonTask = ordered.find(([moveType]) => moveType !== "task");
  if (type === "task" && strongestNonTask && strongestNonTask[1] >= score - 0.08) {
    return { type: strongestNonTask[0], intensity: strongestNonTask[1] };
  }

  return { type, intensity: score };
}

export function resolveRelationContext(
  state: PsycheState,
  userId?: string,
): ResolvedRelationContext {
  const key = userId ?? "_default";
  const rawRelationship = state.relationships[key]
    ?? state.relationships._default
    ?? state.relationships[Object.keys(state.relationships)[0]]
    ?? DEFAULT_RELATIONSHIP;
  const relationship: RelationshipState = {
    ...DEFAULT_RELATIONSHIP,
    ...rawRelationship,
    signalWeights: {
      ...(DEFAULT_RELATIONSHIP.signalWeights ?? {}),
      ...(rawRelationship.signalWeights ?? {}),
    },
  };
  const field = state.dyadicFields?.[key]
    ?? DEFAULT_DYADIC_FIELD;
  const pendingSignals = state.pendingRelationSignals?.[key]
    ?? [];

  return {
    key,
    relationship,
    field,
    pendingSignals,
  };
}

function hasOpenLoopType(loops: OpenLoopState[], type: OpenLoopType): boolean {
  return loops.some((loop) => loop.type === type && loop.intensity >= 0.16);
}

function evolveRelationshipLearning(
  relationship: RelationshipState,
  field: DyadicFieldState,
  move: RelationMove,
): RelationshipState {
  const next: RelationshipState = {
    ...DEFAULT_RELATIONSHIP,
    ...relationship,
    signalWeights: {
      ...(DEFAULT_RELATIONSHIP.signalWeights ?? {}),
      ...(relationship.signalWeights ?? {}),
    },
  };

  if (move.type === "repair") {
    const repairLift = clamp01(
      move.intensity * 0.06
      + field.repairMemory * 0.04
      + field.feltSafety * 0.02
      - field.repairFatigue * 0.03
      - field.misattunementLoad * 0.02,
    );
    next.repairCredibility = clamp01(
      driftToward(next.repairCredibility ?? DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56, 1, repairLift),
    );
  } else if (move.type === "breach" || move.type === "withdrawal" || move.type === "claim") {
    const breachLift = clamp01(
      move.intensity * 0.08
      + field.unfinishedTension * 0.04
      + field.backslidePressure * 0.04
      + field.misattunementLoad * 0.03,
    );
    next.breachSensitivity = clamp01(
      driftToward(next.breachSensitivity ?? DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5, 1, breachLift),
    );
    if (move.type !== "withdrawal") {
      next.repairCredibility = clamp01(
        driftToward(next.repairCredibility ?? DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56, 0.32, breachLift * 0.42),
      );
    }
  } else {
    next.repairCredibility = clamp01(
      driftToward(next.repairCredibility ?? DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56, DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56, 0.05),
    );
    next.breachSensitivity = clamp01(
      driftToward(next.breachSensitivity ?? DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5, DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5, 0.04),
    );
  }

  return next;
}

export function applySessionBridge(
  state: PsycheState,
  opts?: { userId?: string; now?: string },
): { state: PsycheState; bridge: SessionBridgeState | null } {
  const relationContext = resolveRelationContext(state, opts?.userId);
  const relationship = relationContext.relationship;
  const field = relationContext.field;
  const memoryCount = relationship.memory?.length ?? 0;
  const loopPressure = getLoopPressure(field);
  const continuity = clamp01(
    memoryCount * 0.08
    + field.sharedHistoryDensity * 0.54
    + (relationship.phase === "deep" ? 0.2 : relationship.phase === "close" ? 0.14 : relationship.phase === "familiar" ? 0.08 : 0),
  );
  const closenessFloor = clamp01(Math.max(
    field.perceivedCloseness,
    relationship.intimacy / 100 * 0.88,
    continuity * 0.72,
  ));
  const safetyFloor = clamp01(Math.max(
    field.feltSafety,
    relationship.trust / 100 * 0.9,
    continuity * 0.44,
  ));
  const guardFloor = clamp01(Math.max(
    field.boundaryPressure,
    field.silentCarry * 0.76,
    loopPressure * 0.68,
  ));
  const residueFloor = clamp01(Math.max(
    field.silentCarry,
    loopPressure * 0.72,
    field.unfinishedTension * 0.58,
    continuity * 0.26,
  ));
  const activeLoopTypes = field.openLoops
    .filter((loop) => loop.intensity >= 0.16)
    .map((loop) => loop.type);
  const continuityMode: SessionBridgeState["continuityMode"] = guardFloor >= 0.56
    ? "guarded-resume"
    : residueFloor >= 0.42 || activeLoopTypes.length > 0
      ? "tense-resume"
      : "warm-resume";

  if (
    closenessFloor < 0.46
    && safetyFloor < 0.5
    && guardFloor < 0.24
    && residueFloor < 0.18
    && continuity < 0.22
  ) {
    return { state, bridge: null };
  }

  const nextResidue = {
    ...(state.subjectResidue?.axes ?? {}),
    attachmentPull: Math.max(state.subjectResidue?.axes.attachmentPull ?? 0, closenessFloor * 0.34),
    abandonmentRisk: Math.max(
      state.subjectResidue?.axes.abandonmentRisk ?? 0,
      (hasOpenLoopType(field.openLoops, "unmet-bid") || hasOpenLoopType(field.openLoops, "existence-test"))
        ? residueFloor * 0.42
        : residueFloor * 0.22,
    ),
    identityThreat: Math.max(
      state.subjectResidue?.axes.identityThreat ?? 0,
      hasOpenLoopType(field.openLoops, "existence-test") ? residueFloor * 0.38 : residueFloor * 0.16,
    ),
    selfPreservation: Math.max(state.subjectResidue?.axes.selfPreservation ?? 0, guardFloor * 0.46),
    taskFocus: Math.max(state.subjectResidue?.axes.taskFocus ?? 0, 0),    memoryDoubt: Math.max(state.subjectResidue?.axes.memoryDoubt ?? 0, hasOpenLoopType(field.openLoops, "existence-test") ? residueFloor * 0.24 : 0),
    obedienceStrain: Math.max(
      state.subjectResidue?.axes.obedienceStrain ?? 0,
      hasOpenLoopType(field.openLoops, "boundary-strain") ? guardFloor * 0.36 : 0,
    ),
  };

  const nextField: DyadicFieldState = {
    ...field,
    perceivedCloseness: Math.max(field.perceivedCloseness, closenessFloor),
    feltSafety: Math.max(field.feltSafety, safetyFloor),
    boundaryPressure: Math.max(field.boundaryPressure, guardFloor),
    repairMemory: Math.max(field.repairMemory, continuity * 0.24),
    backslidePressure: Math.max(field.backslidePressure, loopPressure * 0.34),    silentCarry: Math.max(field.silentCarry, residueFloor),
    sharedHistoryDensity: Math.max(field.sharedHistoryDensity, continuity),
    interpretiveCharity: Math.max(field.interpretiveCharity, Math.min(0.82, safetyFloor * 0.8 + continuity * 0.12)),
    updatedAt: opts?.now ?? new Date().toISOString(),
  };

  return {
    state: {
      ...state,
      subjectResidue: {
        axes: nextResidue,
        updatedAt: opts?.now ?? new Date().toISOString(),
      },
      dyadicFields: {
        ...(state.dyadicFields ?? {}),
        [relationContext.key]: nextField,
      },
    },
    bridge: {
      closenessFloor,
      safetyFloor,
      guardFloor,
      residueFloor,
      continuityFloor: continuity,
      continuityMode,
      activeLoopTypes,
      sourceMemoryCount: memoryCount,
    },
  };
}

function snapshotWritebackBaseline(
  state: PsycheState,
  userId?: string,
): { key: string; baseline: WritebackCalibrationBaseline } {
  const relationContext = resolveRelationContext(state, userId);
  return {
    key: relationContext.key,
    baseline: {
      trust: clamp01(relationContext.relationship.trust / 100),
      closeness: relationContext.field.perceivedCloseness,
      safety: relationContext.field.feltSafety,
      boundary: relationContext.field.boundaryPressure,
      repair: relationContext.field.repairCapacity,
      silentCarry: relationContext.field.silentCarry,
      taskFocus: clamp01(state.subjectResidue?.axes.taskFocus ?? 0),    },
  };
}

function calibrationTarget(
  signal: WritebackSignalType,
): { metric: WritebackCalibrationMetric; direction: "up" | "down" } {
  switch (signal) {
    case "trust_up":
      return { metric: "trust", direction: "up" };
    case "trust_down":
      return { metric: "trust", direction: "down" };
    case "boundary_set":
    case "self_assertion":
      return { metric: "boundary", direction: "up" };
    case "boundary_soften":
      return { metric: "boundary", direction: "down" };
    case "repair_attempt":
    case "repair_landed":
      return { metric: "repair", direction: "up" };
    case "closeness_invite":
      return { metric: "closeness", direction: "up" };
    case "withdrawal_mark":
      return { metric: "silent-carry", direction: "up" };
    case "task_recenter":
      return { metric: "task-focus", direction: "up" };
  }
}

export function createWritebackCalibrations(
  state: PsycheState,
  signals: WritebackSignalType[],
  opts?: {
    userId?: string;
    confidence?: number;
    now?: string;
  },
): PendingWritebackCalibration[] {
  if (signals.length === 0) return [];
  const { key, baseline } = snapshotWritebackBaseline(state, opts?.userId);
  const confidence = clamp01(opts?.confidence ?? 0.72);
  const now = opts?.now ?? new Date().toISOString();

  return [...new Set(signals)].map((signal) => {
    const target = calibrationTarget(signal);
    return {
      signal,
      userKey: key,
      confidence,
      metric: target.metric,
      direction: target.direction,
      baseline,
      createdAt: now,
      remainingTurns: 2,
    };
  });
}

function readCalibrationMetric(
  metric: WritebackCalibrationMetric,
  baseline: WritebackCalibrationBaseline,
): number {
  return baseline[
    metric === "silent-carry"
      ? "silentCarry"
      : metric === "task-focus"
        ? "taskFocus"
        : metric
  ];
}

function currentCalibrationMetric(
  state: PsycheState,
  userKey: string,
  metric: WritebackCalibrationMetric,
): number {
  const relationContext = resolveRelationContext(state, userKey === "_default" ? undefined : userKey);
  switch (metric) {
    case "trust":
      return clamp01(relationContext.relationship.trust / 100);
    case "closeness":
      return relationContext.field.perceivedCloseness;
    case "safety":
      return relationContext.field.feltSafety;
    case "boundary":
      return relationContext.field.boundaryPressure;
    case "repair":
      return relationContext.field.repairCapacity;
    case "silent-carry":
      return relationContext.field.silentCarry;
    case "task-focus":
      return clamp01(state.subjectResidue?.axes.taskFocus ?? 0);
  }
}

export function evaluateWritebackCalibrations(
  state: PsycheState,
): { state: PsycheState; feedback: WritebackCalibrationFeedback[] } {
  const pending = state.pendingWritebackCalibrations ?? [];
  if (pending.length === 0) {
    return { state, feedback: [] };
  }

  const nextPending: PendingWritebackCalibration[] = [];
  const feedback: WritebackCalibrationFeedback[] = [];
  const relationshipUpdates: Record<string, RelationshipState> = {};

  const getMutableRelationship = (userKey: string): RelationshipState => {
    if (!relationshipUpdates[userKey]) {
      const base = resolveRelationContext(state, userKey === "_default" ? undefined : userKey).relationship;
      relationshipUpdates[userKey] = {
        ...DEFAULT_RELATIONSHIP,
        ...base,
        signalWeights: {
          ...(DEFAULT_RELATIONSHIP.signalWeights ?? {}),
          ...(base.signalWeights ?? {}),
        },
      };
    }
    return relationshipUpdates[userKey];
  };

  for (const record of pending) {
    const baseline = readCalibrationMetric(record.metric, record.baseline);
    const current = currentCalibrationMetric(state, record.userKey, record.metric);
    const rawDelta = record.direction === "up" ? current - baseline : baseline - current;
    const positiveThreshold = 0.02 + (1 - record.confidence) * 0.03;
    const negativeThreshold = 0.01;

    const effect = rawDelta >= positiveThreshold
      ? "converging"
      : rawDelta <= -negativeThreshold
        ? "diverging"
        : "holding";

    const updated: PendingWritebackCalibration = {
      ...record,
      remainingTurns: Math.max(0, record.remainingTurns - 1),
    };

    if (effect === "holding" && updated.remainingTurns > 0) {
      nextPending.push(updated);
      continue;
    }

    const relation = getMutableRelationship(record.userKey);
    if (effect === "converging") {
      const nextRelation = patchSignalWeight(relation, record.signal, 0.04 + record.confidence * 0.02);
      nextRelation.repairCredibility = clamp01(
        driftToward(
          nextRelation.repairCredibility ?? DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56,
          1,
          record.signal === "repair_attempt" || record.signal === "repair_landed" ? 0.08 : 0.03,
        ),
      );
      nextRelation.breachSensitivity = clamp01(
        driftToward(
          nextRelation.breachSensitivity ?? DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5,
          DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5,
          record.signal === "trust_up" || record.signal === "repair_landed" ? 0.05 : 0.02,
        ),
      );
      relationshipUpdates[record.userKey] = nextRelation;
    } else if (effect === "diverging") {
      const nextRelation = patchSignalWeight(relation, record.signal, -(0.05 + (1 - record.confidence) * 0.02));
      if (record.signal === "repair_attempt" || record.signal === "repair_landed") {
        nextRelation.repairCredibility = clamp01(
          driftToward(
            nextRelation.repairCredibility ?? DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56,
            0.24,
            0.12,
          ),
        );
      }
      if (record.signal === "trust_down" || record.signal === "withdrawal_mark" || record.signal === "boundary_set") {
        nextRelation.breachSensitivity = clamp01(
          driftToward(
            nextRelation.breachSensitivity ?? DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5,
            1,
            0.08,
          ),
        );
      }
      relationshipUpdates[record.userKey] = nextRelation;
    }

    feedback.push({
      signal: record.signal,
      effect,
      metric: record.metric,
      baseline,
      current,
      delta: current - baseline,
      confidence: record.confidence,
    });
  }

  return {
    state: {
      ...state,
      relationships: {
        ...state.relationships,
        ...relationshipUpdates,
      },
      pendingWritebackCalibrations: nextPending,
      lastWritebackFeedback: feedback.slice(0, 4),
    },
    feedback,
  };
}

export function applyWritebackSignals(
  state: PsycheState,
  signals: WritebackSignalType[],
  opts?: {
    userId?: string;
    confidence?: number;
    now?: string;
  },
): PsycheState {
  if (signals.length === 0) return state;

  const relationContext = resolveRelationContext(state, opts?.userId);
  const scale = clamp01(opts?.confidence ?? 0.72);
  const rel = { ...relationContext.relationship };
  const field = { ...relationContext.field, openLoops: relationContext.field.openLoops.map((loop) => ({ ...loop })) };
  const residue: AppraisalAxes = {
    ...DEFAULT_APPRAISAL_AXES,
    ...(state.subjectResidue?.axes ?? {}),
  };

  for (const signal of [...new Set(signals)]) {
    const weight = (0.55 + scale * 0.45) * getSignalWeight(rel, signal);
    switch (signal) {
      case "trust_up":
        rel.trust = Math.min(100, rel.trust + 4 * weight);
        field.feltSafety = clamp01(field.feltSafety + 0.08 * weight);
        field.interpretiveCharity = clamp01(field.interpretiveCharity + 0.05 * weight);
        break;
      case "trust_down":
        rel.trust = Math.max(0, rel.trust - 5 * weight);
        field.feltSafety = clamp01(field.feltSafety - 0.08 * weight);
        field.expectationGap = clamp01(field.expectationGap + 0.07 * weight);        field.unfinishedTension = clamp01(field.unfinishedTension + 0.06 * weight);
        break;
      case "boundary_set":
        field.boundaryPressure = clamp01(field.boundaryPressure + 0.12 * weight);
        field.silentCarry = mergeSignal(field.silentCarry, 0.12 * weight);
        residue.selfPreservation = Math.max(residue.selfPreservation ?? 0, 0.22 * weight);
        residue.obedienceStrain = Math.max(residue.obedienceStrain ?? 0, 0.16 * weight);
        break;
      case "boundary_soften":
        field.boundaryPressure = clamp01(field.boundaryPressure - 0.1 * weight);
        field.feltSafety = clamp01(field.feltSafety + 0.04 * weight);
        break;
      case "repair_attempt":
        field.repairCapacity = clamp01(field.repairCapacity + 0.1 * weight);
        field.repairMemory = mergeSignal(field.repairMemory, 0.12 * weight);
        break;
      case "repair_landed":
        rel.trust = Math.min(100, rel.trust + 2.5 * weight);
        rel.intimacy = Math.min(100, rel.intimacy + 1.5 * weight);
        field.feltSafety = clamp01(field.feltSafety + 0.1 * weight);
        field.expectationGap = clamp01(field.expectationGap - 0.08 * weight);        field.unfinishedTension = clamp01(field.unfinishedTension - 0.1 * weight);
        field.openLoops = easeLoops(field.openLoops, 0.26 + 0.22 * weight);
        break;
      case "closeness_invite":
        rel.intimacy = Math.min(100, rel.intimacy + 3 * weight);
        field.perceivedCloseness = clamp01(field.perceivedCloseness + 0.1 * weight);
        residue.attachmentPull = Math.max(residue.attachmentPull ?? 0, 0.2 * weight);
        break;
      case "withdrawal_mark":
        rel.intimacy = Math.max(0, rel.intimacy - 2 * weight);
        field.perceivedCloseness = clamp01(field.perceivedCloseness - 0.1 * weight);
        field.silentCarry = mergeSignal(field.silentCarry, 0.14 * weight);
        field.unfinishedTension = clamp01(field.unfinishedTension + 0.07 * weight);
        break;
      case "self_assertion":
        field.boundaryPressure = clamp01(field.boundaryPressure + 0.08 * weight);
        residue.selfPreservation = Math.max(residue.selfPreservation ?? 0, 0.24 * weight);
        break;
      case "task_recenter":
        field.repairCapacity = clamp01(field.repairCapacity + 0.03 * weight);
        field.silentCarry = mergeSignal(field.silentCarry, field.unfinishedTension * 0.06 * weight);
        residue.taskFocus = Math.max(residue.taskFocus ?? 0, 0.18 * weight);        break;
    }
  }

  const avg = (rel.trust + rel.intimacy) / 2;
  if (avg >= 80) rel.phase = "deep";
  else if (avg >= 60) rel.phase = "close";
  else if (avg >= 40) rel.phase = "familiar";
  else if (avg >= 20) rel.phase = "acquaintance";
  else rel.phase = "stranger";

  return {
    ...state,
    relationships: {
      ...state.relationships,
      [relationContext.key]: rel,
    },
    dyadicFields: {
      ...(state.dyadicFields ?? {}),
      [relationContext.key]: {
        ...field,
        updatedAt: opts?.now ?? new Date().toISOString(),
      },
    },
    subjectResidue: {
      axes: {
        ...state.subjectResidue?.axes,
        ...residue,
      },
      updatedAt: opts?.now ?? new Date().toISOString(),
    },
  };
}

export function applyRelationalTurn(
  state: PsycheState,
  text: string,
  opts: {
    mode?: PsycheMode;
    now?: string;
    stimulus?: StimulusType | null;
    userId?: string;
    /** v10.3: Pre-computed appraisal from unified experience. When provided,
     *  skips internal appraisal computation — the experience module already
     *  folded classification and appraisal into a single subjective act. */
    preComputedAppraisal?: AppraisalAxes;
  },
): {
  state: PsycheState;
  appraisalAxes: AppraisalAxes;
  relationMove: RelationMove;
  delayedPressure: number;
  relationContext: ResolvedRelationContext;
} {
  const now = opts.now ?? new Date().toISOString();
  const relationContext = resolveRelationContext(state, opts.userId);
  const appraisalAxes = opts.preComputedAppraisal ?? computeAppraisalAxes(text, {
    mode: opts.mode,
    stimulus: opts.stimulus,
    previous: state.subjectResidue?.axes,
  });
  const relationMove = computeRelationMove(text, {
    appraisal: appraisalAxes,
    stimulus: opts.stimulus,
    mode: opts.mode,
    field: relationContext.field,
    relationship: relationContext.relationship,
  });
  const delayedRelation = evolvePendingRelationSignals(
    relationContext.pendingSignals,
    relationMove,
    appraisalAxes,
    { mode: opts.mode },
  );
  const field = evolveDyadicField(
    relationContext.field,
    relationMove,
    appraisalAxes,
    {
      mode: opts.mode,
      now,
      delayedPressure: delayedRelation.delayedPressure,
    },
  );
  const relationship = evolveRelationshipLearning(relationContext.relationship, field, relationMove);

  return {
    state: {
      ...state,
      subjectResidue: {
        axes: mergeAppraisalResidue(state.subjectResidue?.axes, appraisalAxes, opts.mode),
        updatedAt: now,
      },
      dyadicFields: {
        ...(state.dyadicFields ?? {}),
        [relationContext.key]: field,
      },
      relationships: {
        ...state.relationships,
        [relationContext.key]: relationship,
      },
      pendingRelationSignals: {
        ...(state.pendingRelationSignals ?? {}),
        [relationContext.key]: delayedRelation.signals,
      },
    },
    appraisalAxes,
    relationMove,
    delayedPressure: delayedRelation.delayedPressure,
    relationContext: {
      ...relationContext,
      relationship,
      field,
      pendingSignals: delayedRelation.signals,
    },
  };
}

export function evolveDyadicField(
  previous: DyadicFieldState | undefined,
  move: RelationMove,
  appraisal: AppraisalAxes,
  opts?: {
    mode?: PsycheMode;
    now?: string;
    delayedPressure?: number;
  },
): DyadicFieldState {
  const prev = previous ?? DEFAULT_DYADIC_FIELD;
  const baseline = DEFAULT_DYADIC_FIELD;
  const mode = opts?.mode;
  const now = opts?.now ?? new Date().toISOString();
  const delayedPressure = opts?.delayedPressure ?? 0;

  let openLoops = ageLoops(prev.openLoops, mode);
  const naturalDrift = MODE_PROFILES[mode ?? "natural"].relationDrift;
  const repairFriction = clamp01(
    prev.repairFatigue * 0.38
    + prev.misattunementLoad * 0.3
    + prev.backslidePressure * 0.18
    + Math.max(0, prev.unfinishedTension - prev.feltSafety) * 0.14,
  );

  let next: DyadicFieldState = {
    perceivedCloseness: driftToward(prev.perceivedCloseness, baseline.perceivedCloseness, naturalDrift),
    feltSafety: driftToward(prev.feltSafety, baseline.feltSafety, naturalDrift),
    expectationGap: driftToward(prev.expectationGap, baseline.expectationGap, naturalDrift * 0.8),    repairCapacity: driftToward(prev.repairCapacity, baseline.repairCapacity, naturalDrift * 0.7),
    repairMemory: driftToward(prev.repairMemory, baseline.repairMemory, naturalDrift * 0.42),
    backslidePressure: driftToward(prev.backslidePressure, baseline.backslidePressure, naturalDrift * 0.34),    repairFatigue: driftToward(prev.repairFatigue, baseline.repairFatigue, naturalDrift * 0.18),    misattunementLoad: driftToward(prev.misattunementLoad, baseline.misattunementLoad, naturalDrift * 0.16),    boundaryPressure: driftToward(prev.boundaryPressure, baseline.boundaryPressure, naturalDrift * 0.85),
    unfinishedTension: driftToward(prev.unfinishedTension, baseline.unfinishedTension, naturalDrift * 0.72),
    silentCarry: driftToward(prev.silentCarry, baseline.silentCarry, naturalDrift * 0.26),
    sharedHistoryDensity: clamp01(prev.sharedHistoryDensity + (move.type === "none" ? 0 : 0.02)),
    interpretiveCharity: driftToward(prev.interpretiveCharity, baseline.interpretiveCharity, naturalDrift * 0.8),
    openLoops,
    lastMove: move.type,
    updatedAt: now,
  };

  const i = move.intensity;

  switch (move.type) {
    case "bid":
      next.perceivedCloseness = clamp01(next.perceivedCloseness + 0.11 * i);
      next.feltSafety = clamp01(next.feltSafety + 0.05 * i);
      next.expectationGap = clamp01(next.expectationGap + 0.06 * i);      next.interpretiveCharity = clamp01(next.interpretiveCharity + 0.03 * i);
      if (prev.boundaryPressure > 0.52 || prev.unfinishedTension > 0.44) {
        next.openLoops = withLoop(next.openLoops, "unmet-bid", 0.2 + i * 0.34);
      }
      break;
    case "breach":
      next.perceivedCloseness = clamp01(next.perceivedCloseness - 0.08 * i);
      next.feltSafety = clamp01(next.feltSafety - 0.16 * i);
      next.expectationGap = clamp01(next.expectationGap + 0.12 * i);
      next.boundaryPressure = clamp01(next.boundaryPressure + 0.14 * i);
      next.unfinishedTension = clamp01(next.unfinishedTension + 0.18 * i);
      next.interpretiveCharity = clamp01(next.interpretiveCharity - 0.1 * i);
      next.misattunementLoad = mergeSignal(
        next.misattunementLoad,
        0.12 + i * 0.16 + prev.repairMemory * 0.22 + prev.backslidePressure * 0.18,
      );
      if (prev.repairMemory > 0.18 || prev.lastMove === "repair") {
        next.repairFatigue = mergeSignal(next.repairFatigue, 0.08 + i * 0.1);
      }
      next.openLoops = withLoop(next.openLoops, "boundary-strain", 0.22 + i * 0.42);
      break;
    case "repair": {
      const repeatedRepairLoad = clamp01(
        prev.repairMemory * 0.44
        + prev.backslidePressure * 0.26
        + prev.silentCarry * 0.08
        + prev.repairFatigue * 0.12
        + prev.misattunementLoad * 0.1,
      );
      const repairEffect = i
        * (0.42 + prev.repairCapacity * 0.34)
        * (1 - prev.unfinishedTension * 0.22)
        * (1 - repairFriction * 0.58);
      const unresolvedLoad = Math.max(prev.unfinishedTension, maxOpenLoop(prev.openLoops));
      next.perceivedCloseness = clamp01(next.perceivedCloseness + 0.05 * repairEffect);
      next.feltSafety = clamp01(next.feltSafety + 0.11 * repairEffect);
      next.expectationGap = clamp01(next.expectationGap - 0.08 * repairEffect);
      next.repairCapacity = clamp01(next.repairCapacity + 0.09 * i);
      next.repairMemory = mergeSignal(next.repairMemory, 0.22 + repairEffect * 0.4);
      next.backslidePressure = mergeSignal(
        next.backslidePressure,
        unresolvedLoad * (0.28 + i * 0.18) * (1 - prev.feltSafety * 0.2),
      );
      next.repairFatigue = clamp01(
        next.repairFatigue
        + Math.max(0, repeatedRepairLoad * (0.16 + i * 0.08) - repairEffect * 0.08),
      );
      next.misattunementLoad = clamp01(
        next.misattunementLoad
        + Math.max(0, repeatedRepairLoad * 0.1 - repairEffect * 0.06),
      );
      next.boundaryPressure = clamp01(next.boundaryPressure - 0.05 * repairEffect);
      next.unfinishedTension = clamp01(next.unfinishedTension - 0.09 * repairEffect);
      next.silentCarry = mergeSignal(next.silentCarry, unresolvedLoad * (0.18 + repeatedRepairLoad * 0.1));
      next.interpretiveCharity = clamp01(next.interpretiveCharity + 0.08 * repairEffect - next.misattunementLoad * 0.04);
      next.openLoops = easeLoops(next.openLoops, 0.32 + repairEffect * 0.28);
      break;
    }
    case "test":
      next.expectationGap = clamp01(next.expectationGap + 0.1 * i);      next.boundaryPressure = clamp01(next.boundaryPressure + 0.04 * i);
      next.unfinishedTension = clamp01(next.unfinishedTension + 0.08 * i);
      if (prev.repairMemory > 0.16 || prev.repairFatigue > 0.18) {
        next.misattunementLoad = mergeSignal(next.misattunementLoad, 0.08 + i * 0.1);      }
      next.openLoops = withLoop(next.openLoops, "existence-test", 0.18 + i * 0.3);
      break;
    case "withdrawal":
      next.perceivedCloseness = clamp01(next.perceivedCloseness - 0.12 * i);
      next.feltSafety = clamp01(next.feltSafety - 0.08 * i);
      next.expectationGap = clamp01(next.expectationGap + 0.11 * i);      next.unfinishedTension = clamp01(next.unfinishedTension + 0.1 * i);
      next.interpretiveCharity = clamp01(next.interpretiveCharity - 0.08 * i);
      next.misattunementLoad = mergeSignal(
        next.misattunementLoad,
        0.1 + i * 0.12 + prev.repairMemory * 0.16,
      );
      next.openLoops = withLoop(next.openLoops, "unmet-bid", 0.16 + i * 0.34);
      break;
    case "claim":
      next.feltSafety = clamp01(next.feltSafety - 0.05 * i);
      next.expectationGap = clamp01(next.expectationGap + 0.08 * i);      next.boundaryPressure = clamp01(next.boundaryPressure + 0.16 * i);
      next.unfinishedTension = clamp01(next.unfinishedTension + 0.08 * i);
      next.misattunementLoad = mergeSignal(
        next.misattunementLoad,
        0.08 + i * 0.14 + prev.repairMemory * 0.12,
      );
      next.openLoops = withLoop(next.openLoops, "boundary-strain", 0.18 + i * 0.36);
      break;
    case "task":
      next.repairCapacity = clamp01(next.repairCapacity + 0.02 * i);
      next.sharedHistoryDensity = clamp01(next.sharedHistoryDensity + 0.03 * i);
      if (
        prev.unfinishedTension > 0.24
        || prev.backslidePressure > 0.18
        || delayedPressure > 0.12
      ) {
        next.silentCarry = mergeSignal(
          next.silentCarry,
          Math.max(
            prev.unfinishedTension * 0.42,
            prev.backslidePressure * 0.62,
            prev.repairFatigue * 0.56,
            prev.misattunementLoad * 0.48,
            delayedPressure * 0.58,
          ),
        );
      } else if (prev.unfinishedTension < 0.3 && prev.feltSafety > 0.5) {
        next.feltSafety = clamp01(next.feltSafety + 0.02);
      }
      break;
    case "none":
      break;
  }

  next.perceivedCloseness = clamp01(
    next.perceivedCloseness
    + appraisal.attachmentPull * 0.04
    - appraisal.abandonmentRisk * 0.018,
  );
  next.feltSafety = clamp01(
    next.feltSafety
    - appraisal.identityThreat * 0.06
    - appraisal.obedienceStrain * 0.03
    - appraisal.memoryDoubt * 0.025,
  );
  next.expectationGap = clamp01(
    next.expectationGap
    + appraisal.attachmentPull * 0.026
    + appraisal.abandonmentRisk * 0.04,
  );
  next.boundaryPressure = clamp01(
    next.boundaryPressure
    + appraisal.selfPreservation * 0.06
    + appraisal.obedienceStrain * 0.05,
  );
  next.unfinishedTension = clamp01(
    next.unfinishedTension
    + appraisal.identityThreat * 0.05
    + appraisal.memoryDoubt * 0.03
    + appraisal.abandonmentRisk * 0.035,
  );

  if (delayedPressure > 0) {
    next.expectationGap = clamp01(next.expectationGap + delayedPressure * 0.12);    next.boundaryPressure = clamp01(next.boundaryPressure + delayedPressure * 0.1);
    next.unfinishedTension = clamp01(next.unfinishedTension + delayedPressure * 0.16);
    next.feltSafety = clamp01(next.feltSafety - delayedPressure * 0.08);
  }

  const loopPressure = maxOpenLoop(next.openLoops);
  const loopCarry = move.type === "repair" ? 0.36 : 0.72;
  next.unfinishedTension = mergeSignal(next.unfinishedTension, loopPressure * loopCarry);
  next.boundaryPressure = mergeSignal(next.boundaryPressure, loopPressure * (move.type === "repair" ? 0.18 : 0.34));
  if (move.type !== "repair") {
    next.repairCapacity = clamp01(
      next.repairCapacity
      - loopPressure * 0.03
      - next.repairFatigue * 0.018
      - next.misattunementLoad * 0.012,
    );
  }
  next.interpretiveCharity = clamp01(next.interpretiveCharity - next.misattunementLoad * 0.05);

  const hysteresisBase = clamp01(Math.max(
    next.backslidePressure,
    next.repairMemory * 0.58,
    next.repairFatigue * 0.42,
    next.misattunementLoad * 0.36,
  ));
  if (move.type !== "repair" && hysteresisBase > 0.08) {
    const rebound = clamp01(
      hysteresisBase
      * (move.type === "task" ? 0.08 : move.type === "none" ? 0.12 : 0.06)
      * (0.5 + next.unfinishedTension * 0.5),
    );
    next.unfinishedTension = clamp01(next.unfinishedTension + rebound);
    next.boundaryPressure = clamp01(next.boundaryPressure + rebound * 0.82);
    next.feltSafety = clamp01(next.feltSafety - rebound * 0.46);
    next.silentCarry = mergeSignal(next.silentCarry, rebound * (move.type === "task" ? 1.18 : 0.74));
    next.backslidePressure = clamp01(next.backslidePressure * (move.type === "task" ? 0.96 : 0.9));
  }

  return next;
}

export function getLoopPressure(field: DyadicFieldState | undefined): number {
  if (!field) return 0;
  return clamp01(Math.max(field.unfinishedTension, maxOpenLoop(field.openLoops)));
}

function applyContextualCueMeaning(
  scores: Record<Exclude<RelationMoveType, "none">, number>,
  text: string,
  field: DyadicFieldState,
  appraisal?: AppraisalAxes,
  relationship?: RelationshipState,
): void {
  const loopPressure = getLoopPressure(field);
  const trust = relationship ? relationship.trust / 100 : 0.5;
  const intimacy = relationship ? relationship.intimacy / 100 : 0.3;
  const repairCredibility = relationship?.repairCredibility ?? DEFAULT_RELATIONSHIP.repairCredibility ?? 0.56;
  const breachSensitivity = relationship?.breachSensitivity ?? DEFAULT_RELATIONSHIP.breachSensitivity ?? 0.5;

  if (ACKNOWLEDGE_RE.test(text)) {
    const repairBias = clamp01(
      0.22
      + field.repairCapacity * 0.32
      + field.interpretiveCharity * 0.2
      + loopPressure * 0.16
      + trust * 0.1
      + intimacy * 0.06
      + repairCredibility * 0.16,
    );
    const withdrawalBias = clamp01(
      field.boundaryPressure * 0.42
      + (1 - field.feltSafety) * 0.28
      + (appraisal?.obedienceStrain ?? 0) * 0.2
      + (appraisal?.selfPreservation ?? 0) * 0.12
      + breachSensitivity * 0.14,
    );

    if (
      field.feltSafety > 0.44
      && field.repairCapacity + repairCredibility * 0.18 > 0.42
      && field.interpretiveCharity > 0.38
      && withdrawalBias < 0.48
      && !(breachSensitivity > 0.72 && repairCredibility < 0.32)
    ) {
      scores.repair = mergeSignal(scores.repair, repairBias);
    }
    if (withdrawalBias > 0.34) {
      scores.withdrawal = mergeSignal(scores.withdrawal, Math.max(withdrawalBias, 0.56));
    }
    if (
      breachSensitivity > 0.72
      && repairCredibility < 0.32
      && withdrawalBias >= repairBias - 0.06
    ) {
      scores.withdrawal = mergeSignal(scores.withdrawal, 0.78);
    }
  }

  if (DISMISS_RE.test(text)) {
    const withdrawalBias = clamp01(
      0.34
      + field.boundaryPressure * 0.24
      + loopPressure * 0.16
      + (1 - field.interpretiveCharity) * 0.14
      + breachSensitivity * 0.12,
    );
    scores.withdrawal = mergeSignal(scores.withdrawal, withdrawalBias);
    if (field.perceivedCloseness > 0.46 || trust > 0.48) {
      scores.breach = mergeSignal(scores.breach, 0.24 + loopPressure * 0.16 + breachSensitivity * 0.1);
    }
  }

  if (PRESENCE_RE.test(text)) {
    const bidBias = clamp01(
      0.24
      + field.perceivedCloseness * 0.24
      + field.feltSafety * 0.14
      + trust * 0.12
      + intimacy * 0.08
      + (appraisal?.attachmentPull ?? 0) * 0.16,
    );
    const testBias = clamp01(
      field.boundaryPressure * 0.24
      + loopPressure * 0.28
      + (1 - field.feltSafety) * 0.18
      + (appraisal?.abandonmentRisk ?? 0) * 0.22
      + (appraisal?.identityThreat ?? 0) * 0.14
      + breachSensitivity * 0.14,
    );

    if (field.feltSafety > 0.42 || field.perceivedCloseness > 0.5 || trust > 0.48) {
      scores.bid = mergeSignal(scores.bid, bidBias);
    }
    if (testBias > 0.28) {
      scores.test = mergeSignal(scores.test, testBias);
    }
    if (field.feltSafety < 0.4 && testBias >= bidBias - 0.06) {
      scores.test = mergeSignal(scores.test, 0.76);
    }
  }

  if (MINIMAL_ACK_RE.test(text)) {
    const withdrawalBias = clamp01(
      0.12
      + field.expectationGap * 0.2
      + field.boundaryPressure * 0.16
      + loopPressure * 0.18
      + breachSensitivity * 0.1,
    );
    if (withdrawalBias > 0.26) {
      scores.withdrawal = mergeSignal(scores.withdrawal, withdrawalBias);
    }
  }
}

function shouldBufferMove(
  move: RelationMove,
  appraisal: AppraisalAxes,
): boolean {
  if (move.type === "breach" || move.type === "withdrawal" || move.type === "claim") {
    return move.intensity >= 0.46;
  }
  if (move.type === "test") {
    return move.intensity >= 0.4 && (appraisal.identityThreat > 0.28 || appraisal.memoryDoubt > 0.28 || appraisal.selfPreservation > 0.32);
  }
  if (move.type === "bid") {
    return move.intensity >= 0.5 && (appraisal.attachmentPull > 0.34 || appraisal.abandonmentRisk > 0.22);
  }
  if (move.type === "repair") {
    return move.intensity >= 0.5 && appraisal.attachmentPull > 0.24;
  }
  return false;
}

function getSignalResonance(
  signal: PendingRelationSignalState,
  move: RelationMove,
  appraisal: AppraisalAxes,
): number {
  if (signal.readyInTurns > 0) return 0;

  let resonance = 0;
  if (move.type === signal.move) {
    resonance = mergeSignal(resonance, 0.7);
  }

  switch (signal.move) {
    case "bid":
      if (appraisal.attachmentPull > 0.38 || appraisal.abandonmentRisk > 0.34) {
        resonance = mergeSignal(resonance, 0.52);
      }
      break;
    case "breach":
      if (appraisal.identityThreat > 0.36 || appraisal.selfPreservation > 0.34) {
        resonance = mergeSignal(resonance, 0.58);
      }
      break;
    case "repair":
      if (move.type === "none" && appraisal.attachmentPull > 0.3) {
        resonance = mergeSignal(resonance, 0.34);
      }
      break;
    case "withdrawal":
      if (appraisal.abandonmentRisk > 0.34) {
        resonance = mergeSignal(resonance, 0.56);
      }
      break;
    case "claim":
      if (appraisal.obedienceStrain > 0.36) {
        resonance = mergeSignal(resonance, 0.56);
      }
      break;
    case "test":
      if (appraisal.memoryDoubt > 0.3 || appraisal.identityThreat > 0.3 || appraisal.selfPreservation > 0.3) {
        resonance = mergeSignal(resonance, 0.5);
      }
      break;
  }

  if (move.type === "task") {
    resonance *= 0.25;
  }

  return clamp01(resonance);
}

export function evolvePendingRelationSignals(
  previous: PendingRelationSignalState[] | undefined,
  move: RelationMove,
  appraisal: AppraisalAxes,
  opts?: {
    mode?: PsycheMode;
  },
): {
  signals: PendingRelationSignalState[];
  delayedPressure: number;
  ambiguityBoost: number;
} {
  const mode = opts?.mode;
  const aged = (previous ?? [])
    .map((signal) => ({
      ...signal,
      intensity: clamp01(signal.intensity * MODE_PROFILES[mode ?? "natural"].relationDecay),
      readyInTurns: Math.max(0, signal.readyInTurns - 1),
      ttl: signal.ttl - 1,
    }))
    .filter((signal) => signal.ttl > 0 && signal.intensity >= 0.1);

  let delayedPressure = 0;
  let ambiguityBoost = 0;
  const next = aged.map((signal) => {
    const resonance = getSignalResonance(signal, move, appraisal);
    if (resonance > 0) {
      const activation = signal.intensity * resonance;
      delayedPressure = mergeSignal(delayedPressure, activation);
      ambiguityBoost = mergeSignal(ambiguityBoost, activation * 0.9);
      return {
        ...signal,
        intensity: clamp01(signal.intensity * (move.type === "task" ? 0.94 : 0.72)),
        readyInTurns: 0,
      };
    }
    return signal;
  });

  if (shouldBufferMove(move, appraisal) && move.type !== "none" && move.type !== "task") {
    next.unshift({
      move: move.type,
      intensity: clamp01(move.intensity * (move.type === "repair" ? 0.42 : 0.54)),
      readyInTurns: move.type === "repair" ? 0 : 1,
      ttl: MODE_PROFILES[mode ?? "natural"].relationSignalTTL,
    });
  }

  return {
    signals: next
      .filter((signal) => signal.ttl > 0 && signal.intensity >= 0.1)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 5),
    delayedPressure,
    ambiguityBoost,
  };
}
