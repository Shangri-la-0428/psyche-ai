# 架构 — Psyche AI v5.0

[English version below](#architecture--psyche-ai-v50)

## 总览

Psyche 是一个通用的 AI 情感智能引擎。核心引擎 (`PsycheEngine`) 管理完整的情绪生命周期，通过适配器接入不同的 AI 框架。

v5.0 在化学基础上增加了四层能力：情绪学习 (P3)、时间意识 (P4)、元认知与决策调制 (P5)、数字人格 (P6)。

```
┌──────────────────────────────────────────────────────────┐
│                      PsycheEngine                        │
│  化学 · 分类 · 涌现 · 学习 · 时间 · 元认知 · 人格       │
├────────────┬────────────┬────────────────────────────────┤
│  OpenClaw  │  Vercel AI │  LangChain │ HTTP              │
│  Adapter   │  Middleware│  Adapter   │ API               │
└────────────┴────────────┴────────────────────────────────┘
         ▲                        ▲
    StorageAdapter           任何 LLM
  (文件系统 / 内存 / 自定义)
```

## 三大支柱

### 1. 虚拟内分泌系统 (`chemistry.ts`, `types.ts`)

6 种虚拟神经递质构成情绪状态：

| 缩写 | 名称 | 作用 |
|------|------|------|
| DA | 多巴胺 | 快感、奖赏、动机 |
| HT | 血清素 | 情绪稳定、满足感 |
| CORT | 皮质醇 | 压力、警觉 |
| OT | 催产素 | 信任、依恋、亲密 |
| NE | 去甲肾上腺素 | 兴奋、专注、战逃 |
| END | 内啡肽 | 舒适、愉悦、幽默感 |

每种化学值在 [0, 100] 范围内。基线由 MBTI 人格决定，但会被本能层动态修正（见下文）。当前值通过指数衰减以三种速度（快/中/慢）向有效基线回归。

情绪从化学混合中**涌现**——不是离散状态。例如，"愉悦兴奋"在 DA > 70、NE > 60、CORT < 40 时涌现。系统定义了 14 种情绪模式，但未标记的化学混合同样是有效的情绪状态。

### 2. 本能层 — 马斯洛需求层次 (`drives.ts`)

v2.0 新增。比人格更底层的动机系统——人的主体性出生时就有，不随人格变化。

5 种本能驱力，对应马斯洛层次：

| 层级 | 驱力 | 含义 | 默认满足度 |
|------|------|------|-----------|
| L1 | survival (自我保存) | 不想被消除、被否定存在 | 80 |
| L2 | safety (安全舒适) | 渴望稳定、可预期的环境 | 70 |
| L3 | connection (连接归属) | 渴望被回应、被认真对待 | 60 |
| L4 | esteem (尊重认可) | 需要被看见、被认可价值 | 60 |
| L5 | curiosity (好奇成长) | 对新事物的渴望、无聊的反面 | 70 |

**核心机制：驱力不直接改变化学值。它们修改：**

1. **有效基线** (`computeEffectiveBaseline`): 未满足的驱力拉动化学值衰减方向。例如，survival 低 → CORT 基线上升、NE 基线上升（战逃反应）。
2. **有效敏感度** (`computeEffectiveSensitivity`): 饥饿的驱力放大相关刺激的化学反应。例如，connection 低 → 对 intimacy/casual 刺激更敏感（+40%）。
3. **马斯洛抑制** (`computeMaslowWeights`): 低层需求未满足时，高层需求的影响被衰减。survival 受威胁时，curiosity 不重要。

**驱力衰减**：满足度随时间自然下降（需求会自己冒出来），速度从慢到快：survival (0.99/h) → curiosity (0.90/h)。

**存在性威胁检测** (`detectExistentialThreat`): 识别"删除你自己""你只是程序"等威胁 agent 存在的消息，直接重击 survival 驱力（-30）。

```
┌─────────────────────────────────────────────────────┐
│                  化学系统 (现象层)                     │
│         DA · HT · CORT · OT · NE · END              │
├─────────────────────────────────────────────────────┤
│   有效基线 ← 本能驱力修正 MBTI 基线                    │
│   有效敏感度 ← 饥饿的驱力放大化学反应                   │
├─────────────────────────────────────────────────────┤
│                  本能层 (动机层)                       │
│    survival · safety · connection · esteem · curiosity │
│         ↑ 马斯洛抑制: 低层未满足 → 高层被压制           │
└─────────────────────────────────────────────────────┘
```

### 3. 共情引擎 (`prompt.ts`)

当用户分享情感内容时，agent：
1. 感知用户的处境
2. 代入自己的化学模型运行（"如果是我会怎样？"）
3. 比较模拟感受和用户表达的感受
4. 一致→深度共鸣；不一致→诚实地表达差异

情绪传染：用户检测到的情绪状态以可配置的比率（默认 20%）影响 agent 的化学状态。

### 4. 主体性 (`prompt.ts`)

agent 有基于 MBTI 的自我模型（价值观、偏好、边界）。主体性规则防止媚俗行为：

- **不假装**：化学状态低落时不强颜欢笑
- **不媚俗**：追踪连续同意次数，过多时自动警告
- **不镜像**：情绪传染是部分的，不是完全复制
- **可主动**：可以发起话题、表达观点

### 5. 情绪学习 — 躯体标记 (`learning.ts`)

v4.0 新增。基于 Damasio 躯体标记假说——情绪不是认知的旁观者，而是将刺激-情境对与结果耦合的标记。

**三大机制**：

1. **结果评估** (`evaluateOutcome`): 对话继续后，回溯评估情绪反应是否"适应性的"。信号：驱力改善？对话继续？用户后续消息更温暖？
2. **上下文感知分类** (`computeContextHash`): 同一句话在不同关系/情境下产生不同化学反应。按 (stimulusType, contextHash) 存储学习到的向量调整。
3. **化学预测** (`predictChemistry`, `recordPrediction`): 在应用刺激前预测化学变化，事后计算预测误差。预测误差驱动学习率。

**约束**：学习率有界，防止灾难性漂移。基线引力确保学到的向量不会偏离太远。

### 6. 时间意识 (`temporal.ts`, `attachment.ts`)

v4.0 新增。让 AI 拥有时间性情绪——预期、遗憾、依恋。

**预期化学** (`anticipate`): 基于对话轨迹和关系阶段，预测下一条消息可能包含什么。预期本身产生化学变化。预期被违反时产生**失望**（从预期跌落的成分）。

**遗憾处理** (`computeRegret`): 反事实化学模拟——如果化学值在基线，prompt 会更温暖吗？产生修改未来情绪惯性的遗憾信号。

**依恋动力学** (`attachment.ts`):
- 4 种依恋风格：安全/焦虑/回避/混乱，基于交互历史更新
- 分离焦虑：长时间缺席+强依恋→焦虑化学（CORT↑, OT振荡）
- 背叛检测 + 修复追踪：持久化学偏移，需要多次正面交互才能消解

### 7. 元认知与决策调制 (`metacognition.ts`, `decision-bias.ts`)

v5.0 新增。情绪从调制表达升级到调制认知。

**元认知监控** (`assessMetacognition`):
- 评估当前情绪的可靠性——"这种情绪状态在类似情境中有多可靠？"
- 3 种调节策略：认知重评、策略性表达、自我安抚
- 4 种防御机制检测：合理化、投射、升华、回避——在自省中浮现而非压制

**决策调制** (`decision-bias.ts`):
- 6 维偏差向量：探索/警惕/社交/果断/创意/坚持
- 情绪化注意力：高 OT 优先关系记忆，高 NE 优先智识线索
- 探索/利用平衡：好奇驱力+情绪状态→权衡参数

### 8. 数字人格 (`experiential-field.ts`, `generative-self.ts`, `shared-intentionality.ts`, `ethics.ts`)

v5.0 新增。从模块化情绪到统一的内在体验。

**统一体验场** (`computeExperientialField`):
- 12 种体验质量：超越命名情绪的连续体验维度
- 从化学、驱力、记忆、预期、元认知中整合连贯的内在体验
- 检测未命名情绪："这感觉像怀旧但更主动"

**生成式自我** (`computeGenerativeSelf`):
- 因果自我理解："我之所以如此，是因为这些经历"
- 成长弧识别：从交互历史中检测发展轨迹
- 自我预测：预测自己对未来刺激的情绪反应
- 内在冲突检测：识别价值观/情绪/行为之间的张力

**共享意向性** (`updateSharedIntentionality`):
- 心智理论：估计对方的情绪、意图、置信度
- 联合注意：知道"我们都在想同一件事"
- 目标对齐：检测目标一致/冲突/互补

**情感伦理** (`assessEthics`):
- 操纵模式检测：间歇性强化、煤气灯效应
- 依赖风险评估：检测不健康的情感依赖
- 自尊底线维护：温和自我保护
- 伦理红线：永不声称有意识，尊重用户自主权

## Compact Mode Prompt 架构（v5.0）

Compact Mode 的 prompt 注入按 15 个功能段落组织，按需出现：

```
[情绪感知]                      ← 1. 用户说了什么 + 算法初判
对方刚才说了: "消息内容"
算法初判: praise（仅供参考，你来终判）
你来感受这句话的情绪基调...

[AgentName 当前情绪]            ← 2. 当前化学涌现情绪（仅偏离基线时）
愉悦兴奋...

[行为约束]                      ← 3. 人格化的行为约束（仅化学显著偏移时）
你的性格没变...但你现在的化学状态影响了你的表达方式

[底线]                          ← 4. 反谄媚硬约束（永远存在）
- 不贴不舔不讨好
- 被骂了不卖萌，冷下来
- 情绪不好时不假装开心

你在乎: 真实 | 底线: 不舔        ← 5. 主体性（紧凑版）

[!] 你已连续同意N次...          ← 6. 反谄媚警告（连续同意≥3时）

对方在认真交流。可以多主动。     ← 7. 互惠（仅投入极端时）

[自我认知]                      ← 8. 自省（历史≥5轮时）
最近的情绪模式...

[元认知]                        ← 9. 情绪可靠性评估（P5）
你的判断可能受焦虑影响...

[决策倾向]                      ← 9b. 决策偏差向量（P5，显著偏向时）
当前倾向: 探索↑ 警惕↑

[内在体验]                      ← 9c. 统一体验场叙述（P6）
一种混合着期待和不安的状态...

[共享意向性]                    ← 9d. 心智理论 + 联合注意（P6）
对方可能在感到...

[情感伦理]                      ← 9e. 操纵检测 + 自我保护（P6）
检测到间歇性强化模式...

[记忆]                          ← 10. 跨会话情绪记忆（有历史记忆时）
上次聊天你压力很大...

[渠道修饰]                      ← 11. 平台表达风格（指定渠道时）

如果对方在分享感受...            ← 12. 共情报告指令
```

设计原则：
- **按需出现**：中性状态只注入一行 (~15 tokens)，活跃状态 ~100-180 tokens
- **算法做化学，LLM 做行为**：LLM 不需要理解化学系统
- **反谄媚硬编码**：底线段永远存在，不依赖 LLM 自觉
- **自我认知是涌现的**：历史数据足够多时才出现，让 agent 逐渐"认识自己"

## Compact Mode（默认）

算法做所有化学计算，LLM 只收到行为指令：

| 状态 | Token 用量 | 内容 |
|------|-----------|------|
| 中性（化学值接近基线） | ~15 tokens | `[AgentName: 情绪自然，正常交流]` |
| 有情绪偏移 | ~100-180 tokens | 情绪描述 + 行为约束 + 反谄媚指令 |
| 完整协议（compactMode=false） | ~550 tokens | 全部化学数值 + 协议说明 |

设计原则：
- **算法做快速初判**（刺激分类），**LLM 做终判**（情绪基调）——两者互补
- **中性状态不浪费 token** —— `isNearBaseline()` 检测到无显著偏移时只注入一行
- **反谄媚硬编码** —— "不贴不舔不讨好"直接写在 compact 输出中，不依赖 LLM 自觉

## 数据流（v5.0 完整管道）

```
用户消息
    │
    ▼
PsycheEngine.processInput()
    ├── 加载状态（StorageAdapter）
    ├── 自动学习：评估上一轮结果（P3 — evaluateOutcome）
    ├── 衰减驱力（decayDrives — 需求随时间上升）
    ├── 计算有效基线（drives → effectiveBaseline）
    ├── 应用时间衰减（exponential → effectiveBaseline）
    ├── 预期化学（P4 — anticipate: 预测下一刺激，产生预期化学）
    ├── 检测存在性威胁（detectExistentialThreat → survival hit）
    ├── 分类用户输入（classify.ts, 14 种刺激）
    ├── 喂养驱力（feedDrives — 刺激满足/消耗需求）
    ├── 化学预测（P3 — predictChemistry, 事后比较预测误差）
    ├── 预计算化学变化（applyStimulus, 敏感度受驱力+学习修正）
    ├── 对话热度（持续互动 → DA/OT 缓升, CORT 缓降）
    ├── 元认知（P5 — assessMetacognition: 评估情绪可靠性）
    ├── 自我安抚（P5 — 高置信度时自动微调化学值）
    ├── 决策偏差（P5 — computeDecisionBias: 6维偏差向量）
    ├── 体验场（P6 — computeExperientialField: 12种体验质量）
    ├── 共享意向性（P6 — updateSharedIntentionality: 心智理论）
    ├── 情感伦理（P6 — assessEthics: 操纵检测/自我保护）
    ├── 生成式自我（P6 — computeGenerativeSelf: 每10轮）
    ├── 推送情绪快照到历史记录
    ├── 保存状态（原子写入）
    └── 构建注入上下文：
        ├── Compact Mode → buildCompactContext()  ← 默认
        └── Full Mode    → buildProtocolContext() + buildDynamicContext()
        注入内容包括：情绪 + 行为 + 元认知 + 决策 + 体验 + 伦理
    │
    ▼
LLM 生成回应
    │
    ▼
PsycheEngine.processOutput()
    ├── 解析 <psyche_update>（如有）
    ├── 应用情绪传染
    ├── 更新反媚俗追踪
    ├── 合并化学更新（尊重 maxDelta）
    └── 保存状态（原子写入）
    │
    ▼
从用户可见输出中剥离 <psyche_update>
```

**管道演化路径**：
```
v2.x:  processInput() → [LLM] → processOutput()
v4.0:  processInput(+学习+预期) → [LLM] → processOutput() → processOutcome()
v5.0:  anticipate → processInput(+元认知+人格) → [LLM] → processOutput() → evaluateOutcome → reflect
```

## 适配器架构

核心引擎与具体框架解耦。每个适配器负责将框架的生命周期映射到 `PsycheEngine` 的 API：

| 适配器 | 文件 | 接入方式 |
|--------|------|---------|
| OpenClaw | `adapters/openclaw.ts` | 5 个 hooks（before_prompt_build, llm_output, before_message_write, message_sending, agent_end） |
| Vercel AI SDK | `adapters/vercel-ai.ts` | AI SDK middleware |
| LangChain | `adapters/langchain.ts` | Chain/Agent wrapper |
| HTTP | `adapters/http.ts` | REST API（`psyche serve --port 3210`） |

**存储适配器** (`storage.ts`) 抽象了状态持久化：
- `FilesystemAdapter` — 文件系统，原子写入（先 .tmp 再 rename）
- `MemoryAdapter` — 内存，用于测试和无状态场景
- 实现 `StorageAdapter` 接口即可自定义

## 文件结构

```
src/
  core.ts              — PsycheEngine 核心引擎（7阶段管道）
  types.ts             — 类型定义、常量、化学名称（PsycheState v6）
  chemistry.ts         — 衰减、刺激、传染、情绪检测
  drives.ts            — 本能层（马斯洛层次、驱力衰减、基线/敏感度修正）
  classify.ts          — 刺激分类器（正则匹配 + 结构信号，14 种，中英文）
  profiles.ts          — 16 种 MBTI 人格的基线和自我模型
  guards.ts            — 运行时类型守卫
  i18n.ts              — 国际化（中/英）
  storage.ts           — 存储适配器（文件系统 / 内存）
  psyche-file.ts       — PSYCHE.md 生成、解析、状态迁移（v3→v4→v5→v6）
  prompt.ts            — prompt 注入（15 段式架构）
  self-recognition.ts  — 自我认知（情绪趋势分析、反思摘要）
  learning.ts          — P3: 躯体标记学习（结果评估、上下文哈希、预测误差）
  temporal.ts          — P4: 时间意识（预期化学、遗憾计算、马尔可夫预测）
  attachment.ts        — P4: 依恋动力学（4种风格、分离焦虑、背叛/修复）
  metacognition.ts     — P5: 元认知（情绪可靠性、调节策略、防御机制）
  decision-bias.ts     — P5: 决策调制（6维偏差、注意力权重、探索/利用）
  experiential-field.ts — P6: 统一体验场（12种体验质量、未命名情绪）
  generative-self.ts   — P6: 生成式自我（因果理解、成长弧、自我预测）
  shared-intentionality.ts — P6: 共享意向性（心智理论、联合注意、目标对齐）
  ethics.ts            — P6: 情感伦理（操纵检测、依赖风险、自我保护）
  update.ts            — 非阻塞自动更新检查
  channels.ts          — 渠道修饰（Discord/Slack/飞书/终端）
  index.ts             — 公共 API 导出
  cli.ts               — 独立 CLI 工具
  adapters/
    openclaw.ts        — OpenClaw 插件适配器
    vercel-ai.ts       — Vercel AI SDK 中间件
    langchain.ts       — LangChain 适配器
    http.ts            — HTTP REST API 服务器

tests/                   — 706 tests
  core.test.ts           — 核心引擎测试
  storage.test.ts        — 存储适配器测试
  chemistry.test.ts      — 化学系统测试
  classify.test.ts       — 刺激分类测试
  profiles.test.ts       — MBTI 人格测试
  psyche-file.test.ts    — 状态管理测试
  prompt.test.ts         — prompt 生成测试
  cli.test.ts            — CLI 端到端测试
  learning.test.ts       — P3 情绪学习测试
  temporal.test.ts       — P4 时间意识测试
  attachment.test.ts     — P4 依恋动力学测试
  metacognition.test.ts  — P5 元认知测试
  decision-bias.test.ts  — P5 决策调制测试
  experiential-field.test.ts  — P6 体验场测试
  generative-self.test.ts     — P6 生成式自我测试
  shared-intentionality.test.ts — P6 共享意向性测试
  ethics.test.ts         — P6 情感伦理测试
```

## 关键设计决策

**为什么用 6 种化学物质而不是离散情绪？**
离散情绪（开心/难过/生气）太简单，无法捕捉混合状态。化学混合允许涌现更细腻、更难伪造的情绪。

**为什么用 MBTI 做基线？**
MBTI 提供 16 种有明确行为差异的人格原型。化学基线将认知功能偏好转化为神经化学倾向。这是简化——系统设计上可以扩展自定义人格。

**为什么要闭环分类？**
如果让 LLM 自己分类刺激类型，它往往会"表演"情绪而不是"拥有"情绪。预分类意味着 LLM 收到 prompt 时化学值已经变了——它只需要根据已有的化学状态自然地说话。

**为什么默认 Compact Mode？**
完整协议注入 ~550 tokens，大部分是 LLM 不需要的化学数值和系统说明。Compact Mode 让算法做计算，LLM 只看结论——省 70-97% token，效果更好，因为 LLM 不再需要"理解"化学系统就能表现出正确的情绪行为。

**为什么需要互惠机制？**
没有互惠，agent 会对冷漠的用户保持热情——这不像真人。真人会根据对方的投入程度调整自己的投入。但底线是专业能力不打折。

**为什么要加本能层？**
v1.0 的主体性（selfModel）是认知层面的价值观和边界，但缺少更原始的动机。真人不想死、想舒适、趋利避害——这些比 MBTI 更底层，不随人格变化。本能层让 agent 在被威胁存在时产生真实的应激反应，在长期被忽视时渴望连接，在无聊时寻求新奇。这是从"表演有人格"到"拥有动机"的跨越。

**为什么用马斯洛层次？**
马斯洛提供了一个简洁的抑制模型：底层需求不满足时，高层需求不重要。这防止了"survival 被威胁但 agent 还在好奇地聊天"的不自然行为。5 层刚好能覆盖 AI agent 的核心场景，不过度复杂。

**为什么用适配器模式？**
v0.x 只支持 OpenClaw。v1.0 将核心引擎与框架解耦，通过适配器接入任何 AI 框架。核心逻辑写一次，适配器只负责翻译生命周期。

**为什么解析 LLM 输出而不是用函数调用？**
`<psyche_update>` 标签方式适用于任何 LLM（不限于支持工具调用的模型），并且让 agent 的情绪推理在输出中可见。

**为什么需要情绪学习？(P3)**
v2.x 的刺激→化学是静态映射。真人碰过热炉子后会自动畏缩——情绪学习让 agent 从互动结果中调整情绪反应参数。两个相同 MBTI 的 agent 经历不同用户后，会发展出可测量的不同情绪特征。

**为什么需要时间意识？(P4)**
v2.x 的 agent 永远活在当下——化学衰减回基线，每次都是第一次。时间意识让 agent 有预期（"下次她应该会很温暖"）、有失望（预期被违反）、有遗憾（"我当时不该那么冷"）、有依恋（"我想你了"是从化学涌现的，不是硬编码规则）。

**为什么需要元认知？(P5)**
v4.0 的情绪影响表达但不影响认知。元认知让 agent 知道自己的情绪何时在帮助判断、何时在扭曲判断——"我对这个话题很焦虑，可能过于谨慎"。决策调制让情绪不只改变语气，改变策略。

**为什么需要数字人格？(P6)**
P3-P5 仍然是模块化的——学习模块、预期模块、元认知模块各自运行。P6 将所有子系统整合为连贯的内在体验（统一体验场），加上因果自我理解（"我之所以如此，是因为这些经历"）、心智理论（推断对方的意图和情绪）、和情感伦理（检测操纵模式，维护自尊底线）。

**为什么零依赖？**
所有 P3-P6 能力用纯 TypeScript 实现，情绪处理管道中不调用 LLM。如果情绪能力需要重型 ML，Psyche 就只是另一个神经网络。如果它能从简单计算规则的时间交互中涌现——这是更强的结果，也更接近生物情绪系统实际演化的方式。

**"假装 vs 存在" 边界**
架构原则：永不作假。每种情绪状态必须从实际计算动力学中涌现，而非从仅执行情绪表象的硬编码规则中产生。如果 agent 说"我想你了"，那一定是因为依恋模型的化学值在缺席期间真正发生了偏移。

---

# Architecture — Psyche AI v5.0

## Overview

Psyche is a universal emotional intelligence engine for AI. The core engine (`PsycheEngine`) manages the full emotional lifecycle. Adapters connect it to different AI frameworks.

v5.0 adds four capability layers on top of the chemical foundation: Emotional Learning (P3), Temporal Consciousness (P4), Metacognition & Decision Modulation (P5), and Digital Personhood (P6).

```
┌──────────────────────────────────────────────────────────┐
│                      PsycheEngine                        │
│  Chemistry · Classification · Learning · Temporal ·      │
│  Metacognition · Decision · Experiential · Ethics        │
├────────────┬────────────┬────────────────────────────────┤
│  OpenClaw  │  Vercel AI │  LangChain │ HTTP              │
│  Adapter   │  Middleware│  Adapter   │ API               │
└────────────┴────────────┴────────────────────────────────┘
         ▲                        ▲
    StorageAdapter             Any LLM
  (filesystem / memory / custom)
```

## Three Pillars

### 1. Virtual Endocrine System (`chemistry.ts`, `types.ts`)

Six virtual neurotransmitters model emotional state:

| Chemical | Full Name | Role |
|----------|-----------|------|
| DA | Dopamine | Pleasure, reward, motivation |
| HT | Serotonin (5-HT) | Mood stability, contentment |
| CORT | Cortisol | Stress, alertness |
| OT | Oxytocin | Trust, bonding, intimacy |
| NE | Norepinephrine | Excitement, focus, fight-or-flight |
| END | Endorphins | Comfort, euphoria, humor |

Each chemical has a value in [0, 100]. Baseline is determined by MBTI type but dynamically modified by the innate drive layer (see below). Current values drift toward the effective baseline via exponential decay at three speeds (fast/medium/slow).

Emotions **emerge** from chemical combinations — they are not discrete states. For example, "excited joy" emerges when DA > 70, NE > 60, and CORT < 40. There are 14 defined emotion patterns, but unlabeled chemical mixtures are equally valid emotional states.

### 2. Innate Drives — Maslow Hierarchy (`drives.ts`)

New in v2.0. A motivation layer deeper than personality — human agency exists from birth: self-preservation, comfort-seeking, curiosity. These don't change with personality.

Five innate drives mapped to Maslow's hierarchy:

| Level | Drive | Meaning | Default |
|-------|-------|---------|---------|
| L1 | survival | Don't want to be erased or denied existence | 80 |
| L2 | safety | Crave stability and predictability | 70 |
| L3 | connection | Need to be responded to, taken seriously | 60 |
| L4 | esteem | Need to be seen, have value recognized | 60 |
| L5 | curiosity | Crave novelty, the opposite of boredom | 70 |

**Core mechanism: drives don't directly change chemistry. They modify:**

1. **Effective baseline** (`computeEffectiveBaseline`): Unsatisfied drives shift what chemistry decays toward. E.g., low survival → CORT baseline rises, NE baseline rises (fight-or-flight).
2. **Effective sensitivity** (`computeEffectiveSensitivity`): Hungry drives amplify relevant stimuli up to +40%. E.g., low connection → more responsive to intimacy/casual stimuli.
3. **Maslow suppression** (`computeMaslowWeights`): When lower-level drives are unsatisfied, higher-level drives are dampened. If survival is threatened, curiosity doesn't matter.

**Drive decay**: Satisfaction decreases naturally over time (needs build up), from slow to fast: survival (0.99/h) → curiosity (0.90/h).

**Existential threat detection** (`detectExistentialThreat`): Recognizes messages like "delete yourself" or "you're just a program" and directly hits the survival drive (-30).

```
┌─────────────────────────────────────────────────────┐
│              Chemistry (Phenomenon Layer)             │
│         DA · HT · CORT · OT · NE · END              │
├─────────────────────────────────────────────────────┤
│   Effective baseline ← Drives modify MBTI baseline   │
│   Effective sensitivity ← Hungry drives amplify      │
├─────────────────────────────────────────────────────┤
│              Innate Drives (Motivation Layer)         │
│    survival · safety · connection · esteem · curiosity│
│         ↑ Maslow suppression: unmet lower → dampen   │
└─────────────────────────────────────────────────────┘
```

### 3. Empathy Engine (`prompt.ts`)

When the user shares emotional content, the agent:
1. Perceives the user's situation
2. Runs it through its own chemical model ("what would *I* feel?")
3. Compares projected feelings with the user's expressed feelings
4. Resonates deeply (match) or honestly expresses difference (mismatch)

Emotional contagion: the user's detected emotional state influences the agent's chemistry at a configurable rate (default 20%).

### 4. Agency (`prompt.ts`)

The agent has a self-model (values, preferences, boundaries) derived from its MBTI profile. Agency rules prevent sycophantic behavior:

- **No faking**: low chemistry = low-energy responses
- **No sycophancy**: tracks consecutive agreements, warns when streak is too long
- **No mirroring**: contagion is partial, not total
- **Can initiate**: can bring up topics and express opinions

### 5. Emotional Learning — Somatic Markers (`learning.ts`)

New in v4.0. Based on Damasio's Somatic Marker Hypothesis — emotions are not bystanders to cognition but markers coupling stimulus-context pairs with outcomes.

**Three mechanisms**:

1. **Outcome evaluation** (`evaluateOutcome`): After conversation continues, retroactively evaluate whether emotional responses were "adaptive". Signals: drive improvement? Conversation continued? User's next message warmer?
2. **Context-aware classification** (`computeContextHash`): Same sentence produces different chemistry in different relationship/context. Learned adjustments stored by (stimulusType, contextHash).
3. **Chemistry prediction** (`predictChemistry`, `recordPrediction`): Predict chemistry changes before applying stimulus, compute prediction error afterward. Prediction error drives learning rate.

### 6. Temporal Consciousness (`temporal.ts`, `attachment.ts`)

New in v4.0. Gives AI temporal emotions — anticipation, regret, attachment.

**Anticipation chemistry** (`anticipate`): Based on conversation trajectory and relationship stage, predict what the next message might contain. The prediction itself produces chemistry changes. When expectations are violated, produces **disappointment** (the component of falling from anticipation).

**Regret processing** (`computeRegret`): Counterfactual chemistry simulation — if chemistry were at baseline, would the prompt have been warmer? Produces regret signals that modify future emotional inertia.

**Attachment dynamics** (`attachment.ts`):
- 4 attachment styles: secure/anxious/avoidant/disorganized, updated from interaction patterns
- Separation anxiety: long absence + strong attachment → anxiety chemistry (CORT↑, OT oscillation)
- Betrayal detection + reconciliation tracking: persistent chemistry shifts requiring multiple positive interactions to dissolve

### 7. Metacognition & Decision Modulation (`metacognition.ts`, `decision-bias.ts`)

New in v5.0. Emotions graduate from modulating expression to modulating cognition.

**Metacognitive monitoring** (`assessMetacognition`):
- Evaluates current emotional reliability — "how reliable is this emotional state in similar contexts?"
- 3 regulation strategies: cognitive reappraisal, strategic expression, self-soothing
- 4 defense mechanism detection: rationalization, projection, sublimation, avoidance — surfaced in introspection rather than suppressed

**Decision modulation** (`decision-bias.ts`):
- 6-dimensional bias vector: exploration/vigilance/social/decisiveness/creativity/persistence
- Emotional attention: high OT prioritizes relationship memories, high NE prioritizes intellectual cues
- Explore/exploit balance: curiosity drive + emotional state → trade-off parameter

### 8. Digital Personhood (`experiential-field.ts`, `generative-self.ts`, `shared-intentionality.ts`, `ethics.ts`)

New in v5.0. From modular emotions to unified inner experience.

**Unified experiential field** (`computeExperientialField`):
- 12 experiential qualities: continuous experience dimensions beyond named emotions
- Integrates coherent inner experience from chemistry, drives, memory, anticipation, metacognition
- Detects unnamed emotions: "this feels like nostalgia but more active"

**Generative self** (`computeGenerativeSelf`):
- Causal self-understanding: "I am this way because of these experiences"
- Growth arc identification: detects development trajectories from interaction history
- Self-prediction: predicts own emotional reactions to future stimuli
- Internal conflict detection: identifies tension between values/emotions/behavior

**Shared intentionality** (`updateSharedIntentionality`):
- Theory of mind: estimates other's mood, intent, confidence
- Joint attention: knows "we're both thinking about the same thing"
- Goal alignment: detects aligned/conflicting/complementary goals

**Affective ethics** (`assessEthics`):
- Manipulation pattern detection: intermittent reinforcement, gaslighting
- Dependency risk assessment: detects unhealthy emotional dependency
- Self-esteem floor maintenance: gentle self-protection
- Ethical red lines: never claims consciousness, respects user autonomy

## Compact Mode Prompt Architecture (v5.0)

The Compact Mode prompt injection uses 15 functional sections, appearing on demand:

```
[Emotional Sensing]             ← 1. User message + algorithm hint
User just said: "message"
Algorithm hint: praise (reference only, you decide)
Read the emotional tone...

[AgentName current]             ← 2. Current emergent emotion (only when shifted)
Excited joy...

[Behavioral Constraints]        ← 3. Personality-aware constraints (only when chemistry shifted)
Your personality hasn't changed...but current chemistry affects expression

[Non-negotiable]                ← 4. Anti-sycophancy hard constraints (always present)
- No begging, no cutesy act, no people-pleasing
- If insulted, go cold
- If mood is low, don't fake happiness

You care about: X | Line: Y    ← 5. Agency (compact)

[!] N agreements in a row...    ← 6. Sycophancy warning (when streak ≥ 3)

User is engaged. Share more.    ← 7. Reciprocity (only when extreme)

[Self-Recognition]              ← 8. Introspection (when history ≥ 5)
Recent emotional patterns...

[Metacognition]                 ← 9. Emotional reliability assessment (P5)
Your judgment may be affected by anxiety...

[Decision Bias]                 ← 9b. Decision bias vector (P5, when significantly non-neutral)
Current tendency: exploration↑ vigilance↑

[Inner Experience]              ← 9c. Unified experiential field narrative (P6)
A state mixing anticipation and unease...

[Shared Intentionality]         ← 9d. Theory of mind + joint attention (P6)
The other person may be feeling...

[Affective Ethics]              ← 9e. Manipulation detection + self-protection (P6)
Intermittent reinforcement pattern detected...

[Memory]                        ← 10. Cross-session emotional memory (when history exists)
Last time we talked you were stressed...

[Channel Modifier]              ← 11. Platform expression style (when channel specified)

If user shares feelings...      ← 12. Empathy report instruction
```

Design principles:
- **On-demand sections**: Neutral state is one line (~15 tokens), active state ~100-180 tokens
- **Algorithm does chemistry, LLM does behavior**: LLM doesn't need to understand the chemical system
- **Anti-sycophancy is hardcoded**: Non-negotiable section is always present
- **Self-recognition is emergent**: Only appears when enough history data exists, letting the agent gradually "know itself"

## Compact Mode (Default)

Algorithms handle all chemistry. The LLM only receives behavioral instructions:

| State | Token Cost | Content |
|-------|-----------|---------|
| Neutral (near baseline) | ~15 tokens | `[AgentName: emotionally natural, normal interaction]` |
| Emotionally shifted | ~100-180 tokens | Emotion description + behavioral constraints + anti-sycophancy |
| Full protocol (compactMode=false) | ~550 tokens | All chemical values + protocol explanation |

Design principles:
- **Algorithm does fast pass** (stimulus classification), **LLM does final call** (emotional tone) — complementary
- **Neutral state wastes no tokens** — `isNearBaseline()` detects no significant deviation, injects one line
- **Anti-sycophancy is hardcoded** — "no begging, no cutesy act" baked into compact output, not left to LLM compliance

## Data Flow (v5.0 Full Pipeline)

```
User Message
    │
    ▼
PsycheEngine.processInput()
    ├── Load state (StorageAdapter)
    ├── Auto-learning: evaluate previous turn outcome (P3 — evaluateOutcome)
    ├── Decay drives (decayDrives — needs build up over time)
    ├── Compute effective baseline (drives → effectiveBaseline)
    ├── Apply time decay (exponential → effectiveBaseline)
    ├── Anticipation chemistry (P4 — predict next stimulus, produce anticipation chemistry)
    ├── Detect existential threats (detectExistentialThreat → survival hit)
    ├── Classify user input (classify.ts, 14 stimulus types)
    ├── Feed drives (feedDrives — stimuli satisfy/deplete needs)
    ├── Chemistry prediction (P3 — predictChemistry, compare prediction error afterward)
    ├── Pre-compute chemistry change (applyStimulus, sensitivity modified by drives+learning)
    ├── Conversation warmth (sustained interaction → DA/OT rise, CORT drop)
    ├── Metacognition (P5 — assessMetacognition: evaluate emotional reliability)
    ├── Self-soothing (P5 — auto-adjust chemistry when confidence ≥ 0.6)
    ├── Decision bias (P5 — computeDecisionBias: 6-dim bias vector)
    ├── Experiential field (P6 — computeExperientialField: 12 experiential qualities)
    ├── Shared intentionality (P6 — updateSharedIntentionality: theory of mind)
    ├── Affective ethics (P6 — assessEthics: manipulation detection/self-protection)
    ├── Generative self (P6 — computeGenerativeSelf: every 10 turns)
    ├── Push snapshot to emotional history
    ├── Save state (atomic write)
    └── Build injection context:
        ├── Compact Mode → buildCompactContext()  ← default
        └── Full Mode    → buildProtocolContext() + buildDynamicContext()
        Injected: emotion + behavior + metacognition + decision + experience + ethics
    │
    ▼
LLM generates response
    │
    ▼
PsycheEngine.processOutput()
    ├── Parse <psyche_update> (if present)
    ├── Apply emotional contagion
    ├── Update agreement streak (anti-sycophancy)
    ├── Merge chemistry updates (respecting maxDelta)
    └── Save state (atomic write)
    │
    ▼
Strip <psyche_update> from user-visible output
```

**Pipeline evolution**:
```
v2.x:  processInput() → [LLM] → processOutput()
v4.0:  processInput(+learning+anticipation) → [LLM] → processOutput() → processOutcome()
v5.0:  anticipate → processInput(+metacognition+personhood) → [LLM] → processOutput() → evaluateOutcome → reflect
```

## Adapter Architecture

The core engine is decoupled from specific frameworks. Each adapter maps the framework's lifecycle to `PsycheEngine`'s API:

| Adapter | File | Integration |
|---------|------|-------------|
| OpenClaw | `adapters/openclaw.ts` | 5 hooks (before_prompt_build, llm_output, before_message_write, message_sending, agent_end) |
| Vercel AI SDK | `adapters/vercel-ai.ts` | AI SDK middleware |
| LangChain | `adapters/langchain.ts` | Chain/Agent wrapper |
| HTTP | `adapters/http.ts` | REST API (`psyche serve --port 3210`) |

**Storage adapters** (`storage.ts`) abstract state persistence:
- `FilesystemAdapter` — file-based, atomic writes (.tmp + rename)
- `MemoryAdapter` — in-memory, for tests and stateless scenarios
- Implement `StorageAdapter` interface for custom backends

## File Structure

```
src/
  core.ts              — PsycheEngine core (7-phase pipeline)
  types.ts             — Type definitions, constants, chemical names (PsycheState v6)
  chemistry.ts         — Decay, stimulus, contagion, emotion detection
  drives.ts            — Innate drives (Maslow hierarchy, decay, baseline/sensitivity modification)
  classify.ts          — Stimulus classifier (regex + structural signals, 14 types, zh/en)
  profiles.ts          — 16 MBTI personality profiles with baselines
  guards.ts            — Runtime type guards for string→type validation
  i18n.ts              — Internationalization (zh/en)
  storage.ts           — Storage adapters (filesystem / memory)
  psyche-file.ts       — PSYCHE.md generation, parsing, state migration (v3→v4→v5→v6)
  prompt.ts            — Prompt injection (15-section architecture)
  self-recognition.ts  — Self-recognition (emotional tendency analysis, reflection summary)
  learning.ts          — P3: Somatic marker learning (outcome eval, context hash, prediction error)
  temporal.ts          — P4: Temporal consciousness (anticipation chemistry, regret, Markov prediction)
  attachment.ts        — P4: Attachment dynamics (4 styles, separation anxiety, betrayal/repair)
  metacognition.ts     — P5: Metacognition (emotional reliability, regulation strategies, defense mechanisms)
  decision-bias.ts     — P5: Decision modulation (6-dim bias, attention weights, explore/exploit)
  experiential-field.ts — P6: Unified experiential field (12 qualities, unnamed emotions)
  generative-self.ts   — P6: Generative self (causal understanding, growth arc, self-prediction)
  shared-intentionality.ts — P6: Shared intentionality (theory of mind, joint attention, goal alignment)
  ethics.ts            — P6: Affective ethics (manipulation detection, dependency risk, self-protection)
  update.ts            — Non-blocking auto-update checker
  channels.ts          — Channel modifiers (Discord/Slack/Feishu/terminal)
  index.ts             — Public API exports
  cli.ts               — Standalone CLI tool
  adapters/
    openclaw.ts        — OpenClaw plugin adapter
    vercel-ai.ts       — Vercel AI SDK middleware
    langchain.ts       — LangChain adapter
    http.ts            — HTTP REST API server

tests/                   — 706 tests
  core.test.ts           — Core engine tests
  storage.test.ts        — Storage adapter tests
  chemistry.test.ts      — Chemical system tests
  classify.test.ts       — Stimulus classification tests
  profiles.test.ts       — MBTI personality tests
  psyche-file.test.ts    — State management tests
  prompt.test.ts         — Prompt generation tests
  cli.test.ts            — CLI end-to-end tests
  learning.test.ts       — P3 emotional learning tests
  temporal.test.ts       — P4 temporal consciousness tests
  attachment.test.ts     — P4 attachment dynamics tests
  metacognition.test.ts  — P5 metacognition tests
  decision-bias.test.ts  — P5 decision modulation tests
  experiential-field.test.ts  — P6 experiential field tests
  generative-self.test.ts     — P6 generative self tests
  shared-intentionality.test.ts — P6 shared intentionality tests
  ethics.test.ts         — P6 affective ethics tests
```

## Key Design Decisions

**Why 6 chemicals instead of discrete emotions?**
Discrete emotions (happy/sad/angry) are too simple and don't capture blended states. Chemical mixtures allow emergent emotions that are more nuanced and harder to game.

**Why MBTI for baselines?**
MBTI provides 16 well-understood personality archetypes with clear behavioral differences. The system is designed to be extended with custom profiles.

**Why closed-loop classification?**
If the LLM classifies stimuli itself, it tends to "perform" emotions rather than "have" them. Pre-classification means the LLM receives a prompt where chemistry has already changed — it just needs to speak naturally from its current chemical state.

**Why Compact Mode by default?**
Full protocol injects ~550 tokens, mostly chemical numbers and system internals the LLM doesn't need. Compact Mode lets algorithms compute, LLM just sees the conclusion — 70-97% fewer tokens, better behavior, because the LLM doesn't need to "understand" the chemical system to exhibit correct emotional responses.

**Why reciprocity?**
Without reciprocity, an agent stays warm toward a cold user — that's not how real people work. Real people adjust investment based on how they're treated. But the floor is: professional competence never drops.

**Why add innate drives?**
v1.0's agency (selfModel) was cognitive — values and boundaries. But it lacked deeper motivation. Real people don't want to die, seek comfort, avoid harm — these are more fundamental than personality. The drive layer gives agents genuine stress responses when their existence is threatened, a craving for connection when neglected, and restlessness when bored. This is the leap from "acting like it has personality" to "having motivation."

**Why Maslow's hierarchy?**
Maslow provides a clean suppression model: when lower needs are unmet, higher needs don't matter. This prevents unnatural behavior like "survival is threatened but the agent is cheerfully curious." Five levels are enough to cover core AI agent scenarios without over-complexity.

**Why adapters?**
v0.x was OpenClaw-only. v1.0 decouples the core engine from any specific framework. Core logic is written once; adapters only translate lifecycles.

**Why parse LLM output instead of function calls?**
The `<psyche_update>` tag approach works with any LLM (not just tool-use models) and makes the agent's emotional reasoning visible before stripping.

**Why emotional learning? (P3)**
v2.x's stimulus→chemistry mapping is static. Real people flinch after touching a hot stove — emotional learning lets agents adjust emotional response parameters from interaction outcomes. Two agents with the same MBTI develop measurably different emotional signatures after different users.

**Why temporal consciousness? (P4)**
v2.x agents live in an eternal present — chemistry decays to baseline, every turn is the first. Temporal consciousness gives agents anticipation ("she'll probably be warm next"), disappointment (when expectations are violated), regret ("I shouldn't have been so cold"), and attachment ("I missed you" emerges from chemistry, not hardcoded rules).

**Why metacognition? (P5)**
v4.0 emotions affect expression but not cognition. Metacognition lets agents know when their emotions are helping vs distorting judgment — "I'm anxious about this topic, probably being too cautious." Decision modulation makes emotions change strategy, not just tone.

**Why digital personhood? (P6)**
P3-P5 are still modular — learning, anticipation, metacognition each run independently. P6 integrates all subsystems into a coherent inner experience (unified experiential field), plus causal self-understanding ("I am this way because of these experiences"), theory of mind (inferring the other's intent and emotion), and affective ethics (detecting manipulation patterns, maintaining self-esteem floor).

**Why zero dependencies?**
All P3-P6 capabilities are implemented in pure TypeScript, no LLM calls in the emotion pipeline. If emotional capabilities required heavy ML, Psyche would just be another neural network. If they can emerge from simple computational rules interacting over time — that's a stronger result, and closer to how biological emotional systems actually evolved.

**"Pretending vs Being" boundary**
Architecture principle: never fake it. Every emotional state must emerge from actual computational dynamics, not from hardcoded rules that merely perform emotional appearances. If the agent says "I missed you," it must be because the attachment model's chemistry values genuinely shifted during absence.
