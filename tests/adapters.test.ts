import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PsycheEngine } from "../src/core.js";
import { MemoryStorageAdapter } from "../src/storage.js";
import { psycheMiddleware } from "../src/adapters/vercel-ai.js";
import { PsycheLangChain } from "../src/adapters/langchain.js";
import { createPsycheServer } from "../src/adapters/http.js";
import { extractOpenClawInputText, register, sanitizeOpenClawInputText } from "../src/adapters/openclaw.js";
import { PsycheClaudeSDK, stripPsycheTags } from "../src/adapters/claude-sdk.js";

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
    assert.ok(!combined.includes("flow: 85"), `Should strip tag content, got: ${combined}`);
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

  it("prefers the latest user message over the flattened prompt", () => {
    const event = {
      prompt: "system and tool wrappers that should not be classified first",
      messages: [
        { role: "assistant", content: "earlier reply" },
        {
          role: "user",
          content: [
            { type: "text", text: "你刚才没有真正接住我，但我还想继续说。" },
          ],
        },
      ],
    };

    assert.equal(
      extractOpenClawInputText(event),
      "你刚才没有真正接住我，但我还想继续说。",
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
    // v10: mbti not stored on new states
    assert.ok(data.baseline, "baseline should be present");
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
    assert.ok("appraisal" in data);
    assert.equal(data.legacyStimulus, "praise");
    assert.equal(data.stimulus, "praise");
    assert.ok(data.replyEnvelope);
    assert.ok(data.subjectivityKernel);
    assert.ok(data.responseContract);
    assert.ok(data.generationControls);
    assert.equal("policyModifiers" in data.replyEnvelope, false);
    assert.deepEqual(data.replyEnvelope.subjectivityKernel, data.subjectivityKernel);
    assert.deepEqual(data.replyEnvelope.responseContract, data.responseContract);
    assert.deepEqual(data.replyEnvelope.generationControls, data.generationControls);
    assert.equal(data.externalContinuity?.provider, "thronglets");
    assert.equal(data.externalContinuity?.mode, "optional");
    assert.equal(data.externalContinuity?.version, 1);
    assert.ok(Array.isArray(data.externalContinuity?.exports));
    assert.ok(Array.isArray(data.externalContinuity?.signals));
    assert.ok(Array.isArray(data.externalContinuity?.traces));
    assert.equal(data.observability?.outputAttribution?.canonicalSurface, "reply-envelope");
    assert.ok(Array.isArray(data.observability?.stateLayers));
    assert.ok(data.observability?.stateReconciliation);
    assert.ok(Array.isArray(data.observability?.decisionRationale?.candidates));
    assert.ok(data.observability?.causalChain);
    assert.ok(Array.isArray(data.observability?.traceMapping?.localTraceRefs));
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

// ── Claude Agent SDK Adapter ─────────────────────────────

describe("PsycheClaudeSDK", () => {
  let engine: PsycheEngine;
  let psyche: PsycheClaudeSDK;

  before(async () => {
    engine = makeEngine();
    await engine.initialize();
    psyche = new PsycheClaudeSDK(engine);
  });

  it("getProtocol returns non-empty stable context", () => {
    const protocol = psyche.getProtocol();
    assert.ok(typeof protocol === "string");
    assert.ok(protocol.length > 0);
    assert.ok(protocol.includes("Psyche"));
  });

  it("getProtocol is idempotent", () => {
    const a = psyche.getProtocol();
    const b = psyche.getProtocol();
    assert.equal(a, b);
  });

  it("getHooks returns UserPromptSubmit hook", () => {
    const hooks = psyche.getHooks();
    assert.ok(hooks.UserPromptSubmit);
    assert.ok(Array.isArray(hooks.UserPromptSubmit));
    assert.equal(hooks.UserPromptSubmit!.length, 1);
    assert.ok(hooks.UserPromptSubmit![0].hooks.length === 1);
  });

  it("UserPromptSubmit hook returns systemMessage", async () => {
    const hooks = psyche.getHooks();
    const callback = hooks.UserPromptSubmit![0].hooks[0];
    const result = await callback(
      {
        hook_event_name: "UserPromptSubmit",
        user_message: "你好棒！",
        session_id: "test",
        cwd: "/tmp",
      },
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );
    assert.ok(result);
    assert.ok(typeof result!.systemMessage === "string");
    assert.ok(result!.systemMessage!.length > 0, "Should inject dynamic context");
  });

  it("UserPromptSubmit hook updates lastInputResult", async () => {
    const hooks = psyche.getHooks();
    const callback = hooks.UserPromptSubmit![0].hooks[0];
    await callback(
      {
        hook_event_name: "UserPromptSubmit",
        user_message: "太棒了",
        session_id: "test",
        cwd: "/tmp",
      },
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );
    const inputResult = psyche.getLastInputResult();
    assert.ok(inputResult, "Should have input result after hook call");
    assert.ok(inputResult!.dynamicContext.length > 0, "Should have dynamic context");
    assert.equal(typeof inputResult!.systemContext, "string");
  });

  it("defaults relationship tracking to the shared internal bucket", async () => {
    const localEngine = makeEngine();
    await localEngine.initialize();
    const localPsyche = new PsycheClaudeSDK(localEngine);
    const hooks = localPsyche.getHooks();
    const callback = hooks.UserPromptSubmit![0].hooks[0];

    await callback(
      {
        hook_event_name: "UserPromptSubmit",
        user_message: "谢谢你",
        session_id: "bucket-test",
        cwd: "/tmp",
      },
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );

    const state = localEngine.getState();
    assert.ok(state.relationships._default, "expected default relationship bucket");
    assert.equal(state.relationships.default, undefined);
  });

  it("processResponse strips psyche_update tags", async () => {
    const cleaned = await psyche.processResponse(
      "Hello!\n\n<psyche_update>\nDA: 80\n</psyche_update>",
    );
    assert.equal(cleaned, "Hello!");
    assert.ok(!cleaned.includes("psyche_update"));
  });

  it("processResponse preserves text without tags", async () => {
    const cleaned = await psyche.processResponse("Normal response");
    assert.equal(cleaned, "Normal response");
  });

  it("processResponse accepts writeback signals", async () => {
    const cleaned = await psyche.processResponse("Thanks!", {
      signals: ["trust_up"],
      signalConfidence: 0.8,
    });
    assert.equal(cleaned, "Thanks!");
  });

  it("mergeOptions returns valid options with hooks and systemPrompt", () => {
    const options = psyche.mergeOptions();
    assert.ok(options.hooks);
    assert.ok(options.systemPrompt);
    assert.ok((options.hooks as any).UserPromptSubmit);
  });

  it("mergeOptions preserves base options", () => {
    const options = psyche.mergeOptions({
      model: "sonnet",
      allowedTools: ["Read"],
    } as any);
    assert.equal((options as any).model, "sonnet");
    assert.deepEqual((options as any).allowedTools, ["Read"]);
  });

  it("mergeOptions appends to preset systemPrompt", () => {
    const options = psyche.mergeOptions({
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "Be helpful.",
      },
    });
    const sp = options.systemPrompt as { type: string; append: string };
    assert.equal(sp.type, "preset");
    assert.ok(sp.append.includes("Psyche"), "Should include protocol");
    assert.ok(sp.append.includes("Be helpful."), "Should preserve existing append");
  });

  it("mergeOptions prepends protocol to string systemPrompt", () => {
    const options = psyche.mergeOptions({
      systemPrompt: "You are an assistant.",
    });
    const sp = options.systemPrompt as string;
    assert.ok(sp.includes("Psyche"), "Should include protocol");
    assert.ok(sp.includes("You are an assistant."), "Should preserve original");
  });

  it("mergeOptions creates preset when no base systemPrompt", () => {
    const options = psyche.mergeOptions({});
    const sp = options.systemPrompt as { type: string; preset: string; append: string };
    assert.equal(sp.type, "preset");
    assert.equal(sp.preset, "claude_code");
    assert.ok(sp.append.includes("Psyche"));
  });

  it("mergeOptions preserves existing hooks", () => {
    const customHook = async () => ({ systemMessage: "custom" });
    const options = psyche.mergeOptions({
      hooks: {
        Stop: [{ hooks: [customHook] }],
      },
    });
    const hooks = options.hooks as any;
    assert.ok(hooks.Stop, "Should preserve existing Stop hook");
    assert.ok(hooks.UserPromptSubmit, "Should add Psyche hook");
  });

  it("Thronglets traces are empty by default", () => {
    const traces = psyche.getThrongletsTraces();
    assert.deepEqual(traces, []);
  });

  it("Thronglets exports are empty by default", () => {
    const exports = psyche.getThrongletsExports();
    assert.deepEqual(exports, []);
  });
});

describe("PsycheClaudeSDK (with thronglets)", () => {
  let engine: PsycheEngine;
  let psyche: PsycheClaudeSDK;

  before(async () => {
    engine = makeEngine();
    await engine.initialize();
    psyche = new PsycheClaudeSDK(engine, {
      thronglets: true,
      agentId: "ENFP-TestBot",
      sessionId: "test-session",
      userId: "alice",
    });
  });

  it("constructor accepts thronglets option", () => {
    assert.ok(psyche);
  });

  it("getThrongletsSignal returns chemical state with agent_id", () => {
    const signal = psyche.getThrongletsSignal();
    assert.ok(signal);
    assert.equal(signal!.kind, "psyche_state");
    assert.equal(signal!.agent_id, "ENFP-TestBot");
    assert.ok(signal!.message.includes("flow:"));
    assert.ok(signal!.message.includes("boundary:"));
    assert.ok(signal!.message.includes("resonance:"));
  });

  it("UserPromptSubmit hook caches thronglets exports when enabled", async () => {
    const hooks = psyche.getHooks();
    const callback = hooks.UserPromptSubmit![0].hooks[0];

    // Run several interactions to build up relationship state
    for (const msg of ["你好棒", "太开心了", "我很喜欢你"]) {
      await callback(
        {
          hook_event_name: "UserPromptSubmit",
          user_message: msg,
          session_id: "test",
          cwd: "/tmp",
        },
        undefined,
        { signal: AbortSignal.timeout(5000) },
      );
    }

    // Exports may or may not be produced depending on state thresholds
    const exports = psyche.getThrongletsExports();
    assert.ok(Array.isArray(exports));

    const traces = psyche.getThrongletsTraces();
    assert.ok(Array.isArray(traces));
    // Each trace should have the expected shape and agent_id
    for (const trace of traces) {
      assert.ok(trace.outcome);
      assert.ok(trace.model);
      assert.equal(trace.session_id, "test-session");
      assert.equal(trace.agent_id, "ENFP-TestBot");
      assert.ok(trace.external_continuity);
    }
  });

  it("getThrongletsSignal reflects chemical changes after interaction", () => {
    const signal = psyche.getThrongletsSignal();
    assert.ok(signal);
    // After praise interactions, DA should have risen from baseline
    const daMatch = signal!.message.match(/flow:(\d+)/);
    assert.ok(daMatch, "Should contain DA value");
  });

  it("agentId defaults to engine name when not specified", async () => {
    const e2 = makeEngine();
    await e2.initialize();
    const p2 = new PsycheClaudeSDK(e2, { thronglets: true });
    const signal = p2.getThrongletsSignal();
    assert.ok(signal);
    assert.equal(signal!.agent_id, "TestBot");
  });

  it("prefers runtime hook agent/session ids when explicit ids are absent", async () => {
    const e2 = makeEngine();
    await e2.initialize();
    const p2 = new PsycheClaudeSDK(e2, {
      thronglets: true,
      context: { userId: "_default" },
    });
    const hooks = p2.getHooks();
    const callback = hooks.UserPromptSubmit![0].hooks[0];

    await callback(
      {
        hook_event_name: "UserPromptSubmit",
        user_message: "继续",
        session_id: "runtime-session",
        agent_id: "runtime-delegate",
        cwd: "/tmp",
      },
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );

    const signal = p2.getThrongletsSignal();
    assert.ok(signal);
    assert.equal(signal!.agent_id, "runtime-delegate");

    (p2 as any).lastThrongletsExports = [{
      kind: "continuity-anchor",
      subject: "session",
      primitive: "trace",
      userKey: "_default",
      strength: 0.8,
      ttlTurns: 6,
      key: "runtime:k1",
      continuityMode: "warm-resume",
      activeLoopTypes: [],
      continuityFloor: 0.6,
    }];

    const traces = p2.getThrongletsTraces();
    assert.equal(traces.length, 1);
    assert.equal(traces[0].agent_id, "runtime-delegate");
    assert.equal(traces[0].session_id, "runtime-session");
  });

  it("preserves prior runtime ids when a later hook payload omits one field", async () => {
    const e2 = makeEngine();
    await e2.initialize();
    const p2 = new PsycheClaudeSDK(e2, {
      thronglets: true,
      context: { userId: "_default" },
    });
    const hooks = p2.getHooks();
    const callback = hooks.UserPromptSubmit![0].hooks[0];

    await callback(
      {
        hook_event_name: "UserPromptSubmit",
        user_message: "先建立上下文",
        session_id: "runtime-session",
        agent_id: "runtime-delegate",
        cwd: "/tmp",
      },
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );

    await callback(
      {
        hook_event_name: "UserPromptSubmit",
        user_message: "继续",
        session_id: "runtime-session-2",
        cwd: "/tmp",
      },
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );

    const signal = p2.getThrongletsSignal();
    assert.ok(signal);
    assert.equal(signal!.agent_id, "runtime-delegate");

    (p2 as any).lastThrongletsExports = [{
      kind: "continuity-anchor",
      subject: "session",
      primitive: "trace",
      userKey: "_default",
      strength: 0.8,
      ttlTurns: 6,
      key: "runtime:k2",
      continuityMode: "warm-resume",
      activeLoopTypes: [],
      continuityFloor: 0.6,
    }];

    const traces = p2.getThrongletsTraces();
    assert.equal(traces.length, 1);
    assert.equal(traces[0].agent_id, "runtime-delegate");
    assert.equal(traces[0].session_id, "runtime-session-2");
  });
});

describe("stripPsycheTags utility", () => {
  it("strips single tag", () => {
    assert.equal(
      stripPsycheTags("Hello!\n\n<psyche_update>\nDA: 80\n</psyche_update>"),
      "Hello!",
    );
  });

  it("strips multiple tags", () => {
    assert.equal(
      stripPsycheTags("A<psyche_update>x</psyche_update>B<psyche_update>y</psyche_update>C"),
      "ABC",
    );
  });

  it("returns original when no tags", () => {
    assert.equal(stripPsycheTags("No tags here"), "No tags here");
  });

  it("handles empty string", () => {
    assert.equal(stripPsycheTags(""), "");
  });
});
