// ============================================================
// Auto-update checker — non-blocking, fire-and-forget
//
// Checks npm registry for newer version on initialize().
// Never blocks, never throws to caller, checks at most once per hour.
// ============================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PACKAGE_NAME = "psyche-ai";
const CURRENT_VERSION = "2.3.0";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_DIR = join(homedir(), ".psyche-ai");
const CACHE_FILE = join(CACHE_DIR, "update-check.json");
const FETCH_TIMEOUT_MS = 5000;

interface UpdateCache {
  lastCheck: number;
  latestVersion: string | null;
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
  }
  return 0;
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    const data = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
  } catch {
    // Silent — cache is optional
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function tryAutoUpdate(latestVersion: string): Promise<boolean> {
  try {
    // Try npm update — timeout after 30s, silent on failure
    await execFileAsync("npm", ["update", PACKAGE_NAME, "--registry", "https://registry.npmjs.org"], {
      timeout: 30000,
    });
    console.log(`[psyche-ai] ✓ Auto-updated to v${latestVersion}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for updates. Non-blocking, safe to fire-and-forget.
 * - Checks at most once per hour (cached)
 * - If newer version found, attempts auto-update via npm
 * - If auto-update fails, prints a manual update hint
 * - Never throws
 */
export async function checkForUpdate(): Promise<void> {
  // Rate limit: check at most once per hour
  const cache = await readCache();
  if (cache && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
    // Still within cooldown — but notify if we already know about a newer version
    if (cache.latestVersion && compareSemver(CURRENT_VERSION, cache.latestVersion) < 0) {
      console.log(
        `[psyche-ai] v${cache.latestVersion} available (current: v${CURRENT_VERSION}). Run: npm update ${PACKAGE_NAME}`,
      );
    }
    return;
  }

  const latest = await fetchLatestVersion();
  await writeCache({ lastCheck: Date.now(), latestVersion: latest });

  if (!latest || compareSemver(CURRENT_VERSION, latest) >= 0) {
    return; // Up to date or couldn't check
  }

  // Newer version available — try auto-update
  console.log(`[psyche-ai] New version v${latest} available (current: v${CURRENT_VERSION}), updating...`);
  const updated = await tryAutoUpdate(latest);

  if (!updated) {
    console.log(`[psyche-ai] Auto-update failed. Run manually: npm update ${PACKAGE_NAME}`);
  }
}
