# 贡献指南 — Artificial Psyche

[English version below](#contributing--artificial-psyche)

## 环境搭建

```bash
git clone https://github.com/Shangri-la-0428/oasyce_psyche.git
cd psyche-ai
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

- 所有 PR 必须通过 `npm test`（339+ 测试）和 `npx tsc --noEmit --strict`
- 新功能必须包含测试
- 保持零依赖策略：不引入运行时依赖
- 用户可见的字符串应通过 `src/i18n.ts`
- 如果修改了 `PsycheState` 的结构，需要在 `loadState()` 中处理迁移

---

# Contributing — Artificial Psyche

## Setup

```bash
git clone https://github.com/Shangri-la-0428/oasyce_psyche.git
cd psyche-ai
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

- All PRs must pass `npm test` (339+ tests) and `npx tsc --noEmit --strict`
- Include tests for new features
- Keep the zero-dependency policy: no runtime dependencies
- Strings that users will see should go through `src/i18n.ts`
- If your change modifies `PsycheState` shape, handle migration in `loadState()`
