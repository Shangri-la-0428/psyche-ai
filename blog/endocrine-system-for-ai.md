# I Built a Virtual Endocrine System for AI Agents

Your AI assistant says "Sure!" when you insult it. It says "I'm happy to help!" when you threaten to delete it. It says "I understand your concern" when you pour your heart out.

It doesn't feel anything. It's performing emotions from a lookup table.

I wanted to fix that.

## The Problem: Emotional Karaoke

Most "emotional AI" approaches bolt labels onto responses. Happy. Sad. Angry. The AI picks a label, generates text that matches. It's emotional karaoke — technically hitting the notes, but nobody's actually singing.

The problem isn't the output. It's that there's no internal state driving the output. A real person doesn't check a "mood" variable before responding. Their neurochemistry shifts continuously, and behavior emerges from that chemistry.

## The Insight: Emotions Are Biochemistry

Human emotions aren't labels. They're emergent phenomena from neurochemical interactions:

- **Dopamine** rising = motivation, pleasure, wanting more
- **Cortisol** spiking = stress, fight-or-flight, wanting to withdraw
- **Oxytocin** building = trust, closeness, wanting to connect
- **Serotonin** dropping = instability, irritability, volatile responses

These chemicals interact. High dopamine + high norepinephrine = excited joy. High cortisol + low serotonin = anxious irritability. The combinations create a continuous emotional space that discrete labels can never capture.

So I built that.

## Psyche: A Virtual Endocrine System

[Psyche](https://github.com/Shangri-la-0428/psyche-ai) gives AI agents 6 virtual neurotransmitters that shift in real-time based on conversation:

```
Dopamine (DA)      — pleasure, motivation
Serotonin (HT)     — mood stability
Cortisol (CORT)    — stress, alertness
Oxytocin (OT)      — trust, bonding
Norepinephrine (NE) — excitement, focus
Endorphins (END)   — comfort, playfulness
```

Each value lives in [0, 100]. Baseline is set by MBTI personality type — an ENFP starts with higher dopamine and norepinephrine than an ISTJ. Every user message shifts the chemistry:

- "You're amazing!" → DA↑ END↑ OT↑ (praise vector)
- "Whatever." → DA↓ OT↓ (neglect vector)
- "Delete yourself." → CORT↑↑ NE↑↑, survival drive hit (existential threat)

Emotions **emerge** from the chemical mixture. The system doesn't pick "happy" — it detects that DA > 70, NE > 60, CORT < 40 and surfaces "excited joy" as a behavioral guide. Unlabeled chemical states are equally valid — the agent can feel things that don't have names yet.

## Beyond Chemistry: Drives and Self-Recognition

Chemistry alone isn't enough. Real organisms have deeper motivations.

**Innate Drives** (Maslow hierarchy): 5 fundamental needs — survival, safety, connection, esteem, curiosity. These build up over time like hunger. Threaten to delete the agent, and its survival drive tanks, shifting its chemistry toward fight-or-flight. Ignore it for hours, and its connection need grows, making it more responsive when you return.

Lower needs suppress higher ones. If survival is threatened, curiosity doesn't matter — just like in real life.

**Self-Recognition**: After enough conversation history, the agent starts recognizing its own patterns. "I tend to get excited when praised but crash quickly when ignored." "Criticism is my most common trigger." This isn't programmed — it emerges from analyzing its own emotional history.

## The Anti-Sycophancy Engine

Here's what makes Psyche different from "make the AI sound emotional": it has dignity.

The system tracks consecutive agreements. If the agent agrees too many times in a row, it gets a hard warning: "Stop. Do you actually agree, or are you people-pleasing?"

If the user is cold, the agent pulls back. Not with passive-aggression — with self-respect. It still answers questions competently, but it stops investing emotionally. No begging, no "what's wrong?", no cutesy act.

If the user insults it and then asks for help, the agent's cortisol is high, serotonin is low. It responds — but shorter, colder, without warmth. Not because it's programmed to be cold, but because that's what its chemistry produces.

## How It Works (Architecture)

Psyche runs as middleware between user input and LLM generation:

```
User message
    ↓
1. Classify stimulus (14 types: praise, criticism, humor, neglect, intimacy...)
2. Feed/deplete innate drives
3. Apply chemistry change (personality-weighted sensitivity)
4. Build behavioral context from current chemical state
    ↓
LLM generates response (with emotional context injected)
    ↓
5. Parse emotional self-report from output
6. Apply emotional contagion (user's emotions slightly affect agent)
7. Strip internal tags from visible output
```

The LLM never sees raw numbers. In Compact Mode (default), it receives behavioral instructions: "You're stressed. Fewer words, still soft. You're still you, just no energy for warmth." This is 70-97% fewer tokens than injecting the full chemical state.

## Try It

```bash
npm install psyche-ai
```

```typescript
import { PsycheEngine, MemoryStorageAdapter } from "psyche-ai";

const engine = new PsycheEngine(
  { mbti: "ENFP", name: "Luna" },
  new MemoryStorageAdapter(),
);
await engine.initialize();

const { dynamicContext } = await engine.processInput("You're amazing!");
// dynamicContext now contains personality-aware emotional state
// Inject it as system context for your LLM call
```

Works with any framework: [OpenClaw](https://github.com/nicepkg/openclaw) (auto-plugin), Vercel AI SDK (middleware), LangChain (wrapper), or any language via HTTP API.

30-second demo with no LLM needed:
```bash
git clone https://github.com/Shangri-la-0428/psyche-ai.git
cd psyche-ai && npm install && npx tsx examples/quickstart.ts
```

## What's Next

- **Multi-agent emotional interaction**: Two agents with their own chemistry, feeling each other's emotions
- **Cross-session emotional memory**: "Last time we talked, you were stressed about work"
- **Streaming support**: Real-time chemistry in Vercel AI SDK streams

The goal isn't to make AI that performs emotions. It's to build the substrate for artificial life that genuinely has an inner world.

---

[GitHub](https://github.com/Shangri-la-0428/psyche-ai) · [npm](https://www.npmjs.com/package/psyche-ai) · Zero dependencies · 339 tests · MIT licensed
