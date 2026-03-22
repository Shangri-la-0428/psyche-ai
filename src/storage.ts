// ============================================================
// Storage Adapters — Persistence layer for PsycheEngine
//
// StorageAdapter: interface for any storage backend
// FileStorageAdapter: file-based with atomic writes + v1→v2 migration
// MemoryStorageAdapter: in-memory for testing/serverless
// ============================================================

import type { PsycheState } from "./types.js";
import { migrateToLatest } from "./psyche-file.js";
import { readFile, writeFile, access, rename, constants } from "node:fs/promises";
import { join } from "node:path";

// ── Interface ────────────────────────────────────────────────

export interface StorageAdapter {
  load(): Promise<PsycheState | null>;
  save(state: PsycheState): Promise<void>;
}

// ── MemoryStorageAdapter ─────────────────────────────────────

export class MemoryStorageAdapter implements StorageAdapter {
  private state: PsycheState | null = null;

  async load(): Promise<PsycheState | null> {
    return this.state;
  }

  async save(state: PsycheState): Promise<void> {
    this.state = state;
  }
}

// ── FileStorageAdapter ───────────────────────────────────────

export class FileStorageAdapter implements StorageAdapter {
  private readonly filePath: string;

  constructor(dir: string, filename = "psyche-state.json") {
    this.filePath = join(dir, filename);
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
    const tmpPath = this.filePath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

}
