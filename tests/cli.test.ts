import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);

const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");

async function run(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await exec("node", [CLI, ...args], { timeout: 10000 });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code ?? 1 };
  }
}

async function freshDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "psyche-cli-"));
}

// ── help ─────────────────────────────────────────────────────

describe("cli help", () => {
  it("shows usage on --help", async () => {
    const { stdout } = await run(["--help"]);
    assert.ok(stdout.includes("psyche"));
    assert.ok(stdout.includes("init"));
    assert.ok(stdout.includes("status"));
    assert.ok(stdout.includes("upgrade"));
    assert.ok(stdout.includes("probe"));
  });

  it("shows usage on no args", async () => {
    const { stdout } = await run([]);
    assert.ok(stdout.includes("Usage"));
  });
});

// ── probe ───────────────────────────────────────────────────

describe("cli probe", () => {
  it("returns machine-readable runtime proof", async () => {
    const { stdout } = await run(["probe", "--json"]);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.packageName, "psyche-ai");
    assert.equal(parsed.entry, "sdk");
    assert.equal(parsed.processInputCalled, true);
    assert.equal(parsed.processOutputCalled, true);
    assert.equal(parsed.canonicalHostSurface, true);
    assert.ok(typeof parsed.loadPath === "string" && parsed.loadPath.length > 0);
  });
});

// ── init ─────────────────────────────────────────────────────

describe("cli init", () => {
  it("initializes with defaults", async () => {
    const dir = await freshDir();
    const { stdout } = await run(["init", dir]);
    assert.ok(stdout.includes("Psyche initialized"));
    const stateRaw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const state = JSON.parse(stateRaw);
    assert.equal(state.version, 6);
    await rm(dir, { recursive: true });
  });

  it("initializes with --mbti and --name", async () => {
    const dir = await freshDir();
    const { stdout } = await run(["init", dir, "--mbti", "ENTP", "--name", "Spark"]);
    assert.ok(stdout.includes("Spark"));
    assert.ok(stdout.includes("ENTP"));
    await rm(dir, { recursive: true });
  });

  it("initializes with --lang en", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "ENFP", "--lang", "en"]);
    const stateRaw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const state = JSON.parse(stateRaw);
    assert.equal(state.meta.locale, "en");
    await rm(dir, { recursive: true });
  });

  it("rejects invalid MBTI", async () => {
    const dir = await freshDir();
    const { stderr, code } = await run(["init", dir, "--mbti", "XXXX"]);
    assert.ok(stderr.includes("invalid MBTI") || code !== 0);
    await rm(dir, { recursive: true });
  });

  it("creates PSYCHE.md", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "INFP", "--name", "Poet"]);
    const md = await readFile(join(dir, "PSYCHE.md"), "utf-8");
    assert.ok(md.includes("Poet"));
    assert.ok(md.includes("INFP"));
    await rm(dir, { recursive: true });
  });
});

// ── status ──────────────────────────────────────────────────

describe("cli status", () => {
  it("shows status for initialized workspace", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "INTJ", "--name", "Planner"]);
    const { stdout } = await run(["status", dir]);
    assert.ok(stdout.includes("Planner"));
    assert.ok(stdout.includes("INTJ"));
    await rm(dir, { recursive: true });
  });

  it("outputs JSON with --json", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "ISFJ"]);
    const { stdout } = await run(["status", dir, "--json"]);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.mbti, "ISFJ");
    assert.ok(parsed._derived);
    await rm(dir, { recursive: true });
  });

  it("shows agreement streak", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "ENFP"]);
    const { stdout } = await run(["status", dir]);
    assert.ok(stdout.includes("Agreement streak"));
    await rm(dir, { recursive: true });
  });
});

// ── inject ──────────────────────────────────────────────────

describe("cli inject", () => {
  it("outputs dynamic context", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "ENFJ", "--name", "Leader"]);
    const { stdout } = await run(["inject", dir]);
    assert.ok(stdout.includes("Leader"));
    assert.ok(stdout.includes("多巴胺") || stdout.includes("Dopamine"));
    await rm(dir, { recursive: true });
  });

  it("includes protocol with --protocol", async () => {
    const dir = await freshDir();
    await run(["init", dir]);
    const { stdout } = await run(["inject", dir, "--protocol"]);
    assert.ok(stdout.includes("心智协议") || stdout.includes("Protocol"));
    await rm(dir, { recursive: true });
  });

  it("outputs English with --lang en", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--lang", "en"]);
    const { stdout } = await run(["inject", dir, "--protocol", "--lang", "en"]);
    assert.ok(stdout.includes("Psyche Protocol"));
    await rm(dir, { recursive: true });
  });

  it("outputs JSON with --json", async () => {
    const dir = await freshDir();
    await run(["init", dir]);
    const { stdout } = await run(["inject", dir, "--json", "--protocol"]);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.dynamic);
    assert.ok(parsed.protocol);
    await rm(dir, { recursive: true });
  });
});

// ── update ──────────────────────────────────────────────────

describe("cli update", () => {
  it("updates chemistry values", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "ENFP"]);
    const { stdout } = await run(["update", dir, '{"DA":90,"CORT":15}']);
    assert.ok(stdout.includes("Chemistry updated"));
    const stateRaw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const state = JSON.parse(stateRaw);
    assert.ok(state.current.DA > 75); // was 75, moved toward 90 within maxDelta
    await rm(dir, { recursive: true });
  });

  it("rejects invalid chemical key", async () => {
    const dir = await freshDir();
    await run(["init", dir]);
    const { stderr, code } = await run(["update", dir, '{"INVALID":50}']);
    assert.ok(stderr.includes("unknown chemical key") || code !== 0);
    await rm(dir, { recursive: true });
  });
});

// ── profiles ────────────────────────────────────────────────

describe("cli profiles", () => {
  it("lists all 16 profiles", async () => {
    const { stdout } = await run(["profiles"]);
    assert.ok(stdout.includes("INTJ"));
    assert.ok(stdout.includes("ESFP"));
    assert.ok(stdout.includes("16 MBTI"));
  });

  it("shows single profile with --mbti", async () => {
    const { stdout } = await run(["profiles", "--mbti", "ENFP"]);
    assert.ok(stdout.includes("ENFP"));
    assert.ok(stdout.includes("Sensitivity"));
  });

  it("outputs JSON", async () => {
    const { stdout } = await run(["profiles", "--json"]);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.length, 16);
  });
});

// ── reset ───────────────────────────────────────────────────

describe("cli reset", () => {
  it("resets to baseline", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "INTJ"]);
    await run(["update", dir, '{"DA":90}']);
    await run(["reset", dir]);
    const stateRaw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const state = JSON.parse(stateRaw);
    assert.equal(state.current.DA, state.baseline.DA);
    assert.equal(state.agreementStreak, 0);
    await rm(dir, { recursive: true });
  });
});

// ── error handling ──────────────────────────────────────────

describe("cli error handling", () => {
  it("reports missing dir", async () => {
    const { stderr, code } = await run(["status"]);
    assert.ok(code !== 0 || stderr.includes("missing"));
  });

  it("reports unknown command", async () => {
    const { stderr, code } = await run(["nonexistent"]);
    assert.ok(code !== 0 || stderr.includes("unknown command"));
  });
});
