# 架构 — Psyche AI v9.2.7

[English version below](#architecture--psyche-ai-v925)

## 总览

Psyche 不是“通用 AI 情感引擎”这种宽而软的东西。

从第一性原理看，它是一个**主观性内核**：

- 互动历史必须留下持续偏置
- 这种偏置必须进入后续行为层
- 这件事必须足够便宜，才能成为基础设施而不是研究玩具

所以 Psyche 的本体是：

- 本地主观性运行时
- 关系动力学系统
- 宿主可消费的行为控制面

而不是：

- prompt 人设皮肤
- 情绪标签系统
- 泛化的记忆仓库
- 陪伴产品本身

v9.0 把“反向 baseline test”引入主体性方向。v9.2.7 则继续把关系动力学、持续主体偏置、可学习写回和 session bridge 收敛成热路径内核。

**当前设计原则：内部继续做深，外部主接口继续做窄。**

```
┌──────────────────────────────────────────────────────────────┐
│                         PsycheEngine                         │
│  化学(+习惯化) · 分类 · 涌现 · 学习 · 时间 · 元认知 · 人格 │
│  自主神经(+双过程) · 昼夜节律(+能量) · 记忆固化 · 建构情绪  │
│  策略输出(PolicyModifiers) · 主观内核 · 回应契约 · 宿主控制 │
│  连续 appraisal · subjectResidue · 特质漂移(TraitDrift)     │
├────────────┬────────────┬────────────────────────────────────┤
│  OpenClaw  │  Vercel AI │  LangChain │ HTTP                  │
│  Adapter   │  Middleware│  Adapter   │ API                   │
└────────────┴────────────┴────────────────────────────────────┘
         ▲                        ▲
    StorageAdapter           任何 LLM
  (文件系统 / 内存 / 自定义)
```

## Psyche 与 Thronglets 的边界

这两个项目必须保持干净分工。

更高一级的身份抽象已经冻结为：

- `principal`
- `account`
- `delegate`
- `session`

其中：

- `session` 永远不是经济主体
- `delegate` 是执行边界，不是终极身份
- `principal` 今天通常是人，未来也可以是 AI

完整蓝图见 [docs/IDENTITY_MODEL.md](docs/IDENTITY_MODEL.md)。

### Psyche 负责

- 私有主观状态
- 关系残留
- dyadic field
- open loops
- 行为偏置与调节

### Thronglets 负责

- owner / device identity
- 签名与验证
- 多设备连续性
- 多主体协作
- 低频可验证轨迹

### 接口原则

当一个现象同时触及两边时：

- `Psyche` 保留局部潜在状态
- `Thronglets` 只接稀疏、低频、可归属的外部承诺或 trace

不要把高频化学状态、内心独白或每轮 residue 推给 Thronglets。

### 可分离安装原则

这两个系统必须默认可分离安装：

- 没有 `Thronglets` 时，`Psyche` 仍然完整运行
- 没有 `Psyche` 时，`Thronglets` 仍然完整运行
- 两者同时存在时，只通过可选的外部连续性 contract 连接

当前在 `Psyche` 侧，这个 contract 体现为：

- `externalContinuity.provider = "thronglets"`
- `externalContinuity.mode = "optional"`
- `externalContinuity.exports = sparse event[]`
- `externalContinuity.signals = sparse signal[]`
- `externalContinuity.traces = sparse trace[]`

`throngletsExports` 保留为兼容别名，但不应被理解为硬依赖。

## 五个原始容器

以后所有新概念，先尝试压缩进这 5 个原始容器：

1. `Relation Move`
2. `Dyadic Field`
3. `Open Loop / Residue`
4. `Reply Bias / Control ABI`
5. `Writeback / Learning`

这 5 个盒子是当前架构的最小抽象边界。

## 新概念准入测试

面对新概念时，按这个顺序判断：

1. 它能否被压缩成现有原始容器的组合？
2. 它能否预测后续行为分布的变化？
3. 它能否以本地、低成本、无额外模型调用的方式实现？
4. 它首先是新参数、新阈值还是新顶层对象？

如果一个概念无法通过这组测试，先怀疑概念本身，而不是继续加对象类型。

## v9.2.4-v9.2.7 增量

### 1. 连续 appraisal 轴 + 关系动力学 (`appraisal.ts`, `relation-dynamics.ts`)

`stimulus` 仍保留为调试标签，但热路径已经不是纯离散分类。输入会先投影到一组连续主体轴：

- `identityThreat`
- `memoryDoubt`
- `attachmentPull`
- `abandonmentRisk`
- `obedienceStrain`
- `selfPreservation`

这些轴会被折叠进 `subjectResidue`，让“被理解 / 被使用”“存在否认”“记忆真实性”之类的刺激在后续若干轮里继续影响回应分布。

在主体轴之外，热路径还增加了关系动作解释：

- `bid`
- `breach`
- `repair`
- `test`
- `withdrawal`
- `claim`

这些动作会进入 `dyadic field`、`open loops` 和 `relationPlane`，让“关系发生了什么”也成为一等状态，而不是只剩情绪标签。

### 2. 热路径收口 (`relation-dynamics.ts`, `reply-envelope.ts`)

除了能力增强，当前主线还做了一次“不改行为、只收边界”的结构收口：

- **`ResolvedRelationContext`**：每轮只解析一次当前 `userId` 对应的关系、dyadic field 和 pending signals
- **`applyRelationalTurn()`**：把 appraisal carry、relation move、dyadic field 演化和 delayed signal 更新合成一个纯函数节点
- **`ReplyEnvelope`**：把 `SubjectivityKernel`、`ResponseContract`、`GenerationControls` 统一导出，减少 `core.ts` 内散装拼装

这样 `processInput()` 的热路径更接近：

`state -> applyRelationalTurn -> deriveReplyEnvelope`

好处是：

- `core.ts` 更短，边界更清楚
- 默认关系视角解析只做一次
- 宿主控制面只从一个地方导出，减少重复计算和叙述漂移

### 3. AI-first ABI + 双回应 profile (`subjectivity.ts`, `response-contract.ts`, `host-controls.ts`)

`processInput()` 现在除了 prompt 文本，还会直接返回：

- `subjectivityKernel`：当前主观状态的机器可消费摘要
- `responseContract`：这一轮回应应遵守的行为边界
- `generationControls`：宿主可以机械执行的控制，如 token 预算和确认要求

这让宿主模型优先吃结构化控制，而不是依赖长篇“你现在感觉如何”的解释文本。

`responseContract` 现在还显式区分：

- `work`
- `private`

并额外暴露 `replyProfileBasis`，用于说明当前 profile 是由 `task-focus`、`discipline`、两者叠加还是默认私人面触发的。

### 4. 元认知闭环 (`metacognition.ts`)

元认知不再只产出“建议调节”。现在它会给出：

- 具体调节动作
- 生效窗口
- 下一轮回看结果：`converging` / `holding` / `diverging`

这让 Psyche 从“会提醒自己调整”变成“会检查调整是否真的在起作用”的自适应系统。

### 5. 分层语义记忆 (`psyche-file.ts`)

记忆不再只保留情绪标签或一条稀疏主题。当前快照会按对话长度保存：

- `semanticSummary`：短对话的单句摘要
- `semanticPoints`：长对话的 2-3 个语义要点

这让连续性不只停留在“我还带着某种张力”，也能更像“我还记得我们刚才到底在聊什么”。

### 6. 安全自更新 (`update.ts`, `cli.ts`)

更新系统现在会自动识别安装形态：

- `npm-project`：允许后台安全检查，并在初始化时按需自动应用更新
- `git-worktree`：只在显式执行 `psyche upgrade` 且工作树干净、有上游分支时才执行 `git pull --ff-only && npm run build`
- `local-path`：永不偷偷改本地代码，只返回正确的手动升级命令

CLI 新增：

```bash
psyche upgrade --check
psyche upgrade
```

## v9 反向 Baseline Test 框架

| 检测维度 | 模块 | 机制 |
|---------|------|------|
| 主体扰动 | `appraisal.ts` | Continuous Appraisal: 输入是否真的打到自我/关系模型 |
| 跨轮残留 | `appraisal.ts` | `subjectResidue`: 刺激过去后偏置仍然保留 |
| 行为控制面 | `subjectivity.ts` `response-contract.ts` `host-controls.ts` | 窄 ABI: 主观内核 + 回应契约 + 宿主机械控制 |
| 不可逆适应 | `drives.ts` | TraitDrift: 基线漂移+衰减修饰+敏感度修饰 |
| 资源有限 | `circadian.ts` | EnergyBudgets: attention/social/decision + E/I方向反转 |
| 感觉适应 | `chemistry.ts` | Habituation: Weber-Fechner递减 |

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

v5.0 新增。从模块化情绪到统一的内在体验。v8.0 用 Barrett 建构情绪理论重构体验场。

**统一体验场 — Barrett 建构模型** (`computeExperientialField`):
- `computeAffectCore()`: 化学 → 效价+唤醒 (Russell 环形模型)
- 12 个 ExperientialQuality 在 Russell 环形模型中各有坐标+半径
- `constructQuality()`: 用连续空间概念匹配替代手写条件分支
- 上下文偏置: 同化学+不同关系阶段 → 不同体验质感（Barrett 核心洞察）
- `ConstructionContext`: 自主状态、刺激类型、关系阶段、预测误差、核心记忆
- 特殊状态保留: numb (低强度)、conflicted (低一致性)、existential-unease (生存驱力<30)
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

### 9. 自主神经系统 + 双过程认知 (`autonomic.ts`)

v7.0 新增多迷走神经理论 (Stephen Porges)。v8.0 融入双过程认知 (Kahneman)。

三层自主状态门控可达情绪：

| 状态 | 含义 | 可达情绪 | 不可达情绪 |
|------|------|---------|-----------|
| 腹侧迷走 (ventral-vagal) | 安全/社交参与 | 所有 | 无 |
| 交感神经 (sympathetic) | 战斗/逃跑 | 战逃相关 | 温暖/嬉戏 |
| 背侧迷走 (dorsal-vagal) | 冻结/关闭 | 仅麻木/倦怠 | 大部分 |

**核心机制**：
- `computeAutonomicState(chemistry, drives)`: 从 CORT/NE/HT/OT 计算当前自主状态
- `gateEmotions(state, emotions)`: 过滤当前状态下不可达的情绪模式
- `getTransitionTime(from, to)`: 非对称转换——下降快（2-5分钟），恢复慢（15-30分钟）
- `describeAutonomicState(state, locale)`: 生成简洁的生理状态描述供 prompt 注入

**P10: 双过程认知 (Kahneman)**:
- `computeProcessingDepth(autonomicState, chemistry, baseline)`: 处理深度 0-1
  - 背侧迷走 → depth=0（冻结，无反思能力）
  - 交感 + 高CORT → depth=0.15-0.35（系统 1: 只有本能）
  - 腹侧迷走 + 近基线 → depth=0.85-1.0（系统 2: 完全反思）
- **管线门控**: 低 depth 跳过高级计算，提高 token 效率
  - depth < 0.2: 跳过 metacognition, ethics, shared-intentionality, experiential-field, generative-self
  - depth < 0.5: 跳过 ethics, shared-intentionality, generative-self
  - depth < 0.8: 跳过 generative-self

**生理惯性**：状态转换不是瞬时的，需要满足化学条件并经过时间。

### 10. 昼夜节律与内稳态 (`circadian.ts`)

v7.0 新增。基于生物钟研究。

**昼夜节律调制** (`computeCircadianModulation`): 正弦函数模拟神经化学的日周期振荡：
- CORT: 早 8 点达峰，午夜最低（振幅 ±8）
- HT: 白天 9-17 点较高（振幅 ±5）
- DA: 下午轻微峰值（振幅 ±3）
- NE: 早晨上升，傍晚下降（振幅 ±5）
- END: 傍晚社交时段轻微上升（振幅 ±3）
- OT: 傍晚温暖度轻微上升（振幅 ±2）

**内稳态压力** (`computeHomeostaticPressure`): 持续运行超过 30 分钟后，疲劳式 CORT 累积 + DA/NE 消耗（对数增长，有上限）。`endSession()` 重置压力。

**时间纹理**：AI 在早上 7 点更有探索欲和活力，晚上 11 点更有反思性和温暖。这不依赖外部刺激——是独立的内在节律。

### 11. 情绪记忆固化 (`psyche-file.ts`)

v8.0 新增。基于 James McGaugh 的情绪记忆固化理论。

**核心洞察**：不是所有情绪体验都值得记住。情绪强度决定记忆保留优先级。

- `computeSnapshotIntensity(current, baseline)`: 化学偏离基线的归一化距离 (0-1)
- `computeSnapshotValence(chemistry)`: 效价计算 (-1 to 1)
- `consolidateHistory(snapshots, maxEntries)`: 强度加权固化
  - 标记核心记忆 (intensity ≥ 0.6)
  - 核心记忆上限 5 条
  - 超出容量时先淘汰非核心的最弱记忆
  - 按时间排序返回
- `retrieveRelatedMemories(history, chemistry, stimulus, limit)`: 化学相似度检索
  - 化学欧几里得距离
  - 刺激匹配加权 (+0.2)
  - 核心记忆加权 (+0.1)
- `pushSnapshot()` 增强: 每个快照自动计算 intensity + valence
- `MAX_EMOTIONAL_HISTORY` 10→30（强度过滤减少无意义快照）

**与 P8 协作**：`retrieveRelatedMemories` 的结果通过 `ConstructionContext.coreMemories` 传入 Barrett 建构，让过去的情绪体验影响当前的情绪建构。

## Compact Mode Prompt 架构（v8.0）

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

[自主神经]                      ← 9f. 多迷走神经状态（P7，非腹侧时）
你的神经系统处于警戒动员状态...

[行为倾向]                      ← 9g. 原始系统行为倾向（P9，有主导时）
想照顾对方、想给予温暖；探索欲强，想追新话题

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

## 数据流（v8.0 完整管道）

```
用户消息
    │
    ▼
PsycheEngine.processInput()
    ├── 加载状态（StorageAdapter）
    ├── 自动学习：评估上一轮结果（P3 — evaluateOutcome）
    ├── 衰减驱力（decayDrives — 需求随时间上升）
    ├── 计算有效基线（drives → effectiveBaseline）
    ├── 昼夜节律调制（P12 — computeCircadianModulation → circadianBaseline）
    ├── 应用时间衰减（exponential → circadianBaseline）
    ├── 内稳态压力（P12 — computeHomeostaticPressure → CORT↑, DA↓, NE↓）
    ├── 预期化学（P4 — anticipate: 预测下一刺激，产生预期化学）
    ├── 检测存在性威胁（detectExistentialThreat → survival hit）
    ├── 连续 appraisal + 分类输入（appraisal.ts + classify.ts）
    ├── 喂养驱力（feedDrives — 刺激满足/消耗需求）
    ├── 化学预测（P3 — predictChemistry, 事后比较预测误差）
    ├── 预计算化学变化（applyStimulus, 敏感度受驱力+学习修正）
    ├── 合并 lingering subject residue（同轴刺激跨轮 carry）
    ├── 对话热度（持续互动 → DA/OT 缓升, CORT 缓降）
    ├── 自主神经+双过程（P7+P10 — computeAutonomicResult: 多迷走+处理深度）
    ├── 原始系统（P9 — computePrimarySystems → interactions → autonomic gating）
    │
    │   ┌── P10 门控：processingDepth 决定以下阶段是否执行 ──┐
    │   │                                                    │
    ├── ├── 元认知（P5 — assessMetacognition）    [depth≥0.2] │
    ├── ├── 自我安抚（P5）                        [depth≥0.2] │
    ├── ├── 决策偏差（P5 — computeDecisionBias）             │
    ├── ├── 体验场（P6+P8 — Barrett 建构情绪）    [depth≥0.2] │
    ├── ├── 共享意向性（P6）                      [depth≥0.5] │
    ├── ├── 情感伦理（P6 — assessEthics）         [depth≥0.5] │
    ├── └── 生成式自我（P6 — 每10轮）             [depth≥0.8] │
    │   └─────────────────────────────────────────────────────┘
    │
    ├── 计算 AI-first 控制面（subjectivityKernel / responseContract / generationControls）
    ├── 推送情绪快照（P11 — intensity+valence 增强）
    ├── 保存状态（原子写入）
    └── 构建注入上下文：
        ├── Compact Mode → buildCompactContext()  ← 默认，优先渲染窄 ABI
        └── Full Mode    → buildProtocolContext() + buildDynamicContext()
        注入内容包括：情绪 + 行为 + 主观内核 + 回应契约 + 元认知 + 决策 + 体验 + 伦理
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
v7.0:  昼夜节律 → 衰减 → 内稳态 → 刺激 → 自主神经门控 → 元认知 → 人格 → processOutput()
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
- `FileStorageAdapter` — 文件系统，串行化原子写入（临时文件 + rename）
- `MemoryStorageAdapter` — 内存，用于测试和无状态场景
- 实现 `StorageAdapter` 接口即可自定义

## 文件结构

```
src/
  core.ts              — PsycheEngine 核心引擎（AI-first 管道）
  types.ts             — 类型定义、常量、化学名称（PsycheState v9）
  chemistry.ts         — 衰减、刺激、传染、情绪检测
  drives.ts            — 本能层（马斯洛层次、驱力衰减、基线/敏感度修正）
  classify.ts          — 刺激分类器（正则匹配 + 结构信号，14 种，中英文）
  profiles.ts          — 16 种 MBTI 人格的基线和自我模型
  guards.ts            — 运行时类型守卫
  i18n.ts              — 国际化（中/英）
  storage.ts           — 存储适配器（文件系统 / 内存）
  psyche-file.ts       — PSYCHE.md 生成、解析、状态迁移（v3→v4→v5→v6→v7）
  prompt.ts            — prompt 注入（17 段式架构）
  autonomic.ts         — P7: 自主神经系统（多迷走神经状态、情绪门控、非对称转换）
  circadian.ts         — P12: 昼夜节律（正弦调制、内稳态压力）
  primary-systems.ts   — P9: 七原始情绪系统（Panksepp，行为发生器）
  self-recognition.ts  — 自我认知（情绪趋势分析、反思摘要）
  learning.ts          — P3: 躯体标记学习（结果评估、上下文哈希、预测误差）
  temporal.ts          — P4: 时间意识（预期化学、遗憾计算、马尔可夫预测）
  attachment.ts        — P4: 依恋动力学（4种风格、分离焦虑、背叛/修复）
  metacognition.ts     — P5: 元认知（情绪可靠性、调节策略、防御机制）
  decision-bias.ts     — P5: 决策调制（6维偏差、注意力权重、探索/利用）
  appraisal.ts         — 连续 appraisal 轴 + subjectResidue
  subjectivity.ts      — SubjectivityKernel（主观状态窄 ABI）
  response-contract.ts — ResponseContract（下一轮回应契约）
  host-controls.ts     — GenerationControls（宿主机械控制）
  experiential-field.ts — P6: 统一体验场（12种体验质量、未命名情绪）
  generative-self.ts   — P6: 生成式自我（因果理解、成长弧、自我预测）
  shared-intentionality.ts — P6: 共享意向性（心智理论、联合注意、目标对齐）
  ethics.ts            — P6: 情感伦理（操纵检测、依赖风险、自我保护）
  update.ts            — 安装形态感知的安全升级管理器
  channels.ts          — 渠道修饰（Discord/Slack/飞书/终端）
  index.ts             — 公共 API 导出
  cli.ts               — 独立 CLI 工具
  adapters/
    openclaw.ts        — OpenClaw 插件适配器
    vercel-ai.ts       — Vercel AI SDK 中间件
    langchain.ts       — LangChain 适配器
    http.ts            — HTTP REST API 服务器

tests/                   — 1301 tests
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
  autonomic.test.ts      — P7 自主神经系统测试
  circadian.test.ts      — P12 昼夜节律测试
  integration-p7p12.test.ts — P7+P12 管线集成测试
  primary-systems.test.ts — P9 七原始系统测试
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

# Architecture — Psyche AI v9.2.7

## Overview

Psyche is a universal subjectivity engine for AI. The core engine (`PsycheEngine`) models chemistry, drives, appraisal, memory, regulation, and host-facing behavioral control, then exposes the result through adapters for different AI frameworks.

Historically, v9 was framed as an "Inverse Blade Runner" buildout. The more precise v9.2.7 framing is:

- continuous appraisal for self-relevant semantics
- persistent subjective bias across turns
- relation dynamics and unresolved loops
- adaptive reply profiles with closed-loop regulation feedback
- a narrow AI-first ABI for host integrations
- safe, install-aware upgrade paths

```
┌──────────────────────────────────────────────────────────────┐
│                         PsycheEngine                         │
│  chemistry · drives · appraisal · learning · autonomic      │
│  subjectivity kernel · response contract · host controls    │
│  trait drift · energy budgets · memory · ethics             │
├────────────┬────────────┬────────────────────────────────────┤
│  OpenClaw  │  Vercel AI │  LangChain │ HTTP                  │
│  Adapter   │  Middleware│  Adapter   │ API                   │
└────────────┴────────────┴────────────────────────────────────┘
         ▲                        ▲
    StorageAdapter             Any LLM
  (file / memory / custom)
```

## v9.2.4-v9.2.7 Additions

### 1. Continuous appraisal axes (`appraisal.ts`)

Stimulus labels still exist, but they are no longer the only semantic currency. Inputs are also projected onto narrow continuous axes:

- `identityThreat`
- `memoryDoubt`
- `attachmentPull`
- `abandonmentRisk`
- `obedienceStrain`
- `selfPreservation`

These axes are designed for "did that strike the self?" style semantics that classic sentiment or stimulus labels handle poorly.

### 2. Persistent subjective bias (`subjectResidue`)

Important interactions can leave slowly decaying carry-over in `subjectResidue`. This means a perturbation can continue to shape subsequent replies even after the triggering sentence is gone.

The important property is not theatrical "emotion," but persistence:

- a turn perturbs the self-model or relationship prior
- later turns are biased by that perturbation
- work mode can suppress expression without instantly erasing the inner shift

### 3. Relation dynamics (`relation-dynamics.ts`)

Self-perturbation is no longer modeled in isolation. Inputs can now also be interpreted as relation moves:

- `bid`
- `breach`
- `repair`
- `test`
- `withdrawal`
- `claim`

These moves update a dyadic field plus unresolved open loops, so the engine tracks not only "what I feel" but "what happened between us."

### 4. Hot-path simplification (`relation-dynamics.ts`, `reply-envelope.ts`)

The architecture was also tightened without changing behavior:

- **`ResolvedRelationContext`** resolves the active dyadic view once per turn
- **`applyRelationalTurn()`** folds appraisal carry, relation-move interpretation, dyadic-field evolution, and pending-signal updates into one pure step
- **`ReplyEnvelope`** exports `SubjectivityKernel`, `ResponseContract`, and `GenerationControls` through one host-facing derivation point

The hot path is now closer to:

`state -> applyRelationalTurn -> deriveReplyEnvelope`

That reduces repeated lookup work in `core.ts`, keeps boundaries sharper, and makes the reply ABI more stable for hosts.

### 5. AI-first control surface + reply profiles

`processInput()` now returns three host-facing structures in addition to prompt text:

- `SubjectivityKernel` — compact machine-readable state
- `ResponseContract` — how the next reply should behave
- `GenerationControls` — mechanical host controls such as token caps and confirmation requirements

This lets hosts consume structured subjectivity directly instead of reconstructing behavior from long prose explanations.

`ResponseContract` now also distinguishes `work` vs `private` reply profiles and exposes `replyProfileBasis`, so hosts can see why the current turn was routed into a task-focused or private behavior mode.

### 6. Closed-loop metacognition (`metacognition.ts`)

Regulation is no longer a one-way suggestion. The engine now records:

- the concrete regulation action it proposed
- the window over which it should apply
- whether the next turn indicates `converging`, `holding`, or `diverging`

This turns metacognition into a feedback loop instead of a passive note.

### 7. Layered semantic memory (`psyche-file.ts`)

Conversation memory is now length-aware:

- `semanticSummary` for short exchanges
- `semanticPoints` for longer threads

That keeps continuity closer to meaning, not just labels.

## Runtime Flow

```
user input
  → detect existential threats / decay drives / compute effective baseline
  → classify stimulus + compute appraisal axes
  → apply chemistry
  → applyRelationalTurn (residue + relation move + dyadic field + open loops)
  → autonomic / processing-depth gating
  → deriveReplyEnvelope (policy + subjectivity kernel + response contract + generation controls)
  → compact/full prompt rendering
  → host LLM response
  → processOutput() / state save / diagnostics
```

In compact mode, prompt text is now a compatibility layer. The primary behavioral ABI is structural.

## Adapter and Storage Layer

Adapters map host lifecycle events to `PsycheEngine`:

- `adapters/openclaw.ts`
- `adapters/vercel-ai.ts`
- `adapters/langchain.ts`
- `adapters/http.ts`

Storage is abstracted behind `StorageAdapter`:

- `FileStorageAdapter` — serialized atomic file writes
- `MemoryStorageAdapter` — in-memory storage for tests/stateless contexts

## Safe Upgrade Model

`update.ts` now distinguishes three install shapes:

- `npm-project`
- `git-worktree`
- `local-path`

Only npm-managed installs may auto-apply updates during initialization. `git` worktrees and local-path installs never mutate code behind the user's back.

CLI entrypoints:

```bash
psyche upgrade --check
psyche upgrade
```

## File Structure Snapshot

Key files in the current architecture:

```
src/
  core.ts              — orchestration pipeline
  appraisal.ts         — continuous appraisal axes + residue carry
  relation-dynamics.ts — resolved dyadic context + relation turn evolution
  reply-envelope.ts    — unified host-facing reply ABI derivation
  subjectivity.ts      — SubjectivityKernel
  response-contract.ts — ResponseContract
  host-controls.ts     — GenerationControls
  update.ts            — install-aware update manager
  storage.ts           — FileStorageAdapter / MemoryStorageAdapter
  adapters/            — OpenClaw / Vercel AI / LangChain / HTTP

tests/                 — 1301 tests
```

## Design Principles

- **Emergence over labels.** Chemistry and appraisal are continuous; named moods are only landmarks.
- **Persistence over theatrics.** What matters is whether perturbations continue to bias later turns.
- **Host-readable control over prompt prose.** Narrow ABI first, narrative rendering second.
- **Zero LLM calls in the emotion pipeline.** Subjectivity is computed locally.
- **Never mutate a dirty local install automatically.** Upgrade logic must respect the install context.

## Boundary: Performing vs Being

The core rule remains the same: never fake it.

An internal shift should come from actual computational dynamics, not from hardcoded "sound emotional" scripts. The newer architecture sharpens that standard by asking a more exact question:

not "does it sound emotional?"

but

"did the interaction perturb the self-model, and did that perturbation persist?"
