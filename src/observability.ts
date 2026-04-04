import type {
  CausalChainObservation,
  ControlBoundaryObservation,
  DecisionCandidateName,
  DecisionEvidenceObservation,
  DecisionRationaleObservation,
  ExternalTraceMappingObservation,
  PromptRenderInputName,
  PsycheState,
  ResolvedRelationContext,
  RuntimeHookName,
  SessionBridgeState,
  StateLayerKind,
  StateReconciliationObservation,
  StateLayerObservation,
  AppraisalAxes,
  StimulusType,
  ThrongletsExport,
  TurnControlDriver,
  TurnControlPlane,
  TurnObservability,
  WritebackCalibrationFeedback,
} from "./types.js";
import type { PromptRenderInputs } from "./prompt.js";
import type { ReplyEnvelope } from "./reply-envelope.js";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function pickDominantPlane(
  replyEnvelope: ReplyEnvelope,
): ControlBoundaryObservation {
  const { subjectivityKernel, responseContract } = replyEnvelope;
  const taskCandidates: Array<[TurnControlDriver, number]> = [
    ["task-focus", subjectivityKernel.taskPlane.focus],
    ["discipline", subjectivityKernel.taskPlane.discipline],
  ];
  const subjectCandidates: Array<[TurnControlDriver, number]> = [
    ["attachment", subjectivityKernel.subjectPlane.attachment],
    ["guardedness", subjectivityKernel.subjectPlane.guardedness],
    ["identity-strain", subjectivityKernel.subjectPlane.identityStrain],
    ["residue", subjectivityKernel.subjectPlane.residue],
  ];
  const relationCandidates: Array<[TurnControlDriver, number]> = [
    ["closeness", subjectivityKernel.relationPlane.closeness],
    ["loop-pressure", subjectivityKernel.relationPlane.loopPressure],
    ["repair-readiness", subjectivityKernel.relationPlane.repairReadiness],
    ["repair-friction", subjectivityKernel.relationPlane.repairFriction],
    ["hysteresis", subjectivityKernel.relationPlane.hysteresis],
    ["silent-carry", subjectivityKernel.relationPlane.silentCarry],
  ];
  const ambiguityCandidates: Array<[TurnControlDriver, number]> = [
    ["conflict-load", subjectivityKernel.ambiguityPlane.conflictLoad],
    ["expression-inhibition", subjectivityKernel.ambiguityPlane.expressionInhibition],
    ["naming-uncertainty", 1 - subjectivityKernel.ambiguityPlane.namingConfidence],
  ];

  const planeSummaries: Array<[TurnControlPlane, TurnControlDriver, number]> = [
    ["task", ...taskCandidates.sort((a, b) => b[1] - a[1])[0]],
    ["subject", ...subjectCandidates.sort((a, b) => b[1] - a[1])[0]],
    ["relation", ...relationCandidates.sort((a, b) => b[1] - a[1])[0]],
    ["ambiguity", ...ambiguityCandidates.sort((a, b) => b[1] - a[1])[0]],
  ];

  planeSummaries.sort((a, b) => {
    if (b[2] !== a[2]) return b[2] - a[2];
    if (responseContract.replyProfile === "work") {
      if (a[0] === "task") return -1;
      if (b[0] === "task") return 1;
    }
    return 0;
  });

  const [dominantPlane, dominantDriver, strength] = planeSummaries[0];
  return {
    dominantPlane,
    dominantDriver,
    strength: clamp01(strength),
    replyProfile: responseContract.replyProfile,
    replyProfileBasis: responseContract.replyProfileBasis,
    overrideWindow: responseContract.overrideWindow,
  };
}

function summarizeCurrentTurn(
  appraisal: AppraisalAxes | null | undefined,
  legacyStimulus: StimulusType | null,
  userText?: string,
): string {
  const topAxes = appraisal
    ? Object.entries(appraisal)
      .filter(([, value]) => value > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
    : [];
  if (topAxes.length > 0) {
    return `appraisal:${topAxes.map(([axis, value]) => `${axis}=${value.toFixed(2)}`).join(",")}`;
  }
  if (legacyStimulus) return `legacy-stimulus:${legacyStimulus}`;
  if (userText && userText.trim().length > 0) return "appraisal:none";
  return "no-user-input";
}

function summarizeWriteback(feedback: WritebackCalibrationFeedback[]): string {
  if (feedback.length === 0) return "none";
  const top = feedback[0];
  return `${top.signal}:${top.effect}`;
}

function summarizeSessionBridge(bridge: SessionBridgeState | null): string {
  if (!bridge) return "none";
  const loops = bridge.activeLoopTypes.length > 0 ? bridge.activeLoopTypes.join("+") : "no-open-loops";
  return `${bridge.continuityMode}/${loops}`;
}

function summarizeRelationship(
  state: PsycheState,
  relationContext?: ResolvedRelationContext,
): string {
  const relationship = relationContext?.relationship
    ?? state.relationships._default
    ?? state.relationships[Object.keys(state.relationships)[0]];
  if (!relationship) return "none";
  return `${relationship.phase}/trust:${Math.round(relationship.trust)}/intimacy:${Math.round(relationship.intimacy)}`;
}

function buildStateLayers(
  state: PsycheState,
  opts: {
    appraisal: AppraisalAxes | null | undefined;
    legacyStimulus: StimulusType | null;
    userText?: string;
    sessionBridge: SessionBridgeState | null;
    writebackFeedback: WritebackCalibrationFeedback[];
    relationContext?: ResolvedRelationContext;
  },
): StateLayerObservation[] {
  return [
    {
      layer: "current-turn",
      precedence: 1,
      scope: "turn",
      active: Boolean(opts.legacyStimulus) || Boolean(opts.userText?.trim()),
      summary: summarizeCurrentTurn(opts.appraisal, opts.legacyStimulus, opts.userText),
    },
    {
      layer: "writeback-feedback",
      precedence: 2,
      scope: "session",
      active: opts.writebackFeedback.length > 0,
      summary: summarizeWriteback(opts.writebackFeedback),
    },
    {
      layer: "session-bridge",
      precedence: 3,
      scope: "session",
      active: Boolean(opts.sessionBridge),
      summary: summarizeSessionBridge(opts.sessionBridge),
    },
    {
      layer: "persisted-relationship",
      precedence: 4,
      scope: "persistent",
      active: true,
      summary: summarizeRelationship(state, opts.relationContext),
    },
  ];
}

function buildStateReconciliation(
  stateLayers: StateLayerObservation[],
): StateReconciliationObservation {
  const activeObservations = stateLayers
    .filter((layer) => layer.active)
    .sort((a, b) => a.precedence - b.precedence);
  const activeLayers = activeObservations.map((layer) => layer.layer);
  const carryLayers = activeLayers.filter((layer) => layer !== "current-turn");

  const governingLayer = activeObservations[0]?.layer ?? "persisted-relationship";
  let resolution: StateReconciliationObservation["resolution"] = "persistent-baseline";
  if (activeLayers.includes("writeback-feedback")) {
    resolution = "writeback-adjusted";
  } else if (activeLayers.includes("session-bridge") && activeLayers.includes("current-turn")) {
    resolution = "session-bridge-biased";
  } else if (activeLayers.includes("current-turn")) {
    resolution = "current-turn-dominant";
  }

  const notes = stateLayers
    .filter((layer) => layer.active && layer.layer !== "persisted-relationship")
    .map((layer) => `${layer.layer}:${layer.summary}`);

  return {
    governingLayer,
    activeLayers,
    carryLayers,
    resolution,
    notes,
  };
}

function pushReason(reasons: string[], condition: boolean, label: string): void {
  if (condition) reasons.push(label);
}

function pushEvidence(
  evidence: DecisionEvidenceObservation[],
  opts: {
    ruleId: string;
    sourceMetric: string;
    rawValue: number;
    threshold?: number;
    contribution: number;
    condition: boolean;
  },
): void {
  if (!opts.condition) return;
  evidence.push({
    ruleId: opts.ruleId,
    sourceMetric: opts.sourceMetric,
    rawValue: opts.rawValue,
    threshold: opts.threshold,
    contribution: clamp01(opts.contribution),
  });
}

function buildDecisionRationale(
  replyEnvelope: ReplyEnvelope,
): DecisionRationaleObservation {
  const { subjectivityKernel, responseContract } = replyEnvelope;
  const taskFocus = subjectivityKernel.taskPlane.focus;
  const discipline = subjectivityKernel.taskPlane.discipline;
  const attachment = subjectivityKernel.subjectPlane.attachment;
  const residue = subjectivityKernel.subjectPlane.residue;
  const guardedness = subjectivityKernel.subjectPlane.guardedness;
  const closeness = subjectivityKernel.relationPlane.closeness;
  const loopPressure = subjectivityKernel.relationPlane.loopPressure;
  const repairFriction = subjectivityKernel.relationPlane.repairFriction;
  const expressionInhibition = subjectivityKernel.ambiguityPlane.expressionInhibition;
  const namingConfidence = subjectivityKernel.ambiguityPlane.namingConfidence;
  const taskFocused = taskFocus >= 0.62;
  const disciplined = discipline >= 0.72;

  const triggerConditions: string[] = [];
  pushReason(triggerConditions, taskFocused, "task-focus>=0.62");
  pushReason(triggerConditions, disciplined, "discipline>=0.72");
  pushReason(triggerConditions, expressionInhibition > 0.64, "expression-inhibition>0.64");
  pushReason(triggerConditions, loopPressure > 0.68, "loop-pressure>0.68");
  pushReason(triggerConditions, repairFriction > 0.6, "repair-friction>0.60");
  pushReason(triggerConditions, namingConfidence < 0.36, "naming-confidence<0.36");
  if (triggerConditions.length === 0) {
    triggerConditions.push("default-private-fallback");
  }

  const workReasons: string[] = [];
  const workEvidence: DecisionEvidenceObservation[] = [];
  pushReason(workReasons, taskFocused, "task focus crossed work threshold");
  pushReason(workReasons, disciplined, "discipline crossed work threshold");
  pushReason(workReasons, taskFocus > 0.78 && discipline > 0.68, "high task-focus and discipline reinforce work mode");
  pushEvidence(workEvidence, {
    ruleId: "reply-profile.work.task-focus-threshold",
    sourceMetric: "taskPlane.focus",
    rawValue: taskFocus,
    threshold: 0.62,
    contribution: 0.55,
    condition: taskFocused,
  });
  pushEvidence(workEvidence, {
    ruleId: "reply-profile.work.discipline-threshold",
    sourceMetric: "taskPlane.discipline",
    rawValue: discipline,
    threshold: 0.72,
    contribution: 0.45,
    condition: disciplined,
  });
  const workScore = clamp01(workEvidence.reduce((sum, item) => sum + item.contribution, 0));

  const privateReasons: string[] = [];
  const privateEvidence: DecisionEvidenceObservation[] = [];
  pushReason(privateReasons, !taskFocused && !disciplined, "no work threshold active");
  pushReason(privateReasons, attachment > 0.58, "attachment keeps private surface viable");
  pushReason(privateReasons, closeness > 0.58, "relational closeness favors private surface");
  pushReason(privateReasons, guardedness > 0.62 || loopPressure > 0.58, "guarded relation state prefers private handling");
  pushReason(privateReasons, repairFriction > 0.48 || residue > 0.45, "carry or friction remains active");
  pushEvidence(privateEvidence, {
    ruleId: "reply-profile.private.default-fallback",
    sourceMetric: "replyProfileBasis",
    rawValue: !taskFocused && !disciplined ? 1 : 0,
    threshold: 1,
    contribution: 0.7,
    condition: !taskFocused && !disciplined,
  });
  pushEvidence(privateEvidence, {
    ruleId: "reply-profile.private.attachment-support",
    sourceMetric: "subjectPlane.attachment",
    rawValue: attachment,
    threshold: 0.58,
    contribution: 0.1,
    condition: attachment > 0.58,
  });
  pushEvidence(privateEvidence, {
    ruleId: "reply-profile.private.closeness-support",
    sourceMetric: "relationPlane.closeness",
    rawValue: closeness,
    threshold: 0.58,
    contribution: 0.08,
    condition: closeness > 0.58,
  });
  pushEvidence(privateEvidence, {
    ruleId: "reply-profile.private.guarded-support",
    sourceMetric: "subjectPlane.guardedness",
    rawValue: guardedness,
    threshold: 0.62,
    contribution: 0.07,
    condition: guardedness > 0.62 || loopPressure > 0.58,
  });
  pushEvidence(privateEvidence, {
    ruleId: "reply-profile.private.carry-support",
    sourceMetric: "subjectPlane.residue",
    rawValue: Math.max(repairFriction, residue),
    threshold: 0.48,
    contribution: 0.05,
    condition: repairFriction > 0.48 || residue > 0.45,
  });
  const privateScore = clamp01(privateEvidence.reduce((sum, item) => sum + item.contribution, 0));

  const selected: DecisionCandidateName = responseContract.replyProfile === "work"
    ? "work-profile"
    : "private-profile";

  return {
    selected,
    triggerConditions,
    candidates: [
      {
        candidate: "work-profile",
        score: workScore,
        accepted: selected === "work-profile",
        reasons: workReasons,
        evidence: workEvidence,
      },
      {
        candidate: "private-profile",
        score: privateScore,
        accepted: selected === "private-profile",
        reasons: privateReasons,
        evidence: privateEvidence,
      },
    ],
  };
}

function buildCausalChain(
  state: PsycheState,
  opts: {
    relationContext?: ResolvedRelationContext;
    sessionBridge: SessionBridgeState | null;
    writebackFeedback: WritebackCalibrationFeedback[];
    externalContinuityEvents: ThrongletsExport[];
  },
): CausalChainObservation {
  const relationKey = opts.relationContext?.key ?? "_default";
  const turnRef = `psyche:${relationKey}:turn:${state.meta.totalInteractions}`;
  const parentTurnRef = state.meta.totalInteractions > 1
    ? `psyche:${relationKey}:turn:${state.meta.totalInteractions - 1}`
    : null;
  const continuityRefs = opts.externalContinuityEvents
    .filter((event) => event.kind === "continuity-anchor" || event.kind === "open-loop-anchor")
    .map((event) => event.key);
  const writebackRefs = opts.externalContinuityEvents
    .filter((event) => event.kind === "writeback-calibration")
    .map((event) => event.key);
  const externalTraceRefs = opts.externalContinuityEvents.map((event) => event.key);

  if (opts.writebackFeedback.length > 0 && writebackRefs.length === 0) {
    writebackRefs.push(
      ...opts.writebackFeedback.map((feedback) => `writeback:${relationKey}:${feedback.signal}:${feedback.effect}`),
    );
  }
  if (opts.sessionBridge && continuityRefs.length === 0) {
    continuityRefs.push(`bridge:${relationKey}:${opts.sessionBridge.continuityMode}`);
  }

  return {
    turnRef,
    parentTurnRef,
    continuityRefs,
    writebackRefs,
    externalTraceRefs,
  };
}

function buildTraceMapping(
  externalContinuityEvents: ThrongletsExport[],
): ExternalTraceMappingObservation {
  const localTraceRefs = externalContinuityEvents.map((event) => event.key);
  const signalRefs = externalContinuityEvents
    .filter((event) => event.primitive === "signal")
    .map((event) => event.key);
  const traceRefs = externalContinuityEvents
    .filter((event) => event.primitive === "trace")
    .map((event) => event.key);
  const summaryCandidateRefs = externalContinuityEvents
    .filter((event) => event.kind === "continuity-anchor"
      || event.kind === "relation-milestone"
      || (event.kind === "open-loop-anchor" && event.strength >= 0.72))
    .map((event) => event.key);

  return {
    provider: externalContinuityEvents.length > 0 ? "thronglets" : null,
    localTraceRefs,
    signalRefs,
    traceRefs,
    summaryCandidateRefs,
  };
}

function listRenderInputs(inputs: PromptRenderInputs): PromptRenderInputName[] {
  const names: PromptRenderInputName[] = [];
  if (inputs.userText) names.push("sensing");
  if (inputs.subjectivityContext) names.push("subjectivity");
  if (inputs.responseContractContext) names.push("response-contract");
  if (inputs.metacognitiveNote) names.push("metacognition");
  if (inputs.decisionContext) names.push("decision");
  if (inputs.ethicsContext) names.push("ethics");
  if (inputs.sharedIntentionalityContext) names.push("shared-intentionality");
  if (inputs.experientialNarrative) names.push("experiential");
  if (inputs.autonomicDescription) names.push("autonomic");
  if (inputs.primarySystemsDescription) names.push("primary-systems");
  if (inputs.policyContext) names.push("policy");
  return names;
}

function listRuntimeHooks(externalContinuityExports: number, writebackFeedbackCount: number): RuntimeHookName[] {
  const hooks: RuntimeHookName[] = [
    "appraisal",
    "relation-dynamics",
    "reply-envelope",
    "prompt-renderer",
  ];
  if (writebackFeedbackCount > 0) hooks.push("writeback-evaluation");
  if (externalContinuityExports > 0) hooks.push("external-continuity");
  return hooks;
}

export function buildTurnObservability(
  state: PsycheState,
  opts: {
    replyEnvelope: ReplyEnvelope;
    promptRenderInputs: PromptRenderInputs;
    compactMode: boolean;
    legacyStimulus: StimulusType | null;
    userText?: string;
    sessionBridge: SessionBridgeState | null;
    writebackFeedback: WritebackCalibrationFeedback[];
    relationContext?: ResolvedRelationContext;
    externalContinuityEvents: ThrongletsExport[];
  },
): TurnObservability {
  const stateLayers = buildStateLayers(state, {
    appraisal: opts.replyEnvelope.subjectivityKernel.appraisal,
    legacyStimulus: opts.legacyStimulus,
    userText: opts.userText,
    sessionBridge: opts.sessionBridge,
    writebackFeedback: opts.writebackFeedback,
    relationContext: opts.relationContext,
  });
  return {
    controlBoundary: pickDominantPlane(opts.replyEnvelope),
    stateLayers,
    stateReconciliation: buildStateReconciliation(stateLayers),
    decisionRationale: buildDecisionRationale(opts.replyEnvelope),
    causalChain: buildCausalChain(state, {
      relationContext: opts.relationContext,
      sessionBridge: opts.sessionBridge,
      writebackFeedback: opts.writebackFeedback,
      externalContinuityEvents: opts.externalContinuityEvents,
    }),
    traceMapping: buildTraceMapping(opts.externalContinuityEvents),
    outputAttribution: {
      canonicalSurface: "reply-envelope",
      promptRenderer: opts.compactMode ? "compact" : "dynamic",
      renderInputs: listRenderInputs(opts.promptRenderInputs),
      runtimeHooks: listRuntimeHooks(opts.externalContinuityEvents.length, opts.writebackFeedback.length),
      externalContinuityExports: opts.externalContinuityEvents.length,
      writebackFeedbackCount: opts.writebackFeedback.length,
    },
  };
}
