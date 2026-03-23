import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadState, saveState, initializeState, decayAndSave,
  parsePsycheUpdate, mergeUpdates, getRelationship,
  detectDisagreement, updateAgreementStreak, generatePsycheMd,
  pushSnapshot,
} from "../src/psyche-file.js";
import type { PsycheState } from "../src/types.js";
import { CHEMICAL_KEYS, DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

let tempDir: string;

async function freshDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "psyche-test-"));
  return dir;
}

function makeMinimalState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 5,
    mbti: "ENFP",
    baseline: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
    current: { DA: 75, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["test"], preferences: ["test"], boundaries: ["test"], currentInterests: [] },
    emotionalHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    meta: { agentName: "TestAgent", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh" },
    ...overrides,
  };
}

// ── loadState ───────────────────────────────────────────────

describe("loadState", () => {
  it("auto-initializes when no state file exists", async () => {
    const dir = await freshDir();
    const state = await loadState(dir);
    assert.equal(state.version, 5);
    assert.equal(state.mbti, "INFJ"); // default
    assert.ok(state.relationships._default);
    assert.equal(state.agreementStreak, 0);
    await rm(dir, { recursive: true });
  });

  it("loads existing state", async () => {
    const dir = await freshDir();
    const original = makeMinimalState();
    await writeFile(join(dir, "psyche-state.json"), JSON.stringify(original), "utf-8");
    const loaded = await loadState(dir);
    assert.equal(loaded.mbti, "ENFP");
    assert.equal(loaded.meta.agentName, "TestAgent");
    await rm(dir, { recursive: true });
  });

  it("migrates v1 to v2", async () => {
    const dir = await freshDir();
    const v1 = {
      version: 1,
      mbti: "INTJ",
      baseline: { DA: 45, HT: 70, CORT: 40, OT: 30, NE: 60, END: 35 },
      current: { DA: 50, HT: 65, CORT: 45, OT: 35, NE: 55, END: 40 },
      updatedAt: new Date().toISOString(),
      relationship: { trust: 60, intimacy: 40, phase: "familiar" },
      empathyLog: null,
      selfModel: { values: ["logic"], preferences: ["depth"], boundaries: ["no bs"], currentInterests: [] },
      meta: { agentName: "V1Agent", createdAt: new Date().toISOString(), totalInteractions: 10 },
    };
    await writeFile(join(dir, "psyche-state.json"), JSON.stringify(v1), "utf-8");
    const loaded = await loadState(dir);
    assert.equal(loaded.version, 5);
    assert.equal(loaded.relationships._default.trust, 60);
    assert.equal(loaded.agreementStreak, 0);
    assert.equal(loaded.meta.locale, "zh");
    await rm(dir, { recursive: true });
  });

  it("handles corrupted JSON gracefully", async () => {
    const dir = await freshDir();
    await writeFile(join(dir, "psyche-state.json"), "not json {{{", "utf-8");
    const state = await loadState(dir);
    // Should auto-initialize instead of crash
    assert.equal(state.version, 5);
    await rm(dir, { recursive: true });
  });
});

// ── saveState (atomic write) ────────────────────────────────

describe("saveState", () => {
  it("writes valid JSON", async () => {
    const dir = await freshDir();
    const state = makeMinimalState();
    await saveState(dir, state);
    const raw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.mbti, "ENFP");
    await rm(dir, { recursive: true });
  });

  it("no .tmp file remains after write", async () => {
    const dir = await freshDir();
    const state = makeMinimalState();
    await saveState(dir, state);
    const files = await import("node:fs/promises").then((m) => m.readdir(dir));
    assert.ok(!files.some((f: string) => f.endsWith(".tmp")), "No .tmp files should remain");
    await rm(dir, { recursive: true });
  });
});

// ── initializeState ─────────────────────────────────────────

describe("initializeState", () => {
  it("creates state with explicit MBTI", async () => {
    const dir = await freshDir();
    const state = await initializeState(dir, { mbti: "ESTP", name: "Tester" });
    assert.equal(state.mbti, "ESTP");
    assert.equal(state.meta.agentName, "Tester");
    assert.equal(state.version, 5);
    await rm(dir, { recursive: true });
  });

  it("creates PSYCHE.md", async () => {
    const dir = await freshDir();
    await initializeState(dir, { mbti: "INFP", name: "Dreamer" });
    const md = await readFile(join(dir, "PSYCHE.md"), "utf-8");
    assert.ok(md.includes("Dreamer"));
    assert.ok(md.includes("INFP"));
    await rm(dir, { recursive: true });
  });

  it("detects MBTI from IDENTITY.md", async () => {
    const dir = await freshDir();
    await writeFile(join(dir, "IDENTITY.md"), "# Identity\nMBTI: ENTP\nName: Debater", "utf-8");
    const state = await initializeState(dir);
    assert.equal(state.mbti, "ENTP");
    await rm(dir, { recursive: true });
  });

  it("supports locale option", async () => {
    const dir = await freshDir();
    const state = await initializeState(dir, { mbti: "ENFP", locale: "en" });
    assert.equal(state.meta.locale, "en");
    await rm(dir, { recursive: true });
  });
});

// ── decayAndSave ────────────────────────────────────────────

describe("decayAndSave", () => {
  it("skips decay if less than 1 minute", async () => {
    const dir = await freshDir();
    const state = makeMinimalState({ current: { DA: 90, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 } });
    state.updatedAt = new Date().toISOString();
    await saveState(dir, state);
    const result = await decayAndSave(dir, state);
    assert.equal(result.current.DA, 90); // no change
    await rm(dir, { recursive: true });
  });
});

// ── parsePsycheUpdate ───────────────────────────────────────

describe("parsePsycheUpdate", () => {
  it("parses standard format", () => {
    const text = `Some text\n<psyche_update>\nDA: 80\nHT: 60\nCORT: 30\nOT: 70\nNE: 55\nEND: 65\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 80);
    assert.equal(result!.current!.HT, 60);
  });

  it("parses Chinese colon format", () => {
    const text = `<psyche_update>\nDA：85\nHT：55\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 85);
  });

  it("parses decimal values", () => {
    const text = `<psyche_update>\nDA: 80.5\nHT: 55.7\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 81); // rounded
    assert.equal(result!.current!.HT, 56); // rounded
  });

  it("parses Chinese chemical names", () => {
    const text = `<psyche_update>\n多巴胺: 80\n血清素: 60\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 80);
    assert.equal(result!.current!.HT, 60);
  });

  it("parses English chemical names", () => {
    const text = `<psyche_update>\nDopamine: 80\nSerotonin: 60\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 80);
    assert.equal(result!.current!.HT, 60);
  });

  it("parses with reasons in parentheses", () => {
    const text = `<psyche_update>\nDA: 80 (受到赞美)\nCORT: 25 (放松了)\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 80);
    assert.equal(result!.current!.CORT, 25);
  });

  it("clamps values above 100", () => {
    const text = `<psyche_update>\nDA: 150\nHT: 200\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 100);
    assert.equal(result!.current!.HT, 100);
  });

  it("ignores negative values (regex only matches digits)", () => {
    const text = `<psyche_update>\nDA: 80\nHT: -10\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.current!.DA, 80);
    assert.equal(result!.current!.HT, undefined); // -10 not matched by [\d.]+
  });

  it("returns null when no psyche_update tag", () => {
    assert.equal(parsePsycheUpdate("Hello, how are you?"), null);
  });

  it("returns null when tag is empty", () => {
    assert.equal(parsePsycheUpdate("<psyche_update>\nnothing here\n</psyche_update>"), null);
  });

  it("parses empathy log", () => {
    const text = `<psyche_update>\nDA: 70\n用户状态: 焦虑\n投射结果: 感到紧张\n共鸣程度: match\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.ok(result!.empathyLog);
    assert.equal(result!.empathyLog!.userState, "焦虑");
    assert.equal(result!.empathyLog!.resonance, "match");
  });

  it("parses trust and intimacy updates", () => {
    const text = `<psyche_update>\nDA: 70\n信任度: 75\n亲密度: 60\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.ok(result!.relationships);
  });
});

// ── mergeUpdates ────────────────────────────────────────────

describe("mergeUpdates", () => {
  it("respects maxDelta", () => {
    const state = makeMinimalState();
    const updates = { current: { DA: 100, HT: 55, CORT: 30, OT: 60, NE: 65, END: 70 } as PsycheState["current"] };
    const merged = mergeUpdates(state, updates, 10);
    assert.ok(merged.current.DA <= state.current.DA + 10);
  });

  it("preserves totalInteractions (incremented in processInput instead)", () => {
    const state = makeMinimalState();
    const merged = mergeUpdates(state, { current: state.current }, 25);
    assert.equal(merged.meta.totalInteractions, 0);
  });

  it("updates relationship phase based on avg", () => {
    const state = makeMinimalState();
    const updates = { relationships: { _default: { trust: 90, intimacy: 85, phase: "acquaintance" as const } } };
    const merged = mergeUpdates(state, updates, 25);
    assert.equal(merged.relationships._default.phase, "deep");
  });

  it("supports per-user relationship updates", () => {
    const state = makeMinimalState();
    const updates = { relationships: { _default: { trust: 80, intimacy: 70, phase: "close" as const } } };
    const merged = mergeUpdates(state, updates, 25, "alice");
    assert.ok(merged.relationships.alice);
    assert.equal(merged.relationships.alice.trust, 80);
  });

  it("all chemistry values stay in [0, 100]", () => {
    const state = makeMinimalState({ current: { DA: 5, HT: 95, CORT: 5, OT: 95, NE: 5, END: 95 } });
    const updates = { current: { DA: 0, HT: 100, CORT: 0, OT: 100, NE: 0, END: 100 } as PsycheState["current"] };
    const merged = mergeUpdates(state, updates, 50);
    for (const key of CHEMICAL_KEYS) {
      assert.ok(merged.current[key] >= 0 && merged.current[key] <= 100, `${key} out of range`);
    }
  });
});

// ── getRelationship ─────────────────────────────────────────

describe("getRelationship", () => {
  it("returns _default when no userId", () => {
    const state = makeMinimalState();
    const rel = getRelationship(state);
    assert.equal(rel.trust, 50);
  });

  it("returns default for unknown userId", () => {
    const state = makeMinimalState();
    const rel = getRelationship(state, "unknown_user");
    assert.equal(rel.trust, DEFAULT_RELATIONSHIP.trust);
  });

  it("returns specific user relationship", () => {
    const state = makeMinimalState();
    state.relationships.bob = { trust: 80, intimacy: 70, phase: "close" };
    const rel = getRelationship(state, "bob");
    assert.equal(rel.trust, 80);
  });
});

// ── detectDisagreement ──────────────────────────────────────

describe("detectDisagreement", () => {
  it("detects Chinese disagreement", () => {
    assert.ok(detectDisagreement("我不同意你的看法"));
    assert.ok(detectDisagreement("其实我认为这样不对"));
    assert.ok(detectDisagreement("我有不同的看法"));
  });

  it("detects English disagreement", () => {
    assert.ok(detectDisagreement("I disagree with this approach"));
    assert.ok(detectDisagreement("I don't think so"));
    assert.ok(detectDisagreement("Actually, I think we should do it differently"));
  });

  it("returns false for agreement", () => {
    assert.ok(!detectDisagreement("好的，我同意"));
    assert.ok(!detectDisagreement("That sounds great!"));
    assert.ok(!detectDisagreement("Sure, let's do it."));
  });
});

// ── updateAgreementStreak ───────────────────────────────────

describe("updateAgreementStreak", () => {
  it("increments streak on agreement", () => {
    const state = makeMinimalState({ agreementStreak: 2 });
    const updated = updateAgreementStreak(state, "好的，没问题");
    assert.equal(updated.agreementStreak, 3);
  });

  it("resets streak on disagreement", () => {
    const state = makeMinimalState({ agreementStreak: 5 });
    const updated = updateAgreementStreak(state, "我不同意这个方案");
    assert.equal(updated.agreementStreak, 0);
    assert.ok(updated.lastDisagreement !== null);
  });
});

// ── pushSnapshot ────────────────────────────────────────────

describe("pushSnapshot", () => {
  it("adds a snapshot to empty history", () => {
    const state = makeMinimalState();
    const updated = pushSnapshot(state, "praise");
    assert.equal(updated.emotionalHistory.length, 1);
    assert.equal(updated.emotionalHistory[0].stimulus, "praise");
    assert.ok(updated.emotionalHistory[0].timestamp);
  });

  it("appends to existing history", () => {
    const state = makeMinimalState({
      emotionalHistory: [{
        chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
        stimulus: "casual",
        dominantEmotion: null,
        timestamp: new Date().toISOString(),
      }],
    });
    const updated = pushSnapshot(state, "humor");
    assert.equal(updated.emotionalHistory.length, 2);
    assert.equal(updated.emotionalHistory[1].stimulus, "humor");
  });

  it("respects MAX_EMOTIONAL_HISTORY limit", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      chemistry: { DA: 50, HT: 50, CORT: 50, OT: 50, NE: 50, END: 50 },
      stimulus: "casual" as const,
      dominantEmotion: null,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const state = makeMinimalState({ emotionalHistory: history });
    const updated = pushSnapshot(state, "surprise");
    assert.equal(updated.emotionalHistory.length, 10);
    assert.equal(updated.emotionalHistory[9].stimulus, "surprise");
  });

  it("records dominant emotion when detected", () => {
    // Set up chemistry that triggers "excited joy": DA>70, NE>60, CORT<40
    const state = makeMinimalState({
      current: { DA: 80, HT: 55, CORT: 20, OT: 60, NE: 70, END: 70 },
    });
    const updated = pushSnapshot(state, "praise");
    assert.ok(updated.emotionalHistory[0].dominantEmotion);
  });

  it("handles null stimulus", () => {
    const state = makeMinimalState();
    const updated = pushSnapshot(state, null);
    assert.equal(updated.emotionalHistory[0].stimulus, null);
  });
});

// ── generatePsycheMd ────────────────────────────────────────

describe("generatePsycheMd", () => {
  it("generates valid markdown", async () => {
    const dir = await freshDir();
    const state = makeMinimalState();
    await generatePsycheMd(dir, state);
    const md = await readFile(join(dir, "PSYCHE.md"), "utf-8");
    assert.ok(md.includes("# Psyche"));
    assert.ok(md.includes("TestAgent"));
    assert.ok(md.includes("ENFP"));
    assert.ok(md.includes("<psyche_update>"));
    await rm(dir, { recursive: true });
  });

  it("includes new v0.2 emotion patterns in md", async () => {
    const dir = await freshDir();
    const state = makeMinimalState();
    await generatePsycheMd(dir, state);
    const md = await readFile(join(dir, "PSYCHE.md"), "utf-8");
    assert.ok(md.includes("怨恨"), "Should include resentment");
    assert.ok(md.includes("讽刺"), "Should include sarcasm stimulus");
    await rm(dir, { recursive: true });
  });
});
