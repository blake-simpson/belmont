// Thin factory over `@modelcontextprotocol/sdk` client transports.
//
// adapter.ts consumes this through the `McpClient` interface declared
// below — NEVER through direct SDK imports. That keeps adapter.ts
// trivially testable (the test injects a fake McpClient), and pins the
// SDK surface to a single file so swapping `@modelcontextprotocol/sdk`
// for a different transport (or, in v1.1, layering OAuth in) is a
// one-file change.
//
// v1.0 scope (per the M10 buy-or-port verdict — pi-mcp-adapter
// DEFERRED to v1.1, see .belmont/memory/episodic/2026-05-27-m10-mcp-
// bridge.md):
//
//   - stdio transport via `StdioClientTransport(command, args, env, cwd)`
//   - HTTP transport via `StreamableHTTPClientTransport(url, headers)`
//     with `Authorization: Bearer <token>` injected when auth==="bearer"
//   - lazy connect: callers invoke `client.connect()` on demand
//   - `client.listTools()` returns the post-discovery tool descriptors
//   - `client.callTool({name, arguments})` returns either text content
//     or a structured error
//   - `client.close()` releases the transport
//
// v1.1 scope (intentionally omitted in v1.0):
//   - OAuth grant flows (authorization_code + client_credentials +
//     dynamic registration)
//   - SSE fallback when StreamableHTTP isn't supported by the server
//   - keep-alive lifecycle with health checks
//   - request batching
//
// Pi-mono lineage (D-001): MCP transports are upstream-of-pi, not a
// pi-* package — so the B5 pi-boundary is unchanged at M10. The MCP
// SDK is a peer transport library; no `.dependency-cruiser.cjs` or
// test/pi-boundary.test.ts edits.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { McpServerConfig } from "@belmont/knowledge-schema";

import { expandTilde, interpolate, interpolateRecord } from "./interpolate.js";

/** What the adapter actually needs from an MCP client. A thin shim;
 *  the production transport returns a real `Client` wrapped here. */
export interface McpClient {
  /** Connect to the configured transport. Idempotent — second call is
   *  a no-op when already connected. */
  connect(): Promise<void>;
  /** Discover the server's tool list. Requires `connect()` first. */
  listTools(): Promise<McpToolDescriptor[]>;
  /** Invoke a tool by name with JSON-serialisable args. Returns
   *  serialised text content or an error result. Requires `connect()`. */
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  /** Close the underlying transport and release the subprocess /
   *  socket. Safe to call when never connected. */
  close(): Promise<void>;
}

export type McpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export type McpToolResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

/**
 * Build a connected-on-demand `McpClient` over the production SDK.
 *
 * Resolves `${VAR}` / `$env:VAR` / `~` in env / args / cwd / url /
 * headers / bearerToken at construction time. The resolution map is
 * captured into `configHash` (see cache.ts) so a `${VAR}` change
 * invalidates that server's cache entry.
 */
export function createMcpClient(
  server: McpServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): { client: McpClient; missingEnv: string[] } {
  const missing: string[] = [];
  const collect = (m: string[]) => {
    for (const v of m) if (!missing.includes(v)) missing.push(v);
  };

  if (server.type === "stdio") {
    const command = interpolate(server.command, env);
    const args = server.args.map((a) => interpolate(a, env));
    const envRec = interpolateRecord(server.env, env);
    const cwdInterp = server.cwd ? interpolate(server.cwd, env) : undefined;
    collect(command.missing);
    for (const a of args) collect(a.missing);
    collect(envRec.missing);
    if (cwdInterp) collect(cwdInterp.missing);

    const cwd = cwdInterp ? expandTilde(cwdInterp.value, env.HOME) : undefined;

    const transport = new StdioClientTransport({
      command: command.value,
      args: args.map((a) => a.value),
      env: { ...envRec.record },
      ...(cwd ? { cwd } : {}),
    });
    return { client: wrap(transport), missingEnv: missing };
  }

  // HTTP transport.
  const urlInterp = interpolate(server.url, env);
  const headersInterp = interpolateRecord(server.headers, env);
  collect(urlInterp.missing);
  collect(headersInterp.missing);

  const headers: Record<string, string> = { ...headersInterp.record };
  if (server.auth === "bearer") {
    const token = resolveBearer(server, env);
    if (token.value !== undefined) {
      headers["Authorization"] = `Bearer ${token.value}`;
    }
    collect(token.missing);
  }

  const transport = new StreamableHTTPClientTransport(new URL(urlInterp.value), {
    requestInit: { headers },
  });
  return { client: wrap(transport), missingEnv: missing };
}

function resolveBearer(
  server: { bearerToken?: string; bearerTokenEnv?: string },
  env: NodeJS.ProcessEnv,
): { value: string | undefined; missing: string[] } {
  // §12.2 + parser warning: bearerTokenEnv wins when both are set.
  if (server.bearerTokenEnv) {
    const v = env[server.bearerTokenEnv];
    if (v === undefined) {
      return { value: undefined, missing: [server.bearerTokenEnv] };
    }
    return { value: v, missing: [] };
  }
  if (server.bearerToken !== undefined) {
    const r = interpolate(server.bearerToken, env);
    return { value: r.value, missing: r.missing };
  }
  return { value: undefined, missing: [] };
}

type AnyTransport = StdioClientTransport | StreamableHTTPClientTransport;

function wrap(transport: AnyTransport): McpClient {
  const client = new Client(
    { name: "belmont-harness", version: "1.0.0" },
    { capabilities: {} },
  );
  let connected = false;
  return {
    async connect() {
      if (connected) return;
      await client.connect(transport);
      connected = true;
    },
    async listTools() {
      const result = await client.listTools();
      return result.tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
      }));
    },
    async callTool(name, args) {
      try {
        const result = await client.callTool({ name, arguments: args });
        const content = serialiseContent(result.content);
        if (result.isError) return { ok: false, error: content };
        return { ok: true, content };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
    async close() {
      if (!connected) return;
      await client.close();
      connected = false;
    },
  };
}

function serialiseContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item === null || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (r.type === "text" && typeof r.text === "string") {
      parts.push(r.text);
    }
  }
  return parts.join("\n");
}
