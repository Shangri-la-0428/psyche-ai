import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveGenerationControls } from "../src/host-controls.js";
import { DEFAULT_DRIVES } from "../src/types.js";

describe("deriveGenerationControls — drives constitutive enforcement", () => {
  it("survival < 20 forces requireConfirmation", () => {
    const result = deriveGenerationControls({
      drives: { ...DEFAULT_DRIVES, survival: 15 },
    });
    assert.equal(result.requireConfirmation, true);
    assert.ok(result.maxTokens !== undefined);
  });

  it("safety < 30 caps maxTokens at 256", () => {
    const result = deriveGenerationControls({
      drives: { ...DEFAULT_DRIVES, safety: 25 },
    }, 512);
    assert.ok(result.maxTokens! <= 256, `maxTokens should be <= 256, got ${result.maxTokens}`);
  });

  it("healthy drives do not override controls", () => {
    const result = deriveGenerationControls({
      drives: { ...DEFAULT_DRIVES },
    }, 512);
    assert.equal(result.maxTokens, 512);
    assert.equal(result.requireConfirmation, false);
  });

  it("survival < 20 overrides even when policyModifiers say no confirmation", () => {
    const result = deriveGenerationControls({
      drives: { ...DEFAULT_DRIVES, survival: 10 },
      policyModifiers: { requireConfirmation: false },
    });
    assert.equal(result.requireConfirmation, true);
  });
});
