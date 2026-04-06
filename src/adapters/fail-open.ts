import type {
  ProcessInputOptions,
  ProcessInputResult,
  ProcessOutputOptions,
  ProcessOutputResult,
  PsycheEngine,
} from "../core.js";

const PSYCHE_TAG_RE = /<psyche_update>[\s\S]*?<\/psyche_update>/g;

export function stripPsycheUpdateTags(text: string): string {
  return text
    .replace(PSYCHE_TAG_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function composePsycheContext(result: Pick<ProcessInputResult, "systemContext" | "dynamicContext">): string {
  return [result.systemContext, result.dynamicContext].filter(Boolean).join("\n\n");
}

export function buildFailOpenProcessInputResult(
  opts: ProcessInputOptions | undefined,
): ProcessInputResult {
  return {
    systemContext: "",
    dynamicContext: "",
    ambientPriors: opts?.ambientPriors ?? [],
    activePolicy: opts?.activePolicy ?? [],
    currentGoal: opts?.currentGoal,
    ambientPriorContext: undefined,
    appraisal: null,
    legacyStimulus: null,
    stimulus: null,
    legacyStimulusConfidence: undefined,
    stimulusConfidence: undefined,
    policyModifiers: undefined,
    replyEnvelope: undefined,
    subjectivityKernel: undefined,
    responseContract: undefined,
    generationControls: undefined,
    sessionBridge: null,
    writebackFeedback: [],
    externalContinuity: undefined,
    throngletsExports: [],
    observability: undefined,
    policyContext: "",
  };
}

export async function safeProcessInput(
  engine: PsycheEngine,
  text: string,
  opts?: ProcessInputOptions,
  phase = "processInput",
): Promise<ProcessInputResult> {
  try {
    return await engine.processInput(text, opts);
  } catch (error) {
    engine.recordDiagnosticError(phase, error);
    return buildFailOpenProcessInputResult(opts);
  }
}

export async function safeProcessOutput(
  engine: PsycheEngine,
  text: string,
  opts?: ProcessOutputOptions,
  phase = "processOutput",
): Promise<ProcessOutputResult> {
  try {
    return await engine.processOutput(text, opts);
  } catch (error) {
    engine.recordDiagnosticError(phase, error);
    return {
      cleanedText: stripPsycheUpdateTags(text),
      stateChanged: false,
    };
  }
}
