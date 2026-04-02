// Minimal HTTP server for AgentRuntime integration.
// Usage: node serve.mjs [port]

import { PsycheEngine } from "./dist/core.js";
import { MemoryStorageAdapter } from "./dist/storage.js";
import { createPsycheServer } from "./dist/adapters/http.js";

const port = parseInt(process.argv[2] || "3210", 10);

const engine = new PsycheEngine(
  { mbti: "ENFP", name: "Agent-Psyche" },
  new MemoryStorageAdapter(),
);
await engine.initialize();

const server = createPsycheServer(engine, { port });
console.log(`Psyche HTTP server on http://127.0.0.1:${port}`);
