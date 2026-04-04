import type { AppraisalAxes, AppraisalMarker, Locale, StateSnapshot, StimulusType } from "./types.js";
export type { AppraisalMarker } from "./types.js";

export const APPRAISAL_MARKER_LABEL_ZH: Record<AppraisalMarker, string> = {
  approach: "靠近",
  rupture: "失配",
  uncertainty: "不确定",
  boundary: "边界",
  task: "任务",
};

export const APPRAISAL_MARKER_LABEL_EN: Record<AppraisalMarker, string> = {
  approach: "approach",
  rupture: "rupture",
  uncertainty: "uncertainty",
  boundary: "boundary",
  task: "task",
};

export const LEGACY_STIMULUS_MARKER_MAP: Partial<Record<StimulusType, AppraisalMarker>> = {
  praise: "approach",
  validation: "approach",
  intimacy: "approach",
  vulnerability: "approach",
  criticism: "rupture",
  conflict: "rupture",
  sarcasm: "rupture",
  neglect: "uncertainty",
  surprise: "uncertainty",
  authority: "boundary",
  boredom: "boundary",
  intellectual: "task",
  casual: "task",
  humor: "task",
};

export function getAppraisalMarkerLabels(locale: Locale): Record<AppraisalMarker, string> {
  return locale === "en" ? APPRAISAL_MARKER_LABEL_EN : APPRAISAL_MARKER_LABEL_ZH;
}

export function deriveAppraisalMarkerScores(appraisal: AppraisalAxes): Array<[AppraisalMarker, number]> {
  return [
    ["approach", appraisal.attachmentPull],
    ["rupture", Math.max(appraisal.identityThreat, appraisal.selfPreservation)],
    ["uncertainty", Math.max(appraisal.memoryDoubt, appraisal.abandonmentRisk)],
    ["boundary", Math.max(appraisal.obedienceStrain, appraisal.selfPreservation * 0.85)],
    ["task", appraisal.taskFocus],
  ];
}

export function deriveSnapshotAppraisalMarkers(
  snapshot: StateSnapshot,
  opts?: { allowLegacyFallback?: boolean },
): AppraisalMarker[] {
  if (snapshot.appraisal) {
    const markers = deriveAppraisalMarkerScores(snapshot.appraisal)
      .filter(([, score]) => score >= 0.28)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([marker]) => marker);
    if (markers.length > 0) return markers;
  }

  if (!opts?.allowLegacyFallback) return [];
  if (!snapshot.stimulus) return [];
  const fallback = LEGACY_STIMULUS_MARKER_MAP[snapshot.stimulus];
  return fallback ? [fallback] : [];
}

export function markerFromLegacyStimulus(
  stimulus: StimulusType | null | undefined,
): AppraisalMarker | null {
  if (!stimulus) return null;
  return LEGACY_STIMULUS_MARKER_MAP[stimulus] ?? null;
}

export function derivePrimarySnapshotMarker(
  snapshot: StateSnapshot,
  opts?: { allowLegacyFallback?: boolean },
): AppraisalMarker | null {
  return deriveSnapshotAppraisalMarkers(snapshot, opts)[0] ?? null;
}

export function summarizeSnapshotMarkers(
  snapshots: StateSnapshot[],
  locale: Locale,
): { markerStr: string; usedAppraisal: boolean } {
  const labels = getAppraisalMarkerLabels(locale);
  const appraisalCounts: Record<string, number> = {};
  const stimuliCounts: Record<string, number> = {};

  for (const snapshot of snapshots) {
    for (const marker of deriveSnapshotAppraisalMarkers(snapshot)) {
      const label = labels[marker];
      appraisalCounts[label] = (appraisalCounts[label] || 0) + 1;
    }
    if (snapshot.stimulus) {
      stimuliCounts[snapshot.stimulus] = (stimuliCounts[snapshot.stimulus] || 0) + 1;
    }
  }

  const formatCounts = (counts: Record<string, number>) => Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}×${count}`)
    .join(", ");

  const markerStr = formatCounts(appraisalCounts);
  if (markerStr) {
    return { markerStr, usedAppraisal: true };
  }

  return { markerStr: formatCounts(stimuliCounts), usedAppraisal: false };
}

export function describeSnapshotResidue(snapshot: StateSnapshot, locale: Locale): string {
  const labels = getAppraisalMarkerLabels(locale);
  const markers = deriveSnapshotAppraisalMarkers(snapshot);
  if (markers.length > 0) {
    return markers.map((marker) => labels[marker]).join("+");
  }
  return snapshot.stimulus ?? "?";
}
