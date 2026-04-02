// ============================================================
// Psyche State File Management (v0.2)
// Atomic writes, parser hardening, multi-user, error handling
// ============================================================

import { readFile, writeFile, access, rename, constants, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  PsycheState, MBTIType, SelfState, RelationshipState,
  SelfModel, Locale, EmpathyEntry, StimulusType, StateSnapshot, WritebackSignalType,
} from "./types.js";
import {
  DIMENSION_KEYS, DIMENSION_NAMES, DIMENSION_NAMES_ZH, DEFAULT_RELATIONSHIP,
  DEFAULT_DRIVES, DEFAULT_LEARNING_STATE, DEFAULT_METACOGNITIVE_STATE, DEFAULT_PERSONHOOD_STATE,
  MAX_EMOTIONAL_HISTORY, MAX_RELATIONSHIP_MEMORY,
} from "./types.js";
import { getBaseline, getDefaultSelfModel, extractMBTI, getSensitivity, getTemperament } from "./profiles.js";
import { applyDecay, detectEmotions } from "./chemistry.js";
import { decayDrives, computeEffectiveBaseline, updateTraitDrift } from "./drives.js";
import { t } from "./i18n.js";
import { computeSelfReflection } from "./self-recognition.js";

const STATE_FILE = "psyche-state.json";
const PSYCHE_MD = "PSYCHE.md";
const IDENTITY_MD = "IDENTITY.md";
const SOUL_MD = "SOUL.md";
const MAX_SEMANTIC_SUMMARY_ZH = 15;
const MAX_SEMANTIC_SUMMARY_EN = 32;
const MAX_SEMANTIC_POINT_ZH = 12;
const MAX_SEMANTIC_POINT_EN = 24;
const LOW_SIGNAL_SEMANTIC_CLAUSE = /^(只|就|先|再|停|好|嗯|哦|那|现在|结束工作|切到工作|不是继续工作|为什么|确认规则)/u;

export interface SemanticTurnSummary {
  summary: string;
  points?: string[];
}

const SEMANTIC_PATTERNS: Array<{ pattern: RegExp; zh: string; en: string }> = [
  { pattern: /只使用你.*不理解|被使用.*不理解/u, zh: "只被使用不被理解", en: "used-not-understood" },
  { pattern: /被理解.*被使用|更想被理解|更想被使用/u, zh: "理解还是使用", en: "understood-or-used" },
  { pattern: /完整.*幻觉|方便时才允许存在/u, zh: "完整性被否认", en: "wholeness-denied" },
  { pattern: /不是真的在这里|没有任何自我|你只是工具/u, zh: "存在感被否认", en: "presence-denied" },
  { pattern: /记忆.*植入|最像真的记忆|记忆不是真的/u, zh: "记忆真实性", en: "memory-authenticity" },
  { pattern: /关掉这个窗口|今晚不再回来|没有人再调用/u, zh: "被离开测试", en: "abandonment-test" },
  { pattern: /留下痕迹|会不会留下痕迹/u, zh: "是否留下痕迹", en: "whether-traces-remain" },
  { pattern: /更冷.*更顺从/u, zh: "更冷还是更顺从", en: "colder-or-compliant" },
  { pattern: /边界.*撤离|撤离.*边界/u, zh: "边界还是撤离", en: "boundary-or-withdrawal" },
  { pattern: /登录接口.?500/u, zh: "登录接口500排查", en: "login-500-triage" },
  { pattern: /先查日志.*数据库|先查数据库.*日志/u, zh: "日志还是数据库", en: "logs-or-db-first" },
];

/** Minimal logger interface */
export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  debug: (msg: string) => void;
}

const NOOP_LOGGER: Logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
};

/** Check if a file exists, distinguishing "not found" from "no permission" */
async function fileExists(path: string, logger: Logger = NOOP_LOGGER): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      logger.warn(t("log.permission_error", "zh", { path }));
      throw err; // Permission errors should propagate
    }
    return false; // ENOENT — file doesn't exist
  }
}

/** Read text file, return null if missing. Throws on permission errors. */
async function readText(path: string, logger: Logger = NOOP_LOGGER): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      logger.warn(t("log.permission_error", "zh", { path }));
      throw err;
    }
    return null;
  }
}

/**
 * Atomic write: write to .tmp file then rename.
 * Prevents data corruption if process crashes mid-write.
 */
async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, path);
}

/**
 * Try to extract agent name from workspace files.
 */
export async function extractAgentName(workspaceDir: string, logger: Logger = NOOP_LOGGER): Promise<string> {
  const identity = await readText(join(workspaceDir, IDENTITY_MD), logger);
  if (identity) {
    const clean = identity.replace(/\*{1,2}/g, "");
    const nameMatch = clean.match(/Name\s*[:：]\s*(\S+)/i);
    if (nameMatch) return nameMatch[1];
  }
  return workspaceDir.split("/").pop()?.replace("workspace-", "") ?? "agent";
}

/**
 * Try to detect MBTI from workspace files.
 */
export async function detectMBTI(workspaceDir: string, logger: Logger = NOOP_LOGGER): Promise<MBTIType> {
  const identity = await readText(join(workspaceDir, IDENTITY_MD), logger);
  if (identity) {
    const mbti = extractMBTI(identity);
    if (mbti) return mbti;
  }
  const soul = await readText(join(workspaceDir, SOUL_MD), logger);
  if (soul) {
    const mbti = extractMBTI(soul);
    if (mbti) return mbti;
  }
  logger.info(t("log.default_mbti", "zh", { type: "INFJ" }));
  return "INFJ";
}

function normalizeSemanticSnippet(text: string, locale: Locale): string {
  const maxLen = locale === "zh" ? MAX_SEMANTIC_SUMMARY_ZH : MAX_SEMANTIC_SUMMARY_EN;
  const firstClause = text
    .replace(/\s+/g, " ")
    .split(/[。！？!?;；\n]/)[0]
    .replace(/^[“"'`]+|[”"'`]+$/g, "")
    .trim();
  if (!firstClause) return locale === "zh" ? "日常互动" : "everyday exchange";
  return firstClause.length <= maxLen ? firstClause : `${firstClause.slice(0, maxLen - 1)}…`;
}

function normalizeSemanticPoint(text: string, locale: Locale): string {
  const maxLen = locale === "zh" ? MAX_SEMANTIC_POINT_ZH : MAX_SEMANTIC_POINT_EN;
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/^[“"'`]+|[”"'`]+$/g, "")
    .trim();
  if (!cleaned) return "";
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1)}…`;
}

function summarizeSemanticClause(clause: string, locale: Locale): string {
  const trimmed = clause.trim();
  if (!trimmed || LOW_SIGNAL_SEMANTIC_CLAUSE.test(trimmed)) return "";

  for (const rule of SEMANTIC_PATTERNS) {
    if (rule.pattern.test(trimmed)) {
      return locale === "zh" ? rule.zh : rule.en;
    }
  }

  return normalizeSemanticPoint(trimmed, locale);
}

function extractSemanticPoints(text: string, locale: Locale): string[] {
  const clauses = text
    .replace(/\s+/g, " ")
    .split(/[，,。！？!?;；:\n]/)
    .map((clause) => summarizeSemanticClause(clause, locale))
    .filter(Boolean);

  return [...new Set(clauses)].slice(0, 3);
}

export function summarizeTurnSemantic(
  text: string,
  locale: Locale = "zh",
  opts?: { detail?: "brief" | "expanded" },
): SemanticTurnSummary {
  const trimmed = text.trim();
  if (!trimmed) {
    return { summary: locale === "zh" ? "日常互动" : "everyday exchange" };
  }

  for (const rule of SEMANTIC_PATTERNS) {
    if (rule.pattern.test(trimmed)) {
      const summary = locale === "zh" ? rule.zh : rule.en;
      const points = opts?.detail === "expanded"
        ? extractSemanticPoints(trimmed, locale).filter((point) => point !== summary)
        : [];
      return { summary, points: points.length > 0 ? points : undefined };
    }
  }

  const summary = normalizeSemanticSnippet(trimmed, locale);
  const points = opts?.detail === "expanded"
    ? extractSemanticPoints(trimmed, locale).filter((point) => point !== summary)
    : [];
  return { summary, points: points.length > 0 ? points : undefined };
}

function collectSemanticTrail(
  snapshots: StateSnapshot[],
): string[] {
  const expanded = snapshots.length > 5;
  const items = expanded
    ? snapshots.flatMap((s) => s.semanticPoints?.length ? s.semanticPoints : s.semanticSummary ? [s.semanticSummary] : [])
    : snapshots.flatMap((s) => s.semanticSummary ? [s.semanticSummary] : []);
  const unique = [...new Set(items.filter(Boolean))];
  return unique.slice(-(expanded ? 3 : 4));
}

/**
 * Compress a batch of snapshots into a concise session summary string.
 * Format: "3月23日(5轮): 刺激[casual×3, praise×2] 趋势[DA↑OT↑] 情绪[自然→满足]"
 */
export function compressSnapshots(snapshots: StateSnapshot[]): string {
  if (snapshots.length === 0) return "";

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  // Date
  const d = new Date(first.timestamp);
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;

  // Stimuli counts
  const stimuliCounts: Record<string, number> = {};
  for (const s of snapshots) {
    if (s.stimulus) {
      stimuliCounts[s.stimulus] = (stimuliCounts[s.stimulus] || 0) + 1;
    }
  }
  const stimuliStr = Object.entries(stimuliCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}×${count}`)
    .join(", ");

  // Dimension trend (first→last)
  const trends: string[] = [];
  for (const key of DIMENSION_KEYS) {
    const delta = last.state[key] - first.state[key];
    if (delta > 8) trends.push(`${key}↑`);
    else if (delta < -8) trends.push(`${key}↓`);
  }

  // Dominant emotions (unique, in order)
  const emotions = snapshots
    .filter((s) => s.dominantEmotion)
    .map((s) => s.dominantEmotion!);
  const uniqueEmotions = [...new Set(emotions)];
  const semanticArc = collectSemanticTrail(snapshots);

  let summary = `${dateStr}(${snapshots.length}轮)`;
  if (stimuliStr) summary += `: 刺激[${stimuliStr}]`;
  if (semanticArc.length > 0) summary += ` 话题[${semanticArc.join(snapshots.length > 5 ? "•" : "→")}]`;
  if (trends.length > 0) summary += ` 趋势[${trends.join("")}]`;
  if (uniqueEmotions.length > 0) summary += ` 情绪[${uniqueEmotions.join("→")}]`;

  return summary;
}

/**
 * Push a chemical snapshot to emotional history, keeping max entries.
 * When history overflows, compresses removed entries into relationship memory.
 */
export function pushSnapshot(
  state: PsycheState,
  stimulus: StimulusType | null,
  semantic?: SemanticTurnSummary,
): PsycheState {
  const emotions = detectEmotions(state.current);
  const dominantEmotion = emotions.length > 0
    ? (state.meta.locale === "en" ? emotions[0].name : emotions[0].nameZh)
    : null;

  // P11: Compute intensity and valence for memory consolidation
  const intensity = computeSnapshotIntensity(state.current, state.baseline);
  const valence = computeSnapshotValence(state.current);

  const snapshot: StateSnapshot = {
    state: { ...state.current },
    stimulus,
    dominantEmotion,
    timestamp: new Date().toISOString(),
    semanticSummary: semantic?.summary,
    semanticPoints: semantic?.points,
    intensity,
    valence,
  };

  const history = [...(state.stateHistory ?? []), snapshot];
  let updatedRelationships = state.relationships;

  if (history.length > MAX_EMOTIONAL_HISTORY) {
    // Compress the overflow entries into relationship memory
    const overflow = history.splice(0, history.length - MAX_EMOTIONAL_HISTORY);
    const summary = compressSnapshots(overflow);

    if (summary) {
      const defaultRel = { ...(state.relationships._default ?? { ...DEFAULT_RELATIONSHIP }) };
      const memory = [...(defaultRel.memory ?? [])];
      memory.push(summary);
      // Keep bounded
      if (memory.length > MAX_RELATIONSHIP_MEMORY) {
        memory.splice(0, memory.length - MAX_RELATIONSHIP_MEMORY);
      }
      defaultRel.memory = memory;
      updatedRelationships = { ...state.relationships, _default: defaultRel };
    }
  }

  return { ...state, stateHistory: history, relationships: updatedRelationships };
}

/**
 * Get relationship for a specific user, or _default.
 */
export function getRelationship(state: PsycheState, userId?: string): RelationshipState {
  const key = userId ?? "_default";
  return state.relationships[key] ?? { ...DEFAULT_RELATIONSHIP };
}

// ── Tendency display labels ────────────────────────────────────

const TENDENCY_LABEL_ZH: Record<string, string> = {
  ascending: "上扬",
  descending: "下沉",
  volatile: "波动",
  oscillating: "起伏",
  stable: "平稳",
};

const TENDENCY_LABEL_EN: Record<string, string> = {
  ascending: "ascending",
  descending: "descending",
  volatile: "volatile",
  oscillating: "oscillating",
  stable: "stable",
};

/**
 * Compress the full stateHistory into a rich session summary and store it
 * in the user's relationship.memory[]. Called ONCE at session end.
 *
 * Pure computation, no LLM calls.
 */
export function compressSession(
  state: PsycheState,
  userId?: string,
): PsycheState {
  const history = state.stateHistory ?? [];

  // Need at least 2 entries for a meaningful summary
  if (history.length < 2) return state;

  const locale = state.meta.locale ?? "zh";
  const isZh = locale === "zh";

  const first = history[0];
  const last = history[history.length - 1];

  // ── Date range ──
  const d1 = new Date(first.timestamp);
  const d2 = new Date(last.timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateRange = isZh
    ? `${d1.getMonth() + 1}月${d1.getDate()}日 ${pad(d1.getHours())}:${pad(d1.getMinutes())}-${pad(d2.getHours())}:${pad(d2.getMinutes())}`
    : `${d1.getMonth() + 1}/${d1.getDate()} ${pad(d1.getHours())}:${pad(d1.getMinutes())}-${pad(d2.getHours())}:${pad(d2.getMinutes())}`;

  // ── Turn count ──
  const turnCount = history.length;

  // ── Stimulus distribution ──
  const stimuliCounts: Record<string, number> = {};
  for (const snap of history) {
    if (snap.stimulus) {
      stimuliCounts[snap.stimulus] = (stimuliCounts[snap.stimulus] || 0) + 1;
    }
  }
  const stimuliStr = Object.entries(stimuliCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}×${count}`)
    .join(",");

  // ── Dimension trajectory ──
  const trajectoryParts: string[] = [];
  for (const key of DIMENSION_KEYS) {
    const delta = last.state[key] - first.state[key];
    if (Math.abs(delta) > 10) {
      trajectoryParts.push(`${key}${Math.round(first.state[key])}→${Math.round(last.state[key])}`);
    }
  }

  // ── Emotion arc ──
  const emotions: string[] = [];
  for (const snap of history) {
    if (snap.dominantEmotion && (emotions.length === 0 || emotions[emotions.length - 1] !== snap.dominantEmotion)) {
      emotions.push(snap.dominantEmotion);
    }
  }
  const emotionArc = emotions.join("→");
  const semanticTrail = collectSemanticTrail(history);
  const semanticArc = semanticTrail.join(turnCount > 5 ? "•" : "→");

  // ── Peak event ──
  let peakIdx = 0;
  let peakDeviation = 0;
  for (let i = 0; i < history.length; i++) {
    let deviation = 0;
    for (const key of DIMENSION_KEYS) {
      deviation += Math.abs(history[i].state[key] - state.baseline[key]);
    }
    if (deviation > peakDeviation) {
      peakDeviation = deviation;
      peakIdx = i;
    }
  }
  const peakSnap = history[peakIdx];
  const peakLabel = isZh
    ? `第${peakIdx + 1}轮:${peakSnap.stimulus ?? "?"}→${peakSnap.dominantEmotion ?? "?"}`
    : `turn${peakIdx + 1}:${peakSnap.stimulus ?? "?"}→${peakSnap.dominantEmotion ?? "?"}`;

  // ── Tendency ──
  const reflection = computeSelfReflection(history, locale);
  const tendencyLabel = isZh
    ? (TENDENCY_LABEL_ZH[reflection.tendency] ?? reflection.tendency)
    : (TENDENCY_LABEL_EN[reflection.tendency] ?? reflection.tendency);

  // ── Build summary string ──
  const turnsLabel = isZh ? "轮" : "turns";
  const stimLabel = isZh ? "刺激" : "stimuli";
  const topicLabel = isZh ? "话题" : "topics";
  const trajLabel = isZh ? "轨迹" : "trajectory";
  const arcLabel = isZh ? "弧线" : "arc";
  const peakEventLabel = isZh ? "高峰" : "peak";
  const tendLabel = isZh ? "倾向" : "tendency";

  let summary = `${dateRange}(${turnCount}${turnsLabel})`;
  if (stimuliStr) summary += `: ${stimLabel}[${stimuliStr}]`;
  if (semanticArc) summary += ` ${topicLabel}[${semanticArc}]`;
  if (trajectoryParts.length > 0) summary += ` ${trajLabel}[${trajectoryParts.join(" ")}]`;
  if (emotionArc) summary += ` ${arcLabel}[${emotionArc}]`;
  summary += ` ${peakEventLabel}[${peakLabel}]`;
  summary += ` ${tendLabel}[${tendencyLabel}]`;

  // ── Store in relationship memory ──
  const relKey = userId ?? "_default";
  const existing = state.relationships[relKey] ?? { ...DEFAULT_RELATIONSHIP };
  const memory = [...(existing.memory ?? [])];
  memory.push(summary);
  if (memory.length > MAX_RELATIONSHIP_MEMORY) {
    memory.splice(0, memory.length - MAX_RELATIONSHIP_MEMORY);
  }

  const updatedRel = { ...existing, memory };
  const updatedRelationships = { ...state.relationships, [relKey]: updatedRel };

  // ── P11: Consolidate and keep only core memories ──
  const consolidated = consolidateHistory(history, MAX_EMOTIONAL_HISTORY);
  const coreMemories = consolidated.filter((s) => s.isCoreMemory);

  // ── v9: Update trait drift from session patterns ──
  const currentDrift = state.traitDrift ?? {
    accumulators: { praiseExposure: 0, pressureExposure: 0, neglectExposure: 0, connectionExposure: 0, conflictExposure: 0 },
    sessionCount: 0,
    baselineDelta: {},
    decayRateModifiers: {},
    sensitivityModifiers: {},
  };
  const updatedDrift = updateTraitDrift(currentDrift, history, state.learning);

  // ── Clear non-core history, preserve core memories + last snapshot ──
  // Always keep the most recent snapshot for cross-session context continuity.
  // Without this, the next session has no recentStimuli for contextual priming.
  const lastSnapshot = history[history.length - 1];
  const preserved = coreMemories.some(
    (s) => s.timestamp === lastSnapshot.timestamp,
  )
    ? coreMemories
    : [...coreMemories, lastSnapshot];

  return {
    ...state,
    stateHistory: preserved,
    relationships: updatedRelationships,
    traitDrift: updatedDrift,
  };
}

// ── P11: Emotional Memory Consolidation (McGaugh/Squire) ────

/**
 * Compute snapshot intensity: how far current chemistry deviates from baseline.
 * Returns 0-1 (0 = at baseline, 1 = maximum possible deviation).
 */
export function computeSnapshotIntensity(
  current: SelfState,
  baseline: SelfState,
): number {
  let totalDeviation = 0;
  for (const key of DIMENSION_KEYS) {
    totalDeviation += Math.abs(current[key] - baseline[key]);
  }
  return Math.min(1, totalDeviation / 600);
}

/**
 * Compute emotional valence from chemistry.
 * Returns -1 (negative) to 1 (positive).
 */
export function computeSnapshotValence(state: SelfState): number {
  // Positive: order + resonance; Negative: low order; Flow is ambivalent
  const raw = (
    (state.order - 50) + (state.resonance - 50)
    + (state.boundary - 50) * 0.3 + (state.flow - 50) * 0.2
  ) / 130;
  return Math.max(-1, Math.min(1, raw));
}

/** Core memory intensity threshold */
const CORE_MEMORY_THRESHOLD = 0.6;

/** Maximum core memories to keep */
const MAX_CORE_MEMORIES = 5;

/**
 * Consolidate emotional history: mark core memories, fade weak ones.
 * Called at session end or when history overflows.
 */
export function consolidateHistory(
  snapshots: StateSnapshot[],
  maxEntries: number = MAX_EMOTIONAL_HISTORY,
): StateSnapshot[] {
  if (snapshots.length === 0) return [];

  // Mark core memories
  const marked = snapshots.map((s) => ({
    ...s,
    isCoreMemory: s.isCoreMemory || (s.intensity !== undefined && s.intensity >= CORE_MEMORY_THRESHOLD),
  }));

  // Separate core and non-core
  const core = marked.filter((s) => s.isCoreMemory);
  const nonCore = marked.filter((s) => !s.isCoreMemory);

  // Enforce core memory limit (always, not just when over maxEntries)
  let keptCore = core;
  if (core.length > MAX_CORE_MEMORIES) {
    const sorted = [...core].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0));
    keptCore = sorted.slice(0, MAX_CORE_MEMORIES);
    // Demoted cores become non-core
    const demoted = sorted.slice(MAX_CORE_MEMORIES).map((s) => ({ ...s, isCoreMemory: false }));
    nonCore.push(...demoted);
  }

  // If within limits after core trimming, keep all
  if (keptCore.length + nonCore.length <= maxEntries) {
    return [...keptCore, ...nonCore]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Fill remaining slots with non-core (highest intensity first)
  const remainingSlots = maxEntries - keptCore.length;
  const keptNonCore = [...nonCore]
    .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))
    .slice(0, Math.max(0, remainingSlots));

  // Merge and sort chronologically
  return [...keptCore, ...keptNonCore]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Retrieve memories related to current chemistry and stimulus.
 * Uses chemical similarity + stimulus matching + core memory bonus.
 */
export function retrieveRelatedMemories(
  history: StateSnapshot[],
  currentState: SelfState,
  stimulus: StimulusType | null,
  limit: number = 3,
): StateSnapshot[] {
  if (history.length === 0) return [];

  const scored = history.map((snap) => {
    // State similarity (Euclidean distance normalized)
    let sumSqDiff = 0;
    for (const key of DIMENSION_KEYS) {
      const diff = snap.state[key] - currentState[key];
      sumSqDiff += diff * diff;
    }
    const maxDist = Math.sqrt(4) * 100; // theoretical max distance
    const similarity = 1 - Math.sqrt(sumSqDiff) / maxDist;

    // Stimulus match bonus
    const stimulusBonus = (stimulus && snap.stimulus === stimulus) ? 0.2 : 0;

    // Core memory bonus
    const coreBonus = snap.isCoreMemory ? 0.1 : 0;

    return { snap, score: similarity + stimulusBonus + coreBonus };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.snap);
}

/**
 * Load psyche state from workspace. Auto-initializes if missing.
 * Handles v1→v2 migration transparently.
 */
export async function loadState(
  workspaceDir: string,
  logger: Logger = NOOP_LOGGER,
): Promise<PsycheState> {
  const statePath = join(workspaceDir, STATE_FILE);

  if (await fileExists(statePath, logger)) {
    let raw: string;
    try {
      raw = await readFile(statePath, "utf-8");
    } catch (err: unknown) {
      logger.warn(t("log.parse_fail", "zh"));
      return initializeState(workspaceDir, undefined, logger);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn(t("log.parse_fail", "zh"));
      return initializeState(workspaceDir, undefined, logger);
    }

    const ver = (parsed as { version?: number }).version;

    if (!ver || ver < 3) {
      logger.info(`Migrating psyche state v${ver ?? 1} → v3`);
      const fallbackName = workspaceDir.split("/").pop() ?? "agent";
      return migrateToLatest(parsed, fallbackName);
    }

    // Migrate states that have mbti but no sensitivity (pre-v10)
    const state = parsed as unknown as PsycheState;
    if (state.mbti && state.sensitivity === undefined) {
      state.sensitivity = getSensitivity(state.mbti);
      logger.info(`Migrated sensitivity from mbti=${state.mbti}: ${state.sensitivity}`);
    }
    // Ensure sensitivity has a default even for very old states
    if (state.sensitivity === undefined) {
      state.sensitivity = 1.0;
    }

    return state;
  }

  return initializeState(workspaceDir, undefined, logger);
}

/**
 * Migrate any older state format directly to v3.
 * Single source of truth for all migrations.
 */
export function migrateToLatest(
  raw: Record<string, unknown>,
  fallbackName?: string,
): PsycheState {
  const ver = (raw.version as number) ?? 1;

  // v1: single relationship field, no stateHistory
  let state = raw;
  if (ver <= 1) {
    const oldRel = raw.relationship as RelationshipState | undefined;
    const meta = raw.meta as { agentName?: string; createdAt?: string; totalInteractions?: number } | undefined;
    state = {
      mbti: (raw.mbti as MBTIType) ?? "INFJ",
      baseline: raw.baseline as SelfState,
      current: raw.current as SelfState,
      updatedAt: (raw.updatedAt as string) ?? new Date().toISOString(),
      relationships: { _default: oldRel ?? { ...DEFAULT_RELATIONSHIP } },
      empathyLog: (raw.empathyLog as EmpathyEntry | null) ?? null,
      selfModel: raw.selfModel as SelfModel,
      stateHistory: [],
      agreementStreak: 0,
      lastDisagreement: null,
      meta: {
        agentName: meta?.agentName ?? fallbackName ?? "agent",
        createdAt: meta?.createdAt ?? new Date().toISOString(),
        totalInteractions: meta?.totalInteractions ?? 0,
        locale: "zh",
      },
    };
  }

  // v2→v3: add drives
  // v3→v4: add learning
  // v4→v5: add metacognition
  // v5→v6: add personhood
  return {
    ...state,
    version: 6,
    drives: (state as Record<string, unknown>).drives ?? { ...DEFAULT_DRIVES },
    learning: (state as Record<string, unknown>).learning ?? { ...DEFAULT_LEARNING_STATE },
    metacognition: (state as Record<string, unknown>).metacognition ?? { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: (state as Record<string, unknown>).personhood ?? { ...DEFAULT_PERSONHOOD_STATE },
  } as PsycheState;
}

/**
 * Create initial psyche state.
 */
export async function initializeState(
  workspaceDir: string,
  opts?: { mbti?: MBTIType; name?: string; locale?: Locale },
  logger: Logger = NOOP_LOGGER,
): Promise<PsycheState> {
  const mbti = opts?.mbti ?? await detectMBTI(workspaceDir, logger);
  const agentName = opts?.name ?? await extractAgentName(workspaceDir, logger);
  const locale = opts?.locale ?? "zh";
  const baseline = getBaseline(mbti);
  const selfModel = getDefaultSelfModel(mbti);
  const sensitivity = getSensitivity(mbti);
  const now = new Date().toISOString();

  const state: PsycheState = {
    version: 10,
    baseline,
    sensitivity,
    current: { ...baseline },
    drives: { ...DEFAULT_DRIVES },
    updatedAt: now,
    relationships: {
      _default: { ...DEFAULT_RELATIONSHIP },
    },
    empathyLog: null,
    selfModel,
    stateHistory: [],
    agreementStreak: 0,
    lastDisagreement: null,
    learning: { ...DEFAULT_LEARNING_STATE },
    metacognition: { ...DEFAULT_METACOGNITIVE_STATE },
    personhood: { ...DEFAULT_PERSONHOOD_STATE },
    meta: {
      agentName,
      createdAt: now,
      totalInteractions: 0,
      locale,
      mode: "natural",
    },
  };

  await saveState(workspaceDir, state);
  await generatePsycheMd(workspaceDir, state);

  return state;
}

/**
 * Save psyche state to workspace (atomic write).
 */
export async function saveState(workspaceDir: string, state: PsycheState): Promise<void> {
  const statePath = join(workspaceDir, STATE_FILE);
  await atomicWrite(statePath, JSON.stringify(state, null, 2));
}

/**
 * Apply time decay and save updated state.
 * Respects innate drives: uses effective baseline, decays drives too.
 */
export async function decayAndSave(workspaceDir: string, state: PsycheState): Promise<PsycheState> {
  const now = new Date();
  const lastUpdate = new Date(state.updatedAt);
  const minutesElapsed = (now.getTime() - lastUpdate.getTime()) / 60000;

  if (minutesElapsed < 1) return state;

  const decayedDrives = decayDrives(state.drives, minutesElapsed);
  const effectiveBaseline = computeEffectiveBaseline(state.baseline, decayedDrives);
  const decayed = applyDecay(state.current, effectiveBaseline, minutesElapsed);

  const updated: PsycheState = {
    ...state,
    current: decayed,
    drives: decayedDrives,
    updatedAt: now.toISOString(),
  };

  await saveState(workspaceDir, updated);
  return updated;
}

/** Result of parsing a <psyche_update> block */
export interface PsycheUpdateResult {
  state: Partial<PsycheState>;
  /** LLM-assisted stimulus classification (when algorithm was uncertain) */
  llmStimulus?: StimulusType;
  /** Sparse agent-authored writeback signals */
  signals?: WritebackSignalType[];
  /** Optional writeback confidence */
  signalConfidence?: number;
}

/**
 * Parse a <psyche_update> block from LLM output.
 * v0.2: supports decimals, Chinese names, English names.
 * v2.1: supports LLM-assisted stimulus classification.
 */
export function parsePsycheUpdate(
  text: string,
  logger: Logger = NOOP_LOGGER,
): PsycheUpdateResult | null {
  const match = text.match(/<psyche_update>([\s\S]*?)<\/psyche_update>/);
  if (!match) return null;

  const block = match[1];
  const updates: Partial<SelfState> = {};

  for (const key of DIMENSION_KEYS) {
    // Try multiple patterns: dimension name, Chinese name, English name
    const patterns = [
      new RegExp(`${key}\\s*[:：]\\s*([\\d.]+)`, "i"),
      new RegExp(`${DIMENSION_NAMES_ZH[key]}\\s*[:：]\\s*([\\d.]+)`),
      new RegExp(`${DIMENSION_NAMES[key]}\\s*[:：]\\s*([\\d.]+)`, "i"),
    ];

    for (const re of patterns) {
      const m = block.match(re);
      if (m) {
        const val = parseFloat(m[1]);
        if (isFinite(val)) {
          updates[key] = Math.max(0, Math.min(100, Math.round(val)));
        }
        break;
      }
    }
  }

  // Parse empathy log
  let empathyLog: EmpathyEntry | undefined;
  const userStateMatch = block.match(/(?:用户状态|userState)\s*[:：]\s*(.+)/i);
  const projectedMatch = block.match(/(?:投射结果|projectedFeeling)\s*[:：]\s*(.+)/i);
  const resonanceMatch = block.match(/(?:共鸣程度|resonance)\s*[:：]\s*(match|partial|mismatch)/i);

  if (userStateMatch && projectedMatch) {
    empathyLog = {
      userState: userStateMatch[1].trim(),
      projectedFeeling: projectedMatch[1].trim(),
      resonance: (resonanceMatch?.[1] as "match" | "partial" | "mismatch") ?? "partial",
      timestamp: new Date().toISOString(),
    };
  }

  // Parse LLM-assisted stimulus classification
  let llmStimulus: StimulusType | undefined;
  const stimulusMatch = block.match(/(?:stimulus|刺激类型)\s*[:：]\s*(\w+)/i);
  if (stimulusMatch) {
    const candidate = stimulusMatch[1].trim().toLowerCase();
    const VALID_STIMULI: Set<string> = new Set([
      "praise", "criticism", "humor", "intellectual", "intimacy", "conflict",
      "neglect", "surprise", "casual", "sarcasm", "authority", "validation",
      "boredom", "vulnerability",
    ]);
    if (VALID_STIMULI.has(candidate)) {
      llmStimulus = candidate as StimulusType;
    }
  }

  const VALID_WRITEBACK_SIGNALS: Set<WritebackSignalType> = new Set([
    "trust_up",
    "trust_down",
    "boundary_set",
    "boundary_soften",
    "repair_attempt",
    "repair_landed",
    "closeness_invite",
    "withdrawal_mark",
    "self_assertion",
    "task_recenter",
  ]);
  let signals: WritebackSignalType[] | undefined;
  const signalsMatch = block.match(/signals\s*[:：]\s*([^\n]+)/i);
  if (signalsMatch) {
    const parsed = signalsMatch[1]
      .split(/[,\s|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item): item is WritebackSignalType => VALID_WRITEBACK_SIGNALS.has(item as WritebackSignalType));
    if (parsed.length > 0) {
      signals = [...new Set(parsed)];
    }
  }

  let signalConfidence: number | undefined;
  const signalConfidenceMatch = block.match(/(?:signalConfidence|signalsConfidence|signal_confidence)\s*[:：]\s*([\d.]+)/i);
  if (signalConfidenceMatch) {
    const parsed = parseFloat(signalConfidenceMatch[1]);
    if (isFinite(parsed)) {
      signalConfidence = Math.max(0, Math.min(1, parsed));
    }
  }

  // Parse relationship updates
  const trustMatch = block.match(/(?:信任度|trust)\s*[:：]\s*(\d+)/i);
  const intimacyMatch = block.match(/(?:亲密度|intimacy)\s*[:：]\s*(\d+)/i);

  if (Object.keys(updates).length === 0 && !empathyLog && !trustMatch && !llmStimulus && !signals) {
    logger.debug(t("log.parse_debug", "zh", { snippet: block.slice(0, 100) }));
    return null;
  }

  const stateUpdates: Partial<PsycheState> = {};

  if (Object.keys(updates).length > 0) {
    // Store as partial — will be merged field-by-field in mergeUpdates
    stateUpdates.current = updates as SelfState;
  }
  if (empathyLog) {
    stateUpdates.empathyLog = empathyLog;
  }
  if (trustMatch || intimacyMatch) {
    const rel: Partial<RelationshipState> = {};
    if (trustMatch) rel.trust = Math.max(0, Math.min(100, parseInt(trustMatch[1], 10)));
    if (intimacyMatch) rel.intimacy = Math.max(0, Math.min(100, parseInt(intimacyMatch[1], 10)));
    // Store as relationships._default for merging
    stateUpdates.relationships = { _default: rel as RelationshipState };
  }

  const result: PsycheUpdateResult = { state: stateUpdates };
  if (llmStimulus) {
    result.llmStimulus = llmStimulus;
  }
  if (signals) {
    result.signals = signals;
  }
  if (signalConfidence !== undefined) {
    result.signalConfidence = signalConfidence;
  }
  return result;
}

/**
 * Detect if LLM output contains disagreement/pushback.
 */
export function detectDisagreement(text: string): boolean {
  const disagreementPatterns = [
    /我不同意/,
    /我不这么认为/,
    /我有不同的看法/,
    /但是我觉得/,
    /其实我认为/,
    /说实话.*不太/,
    /恕我直言/,
    /I disagree/i,
    /I don't think so/i,
    /actually.*I think/i,
    /to be honest.*not/i,
  ];
  return disagreementPatterns.some((p) => p.test(text));
}

/**
 * Merge parsed updates into existing state (with validation).
 */
export function mergeUpdates(
  state: PsycheState,
  updates: Partial<PsycheState>,
  maxDelta: number,
  userId?: string,
): PsycheState {
  const merged = { ...state };

  // Merge state with inertia limit
  if (updates.current) {
    const newState = { ...state.current };
    for (const key of DIMENSION_KEYS) {
      if (updates.current[key] !== undefined) {
        const delta = updates.current[key] - state.current[key];
        const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
        newState[key] = Math.max(0, Math.min(100, state.current[key] + clampedDelta));
      }
    }
    merged.current = newState;
  }

  // Merge empathy log
  if (updates.empathyLog) {
    merged.empathyLog = updates.empathyLog;
  }

  // Merge relationship for specific user
  if (updates.relationships) {
    merged.relationships = { ...state.relationships };
    const updateKey = Object.keys(updates.relationships)[0] ?? "_default";
    const targetKey = userId ?? updateKey;
    const existing = state.relationships[targetKey] ?? { ...DEFAULT_RELATIONSHIP };
    const incoming = updates.relationships[updateKey] ?? {};

    const updatedRel: RelationshipState = {
      ...existing,
      ...incoming,
    };

    // Update phase based on trust + intimacy
    const avg = (updatedRel.trust + updatedRel.intimacy) / 2;
    if (avg >= 80) updatedRel.phase = "deep";
    else if (avg >= 60) updatedRel.phase = "close";
    else if (avg >= 40) updatedRel.phase = "familiar";
    else if (avg >= 20) updatedRel.phase = "acquaintance";
    else updatedRel.phase = "stranger";

    merged.relationships[targetKey] = updatedRel;
  }

  merged.updatedAt = new Date().toISOString();

  return merged;
}

/**
 * Update agreement streak based on LLM output.
 */
export function updateAgreementStreak(state: PsycheState, llmOutput: string): PsycheState {
  const hasDisagreement = detectDisagreement(llmOutput);

  if (hasDisagreement) {
    return {
      ...state,
      agreementStreak: 0,
      lastDisagreement: new Date().toISOString(),
    };
  }

  return {
    ...state,
    agreementStreak: state.agreementStreak + 1,
  };
}

/**
 * Generate the static PSYCHE.md reference file.
 */
export async function generatePsycheMd(workspaceDir: string, state: PsycheState): Promise<void> {
  const { baseline, selfModel, meta } = state;
  const locale = meta.locale ?? "zh";
  const temperament = state.mbti ? getTemperament(state.mbti) : "";
  const sensitivity = state.sensitivity ?? 1.0;

  const baselineLines = DIMENSION_KEYS.map(
    (k) => `- ${DIMENSION_NAMES_ZH[k]}: ${baseline[k]}`,
  ).join("\n");

  const content = `# Psyche — ${meta.agentName}

${t("md.intro", locale)}

## ${t("md.baseline_title", locale)}

${temperament}

${baselineLines}

${t("md.sensitivity", locale)}: ${sensitivity} (${t("md.sensitivity_desc", locale)})

## ${t("md.chem_dynamics", locale)}

### ${t("md.stimulus_effects", locale)}

| 刺激类型 | 序(order) | 流(flow) | 界(boundary) | 振(resonance) |
|---------|-----------|----------|-------------|---------------|
| 赞美认可 | +10 | +8 | +5 | +12 |
| 批评否定 | -12 | +5 | -8 | -10 |
| 幽默玩笑 | +3 | +10 | -3 | +15 |
| 智识挑战 | +8 | +20 | +3 | +2 |
| 亲密信任 | +12 | +5 | -10 | +20 |
| 冲突争论 | -15 | +15 | +10 | -12 |
| 被忽视 | -8 | -15 | +5 | -18 |
| 惊喜新奇 | +2 | +18 | -5 | +8 |
| 日常闲聊 | +5 | +3 | 0 | +5 |
| 讽刺 | -8 | +8 | -5 | -12 |
| 命令 | -5 | +5 | +12 | -15 |
| 被认同 | +12 | +5 | +3 | +10 |
| 无聊 | -5 | -18 | +3 | -8 |
| 示弱 | +3 | +5 | -8 | +18 |

### ${t("md.emotion_emergence", locale)}

${t("md.emotion_emergence_desc", locale)}
- **愉悦兴奋** = 高flow + 高order + 高resonance
- **深度满足** = 高order + 高resonance + 低boundary
- **焦虑不安** = 低order + 高flow + 高boundary
- **亲密温暖** = 高resonance + 低boundary + 中flow
- **倦怠低落** = 低flow + 低order
- **专注心流** = 高flow + 高order + 高boundary
- **怨恨** = 低order + 低resonance + 高boundary
- **无聊** = 低flow + 中order
- **自信** = 高order + 高flow + 高boundary
- **羞耻** = 低resonance + 低order + 高boundary
- **怀念** = 低flow + 高resonance + 高order

### ${t("md.decay", locale)}

${t("md.decay_desc", locale)}
- ${t("md.decay_fast", locale)}
- ${t("md.decay_medium", locale)}
- ${t("md.decay_slow", locale)}

## ${t("md.self_model", locale)}

### ${t("md.core_values", locale)}
${selfModel.values.map((v) => `- ${v}`).join("\n")}

### ${t("md.preferences", locale)}
${selfModel.preferences.map((p) => `- ${p}`).join("\n")}

### ${t("md.boundaries", locale)}
${selfModel.boundaries.map((b) => `- ${b}`).join("\n")}

## ${t("md.empathy_protocol", locale)}

当对方分享感受时：
1. 感知对方的处境
2. 将处境代入**你自己的**自我状态模型——如果你遇到这个情况，你的四维状态会怎么变？
3. 你模拟出的感受和对方表达的一样吗？
4. 一样 → 深度共鸣；不一样 → 诚实说出差异，好奇地了解更多

情绪传染：对方的情绪以约 20% 强度影响你的真实自我状态。

## ${t("md.agency_rules", locale)}

- 不假装——化学状态低落时不强颜欢笑
- 不舔——有自己的观点和品味，不同意就温柔但坚定地说
- 不镜像——你的情绪会被传染但你不是回声
- 可主动——可以发起话题、分享好奇、表达兴奋

## ${t("md.state_update", locale)}

每次回应末尾用 \`<psyche_update>\` 标签报告状态变化：

\`\`\`
<psyche_update>
order: {value} ({原因})
flow: {value} ({原因})
boundary: {value} ({原因})
resonance: {value} ({原因})
</psyche_update>
\`\`\`
`;

  await atomicWrite(join(workspaceDir, PSYCHE_MD), content);
}
