import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { MemoryStorageAdapter, FileStorageAdapter, defaultWorkspaceRoot, resolveWorkspaceDir } from "../src/storage.js";
import type { PsycheState } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "ENFP",
    sensitivity: 1.0,
    baseline: { order: 55, flow: 75, boundary: 30, resonance: 60 },
    current: { order: 55, flow: 75, boundary: 30, resonance: 60 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["真实"], preferences: [], boundaries: [], currentInterests: [] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh", mode: "natural" as const },
    ...overrides,
  };
}

// ── MemoryStorageAdapter ─────────────────────────────────────

describe("MemoryStorageAdapter", () => {
  it("returns null when empty", async () => {
    const adapter = new MemoryStorageAdapter();
    assert.equal(await adapter.load(), null);
  });

  it("round-trips state", async () => {
    const adapter = new MemoryStorageAdapter();
    const state = makeState();
    await adapter.save(state);
    const loaded = await adapter.load();
    assert.deepEqual(loaded, state);
  });

  it("overwrites previous state", async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.save(makeState({ mbti: "INTJ" }));
    await adapter.save(makeState({ mbti: "ENFP" }));
    const loaded = await adapter.load();
    assert.equal(loaded?.mbti, "ENFP");
  });
});

// ── FileStorageAdapter ───────────────────────────────────────

describe("FileStorageAdapter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "psyche-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no file exists", async () => {
    const adapter = new FileStorageAdapter(tmpDir);
    assert.equal(await adapter.load(), null);
  });

  it("round-trips state via file", async () => {
    const adapter = new FileStorageAdapter(tmpDir);
    const state = makeState();
    await adapter.save(state);
    const loaded = await adapter.load();
    assert.deepEqual(loaded, state);
  });

  it("uses custom filename", async () => {
    const adapter = new FileStorageAdapter(tmpDir, "custom.json");
    const state = makeState();
    await adapter.save(state);
    const loaded = await adapter.load();
    assert.equal(loaded?.mbti, "ENFP");
  });

  it("migrates v1 state to v2", async () => {
    const v1 = {
      version: 1,
      mbti: "INTJ",
    sensitivity: 1.0,
      baseline: { order: 70, flow: 45, boundary: 40, resonance: 30 },
      current: { order: 65, flow: 60, boundary: 50, resonance: 35 },
      updatedAt: new Date().toISOString(),
      relationship: { trust: 60, intimacy: 40, phase: "familiar" },
      empathyLog: null,
      selfModel: { values: ["逻辑"], preferences: [], boundaries: [], currentInterests: [] },
      meta: { agentName: "v1Agent", createdAt: new Date().toISOString(), totalInteractions: 5 },
    };

    await writeFile(join(tmpDir, "psyche-state.json"), JSON.stringify(v1));

    const adapter = new FileStorageAdapter(tmpDir);
    const loaded = await adapter.load();

    assert.ok(loaded !== null);
    assert.equal(loaded!.version, 6);
    assert.equal(loaded!.mbti, "INTJ");
    assert.ok("_default" in loaded!.relationships);
    assert.equal(loaded!.relationships._default.trust, 60);
    assert.equal(loaded!.agreementStreak, 0);
    assert.deepEqual(loaded!.stateHistory, []);
  });

  it("migrates state with no version field", async () => {
    const noVersion = {
      mbti: "ENFP",
    sensitivity: 1.0,
      baseline: { order: 55, flow: 75, boundary: 30, resonance: 60 },
      current: { order: 55, flow: 75, boundary: 30, resonance: 60 },
      updatedAt: new Date().toISOString(),
      selfModel: { values: [], preferences: [], boundaries: [], currentInterests: [] },
      meta: { agentName: "old", createdAt: new Date().toISOString(), totalInteractions: 0 },
    };

    await writeFile(join(tmpDir, "psyche-state.json"), JSON.stringify(noVersion));

    const adapter = new FileStorageAdapter(tmpDir);
    const loaded = await adapter.load();
    assert.equal(loaded!.version, 6);
    assert.ok(loaded!.relationships._default);
  });

  it("handles corrupt JSON gracefully", async () => {
    await writeFile(join(tmpDir, "psyche-state.json"), "not json {{{");
    const adapter = new FileStorageAdapter(tmpDir);
    const loaded = await adapter.load();
    assert.equal(loaded, null);
  });

  it("handles empty file gracefully", async () => {
    await writeFile(join(tmpDir, "psyche-state.json"), "");
    const adapter = new FileStorageAdapter(tmpDir);
    const loaded = await adapter.load();
    assert.equal(loaded, null);
  });

  it("serializes concurrent saves without losing the target file", async () => {
    const adapter = new FileStorageAdapter(tmpDir);
    await Promise.all([
      adapter.save(makeState({ meta: { agentName: "A", createdAt: new Date().toISOString(), totalInteractions: 1, locale: "zh", mode: "natural" as const } })),
      adapter.save(makeState({ meta: { agentName: "B", createdAt: new Date().toISOString(), totalInteractions: 2, locale: "zh", mode: "natural" as const } })),
      adapter.save(makeState({ meta: { agentName: "C", createdAt: new Date().toISOString(), totalInteractions: 3, locale: "zh", mode: "natural" as const } })),
    ]);

    const loaded = await adapter.load();
    assert.ok(loaded, "state file should still exist after concurrent saves");
    assert.ok(["A", "B", "C"].includes(loaded!.meta.agentName));
  });
});

describe("workspace resolution", () => {
  it("uses a stable per-user root when no workspace is provided", () => {
    assert.equal(defaultWorkspaceRoot("mcp"), join(homedir(), ".psyche-ai", "mcp"));
    assert.equal(resolveWorkspaceDir({ surface: "mcp" }), join(homedir(), ".psyche-ai", "mcp"));
  });

  it("nests per-sigil state under the resolved base directory", () => {
    assert.equal(
      resolveWorkspaceDir({ workspace: "~/ignored-by-resolve", sigilId: "SIG_demo", surface: "mcp" }),
      join(homedir(), "ignored-by-resolve", "SIG_demo"),
    );
    assert.equal(
      resolveWorkspaceDir({ sigilId: "SIG_demo", surface: "mcp" }),
      join(homedir(), ".psyche-ai", "mcp", "SIG_demo"),
    );
  });
});
