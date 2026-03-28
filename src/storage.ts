// ============================================================
// Storage Adapters — Persistence layer for PsycheEngine
//
// StorageAdapter: interface for any storage backend
// FileStorageAdapter: file-based with atomic writes + v1→v2 migration
// MemoryStorageAdapter: in-memory for testing/serverless
// ============================================================

import type { PsycheState } from "./types.js";
import { migrateToLatest } from "./psyche-file.js";
import { readFile, writeFile, appendFile, access, rename, constants, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

// ── Interface ────────────────────────────────────────────────

export interface StorageAdapter {
  load(): Promise<PsycheState | null>;
  save(state: PsycheState): Promise<void>;
  /** Append a line to the diagnostics log. Implementations may no-op. */
  appendLog?(line: string): Promise<void>;
  /** Read all lines from the diagnostics log. Returns empty array if not available. */
  readLog?(): Promise<string[]>;
}

// ── MemoryStorageAdapter ─────────────────────────────────────

export class MemoryStorageAdapter implements StorageAdapter {
  private state: PsycheState | null = null;
  private log: string[] = [];

  async load(): Promise<PsycheState | null> {
    return this.state;
  }

  async save(state: PsycheState): Promise<void> {
    this.state = state;
  }

  async appendLog(line: string): Promise<void> {
    this.log.push(line);
  }

  async readLog(): Promise<string[]> {
    return [...this.log];
  }
}

// ── FileStorageAdapter ───────────────────────────────────────

export class FileStorageAdapter implements StorageAdapter {
  private readonly filePath: string;
  private readonly logPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dir: string, filename = "psyche-state.json") {
    this.filePath = join(dir, filename);
    this.logPath = join(dir, "diagnostics.jsonl");
  }

  async load(): Promise<PsycheState | null> {
    try {
      await access(this.filePath, constants.R_OK);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") throw err;
      return null; // ENOENT — file doesn't exist
    }

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch {
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const ver = (parsed as { version?: number }).version;

    if (!ver || ver < 3) {
      return migrateToLatest(parsed);
    }

    return parsed as unknown as PsycheState;
  }

  async save(state: PsycheState): Promise<void> {
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
        await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
        await rename(tmpPath, this.filePath);
      });
    await this.writeChain;
  }

  async appendLog(line: string): Promise<void> {
    await appendFile(this.logPath, line + "\n", "utf-8");
  }

  async readLog(): Promise<string[]> {
    try {
      const content = await readFile(this.logPath, "utf-8");
      return content.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}
