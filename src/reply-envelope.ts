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
  policyModifiers: PolicyModifiers;
  subjectivityKernel: SubjectivityKernel;
  responseContract: ResponseContract;
  generationControls: GenerationControls;
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
    personalityIntensity?: number;
    relationContext?: ResolvedRelationContext;
  },
): ReplyEnvelope {
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
    personalityIntensity: opts.personalityIntensity,
  });
  const generationControls = deriveGenerationControls({
    responseContract,
    policyModifiers,
  });
  const policyContext = buildPolicyContext(policyModifiers, opts.locale, state.drives);
  const subjectivityContext = buildSubjectivityContext(subjectivityKernel, opts.locale);
  const responseContractContext = buildResponseContractContext(responseContract, opts.locale);

  return {
    policyModifiers,
    subjectivityKernel,
    responseContract,
    generationControls,
    policyContext,
    subjectivityContext,
    responseContractContext,
  };
}
