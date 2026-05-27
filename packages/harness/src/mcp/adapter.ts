// MCP server registry — the in-house port chosen over pi-mcp-adapter
// at M10 (see .belmont/memory/episodic/2026-05-27-m10-mcp-bridge.md).
//
// Responsibilities:
//   1. Read `.belmont/mcp.json`, parse via @belmont/knowledge-schema.
//   2. Apply the §12.3 blast-radius gate (drop non-auto:true servers
//      under BELMONT_AUTO_MODE=1).
//   3. Warm-or-discover the §12.4 tool cache; spawn discovery probes
//      only when mcp.json changed since last cache write.
//   4. Register each discovered tool with pi as `mcp__<server>__<tool>`.
//   5. Lazy connect on first invocation; reuse the connection across
//      invocations within a session; close on shutdown.
//   6. Graceful degrade: a server that fails to connect registers
//      placeholder tools that return a structured error to the LLM
//      without crashing the session.
//   7. Audit every invocation (server, tool, auto-mode, outcome) to
//      today's `mcp-tools` episodic.
//
// Test seam: `createMcpClient` is passed in via deps so tests inject a
// fake McpClient and exercise the full pipeline without spawning real
// subprocesses or hitting the network. Same dependency-injection
// pattern M3's boot-doctor + M9's rtk-detect use.

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { parseMcpJson, type McpConfig, type McpServerConfig } from "@belmont/knowledge-schema";

import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from "../pi/sdk.js";
import { applyAutoModeFilter, isAutoMode } from "./blast-radius.js";
import {
  readToolsCache,
  serverConfigHash,
  sha1,
  writeToolsCache,
  type CachedServerEntry,
  type CachedTool,
  type ToolsCache,
} from "./cache.js";
import { recordMcpInvocation, recordMcpServersForAutoRun } from "./audit.js";
import { createMcpClient, type McpClient, type McpToolDescriptor } from "./transport.js";

const MCP_JSON_REL = ".belmont/mcp.json";
const TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export type McpClientFactory = (
  server: McpServerConfig,
  env?: NodeJS.ProcessEnv,
) => { client: McpClient; missingEnv: string[] };

export type McpRegistryDeps = {
  /** Test-only: inject a fake McpClient factory. Production = `createMcpClient`. */
  createClient?: McpClientFactory;
  env?: NodeJS.ProcessEnv;
  /** Test-only: override `isAutoMode()` (so tests don't have to mutate
   *  process.env mid-suite). */
  isAutoMode?: () => boolean;
};

export type RegistrationOutcome = {
  /** Map of server name → "registered" | "skipped-no-auto" | "failed:<reason>". */
  results: Record<string, RegistrationResult>;
  /** Total tool count registered with pi (across all successful servers). */
  toolCount: number;
};

export type RegistrationResult =
  | { kind: "registered"; tools: number; fromCache: boolean }
  | { kind: "skipped-no-auto" }
  | { kind: "no-mcp-json" }
  | { kind: "failed"; reason: string };

/**
 * Read `.belmont/mcp.json`, apply blast-radius, discover-or-cache
 * tools, register them with pi. Returns a per-server outcome map so
 * `/belmont:mcp doctor` and the session_start handler can render it.
 *
 * Idempotent: a second call within the same session will register the
 * same tools again. Pi's registerTool silently overwrites on duplicate
 * name. The session_start handler calls this once on startup; the
 * `/belmont:mcp refresh` command calls it again after clearing the
 * cache. The auto loop does NOT re-register at runAuto start — the
 * filter is applied on each fresh session_start (pi creates a new
 * session per auto task, see M8 §8.3).
 */
export async function registerMcpServers(
  pi: ExtensionAPI,
  cwd: string,
  deps: McpRegistryDeps = {},
): Promise<RegistrationOutcome> {
  const factory = deps.createClient ?? createMcpClient;
  const env = deps.env ?? process.env;
  const inAuto = (deps.isAutoMode ?? isAutoMode)(env);

  const mcpJsonPath = join(cwd, MCP_JSON_REL);
  let raw: string;
  try {
    raw = await readFile(mcpJsonPath, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return { results: {}, toolCount: 0 };
    }
    throw err;
  }

  const parsed = parseMcpJson(raw);
  if (!parsed.ok) {
    return {
      results: {
        "(mcp.json)": {
          kind: "failed",
          reason: parsed.diagnostics.map((d) => d.message).join("; "),
        },
      },
      toolCount: 0,
    };
  }

  const fullConfig = parsed.data;
  const filtered = applyAutoModeFilter(fullConfig, inAuto);

  const sourceSha1 = sha1(raw);
  const existingCache = await readToolsCache(cwd);
  const reuseAll = existingCache?.sourceSha1 === sourceSha1;

  const newCache: ToolsCache = {
    version: 1,
    sourceSha1,
    entries: {},
  };

  const results: Record<string, RegistrationResult> = {};

  // Mark non-auto-mode servers as skipped at the audit layer — they
  // exist in fullConfig but are filtered out of `filtered`.
  for (const name of Object.keys(fullConfig.servers)) {
    if (!(name in filtered.servers)) {
      results[name] = { kind: "skipped-no-auto" };
    }
  }

  let toolCount = 0;
  for (const [name, server] of Object.entries(filtered.servers)) {
    const builtClient = factory(server, env);
    const resolvedHash = serverConfigHash({
      server,
      missingEnv: builtClient.missingEnv,
    });
    const cachedEntry = reuseAll ? existingCache?.entries[name] : undefined;
    const cacheHit = cachedEntry !== undefined && cachedEntry.configHash === resolvedHash;

    let tools: CachedTool[];
    if (cacheHit) {
      tools = cachedEntry!.tools;
    } else {
      // Probe live: connect, list, disconnect (lazy lifecycle). On
      // failure record a failed registration but DO NOT crash the
      // session — a single broken server should not poison the
      // bridge.
      try {
        await builtClient.client.connect();
        const discovered = await builtClient.client.listTools();
        tools = discovered.map(normaliseDescriptor);
        // Disconnect immediately for `lazy` servers; keep open for
        // `eager` / `keep-alive`. v1.0 only supports lazy + eager;
        // eager keeps the connection across the session.
        if (server.lifecycle === "lazy") {
          await builtClient.client.close();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results[name] = { kind: "failed", reason: msg };
        await safeClose(builtClient.client);
        continue;
      }
    }

    newCache.entries[name] = {
      discoveredAt: cachedEntry?.discoveredAt ?? new Date().toISOString(),
      configHash: resolvedHash,
      tools,
    };

    // Register each tool with pi as `mcp__<server>__<tool>`. The
    // tool's execute() reconnects on demand if disconnected (or
    // reuses the eager-mode connection). The audit-log bullet fires
    // on every invocation regardless of outcome.
    for (const t of tools) {
      const piName = `mcp__${name}__${t.name}`;
      if (!TOOL_NAME_RE.test(piName)) continue; // skip pathological names
      pi.registerTool(buildToolDefinition({
        piName,
        serverName: name,
        toolName: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        cwd,
        client: builtClient.client,
        isAutoMode: deps.isAutoMode ?? isAutoMode,
        env,
      }));
      toolCount += 1;
    }

    results[name] = {
      kind: "registered",
      tools: tools.length,
      fromCache: cacheHit,
    };
  }

  // Persist cache only if it changed (avoid spurious mtime churn
  // when /belmont:mcp doctor runs without refreshing).
  if (!reuseAll || cachedEntriesChanged(existingCache, newCache)) {
    await writeToolsCache(cwd, newCache);
  }

  // §12.4 audit spine — patch auto.json#mcp when running under auto.
  await recordMcpServersForAutoRun(
    cwd,
    Object.entries(filtered.servers).map(([n, s]) => ({
      name: n,
      type: s.type,
      auto: s.auto,
    })),
  );

  return { results, toolCount };
}

/** Build the pi ToolDefinition that fronts an MCP tool. Separated so
 *  tests can verify the surface without standing up the whole
 *  registry. */
type ToolDefDeps = {
  piName: string;
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: unknown;
  cwd: string;
  client: McpClient;
  isAutoMode: (env?: NodeJS.ProcessEnv) => boolean;
  env: NodeJS.ProcessEnv;
};

export function buildToolDefinition(deps: ToolDefDeps): ToolDefinition {
  const params = coerceToTSchema(deps.inputSchema);
  return {
    name: deps.piName,
    label: `MCP ${deps.serverName} ${deps.toolName}`,
    description: deps.description || `MCP ${deps.serverName}/${deps.toolName}`,
    parameters: params,
    async execute(
      _toolCallId,
      args,
    ): Promise<AgentToolResult<{ server: string; tool: string }>> {
      const started = Date.now();
      const inAuto = deps.isAutoMode(deps.env);
      try {
        await deps.client.connect();
        const result = await deps.client.callTool(
          deps.toolName,
          (args ?? {}) as Record<string, unknown>,
        );
        const duration = Date.now() - started;
        if (!result.ok) {
          await recordMcpInvocation({
            cwd: deps.cwd,
            server: deps.serverName,
            tool: deps.toolName,
            autoMode: inAuto,
            outcome: "error",
            errorMessage: result.error,
            durationMs: duration,
          });
          throw new Error(`MCP ${deps.serverName}/${deps.toolName} failed: ${result.error}`);
        }
        await recordMcpInvocation({
          cwd: deps.cwd,
          server: deps.serverName,
          tool: deps.toolName,
          autoMode: inAuto,
          outcome: "ok",
          durationMs: duration,
        });
        return {
          content: [{ type: "text", text: result.content }],
          details: { server: deps.serverName, tool: deps.toolName },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordMcpInvocation({
          cwd: deps.cwd,
          server: deps.serverName,
          tool: deps.toolName,
          autoMode: inAuto,
          outcome: "error",
          errorMessage: msg,
          durationMs: Date.now() - started,
        });
        throw err;
      }
    },
  };
}

/** Coerce an MCP `inputSchema` (JSON Schema) into a shape pi's
 *  TypeBox-typed ToolDefinition accepts. TypeBox TSchemas ARE valid
 *  JSON Schemas at runtime — we attach an empty object shell when the
 *  upstream schema is missing, then return as `unknown as TSchema`. */
function coerceToTSchema(input: unknown): ToolDefinition["parameters"] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { type: "object", properties: {} } as unknown as ToolDefinition["parameters"];
  }
  const r = input as Record<string, unknown>;
  if (r.type !== "object") {
    return { type: "object", properties: {}, ...r } as unknown as ToolDefinition["parameters"];
  }
  return r as unknown as ToolDefinition["parameters"];
}

function normaliseDescriptor(t: McpToolDescriptor): CachedTool {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  };
}

function cachedEntriesChanged(prev: ToolsCache | undefined, next: ToolsCache): boolean {
  if (!prev) return true;
  if (prev.sourceSha1 !== next.sourceSha1) return true;
  const prevKeys = Object.keys(prev.entries).sort();
  const nextKeys = Object.keys(next.entries).sort();
  if (prevKeys.length !== nextKeys.length) return true;
  if (prevKeys.some((k, i) => k !== nextKeys[i])) return true;
  for (const k of nextKeys) {
    if (prev.entries[k]?.configHash !== next.entries[k]?.configHash) return true;
  }
  return false;
}

async function safeClose(client: McpClient): Promise<void> {
  try {
    await client.close();
  } catch {
    // Swallow — close errors during cleanup are not actionable.
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

/** Cheap mtime check for `/belmont:mcp doctor` to surface "cache
 *  fresh" vs "mcp.json newer than cache". Used in the doctor output
 *  only; the registry uses sha1 not mtime for correctness. */
export async function getMcpJsonMtime(cwd: string): Promise<number | undefined> {
  try {
    const s = await stat(join(cwd, MCP_JSON_REL));
    return s.mtimeMs;
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
}

export type { McpConfig };
