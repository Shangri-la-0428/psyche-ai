import { CURRENT_GOALS, type AmbientPriorView } from "./types.js";

const AMBIENT_PRIOR_KINDS = new Set<NonNullable<AmbientPriorView["kind"]>>([
  "failure-residue",
  "mixed-residue",
  "success-prior",
]);
const AMBIENT_PRIOR_GOALS = new Set<NonNullable<AmbientPriorView["goal"]>>(CURRENT_GOALS);

export function normalizeAmbientPriors(
  priors: readonly AmbientPriorView[] | unknown,
  limit = 5,
): AmbientPriorView[] {
  if (!Array.isArray(priors)) return [];

  const normalized: AmbientPriorView[] = [];
  for (const entry of priors) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const summary = typeof record.summary === "string"
      ? record.summary.trim().replace(/\s+/g, " ")
      : "";
    const confidence = typeof record.confidence === "number"
      ? Math.max(0, Math.min(1, record.confidence))
      : Number.NaN;
    if (!summary || Number.isNaN(confidence)) continue;

    const rawKind = record.kind;
    const normalizedEntry: AmbientPriorView = {
      summary,
      confidence,
    };
    if (
      typeof rawKind === "string"
      && AMBIENT_PRIOR_KINDS.has(rawKind as NonNullable<AmbientPriorView["kind"]>)
    ) {
      normalizedEntry.kind = rawKind as NonNullable<AmbientPriorView["kind"]>;
    }
    if (
      typeof record.goal === "string"
      && AMBIENT_PRIOR_GOALS.has(record.goal as NonNullable<AmbientPriorView["goal"]>)
    ) {
      normalizedEntry.goal = record.goal as NonNullable<AmbientPriorView["goal"]>;
    }
    if (typeof record.provider === "string") {
      const provider = record.provider.trim();
      if (provider) normalizedEntry.provider = provider;
    }
    if (Array.isArray(record.refs)) {
      const refs = record.refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0);
      if (refs.length > 0) normalizedEntry.refs = refs;
    }
    normalized.push(normalizedEntry);
  }

  return normalized
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, Math.max(1, Math.min(5, limit)));
}
