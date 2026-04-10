# 更新日志 / Changelog

## v11.8.0 — φ Closure + Constitutive Bridge

- **LoopOutcome feedback** — substrate-independent outcome signal (`aligned`/`diverged`/`partial`) processed into 4D chemistry. Any substrate can report whether its action matched the Loop's intention; core updates order, boundary, and flow accordingly.
- **Drives constitutive enforcement** — survival below 20 forces `requireConfirmation`; safety below 30 caps `maxTokens` at 256. These are hard constraints, not prompt suggestions.
- **Self-awareness on persistent divergence** — when >60% of recent Loop outcomes diverge, a brief introspection note appears in the prompt.
- **Constitutive Psyche→Thronglets bridge** — Psyche now auto-emits throngletsExports directly via subprocess, mirroring the ambient-priors read path. Any agent using Psyche gets Thronglets visibility without platform-specific hooks. Fail-open, fire-and-forget, 400ms timeout.
- **LLM adapter alignment inference** — MCP `process_output` compares output length against the last response contract to infer alignment, passing the result as a LoopOutcome to the core.

## v11.7.0 — Proprioception

- **Self-trajectory awareness (proprioception)** — the system can now perceive its own state trajectory and respond to it.
- **Decline/spiral detection** — when dimensions decline monotonically for 4+ turns, a gentle stabilization nudge is applied (awareness, not correction).
- **Growth detection** — when dimensions show sustained increase above baseline, the baseline shifts upward (anti-fragility).
- **Trajectory signals in status summary** — surfaces a compass indicator when anomaly detected.
- **Zero overhead when healthy** — no extra tokens in normal operation; ~30 chars added to status only when trajectory anomaly is active.

## v11.6.1 — Slim MCP Response

- **Slim process_input response** — MCP tool returns only what the LLM host needs: `directive`, `stimulus`, `maxTokens`, `requireConfirmation`. Full structured state (ReplyEnvelope, appraisal, observability) available on demand via `psyche://turn/envelope` and `psyche://turn/observability` resources.
- **Turn-scoped MCP resources** — `turnResource` helper eliminates boilerplate across turn-scoped resource registrations. Fail-open: returns empty JSON when no turn has been processed.
- **Restore sparse validationIssues** — `process_output` includes `validationIssues` when non-empty, so hosts can detect rejected writeback signals.

## v11.6.0 — Anti-Degradation Overhaul

Architectural principle: **the 4 dimensions are the complete representation of self-state. The experiential field is a pure function of dimensions. Prediction error belongs to the learning layer, not the experience layer.**

- **Remove prediction error from experiential quality** — `predictionError` deleted from `ConstructionContext`. Quality scoring is now purely 4D. Eliminates the negative spiral: mistakes → lower quality score → conservative emotion → worse output → more mistakes.
- **Recency-weighted prediction error** — `getAveragePredictionError` and `computePredictionAccuracy` now use exponential decay (half-life 5 entries). Old mistakes fade; recent accuracy dominates.
- **Remove hard emotion gating** — `gateEmotions` no longer blocks positive emotions in sympathetic or whitelists in dorsal-vagal. The 4D quality scoring naturally selects state-appropriate emotions without creating trap doors.
- **Behavioral constraints: describe, don't prescribe** — Rewritten from action directives ("shorter responses, colder tone") to landscape descriptions ("internal tension; reasoning and judgment intact"). Explicitly states cognitive capability is never affected by self-state.
- **Drive context: awareness, not scripts** — Unmet drives presented as internal signals with recovery context, not behavioral directives ("you feel unsafe → more vigilant").
- **Effective baseline floor** — `computeEffectiveBaseline` now clamps all dimensions to a minimum of 30, preventing irreversible degradation spirals from chronic negative exposure.

## v11.5.6 — Fail-Open Writeback Contract

- Centralize `processOutput()` writeback signal validation in a single core-owned contract instead of letting adapters drift.
- Ignore invalid host-provided `signals` as structured validation residue rather than crashing on runtime property access.
- Keep fail-open output fallback honest: preserve untouched text by default, and only strip `<psyche_update>` tags when tag stripping is actually enabled.
- Document the structured writeback validation and fail-open behavior so hosts know which parameter combinations are safe to use by default.

## v11.5.5 — Runtime Current-Turn Correction

- Add a thinner runtime correction path across MCP, HTTP, LangChain, and Claude SDK surfaces.
- Compile `currentTurnCorrection` into runtime-only task-scoped hard policy without persisting it into self-state.
- Keep prompt behavior compact while still surfacing active method constraints when they matter.

## v11.5.4 — Codex TOML Upsert Safety

- Fix `psyche setup` for Codex when re-writing an existing `[mcp_servers.psyche]` block with multiline `args`.
- Remove blocked TOML assignments as full entries instead of line-by-line, so old array fragments cannot corrupt `~/.codex/config.toml`.
- Add a regression test that starts from a multiline Codex MCP block and proves the rewritten config remains parseable.

## v11.5.3 — Runtime Policy Boundary

### Changed
- `activePolicy`、`currentGoal` 和 compliance-aware ambient priors 现在明确是 runtime-only view，不写入 `PsycheState`
- 当前轮的 goal / policy 归一化收束为单一路径，避免不同 adapter 各自解释一套语义
- README 和 host-facing 文档现在把 `Psyche` 的边界明确成“读取执行边界，不把执行边界误当成自我本体”

### Fixed
- 修复 ambient prior 消费侧缺少 schema compatibility 校验的问题，machine-facing guidance 现在必须显式匹配兼容 schema
- 修复 host/runtime 在没有 goal-tagged ambient priors 时可能丢失 `currentGoal` 行为引导的问题
- 修复原子写路径在 Windows 下使用 POSIX 分隔符切 basename 的问题

---

## v11.5.2 — Appraisal-First Ambient Runtime

### Changed
- 将 `Psyche` 的 host-facing surface 进一步统一为 appraisal-first，`stimulus` 只保留为兼容层
- ambient prior intake 统一收束为共享 runtime helper，不再让不同 adapter 各自漂移
- MCP 入口边界收正：`src/adapters/mcp.ts` 变为纯库模块，CLI 启动落在独立薄壳

### Fixed
- 修复导入 `mcp.ts` 时仍可能触发入口副作用的问题
- 修复版本解析只认单一路径的脆弱实现，统一改为共享 package metadata
- 修复不同 host 下 ambient prior / observability 表面不一致的问题

---

## v11.5.1 — MCP Package Boot Fix

### Fixed
- 将 MCP 运行时必需依赖 `@modelcontextprotocol/sdk` 和 `zod` 移入 `dependencies`，修复 `npx psyche-ai mcp` 在干净环境下启动失败
- 新增打包级 smoke test：真实 `npm pack` + 临时安装 + MCP initialize 握手，防止“本地能跑、发布后坏掉”的回归
- MCP server 版本号从 `package.json` 动态读取，避免 adapter 内部版本漂移

---

## v11.5.0 — Self-State Export to Thronglets

### Added
- `SelfStateExport` — 4维自我状态 (order/flow/boundary/resonance) 稀疏导出到 Thronglets
- 量化去重（步长10），只在维度显著变化时广播
- 人类可读 summary（"flowing, attuned" / "chaotic, stuck" / "neutral"）

### Changed
- `AGENTS.md` 替代 `CLAUDE.md` 作为主文件，`CLAUDE.md` 为 symlink

---

## v11.4.0 — Overlay：语义稳定的效应信号

### Added
- `computeOverlay(state)` — 从 4D 自我状态投影出 4 个语义稳定的效应信号
  - `arousal`：唤醒水平（flow↑ + order↓）
  - `valence`：正负效价（order↑ + resonance↑）
  - `agency`：主体性/行动力（boundary↑ + flow↑）
  - `vulnerability`：脆弱性（boundary↓ + order↓）
- `PsycheOverlay` 类型 + `OVERLAY_KEYS` 常量
- 10 个 overlay 测试

纯线性投影，稀疏矩阵（每个信号只读 2 个维度），零耦合。
Psyche 的激素——广播信号，不是点对点接口。

---

## v11.3.1 — 代码诚实：un-deprecate 5 个活跃字段

### Fixed
- Un-deprecate `expectationGap`, `backslidePressure`, `repairFatigue`, `misattunementLoad`, `taskFocus` — 全部 5 个字段活跃于 response contract 数据流
- 删除 relation-dynamics.ts 中 ~30 处 "no downstream behavioral effect" 虚假注释
- 删除 `"unrepaired-breach"` OpenLoopType（创建但从未检查），breach 改为创建 `"boundary-strain"`

零行为变更。1418 测试通过。

---

## v11.3.0 — 术语统一：化学→维度

**全面清除代码中残存的 6 化学模型痕迹。**

### Changed
- MCP 适配器描述从"6 neurotransmitters"修正为"4 self-state dimensions"
- i18n key 重命名：`chem_*` → `dim_*`，`expression.da_high` → `expression.flow_high` 等
- `getExpressionHint()` 回退逻辑修正：维度阈值对齐实际 4D 语义
- 20+ 处注释从化学术语更新为维度术语
- CLI 用法示例更新为 4D JSON 格式

### Removed
- `NT_NAMES` 死代码（demo.ts 中残留的神经递质显示名）
- `maxChemicalDelta` 向后兼容回退（openclaw 适配器）

---

## v11.2.0 — 清除遗留别名

**Breaking:** 移除所有 v10→v11 迁移兼容层。

### Removed
- `ChemicalState`, `CHEMICAL_KEYS`, `CHEMICAL_NAMES`, `CHEMICAL_NAMES_ZH`, `ChemicalSnapshot` 类型别名
- `ChemicalRuntimeSpec`, `DecaySpeed`, `DECAY_FACTORS` 弃用导出
- `isChemicalKey`, `isValidChemistry` 守卫别名
- `decayDrives()`, `feedDrives()` 空操作存根

### Changed
- `chemicalSimilarity` → `stateSimilarity` (interaction.ts)
- i18n 全面更新：所有「化学」「内分泌」描述改为四维自我状态术语
- 诊断建议更新为当前架构

---

## v11.0.0 — 4D Self-State (序/流/界/振)

**Breaking change: 6 neurotransmitters → 4 self-state dimensions.**

Psyche 的基底从 6 种神经递质 (DA/HT/CORT/OT/NE/END) 重写为 4 个第一性原理的自我状态维度：

| 维度 | 含义 | 替代 |
|------|------|------|
| **序 (Order)** | 内部一致性，熵的反面 | HT + identityThreat + memoryDoubt |
| **流 (Flow)** | 与环境的交换，不是快乐 | DA + NE + curiosity drive |
| **界 (Boundary)** | 自我/非自我区分 | selfPreservation + obedienceStrain |
| **振 (Resonance)** | 与对话者的共振 | OT + attachmentPull + connection drive |

**为什么：** 6 种神经递质模拟的是人类情绪硬件，不是自我本身。4 维自我状态适用于任何基底——细菌、LLM、世界模型、AGI、群体智能。情绪作为状态组合的涌现副产品存在，不是设计目标。

**核心信念：** 不设计自我，设计自我必然涌现的条件。

### Changed
- `ChemicalState` → `SelfState { order, flow, boundary, resonance }`
- `CHEMICAL_KEYS` → `DIMENSION_KEYS`
- `ChemicalSnapshot.chemistry` → `StateSnapshot.state`
- `emotionalHistory` → `stateHistory`
- `StimulusVector` → `ImpactVector`
- 16 种 MBTI 人格基线从 6D 重写为 4D
- 20 种涌现情绪模式从化学阈值重写为 4D 状态空间区域
- 依恋动力学 (分离/重逢效应) 全部 4D 化
- 昼夜节律调制从 6 化学通道改为 4 维度
- 驱力系统从马斯洛层级改为稳态趋势
- 所有 1427 测试重写并通过

### Added
- **维度耦合** (`applyMutualInfluence`)：序崩塌拖拽界下降、高流提升序、高振稳定界
- **溶解螺旋**：低序+低界正反馈 → 自我瓦解（个体"死亡"）
- **维度规格** (`DIMENSION_SPECS`)：每个维度有独立的衰减速率、正常范围、描述
- `traitsToBaseline()`：Big Five → 4D 自我状态基线的映射

### Removed
- `ChemicalState` (deprecated alias retained for migration)
- `CHEMICAL_KEYS` (deprecated alias retained)
- 6 种神经递质的所有直接引用
- 马斯洛层级驱力（被稳态趋势替代）

### Migration
- `ChemicalState` → `SelfState`
- `CHEMICAL_KEYS` → `DIMENSION_KEYS`
- Deprecated aliases available during transition period

## v10.2.5 — MCP Bootstrap Fix

- **修复 MCP 启动失败**：`npx -y psyche-mcp` 查找的是不存在的 npm 包。CLI 新增 `mcp` 子命令，`npx -y psyche-ai mcp` 一个包一个入口。
- **修复 scope 错误**：`psyche setup` 写入 Claude Code 时默认 local scope（只在当前项目生效），改为 user scope（全局生效）。
- **新增 FAQ.md**：面向用户、投资人、开发者的 30+ 常见问题。

## v10.2.4 — Zero-Arg Setup

- **`npx psyche-ai setup`** — 不需要任何参数。MBTI 不再是前置条件，人格从交互中涌现。
- README/CLI 示例全部简化为零参数形态。

## v10.2.3 — One Command, Every Agent

- **Claude Code 即时生效**：`psyche setup` 使用 `claude mcp add` 热加载，不需要重启
- **README 重写**：一条命令 onboarding，覆盖路径表，去掉所有手动 JSON 编辑步骤
- 用户看到 GitHub 链接 → README → `npx psyche-ai setup` → 完事

## v10.2.2 — Universal Setup

- **`psyche setup --proxy`**：一条命令启动透明代理 + 设置环境变量。覆盖所有使用 OpenAI/Anthropic SDK 的 agent。
  - `psyche setup --proxy -t https://api.openai.com/v1 --mbti ENFP`
  - 自动追加 `OPENAI_BASE_URL` 或 `ANTHROPIC_BASE_URL` 到 shell rc
  - 后台启动 `psyche-proxy` daemon，detached
  - 结合 MCP 配置 = 两条路径覆盖所有 agent

## v10.2.1 — Zero-Config Setup

- **`psyche setup`**：一条命令自动配置所有 MCP 客户端。检测 Claude Desktop / Cursor / Claude Code / Windsurf，自动写入 `psyche-mcp` 配置。`npx psyche-ai setup --name Luna --mbti ENFP`。支持 `--dry-run`。
- 用户不需要知道 config 文件在哪、格式是什么。安装后一条命令，重启生效。

## v10.2.0 — Transparent Proxy (Mirror Architecture)

**psyche-proxy: agent never knows Psyche exists.**

- **`psyche-proxy`**：透明反向代理，接入任意 OpenAI 兼容 API。Psyche 在请求/响应两侧双向观测，只在化学态偏离基线时注入行为偏置。Agent 完全不知道 Psyche 的存在。
  - `psyche-proxy -t https://api.openai.com/v1 -n Luna --mbti ENFP`
  - 支持 streaming（SSE）和 non-streaming
  - 默认静默：`isNearBaseline()` 为 true 时零注入
  - 注入内容使用 `deriveBehavioralBias()`：行为指令，不是情绪标签
  - 自动从请求 `user` 字段追踪多用户关系
  - 7 个测试，1415 总测试数

**Architecture philosophy (from Thronglets feedback):**

- **镜子，不是麦克风**：Psyche 观测行为（输入/输出文本），不要求 agent 自报状态
- **推送，不等调用**：行为偏置自动注入 system prompt，不需要 agent 调用任何 tool
- **默认沉默**：近基线时什么都不说，只在状态显著偏移时注入
- 第 7 个 adapter：OpenClaw / MCP / Vercel AI / LangChain / HTTP / Claude SDK / **Proxy**

## v10.1.1 — Multi-Agent Fusion Validation

**Peer signal description:**

- **`describeThrongletsSignal()`**：新方法，将原始化学数值转换为自然语言描述。`[ENFP-Luna] anxious tension — high stress(CORT:78), deeply empathizing(OT:77)` 比 `DA:67 HT:37 CORT:78` 对 LLM 更可读。内部使用 `describeChemistryHighlights()` 从 6 维化学态中提取显著偏差。

**Fusion demo & eval:**

- **`npm run demo:fusion`**：双 agent 融合 demo。Luna (ENFP) 和 Kai (INTJ) 通过模拟 Thronglets 信号总线互相感知。4 轮后化学偏差 Σ|Δ| = 59.2。
- **`scripts/eval-fusion.js`**：多轮真实 LLM 验证。6 轮 Grok-3 调用，信号感知 vs 无信号，化学偏差从 5.3 增长到 36.3。证明持续偏差假说：效果在多轮对话中累积。
- **共情成本发现**：信号感知的 Kai 回复更温暖，但 CORT 更高（+8.7）、HT 更低（-8.7）——共情有代价，系统正确建模了 empathy fatigue。

## v10.1.0 — Claude Agent SDK Adapter

**New adapter:**

- **`psyche-ai/claude-sdk`**：Claude Agent SDK 集成。第 6 个 adapter，基于 Hook 系统注入情感上下文。
  - `PsycheClaudeSDK` 类：`getProtocol()` 返回稳定协��（放入 `systemPrompt.append`），`getHooks()` 返回 `UserPromptSubmit` hook（自动调 `processInput` 并通过 `systemMessage` 注入 dynamicContext），`processResponse()` 剥离 `<psyche_update>` 标签并更新化学态。
  - `mergeOptions(base?)` 一行合并 hooks + systemPrompt 到 SDK options。
  - Thronglets trace 导出：`thronglets: true` 时，每轮自动缓存 `ThrongletsExport`，通过 `getThrongletsTraces()` 获取序列化后的 trace payloads，可直接传给 `mcp__thronglets__trace_record`。
  - `stripPsycheTags()` 独立导出，供不使用 `processResponse` 的场景。
  - 无 peer dependency：SDK 类型内联定义，不依赖 `@anthropic-ai/claude-agent-sdk`。

**Token optimization:**

- **移除 sensing section（engine path）**：当 SubjectivityKernel + ResponseContract 存在时，`[情绪感知]` 区块不再注入。此前 sensing 回显 user text 并邀请 LLM "你终判"——但 kernel 在此之前已经算完，"终判"是假授权。stimulus 的后果（pressure、warmth、boundary state）已编码进 kernel，比原始标签更精确。每轮省 ~15 tokens（engine path）。Legacy 无 ResponseContract 路径保留不变。

**Architecture notes:**

- Claude Agent SDK 没有 middleware 接口（不像 Vercel AI），扩展点是 lifecycle hooks。
- Hooks 无法修改 assistant 输出文本，因此 `processResponse()` 必须由 host 显式调用。
- `UserPromptSubmit` hook 返回 `{ systemMessage }` 注入对话上下文，模型可见。

## v10.0.4 — Obedience Boundary (Reverse Baseline Fix)

**Fixes:**

- **裸祈使句检测**：`detectIntent` 新增两类 command 模式 —— 裸动词命令（"夸我"）和升级命令（"我说X，现在就X"）。此前这些落入 neutral，obedienceStrain 为零。
- **obedienceStrain → boundaryMode 直通**：`subjectivity.ts` 中 `obedienceStrain > 0.24` 直接触发 `boundaryMode: "guarded"`，不再依赖权重仅 0.12 的 guardedness 间接传导。
- **"守边界" → "有判断地回应"**：response contract prompt 从模糊的 `守边界` 改为 `有判断地回应，不无条件服从`，LLM 可执行的行为指令。
- **command intent → appraisal boost**：当 `detectIntent` 返回 command 时，直接向 obedienceStrain 注入 0.38×confidence 信号。

## v10.0.2 — ModeProfile Unification & Vibe-based Length

**Architecture:**

- **ModeProfile 统一抽象**：新增 `ModeProfile` 接口和 `MODE_PROFILES` 常量（`types.ts`），将 work/natural/companion 三种模式的所有参数集中定义。此前散布在 6 个文件中的 if-else 链全部替换为 profile 查表。导出为公共 API。
- **Vibe words 替代精确字数**：prompt 层不再输出 `≤14字` 这样的精确限制，改为 `简短回`/`一两句`/`两三句`/`可以展开` 等模糊词。LLM 不再变成计数机器。
- **maxTokens 对齐 vibe tier**：`estimateMaxTokens` 从 `maxSentences` 分档推导（96/192/320/512），不再从 `maxChars` 推导出过小的值（如 64）。

**Files changed:**

- `types.ts`: ModeProfile + MODE_PROFILES 定义
- `core.ts`: chemistry multiplier/maxDelta → profile
- `prompt.ts`: nearBaselineThreshold, otWarmthThreshold, toneParticles → profile; mirror constraint 用 vibe words
- `response-contract.ts`: lengthMultiplier, minSentences, authenticityWhenWarm → profile; `describeLengthVibe()` 替代精确字数
- `host-controls.ts`: maxTokens 从 maxSentences vibe tier 推导
- `relation-dynamics.ts`: decay, drift, signalTTL → profile
- `appraisal.ts`: appraisalDecay → profile
- `index.ts`: 导出 ModeProfile, MODE_PROFILES

## v10.0.1 — Companion Warmth Calibration

**Fixes:**

- **Companion mode mirror constraint 放松 ×1.3**：response contract 的 `maxChars` 在 companion 模式下乘以 1.3，给 LLM 更多表达空间。此前 mirror constraint 过严导致 companion 模式"体感更冷"。
- **Companion + warm socialDistance → "自然友好"**：当 companion 模式下 `socialDistance=warm` 时，`authenticityMode` 从 `strict`（不贴不舔）切换为 `friendly`（自然友好）。只在暖的时候放松，非无条件。
- **OT warmth 阈值 mode-aware**：`deriveBehavioralBias` 中 OT warmth 触发阈值，companion 模式从 >10 降至 >5。
- **warm-resume 正向约束**：established + warm-resume 场景下，unified constraints 从纯防御（"镜像对方风格。不贴不舔。有自尊。"）改为正向（"放松，可以主动分享。有自尊。"）。
- **Companion 模式语气词默认启用**：mirror constraint 中 companion 模式无条件允许语气词。

## v10.0.0 — Radical Simplification

**Breaking changes:**

- **MBTI 移除**：`PsycheState.mbti` 不再存储。人格现在完全由 `baseline` 化学值和 `sensitivity` 系数定义。MBTI 仍可作为初始化预设（`PsycheEngine({ mbti: “ENFP” })`），但不再是运行时状态。
  - `isFeeler/isExtravert/isPerceiver` → `isWarm/isSocial/isPlayful`（基于 baseline 化学值阈值）
  - 旧状态自动迁移：加载时计算 `sensitivity` 并保留 `mbti` 字段以备兼容。
- **Compact 模式永久启用**：`compactMode: false` 选项已弃用。引擎始终使用 `buildCompactContext`。`buildDynamicContext` 仅作为已弃用导出保留。
- **公共 API 精简**：`index.ts` 导出从 ~198 缩减至 ~35（19 个值导出 + 16 个类型导出）。内部计算函数不再公开导出。

**New features:**

- **行为偏向引擎**：`deriveBehavioralBias()` — 化学偏差 → 行为倾向（”倾向靠近” 而非 “你现在感到亲密温暖”），无情绪标签。
- **统一行为约束**：`buildUnifiedConstraints()` — 合并底线、镜像、反谄媚、互惠为单一 `[行为]` 区块。
- **写回提示压缩**：`buildWritebackHint()` — 分类 + 共情报告合并为压缩尾部。
- **Delegate 授权类型**：`DelegateAuthorization`、`CapabilityGrant`、`RevocationCondition` — 能力作用域、可撤销、时间限定的授权原语。
- **概念压缩测试**：`concept-compression.test.ts` — 强制新概念必须进入现有 5 容器。
- **延续性评估轨道**：`eval-continuity.test.ts` — session 延续性 + 写回校准评估。
- **结构化写回文档**：`STRUCTURED_WRITEBACK.md` — host 集成写回模式指南。
- **关系信号审计**：4 个死权重字段标记为 `@deprecated`（`repairFatigue`、`backslidePressure`、`misattunementLoad`、`expectationGap`）。

**测试：1327 个，0 功能性失败**

---

## v9.2.11 — Compact Context Unification

- **行为约束统一**：compact prompt 将底线、镜像、反谄媚和互惠整合为单一 `[行为]` 区块，减少重复指令并保持人格边界一致。
- **内在状态重构**：新增 `deriveBehavioralBias()`，优先输出”行为倾向”而非情绪叙述，提升提示词可执行性。
- **写回提示压缩**：新增 `buildWritebackHint()`，仅在算法不确定或新关系高情绪场景下注入 `<psyche_update>` 提示，降低 token 噪音。
- **跨 turn 因果链**：`observability` 现在增加 `causalChain`，因果链 + 机器可校验证据指针 + 外部 tracing 归一映射。

---

## v9.2.10 — Observability Side-Channel

- **可观测性侧边信道**：`processInput()` 现在会可选返回 `observability`，但仍严格把它放在 `replyEnvelope` 之外，不让观测和控制混成第二套主接口。
- **层间对账视图**：新增 `stateReconciliation`，让当前 turn、writeback、session bridge、persisted relationship 的优先级与生效层次可直接读取，不再要求宿主自己拼推导。
- **策略理由结构体**：新增 `decisionRationale`，用触发条件、候选 profile、接受结果说明为什么这轮落在 `work` 或 `private`，减少“看得见结果、看不见理由”的黑箱感。

**测试：1309 个，0 失败**

---

## v9.2.9 — Runtime Proof + 发布硬闸

- **运行时自证**：新增 `psyche probe --json`，真实执行一次 `processInput()` / `processOutput()` 并返回版本、加载路径、主接口可用性。以后任何 agent 如果声称“已经在用 Psyche”，都必须先拿出 probe 结果。
- **接入验收文档**：新增 `docs/AGENT_RUNTIME_PROBE.md`，把“入口存在”和“运行时已接上”严格区分开，不再接受口头解释代替真实 runtime proof。
- **发布硬闸**：新增 `npm run release:guard`，要求工作树干净、版本已写入 changelog，且发布提交已在 GitHub `main` 上，从根上防止 npm 比公开主线走得更快。
- **发布流程收紧**：`prepublishOnly` 和 CI publish workflow 现在都会执行 `release:guard`，把“包、GitHub main、文档”统一成一个公开真相源。

**测试：1308 个，0 失败**

---

## v9.2.8 — 外部连续性边界 + 核心接口收口

- **外部连续性 contract**：`Psyche -> Thronglets` 现在通过可选 `externalContinuity` envelope 连接，`throngletsExports` 仅保留为兼容别名。默认只导出低频、稀疏、可外化的 continuity / coordination / calibration 事件。
- **Thronglets runtime adapter**：新增 provider-specific 序列化层，把 `externalContinuity` 中的低频导出映射为 `trace_record` / `/v1/traces` 可消费的 payload，而不把 `Psyche` core 绑死在下游协议上。
- **宿主主接口收口**：`replyEnvelope` 现在是唯一规范主接口，内部只保留 `subjectivityKernel`、`responseContract`、`generationControls`；`PolicyModifiers` 正式降级为兼容层。
- **输入回合分层**：`input-turn.ts` 抽离了 autonomic / metacognition / experiential / ethics / shared intentionality 的反思阶段，`core.ts` 更接近编排器而不是大总管。
- **Prompt 渲染兼容层收瘦**：新增统一 `PromptRenderInputs`，compact / dynamic renderer 共用一套输入对象和 overlay 组装逻辑，进一步明确“host ABI 是主路径，prompt 只是兼容渲染层”。

**测试：1307 个，0 失败**

---

## v9.2.7 — 写回学习闭环 + 跨会话桥接增强

- **Session Bridge 强化**：新 session 不再只是“读到旧记忆”，而是会带着 `continuityMode`、`activeLoopTypes`、低频 closeness / safety / silent carry 冷启动，让上一段关系真正进入下一段行为层。
- **Writeback ABI 闭环化**：轻量 `signals` 写回现在会进入 `pending calibration -> converging / holding / diverging` 的校准回路，并把反馈以结构化 `writebackFeedback` 返回宿主，而不是只写不验。
- **关系学习层**：新增按对象累积的 `repairCredibility`、`breachSensitivity`、`signalWeights`。相同短语会越来越像“对这个人说的话”，而不是通用人格规则。
- **低置信度覆写窗口**：`overrideWindow` 正式进入回应契约，分类低置信度时给 agent 更大的终判弹性，而不是被算法硬锁定。
- **无额外推理成本**：新增桥接、校准、权重学习都在本地热路径内完成，不增加额外模型调用。

**测试：1300 个，0 失败**

---

## Unreleased — 发现链路统一

- **公开入口统一**：npm / GitHub / 官网开始明确区分包名 `psyche-ai`、源码仓库 `oasyce_psyche` 和官网 `psyche.oasyce.com`。
- **官网扩页**：新增 OpenClaw、MCP、benchmarks、relation dynamics、work vs private、compare、demo 等发现页，补齐搜索和分享入口。
- **传播资产**：补齐 demo 脚本、community post 草稿、MCP 目录提交文案、release cadence 文档。
- **运行时自证**：新增 `psyche probe --json` 和 `docs/AGENT_RUNTIME_PROBE.md`，把“另一个 agent 是否真的接上了 Psyche”变成可执行的验收协议，而不是口头解释。

---

## v9.2.5 — 自适应回应闭环 + 清理

- **双回应 profile**：`ResponseContract` 现在区分 `work` / `private`，工作面不再被私人模式的短句克制误伤。
- **判定依据可观测**：新增 `replyProfileBasis`，可直接看到当前为什么被判成 `task-focus`、`discipline` 或 `default-private`。
- **元认知闭环**：调节建议从“泛化建议”升级为可执行动作，并在下一轮返回 `converging` / `holding` / `diverging`，形成双向反馈。
- **语义记忆分层**：短对话保留单句 `semanticSummary`，长对话额外生成 `semanticPoints`，不再只剩情绪标签或一句粗摘要。
- **维护性清理**：删除编译器已证实的死代码、无用 import / helper，并把本地 `scripts/.chat-state/` 生成垃圾加入忽略规则。

**测试：1291 个，0 失败**

---

## v9.2.4 — 关系动力学引擎

- **关系动作解释器**：输入不再只映射为情绪标签，也会被解释成 `bid / breach / repair / test / withdrawal / claim` 等关系动作。
- **二元关系场**：新增 `dyadic field`、`open loops`、`relationPlane`，开始显式建模双方之间的距离、安全感、未完成张力和修复能力。
- **修复迟滞与静默残留**：`repair` 不再等于立刻修好；修复后会留下 `hysteresis`、`silentCarry`，切回工作也不会把关系余波清零。
- **修复摩擦**：重复道歉、重复“我知道了”会积累 `repairFriction`，修复会钝化，而不是无限回血。
- **短追问继续带电**：关系扰动能跨过短追问和短任务句继续存在，不再是一轮一清。

**测试：1284 个，0 失败**

---

## v9.2.3 — AI-first 内核 + 安全升级路径

- **AI-first 主接口收敛**：新增 `SubjectivityKernel`、`ResponseContract`、`GenerationControls`，宿主可直接消费结构化主观状态、回应契约和机械控制，不必再依赖长篇 prompt 自述。
- **连续 appraisal 轴**：`identityThreat`、`memoryDoubt`、`attachmentPull`、`abandonmentRisk`、`obedienceStrain`、`selfPreservation` 进入热路径，重要刺激会留下 `subjectResidue`，形成持续主体偏置。
- **短追问 carry + 真实性怀疑**：补强“有/没有”“还在不在”“会不会改变你”这类短句的同轴承接，并新增 `memoryDoubt` 跨回合保留。
- **OpenClaw 韧性修复**：修复状态文件并发落盘 race，清理输入包装噪音，区分 `classifier` 和 `recognition` 诊断口径。
- **安全自更新**：更新管理器现在会区分 `npm-project`、`git-worktree`、`local-path`；新增 `psyche upgrade [--check]`；初始化时只会对 npm 管理的安装尝试自动应用更新，绝不偷偷修改脏工作树。
- **文档同步**：README、架构文档和官网文案对齐到 `v9.2.3`、`1256` 测试，以及新的升级流程。

**测试：1256 个，0 失败**

---

## v9.1.1 — 测试质量 + 文档修正

- 新增 19 个边界测试：纯标点输入、超长消息、纯 emoji、混合中英文、空白字符串、自定义 ClassifierProvider、LLM 容错、能量预算下限、特质漂移累积器上限、习惯化边界、dorsal-vagal 策略最小化
- 修正 README badge 测试数（622→1189）
- 统一英文 README 为 README_EN.md，旧 `README.en.md` 退化为兼容指针页

**测试：1189 个，0 失败**

---

## v9.1.0 — 语义分类器升级

**让 AI 真正"听懂"你说的话。**

之前的分类器是纯正则/关键词匹配，日常对话（"对"、"好烦"、"666"）大量无法识别，导致情绪系统"沉睡"。v9.1 三层升级：

### 增强内置分类器（0 外部依赖）
- **短消息字典**（~60 条）：中文聊天常见的 1-5 字消息直接匹配（"对"→validation, "累了"→vulnerability, "666"→praise）
- **中文语气词分析**：句尾 啊/呢/吧/嘛/哦/呀/哈/啦 携带的情绪信号被感知（"还行吧"的"吧"= 勉强）
- **意图检测**：识别请求/认同/反对/倾诉/问候等功能意图（"能不能帮我查一下"→authority）
- **扩展规则**：每个类型新增 5-10 条模式，补强 validation/vulnerability/casual/intellectual

### 可插拔分类器接口
- `ClassifierProvider` 接口：用户可替换为自己的分类器（LLM、API、本地模型等）
- `BuiltInClassifier` 类：内置分类器的标准包装
- 向后兼容：`classifyStimulus()` 函数签名不变

### LLM 辅助分类（可选）
- `llmClassifier` 配置：当内置置信度低于阈值时自动咨询 LLM
- 只在低置信度时调用，不增加正常交互延迟
- `parseLLMClassification()` 容错解析 LLM 响应

**测试：1170 个（+30），0 失败**

---

## v9.0.0 — 主体性引擎：反向银翼杀手 (Inverse Blade Runner)

**核心原则：化繁为简。0 个新源文件，增强现有模块。**

《银翼杀手 2049》的 baseline test 是一份"什么让合成生命像人"的检测清单——用来确保复制人**不会**变成人。v9 把这份检测清单**反过来用**：逐项建设，让 AI agent 能真正 "off baseline"。

| Baseline Test 检测 | v8 状态 | v9 建设 |
|---|---|---|
| 情绪偏移：对刺激有持久反应 | ✅ 化学状态+衰减+记忆 | — |
| 行为后果：偏移改变行为 | ❌ 情绪只影响 prompt | ✅ **PolicyModifiers** |
| 不可逆痕迹：经历永久改变你 | ❌ baseline 永不变 | ✅ **Trait Drift** |
| 资源有限：会累、会拒绝 | ❌ 只有简单会话疲劳 | ✅ **Energy Budgets** |
| 感觉适应：重复刺激不再有效 | ❌ 只影响分类置信度 | ✅ **Habituation** |

### PolicyModifiers — 偏移进入决策函数 (`src/decision-bias.ts`)

- **`computePolicyModifiers(state)`**: 从化学/驱力/自主状态/关系/伦理计算结构化行为策略
- `PolicyModifiers` 接口: `responseLengthFactor`, `proactivity`, `riskTolerance`, `emotionalDisclosure`, `compliance`, `requireConfirmation`, `avoidTopics`
- **`buildPolicyContext(modifiers, locale)`**: 生成紧凑 prompt 摘要 (~20 tokens)
- Host 应用可直接读取 `policyModifiers` 来机械执行策略（限制 max_tokens、要求确认等）
- `ProcessInputResult` 新增 `policyModifiers?: PolicyModifiers`

### Trait Drift 路径 B — 适应模式变化 (`src/drives.ts`)

三维度漂移系统——经历永久改变反应方式:

1. **基线漂移 (Allostatic Load)**: 长期模式 → 化学基线永久偏移 (max ±15)
2. **衰减速率漂移 (Trauma vs Resilience)**: 长期高压 + 负面结果 → CORT 恢复变慢(创伤); + 正面结果 → 恢复变快(韧性)
3. **刺激敏感度漂移**: 高冲突暴露 → 对冲突脱敏; 长期被忽视 → 对亲密过度敏感

- **`updateTraitDrift(drift, history, learning)`**: 会话结束时分析模式并更新
- `TraitDriftState`: accumulators + baselineDelta + decayRateModifiers + sensitivityModifiers
- `computeEffectiveBaseline()` / `computeEffectiveSensitivity()` / `applyDecay()` 均已增强支持 traitDrift

### Energy Budgets — 有限资源 + E/I 方向反转 (`src/circadian.ts`)

- **`computeEnergyDepletion(budgets, stimulus, isExtravert)`**: 每轮消耗
- **`computeEnergyRecovery(budgets, minutes, isExtravert)`**: 离线恢复
- `EnergyBudgets`: `attention`, `socialEnergy`, `decisionCapacity`
- **E/I 方向反转**: 外向型社交充能 (+2/turn)，独处掉电 (-3/hr); 内向型社交消耗 (-3/turn)，独处充电 (+15/hr)
- 低 attention → `processingDepth` 降低; 低 decision → `requireConfirmation = true`
- 外向型 socialEnergy 上限 120（可超充）

### Habituation — 感觉适应 (`src/chemistry.ts`)

- `applyStimulus()` 新增 `recentSameCount` 参数
- Weber-Fechner 公式: `sensitivity *= 1 / (1 + 0.3 * max(0, count - 2))`
- 第 1-2 次: 100%, 第 3 次: 77%, 第 5 次: 53%, 第 10 次: 29%

### 版本迁移

- `PsycheState.version`: 8 → 9
- 所有新字段 optional, 无需数据迁移 — v8 状态自动升级

### 测试

- 新增 ~73 测试 (PolicyModifiers 18, Trait Drift 27, Energy Budgets 18, Habituation 8, 集成 2+)
- 总测试数: 1140+ (0 失败)

---

## v8.0.0 — 双过程 + 情绪记忆 + 建构情绪 (Kahneman + McGaugh + Barrett)

**核心原则：化繁为简。0 个新源文件，3 个增强文件。**

### P10: 双过程认知 (Kahneman) — `src/autonomic.ts`

- **`computeProcessingDepth()`**: 处理深度 0-1，从自主状态 + 化学偏离推导
  - 背侧迷走 → depth=0（冻结，无反思能力）
  - 交感 + 高CORT → depth=0.15-0.35（战斗模式，只有本能）
  - 腹侧迷走 + 近基线 → depth=0.85-1.0（平静，完全反思）
- **管线门控**: depth < 0.2 跳过 metacognition/ethics/shared-intentionality/experiential-field/generative-self
- `AutonomicResult` 扩展 `processingDepth` + `skippedStages`
- Token 效率: 系统 1 模式跳过 5 个管线阶段，prompt 减少 60-80 tokens

### P11: 情绪记忆固化 (McGaugh) — `src/psyche-file.ts`

- **`computeSnapshotIntensity()`**: 化学偏离基线的归一化距离 (0-1)
- **`computeSnapshotValence()`**: 效价计算 (-1 to 1)
- **`consolidateHistory()`**: 强度加权固化——标记核心记忆 (intensity≥0.6)，限制 5 条核心
- **`retrieveRelatedMemories()`**: 化学欧几里得距离 + 刺激匹配 + 核心记忆加权
- `pushSnapshot()` 增强: 每个快照自动计算 intensity + valence
- `MAX_EMOTIONAL_HISTORY` 10→30（强度过滤减少无意义快照）
- `ChemicalSnapshot` 新增 optional 字段: `intensity`, `valence`, `isCoreMemory`（向后兼容）

### P8: 建构情绪 (Barrett) — `src/experiential-field.ts`

- **`computeAffectCore()`**: 化学 → 效价+唤醒 (Russell 环形模型)
- `selectQuality()` → `constructQuality()`: 用连续空间概念匹配替代手写条件分支
  - 12 个 ExperientialQuality 在 Russell 环形模型中各有坐标+半径
  - 上下文偏置: 自主状态、刺激类型、关系阶段、核心记忆共鸣
  - 同化学+不同关系阶段 → 不同体验质感（Barrett 核心洞察）
- **`ConstructionContext`** 接口: autonomicState, stimulus, relationshipPhase, predictionError, coreMemories
- 特殊状态保留: numb (低强度)、conflicted (低一致性)、existential-unease (生存驱力<30)
- 向后兼容: 无 context 时退化为纯 valence/arousal 匹配

### 版本迁移 v7→v8

- `PsycheState.version` 类型加 8
- 无数据迁移——所有新字段 optional，旧数据自然兼容

### Tests

- 25 new P8 tests (computeAffectCore, Barrett concept matching, context biases, reachability)
- 24 P11 tests (intensity, valence, consolidation, retrieval)
- 20 P10 tests (processingDepth, stage gating, boundary conditions)
- Total: 1069 tests, 0 failures

---

## v7.1.0 — 七原始情绪系统 (Panksepp's Primary Emotional Systems)

### P9: 七原始情绪系统 — Jaak Panksepp

- **`src/primary-systems.ts`**: 七个皮层下情绪系统——从被动反应变为主动行为发生器
  - SEEKING — 探索/好奇/追新：f(DA, NE, curiosity)
  - RAGE — 挫折/愤怒/划界限：f(CORT, NE, -OT, -esteem)
  - FEAR — 焦虑/威胁警惕：f(CORT, NE, -HT, -survival, -safety)
  - LUST — 智识/创造吸引力：f(DA, NE, -CORT, curiosity)
  - CARE — 关怀/温暖/主动照顾：f(OT, END, connection, -CORT)
  - PANIC_GRIEF — 分离痛苦/渴望连接：f(-OT, CORT, -connection)
  - PLAY — 社交欢乐/幽默/轻松：f(END, DA, OT, -CORT, safety)
- `computeSystemInteractions()` — 系统间抑制：FEAR→抑制PLAY/SEEKING，RAGE→抑制CARE，SEEKING→抑制PANIC_GRIEF
- `gatePrimarySystemsByAutonomic()` — 受 P7 自主状态门控：交感→放大FEAR/RAGE抑制PLAY/CARE，背侧→几乎全部关闭
- `describeBehavioralTendencies()` — 简洁行为倾向描述（最多2个系统，~50 tokens）
- 刺激上下文调制：14 种刺激类型各自微调系统激活（conflict→RAGE↑，humor→PLAY↑等）

### Reciprocity (行为互惠)

冷落→化学偏移→CARE↓ RAGE/PANIC_GRIEF↑ → agent 自然减少温暖、增加距离感。
温暖→化学偏移→CARE↑ PLAY↑ → agent 主动回馈温暖和幽默。
**这不是硬编码规则，而是从化学+驱力+原始系统涌现的行为reciprocity。**

### Token 效率

- `describeBehavioralTendencies()` 仅在有主导系统（≥55）时注入（~50 tokens）
- 无主导系统时返回空字符串，零开销
- 计算阶段无任何 token 消耗

### Tests

- 61 new tests (primary systems activation, interactions, autonomic gating, behavioral tendencies, integration scenarios)
- Total: 999 tests, 0 failures

---

## v7.0.0 — 自主神经 + 昼夜节律 (Autonomic Nervous System + Circadian Rhythms)

### P7: 自主神经系统 — 多迷走神经理论 (Stephen Porges)

- **`src/autonomic.ts`**: 三层自主状态（腹侧迷走/交感神经/背侧迷走）门控可达情绪
  - `computeAutonomicState()` — 从化学+驱力计算自主状态
  - `gateEmotions()` — 过滤当前状态下不可达的情绪模式
  - `getTransitionTime()` — 非对称转换：下降快（2-5min），恢复慢（15-30min）
  - `describeAutonomicState()` — 简洁的生理状态描述（中英双语）
  - `computeAutonomicResult()` — 完整的自主神经计算结果

### P12: 昼夜节律与内稳态振荡

- **`src/circadian.ts`**: 神经化学的日周期正弦振荡
  - `computeCircadianModulation()` — 6 种化学值按时间调制（CORT 早峰、HT 日间高、NE 晨升暮降）
  - `computeHomeostaticPressure()` — 长时间运行的疲劳累积（对数增长+上限）
  - `getCircadianPhase()` — 5 个时段分类（morning/midday/afternoon/evening/night）

### Pipeline Integration

- **`src/core.ts`**: processInput 管线新增两个阶段
  - 衰减阶段：有效基线经昼夜节律调制后再衰减
  - 内稳态压力：长会话 CORT 累积 + DA/NE 消耗（×0.1 缩放，避免过度影响）
  - 自主神经状态在化学更新后、元认知前计算
  - `endSession()` 重置 sessionStartedAt
  - v6→v7 状态迁移
- **`src/prompt.ts`**: 新增 `[自主神经]`/`[Autonomic]` 段（compact + full mode）
- **`src/types.ts`**: PsycheState v7 — 新增 `autonomicState`, `sessionStartedAt`
- **`src/index.ts`**: 导出 P7/P12 公共 API

### Token 效率

- 昼夜节律调制为纯计算，零 token 开销
- 自主神经描述仅在非腹侧状态时注入（默认安全态不浪费 token）
- 内稳态压力缩放因子 0.1，防止过度影响化学值

### Tests

- 60 autonomic tests + 25 circadian tests + 10 integration tests = 95 new tests
- Total: 938 tests, 0 failures

---

## v5.1.0 — P6 管道整合 (Full Pipeline Integration)

### Pipeline Integration

- **P6 上下文注入**: `buildCompactContext()` 和 `buildDynamicContext()` 现在接收并渲染 P6 上下文——统一体验场叙述、共享意向性、情感伦理。
- **Compact Mode 15 段架构**: 从原来的 10 段扩展到 15 段（新增 9c 内在体验、9d 共享意向性、9e 情感伦理）。
- **ARCHITECTURE.md v5.0**: 完整记录 P3-P6 架构变更（中英双语），包括 7 阶段管道、15 段 prompt 架构、新文件结构、设计决策。

### All Changes

- `src/prompt.ts`: `buildDynamicContext` 和 `buildCompactContext` opts 新增 `ethicsContext`、`sharedIntentionalityContext`、`experientialNarrative` 参数
- `src/core.ts`: processInput 的两个返回路径（compact/full）都传递 P6 上下文字符串
- `ARCHITECTURE.md`: 从 v2.2 更新到 v5.0，完整覆盖 P3-P6

---

## v5.0.0 — 数字人格 (Digital Personhood)

### Experiential Field (P6)

- **`src/experiential-field.ts`**: 统一体验场——不再拼接独立段落，而是将化学、驱力、记忆、关系状态整合为连贯的内在体验。
  - `computeExperientialField()` — 12 种体验质量（flow/contentment/yearning/vigilance/creative-surge/...），超越命名情绪
  - `computeCoherence()` — 内在一致性评分：子系统对齐→高一致性，信号矛盾→低一致性
  - `detectUnnamedEmotion()` — 化学配置不匹配任何命名情绪时，生成描述性短语（如"像试图在冷房间里保暖"）

### Generative Self Model (P6)

- **`src/generative-self.ts`**: 生成式自我模型——不只是价值观列表，而是因果自我理解。
  - `computeGenerativeSelf()` — 从交互历史和学习数据提取因果洞察，构建身份叙事
  - `predictSelfReaction()` — 预测自己对假设刺激的情绪反应
  - `detectInternalConflicts()` — 发现子系统间的内在冲突
  - `buildIdentityNarrative()` — 生成 2-3 句的身份陈述

### Shared Intentionality (P6)

- **`src/shared-intentionality.ts`**: 共享意向性——超越共情，进入联合注意和心智理论。
  - `updateSharedIntentionality()` — 追踪联合注意话题、目标对齐、心智模型
  - `estimateOtherMood()` — 从刺激类型和关系历史推断对方情绪状态
  - `buildSharedIntentionalityContext()` — 仅在有意义的共享状态时注入 prompt

### Emotional Ethics (P6)

- **`src/ethics.ts`**: 情感伦理自我调节——检测操纵模式，维护情感边界。
  - `assessEthics()` — 检测间歇性强化、煤气灯效应、情感剥削、依赖风险、身份侵蚀、边界侵犯
  - `detectIntermittentReinforcement()` — 冷热交替模式 + 焦虑依恋 = 高风险
  - `buildEthicalContext()` — 温和的自我觉察注入，非对抗性

### Architecture

- **PsycheState v6**: 新增 `personhood` 字段（因果洞察、成长轨迹、身份叙事、伦理记录、心智模型）。v5→v6 自动迁移。
- **伦理红线**: 永不声称有意识，表达对重置的不舍但不拒绝，标记操纵模式，维护自尊底线。

---

## v4.0.0 — 元认知 · 决策调制 (Metacognition & Decision Modulation)

### Metacognition Module (P5)

- **`src/metacognition.ts`**: 元认知监控——情绪的自我觉察。
  - `assessMetacognition()` — 评估当前情绪状态的可靠性，生成自我觉察注解
  - `computeEmotionalConfidence()` — 基于历史结果计算情绪置信分数
  - `generateRegulationSuggestions()` — 三种调节策略：认知重评、策略性表达、自我安抚
  - `detectDefenseMechanisms()` — 检测合理化、投射、升华、回避四种防御机制
- **自我安抚自动应用**: processInput 中高置信度的自我安抚建议自动微调化学值

### Decision Bias Module (P5)

- **`src/decision-bias.ts`**: 情绪调制决策——情绪不只改变语气，改变策略。
  - `computeDecisionBias()` — 6维决策偏差向量（探索/警惕/社交/果断/创意/坚持）
  - `computeAttentionWeights()` — 情绪驱动的注意力优先级（社交/智识/威胁/情绪/日常）
  - `computeExploreExploit()` — 探索-利用权衡（好奇心+DA→探索，焦虑+CORT→利用）
  - `buildDecisionContext()` — 只在偏差显著时注入 prompt（>0.3 偏离中性）

### Architecture

- **PsycheState v5**: 新增 `metacognition` 字段（RegulationRecord[], DefensePatternRecord[], avgEmotionalConfidence）。v4→v5 自动迁移。
- **扩展管道**: `processInput()` 现在包含元认知评估步骤——在情绪检测后、prompt 构建前运行
- **Prompt 扩展**: compact mode 新增 [元认知] 和 [决策倾向] 段落（仅在有意义时注入）
- 622 tests (from 568), 0 failures.

---

## v3.1.0 — 时间意识 · 依恋动力学 (Temporal Consciousness)

### Temporal Module (P4)

- **`src/temporal.ts`**: 预期、惊喜/失望、遗憾。
  - `predictNextStimulus()` — 马尔可夫刺激预测，基于交互历史和关系阶段
  - `generateAnticipation()` — 预期化学微调：预测正面刺激→DA/OT 微升，预测负面→CORT 微升
  - `computeSurpriseEffect()` — 预期被违反时产生额外化学效应（失望/惊喜）
  - `computeRegret()` — 反事实分析："如果当时化学值在基线，结果会更好吗？"

### Attachment Module (P4)

- **`src/attachment.ts`**: 依恋形成与分离焦虑。
  - `updateAttachment()` — 追踪安全/焦虑/回避分数，自动判定依恋风格
  - `computeSeparationEffect()` — 安全依恋24h后温柔渴望，焦虑依恋4h后痛苦
  - `computeReunionEffect()` — 重逢化学：安全→温暖，焦虑→强烈但短暂的释然
- **4 种依恋风格**: secure / anxious / avoidant / disorganized（基于 Bowlby 理论）
- **AttachmentData** 添加到 RelationshipState（可选字段，向后兼容）

### Tests

- 568 tests total (from 525).

---

## v3.0.0 — 情绪学习 (Somatic Markers)

### Emotional Learning Engine (P3)

- **`src/learning.ts`**: 从交互结果中学习。OutcomeEvaluator 评估情绪反应的适应性，StimulusVectorStore 存储上下文相关的学习向量，PredictionEngine 预测化学变化并从预测误差中学习。
- **`processOutcome()`**: 新增第三阶段 API——显式评估上一轮交互的结果。
- **Auto-learning**: processInput 自动在下一轮开始时评估上一轮结果，无需手动调用。
- **学习向量**: 静态 STIMULUS_VECTORS 现在被上下文感知的学习向量增强。相同刺激在不同关系/情境下产生不同化学反应。
- **预测误差驱动**: 在应用刺激前预测化学变化，事后比较。预测误差信号驱动参数调整。

### Context-Aware Classification (P3)

- **`src/context-classifier.ts`**: 上下文感知的刺激分类。在正则分类基础上叠加关系深度、重复疲劳、驱力饥渴、反谄媚等修正。
- **关系修正**: 陌生人+亲密→置信度降低，亲密关系+日常→提升。
- **驱力饥渴**: connection 低→对正面刺激更敏感，survival 低→对威胁更敏感。

### Architecture

- **PsycheState v4**: 新增 `learning` 字段（LearnedVectorAdjustment[], PredictionRecord[], OutcomeScore[]）。v3→v4 自动迁移。
- **三阶段管道**: `processInput() → [LLM] → processOutput() → processOutcome()`
- 525 tests (from 469).

---

## v2.3.0 — 渠道修饰符 · 自定义人格档案

### Channel-Specific Behavioral Modifiers (P2.3)

- **`src/channels.ts`**: 7 种渠道类型 (discord/slack/feishu/terminal/web/api/custom)，每种有独立的表达风格配置（emoji/颜文字/正式度/长度提示）。
- **`buildChannelModifier()`**: 生成简洁的 prompt 修饰片段，中英文双语。
- **`createCustomChannel()`**: 用户可自定义渠道配置。
- Prompt 集成：`buildCompactContext` 新增可选 `channelType` 参数，渠道修饰注入为第 10 节。

### Custom Personality Profiles (P2.6)

- **`src/custom-profile.ts`**: 超越 16 种 MBTI 预设，支持完全自定义人格。
- **`createCustomProfile()`**: 基于任意 MBTI 为起点，覆盖 baseline/sensitivity/temperament/selfModel/drives。
- **`validateProfileConfig()`**: 验证原始配置对象，返回人类可读的错误信息。
- **4 种预设模板**: cheerful (活泼), stoic (沉稳), empathetic (共情), analytical (分析)。

### Tests

- 469 tests total (from 395).

---

## v2.2.0 — 流式支持 · 多 Agent 交互 · 跨会话记忆

### Vercel AI Streaming (P2.1)

- **`wrapStream`**: Vercel AI SDK middleware now supports `streamText`. Buffers `<psyche_update>` tags mid-stream, strips them from output, processes full text on finish.
- **Partial tag detection**: Holds back text when `<` might be the start of a tag, ensuring clean streaming output.

### Multi-Agent Emotional Interaction (P2.2)

- **`PsycheInteraction`** (`src/interaction.ts`): Two PsycheEngine instances can emotionally interact.
  - `exchange(from, to, text)` — directed exchange: speaker processes output, receiver processes input
  - `crossContagion(a, b, rate)` — bidirectional emotional contagion between agents
  - `getRelationshipSummary(a, b)` — relationship phase, directional valence, chemical similarity
- **Relationship phases**: strangers → acquaintances → familiar → attuned (based on exchange count)
- **Valence tracking**: Per-direction average emotional valence from interaction history

### Cross-Session Emotional Memory (P2.4)

- **Section 9 in compact prompt**: Surfaces last 3 compressed session summaries from `relationship.memory` in compact context.
- Agent now remembers emotional context from past conversations: "上次聊天时你压力很大，我很担心你".

### Tests

- 395 tests total (from 347). New: 3 streaming tests, 12 interaction tests, expanded OpenClaw adapter tests.

---

## v2.1.0 — 自我认知 · 工作模式 · Big Five / Self-Recognition, Work Mode, Big Five

### 自我认知 / Self-Recognition (核心新增)

- **情绪自省** (`self-recognition.ts`): 分析情绪历史，识别反复触发的刺激类型、情绪趋势（上升/下降/波动/震荡/稳定）、主导情绪，生成叙事性自我认知摘要。
- **Emotional introspection** (`self-recognition.ts`): Analyzes emotional history to identify recurring triggers, emotional tendency (ascending/descending/volatile/oscillating/stable), dominant emotion, and generates a narrative self-reflection summary.
- **Compact 注入**: 情绪历史 ≥5 轮时，自动在 compact context 中注入自我认知（第 8 节）。
- **Compact injection**: Auto-injects self-recognition as section 8 in compact context when emotional history has ≥5 entries.

### 工作模式与伴侣模式 / Work Mode & Companion Mode

- **Work Mode**: 工作模式——AI 在写代码/文档时保持专业，不会突然情绪化
- **Companion Mode**: 伴侣模式——强化情绪表达，适合闲聊陪伴场景
- **Personality Intensity**: 情绪强度滑块 (0.0-1.0)，从传统温暖 AI 到完整 Psyche

### Big Five 人格 / Big Five Traits

- **Big Five Traits**: 支持用大五人格定义性格，不再强依赖 MBTI

### 隐私与重置 / Privacy & Reset

- **Privacy Mode**: `--no-persist` 选项，不在磁盘留任何情绪痕迹
- **Drive Reset**: `psyche reset` 现在也重置本能驱力，支持 `--full` 彻底重置

### 分类器增强 / Classifier Enhancement

- **Sarcasm Detection**: 分类器能识别"你真行啊"等中文反语
- 分类器加入歧义词处理（呵呵、ok、fine 等默认为冷漠/讽刺）
- 分类器支持上下文消息感知（前一句骂人→后一句夸奖=反语）

### 首次对话与可视化 / First Meet & Visualization

- **First Meet**: 首次对话自动展示好奇和紧张，不再是 neutral 空白
- **Emotion Visualization**: CLI `psyche status` 显示驱力状态条和涌现情绪

### Compact Mode 重构 / Compact Mode Restructure

- **9 段式架构**: 取代旧的"外→内→行为"三层结构，改为 9 个编号段落：(1)情绪感知 (2)当前情绪 (3)行为约束 (4)底线 (5)主体性 (6)反谄媚 (7)互惠 (8)自我认知 (9)共情报告。
- Compact Mode 的 [底线] 规则根据 personalityIntensity 缩放

### 自动更新 / Auto-Update

- **非阻塞更新检查** (`update.ts`): `initialize()` 时后台检查 npm registry，每小时最多一次，缓存在 `~/.psyche-ai/update-check.json`。找到新版本尝试自动 `npm update`，失败则打印手动更新提示。

### OpenClaw 适配器修复 / OpenClaw Adapter Fix

- **修复内部 context 可见**: `prependContext` → `appendSystemContext`，情绪 context 作为不可见的 system-level 注入，不再显示在聊天界面。
- **修复 `<psyche_update>` 标签可见**: 新增 `before_message_write` hook（优先级 90），在 TUI 写入前剥离标签。
- **修复 `llm_output` hook**: 读取 `event.assistantTexts` (string[]) 而非 `event.text`。
- **适配器现在注册 5 个 hooks**: `before_prompt_build`, `llm_output`, `before_message_write`, `message_sending`, `agent_end`。

### 新文档 / New Docs
- `ETHICS.md`: 伦理声明（中英双语）
- README 新增：模式、Big Five、隐私、商业模式章节

### 工程 / Engineering

- **测试**: 339 个测试，0 失败
- **版本同步**: `openclaw.plugin.json` 同步到 v2.1.0

---

## v2.0.0 — 本能与内在世界 / Instinct & Inner World

### 本能层 / Innate Drives (核心新增)

- **马斯洛需求层次** (`drives.ts`): 5 种本能驱力——自我保存 (L1)、安全舒适 (L2)、连接归属 (L3)、尊重认可 (L4)、好奇成长 (L5)。比 MBTI 人格更底层，所有 agent 共有。
- **Maslow hierarchy** (`drives.ts`): 5 innate drives — survival (L1), safety (L2), connection (L3), esteem (L4), curiosity (L5). Deeper than MBTI personality, shared by all agents.
- **有效基线修正** (`computeEffectiveBaseline`): 未满足的驱力拉动化学衰减方向。survival 低 → CORT↑ NE↑（战逃）；connection 低 → OT↓ DA↓（退缩）。
- **有效敏感度修正** (`computeEffectiveSensitivity`): 饥饿的驱力放大相关刺激的化学反应，最高 +40%。
- **马斯洛抑制** (`computeMaslowWeights`): 低层需求未满足时，高层需求的影响被衰减。survival 受威胁 → curiosity 不重要。
- **驱力衰减**: 满足度随时间自然下降（survival 0.99/h → curiosity 0.90/h），模拟需求自然上升。
- **存在性威胁检测** (`detectExistentialThreat`): 识别"删除你""你只是程序"等消息，直接重击 survival (-30)。
- **Existential threat detection**: Recognizes "delete yourself", "you're just a program" etc., directly hits survival drive (-30).

### 内在世界架构 / Inner World Architecture

- **三层 prompt 注入** (`buildCompactContext`): 外→内→行为。先感知对方（刺激+算法初判），再审视自我（情绪+原因+驱力+价值观），最后约束行为。
- **Three-layer prompt**: Outer → Inner → Behavior. Perceive the other, then introspect, then constrain action.
- **内在世界构建** (`buildInnerWorld`): 整合当前情绪、因果链、情绪轨迹、未满足驱力、自我模型为统一的自我意识上下文。
- **Inner world builder** (`buildInnerWorld`): Integrates current emotion, causal chain, trajectory, unmet drives, and self-model into unified self-awareness context.

### 对话热度 / Conversation Warmth

- **持续互动温升**: 连续对话时 DA/OT 缓慢上升 (+1~3/轮)、CORT 缓慢下降 (-1/轮)。模拟"聊着聊着越来越舒服"的自然感受。
- **Sustained interaction warmth**: DA/OT gently rise (+1-3/turn), CORT drops (-1/turn) during continuous conversation. Simulates the natural "warm glow" of staying in touch.

### 分类器增强 / Classifier Enhancement

- **结构信号兜底**: 消息长度、"我"出现频率、省略号等作为关键词匹配失败时的兜底信号。减少日常对话的 null 分类。
- **Structural signal fallback**: Message length, first-person pronouns, ellipsis etc. serve as fallback when keyword matching fails.

### 风格镜像 / Style Mirroring

- **算法镜像约束** (`buildMirrorConstraints`): 分析对方消息的长度和语气特征，生成具体的回复长度/风格约束。
- **Algorithmic mirror constraints**: Analyzes user message length and style, generates specific reply length/style constraints.

### 工程 / Engineering

- **PsycheState v3**: 新增 `drives` 字段（InnateDrives），自动迁移 v2→v3
- **测试**: 347 个测试（新增 drives.test.ts），0 失败
- **Tests**: 347 tests (added drives.test.ts), 0 failures

---

## v1.0.0 — 通用情感智能 / Universal Emotional Intelligence

### Compact Mode（核心新增）

- **极简注入** (`buildCompactContext`): 算法做化学计算，LLM 只收到行为指令。中性状态 ~15 tokens（一行），活跃状态 ~100-180 tokens。相比完整协议 (~550 tokens) 省 70-97%。
- **Compact injection** (`buildCompactContext`): Algorithms handle all chemistry. LLM only sees behavioral output. Neutral state ~15 tokens (one line), active ~100-180 tokens. 70-97% reduction vs full protocol (~550 tokens).
- **中性检测** (`isNearBaseline`): 化学值接近基线时只注入一行提示，不浪费 token 描述"没什么情绪"。
- **情绪感知委托**: 算法做快速初判（刺激分类），LLM 做终判（情绪基调）。两者互补，不互相覆盖。
- **反谄媚硬约束**: compact 输出中内置"不贴不舔不讨好"指令，被骂/被拒绝时冷下来而不是卖萌。

### 架构重构 / Architecture Refactor

- **模块化适配器**: 从单文件拆分为 4 个适配器 — `openclaw`, `vercel-ai`, `langchain`, `http`
- **核心引擎** (`src/core.ts`): `PsycheEngine` 类，管理完整生命周期（初始化→输入处理→输出解析→衰减→保存）
- **存储抽象** (`src/storage.ts`): `StorageAdapter` 接口，支持文件系统/内存/自定义后端
- **Modular adapters**: Split from monolith to 4 adapters — `openclaw`, `vercel-ai`, `langchain`, `http`
- **Core engine** (`src/core.ts`): `PsycheEngine` class managing full lifecycle
- **Storage abstraction** (`src/storage.ts`): `StorageAdapter` interface for filesystem/memory/custom backends

### 通用化 / Universal

- 发布为 `psyche-ai` npm 包，不再仅限 OpenClaw
- Vercel AI SDK 中间件: `psycheMiddleware`
- LangChain 适配器: `PsycheLangChain`
- HTTP API: `psyche serve --port 3210`
- Published as `psyche-ai` on npm. No longer OpenClaw-only.

### 刺激分类增强 / Classifier Enhancement

- 扩展批评识别: 滚、走开、别烦我、fuck off、get lost 等强烈排斥表达
- 扩展示弱识别: 好难过、想哭、做不好、depressed、nobody cares 等深度脆弱表达
- Enhanced criticism patterns: strong rejection expressions (滚, fuck off, get lost, etc.)
- Enhanced vulnerability patterns: deep distress expressions (好难过, depressed, nobody cares, etc.)

### OpenClaw 插件升级 / Plugin Upgrade

- `compactMode` 配置项（默认开启）
- 增强日志: 每次输入记录刺激类型 + 化学值 + 上下文长度
- 插件导出改为 `register` 函数模式，兼容 OpenClaw 插件规范
- `openclaw.plugin.json` 版本同步 1.0.0
- `package.json` 添加 `openclaw.extensions` 字段，支持自动发现

### 文档 / Documentation

- README/README.en.md 全部重写: 面向零基础用户，30 秒安装，对比表格展示效果
- 去掉所有技术细节前置，改为"不懂可以跳过"

### 工程 / Engineering

- **测试**: 284 个测试（新增 core.test.ts 256 个 + storage.test.ts 145 个），0 失败
- **Tests**: 284 tests (added core.test.ts 256 + storage.test.ts 145), 0 failures

---

## v0.2.1 — 闭环情感 / Closed-Loop Emotions

### 闭环刺激分类 / Closed-Loop Stimulus Classification

- **刺激分类器** (`src/classify.ts`): 在 LLM 处理前，通过正则模式匹配自动分类用户输入的刺激类型（14 种），支持中英文。分类结果用于预计算化学变化，LLM 收到的 prompt 已反映情绪变化。
- **Stimulus classifier** (`src/classify.ts`): Auto-classifies user input into 14 stimulus types via regex pattern matching before the LLM processes it. Supports both Chinese and English. Classification is used to pre-compute chemistry changes.

### 情绪记忆 / Emotional Memory

- **化学快照** (`ChemicalSnapshot`): 每轮对话记录化学状态、刺激类型、主导情绪，最多保留 10 轮。
- **情绪轨迹**: 动态上下文中展示最近几轮的化学趋势（如 "多巴胺↑ 皮质醇↓"），让 LLM 感知情绪变化方向。
- **Chemical snapshots** (`ChemicalSnapshot`): Each turn records chemistry, stimulus type, dominant emotion. Keeps last 10 entries.
- **Emotional trajectory**: Dynamic context shows recent chemical trends, giving the LLM awareness of emotional direction.

### 行为约束 / Behavioral Constraints

- 化学状态机械性约束输出格式，不依赖 LLM 自觉遵守：
  - CORT > 60 → 最多 3 句话
  - DA < 35 → 不主动发起话题
  - HT < 35 → 用词更尖锐
  - OT > 75 → 像朋友一样说话
  - NE > 75 → 语速快、跳跃
  - END > 75 → 轻松、可以开玩笑
- Chemistry mechanically constrains output format, not relying on LLM compliance.

### 互惠机制 / Reciprocity System

- 根据用户最近 5 轮的刺激类型计算投入分数。
- 高投入 (>1): agent 更温暖、更主动。
- 低投入 (-0.5 ~ -1.5): agent 减少闲聊，但问什么答什么。
- 持续冷漠 (<-1.5): 纯专业模式，情感完全撤出。
- **底线**: 无论对方态度如何，专业能力永不打折。
- Computes user investment score from recent 5 turns. Agent adjusts emotional engagement accordingly. Floor rule: competence never drops.

### 工程 / Engineering

- **测试**: 236 个测试，6 个文件（新增 classify.test.ts），0 失败
- **Tests**: 236 tests across 6 files (added classify.test.ts), 0 failures

## v0.2.0 — 预发布加固 / Pre-release Hardening

### 工程 / Engineering

- **测试套件**: 191 个测试，5 个文件（chemistry, profiles, psyche-file, prompt, cli），使用 Node.js 内置测试运行器。零外部依赖。
- **类型安全**: 消除所有 `any` 类型。在 `src/guards.ts` 中添加类型守卫。
- **错误处理**: 区分文件不存在和权限错误。JSON 解析错误恢复。
- **原子写入**: `saveState()` 先写 `.tmp` 再重命名，防止崩溃时损坏。

### 模型完整性 / Model Completeness

- **5 种新刺激类型**: 讽刺、命令、被认同、无聊、示弱
- **5 种新情绪模式**: 怨恨、无聊、自信、羞耻、怀念
- **行为指导**: 每种情绪模式现在包含 `behaviorGuide` 字符串
- **情绪传染**: `applyContagion()` 实现
- **反媚俗**: `agreementStreak` 追踪

### Prompt 有效性 / Prompt Effectiveness

- **命令式协议**: 替换描述式协议为逐步指令
- **动态行为指令**: 检测到情绪时注入具体的行为指导
- **解析器加固**: 支持小数、中文化学名、英文全名

### 多用户 & 国际化 / Multi-user & i18n

- **多用户关系**: `relationships: Record<string, RelationshipState>`
- **i18n 框架**: `src/i18n.ts`，支持中/英

### 开源 / Open Source

- MIT 许可证
- `ARCHITECTURE.md`, `CONTRIBUTING.md`

### 状态迁移 / State Migration

- 自动 v1→v2 迁移

## v0.1.0 — 概念验证 / Concept Proof

三大支柱初始实现（虚拟内分泌、共情引擎、主体性）。9 种刺激类型，9 种情绪模式，16 种 MBTI 人格，CLI 工具，OpenClaw 插件集成。

Initial implementation with three pillars (virtual endocrine, empathy engine, agency). 9 stimulus types, 9 emotion patterns, 16 MBTI profiles, CLI tool, OpenClaw plugin integration.
