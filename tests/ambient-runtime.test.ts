import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchAmbientPriorsFromThronglets } from "../src/ambient-runtime.js";

describe("fetchAmbientPriorsFromThronglets", () => {
  it("returns structured priors from machine envelope output", async () => {
    const priors = await fetchAmbientPriorsFromThronglets(
      "deploy the shared service after yesterday's breakage",
      {
        runner: async () => ({
          ok: true,
          stdout: JSON.stringify({
            schema_version: "thronglets.ambient.v1",
            command: "ambient-priors",
            data: {
              priors: [
                {
                  summary: "mixed residue: similar context still shows 2 success / 2 failure sessions",
                  confidence: 0.74,
                  kind: "mixed-residue",
                  provider: "thronglets",
                  refs: ["ctx:abcd", "space:psyche"],
                },
              ],
            },
          }),
          stderr: "",
        }),
      },
    );

    assert.equal(priors.length, 1);
    assert.equal(priors[0].provider, "thronglets");
    assert.equal(priors[0].kind, "mixed-residue");
    assert.equal(priors[0].summary.includes("mixed residue"), true);
  });

  it("returns empty when the helper fails", async () => {
    const priors = await fetchAmbientPriorsFromThronglets("check deployment", {
      runner: async () => ({
        ok: false,
        stdout: "",
        stderr: "binary missing",
      }),
    });

    assert.deepEqual(priors, []);
  });

  it("returns empty for blank input", async () => {
    const priors = await fetchAmbientPriorsFromThronglets("   ", {
      runner: async () => {
        throw new Error("should not run");
      },
    });

    assert.deepEqual(priors, []);
  });

  it("passes the current goal through to thronglets and preserves it in the returned prior", async () => {
    let stdinPayload = "";
    const priors = await fetchAmbientPriorsFromThronglets("repair the provider path", {
      goal: "repair",
      runner: async (_binary, _args, stdin) => {
        stdinPayload = stdin;
        return {
          ok: true,
          stdout: JSON.stringify({
            schema_version: "thronglets.ambient.v1",
            command: "ambient-priors",
            data: {
              priors: [
                {
                  summary: "failure residue: similar repair path failed recently",
                  confidence: 0.79,
                  kind: "failure-residue",
                  goal: "repair",
                  provider: "thronglets",
                },
              ],
            },
          }),
          stderr: "",
        };
      },
    });

    assert.equal(JSON.parse(stdinPayload).goal, "repair");
    assert.equal(priors.length, 1);
    assert.equal(priors[0].goal, "repair");
  });
});
