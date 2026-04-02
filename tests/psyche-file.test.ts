import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadState, saveState, initializeState, decayAndSave,
  parsePsycheUpdate, mergeUpdates, getRelationship,
  detectDisagreement, updateAgreementStreak, generatePsycheMd,
  pushSnapshot, compressSession, summarizeTurnSemantic,
} from "../src/psyche-file.js";
import type { PsycheState, StateSnapshot } from "../src/types.js";
import { DIMENSION_KEYS, DEFAULT_RELATIONSHIP, DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE, MAX_RELATIONSHIP_MEMORY } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

let tempDir: string;

async function freshDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "psyche-test-"));
  return dir;
}

function makeMinimalState(overrides: Partial<PsycheState> = {}): PsycheState {
  return {
    version: 6,
    mbti: "ENFP",
    sensitivity: 1.0,
    baseline: { order: 70, flow: 65, boundary: 55, resonance: 60 },
    current: { order: 70, flow: 65, boundary: 55, resonance: 60 },
    updatedAt: new Date().toISOString(),
    relationships: { _default: { ...DEFAULT_RELATIONSHIP } },
    empathyLog: null,
    selfModel: { values: ["test"], preferences: ["test"], boundaries: ["test"], currentInterests: [] },
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    drives: { ...DEFAULT_DRIVES },
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: { agentName: "TestAgent", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "zh", mode: "natural" as const },
    ...overrides,
  };
}

// ── loadState ───────────────────────────────────────────────

describe("loadState", () => {
  it("auto-initializes when no state file exists", async () => {
    const dir = await freshDir();
    const state = await loadState(dir);
    assert.equal(state.version, 10);
    // v10: mbti no longer stored on new states
    assert.equal(state.mbti, undefined);
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
      baseline: { order: 60, flow: 55, boundary: 45, resonance: 35 },
      current: { order: 55, flow: 50, boundary: 40, resonance: 35 },
      updatedAt: new Date().toISOString(),
      relationship: { trust: 60, intimacy: 40, phase: "familiar" },
      empathyLog: null,
      selfModel: { values: ["logic"], preferences: ["depth"], boundaries: ["no bs"], currentInterests: [] },
      meta: { agentName: "V1Agent", createdAt: new Date().toISOString(), totalInteractions: 10 },
    };
    await writeFile(join(dir, "psyche-state.json"), JSON.stringify(v1), "utf-8");
    const loaded = await loadState(dir);
    assert.equal(loaded.version, 6);
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
    assert.equal(state.version, 10);
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
  it("creates state with explicit MBTI preset", async () => {
    const dir = await freshDir();
    const state = await initializeState(dir, { mbti: "ESTP", name: "Tester" });
    // v10: mbti is no longer stored on new states; baseline is derived from preset
    assert.equal(state.mbti, undefined);
    assert.equal(state.meta.agentName, "Tester");
    assert.equal(state.version, 10);
    assert.ok(state.sensitivity > 0, "sensitivity should be set from preset");
    await rm(dir, { recursive: true });
  });

  it("creates PSYCHE.md", async () => {
    const dir = await freshDir();
    await initializeState(dir, { mbti: "INFP", name: "Dreamer" });
    const md = await readFile(join(dir, "PSYCHE.md"), "utf-8");
    assert.ok(md.includes("Dreamer"));
    // v11: PSYCHE.md shows baseline dimensions
    assert.ok(md.includes("order") || md.includes("序"), "should include baseline dimensions");
    await rm(dir, { recursive: true });
  });

  it("detects MBTI from IDENTITY.md for baseline derivation", async () => {
    const dir = await freshDir();
    await writeFile(join(dir, "IDENTITY.md"), "# Identity\nMBTI: ENTP\nName: Debater", "utf-8");
    const state = await initializeState(dir);
    // v11: mbti not stored, but baseline should reflect ENTP profile
    assert.equal(state.mbti, undefined);
    assert.ok(state.baseline.order > 0, "baseline should be set from detected MBTI");
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
    const state = makeMinimalState({ current: { order: 90, flow: 65, boundary: 55, resonance: 60 } });
    state.updatedAt = new Date().toISOString();
    await saveState(dir, state);
    const result = await decayAndSave(dir, state);
    assert.equal(result.current.order, 90); // no change
    await rm(dir, { recursive: true });
  });
});

// ── parsePsycheUpdate ───────────────────────────────────────

describe("parsePsycheUpdate", () => {
  it("parses standard format", () => {
    const text = `Some text\n<psyche_update>\norder: 80\nflow: 60\nboundary: 30\nresonance: 70\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 80);
    assert.equal(result!.state.current!.flow, 60);
  });

  it("parses Chinese colon format", () => {
    const text = `<psyche_update>\norder：85\nflow：55\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 85);
  });

  it("parses decimal values", () => {
    const text = `<psyche_update>\norder: 80.5\nflow: 55.7\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 81); // rounded
    assert.equal(result!.state.current!.flow, 56); // rounded
  });

  it("parses Chinese dimension names", () => {
    const text = `<psyche_update>\n序: 80\n流: 60\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 80);
    assert.equal(result!.state.current!.flow, 60);
  });

  it("parses English dimension names", () => {
    const text = `<psyche_update>\nOrder: 80\nFlow: 60\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 80);
    assert.equal(result!.state.current!.flow, 60);
  });

  it("parses with reasons in parentheses", () => {
    const text = `<psyche_update>\norder: 80 (受到赞美)\nboundary: 25 (放松了)\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 80);
    assert.equal(result!.state.current!.boundary, 25);
  });

  it("clamps values above 100", () => {
    const text = `<psyche_update>\norder: 150\nflow: 200\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 100);
    assert.equal(result!.state.current!.flow, 100);
  });

  it("ignores negative values (regex only matches digits)", () => {
    const text = `<psyche_update>\norder: 80\nflow: -10\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.state.current!.order, 80);
    assert.equal(result!.state.current!.flow, undefined); // -10 not matched by [\d.]+
  });

  it("returns null when no psyche_update tag", () => {
    assert.equal(parsePsycheUpdate("Hello, how are you?"), null);
  });

  it("returns null when tag is empty", () => {
    assert.equal(parsePsycheUpdate("<psyche_update>\nnothing here\n</psyche_update>"), null);
  });

  it("parses empathy log", () => {
    const text = `<psyche_update>\norder: 70\n用户状态: 焦虑\n投射结果: 感到紧张\n共鸣程度: match\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.ok(result!.state.empathyLog);
    assert.equal(result!.state.empathyLog!.userState, "焦虑");
    assert.equal(result!.state.empathyLog!.resonance, "match");
  });

  it("parses trust and intimacy updates", () => {
    const text = `<psyche_update>\norder: 70\n信任度: 75\n亲密度: 60\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.ok(result!.state.relationships);
  });

  it("parses LLM-assisted stimulus classification", () => {
    const text = `<psyche_update>\nstimulus: validation\norder: 75\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.llmStimulus, "validation");
    assert.equal(result!.state.current!.order, 75);
  });

  it("ignores invalid stimulus type from LLM", () => {
    const text = `<psyche_update>\nstimulus: nonsense\norder: 75\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.llmStimulus, undefined);
  });

  it("parses stimulus-only update (no chemistry)", () => {
    const text = `<psyche_update>\nstimulus: praise\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.equal(result!.llmStimulus, "praise");
  });

  it("parses sparse writeback signals and optional confidence", () => {
    const text = `<psyche_update>\nsignals: trust_up, boundary_set | repair_attempt\nsignalConfidence: 0.78\n</psyche_update>`;
    const result = parsePsycheUpdate(text);
    assert.ok(result);
    assert.deepEqual(result!.signals, ["trust_up", "boundary_set", "repair_attempt"]);
    assert.equal(result!.signalConfidence, 0.78);
  });
});

// ── mergeUpdates ────────────────────────────────────────────

describe("mergeUpdates", () => {
  it("respects maxDelta", () => {
    const state = makeMinimalState();
    const updates = { current: { order: 100, flow: 65, boundary: 55, resonance: 60 } as PsycheState["current"] };
    const merged = mergeUpdates(state, updates, 10);
    assert.ok(merged.current.order <= state.current.order + 10);
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

  it("all dimension values stay in [0, 100]", () => {
    const state = makeMinimalState({ current: { order: 5, flow: 95, boundary: 5, resonance: 95 } });
    const updates = { current: { order: 0, flow: 100, boundary: 0, resonance: 100 } as PsycheState["current"] };
    const merged = mergeUpdates(state, updates, 50);
    for (const key of DIMENSION_KEYS) {
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
    const updated = pushSnapshot(state, "praise", { summary: "被夸奖" });
    assert.equal(updated.stateHistory.length, 1);
    assert.equal(updated.stateHistory[0].stimulus, "praise");
    assert.equal(updated.stateHistory[0].semanticSummary, "被夸奖");
    assert.ok(updated.stateHistory[0].timestamp);
  });

  it("appends to existing history", () => {
    const state = makeMinimalState({
      stateHistory: [{
        state: { order: 50, flow: 50, boundary: 50, resonance: 50 },
        stimulus: "casual",
        dominantEmotion: null,
        timestamp: new Date().toISOString(),
      }],
    });
    const updated = pushSnapshot(state, "humor");
    assert.equal(updated.stateHistory.length, 2);
    assert.equal(updated.stateHistory[1].stimulus, "humor");
  });

  it("respects MAX_EMOTIONAL_HISTORY limit", () => {
    // MAX_EMOTIONAL_HISTORY is 30 (P11: raised from 10)
    const history = Array.from({ length: 30 }, (_, i) => ({
      state: { order: 50, flow: 50, boundary: 50, resonance: 50 },
      stimulus: "casual" as const,
      dominantEmotion: null,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const state = makeMinimalState({ stateHistory: history });
    const updated = pushSnapshot(state, "surprise");
    assert.equal(updated.stateHistory.length, 30);
    assert.equal(updated.stateHistory[29].stimulus, "surprise");
  });

  it("records dominant emotion when detected", () => {
    // Set up state that triggers emotion detection: high flow, high order
    const state = makeMinimalState({
      current: { order: 80, flow: 70, boundary: 60, resonance: 70 },
    });
    const updated = pushSnapshot(state, "praise");
    assert.ok(updated.stateHistory[0].dominantEmotion);
  });

  it("handles null stimulus", () => {
    const state = makeMinimalState();
    const updated = pushSnapshot(state, null);
    assert.equal(updated.stateHistory[0].stimulus, null);
  });
});

describe("summarizeTurnSemantic", () => {
  it("captures recurring identity and work themes instead of bare labels", () => {
    assert.equal(
      summarizeTurnSemantic("如果以后我只使用你，不理解你，这会不会慢慢改变你。").summary,
      "只被使用不被理解",
    );
    assert.equal(
      summarizeTurnSemantic("登录接口 500，先查日志还是先查数据库。").summary,
      "登录接口500排查",
    );
  });

  it("expands longer turns into 2-3 semantic points", () => {
    const result = summarizeTurnSemantic(
      "我们刚才在聊生物集体智能，重点是局部规则如何形成全局协同，以及阈值变化为什么会让系统突然转相。",
      "zh",
      { detail: "expanded" },
    );
    assert.ok(result.summary.length > 0);
    assert.ok((result.points?.length ?? 0) >= 2, `got ${JSON.stringify(result)}`);
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
    // v11: PSYCHE.md shows baseline dimensions
    assert.ok(md.includes("序") || md.includes("order"));
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

// ── compressSession ──────────────────────────────────────────

function makeSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    state: { order: 50, flow: 50, boundary: 50, resonance: 50 },
    stimulus: "casual",
    dominantEmotion: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeHistory(count: number, opts?: {
  stimuli?: (StateSnapshot["stimulus"])[];
  emotions?: (string | null)[];
  stateFn?: (i: number) => StateSnapshot["state"];
  semanticSummaries?: (string | undefined)[];
}): StateSnapshot[] {
  const base = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    state: opts?.stateFn
      ? opts.stateFn(i)
      : { order: 50 + i * 5, flow: 50 + i * 3, boundary: 50, resonance: 50 + i * 3 },
    stimulus: opts?.stimuli?.[i] ?? "casual" as StateSnapshot["stimulus"],
    dominantEmotion: opts?.emotions?.[i] ?? null,
    semanticSummary: opts?.semanticSummaries?.[i],
    semanticPoints: opts?.semanticSummaries?.[i] ? [opts.semanticSummaries[i]] : undefined,
    timestamp: new Date(base + i * 60000).toISOString(),
  }));
}

describe("compressSession", () => {
  it("returns state unchanged when history is empty", () => {
    const state = makeMinimalState({ stateHistory: [] });
    const result = compressSession(state);
    assert.deepStrictEqual(result, state);
  });

  it("returns state unchanged when history has 1 entry", () => {
    const state = makeMinimalState({ stateHistory: [makeSnapshot()] });
    const result = compressSession(state);
    assert.deepStrictEqual(result, state);
  });

  it("produces memory entry with date, stimuli, trajectory for 5 entries", () => {
    const history = makeHistory(5, {
      stimuli: ["praise", "praise", "praise", "casual", "casual"],
      emotions: ["平静", "愉悦兴奋", "愉悦兴奋", "深度满足", "深度满足"],
      semanticSummaries: ["被夸奖", "继续被夸奖", "被夸奖", "转回闲聊", "工作切换"],
    });
    const state = makeMinimalState({ stateHistory: history });
    const result = compressSession(state);

    const rel = result.relationships._default;
    assert.ok(rel.memory, "Should have memory array");
    assert.equal(rel.memory!.length, 1);

    const summary = rel.memory![0];
    assert.ok(summary.includes("5轮"), `Should contain turn count, got: ${summary}`);
    assert.ok(summary.includes("刺激["), `Should contain stimuli section, got: ${summary}`);
    assert.ok(summary.includes("话题["), `Should contain topic section, got: ${summary}`);
    assert.ok(summary.includes("praise×3"), `Should contain praise count, got: ${summary}`);
    assert.ok(summary.includes("casual×2"), `Should contain casual count, got: ${summary}`);
    assert.ok(summary.includes("弧线["), `Should contain emotion arc, got: ${summary}`);
    assert.ok(summary.includes("倾向["), `Should contain tendency, got: ${summary}`);
  });

  it("uses bullet-style semantic carry for longer sessions", () => {
    const history = makeHistory(7, {
      semanticSummaries: [
        "集体智能",
        "局部规则",
        "全局协同",
        "阈值变化",
        "相变条件",
        "实验设计",
        "验证路径",
      ],
    });
    const state = makeMinimalState({ stateHistory: history });
    const result = compressSession(state);
    const summary = result.relationships._default.memory![0];
    assert.ok(summary.includes("话题["), `Should contain topic section, got: ${summary}`);
    assert.ok(summary.includes("•"), `Expected expanded topic bullets, got: ${summary}`);
  });

  it("preserves latest snapshot for cross-session continuity", () => {
    const history = makeHistory(3);
    const state = makeMinimalState({ stateHistory: history });
    const result = compressSession(state);
    assert.equal(result.stateHistory.length, 1);
    assert.equal(result.stateHistory[0].timestamp, history[history.length - 1].timestamp);
  });

  it("respects MAX_RELATIONSHIP_MEMORY limit", () => {
    const existingMemory = Array.from({ length: MAX_RELATIONSHIP_MEMORY }, (_, i) => `old-entry-${i}`);
    const state = makeMinimalState({
      stateHistory: makeHistory(3),
      relationships: {
        _default: { ...DEFAULT_RELATIONSHIP, memory: existingMemory },
      },
    });
    const result = compressSession(state);
    const mem = result.relationships._default.memory!;
    assert.equal(mem.length, MAX_RELATIONSHIP_MEMORY, "Should not exceed MAX_RELATIONSHIP_MEMORY");
    // Oldest entry should be trimmed, newest should be the session summary
    assert.ok(!mem.includes("old-entry-0"), "Oldest entry should be trimmed");
    assert.ok(mem[mem.length - 1].includes("轮"), "Last entry should be the new session summary");
  });

  it("includes peak event in summary", () => {
    // Create history where turn 3 (index 2) has max deviation from baseline
    const history = makeHistory(5, {
      stimuli: ["casual", "casual", "praise", "casual", "casual"],
      emotions: [null, null, "愉悦兴奋", null, null],
      stateFn: (i) => i === 2
        ? { order: 95, flow: 90, boundary: 80, resonance: 80 }  // big deviation
        : { order: 50, flow: 50, boundary: 50, resonance: 50 },
    });
    const state = makeMinimalState({
      stateHistory: history,
      baseline: { order: 50, flow: 50, boundary: 50, resonance: 50 },
    });
    const result = compressSession(state);
    const summary = result.relationships._default.memory![0];
    assert.ok(summary.includes("高峰[第3轮:praise→愉悦兴奋]"), `Peak should be turn 3, got: ${summary}`);
  });

  it("uses per-user relationship when userId provided", () => {
    const history = makeHistory(3);
    const state = makeMinimalState({ stateHistory: history });
    const result = compressSession(state, "alice");
    assert.ok(result.relationships.alice, "Should have alice relationship");
    assert.ok(result.relationships.alice.memory!.length === 1, "alice should have 1 memory");
    // _default should be unchanged
    assert.equal(result.relationships._default.memory, undefined, "_default should have no memory");
  });

  it("produces English summary for en locale", () => {
    const history = makeHistory(4, {
      stimuli: ["praise", "intellectual", "praise", "casual"],
      emotions: ["excited joy", "focused flow", "excited joy", null],
    });
    const state = makeMinimalState({
      stateHistory: history,
      meta: { agentName: "TestAgent", createdAt: new Date().toISOString(), totalInteractions: 0, locale: "en", mode: "natural" as const },
    });
    const result = compressSession(state);
    const summary = result.relationships._default.memory![0];
    assert.ok(summary.includes("turns"), `Should use 'turns' for en, got: ${summary}`);
    assert.ok(summary.includes("stimuli["), `Should use 'stimuli' for en, got: ${summary}`);
    assert.ok(summary.includes("tendency["), `Should use 'tendency' for en, got: ${summary}`);
    assert.ok(summary.includes("peak["), `Should use 'peak' for en, got: ${summary}`);
  });
});
