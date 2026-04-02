// ============================================================
// Overlay — semantic-stable effect signals for external consumers
//
// The overlay is a projection of self-state, not an interface adapter.
// arousal/valence/agency/vulnerability have meaning independent of
// any consumer. Psyche secretes these like hormones — broadcast,
// not point-to-point.
// ============================================================

import type { SelfState } from "./types.js";

/**
 * Semantic-stable effect signals derived from 4D self-state.
 *
 * All values [-1, 1]. 0 = at baseline (no effect).
 */
export interface PsycheOverlay {
  /** Activation level. High flow + disrupted order = high arousal. */
  arousal: number;
  /** Positive/negative quality. High order + high resonance = positive. */
  valence: number;
  /** Capacity for intentional action. High boundary + high flow. */
  agency: number;
  /** Susceptibility to perturbation. Low boundary + low order. */
  vulnerability: number;
}

/** Overlay dimension keys for iteration. */
export const OVERLAY_KEYS: (keyof PsycheOverlay)[] = [
  "arousal", "valence", "agency", "vulnerability",
];

/**
 * Normalization range. A 50-point deviation from baseline maps to full scale.
 *
 * Dimensions are 0-100, so ±50 is the theoretical max. In practice most
 * deviations are ±20 (overlay ~±0.4), keeping the signal informative.
 */
const RANGE = 50;

/**
 * Project self-state into overlay effect signals.
 *
 * Pure linear projection from dimension deviations:
 *
 * ```
 *                    order   flow   boundary  resonance
 * arousal        = [ -0.4    0.6     0         0       ]
 * valence        = [  0.5    0       0         0.5     ]
 * agency         = [  0      0.4     0.6       0       ]
 * vulnerability  = [ -0.4    0      -0.6       0       ]
 * ```
 *
 * Each signal reads exactly 2 dimensions. Sparse and interpretable.
 * arousal/valence are the classic activation×evaluation axes;
 * agency/vulnerability reflect structural integrity.
 */
export function computeOverlay(
  state: { current: SelfState; baseline: SelfState },
): PsycheOverlay {
  const c = state.current;
  const b = state.baseline;

  const dO = (c.order     - b.order)     / RANGE;
  const dF = (c.flow      - b.flow)      / RANGE;
  const dB = (c.boundary  - b.boundary)  / RANGE;
  const dR = (c.resonance - b.resonance) / RANGE;

  const clamp = (v: number) => Math.max(-1, Math.min(1, v)) || 0;

  return {
    arousal:       clamp(-0.4 * dO + 0.6 * dF),
    valence:       clamp( 0.5 * dO + 0.5 * dR),
    agency:        clamp( 0.4 * dF + 0.6 * dB),
    vulnerability: clamp(-0.4 * dO - 0.6 * dB),
  };
}
