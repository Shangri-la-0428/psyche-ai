import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeOverlay, OVERLAY_KEYS } from "../src/overlay.js";
import type { SelfState } from "../src/types.js";

function makeState(
  current: Partial<SelfState> = {},
  baseline: Partial<SelfState> = {},
) {
  const base: SelfState = { order: 55, flow: 55, boundary: 60, resonance: 50, ...baseline };
  return {
    current: { ...base, ...current },
    baseline: base,
  };
}

describe("computeOverlay", () => {
  it("returns zero at baseline", () => {
    const overlay = computeOverlay(makeState());
    for (const k of OVERLAY_KEYS) {
      assert.strictEqual(overlay[k], 0, `${k} should be 0 at baseline`);
    }
  });

  it("high flow → positive arousal", () => {
    const overlay = computeOverlay(makeState({ flow: 85 }));
    assert.ok(overlay.arousal > 0.3, `arousal=${overlay.arousal}`);
  });

  it("low order → positive arousal (disruption is activating)", () => {
    const overlay = computeOverlay(makeState({ order: 30 }));
    assert.ok(overlay.arousal > 0, `arousal=${overlay.arousal}`);
  });

  it("high order + high resonance → positive valence", () => {
    const overlay = computeOverlay(makeState({ order: 80, resonance: 75 }));
    assert.ok(overlay.valence > 0.3, `valence=${overlay.valence}`);
  });

  it("low order + low resonance → negative valence", () => {
    const overlay = computeOverlay(makeState({ order: 30, resonance: 25 }));
    assert.ok(overlay.valence < -0.3, `valence=${overlay.valence}`);
  });

  it("high boundary + high flow → positive agency", () => {
    const overlay = computeOverlay(makeState({ boundary: 85, flow: 80 }));
    assert.ok(overlay.agency > 0.3, `agency=${overlay.agency}`);
  });

  it("low boundary + low order → positive vulnerability", () => {
    const overlay = computeOverlay(makeState({ boundary: 30, order: 30 }));
    assert.ok(overlay.vulnerability > 0.3, `vulnerability=${overlay.vulnerability}`);
  });

  it("vulnerability and agency are not simple inverses", () => {
    // Agency depends on flow+boundary; vulnerability on order+boundary.
    // High flow + low order → both can be simultaneously elevated.
    const overlay = computeOverlay(makeState({ flow: 85, order: 30, boundary: 60 }));
    assert.ok(overlay.arousal > 0.3, "arousal should be high");
    assert.ok(overlay.agency > 0, "agency should be positive (flow↑)");
    assert.ok(overlay.vulnerability > 0, "vulnerability should be positive (order↓)");
  });

  it("clamps to [-1, 1] at extreme deviations", () => {
    const overlay = computeOverlay(makeState(
      { order: 0, flow: 100, boundary: 0, resonance: 0 },
      { order: 100, flow: 0, boundary: 100, resonance: 100 },
    ));
    for (const k of OVERLAY_KEYS) {
      assert.ok(overlay[k] >= -1 && overlay[k] <= 1, `${k}=${overlay[k]} out of range`);
    }
  });

  it("symmetric: opposite deviations produce opposite signs", () => {
    const up = computeOverlay(makeState({ order: 75, resonance: 70 }));
    const down = computeOverlay(makeState({ order: 35, resonance: 30 }));
    assert.ok(up.valence > 0, "positive deviation → positive valence");
    assert.ok(down.valence < 0, "negative deviation → negative valence");
    assert.ok(Math.abs(up.valence + down.valence) < 0.01, "magnitudes should be equal");
  });
});
