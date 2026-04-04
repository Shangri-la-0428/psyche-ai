import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);

const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");

async function run(
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await exec("node", [CLI, ...args], {
      timeout: 10000,
      env: env ? { ...process.env, ...env } : process.env,
    });
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
    assert.ok(parsed.appraisal && typeof parsed.appraisal.taskFocus === "number");
    assert.equal(parsed.legacyStimulus, parsed.stimulus);
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
    assert.equal(state.version, 10);
    await rm(dir, { recursive: true });
  });

  it("initializes with --mbti and --name", async () => {
    const dir = await freshDir();
    const { stdout } = await run(["init", dir, "--mbti", "ENTP", "--name", "Spark"]);
    assert.ok(stdout.includes("Spark"));
    // v10: mbti not stored, just used as preset selector
    assert.ok(stdout.includes("Psyche initialized"));
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
    // v10: PSYCHE.md shows baseline chemistry, not MBTI label
    assert.ok(md.includes("多巴胺") || md.includes("flow"), "should include baseline chemistry info");
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
    // v10: status shows baseline-derived personality summary instead of MBTI
    assert.ok(stdout.includes("introvert") || stdout.includes("extrovert"));
    await rm(dir, { recursive: true });
  });

  it("outputs JSON with --json", async () => {
    const dir = await freshDir();
    await run(["init", dir, "--mbti", "ISFJ"]);
    const { stdout } = await run(["status", dir, "--json"]);
    const parsed = JSON.parse(stdout);
    // v10: mbti is no longer stored on new states
    assert.ok(parsed.baseline, "baseline should be present");
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
    assert.ok(stdout.includes("序") || stdout.includes("Order") || stdout.includes("流") || stdout.includes("Flow"));
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
    const { stdout } = await run(["update", dir, '{"flow":90,"boundary":15}']);
    assert.ok(stdout.includes("State updated"));
    const stateRaw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const state = JSON.parse(stateRaw);
    assert.ok(state.current.flow > 72); // was 72 (ENFP baseline), moved toward 90 within maxDelta
    await rm(dir, { recursive: true });
  });

  it("rejects invalid chemical key", async () => {
    const dir = await freshDir();
    await run(["init", dir]);
    const { stderr, code } = await run(["update", dir, '{"INVALID":50}']);
    assert.ok(stderr.includes("unknown dimension key") || stderr.includes("unknown chemical key") || code !== 0);
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
    await run(["update", dir, '{"flow":90}']);
    await run(["reset", dir]);
    const stateRaw = await readFile(join(dir, "psyche-state.json"), "utf-8");
    const state = JSON.parse(stateRaw);
    assert.equal(state.current.flow, state.baseline.flow);
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

describe("cli setup", () => {
  it("dry-run mentions Codex when ~/.codex exists", async () => {
    const home = await freshDir();
    const codexDir = join(home, ".codex");
    await mkdir(codexDir, { recursive: true });

    const { stdout } = await run(["setup", "--dry-run"], { HOME: home });

    assert.ok(stdout.includes("Codex"));
    assert.ok(stdout.includes("would configure"));
    await rm(home, { recursive: true, force: true });
  });

  it("writes Codex MCP config in TOML format", async () => {
    const home = await freshDir();
    const codexDir = join(home, ".codex");
    await mkdir(codexDir, { recursive: true });
    const configPath = join(codexDir, "config.toml");
    await writeFile(
      configPath,
      [
        'approval_policy = "never"',
        "",
        "[mcp_servers.thronglets]",
        'command = "/tmp/thronglets"',
      ].join("\n"),
      "utf-8",
    );

    const { stdout, code } = await run(["setup", "--name", "Luna", "--locale", "en"], {
      HOME: home,
    });

    assert.equal(code, 0, stdout);
    const config = await readFile(configPath, "utf-8");
    const expectedWorkspace = join(home, ".psyche-ai", "mcp");
    assert.ok(config.includes("[mcp_servers.thronglets]"));
    assert.ok(config.includes("[mcp_servers.psyche]"));
    assert.ok(config.includes('command = "npx"'));
    assert.ok(config.includes('"psyche-ai"'));
    assert.ok(config.includes("[mcp_servers.psyche.env]"));
    assert.ok(config.includes(`PSYCHE_WORKSPACE = "${expectedWorkspace}"`));
    assert.ok(config.includes('PSYCHE_NAME = "Luna"'));
    assert.ok(config.includes('PSYCHE_LOCALE = "en"'));
    await rm(home, { recursive: true, force: true });
  });

  it("preserves existing Codex Psyche MCP options when re-running setup", async () => {
    const home = await freshDir();
    const codexDir = join(home, ".codex");
    await mkdir(codexDir, { recursive: true });
    const configPath = join(codexDir, "config.toml");
    await writeFile(
      configPath,
      [
        'approval_policy = "never"',
        "",
        "[mcp_servers.psyche]",
        'command = "old-command"',
        'cwd = "/tmp/psyche"',
        'env_vars = ["EXTRA_FLAG"]',
        "",
        "[mcp_servers.psyche.env]",
        'KEEP_ME = "1"',
        'PSYCHE_LOCALE = "zh"',
      ].join("\n"),
      "utf-8",
    );

    const { stdout, code } = await run(["setup", "--name", "Luna", "--locale", "en"], {
      HOME: home,
    });

    assert.equal(code, 0, stdout);
    const config = await readFile(configPath, "utf-8");
    const expectedWorkspace = join(home, ".psyche-ai", "mcp");
    assert.ok(config.includes('[mcp_servers.psyche]'));
    assert.ok(config.includes('command = "npx"'));
    assert.ok(config.includes('cwd = "/tmp/psyche"'));
    assert.ok(config.includes('env_vars = ["EXTRA_FLAG"]'));
    assert.ok(config.includes('[mcp_servers.psyche.env]'));
    assert.ok(config.includes('KEEP_ME = "1"'));
    assert.ok(config.includes(`PSYCHE_WORKSPACE = "${expectedWorkspace}"`));
    assert.ok(config.includes('PSYCHE_NAME = "Luna"'));
    assert.ok(config.includes('PSYCHE_LOCALE = "en"'));
    assert.ok(!config.includes('PSYCHE_LOCALE = "zh"'));
    await rm(home, { recursive: true, force: true });
  });
});
