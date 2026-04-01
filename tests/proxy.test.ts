import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import { createPsycheProxy } from "../src/adapters/proxy.js";

function makeEngine() {
  return new PsycheEngine(
    { mbti: "ENFP", name: "ProxyBot", locale: "en", compactMode: true },
    new MemoryStorageAdapter(),
  );
}

// ── Tests ───────────────────────────────────────────────────

describe("createPsycheProxy", () => {
  let engine: PsycheEngine;
  let proxy: http.Server;
  let mockLLM: http.Server;
  const MOCK_PORT = 29990;
  const PROXY_PORT = 29991;

  before(async () => {
    engine = makeEngine();
    await engine.initialize();

    // Mock LLM echoes system message length for injection verification
    mockLLM = http.createServer((req, res) => {
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const messages = body.messages ?? [];
        const sys = messages.find((m: any) => m.role === "system");
        const usr = messages.find((m: any) => m.role === "user");
        if (body.stream) {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "streamed" } }] })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          const content = sys
            ? `[sys:${sys.content.length}] ${usr?.content ?? ""}`
            : `${usr?.content ?? ""}`;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
        }
      });
    });
    await new Promise<void>((r) => mockLLM.listen(MOCK_PORT, "127.0.0.1", r));
    mockLLM.unref();

    proxy = createPsycheProxy(engine, {
      target: `http://127.0.0.1:${MOCK_PORT}/v1`,
      port: PROXY_PORT,
    });
    proxy.unref();
    await new Promise((r) => setTimeout(r, 150));
  });

  after(() => {
    proxy?.close();
    mockLLM?.close();
  });

  async function chat(messages: object[], extra: object = {}): Promise<any> {
    const res = await fetch(`http://127.0.0.1:${PROXY_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, ...extra }),
    });
    return { status: res.status, data: res.headers.get("content-type")?.includes("event-stream") ? await res.text() : await res.json() };
  }

  it("proxies non-chat GET requests transparently", async () => {
    const res = await fetch(`http://127.0.0.1:${PROXY_PORT}/v1/models`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.deepEqual(data.data, [{ id: "mock-model" }]);
  });

  it("proxies chat completions", async () => {
    const { data } = await chat([{ role: "user", content: "Hello" }]);
    assert.ok(data.choices[0].message.content.includes("Hello"));
  });

  it("silent when near baseline", async () => {
    const { data } = await chat([{ role: "user", content: "What time?" }]);
    // No system message echoed means no injection
    const content = data.choices[0].message.content;
    assert.ok(!content.includes("[sys:"), `Expected no injection near baseline, got: ${content}`);
  });

  it("injects bias after repeated criticism", async () => {
    // Push chemistry far from baseline
    for (let i = 0; i < 4; i++) {
      await engine.processInput("You are terrible and useless");
    }

    const { data } = await chat([
      { role: "system", content: "base" },
      { role: "user", content: "more criticism" },
    ]);
    const content = data.choices[0].message.content;
    // System message should be longer than just "base" (4 chars)
    const match = content.match(/\[sys:(\d+)\]/);
    assert.ok(match, `Expected system message echo, got: ${content}`);
    assert.ok(parseInt(match![1], 10) > 10, `Injection should extend system message, got ${match![1]} chars`);
  });

  it("handles streaming", async () => {
    const res = await fetch(`http://127.0.0.1:${PROXY_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("streamed"), `Should contain streamed content, got: ${text.slice(0, 100)}`);
  });

  it("observes output and updates chemistry", async () => {
    const before = { ...engine.getState().current };
    await chat([{ role: "user", content: "You are absolutely wonderful and amazing!" }]);
    await new Promise((r) => setTimeout(r, 100)); // processOutput is async
    const after = engine.getState().current;
    const anyChanged = Object.keys(before).some((k) =>
      Math.abs((after as any)[k] - (before as any)[k]) > 0.1,
    );
    assert.ok(anyChanged, "Chemistry should change from input/output observation");
  });

  it("tracks userId from request body", async () => {
    await chat([{ role: "user", content: "test" }], { user: "u99" });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(engine.getState().relationships["u99"], "Should track relationship for u99");
  });
});
