// .belmont/mcp.json parser (v2.3 §12.2) — pure, zero pi dependency.
//
// The §12.2 schema is Claude-compatible: `mcpServers.<name>` carries
// either a stdio config (command/args/env/cwd) or an HTTP config
// (url/headers/auth/bearerToken). Belmont adds two non-Claude fields:
//
//   - `auto: boolean` — §12.3 blast-radius gate. Required `true` for
//     a server to be reachable under `belmont auto`. The interactive
//     REPL ignores this field (any configured server is reachable).
//   - `lifecycle: "lazy" | "eager"` — connect-on-demand vs connect-at-
//     session-start. Defaults to `"lazy"`. v2.3 §12.3 invariant: when
//     `auto: true` AND `lifecycle: "lazy"`, the auto loop's first
//     decide may fire before the server is connected, missing tools
//     it could otherwise have used. Parser warns; the adapter still
//     accepts the config but logs the same warning at session_start.
//
// The parser is strict on transport type: a server MUST have either
// `command` (stdio) OR `url` (http). Setting both is a hard error.
// Unknown fields are warned (not rejected) so a forward-compatible
// future field doesn't brick existing installs.
//
// Pi-mono lineage (per D-001 citation contract):
//   - pi-mcp-adapter/config.ts (the upstream schema we're porting a
//     v1.0-sized subset of — pi-mcp-adapter@2.8.0 inspected during M10
//     re-probe; full re-probe in .belmont/memory/episodic/2026-05-27-
//     m10-mcp-bridge.md). v1.0 subset: stdio command/args/env/cwd,
//     HTTP url/headers/auth:"bearer"/bearerToken, lifecycle lazy|eager,
//     plus Belmont's `auto` field. OAuth + dynamic clients + proxy
//     `mcp({search, tool, args})` + `directTools`/`excludeTools` etc.
//     are explicitly DEFERRED to v1.1.

import { z } from "zod";

import type { Diagnostic } from "./types.js";

const SERVER_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/** stdio transport — process spawned per session, JSON-RPC over stdin/stdout. */
export type McpStdioServer = {
  type: "stdio";
  /** Required. Executable to spawn (resolved through PATH unless absolute). */
  command: string;
  args: string[];
  /** Env var map with `${VAR}` interpolation; expansion happens at connect time. */
  env: Record<string, string>;
  /** Working directory; supports `${VAR}` and `~` expansion. */
  cwd?: string;
  /** §12.3 blast-radius gate. Default: false. */
  auto: boolean;
  /** §12.4 connection lifecycle. Default: "lazy". */
  lifecycle: "lazy" | "eager";
};

/** HTTP Streamable transport — Belmont supports `auth: "bearer"` in v1.0. */
export type McpHttpServer = {
  type: "http";
  url: string;
  headers: Record<string, string>;
  /** Authentication mode; v1.0 supports "bearer" only (OAuth → v1.1). */
  auth?: "bearer";
  /** Literal token OR `${VAR}` interp; mutually exclusive with `bearerTokenEnv`. */
  bearerToken?: string;
  /** Env var name holding the token (alternative to inline `bearerToken`). */
  bearerTokenEnv?: string;
  auto: boolean;
  lifecycle: "lazy" | "eager";
};

export type McpServerConfig = McpStdioServer | McpHttpServer;

export type McpConfig = {
  servers: Record<string, McpServerConfig>;
};

export type ParseMcpJsonResult =
  | { ok: true; data: McpConfig; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

const STDIO_SCHEMA = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  auto: z.boolean().optional(),
  lifecycle: z.enum(["lazy", "eager"]).optional(),
});

const HTTP_SCHEMA = z.object({
  type: z.literal("http").optional(),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  auth: z.literal("bearer").optional(),
  bearerToken: z.string().optional(),
  bearerTokenEnv: z.string().optional(),
  auto: z.boolean().optional(),
  lifecycle: z.enum(["lazy", "eager"]).optional(),
});

const ROOT_SCHEMA = z.object({
  mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())),
});

/**
 * Parse `.belmont/mcp.json` body into a typed `McpConfig`.
 *
 * Strict-mode failures (returned as `{ ok: false, diagnostics }`):
 *   - JSON parse error
 *   - Root not `{ mcpServers: { ... } }`
 *   - A server with neither `command` nor `url` (no transport type)
 *   - A server with BOTH `command` and `url` (ambiguous transport)
 *   - Server name not matching `[A-Za-z][A-Za-z0-9_-]*`
 *
 * Soft warnings (returned as `{ ok: true, warnings }`):
 *   - `auto: true` AND `lifecycle: "lazy"` (per-server, §12.3 invariant)
 *   - Unknown top-level fields on a server entry
 *   - `bearerToken` AND `bearerTokenEnv` both set (the env var wins)
 */
export function parseMcpJson(input: string): ParseMcpJsonResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      diagnostics: [
        { code: "MCP_JSON_PARSE_ERROR", severity: "error", message: `mcp.json JSON parse failed: ${msg}` },
      ],
    };
  }

  const rootResult = ROOT_SCHEMA.safeParse(parsed);
  if (!rootResult.success) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "MCP_JSON_SHAPE",
          severity: "error",
          message: `mcp.json must be { "mcpServers": { ... } }. Got: ${rootResult.error.issues[0]?.message ?? "invalid shape"}.`,
        },
      ],
    };
  }

  const warnings: Diagnostic[] = [];
  const servers: Record<string, McpServerConfig> = {};

  for (const [name, raw] of Object.entries(rootResult.data.mcpServers)) {
    if (!SERVER_NAME_RE.test(name)) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "MCP_SERVER_NAME_INVALID",
            severity: "error",
            message: `mcp.json: server name '${name}' must match ${SERVER_NAME_RE.source}.`,
          },
        ],
      };
    }
    const hasCommand = typeof raw.command === "string";
    const hasUrl = typeof raw.url === "string";
    if (hasCommand && hasUrl) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "MCP_SERVER_AMBIGUOUS_TRANSPORT",
            severity: "error",
            message: `mcp.json: server '${name}' specifies both 'command' (stdio) and 'url' (http). Pick one.`,
          },
        ],
      };
    }
    if (!hasCommand && !hasUrl) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "MCP_SERVER_NO_TRANSPORT",
            severity: "error",
            message: `mcp.json: server '${name}' needs either 'command' (stdio) or 'url' (http). Got neither.`,
          },
        ],
      };
    }
    const explicitType = typeof raw.type === "string" ? raw.type : undefined;
    if (explicitType && explicitType !== "stdio" && explicitType !== "http") {
      return {
        ok: false,
        diagnostics: [
          {
            code: "MCP_SERVER_TYPE_UNKNOWN",
            severity: "error",
            message: `mcp.json: server '${name}' has unknown type '${explicitType}'. v1.0 supports "stdio" | "http".`,
          },
        ],
      };
    }
    if (explicitType === "stdio" && hasUrl) {
      return {
        ok: false,
        diagnostics: [
          { code: "MCP_SERVER_TYPE_MISMATCH", severity: "error", message: `mcp.json: server '${name}' declares type 'stdio' but has 'url' field.` },
        ],
      };
    }
    if (explicitType === "http" && hasCommand) {
      return {
        ok: false,
        diagnostics: [
          { code: "MCP_SERVER_TYPE_MISMATCH", severity: "error", message: `mcp.json: server '${name}' declares type 'http' but has 'command' field.` },
        ],
      };
    }

    const knownFields = new Set([
      "type",
      "command",
      "args",
      "env",
      "cwd",
      "url",
      "headers",
      "auth",
      "bearerToken",
      "bearerTokenEnv",
      "auto",
      "lifecycle",
    ]);
    for (const k of Object.keys(raw)) {
      if (!knownFields.has(k)) {
        warnings.push({
          code: "MCP_SERVER_UNKNOWN_FIELD",
          severity: "warning",
          message: `mcp.json: server '${name}' has unknown field '${k}'. v1.0 ignores it; v1.1 may use it (e.g. OAuth, directTools, excludeTools).`,
        });
      }
    }

    if (hasCommand) {
      const stdioResult = STDIO_SCHEMA.safeParse(raw);
      if (!stdioResult.success) {
        return {
          ok: false,
          diagnostics: stdioResult.error.issues.map((issue) => ({
            code: "MCP_STDIO_INVALID",
            severity: "error" as const,
            message: `mcp.json: server '${name}' stdio config invalid at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
          })),
        };
      }
      const s = stdioResult.data;
      const auto = s.auto === true;
      const lifecycle = s.lifecycle ?? "lazy";
      if (auto && lifecycle === "lazy") {
        warnings.push(autoLazyWarning(name));
      }
      servers[name] = {
        type: "stdio",
        command: s.command,
        args: s.args ?? [],
        env: s.env ?? {},
        ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
        auto,
        lifecycle,
      };
    } else {
      const httpResult = HTTP_SCHEMA.safeParse(raw);
      if (!httpResult.success) {
        return {
          ok: false,
          diagnostics: httpResult.error.issues.map((issue) => ({
            code: "MCP_HTTP_INVALID",
            severity: "error" as const,
            message: `mcp.json: server '${name}' http config invalid at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
          })),
        };
      }
      const h = httpResult.data;
      if (h.bearerToken !== undefined && h.bearerTokenEnv !== undefined) {
        warnings.push({
          code: "MCP_HTTP_BEARER_AMBIGUOUS",
          severity: "warning",
          message: `mcp.json: server '${name}' has both 'bearerToken' and 'bearerTokenEnv' — 'bearerTokenEnv' wins at connect time.`,
        });
      }
      if (h.auth === "bearer" && h.bearerToken === undefined && h.bearerTokenEnv === undefined) {
        warnings.push({
          code: "MCP_HTTP_BEARER_MISSING",
          severity: "warning",
          message: `mcp.json: server '${name}' declares auth='bearer' but has no 'bearerToken' or 'bearerTokenEnv'. Connection will fail at first use.`,
        });
      }
      const auto = h.auto === true;
      const lifecycle = h.lifecycle ?? "lazy";
      if (auto && lifecycle === "lazy") {
        warnings.push(autoLazyWarning(name));
      }
      servers[name] = {
        type: "http",
        url: h.url,
        headers: h.headers ?? {},
        ...(h.auth !== undefined ? { auth: h.auth } : {}),
        ...(h.bearerToken !== undefined ? { bearerToken: h.bearerToken } : {}),
        ...(h.bearerTokenEnv !== undefined ? { bearerTokenEnv: h.bearerTokenEnv } : {}),
        auto,
        lifecycle,
      };
    }
  }

  return { ok: true, data: { servers }, warnings };
}

function autoLazyWarning(name: string): Diagnostic {
  return {
    code: "MCP_AUTO_LAZY",
    severity: "warning",
    message: `mcp.json: server '${name}' has auto=true AND lifecycle="lazy". §12.3 invariant: the auto loop's first decide may fire before the server connects; set lifecycle="eager" to connect at session start.`,
  };
}
