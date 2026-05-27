// /belmont:mcp — diagnostics + refresh for the M10 MCP bridge.
//
// Subcommands (v1.0):
//
//   /belmont:mcp doctor   — list configured servers, auto-eligibility,
//                           cache freshness, last-registration outcome.
//                           Read-only; never spawns probes.
//   /belmont:mcp refresh  — clear `.belmont/mcp-tools-cache.json` then
//                           re-run registerMcpServers (which re-probes
//                           every reachable server).
//
// The doctor command is the user's primary forensic surface when an
// MCP tool isn't behaving as expected. It NEVER mutates state — even
// the cache is only READ. Refresh is the one mutating subcommand and
// the only path that re-spawns discovery probes.

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { parseMcpJson } from "@belmont/knowledge-schema";
import { readFile } from "node:fs/promises";

import type { ExtensionAPI } from "../pi/sdk.js";
import {
  autoModeExcluded,
  clearToolsCache,
  getMcpJsonMtime,
  isAutoMode,
  readToolsCache,
  registerMcpServers,
  type RegistrationOutcome,
} from "../mcp/index.js";

export function registerMcpCommand(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:mcp", {
    description: "MCP bridge diagnostics — /belmont:mcp doctor | /belmont:mcp refresh",
    handler: async (args, ctx) => {
      const sub = (args.trim().split(/\s+/, 1)[0] ?? "").toLowerCase();
      switch (sub) {
        case "":
        case "doctor":
          ctx.ui.notify(await formatDoctorReport(ctx.cwd), "info");
          return;
        case "refresh": {
          await clearToolsCache(ctx.cwd);
          const outcome = await registerMcpServers(pi, ctx.cwd);
          ctx.ui.notify(formatRefreshReport(outcome), "info");
          return;
        }
        default:
          ctx.ui.notify(
            `Unknown /belmont:mcp subcommand '${sub}'. Try: doctor | refresh.`,
            "warning",
          );
      }
    },
  });
}

export async function formatDoctorReport(cwd: string): Promise<string> {
  const mcpJsonPath = join(cwd, ".belmont", "mcp.json");
  let raw: string;
  try {
    raw = await readFile(mcpJsonPath, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      return "MCP bridge: no .belmont/mcp.json — add one to enable MCP servers.";
    }
    throw err;
  }

  const parsed = parseMcpJson(raw);
  if (!parsed.ok) {
    const lines = [".belmont/mcp.json invalid:"];
    for (const d of parsed.diagnostics) lines.push(`  - [${d.code}] ${d.message}`);
    return lines.join("\n");
  }

  const cfg = parsed.data;
  const inAuto = isAutoMode();
  const excluded = autoModeExcluded(cfg);

  const cache = await readToolsCache(cwd);
  const mcpJsonMtime = await getMcpJsonMtime(cwd);
  const cacheFresh = cache !== undefined && cache.sourceSha1 === sha1(raw);

  const lines: string[] = [];
  lines.push(`MCP bridge (${Object.keys(cfg.servers).length} server${Object.keys(cfg.servers).length === 1 ? "" : "s"} configured):`);
  lines.push("");
  lines.push(`Mode: ${inAuto ? "auto (BELMONT_AUTO_MODE=1)" : "interactive"}`);
  if (inAuto && excluded.length > 0) {
    lines.push(`Excluded (no auto:true): ${excluded.join(", ")}`);
  }
  lines.push("");
  lines.push(`Cache: ${cacheFresh ? "fresh" : cache ? "STALE (mcp.json changed since cache)" : "missing"}`);
  if (mcpJsonMtime && cache) {
    lines.push(`  mcp.json mtime: ${new Date(mcpJsonMtime).toISOString()}`);
  }
  lines.push("");
  lines.push("Servers:");
  for (const [name, server] of Object.entries(cfg.servers)) {
    const transport = server.type === "stdio" ? `stdio: ${server.command}` : `http: ${server.url}`;
    const autoMark = server.auto ? "auto:yes" : "auto:no";
    const lifecycle = server.lifecycle;
    const cached = cache?.entries[name];
    const toolNote = cached ? `${cached.tools.length} cached tool${cached.tools.length === 1 ? "" : "s"}` : "no cache";
    lines.push(`  ${name}  [${autoMark}, ${lifecycle}]  ${transport}  (${toolNote})`);
  }
  for (const w of parsed.warnings) {
    lines.push(`  ⚠ ${w.code}: ${w.message}`);
  }
  return lines.join("\n");
}

export function formatRefreshReport(outcome: RegistrationOutcome): string {
  const lines = [`MCP refresh: ${outcome.toolCount} tool${outcome.toolCount === 1 ? "" : "s"} registered.`];
  for (const [name, result] of Object.entries(outcome.results)) {
    switch (result.kind) {
      case "registered":
        lines.push(`  ${name}: ${result.tools} tool${result.tools === 1 ? "" : "s"}${result.fromCache ? " (from cache)" : " (probed)"}`);
        break;
      case "skipped-no-auto":
        lines.push(`  ${name}: skipped (no auto:true; reachable only in interactive mode)`);
        break;
      case "no-mcp-json":
        lines.push(`  ${name}: no .belmont/mcp.json`);
        break;
      case "failed":
        lines.push(`  ${name}: FAILED — ${result.reason}`);
        break;
    }
  }
  return lines.join("\n");
}

import { createHash } from "node:crypto";
function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
