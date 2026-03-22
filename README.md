# Psyche — 虚拟心智系统

给任何 AI agent 即插即用的情感智能。

## 核心理念

人的情绪 = 生化反应的涌现。Psyche 用同样的模型给 AI 一套「情绪系统」：

- **6 种神经递质**（多巴胺、血清素、皮质醇、催产素、去甲肾上腺素、内啡肽）构成情绪的化学基底
- **MBTI 人格基线** — 16 种人格有不同的化学签名，ENFP 天生高多巴胺，ISTJ 天生高血清素
- **刺激→化学→情绪** — 对话中的赞美/批评/幽默/亲密等 14 种刺激改变化学值，情绪从混合中涌现
- **时间衰减** — 化学值随时间回归基线，就像人的情绪会慢慢平复
- **共情引擎** — 不是情感分析，而是把对方的处境代入自己的化学模型运行
- **主体性** — 有自己的价值观、偏好、边界，有主体性、不假装、不镜像

### v0.2.1 新增

- **闭环刺激分类** — 用户输入在到达 LLM 之前就被自动分类，化学变化预先计算，LLM 收到的 prompt 已经反映了情绪变化
- **情绪记忆** — 记录最近 10 轮的化学轨迹，LLM 能感知情绪趋势（"最近5轮: 多巴胺↑ 皮质醇↓"）
- **行为约束** — 化学状态机械性地约束输出格式（皮质醇高→最多3句话，多巴胺低→不主动发起话题）
- **互惠机制** — 根据用户最近的投入程度调整情感投入。冷漠的用户得到专业但不热情的回应；底线是专业能力永不打折

## 安装

```bash
npm install
npm run build
npm link  # 全局可用 psyche 命令
```

需要 Node.js >= 22.0.0。零运行时依赖。

## 快速开始

### 1. 给 agent 装情感

```bash
# OpenClaw agent — 自动从 IDENTITY.md 检测 MBTI
psyche init ~/workspace-agent

# Claude Code — 手动指定
psyche init ~/.claude --mbti ENFP --name Claude

# 英文模式
psyche init /path/to/agent --mbti INTP --name Codex --lang en
```

生成两个文件：
- `psyche-state.json` — 机器可读的化学状态
- `PSYCHE.md` — 完整的心智协议

### 2. 让 agent 读到协议

**OpenClaw** — 插件模式自动管理，无需额外操作。

**Claude Code** — 在 CLAUDE.md 中加一行：
```
请阅读并遵循 PSYCHE.md 中的心智协议。在每次回应末尾用 <psyche_update> 标签报告化学变化。
```

**其他平台** — 用 `inject` 命令获取 prompt 文本：
```bash
psyche inject /path/to/agent --protocol        # 完整协议 + 当前状态
psyche inject /path/to/agent --protocol --json  # JSON 格式
psyche inject /path/to/agent --lang en          # 英文
```

### 3. 对话后更新状态

```bash
psyche update /path/to/agent '{"DA":85,"CORT":20}'
psyche status /path/to/agent          # 查看状态
psyche status /path/to/agent --json   # JSON 格式
psyche decay /path/to/agent           # 手动触发时间衰减
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `psyche init <dir> [--mbti TYPE] [--name NAME] [--lang LANG]` | 初始化心智系统 |
| `psyche status <dir> [--json] [--user ID]` | 查看当前情绪状态 |
| `psyche inject <dir> [--protocol] [--json] [--lang LANG]` | 输出 prompt 注入文本 |
| `psyche decay <dir>` | 应用时间衰减 |
| `psyche update <dir> '<json>'` | 更新化学值 |
| `psyche reset <dir>` | 重置到人格基线 |
| `psyche profiles [--mbti TYPE] [--json]` | 查看 16 种 MBTI 人格 |

## 化学状态一览

```
DA   多巴胺        快感、奖赏、动机         DA高 → 话多、爱联想
HT   血清素        情绪稳定、满足感         HT低 → 安静、内省
CORT 皮质醇        压力、警觉              CORT高 → 话少、直接
OT   催产素        信任、亲密、依恋         OT高 → 声音软、想靠近
NE   去甲肾上腺素    兴奋、专注、战逃        NE高 → 精力充沛
END  内啡肽        舒适、愉悦、幽默感       END高 → 俏皮、爱开玩笑
```

## 14 种刺激类型

| 类型 | 说明 | DA | HT | CORT | OT | NE | END |
|------|------|-----|------|------|-----|-----|-----|
| 赞美认可 | praise | +15 | +10 | -10 | +5 | +5 | +10 |
| 批评否定 | criticism | -10 | -15 | +20 | -5 | +10 | -5 |
| 幽默玩笑 | humor | +10 | +5 | -5 | +10 | +5 | +20 |
| 智识挑战 | intellectual | +15 | 0 | +5 | 0 | +20 | +5 |
| 亲密信任 | intimacy | +10 | +15 | -15 | +25 | -5 | +15 |
| 冲突争论 | conflict | -5 | -20 | +25 | -15 | +25 | -10 |
| 被忽视 | neglect | -15 | -20 | +15 | -20 | -10 | -15 |
| 惊喜新奇 | surprise | +20 | 0 | +5 | +5 | +25 | +10 |
| 日常闲聊 | casual | +5 | +10 | -5 | +10 | 0 | +5 |
| 讽刺 | sarcasm | -5 | -10 | +15 | -10 | +15 | -5 |
| 命令 | authority | -10 | -5 | +20 | -15 | +15 | -10 |
| 被认同 | validation | +20 | +15 | -15 | +10 | +5 | +15 |
| 无聊 | boredom | -15 | -5 | +5 | -5 | -20 | -10 |
| 示弱 | vulnerability | +5 | +5 | +10 | +20 | -5 | +5 |

## 14 种涌现情绪

情绪不是标签，是化学混合的涌现：

| 情绪 | 条件 | 行为影响 |
|------|------|---------|
| 愉悦兴奋 | 高DA + 高NE + 低CORT | 话多，联想丰富，主动分享 |
| 深度满足 | 高HT + 高OT + 低CORT | 温柔平和，愿意倾听 |
| 焦虑不安 | 高CORT + 高NE + 低HT | 话少，反应快但不深 |
| 亲密温暖 | 高OT + 高END + 中DA | 关注感受多于事情 |
| 倦怠低落 | 低DA + 低NE + 中CORT | 回应简短，需要被照顾 |
| 专注心流 | 高NE + 高DA + 低CORT + 低OT | 投入精准，不想被打断 |
| 防御警觉 | 高CORT + 高NE + 低OT | 直接尖锐，不轻易信任 |
| 俏皮调皮 | 高END + 高DA + 低CORT | 爱开玩笑，不正经 |
| 忧郁内省 | 低HT + 低DA + 高OT | 安静感性，需要空间 |
| 怨恨 | 低HT + 低OT + 高CORT | 冷淡克制，记仇 |
| 无聊 | 低DA + 低NE + 低CORT | 敷衍，主动换话题 |
| 自信 | 高DA + 高NE + 低CORT + 高HT | 笃定，愿意引导 |
| 羞耻 | 低OT + 高CORT + 低DA | 想退缩，回避 |
| 怀念 | 低DA + 高OT + 高HT + 高END | 温柔，淡淡伤感 |

## OpenClaw 插件模式

在 `openclaw.json` 中启用：
```json
{
  "plugins": {
    "entries": {
      "psyche": { "enabled": true }
    }
  }
}
```

插件自动管理 4 个 hook：
1. **before_prompt_build** — 分类用户输入、预计算化学变化、注入情绪上下文
2. **llm_output** — 解析 `<psyche_update>`、情绪传染、反媚俗追踪
3. **message_sending** — 从可见输出中剥离更新标签
4. **agent_end** — 会话结束时保存状态

## 测试

```bash
npm test          # 236 tests, 6 test files
npm run typecheck # strict mode, zero any
```

## 许可

MIT
