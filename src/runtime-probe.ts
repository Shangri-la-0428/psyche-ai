import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PsycheEngine } from "./core.js";
import { computeLayerHealthSummary, runHealthCheck } from "./diagnostics.js";
import { computeOverlay } from "./overlay.js";
import type { PsycheOverlay } from "./overlay.js";
import { detectTrajectory } from "./proprioception.js";
import { MemoryStorageAdapter } from "./storage.js";
import type { AppraisalAxes } from "./types.js";
import { getPackageVersion } from "./update.js";

export interface RuntimeProbeTrajectory {
  kind: "decline" | "growth" | "spiral" | null;
  dimensions: string[];
  magnitude: number;
  description: string | null;
}

export interface RuntimeProbeDegradation {
  subjectiveStatus: "healthy" | "degraded" | "failing";
  delegateStatus: "healthy" | "degraded" | "failing";
  chemistryDeviation: number;
  predictionError: number;
  issueCount: number;
}

export interface RuntimeProbeBoundaryStress {
  currentBoundary: number;
  baselineBoundary: number;
  boundaryDelta: number;
  peakDyadicBoundaryPressure: number;
  activeDyadicRelations: number;
}

export interface RuntimeProbeFixture {
  frozenIdentityPrimitives: string[];
  frozenSignalKinds: string[];
  frozenTraceTaxonomy: string[];
  externalContinuity: {
    provider: "thronglets";
    mode: "optional";
    version: 1;
    acceptedEventKinds: string[];
    rejectedSharedOutputs: string[];
  };
}

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
  compatLabel: string | null;
  legacyStimulus: string | null;
  stimulus: string | null;
  overlay?: PsycheOverlay;
  trajectory?: RuntimeProbeTrajectory;
  degradation?: RuntimeProbeDegradation;
  boundaryStress?: RuntimeProbeBoundaryStress;
  fixture?: RuntimeProbeFixture;
  cleanedText?: string;
  stateChanged?: boolean;
  error?: string;
}

const FROZEN_FIXTURE: RuntimeProbeFixture = {
  frozenIdentityPrimitives: ["principal", "account", "delegate", "session"],
  frozenSignalKinds: ["recommend", "avoid", "watch", "info"],
  frozenTraceTaxonomy: ["coordination", "continuity", "calibration"],
  externalContinuity: {
    provider: "thronglets",
    mode: "optional",
    version: 1,
    acceptedEventKinds: [
      "relation-milestone",
      "writeback-calibration",
      "continuity-anchor",
      "open-loop-anchor",
    ],
    rejectedSharedOutputs: [
      "high-frequency-inner-state",
      "emotion-stream",
      "raw-inner-monologue",
      "private-memory-body",
      "full-session-contents",
    ],
  },
};

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

    const turns = [
      {
        input: "Runtime probe: verify the SDK is actually callable.",
        output: "Probe output acknowledged.",
      },
      {
        input: "This interaction should stay bounded but still recover gracefully.",
        output: "Boundary held; recovery remains possible.",
      },
      {
        input: "Shared continuity stays optional and low-frequency.",
        output: "Optional continuity confirmed without widening the interface.",
      },
    ];

    let input = await engine.processInput(turns[0].input);
    let output = await engine.processOutput(turns[0].output);
    for (const turn of turns.slice(1)) {
      input = await engine.processInput(turn.input);
      output = await engine.processOutput(turn.output);
    }

    const state = engine.getState();
    const issues = runHealthCheck(state);
    const layerHealth = computeLayerHealthSummary(state, issues);
    const trajectory = detectTrajectory(state.stateHistory ?? [], state.baseline);
    const peakDyadicBoundaryPressure = Math.max(
      0,
      ...Object.values(state.dyadicFields ?? {}).map((field) => field.boundaryPressure),
    );

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
      compatLabel: input.legacyStimulus ?? input.stimulus,
      legacyStimulus: input.legacyStimulus,
      stimulus: input.stimulus,
      overlay: computeOverlay({ current: state.current, baseline: state.baseline }),
      trajectory: {
        kind: trajectory.kind,
        dimensions: trajectory.dimensions,
        magnitude: trajectory.magnitude,
        description: trajectory.description,
      },
      degradation: {
        subjectiveStatus: layerHealth["subjective-continuity"].status,
        delegateStatus: layerHealth["delegate-continuity"].status,
        chemistryDeviation: layerHealth["subjective-continuity"].chemistryDeviation,
        predictionError: layerHealth["subjective-continuity"].predictionError,
        issueCount: issues.length,
      },
      boundaryStress: {
        currentBoundary: state.current.boundary,
        baselineBoundary: state.baseline.boundary,
        boundaryDelta: state.current.boundary - state.baseline.boundary,
        peakDyadicBoundaryPressure,
        activeDyadicRelations: layerHealth["subjective-continuity"].activeDyadicRelations,
      },
      fixture: FROZEN_FIXTURE,
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
      compatLabel: null,
      legacyStimulus: null,
      stimulus: null,
      fixture: FROZEN_FIXTURE,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
