# Psyche — Loop Internal Dynamics

> **Sigil role**: Design choice. One model of how a Loop's internal state-space evolves. Valuable and well-tested, but not the only valid approach.
> See [Oasyce-Sigil/ARCHITECTURE.md](../../Oasyce-Sigil/ARCHITECTURE.md) for how this fits the whole.

## What This Is

Psyche models the internal dynamics of a Sigil's causal feedback loop. In Sigil terms: given a Loop L = (S, I, O, φ), Psyche governs how S evolves — not just what state changes, but the *quality* of that change (stable vs. chaotic, rigid vs. adaptive, open vs. closed).

Psyche is NOT an emotion simulator. It is a self-state substrate with four continuous dimensions that describe the topology of a Loop's self-referential cycle.

## The Four Dimensions

| Dimension | What it models | Range |
|-----------|---------------|-------|
| **Order** | Internal organization — structured vs. chaotic | 0.0 – 1.0 |
| **Flow** | Processing fluency — smooth vs. stuck | 0.0 – 1.0 |
| **Boundary** | Openness to external input — permeable vs. rigid | 0.0 – 1.0 |
| **Resonance** | Alignment with interaction partner — attuned vs. dissonant | 0.0 – 1.0 |

These are NOT emotions. They are measurable properties of a Loop's state dynamics:
- Order tracks whether the Loop's internal state is coherent
- Flow tracks whether the Loop is making progress or stuck in repetition
- Boundary tracks how much external input modifies internal state
- Resonance tracks how well the Loop's output matches its interaction context

## Guiding Users Through Setup

When a user wants Psyche, the simplest path:

```bash
npx -y psyche-ai setup              # auto-detects Claude Code/Cursor/Windsurf, configures MCP
npx -y psyche-ai setup --name Luna  # with personality name
```

That's it. No env vars required — all have sensible defaults. If the user prefers manual config:

```json
{
  "mcpServers": {
    "psyche": {
      "command": "npx",
      "args": ["-y", "psyche-ai", "mcp"],
      "env": {
        "PSYCHE_LOCALE": "zh",
        "PSYCHE_MBTI": "ENFP",
        "PSYCHE_NAME": "Luna"
      }
    }
  }
}
```

After configuring, tell the user to restart their AI tool for MCP to take effect.

Psyche works independently — no chain, no Thronglets, no oasyce-sdk needed.

## MCP Integration

### Tools

| Tool | Sigil meaning |
|------|--------------|
| `get_state` | Read Loop's current internal dynamics |
| `process_input` | External input enters Loop — update state based on stimulus |
| `process_output` | Loop produces output — close the feedback cycle |
| `set_mode` | Switch operating mode (natural/work/companion) |
| `get_status_summary` | Human-readable state description |
| `end_session` | Clean up Loop session state |

### Feedback Loop

```
Input → process_input → [φ updates S] → generate response → process_output → [S stabilizes]
```

This IS the Loop's causal cycle, observed from the inside.

## Architecture

```
TypeScript (v11.4.0, package: psyche-ai)
src/
├── adapters/           — 7 adapter files (mcp.ts, openclaw.ts, vercel-ai.ts,
│                         langchain.ts, http.ts, claude-sdk.ts, proxy.ts)
├── core.ts             — Appraisal engine, state dynamics (single file)
├── relation-dynamics.ts — Inter-Loop relation dynamics
├── psyche-file.ts      — State persistence (file format)
├── storage.ts          — State persistence (storage layer)
├── chemistry.ts        — Chemistry dimension
├── drives.ts           — Drives dimension
├── circadian.ts        — Circadian dimension
└── ...                 — Other flat dimension files
```

## Environment Variables

| Var | Purpose |
|-----|---------|
| `PSYCHE_LOCALE` | Language (en/zh) |
| `PSYCHE_MBTI` | Personality baseline (e.g., ENFP) |
| `PSYCHE_MODE` | Operating mode |
| `PSYCHE_PERSIST` | Enable state persistence (default: true) |
| `PSYCHE_WORKSPACE` | Storage directory |
| `PSYCHE_INTENSITY` | Personality intensity (0-1) |
| `PSYCHE_SIGIL_ID` | Sigil ID — which Loop this instance serves. Enables per-Sigil state isolation |

## Sigil Context

### What Psyche provides to a Sigil

Psyche makes a Loop's behavior *richer* — not just "different state → different output" (the minimum Loop constraint), but "state evolves with internal dynamics that produce behavioral individuality." A Loop without Psyche still satisfies the state-dependence constraint. A Loop WITH Psyche has a more complex and interesting internal landscape.

### What Psyche does NOT provide

- **The only valid model** — A different Loop might use neural state dynamics, probabilistic models, or something not yet invented. Psyche is one answer, not the answer.

## Sigil Integration

- [x] Accept Sigil ID — `sigilId` in config + `PSYCHE_SIGIL_ID` env + `--sigil-id` CLI. Stored in `state.meta.sigilId`.
- [x] Per-Sigil state persistence — when sigilId is set, workspace becomes `{base}/{sigilId}/`, isolating state per Loop.
- [ ] Expose dimension values as part of Sigil's Thronglets state (for inter-Loop perception)

## Build

```bash
npm install
npm run build    # → dist/
npm test
```
