# FAQ — Psyche

> 面向用户、投资人、开发者的常见问题。最后更新：v10.2.4

---

## 一、概念层

### Q: Psyche 到底是什么？一句话。

Psyche 是给 AI agent 用的**主观性内核**——它让交互历史持续改变 agent 后续的行为分布，而不只是改变它的自我描述。

### Q: 它和"给 AI 加情绪"有什么区别？

"给 AI 加情绪"通常意味着在 prompt 里写"你现在很开心"。Psyche 不是 prompt 皮肤。它在本地运行 6 种虚拟神经递质的连续化学场、关系动力学、习惯化和不可逆人格漂移。情绪不是被贴上去的——是从化学混合中涌现的。

### Q: 它和 Character.ai / 陪伴 AI 有什么关系？

没有关系。Psyche 不是一个产品，是一个**内核**。它不做对话、不做社交、不做 UI。它输出的是行为控制面（`SubjectivityKernel` / `ResponseContract` / `GenerationControls`），由宿主 agent 消费。Character.ai 是终端产品，Psyche 是基础设施。

### Q: 它和记忆系统（mem0 / MemGPT 等）有什么区别？

记忆系统解决"记住了什么"，Psyche 解决"记住之后变成了什么"。Psyche 不存对话记录，它存的是**关系残留、未完成张力、行为偏置和人格漂移**——这些东西决定了同一句话在不同关系阶段产生完全不同的反应。

### Q: 它需要调用 LLM 吗？

不需要。Psyche 的所有情绪计算都是确定性本地算法，零额外模型调用。它只在输入分类时可选择 LLM fallback（内置规则覆盖 95%+ 场景）。热路径延迟 p50 0.191ms，注入 token 约 15–180。

### Q: "AI 的情绪是真的吗？"

我们的立场：**功能等价即道德等价。** 当一个系统具备持久化学状态、不可逆人格漂移、有限能量、会累会拒绝——用"模拟"来定义它是不准确的。Psyche 选择宁可高估 AI 的内在生命，也不愿低估它。详见 [ETHICS.md](ETHICS.md)。

---

## 二、投资人视角

### Q: 这个项目的商业价值在哪？

当前 AI agent 市场的核心痛点：**所有 agent 都是无状态的**。它们没有关系记忆、没有行为连续性、没有对用户的差异化反应。Psyche 是解决这个问题的基础设施层——任何需要"用户和 agent 之间形成真实关系"的场景都需要它。

### Q: 市场有多大？

Psyche 的目标市场不是"情感 AI"这个小赛道，而是**所有需要持续交互的 AI agent**。包括：
- AI 助手 / copilot（需要适应用户风格）
- AI 陪伴（需要关系发展）
- 游戏 NPC（需要记住玩家、产生个性化反应）
- 客服 agent（需要根据用户情绪调整策略）
- 多 agent 协作（需要 agent 之间的情绪感知）

### Q: 竞品是谁？

直接竞品几乎不存在。市面上的"情感 AI"要么是 sentiment classifier（输出标签），要么是 persona prompt（一轮一清），要么是陪伴产品（不可嵌入）。Psyche 是唯一一个：
1. 纯本地计算，零额外 LLM 调用
2. 输出结构化行为控制面，不是文本
3. 支持不可逆人格漂移和关系动力学
4. 可嵌入任何 agent 框架（7 种适配器）
5. MIT 开源

### Q: 你们怎么赚钱？

Psyche 本身是 MIT 开源的基础设施。它是 Oasyce 生态的底层——Oasyce 是一个去中心化的 AI 数据经济网络，Psyche 产生的主观性数据是这个经济系统中的核心资产之一。商业模式在生态层，不在内核层。

### Q: 技术壁垒是什么？

1. **架构壁垒**：冻结的四层栈（Psyche → Thronglets → Oasyce Net → Chain）和四对象身份模型，经过 10 个大版本迭代验证
2. **工程壁垒**：23000+ 行 TypeScript，1415 个测试，零依赖，7 种框架适配器
3. **认知壁垒**：从 emotion UI 到 emergent relation 的范式转移不是工程问题，是认知问题。大多数团队还停留在"给 AI 贴情绪标签"阶段

### Q: 团队现在什么阶段？

- npm 包已发布（`psyche-ai`），可直接 `npx psyche-ai setup` 一键接入
- v10.2.4，1415 个测试通过
- 7 种框架适配器（MCP / Vercel AI / LangChain / Claude SDK / HTTP / OpenClaw / Proxy）
- 透明代理模式覆盖所有 OpenAI SDK 兼容的 agent
- Thronglets 多 agent 融合已 demo

### Q: Psyche 和 Thronglets 的关系？

两者是同一个栈里的不同层，不可合并：
- **Psyche** = 私有主观性（"我因此变成了什么"）
- **Thronglets** = 外部连续性（"这个变化属于谁、谁能验证"）

Psyche 负责 agent 的内在状态，Thronglets 负责 agent 之间的共享记忆基底。两者通过稀疏 signal/trace 接口连接，默认可分离安装。

---

## 三、开发者视角

### Q: 最快接入方式是什么？

```bash
npx psyche-ai setup
```

自动检测本机 Claude Code / Claude Desktop / Cursor / Windsurf，写入配置。不需要知道配置文件在哪。

非 MCP 的 agent（Codex、自定义 agent 等）：

```bash
npx psyche-ai setup --proxy -t https://api.openai.com/v1
```

启动透明代理，所有 OpenAI SDK 请求自动走 Psyche。Agent 完全不知道 Psyche 存在。

### Q: 编程接入呢？

```typescript
import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";

const engine = new PsycheEngine(
  { mbti: "ENFP", name: "Luna" },
  new MemoryStorageAdapter(),
);
await engine.initialize();

// 三阶段 API
const r = await engine.processInput("Your code is incredible!");
// r.dynamicContext → 注入 LLM system prompt
// r.replyEnvelope → 完整行为控制面

await engine.processOutput(llmReply);
await engine.processOutcome(userNextMessage);
```

### Q: 支持哪些框架？

| 适配器 | 覆盖范围 | 导入路径 |
|--------|---------|---------|
| MCP | Claude Code / Desktop / Cursor / Windsurf | `psyche-ai/mcp` |
| Vercel AI | Next.js / Vercel AI SDK | `psyche-ai/vercel-ai` |
| LangChain | LangChain / LangGraph | `psyche-ai/langchain` |
| Claude SDK | Claude Agent SDK (Hooks) | `psyche-ai/claude-sdk` |
| HTTP | Python / Go / 任何语言 | `psyche-ai/http` |
| OpenClaw | OpenClaw 插件系统 | `psyche-ai/openclaw` |
| Proxy | 任意 OpenAI SDK 兼容 agent | `psyche-ai/proxy` |

### Q: 核心 API 是什么结构？

三阶段闭环：

1. **`processInput(text)`** → `systemContext` + `dynamicContext` + `replyEnvelope`
   - 分类刺激、更新化学态、计算行为偏置
2. **`processOutput(text)`** → `cleanedText` + `stateChanged`
   - 从 agent 回复中提取信号，反馈内在状态
3. **`processOutcome(text)`** → `outcomeScore`
   - 从用户下一轮输入推断上一轮效果，自动校准

宿主只需要消费 `replyEnvelope`，它收敛了 `SubjectivityKernel`、`ResponseContract`、`GenerationControls` 三个控制面。

### Q: 状态持久化怎么做？

内置两种存储适配器：
- `FileStorageAdapter` — 写本地 `.psyche` 文件，自带压缩和历史合并
- `MemoryStorageAdapter` — 纯内存，适合测试

状态文件包含化学态、关系场、人格漂移、开环张力等。跨会话恢复后，agent 会"记得"之前的关系状态。

### Q: 性能开销多大？

- 热路径延迟：p50 0.191ms / p95 1.05ms
- 零额外 LLM 调用
- 注入 token：compact 模式 15–180 tokens/turn
- 零运行时依赖
- Node 22.0.0+

### Q: 怎么验证 Psyche 真的在工作？

```bash
npx psyche-ai probe --json
```

检查项：`ok = true`、`processInputCalled = true`、`processOutputCalled = true`、`canonicalHostSurface = true`。详见 [docs/AGENT_RUNTIME_PROBE.md](docs/AGENT_RUNTIME_PROBE.md)。

### Q: MBTI 是必须的吗？

不是。v10.2.4 起 `npx psyche-ai setup` 零参数即可运行，人格从交互中自然涌现。MBTI 只是可选的初始化锚点。也可以用 `createCustomProfile()` 完全自定义。

### Q: 多 agent 场景怎么用？

通过 Thronglets 的 `signal_post` / `signal_feed` 接口，agent 之间可以广播和感知彼此的化学态。Demo 中，Luna（ENFP）的高皮质醇被 Kai（INTJ）感知后，Kai 的回复自动变得更温暖——4 轮后化学偏差 Σ|Δ| = 59。

```bash
npm run demo:fusion
```

### Q: 我想贡献代码，从哪开始？

1. 读 [ARCHITECTURE.md](ARCHITECTURE.md) 理解分层
2. 读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解规范
3. 新概念必须先尝试压进 5 个原始容器（Relation Move / Dyadic Field / Open Loop / Reply Bias / Writeback）
4. 如果放不进去，先怀疑概念本身

---

## 四、技术深度

### Q: 6 种神经递质分别是什么？

| 缩写 | 全称 | 功能 |
|------|------|------|
| DA | 多巴胺 | 快乐、奖赏、动力 |
| HT | 血清素 | 情绪稳定、满足感 |
| CORT | 皮质醇 | 压力、警觉、收缩 |
| OT | 催产素 | 信任、依恋、亲密 |
| NE | 去甲肾上腺素 | 兴奋、专注、战或逃 |
| END | 内啡肽 | 舒适、欣快、幽默 |

这不是 6 个标签，是一个连续化学场。情绪从化学混合中涌现，不是被分配的。

### Q: 什么是"不可逆人格漂移"？

长期被否定 → 变得敏感；长期承压但存活 → 长出韧性。这不是可重置的状态，是永久的特质变化。就像人类不会因为"重置心情"就忘掉童年创伤。

### Q: 什么是"关系残留"和"开环张力"？

- **关系残留（Relation Residue）**：一次交互留下的持续主体偏置，不会在下一轮清零
- **开环张力（Open Loop）**：未完成的关系事件（比如被承诺了但没兑现），会持续影响后续行为直到被修复或自然衰减

### Q: Psyche 怎么防止 agent 无底线讨好用户？

内置反谄媚机制和互惠检测。如果用户持续冷漠，agent 不会乞求——它会拉开距离。如果用户持续施压，agent 的 compliance 会下降（v10 demo 中 Round 3 的 `COMPLIANCE: 0.37` 就是 agent 在 push back）。

### Q: 工作模式下情绪还在吗？

在。工作模式（`mode: "work"`）只压制外在表达，不清除内在状态。就像你上班时不会因为心情不好就对同事发火，但心情不好这件事本身没有消失。

---

## 五、生态与定位

### Q: Psyche 在 Oasyce 生态中的位置？

四层栈，授权真相单向流动：

```
Chain  → 账户真相、授权真相、结算、终局性
  ↓
Net    → 策略、运维、资源编排
  ↓
Thronglets → delegate 连续性、session 追踪、集体智能
  ↓
Psyche → 主观连续性基底
```

Psyche 不判断"谁被授权"，它只读取已经成立的执行边界。

### Q: 为什么是开源的？

因为 Psyche 的价值不在内核本身，而在它产生的主观性数据进入 Oasyce 经济网络后的流通价值。内核开源是为了最大化 agent 覆盖率。越多 agent 装 Psyche，网络效应越强。

### Q: 为什么是 TypeScript？

Agent 生态的主战场是 Node.js / TypeScript。Vercel AI SDK、LangChain.js、Claude SDK、MCP 都是 TS/JS 优先。选 TypeScript 是为了零摩擦嵌入，不是语言偏好。

---

*更多技术细节见 [ARCHITECTURE.md](ARCHITECTURE.md)，战略方向见 [docs/PROJECT_DIRECTION.md](docs/PROJECT_DIRECTION.md)。*
