import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializeExternalContinuityForThronglets,
  serializeThrongletsExportAsTrace,
  taxonomyForThrongletsExport,
} from "../src/thronglets-runtime.js";
import { buildExternalContinuityEnvelope } from "../src/external-continuity.js";
import type { ThrongletsExport } from "../src/types.js";

describe("thronglets runtime adapter", () => {
  it("maps sparse psyche exports into the frozen thronglets taxonomy", () => {
    assert.equal(
      taxonomyForThrongletsExport({
        kind: "relation-milestone",
        subject: "delegate",
        primitive: "signal",
        userKey: "alice",
        strength: 0.81,
        ttlTurns: 8,
        key: "milestone:alice:familiar",
        phase: "familiar",
        trust: 62,
        intimacy: 45,
      }),
      "coordination",
    );
    assert.equal(
      taxonomyForThrongletsExport({
        kind: "continuity-anchor",
        subject: "session",
        primitive: "trace",
        userKey: "alice",
        strength: 0.74,
        ttlTurns: 3,
        key: "continuity:alice:guarded-resume",
        continuityMode: "guarded-resume",
        activeLoopTypes: ["existence-test"],
        continuityFloor: 0.59,
      }),
      "continuity",
    );
    assert.equal(
      taxonomyForThrongletsExport({
        kind: "writeback-calibration",
        subject: "delegate",
        primitive: "signal",
        userKey: "alice",
        strength: 0.72,
        ttlTurns: 4,
        key: "writeback:alice:trust_up:converging",
        signal: "trust_up",
        effect: "converging",
        metric: "trust",
        confidence: 0.86,
      }),
      "calibration",
    );
  });

  it("serializes a single sparse export into a thronglets trace payload", () => {
    const payload = serializeThrongletsExportAsTrace({
      kind: "continuity-anchor",
      subject: "session",
      primitive: "trace",
      userKey: "alice",
      strength: 0.76,
      ttlTurns: 3,
      key: "anchor-42",
      continuityMode: "guarded-resume",
      activeLoopTypes: ["existence-test"],
      continuityFloor: 0.58,
    }, {
      sessionId: "psyche-1",
    });

    assert.deepEqual(payload, {
      outcome: "succeeded",
      model: "psyche",
      session_id: "psyche-1",
      external_continuity: {
        provider: "thronglets",
        mode: "optional",
        version: 1,
        taxonomy: "continuity",
        event: "continuity-anchor",
        summary: "continuity stayed externally legible across guarded-resume",
        space: "psyche",
        audit_ref: "anchor-42",
      },
    });
  });

  it("serializes all envelope exports as traces even when their psyche primitive is signal", () => {
    const events: ThrongletsExport[] = [
      {
        kind: "relation-milestone",
        subject: "delegate",
        primitive: "signal",
        userKey: "alice",
        strength: 0.8,
        ttlTurns: 8,
        key: "milestone:alice:familiar",
        phase: "familiar",
        trust: 61,
        intimacy: 44,
      },
      {
        kind: "writeback-calibration",
        subject: "delegate",
        primitive: "signal",
        userKey: "alice",
        strength: 0.75,
        ttlTurns: 4,
        key: "writeback:alice:trust_up:converging",
        signal: "trust_up",
        effect: "converging",
        metric: "trust",
        confidence: 0.84,
      },
      {
        kind: "open-loop-anchor",
        subject: "delegate",
        primitive: "trace",
        userKey: "alice",
        strength: 0.71,
        ttlTurns: 6,
        key: "open-loop:alice:repair",
        loopTypes: ["unrepaired-breach"],
        unfinishedTension: 0.69,
        silentCarry: 0.57,
      },
    ];

    const payloads = serializeExternalContinuityForThronglets(
      buildExternalContinuityEnvelope(events),
      { sessionId: "psyche-2", model: "psyche", outcome: "succeeded", space: "psyche" },
    );

    assert.equal(payloads.length, 3);
    assert.deepEqual(payloads.map((payload) => payload.external_continuity.taxonomy), [
      "coordination",
      "calibration",
      "coordination",
    ]);
    assert.deepEqual(payloads.map((payload) => payload.external_continuity.event), [
      "relation-milestone",
      "writeback-calibration",
      "open-loop-anchor",
    ]);
    assert.ok(payloads.every((payload) => payload.session_id === "psyche-2"));
  });

  it("returns an empty list when thronglets is not installed or no exports exist", () => {
    assert.deepEqual(serializeExternalContinuityForThronglets(undefined), []);
    assert.deepEqual(
      serializeExternalContinuityForThronglets(buildExternalContinuityEnvelope([]), {
        sessionId: "psyche-3",
      }),
      [],
    );
  });
});
