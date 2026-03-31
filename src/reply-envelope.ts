// ============================================================
// Reply Envelope — unified host-facing reply ABI derivation
//
// Keeps the hot path narrow by deriving reply-facing structures
// from one state snapshot and one resolved relation context.
// ============================================================

import type {
  AppraisalAxes,
  GenerationControls,
  Locale,
  PolicyModifiers,
  PsycheState,
  ResolvedRelationContext,
  ResponseContract,
  StimulusType,
  SubjectivityKernel,
} from "./types.js";
import { buildPolicyContext, computePolicyModifiers } from "./decision-bias.js";
import { deriveGenerationControls } from "./host-controls.js";
import { buildResponseContractContext, computeResponseContract } from "./response-contract.js";
import { buildSubjectivityContext, computeSubjectivityKernel } from "./subjectivity.js";

export interface ReplyEnvelope {
  subjectivityKernel: SubjectivityKernel;
  responseContract: ResponseContract;
  generationControls: GenerationControls;
}

export interface DerivedReplyEnvelope extends ReplyEnvelope {
  /** Legacy/internal control vector kept for compatibility and prompt derivation. */
  policyModifiers: PolicyModifiers;
  /** Legacy/internal compact prose derived from policyModifiers. */
  policyContext: string;
  subjectivityContext: string;
  responseContractContext: string;
}

export function deriveReplyEnvelope(
  state: PsycheState,
  appraisal: AppraisalAxes,
  opts: {
    locale: Locale;
    userText?: string;
    algorithmStimulus?: StimulusType | null;
    classificationConfidence?: number;
    personalityIntensity?: number;
    relationContext?: ResolvedRelationContext;
  },
): DerivedReplyEnvelope {
  const policyModifiers = computePolicyModifiers(state);
  const subjectivityKernel = computeSubjectivityKernel(
    state,
    policyModifiers,
    appraisal,
    opts.relationContext,
  );
  const responseContract = computeResponseContract(subjectivityKernel, {
    locale: opts.locale,
    userText: opts.userText,
    algorithmStimulus: opts.algorithmStimulus,
    classificationConfidence: opts.classificationConfidence,
    personalityIntensity: opts.personalityIntensity,
    mode: state.meta.mode,
  });
  const generationControls = deriveGenerationControls({
    responseContract,
    policyModifiers,
  });
  const policyContext = buildPolicyContext(policyModifiers, opts.locale, state.drives);
  const subjectivityContext = buildSubjectivityContext(subjectivityKernel, opts.locale);
  const responseContractContext = buildResponseContractContext(responseContract, opts.locale);

  return {
    subjectivityKernel,
    responseContract,
    generationControls,
    policyModifiers,
    policyContext,
    subjectivityContext,
    responseContractContext,
  };
}
