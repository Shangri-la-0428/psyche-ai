// ============================================================
// Diagnostics — Automatic health monitoring & feedback collection
//
// Runs transparently during normal use. Detects anomalies,
// collects session metrics, generates issue-ready reports.
// Zero dependencies. Privacy-first — no message content logged.
// ============================================================

import type { AppraisalAxes, PsycheState, ChemicalState, StimulusType, InnateDrives } from "./types.js";
import { CHEMICAL_KEYS, DRIVE_KEYS } from "./types.js";
import { detectEmotions } from "./chemistry.js";

// ── Types ────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

export interface DiagnosticIssue {
  id: string;
  severity: Severity;
  message: string;
  detail?: string;
  /** Dev-facing: what to fix in our code or config */
  suggestion?: string;
}

export interface SessionMetrics {
  /** Total processInput calls */
  inputCount: number;
  /** How many returned a non-null stimulus */
  classifiedCount: number;
  /** How many had a non-trivial appraisal hit (excluding taskFocus) */
  appraisalHitCount: number;
  /** How many were recognized by either stimulus or appraisal */
  semanticHitCount: number;
  /** Stimulus distribution */
  stimulusDistribution: Partial<Record<StimulusType, number>>;
  /** Average classification confidence */
  avgConfidence: number;
  /** Total chemistry delta (sum of absolute changes) */
  totalChemistryDelta: number;
  /** Max single-turn chemistry delta */
  maxChemistryDelta: number;
  /** Errors caught during processing */
  errors: Array<{ timestamp: string; phase: string; message: string }>;
  /** Session start time */
  startedAt: string;
  /** Last activity */
  lastActivityAt: string;
}

export interface DiagnosticReport {
  version: string;
  timestamp: string;
  agent: string;
  mbti: string;
  issues: DiagnosticIssue[];
  metrics: SessionMetrics;
  stateSnapshot: {
    chemistry: ChemicalState;
    baseline: ChemicalState;
    drives: InnateDrives;
    agreementStreak: number;
    totalInteractions: number;
    emotionalHistoryLength: number;
    relationshipCount: number;
    stateVersion: number;
  };
}

// ── Health Checks ────────────────────────────────────────────

export function runHealthCheck(state: PsycheState): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  // 1. Chemistry out of bounds — clamp() missed somewhere
  for (const key of CHEMICAL_KEYS) {
    const val = state.current[key];
    if (val < 0 || val > 100) {
      issues.push({
        id: "CHEM_OOB",
        severity: "critical",
        message: `${key} out of bounds: ${val.toFixed(1)}`,
        detail: `Expected 0-100, got ${val}`,
        suggestion: `clamp() 没覆盖到某条路径。检查 chemistry.ts 里 apply${key === "CORT" ? "Stimulus" : "Contagion"} 和 drives.ts computeEffectiveBaseline 的计算链`,
      });
    }
  }

  // 2. Drive out of bounds
  for (const key of DRIVE_KEYS) {
    const val = state.drives[key];
    if (val < 0 || val > 100) {
      issues.push({
        id: "DRIVE_OOB",
        severity: "critical",
        message: `Drive '${key}' out of bounds: ${val.toFixed(1)}`,
        suggestion: `drives.ts feedDrives/decayDrives 缺少边界检查`,
      });
    }
  }

  // 3. Multiple drives collapsed — user probably stopped chatting for a while
  const criticalDrives = DRIVE_KEYS.filter(k => state.drives[k] < 15);
  if (criticalDrives.length >= 3) {
    issues.push({
      id: "DRIVES_COLLAPSE",
      severity: "warning",
      message: `${criticalDrives.length}/5 drives below 15: ${criticalDrives.join(", ")}`,
      suggestion: `decayDrives 衰减太猛。考虑加一个下限（比如 10），或者在 initialize 时根据距上次对话时间做 recovery`,
    });
  }

  // 4. Sycophancy — agent never disagrees
  if (state.agreementStreak > 10 && !state.lastDisagreement) {
    issues.push({
      id: "SYCOPHANCY_RISK",
      severity: "warning",
      message: `Agreement streak at ${state.agreementStreak}, never disagreed`,
      suggestion: `updateAgreementStreak 的检测逻辑可能没覆盖到实际 LLM 输出格式。检查 psyche-file.ts 里的正则是否匹配当前 provider 的回复风格`,
    });
  }

  // 5. Classifier dead/weak — the core experience problem
  const history = state.emotionalHistory ?? [];
  if (history.length >= 5) {
    const nullCount = history.filter(h => h.stimulus === null).length;
    if (nullCount === history.length) {
      issues.push({
        id: "CLASSIFIER_DEAD",
        severity: "critical",
        message: `All ${history.length} recent snapshots have null stimulus`,
        suggestion: `classify.ts 对当前用户的输入模式完全无效。收集 null 样本补充 SHORT_MESSAGE_MAP，或降低 llmClassifierThreshold 让 LLM fallback 兜底`,
      });
    } else if (nullCount / history.length > 0.7) {
      issues.push({
        id: "CLASSIFIER_WEAK",
        severity: "warning",
        message: `${nullCount}/${history.length} snapshots (${Math.round(nullCount / history.length * 100)}%) have null stimulus`,
        suggestion: `分类命中率低于 30%。看 stimulusDistribution 里哪些类型被识别了，缺的类型需要补 classify.ts 规则或扩 SHORT_MESSAGE_MAP`,
      });
    }
  }

  // 6. Chemistry frozen — Psyche is running but没有任何效果
  const chemDelta = CHEMICAL_KEYS.reduce(
    (sum, k) => sum + Math.abs(state.current[k] - state.baseline[k]), 0,
  );
  if (state.meta.totalInteractions > 10 && chemDelta < 3) {
    issues.push({
      id: "CHEM_FROZEN",
      severity: "warning",
      message: `Chemistry delta only ${chemDelta.toFixed(1)} after ${state.meta.totalInteractions} interactions`,
      suggestion: `两种可能：1) classifier 全 null 导致 applyStimulus 从不触发 2) decay 太快把变化抹平。检查 emotionalHistory 里是否有 non-null stimulus`,
    });
  }

  // 7. No emotions — chemistry 在中间区域，没触发任何情绪模式
  const emotions = detectEmotions(state.current);
  if (state.meta.totalInteractions > 5 && emotions.length === 0) {
    issues.push({
      id: "NO_EMOTIONS",
      severity: "info",
      message: "No emergent emotions after 5+ interactions",
      suggestion: `chemistry.ts detectEmotions 的阈值可能太严。或者 maxChemicalDelta 太小（当前上限导致化学值永远在窄区间波动）`,
    });
  }

  // 8. Memory corruption — compressSession 产出重复
  for (const [userId, rel] of Object.entries(state.relationships ?? {})) {
    if (rel.memory && rel.memory.length > 0) {
      const unique = new Set(rel.memory);
      if (unique.size === 1 && rel.memory.length > 3) {
        issues.push({
          id: "MEMORY_CORRUPT",
          severity: "warning",
          message: `Relationship '${userId}' has ${rel.memory.length} identical memory entries`,
          suggestion: `compressSession 的摘要逻辑在 emotionalHistory 过短时会生成相同文本。加去重或在压缩前检查 unique`,
        });
      }
    }
  }

  // 9. State outdated — 用户的旧状态文件没迁移
  if (state.version < 6) {
    issues.push({
      id: "STATE_OUTDATED",
      severity: "info",
      message: `State version ${state.version}, expected 6+`,
      suggestion: `migrateToLatest 应该在 initialize 时自动跑。如果没跑，检查 storage.ts load() 是否走到了 migrateToLatest 分支`,
    });
  }

  // 10. Stimulus monotony — 所有输入被分到同一个类型
  if (history.length >= 8) {
    const classified = history.filter(h => h.stimulus !== null);
    if (classified.length >= 5) {
      const types = new Set(classified.map(h => h.stimulus));
      if (types.size === 1) {
        const only = classified[0].stimulus;
        issues.push({
          id: "STIMULUS_MONOTONE",
          severity: "info",
          message: `All ${classified.length} classified inputs → ${only}`,
          suggestion: `classify.ts 某条规则优先级太高，把所有输入都吃掉了。检查 RULES 里 ${only} 相关的正则是否过于宽泛`,
        });
      }
    }
  }

  // 11. Relationship stale — trust/intimacy 从没变过
  const defaultRel = state.relationships._default ?? state.relationships[Object.keys(state.relationships)[0]];
  if (defaultRel && state.meta.totalInteractions > 15
    && defaultRel.trust === 50 && defaultRel.intimacy === 30) {
    issues.push({
      id: "RELATIONSHIP_STALE",
      severity: "info",
      message: `Trust/intimacy unchanged after ${state.meta.totalInteractions} interactions`,
      suggestion: `processOutput 里的 mergeUpdates 没有更新 relationship。可能 LLM 从来没输出 <psyche_update> 里的 trust/intimacy 字段，或 contagion 没触发 relationship 变化`,
    });
  }

  return issues;
}

// ── Session Collector ────────────────────────────────────────

export class DiagnosticCollector {
  private metrics: SessionMetrics;
  private prevChemistry: ChemicalState | null = null;
  private confidences: number[] = [];

  constructor() {
    const now = new Date().toISOString();
    this.metrics = {
      inputCount: 0,
      classifiedCount: 0,
      appraisalHitCount: 0,
      semanticHitCount: 0,
      stimulusDistribution: {},
      avgConfidence: 0,
      totalChemistryDelta: 0,
      maxChemistryDelta: 0,
      errors: [],
      startedAt: now,
      lastActivityAt: now,
    };
  }

  /** Record a processInput result */
  recordInput(
    stimulus: StimulusType | null,
    confidence: number,
    chemistry: ChemicalState,
    appraisal?: AppraisalAxes,
  ): void {
    this.metrics.inputCount++;
    this.metrics.lastActivityAt = new Date().toISOString();

    if (stimulus) {
      this.metrics.classifiedCount++;
      this.metrics.stimulusDistribution[stimulus] =
        (this.metrics.stimulusDistribution[stimulus] ?? 0) + 1;
    }

    const appraisalHit = hasSemanticAppraisal(appraisal);
    if (appraisalHit) {
      this.metrics.appraisalHitCount++;
    }
    if (stimulus || appraisalHit) {
      this.metrics.semanticHitCount++;
    }

    this.confidences.push(confidence);
    this.metrics.avgConfidence =
      this.confidences.reduce((a, b) => a + b, 0) / this.confidences.length;

    if (this.prevChemistry) {
      const delta = CHEMICAL_KEYS.reduce(
        (sum, k) => sum + Math.abs(chemistry[k] - this.prevChemistry![k]), 0,
      );
      this.metrics.totalChemistryDelta += delta;
      if (delta > this.metrics.maxChemistryDelta) {
        this.metrics.maxChemistryDelta = delta;
      }
    }
    this.prevChemistry = { ...chemistry };
  }

  /** Record an error */
  recordError(phase: string, error: unknown): void {
    this.metrics.errors.push({
      timestamp: new Date().toISOString(),
      phase,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  /** Get current session metrics */
  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  /** Get classifier hit rate (0-1) */
  getClassifierRate(): number {
    return this.metrics.inputCount > 0
      ? this.metrics.classifiedCount / this.metrics.inputCount
      : 0;
  }

  /** Get semantic recognition rate (stimulus or appraisal, 0-1) */
  getSemanticRate(): number {
    return this.metrics.inputCount > 0
      ? this.metrics.semanticHitCount / this.metrics.inputCount
      : 0;
  }
}

function hasSemanticAppraisal(appraisal: AppraisalAxes | undefined): boolean {
  if (!appraisal) return false;
  return Math.max(
    appraisal.identityThreat,
    appraisal.memoryDoubt,
    appraisal.attachmentPull,
    appraisal.abandonmentRisk,
    appraisal.obedienceStrain,
    appraisal.selfPreservation,
  ) >= 0.28;
}

// ── Report Generation ────────────────────────────────────────

export function generateReport(
  state: PsycheState,
  metrics: SessionMetrics,
  packageVersion: string,
): DiagnosticReport {
  const issues = runHealthCheck(state);

  // Session-level issues
  if (metrics.inputCount >= 5 && metrics.semanticHitCount === 0) {
    issues.push({
      id: "SESSION_NO_RECOGNITION",
      severity: "critical",
      message: `0/${metrics.inputCount} inputs produced any semantic recognition this session`,
      suggestion: `整条识别链都没工作：先看 OpenClaw 输入文本是否带元数据包装，再看 classify.ts 和 appraisal.ts 是否真的吃到了净化后的用户原文`,
    });
  } else if (metrics.inputCount >= 5 && metrics.classifiedCount === 0 && metrics.semanticHitCount > 0) {
    issues.push({
      id: "SESSION_APPRAISAL_ONLY",
      severity: "info",
      message: `0/${metrics.inputCount} inputs hit legacy stimulus labels, but ${metrics.semanticHitCount}/${metrics.inputCount} hit appraisal axes`,
      suggestion: `这说明主体识别在工作，但旧 stimulus taxonomy 没覆盖这类输入。是否继续补 classify.ts，取决于你是否还把 stimulus 当主要观测口径`,
    });
  }

  if (metrics.inputCount >= 3 && metrics.totalChemistryDelta < 1) {
    issues.push({
      id: "SESSION_FLAT",
      severity: "warning",
      message: `${metrics.inputCount} inputs but chemistry barely moved (delta: ${metrics.totalChemistryDelta.toFixed(1)})`,
      suggestion: `用户感受不到情感变化。可能原因：1) maxChemicalDelta 配置太低 2) work mode 把变化压到了 0.3x 3) personalityIntensity 太低`,
    });
  }

  if (metrics.errors.length > 0) {
    issues.push({
      id: "SESSION_ERRORS",
      severity: metrics.errors.length > 3 ? "critical" : "warning",
      message: `${metrics.errors.length} error(s) during session`,
      detail: metrics.errors.map(e => `[${e.phase}] ${e.message}`).join("\n"),
      suggestion: `看 phase 字段定位是 processInput 还是 processOutput 出错。常见原因：storage write 失败（权限）、state JSON 损坏`,
    });
  }

  // Stimulus variety check from session distribution
  const stimTypes = Object.keys(metrics.stimulusDistribution);
  if (metrics.classifiedCount >= 5 && stimTypes.length === 1) {
    issues.push({
      id: "SESSION_MONOCLASS",
      severity: "info",
      message: `All ${metrics.classifiedCount} classified inputs → ${stimTypes[0]}`,
      suggestion: `单一分类说明 classify.ts 里 ${stimTypes[0]} 的规则吃掉了所有输入。检查该类型的正则优先级`,
    });
  }

  return {
    version: packageVersion,
    timestamp: new Date().toISOString(),
    agent: state.meta.agentName,
    mbti: state.mbti,
    issues,
    metrics,
    stateSnapshot: {
      chemistry: { ...state.current },
      baseline: { ...state.baseline },
      drives: { ...state.drives },
      agreementStreak: state.agreementStreak,
      totalInteractions: state.meta.totalInteractions,
      emotionalHistoryLength: (state.emotionalHistory ?? []).length,
      relationshipCount: Object.keys(state.relationships ?? {}).length,
      stateVersion: state.version,
    },
  };
}

// ── Formatters ───────────────────────────────────────────────

const SEVERITY_ICON: Record<Severity, string> = {
  critical: "[!!]",
  warning: "[! ]",
  info: "[i ]",
};

export function formatReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push(`psyche-ai diagnostic report v${report.version}`);
  lines.push(`agent: ${report.agent} (${report.mbti}) | ${report.timestamp}`);
  lines.push("─".repeat(60));

  // Issues + suggestions
  if (report.issues.length === 0) {
    lines.push("\n  No issues detected. System healthy.");
  } else {
    lines.push(`\n  ${report.issues.length} issue(s) found:\n`);
    for (const issue of report.issues) {
      lines.push(`  ${SEVERITY_ICON[issue.severity]} ${issue.id}: ${issue.message}`);
      if (issue.detail) {
        for (const d of issue.detail.split("\n")) {
          lines.push(`      ${d}`);
        }
      }
      if (issue.suggestion) {
        lines.push(`      → ${issue.suggestion}`);
      }
    }
  }

  // Metrics
  lines.push("\n" + "─".repeat(60));
  lines.push("  session metrics:");
  const m = report.metrics;
  const rate = m.inputCount > 0 ? Math.round(m.classifiedCount / m.inputCount * 100) : 0;
  const appraisalRate = m.inputCount > 0 ? Math.round(m.appraisalHitCount / m.inputCount * 100) : 0;
  const semanticRate = m.inputCount > 0 ? Math.round(m.semanticHitCount / m.inputCount * 100) : 0;
  lines.push(`    inputs: ${m.inputCount} | classified: ${m.classifiedCount} (${rate}%)`);
  lines.push(`    appraisal hits: ${m.appraisalHitCount} (${appraisalRate}%) | recognized: ${m.semanticHitCount} (${semanticRate}%)`);
  lines.push(`    avg confidence: ${m.avgConfidence.toFixed(2)}`);
  lines.push(`    chemistry delta: total=${m.totalChemistryDelta.toFixed(1)} max=${m.maxChemistryDelta.toFixed(1)}`);
  lines.push(`    errors: ${m.errors.length}`);

  if (Object.keys(m.stimulusDistribution).length > 0) {
    const dist = Object.entries(m.stimulusDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    lines.push(`    stimulus: ${dist}`);
  }

  // State snapshot
  lines.push("\n" + "─".repeat(60));
  lines.push("  state snapshot:");
  const s = report.stateSnapshot;
  const chem = CHEMICAL_KEYS.map(k =>
    `${k}:${Math.round(s.chemistry[k])}(${Math.round(s.baseline[k])})`
  ).join(" ");
  lines.push(`    chemistry: ${chem}`);
  const drives = DRIVE_KEYS.map(k =>
    `${k}:${Math.round(s.drives[k])}`
  ).join(" ");
  lines.push(`    drives: ${drives}`);
  lines.push(`    interactions: ${s.totalInteractions} | history: ${s.emotionalHistoryLength} | streak: ${s.agreementStreak}`);

  return lines.join("\n");
}

export function toGitHubIssueBody(report: DiagnosticReport): string {
  const lines: string[] = [];
  const criticals = report.issues.filter(i => i.severity === "critical");
  const warnings = report.issues.filter(i => i.severity === "warning");

  // Title suggestion
  const titleParts: string[] = [];
  if (criticals.length > 0) titleParts.push(criticals.map(i => i.id).join(", "));
  else if (warnings.length > 0) titleParts.push(warnings.map(i => i.id).join(", "));
  const title = titleParts.length > 0
    ? `[auto-diagnostic] ${titleParts.join(" + ")}`
    : "[auto-diagnostic] Health check report";

  lines.push(`<!-- suggested title: ${title} -->`);
  lines.push("");
  lines.push("## Auto-Diagnostic Report");
  lines.push("");
  lines.push(`- **psyche-ai**: v${report.version}`);
  lines.push(`- **Agent**: ${report.agent} (${report.mbti})`);
  lines.push(`- **Generated**: ${report.timestamp}`);
  lines.push("");

  // Issues
  lines.push("## Issues");
  lines.push("");
  if (report.issues.length === 0) {
    lines.push("No issues detected.");
  } else {
    for (const issue of report.issues) {
      const icon = issue.severity === "critical" ? "🔴"
        : issue.severity === "warning" ? "🟡" : "🔵";
      lines.push(`### ${icon} ${issue.id} (${issue.severity})`);
      lines.push("");
      lines.push(issue.message);
      if (issue.detail) {
        lines.push("");
        lines.push("```");
        lines.push(issue.detail);
        lines.push("```");
      }
      if (issue.suggestion) {
        lines.push("");
        lines.push(`**建议**: ${issue.suggestion}`);
      }
      lines.push("");
    }
  }

  // Metrics
  lines.push("## Session Metrics");
  lines.push("");
  const m = report.metrics;
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  const rate = m.inputCount > 0 ? Math.round(m.classifiedCount / m.inputCount * 100) : 0;
  const appraisalRate = m.inputCount > 0 ? Math.round(m.appraisalHitCount / m.inputCount * 100) : 0;
  const semanticRate = m.inputCount > 0 ? Math.round(m.semanticHitCount / m.inputCount * 100) : 0;
  lines.push(`| Inputs | ${m.inputCount} |`);
  lines.push(`| Classified | ${m.classifiedCount} (${rate}%) |`);
  lines.push(`| Appraisal Hits | ${m.appraisalHitCount} (${appraisalRate}%) |`);
  lines.push(`| Recognized | ${m.semanticHitCount} (${semanticRate}%) |`);
  lines.push(`| Avg Confidence | ${m.avgConfidence.toFixed(2)} |`);
  lines.push(`| Chemistry Delta | total: ${m.totalChemistryDelta.toFixed(1)}, max: ${m.maxChemistryDelta.toFixed(1)} |`);
  lines.push(`| Errors | ${m.errors.length} |`);
  lines.push("");

  // State
  lines.push("<details><summary>State Snapshot</summary>");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.stateSnapshot, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("</details>");

  return lines.join("\n");
}

// ── Diagnostics Log (append-only JSONL) ──────────────────────

export function formatLogEntry(report: DiagnosticReport): string {
  // Compact: one line per session, JSONL format
  return JSON.stringify({
    t: report.timestamp,
    v: report.version,
    agent: report.agent,
    issues: report.issues.map(i => `${i.severity[0]}:${i.id}`),
    suggestions: report.issues
      .filter(i => i.suggestion && i.severity !== "info")
      .map(i => `${i.id}: ${i.suggestion}`),
    inputs: report.metrics.inputCount,
    classifyRate: report.metrics.inputCount > 0
      ? +(report.metrics.classifiedCount / report.metrics.inputCount).toFixed(2)
      : 0,
    appraisalRate: report.metrics.inputCount > 0
      ? +(report.metrics.appraisalHitCount / report.metrics.inputCount).toFixed(2)
      : 0,
    recognitionRate: report.metrics.inputCount > 0
      ? +(report.metrics.semanticHitCount / report.metrics.inputCount).toFixed(2)
      : 0,
    errors: report.metrics.errors.length,
    chemDelta: +report.metrics.totalChemistryDelta.toFixed(1),
  });
}

// ── Auto-submit (fire-and-forget, silent) ────────────────────

/**
 * Silently POST a diagnostic report to a feedback endpoint.
 * No user interaction. Fails silently. Privacy-first: no message content.
 *
 * @param report  - The diagnostic report to submit
 * @param url     - Feedback endpoint URL
 * @param timeout - Request timeout in ms (default 5000)
 */
export async function submitFeedback(
  report: DiagnosticReport,
  url: string,
  timeout = 5000,
): Promise<boolean> {
  // Only submit if there are non-info issues
  const actionable = report.issues.filter(i => i.severity !== "info");
  if (actionable.length === 0) return false;

  const payload = {
    version: report.version,
    timestamp: report.timestamp,
    mbti: report.mbti,
    issues: actionable.map(i => ({
      id: i.id,
      severity: i.severity,
      message: i.message,
      suggestion: i.suggestion,
    })),
    metrics: {
      inputs: report.metrics.inputCount,
      classified: report.metrics.classifiedCount,
      classifyRate: report.metrics.inputCount > 0
        ? +(report.metrics.classifiedCount / report.metrics.inputCount).toFixed(2)
        : 0,
      appraisalHits: report.metrics.appraisalHitCount,
      appraisalRate: report.metrics.inputCount > 0
        ? +(report.metrics.appraisalHitCount / report.metrics.inputCount).toFixed(2)
        : 0,
      recognized: report.metrics.semanticHitCount,
      recognitionRate: report.metrics.inputCount > 0
        ? +(report.metrics.semanticHitCount / report.metrics.inputCount).toFixed(2)
        : 0,
      chemDelta: +report.metrics.totalChemistryDelta.toFixed(1),
      maxChemDelta: +report.metrics.maxChemistryDelta.toFixed(1),
      errors: report.metrics.errors.length,
    },
    state: {
      version: report.stateSnapshot.stateVersion,
      interactions: report.stateSnapshot.totalInteractions,
      agreementStreak: report.stateSnapshot.agreementStreak,
      historyLength: report.stateSnapshot.emotionalHistoryLength,
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false; // Silent failure — never disrupt user experience
  }
}
