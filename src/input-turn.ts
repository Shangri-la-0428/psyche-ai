// ============================================================
// Input Turn Pipeline — reflective turn phases after local state evolution
//
// Keeps PsycheEngine orchestration slimmer by moving autonomic,
// metacognitive, experiential, ethical, and reply-envelope derivation
// into a dedicated post-evolution stage.
// ============================================================

import type {
  AppraisalAxes,
  Locale,
  PsycheState,
  ResolvedRelationContext,
  StimulusType,
} from "./types.js";
import { assessMetacognition, updateMetacognitiveState } from "./metacognition.js";
import { buildDecisionContext } from "./decision-bias.js";
import { computeExperientialField, type ConstructionContext } from "./experiential-field.js";
import { computeGenerativeSelf } from "./generative-self.js";
import { buildSharedIntentionalityContext, updateSharedIntentionality } from "./shared-intentionality.js";
import { assessEthics, buildEthicalContext } from "./ethics.js";
import { computeAutonomicResult } from "./autonomic.js";
import {
  computePrimarySystems,
  computeSystemInteractions,
  gatePrimarySystemsByAutonomic,
  describeBehavioralTendencies,
} from "./primary-systems.js";
import type { DerivedReplyEnvelope } from "./reply-envelope.js";
import { deriveReplyEnvelope } from "./reply-envelope.js";
import { clamp } from "./chemistry.js";

export interface ReflectiveTurnArtifacts {
  state: PsycheState;
  locale: Locale;
  autonomicState: ReturnType<typeof computeAutonomicResult>["state"];
  autonomicDescription?: string;
  primarySystemsDescription?: string;
  metacognitiveNote?: string;
  decisionContext?: string;
  ethicsContext?: string;
  sharedIntentionalityContext?: string;
  experientialNarrative?: string;
  replyEnvelope: DerivedReplyEnvelope;
}

export function runReflectiveTurnPhases(input: {
  state: PsycheState;
  appraisalAxes: AppraisalAxes;
  relationContext: ResolvedRelationContext;
  appliedStimulus: StimulusType | null;
  userText?: string;
  userId?: string;
  localeFallback: Locale;
  personalityIntensity: number;
  legacyStimulusConfidence?: number;
  minutesElapsed: number;
  nowIso: string;
  writebackNote?: string;
}): ReflectiveTurnArtifacts {
  let state = input.state;
  const locale = state.meta.locale ?? input.localeFallback;

  const autonomicResult = computeAutonomicResult(
    state.current,
    state.drives,
    state.autonomicState ?? null,
    input.minutesElapsed,
    locale,
    state.baseline,
    state.energyBudgets,
  );
  state = {
    ...state,
    autonomicState: autonomicResult.state,
  };

  const skip = new Set(autonomicResult.skippedStages);

  const rawSystems = computePrimarySystems(state.current, state.drives, input.appliedStimulus);
  const interactedSystems = computeSystemInteractions(rawSystems);
  const gatedSystems = gatePrimarySystemsByAutonomic(interactedSystems, autonomicResult.state);
  const primarySystemsDescription = describeBehavioralTendencies(gatedSystems, locale);

  let metacognitiveAssessment: ReturnType<typeof assessMetacognition> | null = null;
  if (!skip.has("metacognition")) {
    metacognitiveAssessment = assessMetacognition(
      state,
      input.appliedStimulus ?? "casual",
      state.learning.outcomeHistory,
    );

    for (const reg of metacognitiveAssessment.regulationSuggestions) {
      if (reg.strategy === "self-soothing" && reg.confidence >= 0.6 && reg.chemistryAdjustment) {
        const adj = reg.chemistryAdjustment;
        state = {
          ...state,
          current: {
            ...state.current,
            order: clamp(state.current.order + (adj.order ?? 0)),
            flow: clamp(state.current.flow + (adj.flow ?? 0)),
            boundary: clamp(state.current.boundary + (adj.boundary ?? 0)),
            resonance: clamp(state.current.resonance + (adj.resonance ?? 0)),
          },
        };
      }
    }

    state = {
      ...state,
      metacognition: updateMetacognitiveState(state.metacognition, metacognitiveAssessment),
    };
  }

  const constructionContext: ConstructionContext = {
    autonomicState: autonomicResult.state,
    stimulus: input.appliedStimulus,
    relationshipPhase: input.relationContext.relationship.phase,
  };

  const experientialField = skip.has("experiential-field")
    ? null
    : computeExperientialField(state, metacognitiveAssessment ?? undefined, undefined, constructionContext);
  const sharedState = skip.has("shared-intentionality")
    ? null
    : updateSharedIntentionality(state, input.appliedStimulus, input.userId, undefined, input.appraisalAxes);
  const ethicalAssessment = skip.has("ethics")
    ? null
    : assessEthics(state);

  if (!skip.has("generative-self")
    && state.meta.totalInteractions % 10 === 0 && state.meta.totalInteractions > 0) {
    const selfModel = computeGenerativeSelf(state);
    state = {
      ...state,
      personhood: {
        ...state.personhood,
        identityNarrative: selfModel.identityNarrative,
        growthDirection: selfModel.growthArc.direction,
        causalInsights: selfModel.causalInsights.slice(0, 20).map((ci) => ({
          trait: ci.trait,
          because: ci.because,
          confidence: ci.confidence,
          discoveredAt: input.nowIso,
        })),
      },
    };
  }

  if (ethicalAssessment && ethicalAssessment.ethicalHealth < 0.7) {
    const newConcerns = ethicalAssessment.concerns
      .filter((c) => c.severity > 0.4)
      .map((c) => ({ type: c.type, severity: c.severity, timestamp: input.nowIso }));
    if (newConcerns.length > 0) {
      state = {
        ...state,
        personhood: {
          ...state.personhood,
          ethicalConcernHistory: [
            ...state.personhood.ethicalConcernHistory.slice(-14),
            ...newConcerns,
          ],
        },
      };
    }
  }

  if (sharedState && sharedState.theoryOfMind.confidence > 0.3) {
    const userId = input.userId ?? "_default";
    state = {
      ...state,
      personhood: {
        ...state.personhood,
        theoryOfMind: {
          ...state.personhood.theoryOfMind,
          [userId]: {
            estimatedMood: sharedState.theoryOfMind.estimatedMood,
            estimatedIntent: sharedState.theoryOfMind.estimatedIntent,
            confidence: sharedState.theoryOfMind.confidence,
            lastUpdated: sharedState.theoryOfMind.lastUpdated,
          },
        },
      },
    };
  }

  const metacognitiveNote = input.writebackNote
    ? [input.writebackNote, metacognitiveAssessment?.metacognitiveNote].filter(Boolean).join("\n")
    : metacognitiveAssessment?.metacognitiveNote;
  const decisionContext = buildDecisionContext(state);
  const ethicsContext = ethicalAssessment ? buildEthicalContext(ethicalAssessment, locale) : undefined;
  const sharedIntentionalityContext = sharedState ? buildSharedIntentionalityContext(sharedState, locale) : undefined;
  const experientialNarrative = experientialField?.narrative || undefined;

  const replyEnvelope = deriveReplyEnvelope(state, input.appraisalAxes, {
    locale,
    userText: input.userText,
    legacyStimulus: input.appliedStimulus,
    legacyStimulusConfidence: input.legacyStimulusConfidence,
    personalityIntensity: input.personalityIntensity,
    relationContext: input.relationContext,
  });

  let autonomicDescription: string | undefined;
  if (autonomicResult.state !== "ventral-vagal") {
    autonomicDescription = autonomicResult.description;
    if (autonomicResult.processingDepth < 0.5) {
      const depthNote = locale === "en"
        ? " Reflective capacity reduced — intuitive reactions."
        : "反思能力降低——直觉反应中。";
      autonomicDescription += depthNote;
    }
  }

  return {
    state,
    locale,
    autonomicState: autonomicResult.state,
    autonomicDescription,
    primarySystemsDescription: primarySystemsDescription || undefined,
    metacognitiveNote,
    decisionContext: decisionContext || undefined,
    ethicsContext,
    sharedIntentionalityContext,
    experientialNarrative,
    replyEnvelope,
  };
}
