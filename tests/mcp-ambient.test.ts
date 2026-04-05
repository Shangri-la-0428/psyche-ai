import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AmbientPriorView } from "../src/types.js";
import { resolveRuntimeAmbientPriors } from "../src/adapters/mcp.js";

describe("resolveRuntimeAmbientPriors", () => {
  it("keeps explicit ambient priors ahead of auto-fetch", async () => {
    const explicit: AmbientPriorView[] = [
      { summary: "explicit prior", confidence: 0.91, provider: "host" },
    ];
    const resolved = await resolveRuntimeAmbientPriors("deploy", explicit, undefined, {
      mode: "auto",
      fetcher: async () => [{ summary: "fetched prior", confidence: 0.42, provider: "thronglets" }],
    });
    assert.deepEqual(resolved, explicit);
  });

  it("auto-fetches priors when explicit priors are absent", async () => {
    const resolved = await resolveRuntimeAmbientPriors("deploy", undefined, undefined, {
      mode: "auto",
      fetcher: async () => [{ summary: "fetched prior", confidence: 0.72, provider: "thronglets" }],
    });
    assert.equal(resolved?.length, 1);
    assert.equal(resolved?.[0].summary, "fetched prior");
  });

  it("stays quiet when ambient auto-fetch is disabled", async () => {
    const resolved = await resolveRuntimeAmbientPriors("deploy", undefined, undefined, {
      mode: "off",
      fetcher: async () => [{ summary: "fetched prior", confidence: 0.72, provider: "thronglets" }],
    });
    assert.equal(resolved, undefined);
  });

  it("passes the current goal through to the runtime fetcher", async () => {
    let seenGoal: string | undefined;
    const resolved = await resolveRuntimeAmbientPriors("repair deploy", undefined, "repair", {
      mode: "auto",
      fetcher: async (_text, opts) => {
        seenGoal = opts?.goal;
        return [{
          summary: "recent failure residue",
          confidence: 0.77,
          provider: "thronglets",
          goal: opts?.goal,
        }];
      },
    });

    assert.equal(seenGoal, "repair");
    assert.equal(resolved?.[0].goal, "repair");
  });
});
