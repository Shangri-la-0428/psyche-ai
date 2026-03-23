import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStorageAdapter, FileStorageAdapter } from "../src/storage.js";
import type { PsycheState } from "../src/types.js";
import { DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE } from "../src/types.js";

function makeState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "ENFP",
    baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
    current: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["真实"], preferences: [], boundaries: [], currentInterests: [] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "TestBot", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh" },
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
      baseline: { DA: 45, HT: 70, CORT: 40, OT: 30, NE: 60, END: 35 },
      current: { DA: 60, HT: 65, CORT: 50, OT: 35, NE: 55, END: 30 },
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
    assert.deepEqual(loaded!.emotionalHistory, []);
  });

  it("migrates state with no version field", async () => {
    const noVersion = {
      mbti: "ENFP",
      baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
      current: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
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
});
