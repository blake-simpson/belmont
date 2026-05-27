// state/auto-json.ts — `.belmont/auto.json` runtime-state ledger.
//
// v2.3 §4.1 + §7 + §17 M8:
//   "auto.json    # GITIGNORED — auto-mode runtime state (current
//                  milestone/task, paused flag)"
//
// Shape lives entirely under harness; the file is gitignored
// (init/templates.ts gitignoreTemplate ships these lines, dogfooded
// .belmont/.gitignore mirrors it). The fields are exactly what §7.1's
// loop body needs to resume cleanly after a crash:
//
//   - currentMilestone, currentTaskId : where we are in the work
//   - paused, stopRequested           : control-flow flags
//   - workerSessionId                 : last pi session id (for episodic
//                                        cross-ref + the leak test's
//                                        "did the worker actually die"
//                                        signal)
//   - startedAt                       : ISO timestamp (UTC) of /belmont:auto
//
// Atomic-write discipline (tmp+rename) keeps the ledger crash-safe:
// pi process killed mid-write never leaves a half-written JSON file
// that would brick the next /belmont:auto preflight.

import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const AUTO_JSON_REL_PATH = ".belmont/auto.json";
const AUTO_STOP_REL_PATH = ".belmont/auto.stop";

/** §12.4 — `auto.json#mcp` audit spine. Each /belmont:auto run patches
 *  in the post-blast-radius-filter list of MCP servers (the auto-only
 *  subset). Empty array when no mcp.json or no auto:true server. */
export type AutoJsonMcpEntry = {
  name: string;
  type: "stdio" | "http";
  auto: boolean;
};

export type AutoJsonState = {
  currentMilestone: string;
  currentTaskId?: string;
  paused: boolean;
  stopRequested: boolean;
  workerSessionId?: string;
  startedAt: string;
  /** §12.4 MCP audit spine. Populated by mcp/audit.ts when /belmont:auto runs. */
  mcp?: AutoJsonMcpEntry[];
};

export function autoJsonPath(cwd: string): string {
  return join(cwd, AUTO_JSON_REL_PATH);
}

export function autoStopPath(cwd: string): string {
  return join(cwd, AUTO_STOP_REL_PATH);
}

export async function readAutoJson(cwd: string): Promise<AutoJsonState | undefined> {
  const path = autoJsonPath(cwd);
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.currentMilestone !== "string") return undefined;
    if (typeof parsed.startedAt !== "string") return undefined;
    return {
      currentMilestone: parsed.currentMilestone,
      currentTaskId: typeof parsed.currentTaskId === "string" ? parsed.currentTaskId : undefined,
      paused: parsed.paused === true,
      stopRequested: parsed.stopRequested === true,
      workerSessionId:
        typeof parsed.workerSessionId === "string" ? parsed.workerSessionId : undefined,
      startedAt: parsed.startedAt,
      ...(Array.isArray(parsed.mcp) ? { mcp: parseMcpEntries(parsed.mcp) } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function writeAutoJson(cwd: string, state: AutoJsonState): Promise<void> {
  const path = autoJsonPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const body = `${JSON.stringify(state, null, 2)}\n`;
  // Atomic write: tmp + rename. rename() on POSIX is atomic within the
  // same filesystem, which `.belmont/` always is.
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, body, "utf8");
  await rename(tmpPath, path);
}

/** Update specific fields. Idempotent — no-op when file is absent. */
export async function patchAutoJson(
  cwd: string,
  patch: Partial<AutoJsonState>,
): Promise<AutoJsonState | undefined> {
  const current = await readAutoJson(cwd);
  if (!current) return undefined;
  const next: AutoJsonState = { ...current, ...patch };
  await writeAutoJson(cwd, next);
  return next;
}

export async function clearAutoJson(cwd: string): Promise<void> {
  const path = autoJsonPath(cwd);
  try {
    await unlink(path);
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }
}

/** Stop sentinel file — `/belmont:stop` writes, loop reads + deletes. */
export async function writeAutoStop(cwd: string): Promise<void> {
  const path = autoStopPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${new Date().toISOString()}\n`, "utf8");
}

export async function consumeAutoStop(cwd: string): Promise<boolean> {
  const path = autoStopPath(cwd);
  try {
    await unlink(path);
    return true;
  } catch (err: unknown) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

export async function autoStopExists(cwd: string): Promise<boolean> {
  const path = autoStopPath(cwd);
  try {
    await readFile(path);
    return true;
  } catch (err: unknown) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function parseMcpEntries(raw: unknown[]): AutoJsonMcpEntry[] {
  const out: AutoJsonMcpEntry[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.name !== "string") continue;
    if (r.type !== "stdio" && r.type !== "http") continue;
    out.push({ name: r.name, type: r.type, auto: r.auto === true });
  }
  return out;
}
