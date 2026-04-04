#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODE = process.env.PSYCHE_RELEASE_GUARD_MODE ?? "local";
const ROOT = process.cwd();

function run(file, args) {
  return execFileSync(file, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  console.error(`[release-guard] ${message}`);
  process.exit(1);
}

function checkCleanWorktree() {
  const status = run("git", ["status", "--porcelain"]);
  if (status.length > 0) {
    fail("working tree must be clean before publish");
  }
}

function checkVersionInChangelog(version) {
  const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  if (!changelog.includes(`## v${version}`)) {
    fail(`CHANGELOG.md must contain a heading for v${version}`);
  }
}

function checkOpenClawPluginVersion(version) {
  const plugin = JSON.parse(readFileSync(join(ROOT, "openclaw.plugin.json"), "utf8"));
  if (plugin.version !== version) {
    fail(`openclaw.plugin.json version (${plugin.version ?? "missing"}) must match package.json version (${version})`);
  }
}

function checkLocalMainAlignment() {
  const branch = run("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    fail(`publish is only allowed from main (current: ${branch || "detached"})`);
  }

  const head = run("git", ["rev-parse", "HEAD"]);
  const originMain = run("git", ["rev-parse", "origin/main"]);
  if (head !== originMain) {
    fail("HEAD must exactly match origin/main before publish");
  }
}

function checkCiMainContainment() {
  const head = run("git", ["rev-parse", "HEAD"]);
  const containing = run("git", ["branch", "-r", "--contains", head])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!containing.includes("origin/main")) {
    fail("release commit must already be contained in origin/main");
  }
}

function main() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const version = pkg.version;

  if (!version) {
    fail("package.json is missing version");
  }

  checkCleanWorktree();
  checkVersionInChangelog(version);
  checkOpenClawPluginVersion(version);

  if (MODE === "ci") {
    checkCiMainContainment();
  } else {
    checkLocalMainAlignment();
  }

  console.log(`[release-guard] ok (${MODE}) v${version}`);
}

main();
