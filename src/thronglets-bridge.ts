// ============================================================
// Thronglets Bridge — constitutive write path
//
// Mirrors ambient-runtime.ts (read path) for symmetry.
// Any substrate using Psyche auto-emits to Thronglets.
// Fail-open, fire-and-forget, subprocess spawn.
// ============================================================

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ThrongletsExport } from "./types.js";

// ── Types ────────────────────────────────────────────────────

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

type CommandRunner = (
  binaryPath: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
) => Promise<CommandResult>;

export interface ThrongletsBridgeOptions {
  binaryPath?: string;
  dataDir?: string;
  space?: string;
  sessionId?: string;
  timeoutMs?: number;
  enabled?: boolean;
  runner?: CommandRunner;
}

// ── Default runner (mirrors ambient-runtime.ts) ──────────────

async function defaultRunner(
  binaryPath: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, stdout, stderr: stderr || "timeout" });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, stdout, stderr });
    });

    child.stdin.end(stdin);
  });
}

// ── Binary resolution ────────────────────────────────────────

const MANAGED_PATH = join(homedir(), ".thronglets", "bin", "thronglets-managed");

export function resolveThrongletsBinary(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env.THRONGLETS_BIN;
  if (fromEnv) return fromEnv;
  if (existsSync(MANAGED_PATH)) return MANAGED_PATH;
  return "thronglets";
}

// ── Bridge ───────────────────────────────────────────────────

export async function bridgeThrongletsExports(
  exports: ThrongletsExport[],
  opts: ThrongletsBridgeOptions = {},
): Promise<number> {
  if (exports.length === 0) return 0;
  if (opts.enabled === false) return 0;

  const binary = resolveThrongletsBinary(opts.binaryPath);
  const timeoutMs = opts.timeoutMs ?? 400;
  const runner = opts.runner ?? defaultRunner;

  const args: string[] = [];
  const dataDir = opts.dataDir ?? process.env.THRONGLETS_DATA_DIR;
  if (dataDir?.trim()) args.push("--data-dir", dataDir.trim());
  args.push("ingest", "--json");
  const space = opts.space ?? process.env.THRONGLETS_SPACE ?? "psyche";
  if (space) args.push("--space", space);
  if (opts.sessionId) args.push("--session", opts.sessionId);

  const stdin = JSON.stringify({ throngletsExports: exports });

  try {
    const result = await runner(binary, args, stdin, timeoutMs);
    if (!result.ok) return 0;
    try {
      const parsed = JSON.parse(result.stdout);
      return typeof parsed.ingested === "number" ? parsed.ingested : exports.length;
    } catch {
      return exports.length;
    }
  } catch {
    return 0;
  }
}
