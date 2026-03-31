import type {
  ExternalContinuityEnvelope,
  ThrongletsExport,
} from "./types.js";

export const EXTERNAL_CONTINUITY_SIGNAL_KINDS = [
  "relation-milestone",
  "writeback-calibration",
] as const;

export const EXTERNAL_CONTINUITY_TRACE_KINDS = [
  "continuity-anchor",
  "open-loop-anchor",
] as const;

export function buildExternalContinuityEnvelope(
  events: ThrongletsExport[],
): ExternalContinuityEnvelope<ThrongletsExport> {
  const exports = [...events];
  const signals = exports.filter((event) => event.primitive === "signal");
  const traces = exports.filter((event) => event.primitive === "trace");

  return {
    provider: "thronglets",
    mode: "optional",
    version: 1,
    exports,
    signals,
    traces,
  };
}
