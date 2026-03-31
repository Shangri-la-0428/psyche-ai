import type {
  ExternalContinuityEnvelope,
  OpenLoopType,
  ThrongletsExport,
  ThrongletsExternalContinuityRecord,
  ThrongletsTracePayload,
  ThrongletsTraceSerializationOptions,
  ThrongletsTraceTaxonomy,
  WritebackCalibrationExport,
} from "./types.js";

const TAXONOMY_BY_EVENT: Record<ThrongletsExport["kind"], ThrongletsTraceTaxonomy> = {
  "relation-milestone": "coordination",
  "open-loop-anchor": "coordination",
  "continuity-anchor": "continuity",
  "writeback-calibration": "calibration",
};

function summarizeLoopTypes(loopTypes: OpenLoopType[]): string {
  return loopTypes.join(", ");
}

function summarizeThrongletsExport(event: ThrongletsExport): string {
  switch (event.kind) {
    case "continuity-anchor":
      return `continuity stayed externally legible across ${event.continuityMode}`;
    case "open-loop-anchor":
      return `open loop remained externally relevant: ${summarizeLoopTypes(event.loopTypes)}`;
    case "relation-milestone":
      return `relation milestone shifted to ${event.phase} (trust ${Math.round(event.trust)}, intimacy ${Math.round(event.intimacy)})`;
    case "writeback-calibration": {
      const calibration = event as WritebackCalibrationExport;
      return `writeback calibration ${calibration.signal} ${calibration.effect} on ${calibration.metric}`;
    }
  }
}

export function taxonomyForThrongletsExport(
  event: ThrongletsExport,
): ThrongletsTraceTaxonomy {
  return TAXONOMY_BY_EVENT[event.kind];
}

export function serializeThrongletsExportAsTrace(
  event: ThrongletsExport,
  opts?: ThrongletsTraceSerializationOptions,
): ThrongletsTracePayload {
  const externalContinuity: ThrongletsExternalContinuityRecord = {
    provider: "thronglets",
    mode: "optional",
    version: 1,
    taxonomy: taxonomyForThrongletsExport(event),
    event: event.kind,
    summary: summarizeThrongletsExport(event),
    space: opts?.space ?? "psyche",
    audit_ref: event.key,
  };

  return {
    outcome: opts?.outcome ?? "succeeded",
    model: opts?.model ?? "psyche",
    session_id: opts?.sessionId ?? "psyche",
    external_continuity: externalContinuity,
  };
}

export function serializeExternalContinuityForThronglets(
  envelope?: ExternalContinuityEnvelope<ThrongletsExport> | null,
  opts?: ThrongletsTraceSerializationOptions,
): ThrongletsTracePayload[] {
  if (!envelope || envelope.provider !== "thronglets") return [];
  return envelope.exports.map((event) => serializeThrongletsExportAsTrace(event, opts));
}
