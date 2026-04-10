// ============================================================
// Host Controls — derive mechanical generation constraints
//
// Maps psyche output into a tiny host-consumable control surface.
// ============================================================

import type { GenerationControls, InnateDrives, PolicyModifiers, ResponseContract } from "./types.js";

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function estimateMaxTokens(contract?: ResponseContract): number | undefined {
  if (!contract) return undefined;

  // Derive from vibe tier (maxSentences) — aligned with what the prompt actually tells the LLM.
  // No precise char counts in prompt means maxTokens is the only hard ceiling.
  let budget: number;
  if (contract.maxSentences <= 1) budget = 96;
  else if (contract.maxSentences <= 2) budget = 192;
  else if (contract.maxSentences <= 3) budget = 320;
  else budget = 512;

  // Work mode: tighter ceiling from internal maxChars when available
  if (contract.replyProfile === "work" && contract.maxChars !== undefined) {
    budget = Math.min(budget, clampInt(contract.maxChars * 2.2, 96, 1024));
  }

  if (contract.initiativeMode === "reactive") {
    budget = clampInt(budget * 0.85, 64, 1024);
  }

  return budget;
}

export function deriveGenerationControls(
  input: {
    responseContract?: ResponseContract;
    policyModifiers?: Pick<PolicyModifiers, "requireConfirmation">;
    drives?: InnateDrives;
  },
  existingMaxTokens?: number,
): GenerationControls {
  const recommendedMax = estimateMaxTokens(input.responseContract);
  let maxTokens = recommendedMax !== undefined
    ? existingMaxTokens !== undefined
      ? Math.min(existingMaxTokens, recommendedMax)
      : recommendedMax
    : existingMaxTokens;

  // Constitutive enforcement: drives below critical threshold → hard constraints.
  // These are substrate-independent — any substrate understands "confirm before acting"
  // and "limit output complexity."
  if (input.drives) {
    if (input.drives.survival < 20) {
      return { maxTokens: maxTokens ?? 256, requireConfirmation: true };
    }
    if (input.drives.safety < 30 && maxTokens !== undefined) {
      maxTokens = Math.min(maxTokens, 256);
    }
  }

  return {
    maxTokens,
    requireConfirmation: input.policyModifiers?.requireConfirmation
      ?? (input.responseContract?.boundaryMode === "confirm-first"),
  };
}
