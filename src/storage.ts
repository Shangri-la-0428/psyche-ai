// ============================================================
// Storage Adapters — Persistence layer for PsycheEngine
//
// StorageAdapter: interface for any storage backend
// FileStorageAdapter: file-based with atomic writes + v1→v2 migration
// MemoryStorageAdapter: in-memory for testing/serverless
// ============================================================

import type {
  PsycheState, MBTIType, ChemicalState, RelationshipState,
  SelfModel, EmpathyEntry,
} from "./types.js";
import { DEFAULT_RELATIONSHIP } from "./types.js";
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

    // v1→v2 migration
    if ((parsed as { version?: number }).version === 1 || !parsed.version) {
      return this.migrateV1(parsed);
    }

    return parsed as unknown as PsycheState;
  }

  async save(state: PsycheState): Promise<void> {
    const tmpPath = this.filePath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  private migrateV1(v1: Record<string, unknown>): PsycheState {
    const oldRel = v1.relationship as RelationshipState | undefined;
    const meta = v1.meta as {
      agentName?: string; createdAt?: string; totalInteractions?: number;
    } | undefined;

    return {
      version: 2,
      mbti: (v1.mbti as MBTIType) ?? "INFJ",
      baseline: v1.baseline as ChemicalState,
      current: v1.current as ChemicalState,
      updatedAt: (v1.updatedAt as string) ?? new Date().toISOString(),
      relationships: {
        _default: oldRel ?? { ...DEFAULT_RELATIONSHIP },
      },
      empathyLog: (v1.empathyLog as EmpathyEntry | null) ?? null,
      selfModel: (v1.selfModel as SelfModel) ?? {
        values: [], preferences: [], boundaries: [], currentInterests: [],
      },
      emotionalHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      meta: {
        agentName: meta?.agentName ?? "agent",
        createdAt: meta?.createdAt ?? new Date().toISOString(),
        totalInteractions: meta?.totalInteractions ?? 0,
        locale: "zh",
      },
    };
  }
}
