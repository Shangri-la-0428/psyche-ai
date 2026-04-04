import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);
const ROOT = join(import.meta.dirname, "..", "..");

async function packTarball(packDir: string): Promise<string> {
  const { stdout } = await exec("npm", ["pack", "--quiet", "--pack-destination", packDir], {
    cwd: ROOT,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const tarball = stdout.trim().split("\n").filter(Boolean).at(-1);
  assert.ok(tarball, "npm pack did not return a tarball name");
  return join(packDir, tarball);
}

async function installTarball(appDir: string, tarballPath: string): Promise<void> {
  await exec("npm", ["init", "-y"], {
    cwd: appDir,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });
  await exec("npm", ["install", tarballPath], {
    cwd: appDir,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function firstJsonLine(stream: NodeJS.ReadableStream, timeoutMs: number, stderr: () => string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      cleanup();
      resolve(buffer.slice(0, newline).trim());
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for MCP initialize response; stderr=${stderr()}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("error", onError);
    };
    stream.on("data", onData);
    stream.on("error", onError);
  });
}

describe("package smoke", () => {
  it("packed tarball boots the MCP server and answers initialize", { timeout: 180000 }, async () => {
    const packDir = await mkdtemp(join(tmpdir(), "psyche-pack-"));
    const appDir = await mkdtemp(join(tmpdir(), "psyche-app-"));
    try {
      const tarballPath = await packTarball(packDir);
      await installTarball(appDir, tarballPath);

      const binName = process.platform === "win32" ? "psyche-ai.cmd" : "psyche-ai";
      const binPath = join(appDir, "node_modules", ".bin", binName);
      const child = spawn(binPath, ["mcp"], {
        cwd: appDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      const initialize = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "package-smoke", version: "1.0.0" },
        },
      });
      child.stdin.write(`${initialize}\n`);

      const line = await firstJsonLine(child.stdout, 15000, () => stderr);
      const response = JSON.parse(line);
      assert.equal(response.result?.serverInfo?.name, "psyche");
      assert.equal(response.result?.protocolVersion, "2024-11-05");
      assert.equal(child.exitCode, null, `MCP process exited early; stderr=${stderr}`);

      child.kill("SIGTERM");
    } finally {
      await rm(packDir, { recursive: true, force: true });
      await rm(appDir, { recursive: true, force: true });
    }
  });
});
