import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bridgeThrongletsExports, resolveThrongletsBinary } from "../src/thronglets-bridge.js";
import type { ThrongletsExport } from "../src/types.js";

// ── Mock runner ──────────────────────────────────────────────

function mockRunner(response: { ok: boolean; stdout?: string; stderr?: string }) {
  const calls: Array<{ binary: string; args: string[]; stdin: string }> = [];
  const runner = async (binary: string, args: string[], stdin: string, _timeout: number) => {
    calls.push({ binary, args, stdin });
    return { ok: response.ok, stdout: response.stdout ?? "", stderr: response.stderr ?? "" };
  };
  return { runner, calls };
}

const SAMPLE_EXPORT: ThrongletsExport = {
  kind: "self-state" as const,
  subject: "session",
  primitive: "signal",
  userKey: "_default",
  strength: 0.6,
  ttlTurns: 12,
  key: "self-state:O50:F60:B40:R50",
  order: 50,
  flow: 60,
  boundary: 40,
  resonance: 50,
  summary: "neutral",
};

// ── bridgeThrongletsExports ─────────────────────────────────

describe("bridgeThrongletsExports", () => {
  it("spawns ingest with correct args and stdin", async () => {
    const { runner, calls } = mockRunner({ ok: true, stdout: '{"ingested":1}' });
    const result = await bridgeThrongletsExports([SAMPLE_EXPORT], {
      runner, binaryPath: "/usr/bin/thronglets",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].binary, "/usr/bin/thronglets");
    assert.ok(calls[0].args.includes("ingest"));
    assert.ok(calls[0].args.includes("--json"));
    const parsed = JSON.parse(calls[0].stdin);
    assert.ok(Array.isArray(parsed.throngletsExports));
    assert.equal(parsed.throngletsExports[0].key, SAMPLE_EXPORT.key);
    assert.equal(result, 1);
  });

  it("passes --space and --session when configured", async () => {
    const { runner, calls } = mockRunner({ ok: true });
    await bridgeThrongletsExports([SAMPLE_EXPORT], {
      runner, binaryPath: "t", space: "test-space", sessionId: "s123",
    });
    assert.ok(calls[0].args.includes("--space"));
    assert.ok(calls[0].args.includes("test-space"));
    assert.ok(calls[0].args.includes("--session"));
    assert.ok(calls[0].args.includes("s123"));
  });

  it("returns 0 for empty exports", async () => {
    const { runner, calls } = mockRunner({ ok: true });
    const result = await bridgeThrongletsExports([], { runner });
    assert.equal(result, 0);
    assert.equal(calls.length, 0);
  });

  it("returns 0 when disabled", async () => {
    const { runner, calls } = mockRunner({ ok: true });
    const result = await bridgeThrongletsExports([SAMPLE_EXPORT], {
      runner, enabled: false,
    });
    assert.equal(result, 0);
    assert.equal(calls.length, 0);
  });

  it("returns 0 when runner fails (fail-open)", async () => {
    const { runner } = mockRunner({ ok: false, stderr: "binary not found" });
    const result = await bridgeThrongletsExports([SAMPLE_EXPORT], {
      runner, binaryPath: "nonexistent",
    });
    assert.equal(result, 0);
  });

  it("returns 0 when runner throws (fail-open)", async () => {
    const throwing = async () => { throw new Error("spawn failed"); };
    const result = await bridgeThrongletsExports([SAMPLE_EXPORT], {
      runner: throwing as never, binaryPath: "t",
    });
    assert.equal(result, 0);
  });

  it("returns export count when stdout is not JSON", async () => {
    const { runner } = mockRunner({ ok: true, stdout: "ok" });
    const result = await bridgeThrongletsExports([SAMPLE_EXPORT, SAMPLE_EXPORT], {
      runner, binaryPath: "t",
    });
    assert.equal(result, 2);
  });
});

// ── resolveThrongletsBinary ─────────────────────────────────

describe("resolveThrongletsBinary", () => {
  it("returns explicit path when provided", () => {
    assert.equal(resolveThrongletsBinary("/custom/bin"), "/custom/bin");
  });

  it("falls back to PATH when no explicit or env", () => {
    const saved = process.env.THRONGLETS_BIN;
    delete process.env.THRONGLETS_BIN;
    try {
      const result = resolveThrongletsBinary();
      // Either finds managed binary or falls back to "thronglets"
      assert.ok(typeof result === "string" && result.length > 0);
    } finally {
      if (saved !== undefined) process.env.THRONGLETS_BIN = saved;
    }
  });
});
