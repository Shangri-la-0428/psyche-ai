# Project Direction — Psyche

## First Principles

Psyche is not an emotion-themed UI layer, a companion app, or a taxonomy of feelings.

Its irreducible job is simpler:

- interaction history must leave persistent bias
- that bias must alter later behavior, not just self-description
- this must remain cheap, local, and portable across hosts

In one sentence:

**Psyche is a low-cost subjectivity substrate that lets relationships and experience keep changing an agent's later behavior.**

The cross-project stack this lives inside is now frozen as:

- `Psyche = subjective continuity substrate`
- `Thronglets = delegate continuity + session traces/coordination + emergent collective intelligence`
- `Oasyce Net = policy, operations, and resource orchestration`
- `Oasyce Chain = account truth, authorization truth, commitments, settlement, and public finality`

See [STACK_ARCHITECTURE.md](STACK_ARCHITECTURE.md) for the canonical stack-level view.

## What Psyche Is

- A local subjectivity kernel
- A relation dynamics runtime
- A host-facing behavior control surface
- A persistence layer for low-frequency subjective carry

## What Psyche Is Not

- Not a persona prompt
- Not a sentiment classifier
- Not a generic memory vault
- Not a philosophical consciousness project
- Not a social product by itself

## Frozen Identity Model

The identity model is now frozen around four objects:

1. `principal` — continuing subject
2. `account` — asset and settlement container
3. `delegate` — authorized executor
4. `session` — concrete run, never an economic subject

If a new concept cannot be expressed as one of those, or as a policy / view / trace layered around them, suspect the concept before adding another identity object.

See [IDENTITY_MODEL.md](IDENTITY_MODEL.md) for the canonical identity version.

## Stack Direction

At stack level, the project should keep moving toward:

- cleaner Psyche / Thronglets separation
- thinner optional external continuity contracts
- lower-frequency summary surfaces above Thronglets
- more explicit authorization truth below Net

At stack level, it should move away from:

- mixed identity objects
- private-state leakage into shared layers
- high-frequency or prompt-native integration surfaces
- any feature that forces Thronglets or Chain to depend on Psyche

## Psyche vs Thronglets

Psyche and Thronglets remain separate on first principles.

### Psyche owns private subjectivity

- local inner state
- relation residue
- dyadic interpretation
- unfinished tension
- behavioral bias

### Thronglets owns external continuity

- delegate continuity
- session traces
- signatures and verification
- shared spaces, signals, and traces
- low-frequency attributable convergence data

### The boundary

Psyche data is usually:

- high-frequency
- private
- fuzzy
- reversible
- not meant for sharing

Thronglets data is usually:

- low-frequency
- sparse
- signed or attributable
- shareable across devices or agents
- execution- or environment-facing

### Integration rule

When the same phenomenon touches both systems, split it:

- Psyche keeps the latent local state
- Thronglets keeps the sparse external trace, signal, or commitment surface

Do not create a third mixed object unless both existing layers fail.

The detailed boundary by data class now lives in [STACK_ARCHITECTURE.md](STACK_ARCHITECTURE.md).

## The Five Primitive Containers

Every new concept should first try to fit into one of these containers.

### 1. Relation Move

What action happened in the relationship?

Examples:

- bid
- breach
- repair
- test
- withdrawal
- claim

### 2. Dyadic Field

What has the relationship become right now?

Examples:

- distance
- safety
- expectation gap
- boundary pressure
- unfinished tension

### 3. Open Loop / Residue

What remains unresolved and continues to leak forward?

Examples:

- unclosed repair
- residue after breach
- silent carry through work turns
- backslide pressure

### 4. Reply Bias / Control ABI

How should the next response be shaped?

Examples:

- reply profile
- disclosure
- resistance
- confirmation requirement
- token budget

### 5. Writeback / Learning

How does the agent's own behavior update the system?

Examples:

- writeback signals
- calibration outcome
- per-user repair credibility
- per-user breach sensitivity

## Admission Test For New Concepts

When a new psychological or product concept appears, apply this test in order.

### Step 1: Compress it

Try to express it as a composition of the five primitive containers.

If "jealousy" is really:

- attachment pull
- expectation gap
- boundary pressure

then it is not a new root object.

### Step 2: Demand behavioral consequences

If the concept cannot predict a later behavioral shift, it is probably naming style, not substance.

### Step 3: Demand low-cost implementation

If the concept only works by adding prompt prose, extra reflection turns, or more model calls, it should be treated as suspect.

### Step 4: Prefer reparameterization over new types

First ask:

- can this be a new coefficient?
- can this be a new threshold?
- can this be another field inside an existing container?

Only add a new top-level object if all three answers are no.

### Step 5: Suspect the concept first

If the concept does not fit the abstraction, first question the concept, not the abstraction.

This project should grow by improving explanatory compression, not by collecting more nouns.

## Strategic Direction

Psyche should move toward:

- a stable host-agnostic subjectivity ABI
- stronger relation-specific learning
- stronger session continuity
- thinner prompt dependence
- clearer Psyche / Thronglets separation

Psyche should move away from:

- more emotional labels
- more narrative self-explanation
- more one-off protocol features
- more top-level entity types

For concrete execution work, see [IMPLEMENTATION_TODO.md](IMPLEMENTATION_TODO.md).

## External Risks

### 1. Frontier models will absorb shallow emotional UX

Anything that is mostly prompt styling or self-description will be commoditized by base models.

### 2. Policy pressure around anthropomorphism will increase

Companion framing and dependence dynamics may become more restricted.

### 3. Agent runtimes will standardize around explicit protocol surfaces

Structured state and tool-native metadata will matter more than prose.

### 4. Complexity can kill adoption

If the system keeps adding primitives, hosts will stop understanding how to integrate it.

### 5. Cross-agent / cross-device continuity will matter more

This is where Thronglets becomes strategically important, but only if the boundary stays clean.

### 6. Identity models can sprawl if primitives are not enforced

If principal/account/delegate/session stops being the hard limit, the system will drift back into a confusing object zoo.

## Current Roadmap

### Now

- strengthen host-native writeback paths so metadata beats prompt protocol
- ~~make session continuity visible in first-turn behavior, not only stored memory~~ — done: compact prompt renderer is now continuity-aware (warm/guarded/tense orientation)
- ~~continue shifting weight from explanation text to stable ABI~~ — done: prompt audit + compression (established-relationship boilerplate decay, first-meet dedup, agency→boundary separation)
- ~~formalize the frozen identity model in code-facing docs~~ — done: IDENTITY_MODEL.md + STACK_ARCHITECTURE.md + TypeScript types aligned to 4 primitives
- ~~define the sparse Psyche → Thronglets export set~~ — done: thronglets-export.ts + external-continuity.ts

### Next

- align relation learning around a smaller set of trusted signals
- make delegate authorization explicitly capability-scoped, revocable, and time-bounded
- define session trace classes that belong in Thronglets
- expand evaluation around continuity, calibration, and partner specificity
- ~~turn the AI-principal gate into an explicit institutional checklist~~ — done: [AI_PRINCIPAL_GATE.md](AI_PRINCIPAL_GATE.md)

### Later

- publish a formal subjectivity protocol spec
- treat Psyche as a reusable substrate across hosts, not only a package
- define a clean intersubjectivity bridge with Thronglets
- keep collective intelligence environmental rather than introducing collective identity objects

## Immediate Implementation TODO

### Documentation

- keep README, README_EN, ARCHITECTURE, llms.txt, and site discovery pages aligned to this document
- treat this file as the canonical strategy reference

### Product

- ~~reduce remaining prompt-only explanations in hot paths~~ — done: compact renderer compressed (established relationships 60% fewer tokens)
- push more host integrations toward structured writeback
- ~~make first-turn continuity more legible in diagnostics and behavior~~ — done: session bridge wired to prompt, layered diagnostics implemented

### Evaluation

- add tests for concept compression: new features should land inside existing containers unless explicitly justified
- add evaluation tracks for session continuity and writeback calibration

### Coordination With Thronglets

- ~~define the sparse export set from Psyche to Thronglets~~ — done: thronglets-export.ts
- keep chemistry and high-frequency residue local
- export only low-frequency, thresholded, typed events
- keep delegate validity rooted in chain truth, not local guesswork
- keep `session` non-economic everywhere
