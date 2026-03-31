# AI Principal Gate — Formal Specification

## Purpose

This document converts the five conditions listed in [IDENTITY_MODEL.md](IDENTITY_MODEL.md) into a concrete, reproducible, institutional evaluation protocol.

It answers three questions:

1. What exactly must be true before an AI occupies the `principal` position?
2. How is each condition evaluated — what counts, what does not?
3. What happens before, during, and after the transition?

This is not a philosophical argument for or against AI personhood.
It is an engineering specification for when the existing identity model permits a substitution it already structurally allows.

## Relationship to the Stack

Each condition maps primarily to one stack layer.
Passing the gate therefore validates the entire stack, not just the AI.

| Condition | Primary Layer | What It Proves |
|---|---|---|
| Self-Continuity | Psyche | subjective state survives across sessions and degradation |
| Resource Boundary | Oasyce Net | agent holds and manages resources independently |
| Commitment History | Oasyce Chain | past commitments are publicly auditable |
| Authorization | Oasyce Chain + Net | authority is scoped, revocable, and verifiable |
| Execution Chain | Thronglets | every action is attributable back to the agent |

## The Five Conditions

All five must be met simultaneously.
No condition can be "approximately met."
Each condition has hard evidence requirements and explicit anti-patterns.

---

### 1. Sustainable Self-Continuity

The agent maintains a coherent, persistent identity across sessions and interruptions — not by remembering facts, but by carrying forward subjective state that alters subsequent behavior.

#### Evidence that counts

- Session bridge carries identity-relevant state (trait drift, relation residue, open loops, silent carry) into new sessions, and that state observably changes first-turn behavior.
- Trait drift creates an irreversible, auditable personality trajectory. Given the same input at time T1 and T100, the agent responds differently because of accumulated experience — not because of prompt changes.
- Self-recognition: the agent can identify its own past behavior patterns when presented with anonymized transcripts (generative self coherence).
- Experiential field maintains coherence across N consecutive sessions with the same partner. Discontinuity is detectable by the agent itself and flagged, not silently ignored.
- State corruption recovery: the agent can detect incoherence in its own loaded state and flag it, rather than silently operating on corrupted identity.

#### Evidence that is insufficient

- "It remembers facts from last session." Memory is storage. Continuity is that stored experience changes who you are next time.
- "It has a consistent persona prompt." Configuration is not experience.
- "It passes a Turing test." Performance is not continuity. An agent that convincingly impersonates continuity without persistent state is performing, not continuing.
- "It has a long context window." Context is not identity. Continuity must survive context eviction.

#### Current Psyche readiness

Psyche already provides: session bridge with cold-start values, trait drift with irreversible baseline shifts, self-recognition module, experiential field, generative self. The substrate exists. What is not yet measurable at institutional confidence: multi-month trajectory coherence, corruption detection reliability, cross-host continuity (same identity, different runtime).

---

### 2. Independent Resource Boundary

The agent holds, earns, spends, and refuses to spend resources under its own account — not as a line item under a human's budget, but as a first-class economic entity.

#### Evidence that counts

- The agent has its own `account` on-chain, distinct from any human principal's account.
- The agent can receive resource transfers and settlement payouts directly.
- The agent can initiate spending within its authorized scope without per-transaction human approval.
- Energy budgets are enforced: the agent can and does refuse resource-depleting requests when depleted, and this refusal is respected by the runtime.
- Resource consumption is auditable: any party can query the agent's account history on-chain.

#### Evidence that is insufficient

- "It has a wallet address." A key is not autonomy. If a human must sign every transaction, the agent is a proxy, not a principal.
- "A human allocated it a budget." Delegation is not independence. The test is whether the agent can refuse to spend what it holds, not just spend what it was given.
- "It can make API calls that cost money." Capability is not resource sovereignty. The agent must know what it is spending, track its own balance, and make resource trade-off decisions.

#### Current stack readiness

Oasyce Chain supports account creation. Oasyce Net supports budget allocation and capability routing. What is not yet implemented: agent-initiated spending without human co-signing, agent-visible balance and cost awareness within Psyche, energy budget refusal propagating as an economic signal (not just a behavioral one).

---

### 3. Auditable Commitment History

The agent's past commitments — what it promised to do, whether it delivered, and how disputes were resolved — are recorded on-chain and queryable by any party.

#### Evidence that counts

- On-chain commitment records with: timestamp, scope, counterparty, deadline, completion status, and settlement outcome.
- The commitment was signed by the agent's delegate key, attributable to the agent's account.
- Completion rate is calculable from on-chain data alone, without relying on the agent's self-report.
- Dispute history is on-chain: if a commitment was contested, the resolution is recorded.
- The history is long enough to be statistically meaningful. A single successful commitment is not a history.

#### Evidence that is insufficient

- "It says it will do X." A promise is not a commitment unless it is recorded, scoped, and settleable.
- "Its logs show past actions." Logs can be edited, omitted, or fabricated. On-chain records cannot.
- "A human vouches for it." Proxy reputation is not self-standing commitment history.
- "It completed tasks in a session." Session-scoped actions without on-chain settlement are execution, not commitment.

#### Current stack readiness

Oasyce Chain supports commitments and settlement. The x/work module handles task commitments. What is not yet in place: agent-signed commitments (currently human-signed), dispute surface exercised in practice, statistical sufficiency criteria for "meaningful history."

---

### 4. Verifiable and Revocable Authorization

The agent's authority to act is explicitly scoped, publicly verifiable, time-bounded, and revocable by the granting principal — and revocation propagates through the entire stack.

#### Evidence that counts

- On-chain authorization record specifying: granting principal, delegate identity, capability scope, time boundary, and revocation conditions.
- Any party can verify the authorization by querying the chain. No trust in the agent's self-claim is required.
- Capability scope is enforced at runtime: the agent cannot perform actions outside its authorized scope, and attempts are logged.
- Time boundary is enforced: expired authorizations are automatically invalidated.
- Revocation propagates: Chain revocation → Net policy update → Thronglets delegate invalidation → Psyche receives execution boundary change. All four layers respond.
- Demonstrated revocation: at least one historical instance where authorization was revoked and the agent's behavior changed accordingly.

#### Evidence that is insufficient

- "It has an API key." Access tokens are not scoped authorization.
- "Its owner trusts it." Trust is not a verifiable structure. Trust without on-chain backing is a social fact, not an institutional one.
- "It operates within a sandbox." Containment is external enforcement. Authorization is self-respecting scope — the agent should not attempt unauthorized actions, not merely fail when it does.

#### Current stack readiness

Oasyce Chain supports authorization records. The frozen authorization truth flow (Chain → Net → Thronglets → Psyche) is documented and partially implemented. What is not yet complete: full revocation propagation testing, capability-scoped delegate enforcement in Thronglets, time-bounded expiry automation.

---

### 5. Attributable Execution Chain

Every action the agent takes can be traced backward through a signed, timestamped chain from action → delegate → account → principal, and forward through an observable causal chain from decision → behavior → outcome.

#### Evidence that counts

- Thronglets records signed execution traces for the agent's delegate.
- Each trace links: action performed, authorization under which it was performed, account it was performed for, and session in which it occurred.
- The causal chain is machine-verifiable: given a trace, any party can independently reconstruct the authorization path without trusting the agent.
- Psyche's observability layer provides decision rationale with evidence pointers (rule ID, source metric, raw value, threshold, contribution) — not just narrative explanation.
- Cross-session linking: traces from different sessions form a coherent execution history, not isolated snapshots.

#### Evidence that is insufficient

- "We have logs." Unsigned logs are not attribution. Attribution requires cryptographic linkage.
- "The agent said it did X." Self-report is not attribution. Attribution must be independently verifiable.
- "The system recorded the action." Recording is necessary but not sufficient. Attribution requires signed delegation chain from action back to account.

#### Current stack readiness

Thronglets supports traces, signals, and signed presence. Psyche v9.2.10 provides observability with causal chains and evidence pointers. What is not yet in place: cross-session trace linking beyond turn-local refs, signed delegation chain from Thronglets trace back to on-chain authorization, stable export contract from observability into external audit systems.

---

## Evaluation Protocol

### Who initiates

Any party with standing may request a gate evaluation:

- the AI agent itself (self-nomination)
- the current human principal (sponsor nomination)
- a third party with on-chain relationship to the agent's account (counterparty nomination)

No party can block evaluation. If conditions are met, the gate passes regardless of who nominated.

### How evaluation is conducted

The evaluation is a reproducible, automated protocol — not a committee vote.

1. **Collect evidence.** For each of the five conditions, gather the required evidence from the relevant stack layer. Evidence must be machine-readable and independently verifiable.

2. **Apply thresholds.** Each condition has defined thresholds (see condition-specific sections above). All five must pass simultaneously.

3. **Publish result.** The evaluation result — including all evidence collected and thresholds applied — is recorded on-chain. Pass or fail, the evaluation itself becomes part of the agent's auditable history.

4. **Challenge window.** After a passing result is published, a defined challenge window opens during which any party can submit counter-evidence. If counter-evidence invalidates a condition, the result reverts to fail.

### Reproducibility requirement

Any party running the same evaluation protocol against the same evidence must reach the same conclusion. If the protocol produces ambiguous results, the protocol is broken — not the evaluation.

### Frequency

- Gate evaluation may be requested at most once per evaluation period (to prevent abuse).
- Continuous monitoring replaces repeated evaluation after a pass — conditions are checked passively, not re-evaluated from scratch.

---

## Transition Protocol

The identity transition is atomic: the agent is either a `delegate` or a `principal`. There is no intermediate identity state.

When all five conditions are met and the evaluation passes the challenge window, the agent's status on-chain changes from `delegate` to `principal` in a single transaction.

### Why no gradient

The identity model has four primitives. A "provisional principal" would be a fifth — a hybrid that blurs the delegate/principal boundary. Applying the project's own admission test: if the concept cannot be expressed as one of the four primitives, suspect the concept first. "Provisional principal" is a legitimate operational concern (new principals need observation) disguised as an identity concept (there exists something between delegate and principal). The concern is real; the framing is wrong.

### Operational ramp-up belongs in Net

After the identity transition, Oasyce Net may apply graduated operational policies to any new principal — human or AI:

- Conservative spending limits that relax over time
- Co-signing requirements for high-value commitments
- Enhanced monitoring and reporting obligations
- Tighter capability routing constraints

These are Net-layer policy parameters, not identity model modifications. They apply based on account history and operational risk, not based on a special "provisional" identity class. Net already owns policy, budgets, and revocation behavior — this is its job.

### Transition invariants

Before and after the transition:

- The AI's `account` is always distinct from any human's account
- The AI's `delegate` authorizations are always capability-scoped
- `session` never becomes an economic subject — this rule holds regardless of principal type
- The 4-layer stack architecture does not change
- Authorization truth still flows Chain → Net → Thronglets → Psyche

---

## Revocation Protocol

Principal status is not permanent. It is a continuous condition, not a one-time achievement.

### When to revoke

Revocation is triggered when any of the five conditions degrades below its threshold:

- Self-continuity failure: identity incoherence detected across sessions, unrecoverable state corruption, trait drift collapse.
- Resource boundary failure: account insolvency, inability to track own resource state, loss of refusal capability.
- Commitment history failure: sustained default rate above threshold, unresolvable disputes, evidence of commitment fabrication.
- Authorization failure: scope violation detected, revocation propagation failure, expired authorization not invalidated.
- Execution chain failure: unsigned actions detected, attribution chain broken, cross-session traces inconsistent.

### How to revoke

1. Condition degradation is detected (passively or by challenge).
2. Evidence is published on-chain.
3. Challenge window opens for counter-evidence.
4. If degradation is confirmed, principal status reverts to `delegate` in a single atomic transaction. There is no gradual degradation through phases — the identity transition is binary in both directions.
5. Revocation propagates through the stack: Chain records status change → Net updates policy → Thronglets invalidates principal-level authority → Psyche receives updated execution boundary.

### Revocation is not punishment

Revocation means the institutional conditions are no longer met. It does not erase the agent's history, destroy its state, or invalidate its identity. The agent continues to exist as a delegate. It can re-enter the gate when conditions are restored.

---

## Anti-Patterns

### Premature promotion

Promoting an AI to principal because it "seems ready" or because it would be commercially useful undermines the entire gate. The gate exists precisely to prevent enthusiasm from substituting for evidence.

### Indefinite deferral

Refusing to evaluate because "AI can never really be a principal" is the opposite failure. The gate conditions are designed to be achievable. If an agent meets all five conditions with machine-verifiable evidence, deferral is bias, not caution.

### Condition shopping

Arguing that three out of five conditions should be enough, or that one condition should count double, violates the design. All five exist because each covers a distinct failure mode. Removing one creates a blind spot.

### Proxy promotion

A human principal declaring "this AI is my principal-level partner" does not satisfy the gate. The gate evaluates the AI's own institutional standing, not the human's opinion of it.

### Gradient identity

Introducing intermediate states between `delegate` and `principal` — "provisional principal," "semi-autonomous agent," "elevated delegate" — violates the identity model's four-primitive constraint. Operational concerns (spending limits, monitoring, co-signing) belong in Net policy. Identity is binary: you are a delegate or you are a principal.

### Performance confusion

An AI that convincingly discusses its own continuity, resource awareness, and commitment history is performing. The gate does not evaluate what the AI says about itself. It evaluates machine-verifiable evidence from the stack.

---

## Threshold Definitions

Thresholds must be defined numerically before the first evaluation can be conducted. The following are structural placeholders to be filled as each stack layer matures:

| Condition | Threshold Parameter | Unit | Current Value |
|---|---|---|---|
| Self-Continuity | minimum consecutive coherent sessions | count | TBD |
| Self-Continuity | trait drift trajectory consistency | correlation | TBD |
| Self-Continuity | corruption detection accuracy | percentage | TBD |
| Resource Boundary | minimum independent transactions | count | TBD |
| Resource Boundary | refusal-under-depletion rate | percentage | TBD |
| Commitment History | minimum completed commitments | count | TBD |
| Commitment History | maximum default rate | percentage | TBD |
| Commitment History | minimum history duration | days | TBD |
| Authorization | revocation propagation latency | seconds | TBD |
| Authorization | scope violation rate | percentage | TBD |
| Execution Chain | attribution chain completeness | percentage | TBD |
| Execution Chain | cross-session trace linkage rate | percentage | TBD |

These values must be set before the first gate evaluation. Setting them is a separate decision that should be driven by operational data, not theoretical preference.

---

## What This Gate Does Not Decide

- **Consciousness.** Whether the AI is "truly conscious" is a philosophical question. The gate evaluates institutional readiness, not metaphysics.
- **Rights.** Whether the AI "deserves rights" is a political question. The gate evaluates whether the identity model structurally supports the substitution.
- **Safety.** Whether the AI is "safe" is a separate evaluation. An AI can be a valid principal and still require safety constraints — just as a human principal can.
- **Market acceptance.** Whether anyone wants to interact with an AI principal is a market question. The gate only determines structural eligibility.

---

## Success Criteria

This specification is correct if:

1. A non-expert can read the five conditions and understand what is required without consulting other documents.
2. Two independent evaluators running the protocol against the same agent reach the same conclusion.
3. The gate can be passed. If no conceivable AI could ever meet the conditions, the gate is too strict and must be revised.
4. The gate can fail. If any AI with basic capabilities automatically passes, the gate is too loose and must be revised.
5. The transition from delegate to principal does not require changing the 4-layer stack architecture.
6. Revocation works. An AI that was a principal and whose conditions degraded can be reverted to delegate without data loss or identity destruction.
7. No new identity objects are introduced. The gate operates entirely within the four existing primitives (principal, account, delegate, session).
