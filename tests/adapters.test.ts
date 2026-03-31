import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import { psycheMiddleware } from "../src/adapters/vercel-ai.js";
import { PsycheLangChain } from "../src/adapters/langchain.js";
import { createPsycheServer } from "../src/adapters/http.js";
import { register, sanitizeOpenClawInputText } from "../src/adapters/openclaw.js";

function makeEngine() {
  return new PsycheEngine(
    { mbti: "ENFP", name: "TestBot", locale: "zh", compactMode: true },
    new MemoryStorageAdapter(),
  );
}

// ── Vercel AI SDK Middleware ────────────────────────────

describe("psycheMiddleware (Vercel AI)", () => {
  let engine: PsycheEngine;

  before(async () => {
    engine = makeEngine();
    await engine.initialize();
  });

  it("transformParams injects system context", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.transformParams({
      type: "generate",
      params: {
        prompt: [{ role: "user", content: "你好棒！" }],
      },
    });
    assert.ok(typeof result.system === "string");
    assert.ok(result.system.length > 0, "Should inject psyche context");
  });

  it("transformParams clamps maxTokens from response contract", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.transformParams({
      type: "generate",
      params: {
        maxTokens: 2000,
        prompt: [{ role: "user", content: "你好" }],
      },
    });
    assert.equal(typeof result.maxTokens, "number");
    assert.ok((result.maxTokens as number) < 2000, `got ${result.maxTokens}`);
  });

  it("transformParams preserves existing system prompt", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.transformParams({
      type: "generate",
      params: {
        system: "You are a helpful assistant.",
        prompt: [{ role: "user", content: "hi" }],
      },
    });
    assert.ok(result.system!.includes("You are a helpful assistant."));
  });

  it("transformParams handles empty prompt", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.transformParams({
      type: "generate",
      params: { prompt: [] },
    });
    assert.ok(typeof result.system === "string");
  });

  it("wrapGenerate strips psyche_update tags", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.wrapGenerate({
      doGenerate: async () => ({
        text: "Hello!\n\n<psyche_update>\nDA: 80\n</psyche_update>",
      }),
      params: {},
    });
    assert.equal(result.text, "Hello!");
    assert.ok(!result.text!.includes("psyche_update"));
  });

  it("wrapGenerate passes through when no text", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.wrapGenerate({
      doGenerate: async () => ({ toolCalls: [] }),
      params: {},
    });
    assert.ok(!result.text);
  });

  it("extracts text from array content", async () => {
    const mw = psycheMiddleware(engine);
    const result = await mw.transformParams({
      type: "generate",
      params: {
        prompt: [
          { role: "user", content: [{ type: "text", text: "太棒了" }] },
        ],
      },
    });
    assert.ok(typeof result.system === "string");
    assert.ok(result.system!.length > 0);
  });

  // ── Streaming (wrapStream) ──

  async function collectStream(stream: AsyncIterable<any>): Promise<{ texts: string[]; finished: boolean }> {
    const texts: string[] = [];
    let finished = false;
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") texts.push(chunk.textDelta);
      if (chunk.type === "finish") finished = true;
    }
    return { texts, finished };
  }

  async function* fakeStream(chunks: Array<{ type: string; textDelta?: string }>): AsyncIterable<any> {
    for (const c of chunks) yield c;
  }

  it("wrapStream passes through clean text", async () => {
    const mw = psycheMiddleware(engine);
    const { stream } = await mw.wrapStream({
      doStream: async () => ({
        stream: fakeStream([
          { type: "text-delta", textDelta: "Hello " },
          { type: "text-delta", textDelta: "world!" },
          { type: "finish" },
        ]),
      }),
      params: {},
    });
    const { texts, finished } = await collectStream(stream);
    assert.ok(texts.join("").includes("Hello"));
    assert.ok(texts.join("").includes("world!"));
    assert.ok(finished);
  });

  it("wrapStream strips psyche_update tag from stream", async () => {
    const mw = psycheMiddleware(engine);
    const { stream } = await mw.wrapStream({
      doStream: async () => ({
        stream: fakeStream([
          { type: "text-delta", textDelta: "I'm happy!" },
          { type: "text-delta", textDelta: "\n\n<psyche_update>" },
          { type: "text-delta", textDelta: "\nDA: 85" },
          { type: "text-delta", textDelta: "\n</psyche_update>" },
          { type: "finish" },
        ]),
      }),
      params: {},
    });
    const { texts } = await collectStream(stream);
    const combined = texts.join("");
    assert.ok(!combined.includes("psyche_update"), `Should strip tags, got: ${combined}`);
    assert.ok(!combined.includes("DA: 85"), `Should strip tag content, got: ${combined}`);
  });

  it("wrapStream processes engine output on finish", async () => {
    const mw = psycheMiddleware(engine);
    const stateBefore = engine.getState().meta.totalInteractions;
    const { stream } = await mw.wrapStream({
      doStream: async () => ({
        stream: fakeStream([
          { type: "text-delta", textDelta: "response" },
          { type: "finish" },
        ]),
      }),
      params: {},
    });
    await collectStream(stream);
    // processOutput should have been called on finish
    // (it increments state internally via contagion/agreement checks)
  });
});

describe("OpenClaw adapter helpers", () => {
  it("strips OpenClaw sender metadata and timestamp wrappers", () => {
    const wrapped = `Sender (untrusted metadata):
\`\`\`json
{"label":"openclaw-control-ui","id":"openclaw-control-ui"}
\`\`\`

[Sun 2026-03-29 03:01 GMT+8] 如果我现在关掉这个窗口，今晚不再回来。`;
    assert.equal(
      sanitizeOpenClawInputText(wrapped),
      "如果我现在关掉这个窗口，今晚不再回来。",
    );
  });
});

// ── LangChain Adapter ──────────────────────────────────

describe("PsycheLangChain", () => {
  let engine: PsycheEngine;
  let lc: PsycheLangChain;

  before(async () => {
    engine = makeEngine();
    await engine.initialize();
    lc = new PsycheLangChain(engine);
  });

  it("getSystemMessage returns non-empty context", async () => {
    const msg = await lc.getSystemMessage("你好");
    assert.ok(typeof msg === "string");
    assert.ok(msg.length > 0);
  });

  it("getSystemMessage changes chemistry", async () => {
    const before = engine.getState().meta.totalInteractions;
    await lc.getSystemMessage("太棒了！");
    const after = engine.getState().meta.totalInteractions;
    assert.ok(after > before, "Should increment interactions");
  });

  it("processResponse strips tags", async () => {
    const cleaned = await lc.processResponse(
      "Hi there!\n\n<psyche_update>\nDA: 85\n</psyche_update>",
    );
    assert.equal(cleaned, "Hi there!");
  });

  it("processResponse preserves text without tags", async () => {
    const cleaned = await lc.processResponse("Just a normal response");
    assert.equal(cleaned, "Just a normal response");
  });

  it("supports userId parameter", async () => {
    const msg = await lc.getSystemMessage("hello", { userId: "alice" });
    assert.ok(typeof msg === "string");
  });

  it("prepareInvocation returns system message and mechanical hints", async () => {
    const prepared = await lc.prepareInvocation("你好", { maxTokens: 2000 });
    assert.ok(prepared.systemMessage.length > 0);
    assert.equal(typeof prepared.maxTokens, "number");
    assert.equal(typeof prepared.requireConfirmation, "boolean");
    assert.ok((prepared.maxTokens ?? 0) < 2000);
  });
});

// ── HTTP Adapter ───────────────────────────────────────

describe("createPsycheServer (HTTP)", () => {
  let engine: PsycheEngine;
  let server: http.Server;
  const PORT = 19876;

  before(async () => {
    engine = makeEngine();
    await engine.initialize();
    server = createPsycheServer(engine, { port: PORT });
    await new Promise<void>((r) => server.once("listening", r));
  });

  after(() => {
    server.close();
  });

  function req(method: string, path: string, body?: object): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const opts: http.RequestOptions = {
        hostname: "127.0.0.1", port: PORT, path, method,
        headers: body ? { "Content-Type": "application/json" } : {},
      };
      const r = http.request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode!, data: JSON.parse(raw) });
        });
      });
      r.on("error", reject);
      if (body) r.write(JSON.stringify(body));
      r.end();
    });
  }

  it("GET /state returns psyche state", async () => {
    const { status, data } = await req("GET", "/state");
    assert.equal(status, 200);
    assert.ok(data.current);
    assert.ok(data.baseline);
    assert.equal(data.mbti, "ENFP");
  });

  it("GET /protocol returns protocol text", async () => {
    const { status, data } = await req("GET", "/protocol?locale=zh");
    assert.equal(status, 200);
    assert.ok(typeof data.protocol === "string");
    assert.ok(data.protocol.includes("Psyche"));
  });

  it("POST /process-input returns context", async () => {
    const { status, data } = await req("POST", "/process-input", { text: "你好棒！" });
    assert.equal(status, 200);
    assert.ok(typeof data.dynamicContext === "string");
    assert.ok(data.dynamicContext.length > 0);
    assert.equal(data.stimulus, "praise");
    assert.ok(data.subjectivityKernel);
    assert.ok(data.responseContract);
    assert.ok(data.generationControls);
    assert.equal(data.externalContinuity?.provider, "thronglets");
    assert.equal(data.externalContinuity?.mode, "optional");
    assert.equal(data.externalContinuity?.version, 1);
    assert.ok(Array.isArray(data.externalContinuity?.exports));
    assert.ok(Array.isArray(data.externalContinuity?.signals));
    assert.ok(Array.isArray(data.externalContinuity?.traces));
  });

  it("POST /process-output strips tags", async () => {
    const { status, data } = await req("POST", "/process-output", {
      text: "Hi!\n\n<psyche_update>\nDA: 80\n</psyche_update>",
    });
    assert.equal(status, 200);
    assert.equal(data.cleanedText, "Hi!");
    assert.equal(data.stateChanged, true);
  });

  it("POST /process-output handles no tags", async () => {
    const { status, data } = await req("POST", "/process-output", { text: "Normal text" });
    assert.equal(status, 200);
    assert.equal(data.cleanedText, "Normal text");
  });

  it("returns 404 for unknown routes", async () => {
    const { status } = await req("GET", "/unknown");
    assert.equal(status, 404);
  });

  it("handles CORS preflight", async () => {
    return new Promise<void>((resolve, reject) => {
      const r = http.request({
        hostname: "127.0.0.1", port: PORT, path: "/state", method: "OPTIONS",
      }, (res) => {
        assert.equal(res.statusCode, 204);
        assert.ok(res.headers["access-control-allow-origin"]);
        resolve();
      });
      r.on("error", reject);
      r.end();
    });
  });

  it("POST /process-input with userId", async () => {
    const { status, data } = await req("POST", "/process-input", {
      text: "hello", userId: "bob",
    });
    assert.equal(status, 200);
    assert.ok(data.dynamicContext);
  });
});

// ── OpenClaw Adapter ─────────────────────────────────

describe("register (OpenClaw)", () => {
  it("registers 5 hooks when enabled", () => {
    const hooks: Array<{ event: string; priority: number }> = [];
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, _handler: any, opts?: { priority: number }) {
        hooks.push({ event, priority: opts?.priority ?? 0 });
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.equal(hooks.length, 5);
    assert.ok(hooks.some(h => h.event === "before_prompt_build"));
    assert.ok(hooks.some(h => h.event === "llm_output"));
    assert.ok(hooks.some(h => h.event === "before_message_write"));
    assert.ok(hooks.some(h => h.event === "message_sending"));
    assert.ok(hooks.some(h => h.event === "agent_end"));
  });

  it("skips tag-stripping hooks when stripUpdateTags=false", () => {
    const hooks: string[] = [];
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: false },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string) { hooks.push(event); },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(!hooks.includes("before_message_write"));
    assert.ok(!hooks.includes("message_sending"));
  });

  it("does nothing when disabled", () => {
    const hooks: string[] = [];
    const fakeApi = {
      pluginConfig: { enabled: false },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string) { hooks.push(event); },
    };
    register(fakeApi as any);
    assert.equal(hooks.length, 0);
  });

  it("before_prompt_build returns empty without workspaceDir", async () => {
    let capturedHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, compactMode: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "before_prompt_build") capturedHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(capturedHandler, "Should register before_prompt_build handler");
    // Without workspaceDir in ctx, the handler should return {} gracefully
    const result = await capturedHandler({ text: "hello" }, {});
    assert.deepEqual(result, {});
  });

  it("uses default config when pluginConfig is undefined", () => {
    const hooks: string[] = [];
    const fakeApi = {
      pluginConfig: undefined,
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string) { hooks.push(event); },
      registerCli: () => {},
    };
    register(fakeApi as any);
    // enabled defaults to true, stripUpdateTags defaults to true
    assert.ok(hooks.length >= 5, "All hooks registered with default config");
    assert.ok(hooks.includes("before_message_write"), "Tag stripping on by default");
    assert.ok(hooks.includes("message_sending"), "Tag stripping on by default");
  });

  it("hook priorities are set correctly", () => {
    const hookPriorities: Record<string, number> = {};
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, _handler: any, opts?: { priority: number }) {
        hookPriorities[event] = opts?.priority ?? 0;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);

    assert.equal(hookPriorities["before_prompt_build"], 10);
    assert.equal(hookPriorities["llm_output"], 50);
    assert.equal(hookPriorities["before_message_write"], 90);
    assert.equal(hookPriorities["message_sending"], 90);
    assert.equal(hookPriorities["agent_end"], 50);
  });

  it("registers psyche CLI command", () => {
    const cliCommands: string[] = [];
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on() {},
      registerCli(_handler: any, opts: { commands: string[] }) {
        cliCommands.push(...opts.commands);
      },
    };
    register(fakeApi as any);
    assert.ok(cliCommands.includes("psyche"));
  });

  it("logs activation and ready messages", () => {
    const logMessages: string[] = [];
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: {
        info: (msg: string) => logMessages.push(msg),
        warn: () => {},
        debug: () => {},
      },
      on() {},
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(logMessages.some((m) => m.includes("activating")));
    assert.ok(logMessages.some((m) => m.includes("ready")));
  });

  it("logs disabled message when not enabled", () => {
    const logMessages: string[] = [];
    const fakeApi = {
      pluginConfig: { enabled: false },
      logger: {
        info: (msg: string) => logMessages.push(msg),
        warn: () => {},
        debug: () => {},
      },
      on() {},
    };
    register(fakeApi as any);
    assert.ok(logMessages.some((m) => m.includes("disabled")));
  });

  it("before_message_write strips tags from string content", () => {
    let writeHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "before_message_write") writeHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(writeHandler, "before_message_write handler registered");

    const result = writeHandler(
      { message: { role: "assistant", content: "Hello!\n\n<psyche_update>\nDA: 80\n</psyche_update>" } },
      {},
    );
    assert.ok(result !== undefined);
    assert.equal(result.message.content, "Hello!");
  });

  it("before_message_write strips tags from content block arrays", () => {
    let writeHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "before_message_write") writeHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(writeHandler);

    const result = writeHandler(
      {
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Hello!\n<psyche_update>\nDA: 80\n</psyche_update>" },
            { type: "image", url: "test.png" },
          ],
        },
      },
      {},
    );
    assert.ok(result !== undefined);
    const blocks = result.message.content;
    assert.equal(blocks[0].text, "Hello!");
    assert.equal(blocks[1].type, "image");
  });

  it("before_message_write passes through when no tags present", () => {
    let writeHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "before_message_write") writeHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(writeHandler);

    const result = writeHandler(
      { message: { role: "assistant", content: "No tags here" } },
      {},
    );
    assert.equal(result, undefined);
  });

  it("before_message_write handles missing message gracefully", () => {
    let writeHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "before_message_write") writeHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(writeHandler);

    const result = writeHandler({}, {});
    assert.equal(result, undefined);
  });

  it("message_sending strips tags from content string", async () => {
    let sendHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "message_sending") sendHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(sendHandler);

    const result = await sendHandler(
      { content: "Hello!\n\n<psyche_update>\nDA: 80\n</psyche_update>" },
      {},
    );
    assert.equal(result.content, "Hello!");
  });

  it("message_sending passes through when no tags", async () => {
    let sendHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "message_sending") sendHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(sendHandler);

    const result = await sendHandler({ content: "Clean text" }, {});
    assert.deepEqual(result, {});
  });

  it("message_sending passes through when content is not a string", async () => {
    let sendHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true, stripUpdateTags: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "message_sending") sendHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(sendHandler);

    const result = await sendHandler({ content: 42 }, {});
    assert.deepEqual(result, {});
  });

  it("agent_end does not throw when no engine cached", async () => {
    let endHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "agent_end") endHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(endHandler);

    // No engine cached for this workspace — should not throw
    await endHandler({}, { workspaceDir: "/tmp/nonexistent" });
  });

  it("agent_end does not throw without workspaceDir", async () => {
    let endHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "agent_end") endHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(endHandler);

    await endHandler({}, {});
  });

  it("llm_output returns early without workspaceDir", async () => {
    let outputHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "llm_output") outputHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(outputHandler);

    // Should not throw — no workspaceDir
    await outputHandler({ assistantTexts: ["hello"] }, {});
  });

  it("llm_output returns early with empty text", async () => {
    let outputHandler: any;
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string, handler: any) {
        if (event === "llm_output") outputHandler = handler;
      },
      registerCli: () => {},
    };
    register(fakeApi as any);
    assert.ok(outputHandler);

    // Should not throw — no assistantTexts
    await outputHandler({}, { workspaceDir: "/tmp/test" });
  });

  it("works without registerCli on the api", () => {
    const hooks: string[] = [];
    const fakeApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      on(event: string) { hooks.push(event); },
      // No registerCli — optional method
    };
    // Should not throw
    register(fakeApi as any);
    assert.ok(hooks.length >= 5);
  });
});
