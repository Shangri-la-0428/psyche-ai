import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_CONTINUITY_SIGNAL_KINDS,
  EXTERNAL_CONTINUITY_TRACE_KINDS,
  buildExternalContinuityEnvelope,
} from "../src/external-continuity.js";
import type { ThrongletsExport } from "../src/types.js";

describe("external continuity contract", () => {
  it("keeps the signal/trace taxonomy minimal and explicit", () => {
    assert.deepEqual(EXTERNAL_CONTINUITY_SIGNAL_KINDS, [
      "relation-milestone",
      "writeback-calibration",
    ]);
    assert.deepEqual(EXTERNAL_CONTINUITY_TRACE_KINDS, [
      "continuity-anchor",
      "open-loop-anchor",
    ]);
  });

  it("builds an optional additive envelope with partitioned exports", () => {
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
        kind: "continuity-anchor",
        subject: "session",
        primitive: "trace",
        userKey: "alice",
        strength: 0.76,
        ttlTurns: 3,
        key: "continuity:alice:steady",
        continuityMode: "guarded-resume",
        activeLoopTypes: ["existence-test"],
        continuityFloor: 0.58,
      },
    ];

    const envelope = buildExternalContinuityEnvelope(events);
    assert.equal(envelope.provider, "thronglets");
    assert.equal(envelope.mode, "optional");
    assert.equal(envelope.version, 1);
    assert.equal(envelope.exports.length, 2);
    assert.equal(envelope.signals.length, 1);
    assert.equal(envelope.traces.length, 1);
    assert.equal(envelope.signals[0].kind, "relation-milestone");
    assert.equal(envelope.traces[0].kind, "continuity-anchor");
  });
});
