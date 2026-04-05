import { spawn } from "node:child_process";
import type { AmbientPriorView, CurrentGoal } from "./types.js";
import { normalizeAmbientPriors } from "./ambient-priors.js";

const DEFAULT_AMBIENT_LIMIT = 3;
const DEFAULT_TIMEOUT_MS = 800;

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

export interface ThrongletsAmbientRuntimeOptions {
  binaryPath?: string;
  dataDir?: string;
  space?: string;
  goal?: CurrentGoal;
  limit?: number;
  timeoutMs?: number;
  runner?: CommandRunner;
}

export interface AmbientPriorResolutionOptions {
  explicit?: readonly AmbientPriorView[] | unknown;
  enabled?: boolean;
  thronglets?: ThrongletsAmbientRuntimeOptions;
  fetcher?: typeof fetchAmbientPriorsFromThronglets;
}

function parseAmbientPriorOutput(stdout: string): AmbientPriorView[] {
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout) as Record<string, unknown>;
  if (Array.isArray(parsed.priors)) {
    return normalizeAmbientPriors(parsed.priors);
  }
  const data = parsed.data;
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).priors)) {
    return normalizeAmbientPriors((data as Record<string, unknown>).priors);
  }
  return [];
}

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

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
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

export async function fetchAmbientPriorsFromThronglets(
  text: string,
  opts: ThrongletsAmbientRuntimeOptions = {},
): Promise<AmbientPriorView[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const binaryPath = opts.binaryPath ?? process.env.THRONGLETS_BIN ?? "thronglets";
  const dataDir = opts.dataDir ?? process.env.THRONGLETS_DATA_DIR;
  const space = opts.space ?? process.env.THRONGLETS_SPACE ?? "psyche";
  const goal = opts.goal;
  const limit = Math.max(1, Math.min(5, opts.limit ?? DEFAULT_AMBIENT_LIMIT));
  const timeoutMs = Math.max(100, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const runner = opts.runner ?? defaultRunner;

  const args: string[] = [];
  if (dataDir && dataDir.trim()) {
    args.push("--data-dir", dataDir.trim());
  }
  args.push("ambient-priors", "--json");

  const payload = JSON.stringify({ text: trimmed, space, goal, limit });
  try {
    const result = await runner(binaryPath, args, payload, timeoutMs);
    if (!result.ok) return [];
    return parseAmbientPriorOutput(result.stdout);
  } catch {
    return [];
  }
}

export function parseAmbientPriorsInput(value: unknown): AmbientPriorView[] | undefined {
  const priors = normalizeAmbientPriors(value);
  return priors.length > 0 ? priors : undefined;
}

export async function resolveAmbientPriorsForTurn(
  text: string,
  opts: AmbientPriorResolutionOptions = {},
): Promise<AmbientPriorView[] | undefined> {
  const explicit = parseAmbientPriorsInput(opts.explicit);
  if (explicit) return explicit;
  if (opts.enabled === false) return undefined;
  const fetcher = opts.fetcher ?? fetchAmbientPriorsFromThronglets;
  const priors = await fetcher(text, opts.thronglets);
  return priors.length > 0 ? priors : undefined;
}
