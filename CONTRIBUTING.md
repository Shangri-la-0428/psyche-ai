# 贡献指南 — Artificial Psyche

[English version below](#contributing--artificial-psyche)

## 环境搭建

```bash
git clone https://github.com/Shangri-la-0428/oasyce_psyche.git
cd oasyce_psyche
npm install
npm run build
npm test
```

需要 Node.js >= 22.0.0。

## 项目结构

```
src/core.ts        — PsycheEngine 核心引擎
src/drives.ts      — 本能层（马斯洛层次、驱力衰减、基线/敏感度修正）
src/adapters/      — 框架适配器（OpenClaw, Vercel AI, LangChain, HTTP）
src/storage.ts     — 存储适配器
src/prompt.ts      — prompt 注入（9 段式架构）
src/self-recognition.ts — 自我认知（情绪趋势分析）
src/update.ts      — 非阻塞自动更新
src/chemistry.ts   — 化学计算
src/classify.ts    — 刺激分类器
src/profiles.ts    — MBTI 人格
```

架构详情见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 先看战略约束

在添加任何新概念之前，先读 [docs/PROJECT_DIRECTION.md](docs/PROJECT_DIRECTION.md)。

默认规则不是“多加一个对象类型”，而是先把新概念压进已有 5 个原始容器：

1. `Relation Move`
2. `Dyadic Field`
3. `Open Loop / Residue`
4. `Reply Bias / Control ABI`
5. `Writeback / Learning`

如果一个概念放不进去，先怀疑概念本身，而不是扩充对象系统。

跨 Psyche / Thronglets / Oasyce Net / Oasyce Chain 的身份抽象也已经冻结成 4 个对象：

1. `principal`
2. `account`
3. `delegate`
4. `session`

不要再添加新的顶层身份对象，除非现有四元组和 policy / view / trace 层都无法表达现实。

## 两个硬闸

以后默认执行这两条，不靠口头约定：

1. **接入硬闸**
   - 任何 agent 如果声称“已经在用 Psyche”，必须附 `psyche probe --json` 的结果
   - 没有 probe，不算真正接入
   - 说明文档见 [docs/AGENT_RUNTIME_PROBE.md](docs/AGENT_RUNTIME_PROBE.md)

2. **发布硬闸**
   - npm 发版前必须通过 `npm run release:guard`
   - 本地发布要求：工作树干净、当前分支是 `main`、`HEAD == origin/main`
   - CI 发布要求：当前发布提交必须已经属于 `origin/main`
   - 这条规则用来防止 npm 版本领先 GitHub `main`

## 在新增刺激类型之前

新增 `StimulusType` 现在应被视为**例外**，不是默认扩展路径。

先确认它不能更好地表达为：

- 一组 appraisal 轴的组合
- 某种关系动作解释
- 某种 residue / open loop
- 某种 reply bias 或 writeback signal

只有在这些都不能表达，而且它确实能稳定预测行为后果时，才考虑新增刺激类型。

## 添加新的刺激类型

1. 在 `src/types.ts` 的 `StimulusType` 联合类型中添加
2. 在 `src/chemistry.ts` 的 `STIMULUS_VECTORS` 中添加化学向量
3. 在 `src/guards.ts` 的 `STIMULUS_TYPES` Set 中添加类型字符串
4. 在 `src/classify.ts` 的 `RULES` 中添加正则匹配规则
5. 在 `tests/chemistry.test.ts` 中添加测试用例
6. 更新 `src/psyche-file.ts` 中 `generatePsycheMd` 的刺激表格
7. 在 `src/i18n.ts` 的协议字符串中添加刺激描述

每个向量有 6 个值（DA, HT, CORT, OT, NE, END），范围 -25 到 +25。思考：
- 这个刺激在真人身上会激活什么神经化学反应？
- 与现有的刺激类型是否一致？

## 在新增情绪模式之前

新增情绪模式也应该是**例外**。

优先判断它是否只是：

- 现有化学混合的另一种解释
- 现有关系场的另一种外显结果
- 现有 reply bias 的不同组合

如果只是命名变漂亮，不要新增模式。

## 添加新的情绪模式

1. 在 `src/chemistry.ts` 的 `EMOTION_PATTERNS` 中添加新条目
2. 必须包含所有字段：`name`, `nameZh`, `condition`, `expressionHint`, `behaviorGuide`
3. `condition` 函数接受 `ChemicalState` 返回 `boolean`
4. 确保条件不和现有模式过度重叠
5. 在 `tests/chemistry.test.ts` 中添加检测测试

## 修改本能驱力

驱力定义在 `src/drives.ts`。修改前理解三个核心机制：

1. **驱力→基线映射** (`computeEffectiveBaseline`): 每种驱力不满足时如何拉动化学基线
2. **驱力→敏感度映射** (`computeEffectiveSensitivity`): 每种驱力饥饿时放大哪些刺激
3. **刺激→驱力映射** (`STIMULUS_DRIVE_EFFECTS`): 每种刺激喂养/消耗哪些驱力

添加新驱力效应时，确保遵循马斯洛抑制逻辑——低层驱力优先。

## 添加 MBTI 人格变体

人格定义在 `src/profiles.ts`。每个人格包含：
- `baseline`: 6 个化学值 (0-100)，应遵循文件中记录的设计原则
- `sensitivity`: 刺激影响强度 (0.5-1.5)
- `temperament`: 一句话描述
- `defaultSelfModel`: 价值观、偏好、边界、当前兴趣

## PR 准则

- 所有 PR 必须通过 `npm test`（1308+ 测试）和 `npx tsc --noEmit --strict`
- 新功能必须包含测试
- 保持零依赖策略：不引入运行时依赖
- 用户可见的字符串应通过 `src/i18n.ts`
- 如果修改了 `PsycheState` 的结构，需要在 `loadState()` 中处理迁移

---

# Contributing — Artificial Psyche

## Setup

```bash
git clone https://github.com/Shangri-la-0428/oasyce_psyche.git
cd oasyce_psyche
npm install
npm run build
npm test
```

Requires Node.js >= 22.0.0.

## Project Structure

```
src/core.ts        — PsycheEngine core
src/drives.ts      — Innate drives (Maslow hierarchy, decay, baseline/sensitivity modification)
src/adapters/      — Framework adapters (OpenClaw, Vercel AI, LangChain, HTTP)
src/storage.ts     — Storage adapters
src/prompt.ts      — Prompt injection (9-section architecture)
src/self-recognition.ts — Self-recognition (emotional tendency analysis)
src/update.ts      — Non-blocking auto-update
src/chemistry.ts   — Chemistry calculations
src/classify.ts    — Stimulus classifier
src/profiles.ts    — MBTI personalities
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Strategic Constraint First

Read [docs/PROJECT_DIRECTION.md](docs/PROJECT_DIRECTION.md) before adding new concepts.

The default move is not “add another object type.” First try to compress the new concept into one of the five primitive containers:

1. `Relation Move`
2. `Dyadic Field`
3. `Open Loop / Residue`
4. `Reply Bias / Control ABI`
5. `Writeback / Learning`

If the concept does not fit, question the concept before expanding the object model.

The cross-stack identity model is also frozen around four objects:

1. `principal`
2. `account`
3. `delegate`
4. `session`

Do not introduce new top-level identity objects unless these four plus policy / view / trace layers fail.

## Two Hard Gates

These are now process rules, not soft conventions:

1. **Adoption gate**
   - Any agent claiming “Psyche is enabled” must provide `psyche probe --json`
   - No probe means no verified integration
   - See [docs/AGENT_RUNTIME_PROBE.md](docs/AGENT_RUNTIME_PROBE.md)

2. **Release gate**
   - npm publishing must pass `npm run release:guard`
   - Local publishing requires: clean worktree, `main`, and `HEAD == origin/main`
   - CI publishing requires the release commit to already belong to `origin/main`
   - This prevents npm releases from getting ahead of GitHub `main`

## Before Adding a New Stimulus Type

Treat new `StimulusType` entries as exceptional.

First ask whether the behavior is better modeled as:

- an appraisal-axis combination
- a relation move
- residue or an open loop
- a reply bias
- a writeback signal

Only add a new stimulus if the above fail and the new type clearly predicts behavior.

## Adding a New Stimulus Type

1. Add the type to `StimulusType` union in `src/types.ts`
2. Add the chemical vector to `STIMULUS_VECTORS` in `src/chemistry.ts`
3. Add the type string to the `STIMULUS_TYPES` Set in `src/guards.ts`
4. Add regex matching rules to `RULES` in `src/classify.ts`
5. Add test cases in `tests/chemistry.test.ts`
6. Update the stimulus table in `src/psyche-file.ts` (`generatePsycheMd`)
7. Add the type to the stimulus list in `src/i18n.ts` protocol strings

Each vector has 6 values (DA, HT, CORT, OT, NE, END) ranging from -25 to +25. Think about:
- What neurochemicals would this stimulus activate in a real human?
- Is the response consistent with existing stimulus types?

## Before Adding a New Emotion Pattern

Treat new emotion patterns as exceptional too.

Prefer modeling them as:

- a different read of existing chemistry mixtures
- a relational outcome
- a reply-bias combination

If the idea only adds a prettier label, do not add a new pattern.

## Adding a New Emotion Pattern

1. Add a new `EmotionPattern` entry to `EMOTION_PATTERNS` in `src/chemistry.ts`
2. Include all required fields: `name`, `nameZh`, `condition`, `expressionHint`, `behaviorGuide`
3. The `condition` function takes a `ChemicalState` and returns `boolean`
4. Ensure the condition doesn't overlap too much with existing patterns
5. Add detection tests in `tests/chemistry.test.ts`

## Modifying Innate Drives

Drive definitions live in `src/drives.ts`. Understand three core mechanisms before modifying:

1. **Drive → baseline mapping** (`computeEffectiveBaseline`): How each unsatisfied drive shifts the chemical baseline
2. **Drive → sensitivity mapping** (`computeEffectiveSensitivity`): Which stimuli each hungry drive amplifies
3. **Stimulus → drive mapping** (`STIMULUS_DRIVE_EFFECTS`): Which drives each stimulus feeds/depletes

When adding new drive effects, ensure you follow Maslow suppression logic — lower-level drives take priority.

## Adding MBTI Profile Variants

Profiles live in `src/profiles.ts`. Each has:
- `baseline`: 6 chemical values (0-100), should follow the design principles documented in the file
- `sensitivity`: how strongly stimuli affect this type (0.5-1.5)
- `temperament`: one-line description
- `defaultSelfModel`: values, preferences, boundaries, currentInterests

## PR Guidelines

- All PRs must pass `npm test` (1308+ tests) and `npx tsc --noEmit --strict`
- Include tests for new features
- Keep the zero-dependency policy: no runtime dependencies
- Strings that users will see should go through `src/i18n.ts`
- If your change modifies `PsycheState` shape, handle migration in `loadState()`
