// ============================================================
// HTTP Adapter — Standalone server for Python/Go/any language
//
// Usage:
//   import { createPsycheServer } from "psyche-ai/http";
//
//   const server = createPsycheServer(engine, { port: 3210 });
//
// Endpoints:
//   POST /process-input  { text, userId? }  → { systemContext, dynamicContext, stimulus, policyModifiers?, subjectivityKernel?, responseContract?, generationControls?, policyContext }
//   POST /process-output { text, userId?, signals?, signalConfidence? }  → { cleanedText, stateChanged }
//   GET  /state                             → PsycheState
//   GET  /protocol?locale=zh                → { protocol }
//
// Zero dependencies — uses node:http only.
// ============================================================

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { PsycheEngine } from "../core.js";
import type { WritebackSignalType } from "../types.js";

// ── Types ────────────────────────────────────────────────────

export interface HttpAdapterOptions {
  port?: number;
  host?: string;
}

const VALID_WRITEBACK_SIGNALS = new Set<WritebackSignalType>([
  "trust_up",
  "trust_down",
  "boundary_set",
  "boundary_soften",
  "repair_attempt",
  "repair_landed",
  "closeness_invite",
  "withdrawal_mark",
  "self_assertion",
  "task_recenter",
]);

function parseSignals(value: unknown): WritebackSignalType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.filter((item): item is WritebackSignalType => (
    typeof item === "string" && VALID_WRITEBACK_SIGNALS.has(item as WritebackSignalType)
  ));
  return parsed.length > 0 ? [...new Set(parsed)] : undefined;
}

// ── Server ───────────────────────────────────────────────────

/**
 * Create an HTTP server that exposes PsycheEngine via REST API.
 *
 * @example
 * ```ts
 * import { PsycheEngine, FileStorageAdapter } from "psyche-ai";
 * import { createPsycheServer } from "psyche-ai/http";
 *
 * const engine = new PsycheEngine(
 *   { mbti: "ENFP", name: "Luna" },
 *   new FileStorageAdapter("./workspace"),
 * );
 * await engine.initialize();
 *
 * const server = createPsycheServer(engine, { port: 3210 });
 * // Now accessible from any language:
 * // curl -X POST http://localhost:3210/process-input -d '{"text":"Hello!"}'
 * ```
 */
export function createPsycheServer(engine: PsycheEngine, opts?: HttpAdapterOptions): Server {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // GET /state
      if (req.method === "GET" && url.pathname === "/state") {
        json(res, 200, engine.getState());
        return;
      }

      // GET /protocol
      if (req.method === "GET" && url.pathname === "/protocol") {
        const locale = url.searchParams.get("locale") as "zh" | "en" | null;
        json(res, 200, { protocol: engine.getProtocol(locale ?? undefined) });
        return;
      }

      // POST /process-input
      if (req.method === "POST" && url.pathname === "/process-input") {
        const body = await readBody(req);
        const result = await engine.processInput(
          (body.text as string) ?? "",
          { userId: body.userId as string | undefined },
        );
        json(res, 200, result);
        return;
      }

      // POST /process-output
      if (req.method === "POST" && url.pathname === "/process-output") {
        const body = await readBody(req);
        const result = await engine.processOutput(
          (body.text as string) ?? "",
          {
            userId: body.userId as string | undefined,
            signals: parseSignals(body.signals),
            signalConfidence: typeof body.signalConfidence === "number" ? body.signalConfidence : undefined,
          },
        );
        json(res, 200, result);
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  });

  const port = opts?.port ?? 3210;
  const host = opts?.host ?? "127.0.0.1";
  server.listen(port, host);

  return server;
}

// ── Helpers ──────────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}
