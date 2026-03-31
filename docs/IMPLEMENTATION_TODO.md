# Implementation TODO — Layered Boundary Work

This file translates the frozen stack blueprint into implementation work.

Canonical references:

- [STACK_ARCHITECTURE.md](STACK_ARCHITECTURE.md)
- [IDENTITY_MODEL.md](IDENTITY_MODEL.md)
- [PROJECT_DIRECTION.md](PROJECT_DIRECTION.md)

## Immediate

### 0. Keep public truth single-sourced

Do not allow:

- npm version ahead of GitHub `main`
- site content that only exists on VPS
- agent adoption claims without runtime proof

The current hard gates are:

- `psyche probe --json`
- `npm run release:guard`

### 1. Keep Psyche local state private by default

Continuously audit integrations to ensure these never become shared primitives:

- chemistry
- raw residue
- raw session state
- raw dyadic fields
- private semantic memory
- per-turn open-loop internals

### 2. Keep the external continuity contract thin

Maintain the current rule:

- optional
- typed
- thresholded
- attributable
- low-frequency

No provider should require widening Psyche core abstractions.

### 3. Make delegate boundaries capability-scoped

Every delegate authorization should be able to answer:

- what can it do?
- until when?
- under what revocation condition?
- under which account/principal?

### 4. Clarify authorization truth flow

Document and implement:

- Chain is authorization truth
- Net is policy/orchestration
- Thronglets caches and executes within that truth

Current Psyche-side status:

- documented in stack and identity docs
- external continuity payload remains free of account / principal / authorization claims

Remaining runtime work belongs outside Psyche:

- delegate capability scope enforcement
- time-bounded authorization checks
- revocation propagation from Chain -> Net -> Thronglets

## Near-Term

### 5. Formalize trace retention windows in Thronglets

The taxonomy is now frozen, but runtime retention still needs explicit rules:

- which `coordination` traces decay locally
- which `continuity` traces can become summary candidates
- which `calibration` traces aggregate before any promotion

### 6. Formalize trace-to-signal degradation rules

Keep the current invariant:

- trace first
- signal only when another delegate's next move should change

Do not add new signal kinds.

### 7. Principal gate checklist

Formal specification now lives in [AI_PRINCIPAL_GATE.md](AI_PRINCIPAL_GATE.md).

Remaining work:

- fill threshold values in the threshold table once operational data exists
- implement gate evaluation as an executable protocol (not just a document)
- wire Psyche self-continuity evidence (session coherence score, trait drift trajectory, corruption detection) into a machine-readable report
- wire Thronglets execution chain evidence (signed trace completeness, cross-session linkage) into a machine-readable report
- define and test revocation propagation end-to-end across all four layers
- run at least one demonstration evaluation (expected result: fail, with specific condition gaps identified)

### 8. Diagnostics by layer

Implemented in `src/diagnostics.ts`. Every `DiagnosticIssue` now carries a `layer` field. Report includes `layeredIssues` and `layerHealth`.

Layers:

- `subjective-continuity` (L1): chemistry, drives, classifier, trait drift, dyadic coherence, energy — fully implemented
- `delegate-continuity` (L2): writeback calibration, Thronglets export boundary — fully implemented
- `policy-orchestration` (L3): structural interface defined, implementation lives in Oasyce Net
- `public-truth` (L4): structural interface defined, implementation lives in Oasyce Chain

`LayerHealthSummary` provides per-layer status (healthy/degraded/failing) plus L1/L2 measurements (chemistryDeviation, traitDriftEstablished, predictionError, writebackLoopActive, calibrationEffects, etc.).

### 9. Add causal audit chain without widening control ABI

Observability now covers:

- cross-turn causal linking
- machine-verifiable evidence pointers for rule ids and scoring sources
- one normalized local mapping from `observability` into external trace candidates

The remaining hardening step is:

- cross-session linking beyond turn-local refs
- provider-specific trace / telemetry promotion rules
- one stable audit export contract from local observability into external systems

Keep this as an audit layer, not a second control surface.

## Continuous Discipline

### 10. Reject new identity objects by default

When a new concept appears, try in order:

1. derived view
2. policy
3. trace
4. one of the four primitives

Only if all fail should a new top-level identity object even be discussed.

### 11. Keep collectives environmental

Prefer:

- spaces
- signals
- trace accumulation
- promotion / inhibition / decay

Avoid introducing anthropomorphic collective entities unless absolutely forced by reality.

### 12. Re-check the frozen blueprint before new features

Before identity-related work lands, confirm it still preserves:

1. Thronglets useful without Oasyce
2. Oasyce additive, not rewriting
3. AI-principal future without model rewrite
4. environmental emergence over message-role imitation
