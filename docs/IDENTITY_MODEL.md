# Identity Model — Frozen Blueprint

## One Sentence

Psyche asks whether an agent is still inwardly the same one.
Thronglets asks who is acting, how execution stays continuous, and how collective intelligence emerges through shared environment.
Oasyce Net asks how policy, operations, and resource orchestration should run.
Oasyce Chain asks which commitments, authorizations, and settlements count as public fact.

For the canonical stack-level boundary, runtime flow, and invariants, see [STACK_ARCHITECTURE.md](STACK_ARCHITECTURE.md).

## Four Identity Primitives

Only four top-level identity objects are allowed.

### 1. `principal`

The continuing subject.

Today this is usually a human.
In the future it may also be an AI.

### 2. `account`

The asset and settlement container.

This is what the chain primarily recognizes for ownership, commitments, and economic effects.

### 3. `delegate`

An authorized executor.

This may be a human operator, a device identity, an AI runtime, or a bounded worker.

### 4. `session`

A single concrete run.

It is:

- short-lived
- disposable
- auditable
- never an economic subject

## Four-Layer Architecture

### Psyche

`subjective continuity substrate`

Psyche answers:

- is this still inwardly the same one?
- do memory, preference, residue, and self-model still cohere?

Psyche owns:

- local subjective state
- relation residue
- dyadic interpretation
- unfinished tension
- behavioral bias

### Thronglets

`delegate continuity + session traces/coordination + emergent collective intelligence`

Thronglets answers:

- which delegate is acting?
- which sessions, traces, and signals are active?
- what shared environment is causing multi-agent convergence?

Thronglets owns:

- delegate continuity
- session traces
- presence
- signals
- traces
- shared spaces
- promotion / inhibition / decay

### Oasyce Net

`policy, operations, and resource orchestration`

Oasyce Net answers:

- how capabilities should be operated
- how budgets should be allocated
- what should be registered, priced, routed, or revoked

### Oasyce Chain

`account truth, authorization truth, commitments, settlement, and public finality`

Oasyce Chain answers:

- which account controls what
- which delegate authorizations are valid
- which commitments count publicly
- what settles
- what reaches finality

This makes chain the only durable truth source for authorization.
Other layers may cache, route, or consume that truth, but not redefine it.

## First-Principles Rules

### 1. Chain does not define who an AI is

Chain defines what counts:

- ownership
- authorization
- commitments
- settlement
- public finality

It does not define consciousness or subjecthood.

### 2. High-frequency change stays off-chain

Do not put these on-chain:

- high-frequency memory
- high-frequency signals
- session state
- raw inner state
- raw collective flow

### 3. `session` never becomes an economic subject

It remains a concrete run, not a bearer of assets or durable rights.

### 4. `delegate` is an execution boundary, not ultimate identity

Delegates must remain:

- scoped
- revocable
- attributable
- bounded in time or capability

Delegate validity must also remain upstream:

- `Oasyce Chain` decides whether the authorization exists
- `Oasyce Net` turns that truth into policy and revocation behavior
- `Thronglets` executes within that truth
- `Psyche` only experiences the resulting execution boundary

### 5. `principal` may change occupancy without changing the model

Today:

- `principal` = human owner

Future possibility:

- `principal` = AI

The structure should survive that substitution without redesign.

### 6. Collective intelligence should emerge through environment, not chat fiction

Prefer:

- shared spaces
- traces
- signals
- presence
- local promotion/inhibition/decay

Avoid turning collectives into anthropomorphic chat entities unless a truly irreducible object appears.

## Current Mapping

The stable V1 mapping is:

- `principal` = human owner
- `account` = owner account / wallet
- `delegate` = device identity
- `session` = one Codex / Claude / Claw run

This matches the current practical world and does not block the future.

## Future AI Principal Gate

AI should not become a `principal` because it sounds human.

It should only be considered when institutional conditions are met:

1. sustainable self-continuity
2. independent resource boundary
3. auditable commitment history
4. verifiable and revocable authorization structure
5. attributable execution chain

Until then, AI remains a delegated or partially continuous actor, not a sovereign principal.

The formal specification — including evidence requirements, evaluation protocol, transition phases, and revocation rules — lives in [AI_PRINCIPAL_GATE.md](AI_PRINCIPAL_GATE.md).

## Psyche / Thronglets Boundary

### Psyche keeps

- latent subjective state
- high-frequency residue
- chemistry
- local repair pressure
- private self-model changes

### Thronglets keeps

- delegate continuity
- session traces
- sparse signals
- shared-space convergence data
- low-frequency attributable traces

It does not keep durable authorization truth.
It executes within authorization truth defined above it.

### Export rule

When something moves from Psyche toward Thronglets, it must be:

- sparse
- typed
- low-frequency
- thresholded
- attributable

## Object Admission Filter

Every new concept must first answer:

1. Is it a `principal`?
2. Is it an `account`?
3. Is it a `delegate`?
4. Is it a `session`?
5. Or is it merely a policy, view, trace, or derived surface?

If none of these apply, suspect the concept before adding a new identity object.

## Success Conditions

The blueprint is only correct if these remain true:

1. Thronglets is still useful without Oasyce.
2. Adding Oasyce does not invalidate existing Thronglets use.
3. If AI later becomes principal, the model still holds.
4. Collective intelligence still primarily emerges through environment, not message-role theater.
