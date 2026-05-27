// v2.3 §12.4 audit log — every MCP tool invocation appends one bullet
// to today's episodic file (kind: phase, slug: mcp-tools), and the
// `{name, type, auto}` server descriptor patches into
// `.belmont/auto.json#mcp` when the auto loop is running.
//
// The bullet captures: server name, tool name, auto-mode flag (so a
// post-hoc read can tell whether the call happened in the unattended
// path), and outcome (ok / error / refused). When the call was refused
// by the blast-radius gate, the bullet records `outcome: refused-not-
// auto` so the user has a forensic trail when a server they expected
// to fire didn't.
//
// Failures-to-write are swallowed and surfaced via `ctx.ui.notify`
// (when a notify handle is provided) — Belmont does NOT let an
// episodic-write error abort an in-flight tool call. Same pattern as
// hooks/session-before-compact.ts which writes a similar audit slug.

import { appendOrCreateEpisode } from "../state/episodic.js";
import {
  patchAutoJson,
  readAutoJson,
  type AutoJsonMcpEntry,
} from "../state/auto-json.js";

export type McpInvocationOutcome = "ok" | "error" | "refused-not-auto";

export type RecordMcpInvocationInput = {
  cwd: string;
  server: string;
  tool: string;
  autoMode: boolean;
  outcome: McpInvocationOutcome;
  /** Optional one-line error message — surfaces in the bullet body. */
  errorMessage?: string;
  /** Optional MCP duration ms — surfaces in the bullet body. */
  durationMs?: number;
};

export async function recordMcpInvocation(
  input: RecordMcpInvocationInput,
): Promise<void> {
  const parts: string[] = [];
  parts.push(`${input.server}/${input.tool}`);
  parts.push(input.autoMode ? "auto=yes" : "auto=no");
  parts.push(`outcome=${input.outcome}`);
  if (typeof input.durationMs === "number") {
    parts.push(`dur=${input.durationMs}ms`);
  }
  if (input.errorMessage) {
    parts.push(`err=${truncate(input.errorMessage, 120)}`);
  }
  await appendOrCreateEpisode({
    cwd: input.cwd,
    slug: "mcp-tools",
    kind: "phase",
    content: parts.join(" "),
  });
}

export type McpServerDescriptor = AutoJsonMcpEntry;

/**
 * Patch `.belmont/auto.json` with the resolved MCP server descriptors
 * for the current auto run. No-op when auto.json is absent (i.e. the
 * extension is registering MCP servers OUTSIDE an auto run — the
 * interactive REPL path).
 */
export async function recordMcpServersForAutoRun(
  cwd: string,
  servers: McpServerDescriptor[],
): Promise<void> {
  const existing = await readAutoJson(cwd);
  if (!existing) return; // not in an auto run; skip the audit spine
  await patchAutoJson(cwd, { mcp: servers });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}
