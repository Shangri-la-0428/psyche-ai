import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PsycheEngine } from "./core.js";
import { MemoryStorageAdapter } from "./storage.js";
import type { AppraisalAxes } from "./types.js";
import { getPackageVersion } from "./update.js";

export interface RuntimeProbeResult {
  ok: boolean;
  packageName: "psyche-ai";
  version: string;
  entry: "sdk";
  loadPath: string;
  modulePath: string;
  cliPath: string;
  processInputCalled: boolean;
  processOutputCalled: boolean;
  canonicalHostSurface: boolean;
  externalContinuityAvailable: boolean;
  appraisal: AppraisalAxes | null;
  legacyStimulus: string | null;
  stimulus: string | null;
  cleanedText?: string;
  stateChanged?: boolean;
  error?: string;
}

export async function runRuntimeProbe(): Promise<RuntimeProbeResult> {
  const modulePath = fileURLToPath(import.meta.url);
  const loadPath = resolve(dirname(modulePath), "..");
  const cliPath = resolve(loadPath, "dist", "cli.js");
  const version = await getPackageVersion();

  try {
    const engine = new PsycheEngine(
      {
        name: "Probe",
        locale: "en",
        persist: false,
      },
      new MemoryStorageAdapter(),
    );

    await engine.initialize();

    const input = await engine.processInput("Runtime probe: verify the SDK is actually callable.");
    const output = await engine.processOutput("Probe output acknowledged.");
    return {
      ok: true,
      packageName: "psyche-ai",
      version,
      entry: "sdk",
      loadPath,
      modulePath,
      cliPath,
      processInputCalled: true,
      processOutputCalled: true,
      canonicalHostSurface: Boolean(
        input.replyEnvelope?.subjectivityKernel
        && input.replyEnvelope?.responseContract
        && input.replyEnvelope?.generationControls,
      ),
      externalContinuityAvailable: Boolean(input.externalContinuity?.provider === "thronglets"),
      appraisal: input.appraisal,
      legacyStimulus: input.legacyStimulus,
      stimulus: input.stimulus,
      cleanedText: output.cleanedText,
      stateChanged: output.stateChanged,
    };
  } catch (error) {
    return {
      ok: false,
      packageName: "psyche-ai",
      version,
      entry: "sdk",
      loadPath,
      modulePath,
      cliPath,
      processInputCalled: false,
      processOutputCalled: false,
      canonicalHostSurface: false,
      externalContinuityAvailable: false,
      appraisal: null,
      legacyStimulus: null,
      stimulus: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
