# 更新日志 / Changelog

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

## v2.1.0 — 自我认知与适配器修复 / Self-Recognition & Adapter Fix

### 自我认知 / Self-Recognition (核心新增)

- **情绪自省** (`self-recognition.ts`): 分析情绪历史，识别反复触发的刺激类型、情绪趋势（上升/下降/波动/震荡/稳定）、主导情绪，生成叙事性自我认知摘要。
- **Emotional introspection** (`self-recognition.ts`): Analyzes emotional history to identify recurring triggers, emotional tendency (ascending/descending/volatile/oscillating/stable), dominant emotion, and generates a narrative self-reflection summary.
- **Compact 注入**: 情绪历史 ≥5 轮时，自动在 compact context 中注入自我认知（第 8 节）。
- **Compact injection**: Auto-injects self-recognition as section 8 in compact context when emotional history has ≥5 entries.

### 自动更新 / Auto-Update

- **非阻塞更新检查** (`update.ts`): `initialize()` 时后台检查 npm registry，每小时最多一次，缓存在 `~/.psyche-ai/update-check.json`。找到新版本尝试自动 `npm update`，失败则打印手动更新提示。
- **Non-blocking update checker** (`update.ts`): Background npm registry check on `initialize()`, hourly rate limit, cached at `~/.psyche-ai/update-check.json`. Auto-updates if possible, prints manual hint if not.

### OpenClaw 适配器修复 / OpenClaw Adapter Fix

- **修复内部 context 可见**: `prependContext` → `appendSystemContext`，情绪 context 作为不可见的 system-level 注入，不再显示在聊天界面。
- **Fix internal context visibility**: Changed from `prependContext` to `appendSystemContext` for invisible system-level injection.
- **修复 `<psyche_update>` 标签可见**: 新增 `before_message_write` hook（优先级 90），在 TUI 写入前剥离标签。
- **Fix visible `<psyche_update>` tags**: Added `before_message_write` hook (priority 90) to strip tags before TUI display.
- **修复 `llm_output` hook**: 读取 `event.assistantTexts` (string[]) 而非 `event.text`。
- **Fix `llm_output` hook**: Read `event.assistantTexts` (string[]) instead of `event.text`.
- **适配器现在注册 5 个 hooks**: `before_prompt_build`, `llm_output`, `before_message_write`, `message_sending`, `agent_end`。
- **Adapter now registers 5 hooks**: `before_prompt_build`, `llm_output`, `before_message_write`, `message_sending`, `agent_end`.

### Compact Mode 重构 / Compact Mode Restructure

- **9 段式架构**: 取代旧的"外→内→行为"三层结构，改为 9 个编号段落：(1)情绪感知 (2)当前情绪 (3)行为约束 (4)底线 (5)主体性 (6)反谄媚 (7)互惠 (8)自我认知 (9)共情报告。
- **9-section architecture**: Replaces old "outer→inner→behavior" three-layer structure with 9 numbered sections: (1)emotional sensing (2)current emotion (3)behavioral constraints (4)non-negotiable (5)agency (6)anti-sycophancy (7)reciprocity (8)self-recognition (9)empathy report.

### 工程 / Engineering

- **测试**: 339 个测试，0 失败
- **Tests**: 339 tests, 0 failures
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
