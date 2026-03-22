# 更新日志 / Changelog

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
