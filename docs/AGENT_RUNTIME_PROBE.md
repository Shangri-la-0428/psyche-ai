# Agent Runtime Probe

This file exists to prevent a specific failure mode:

- an agent understands Psyche conceptually
- but cannot prove it has a real runtime entrypoint in the current session
- so it starts simulating the flow instead of actually calling the SDK

The fix is not more explanation. The fix is a single executable probe.

## Canonical command

```bash
psyche probe --json
```

If you are inside the source repository and want to force the local build:

```bash
node dist/cli.js probe --json
```

## What counts as success

The probe must report all of these:

1. `ok = true`
2. a real `version`
3. a real `loadPath`
4. `processInputCalled = true`
5. `processOutputCalled = true`
6. `canonicalHostSurface = true`

If any of those are missing, the agent has not proven real runtime access.

## Required fields

The JSON result is the contract:

- `packageName`
- `version`
- `entry`
- `loadPath`
- `modulePath`
- `cliPath`
- `processInputCalled`
- `processOutputCalled`
- `canonicalHostSurface`
- `externalContinuityAvailable`
- `stimulus`
- `cleanedText`
- `stateChanged`
- `error` when the probe fails

## How another agent should use this

Before claiming “Psyche is enabled” in a local session:

1. run `psyche probe --json`
2. report the raw result
3. only then say whether Psyche is actually attached

Do not replace this with:

- conceptual reasoning
- “I can simulate the flow”
- “the repository exists on disk”
- “the package should be importable”

Those are not runtime proof.

## Acceptance rule

If the probe succeeds, the agent may say:

- the Psyche runtime is genuinely callable in this environment
- the loaded version is `X`
- the canonical host surface is present

If the probe fails, the agent must instead report:

- which runtime layer is missing
- whether the package is absent, not built, or not importable
- what exact path or command failed

## First-principles boundary

This probe is intentionally small:

- it proves a real callable runtime exists
- it proves `processInput()` and `processOutput()` are actually invoked
- it proves the canonical surface is `replyEnvelope`

It does **not** attempt to prove:

- host integration hooks are wired
- OpenClaw has reloaded the plugin
- Thronglets is installed
- a specific agent has already adopted Psyche in its own lifecycle

Those are separate integration checks.
