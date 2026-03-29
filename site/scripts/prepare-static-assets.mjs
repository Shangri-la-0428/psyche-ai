import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tasks = [
  {
    input: resolve(rootDir, "scripts/psyche-page.source.js"),
    output: resolve(rootDir, "public/psyche-page.js"),
  },
];

for (const task of tasks) {
  const source = await readFile(task.input, "utf8");
  const result = await transform(source, {
    loader: "js",
    format: "esm",
    minify: true,
    target: "es2020",
    legalComments: "none",
  });

  await mkdir(dirname(task.output), { recursive: true });
  await writeFile(task.output, result.code.trimEnd() + "\n", "utf8");
  console.log(`prepared ${task.output}`);
}
