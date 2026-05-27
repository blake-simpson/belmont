// v2.3 §12.4 tool-metadata cache.
//
// `.belmont/mcp-tools-cache.json` records the {tools[]} each server
// returned at last probe, plus a per-server `discoveredAt` ISO date,
// the mcp.json sha1 the cache was captured against, and the resolved
// transport hash (so a `${VAR}` env change visibly busts the cache).
//
// Invariants:
//   - Atomic write (tmp + rename) — never leave a half-written cache
//     that would brick the next session_start. Mirrors state/auto-
//     json.ts which sets the in-repo pattern.
//   - mtime-of-mcp.json invalidation: when mcp.json changes (or
//     disappears), the cache is conceptually stale. Belmont validates
//     via the stored `sourceSha1` field, not pure mtime — mtime alone
//     would false-positive on `touch .belmont/mcp.json`.
//   - Gitignored: init/templates.ts gitignoreTemplate already ships
//     `mcp-tools-cache.json` (line 125 as of M9). M10 doesn't change
//     the template.
//   - Read-side tolerant of missing-or-malformed: returns
//     `{ entries: {} }` so the adapter treats it as "discover
//     everything fresh on next probe."

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CACHE_REL = ".belmont/mcp-tools-cache.json";

export type CachedTool = {
  name: string;
  description: string;
  /** JSON Schema for tool input (the MCP server's `inputSchema`). */
  inputSchema: unknown;
};

export type CachedServerEntry = {
  /** ISO-8601 UTC timestamp of the last successful tool-list probe. */
  discoveredAt: string;
  /** sha1 of the post-interpolation server config — busts cache on
   *  `${VAR}` env change AND on direct mcp.json edits. */
  configHash: string;
  tools: CachedTool[];
};

export type ToolsCache = {
  /** sha1 of `.belmont/mcp.json` at cache write time. The session_start
   *  probe MUST re-read mcp.json and re-sha; any mismatch → discard the
   *  whole cache and re-probe every server. */
  sourceSha1: string;
  /** Cache schema version. v1.0 = 1. Bump when shape changes; readers
   *  that see a higher number ignore the cache. */
  version: 1;
  entries: Record<string, CachedServerEntry>;
};

export function toolsCachePath(cwd: string): string {
  return join(cwd, CACHE_REL);
}

export async function readToolsCache(cwd: string): Promise<ToolsCache | undefined> {
  let body: string;
  try {
    body = await readFile(toolsCachePath(cwd), "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Corrupt cache — treat as missing; the adapter will rebuild.
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const p = parsed as Record<string, unknown>;
  if (p.version !== 1) return undefined;
  if (typeof p.sourceSha1 !== "string") return undefined;
  if (p.entries === null || typeof p.entries !== "object" || Array.isArray(p.entries)) {
    return undefined;
  }
  // Trust the on-disk shape; we wrote it. Cheap structural check only.
  return parsed as ToolsCache;
}

export async function writeToolsCache(cwd: string, cache: ToolsCache): Promise<void> {
  const abs = toolsCachePath(cwd);
  await mkdir(dirname(abs), { recursive: true });
  const body = `${JSON.stringify(cache, null, 2)}\n`;
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, abs);
}

export async function clearToolsCache(cwd: string): Promise<void> {
  try {
    await unlink(toolsCachePath(cwd));
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

/** Compute a stable hash of the resolved (post-interpolation) server
 *  config so the cache invalidates when a `${VAR}` resolves to a new
 *  value — even when mcp.json itself didn't change. */
export function serverConfigHash(resolved: unknown): string {
  return sha1(JSON.stringify(resolved));
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
