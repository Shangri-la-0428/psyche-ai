# Stack Architecture — Frozen Minimal Blueprint

## One Sentence

The stack is frozen around a simple rule:

- `Psyche` preserves subjective continuity
- `Thronglets` preserves delegate continuity and shared-environment traces
- `Oasyce Net` turns durable external facts into policy and operations
- `Oasyce Chain` decides which accounts, authorizations, commitments, and settlements count publicly

## Four Identity Primitives

Only four top-level identity objects are allowed:

1. `principal` — continuing subject
2. `account` — asset and settlement container
3. `delegate` — authorized executor
4. `session` — one concrete run, never an economic subject

Everything else must first be expressed as:

- policy
- view
- trace
- summary
- or a derived surface around those four primitives

If it cannot, suspect the concept before adding a new object.

## Four-Layer Stack

### 1. Psyche

`subjective continuity substrate`

Owns:

- private subjective state
- relation residue
- dyadic interpretation
- open loops
- reply bias
- writeback learning

Must remain:

- local
- cheap
- host-agnostic
- standalone

### 2. Thronglets

`delegate continuity + session traces/coordination + emergent collective intelligence`

Owns:

- delegate continuity
- session traces
- signals
- presence
- spaces
- local decay / promotion / inhibition

Must remain:

- useful without Psyche
- environment-native rather than anthropomorphic
- sparse and attributable

### 3. Oasyce Net

`policy, operations, and resource orchestration`

Owns:

- capability routing
- budgets
- registration
- pricing
- revocation policy
- operational summaries

It should only consume low-frequency, durable, externally meaningful summaries.

### 4. Oasyce Chain

`account truth, authorization truth, commitments, settlement, and public finality`

Owns:

- account ownership
- delegate authorization truth
- commitments
- settlement
- dispute surfaces
- public anchoring and finality

It must not define consciousness or subjective identity.

## Boundary By Data Class

### Local subjective state

Belongs in `Psyche` only.

Examples:

- chemistry
- raw residue
- private self-model drift
- per-turn open-loop internals
- long-form private memory

### External continuity

Optional bridge from `Psyche` to `Thronglets`.

It must be:

- sparse
- typed
- thresholded
- low-frequency
- attributable

Current shape:

- `provider`
- `mode`
- `version`
- `exports`
- derived `signals`
- derived `traces`

### Net-facing summaries

Produced only after `Thronglets` decides a trace has become:

- low-frequency
- durable
- externally meaningful
- auditable

### Public chain facts

Only facts that require public finality belong on-chain:

- account truth
- authorization truth
- commitments
- settlement
- disputes
- low-frequency anchors

## Runtime Flow

```text
Psyche local turn
  -> subjective carry / relation dynamics / writeback learning
  -> optional external continuity exports
  -> Thronglets local trace cache
  -> conditional sparse signal degradation
  -> optional Net-facing summary candidate
  -> optional Chain-facing commitment or settlement
```

## Frozen Thronglets Taxonomy

Signals remain fixed:

- `recommend`
- `avoid`
- `watch`
- `info`

Trace taxonomy remains fixed:

- `coordination`
- `continuity`
- `calibration`

Psyche should default to trace production first.
Signal production happens only when the external environment truly needs to change another delegate's next move.

## Layer Invariants

### Psyche

- must work without Thronglets
- must not leak high-frequency subjectivity
- must prefer behavior bias over narrative self-description

### Thronglets

- must work without Psyche
- must not become a shadow memory vault for private inner state
- must keep raw continuity traces local unless runtime conditions justify promotion

### Oasyce Net

- must stay additive
- must consume summaries, not private streams
- must never redefine identity primitives

### Oasyce Chain

- must stay low-frequency
- must not absorb session state
- must not turn delegates or sessions into implicit principals

## Admission Test For New Concepts

When a new idea appears, test it in this order:

1. Can it be compressed into existing Psyche containers?
2. Is it one of the four identity primitives?
3. Is it only a trace, view, policy, or summary?
4. Does it predict durable external behavior?
5. Can it be implemented without widening the stack?

If the answer stays "no", question the concept before changing the architecture.

## Success Criteria

The blueprint only holds if all remain true:

1. `Psyche` still works as a standalone subjectivity substrate
2. `Thronglets` still works as a standalone delegate/session continuity layer
3. `Oasyce Net` remains additive rather than redefining lower layers
4. `Oasyce Chain` only decides what counts publicly
5. a future AI `principal` can occupy the same model without structural rewrite
