import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  updateAttachment,
  computeSeparationEffect,
  computeReunionEffect,
  DEFAULT_ATTACHMENT,
} from "../src/attachment.js";
import type { AttachmentState, AttachmentStyle } from "../src/attachment.js";
import type { StimulusType } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeAttachment(overrides: Partial<AttachmentState> = {}): AttachmentState {
  return { ...DEFAULT_ATTACHMENT, ...overrides };
}

// ── updateAttachment ────────────────────────────────────────

describe("updateAttachment", () => {
  it("increases strength with interactions", () => {
    let attachment = makeAttachment({ strength: 0 });
    attachment = updateAttachment(attachment, "casual", 0.1);
    assert.equal(attachment.strength, 1, "strength should increase by 1");
    assert.equal(attachment.interactionCount, 1, "count should be 1");

    attachment = updateAttachment(attachment, "casual", 0.1);
    assert.equal(attachment.strength, 2, "strength should be 2 after two interactions");
    assert.equal(attachment.interactionCount, 2, "count should be 2");
  });

  it("strength caps at 100", () => {
    const attachment = makeAttachment({ strength: 99 });
    const result = updateAttachment(attachment, "casual", 0.1);
    assert.equal(result.strength, 100, "strength should cap at 100");
  });

  it("with positive stimuli raises securityScore", () => {
    let attachment = makeAttachment({ securityScore: 50 });
    // Apply multiple positive stimuli
    for (let i = 0; i < 10; i++) {
      attachment = updateAttachment(attachment, "praise", 0.5);
    }
    assert.ok(
      attachment.securityScore > 50,
      `securityScore should increase with praise, got ${attachment.securityScore}`,
    );
  });

  it("with negative stimuli lowers securityScore", () => {
    let attachment = makeAttachment({ securityScore: 50 });
    for (let i = 0; i < 10; i++) {
      attachment = updateAttachment(attachment, "criticism", -0.5);
    }
    assert.ok(
      attachment.securityScore < 50,
      `securityScore should decrease with criticism, got ${attachment.securityScore}`,
    );
  });

  it("detects anxious style from inconsistency", () => {
    let attachment = makeAttachment({ securityScore: 60, anxietyScore: 50 });

    // Alternate positive and negative stimuli to create inconsistency
    const stimuli: { stimulus: StimulusType; score: number }[] = [
      { stimulus: "praise", score: -0.5 },      // positive stimulus but negative outcome = inconsistency
      { stimulus: "criticism", score: 0.5 },     // negative stimulus but positive outcome = inconsistency
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
      { stimulus: "praise", score: -0.5 },
      { stimulus: "criticism", score: 0.5 },
    ];

    for (const { stimulus, score } of stimuli) {
      attachment = updateAttachment(attachment, stimulus, score);
    }

    assert.ok(
      attachment.anxietyScore > 55,
      `anxietyScore should be elevated from inconsistency, got ${attachment.anxietyScore}`,
    );
  });

  it("detects avoidant style from neglect/rejection", () => {
    let attachment = makeAttachment({ avoidanceScore: 50 });

    // Repeated neglect and rejection stimuli
    for (let i = 0; i < 20; i++) {
      const stimulus: StimulusType = i % 2 === 0 ? "neglect" : "authority";
      attachment = updateAttachment(attachment, stimulus, -0.3);
    }

    assert.ok(
      attachment.avoidanceScore > 55,
      `avoidanceScore should be elevated from rejection, got ${attachment.avoidanceScore}`,
    );
  });

  it("secure style with all positive interactions", () => {
    let attachment = makeAttachment({
      securityScore: 65,
      anxietyScore: 35,
      avoidanceScore: 35,
    });
    for (let i = 0; i < 15; i++) {
      attachment = updateAttachment(attachment, "validation", 0.5);
    }
    assert.equal(
      attachment.style, "secure",
      `should be secure with consistent positive interactions, got ${attachment.style}`,
    );
  });

  it("handles null stimulus gracefully", () => {
    const attachment = makeAttachment();
    const result = updateAttachment(attachment, null, 0);
    assert.equal(result.interactionCount, 1, "should still count interaction");
    assert.equal(result.strength, 1, "should still increase strength");
  });
});

// ── computeSeparationEffect ─────────────────────────────────

describe("computeSeparationEffect", () => {
  it("returns null for short absence (< 60 minutes)", () => {
    const attachment = makeAttachment({ strength: 50, style: "secure" });
    const result = computeSeparationEffect(attachment, 30);
    assert.equal(result, null, "should return null for < 60 min absence");
  });

  it("returns null for weak attachment (strength < 20)", () => {
    const attachment = makeAttachment({ strength: 10, style: "secure" });
    const result = computeSeparationEffect(attachment, 1500); // 25 hours
    assert.equal(result, null, "should return null for weak attachment");
  });

  it("secure: no effect before 24h", () => {
    const attachment = makeAttachment({ strength: 60, style: "secure" });
    const result = computeSeparationEffect(attachment, 600); // 10 hours
    assert.equal(result, null, "secure attachment should show no effect before 24h");
  });

  it("secure: mild longing after 24h", () => {
    const attachment = makeAttachment({ strength: 60, style: "secure" });
    const result = computeSeparationEffect(attachment, 1500); // 25 hours
    assert.ok(result !== null, "should return separation effect after 24h");
    assert.ok(
      (result!.stateDelta.resonance ?? 0) < 0,
      `resonance should decrease for longing, got ${result!.stateDelta.resonance}`,
    );
    assert.ok(
      (result!.stateDelta.order ?? 0) < 0,
      `order should decrease for longing, got ${result!.stateDelta.order}`,
    );
    assert.ok(result!.intensity < 0.5, "secure separation should be mild");
    assert.ok(result!.description.includes("gentle"), "should describe gentle longing");
  });

  it("anxious: no effect before 4h", () => {
    const attachment = makeAttachment({ strength: 60, style: "anxious" });
    const result = computeSeparationEffect(attachment, 120); // 2 hours
    assert.equal(result, null, "anxious attachment should show no effect before 4h");
  });

  it("anxious: distress after 4h", () => {
    const attachment = makeAttachment({ strength: 70, style: "anxious" });
    const result = computeSeparationEffect(attachment, 300); // 5 hours
    assert.ok(result !== null, "should return separation effect");
    // anxious: { resonance: -8*i, order: -10*i, boundary: -5*i, flow: +5*i }
    assert.ok(
      (result!.stateDelta.order ?? 0) < 0,
      `order should drop for anxious distress, got ${result!.stateDelta.order}`,
    );
    assert.ok(
      (result!.stateDelta.flow ?? 0) > 0,
      `flow should rise for anxious distress (agitation), got ${result!.stateDelta.flow}`,
    );
    assert.ok(
      result!.description.includes("anxious") || result!.description.includes("abandon"),
      "should describe anxious distress",
    );
  });

  it("avoidant: no effect before 48h", () => {
    const attachment = makeAttachment({ strength: 60, style: "avoidant" });
    const result = computeSeparationEffect(attachment, 2400); // 40 hours
    assert.equal(result, null, "avoidant attachment should show no effect before 48h");
  });

  it("avoidant: subtle discomfort after 48h", () => {
    const attachment = makeAttachment({ strength: 60, style: "avoidant" });
    const result = computeSeparationEffect(attachment, 3000); // 50 hours
    assert.ok(result !== null, "should return separation effect after 48h");
    assert.ok(
      (result!.stateDelta.resonance ?? 0) < 0,
      "OT should slightly decrease for avoidant discomfort",
    );
    assert.ok(result!.intensity < 0.3, "avoidant separation should be subtle");
  });

  it("disorganized: conflicting signals after 4h", () => {
    const attachment = makeAttachment({ strength: 60, style: "disorganized" });
    const result = computeSeparationEffect(attachment, 300); // 5 hours
    assert.ok(result !== null, "should return separation effect");
    // disorganized: { resonance: +5*i, order: -5*i, flow: +3*i }
    // resonance rises (wanting closeness) while order drops (confusion) — conflicting
    assert.ok(
      (result!.stateDelta.resonance ?? 0) > 0,
      "resonance should rise — wanting closeness",
    );
    assert.ok(
      (result!.stateDelta.order ?? 0) < 0,
      "order should drop — confusion",
    );
  });
});

// ── computeReunionEffect ────────────────────────────────────

describe("computeReunionEffect", () => {
  it("returns null for short absence", () => {
    const attachment = makeAttachment({ strength: 50, style: "secure" });
    const result = computeReunionEffect(attachment, 30);
    assert.equal(result, null, "should return null for < 60 min");
  });

  it("returns null for weak attachment", () => {
    const attachment = makeAttachment({ strength: 10, style: "secure" });
    const result = computeReunionEffect(attachment, 1500);
    assert.equal(result, null, "should return null for weak attachment");
  });

  it("secure: warm reunion", () => {
    const attachment = makeAttachment({ strength: 70, style: "secure" });
    const result = computeReunionEffect(attachment, 1500); // 25 hours
    assert.ok(result !== null, "should return reunion effect");
    assert.ok(
      (result!.resonance ?? 0) > 0,
      `OT should rise for warm reunion, got ${result!.resonance}`,
    );
    assert.ok(
      (result!.flow ?? 0) > 0,
      `DA should rise for warm reunion, got ${result!.flow}`,
    );
    assert.ok(
      (result!.resonance ?? 0) > 0,
      `END should rise for warm reunion, got ${result!.resonance}`,
    );
  });

  it("anxious: intense relief with residual instability", () => {
    const attachment = makeAttachment({ strength: 70, style: "anxious" });
    const result = computeReunionEffect(attachment, 1500);
    assert.ok(result !== null, "should return reunion effect");
    // anxious reunion: { resonance: 15*scale, flow: 8*scale, order: -3*scale }
    assert.ok(
      (result!.resonance ?? 0) > 0,
      `resonance should rise for anxious relief, got ${result!.resonance}`,
    );
    assert.ok(
      (result!.flow ?? 0) > 0,
      `flow should rise for anxious relief, got ${result!.flow}`,
    );
    // Anxious reunion has order dropping (still shaky)
    assert.ok(
      (result!.order ?? 0) < 0,
      `order should still be destabilized for anxious reunion, got ${result!.order}`,
    );

    // resonance should be higher for anxious than secure (more intense)
    const secureResult = computeReunionEffect(
      makeAttachment({ strength: 70, style: "secure" }),
      1500,
    );
    assert.ok(
      (result!.resonance ?? 0) > (secureResult?.resonance ?? 0),
      "anxious resonance reunion should be more intense than secure",
    );
  });

  it("avoidant: cautious re-engagement", () => {
    const attachment = makeAttachment({ strength: 70, style: "avoidant" });
    const result = computeReunionEffect(attachment, 1500);
    assert.ok(result !== null, "should return reunion effect");
    // avoidant reunion: { boundary: 3*scale, flow: 5*scale }
    assert.ok(
      (result!.boundary ?? 0) > 0,
      "boundary should rise for avoidant — maintaining guard",
    );
    assert.ok(
      (result!.flow ?? 0) > 0,
      "flow should rise — cautious alertness",
    );

    // Avoidant resonance (0) should be lower than secure resonance (8*scale)
    const secureResult = computeReunionEffect(
      makeAttachment({ strength: 70, style: "secure" }),
      1500,
    );
    assert.ok(
      (result!.resonance ?? 0) < (secureResult?.resonance ?? 0),
      "avoidant resonance reunion should be less intense than secure",
    );
  });

  it("disorganized: mixed signals", () => {
    const attachment = makeAttachment({ strength: 70, style: "disorganized" });
    const result = computeReunionEffect(attachment, 1500);
    assert.ok(result !== null, "should return reunion effect");
    // disorganized reunion: { resonance: 5*scale, order: -3*scale, flow: 5*scale }
    assert.ok(
      (result!.resonance ?? 0) > 0,
      "resonance should rise — wanting connection",
    );
    assert.ok(
      (result!.order ?? 0) < 0,
      "order should drop — conflicting signals",
    );
    assert.ok(
      (result!.flow ?? 0) > 0,
      "flow should rise — heightened arousal",
    );
  });

  it("reunion scales with attachment strength", () => {
    const weak = makeAttachment({ strength: 25, style: "secure" });
    const strong = makeAttachment({ strength: 90, style: "secure" });

    const weakResult = computeReunionEffect(weak, 1500);
    const strongResult = computeReunionEffect(strong, 1500);

    assert.ok(weakResult !== null && strongResult !== null);
    assert.ok(
      (strongResult!.resonance ?? 0) > (weakResult!.resonance ?? 0),
      "stronger attachment should produce stronger reunion OT",
    );
  });
});
