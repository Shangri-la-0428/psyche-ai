// ============================================================
// Reply Envelope — unified host-facing reply ABI derivation
//
// Two layers:
//   ReplyEnvelope      — substrate-independent structured data
//   DerivedReplyEnvelope — adds LLM-specific prose (default expression adapter)
//
// ExpressionPort      — interface for substrate-specific rendering
// LLMExpressionAdapter — default implementation (prompt injection)
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

// ── Substrate-independent interface ─────────────────────────

export interface ReplyEnvelope {
  subjectivityKernel: SubjectivityKernel;
  responseContract: ResponseContract;
  generationControls: GenerationControls;
}

/**
 * ExpressionPort — substrate-specific rendering of a ReplyEnvelope.
 *
 * LLM prompt injection is the default. Replace this to target
 * other substrates (robotics, game agents, world models, etc.).
 */
export interface ExpressionPort {
  render(envelope: ReplyEnvelope, policyModifiers: PolicyModifiers, locale: Locale): ExpressionOutput;
}

export interface ExpressionOutput {
  /** Substrate-specific payload (prose strings for LLM, motor commands for robotics, etc.) */
  [key: string]: unknown;
}

// ── LLM Expression Adapter (default) ────────────────────────

export interface LLMExpressionOutput extends ExpressionOutput {
  policyContext: string;
  subjectivityContext: string;
  responseContractContext: string;
}

export class LLMExpressionAdapter implements ExpressionPort {
  private drives: PsycheState["drives"];

  constructor(drives: PsycheState["drives"]) {
    this.drives = drives;
  }

  render(envelope: ReplyEnvelope, policyModifiers: PolicyModifiers, locale: Locale): LLMExpressionOutput {
    return {
      policyContext: buildPolicyContext(policyModifiers, locale, this.drives),
      subjectivityContext: buildSubjectivityContext(envelope.subjectivityKernel, locale),
      responseContractContext: buildResponseContractContext(envelope.responseContract, locale),
    };
  }
}

// ── DerivedReplyEnvelope (backward compat) ──────────────────

export interface DerivedReplyEnvelope extends ReplyEnvelope {
  /** Legacy/internal control vector kept for compatibility and prompt derivation. */
  policyModifiers: PolicyModifiers;
  /** LLM-specific prose — produced by ExpressionPort. */
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
    expressionPort?: ExpressionPort;
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

  const envelope: ReplyEnvelope = { subjectivityKernel, responseContract, generationControls };

  const adapter = opts.expressionPort ?? new LLMExpressionAdapter(state.drives);
  const expression = adapter.render(envelope, policyModifiers, opts.locale) as LLMExpressionOutput;

  return {
    ...envelope,
    policyModifiers,
    policyContext: expression.policyContext ?? "",
    subjectivityContext: expression.subjectivityContext ?? "",
    responseContractContext: expression.responseContractContext ?? "",
  };
}
