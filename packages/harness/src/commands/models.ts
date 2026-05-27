// /belmont:models — the M7 model-tiering inspection surface.
//
// Subcommands per v2.3 §9.4:
//   doctor [--milestone Mn]    per-tier reachability + per-agent resolution
//   resolve <agent> [--milestone Mn]
//                              single-agent debug; shows the winning layer
//   overlays                   list per-milestone HTML-comment overrides
//
// Output is plain text — readable in the REPL without LLM in the loop
// (per §9.4 mockup). Status notifications use ctx.ui.notify so the panel
// can render the report cleanly.
//
// pi-mono upstream reference (per D-001-omp-evaluation):
//   - examples/extensions/model-status.ts (model_select status pattern;
//     informs the "deterministic plain-text report" format)

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  AGENT_ROLES,
  type AgentRole,
  parseMilestoneOverlay,
  parseProgress,
} from "@belmont/knowledge-schema";

import type { ExtensionAPI } from "../pi/sdk.js";
import { parseCliTierFlags } from "../tiering/cli-flag.js";
import { formatDoctorReport, runModelsDoctor } from "../tiering/doctor.js";
import { loadModelsJson } from "../tiering/models-json.js";
import { resolveTier } from "../tiering/resolve.js";

const SUBCOMMANDS = ["doctor", "resolve", "overlays"] as const;

type ParsedArgs = {
  sub: (typeof SUBCOMMANDS)[number] | "" | "help";
  positional: string[];
  milestone?: string;
  tierFlags: string[];
};

export function parseModelsArgs(raw: string): ParsedArgs {
  const tokens = raw.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return { sub: "", positional: [], tierFlags: [] };

  const first = tokens[0]!;
  const out: ParsedArgs = { sub: "", positional: [], tierFlags: [] };
  if ((SUBCOMMANDS as readonly string[]).includes(first)) {
    out.sub = first as ParsedArgs["sub"];
  } else if (first === "help" || first === "--help" || first === "-h") {
    out.sub = "help";
  } else {
    // Unknown leading token — treat as help.
    out.sub = "help";
    return out;
  }

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "--milestone" && i + 1 < tokens.length) {
      out.milestone = tokens[++i];
    } else if (t.startsWith("--milestone=")) {
      out.milestone = t.slice("--milestone=".length);
    } else if (t === "--tier" && i + 1 < tokens.length) {
      out.tierFlags.push(tokens[++i]!);
    } else if (t.startsWith("--tier=")) {
      out.tierFlags.push(t.slice("--tier=".length));
    } else {
      out.positional.push(t);
    }
  }
  return out;
}

export function registerModelsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:models", {
    description:
      "Inspect Belmont's model tier configuration (doctor | resolve <agent> | overlays)",
    getArgumentCompletions: (prefix) => {
      const filtered = SUBCOMMANDS.filter((s) => s.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (rawArgs, ctx) => {
      const args = parseModelsArgs(rawArgs);
      if (args.sub === "" || args.sub === "help") {
        ctx.ui.notify(formatHelp(), "info");
        return;
      }

      if (args.sub === "doctor") {
        const cliParse = parseCliTierFlags(args.tierFlags);
        const doctor = await runModelsDoctor(ctx.cwd, {
          modelRegistry: ctx.modelRegistry,
          milestoneId: args.milestone,
          cliOverrides: cliParse.overrides,
        });
        const cliWarnings = cliParse.warnings.length
          ? "\n  --tier warnings:\n" +
            cliParse.warnings.map((w) => `    - ${w.message}`).join("\n")
          : "";
        ctx.ui.notify(
          formatDoctorReport(doctor) + cliWarnings,
          doctor.hardFail ? "warning" : "info",
        );
        return;
      }

      if (args.sub === "resolve") {
        await handleResolve(ctx, args);
        return;
      }

      if (args.sub === "overlays") {
        await handleOverlays(ctx);
        return;
      }
    },
  });
}

function formatHelp(): string {
  return [
    "Usage:",
    "  /belmont:models doctor [--milestone M3] [--tier agent=high+...]",
    "  /belmont:models resolve <agent> [--milestone M3] [--tier agent=...]",
    "  /belmont:models overlays",
    "",
    "Agents: " + AGENT_ROLES.join(", "),
  ].join("\n");
}

async function handleResolve(
  ctx: { cwd: string; modelRegistry: unknown; ui: { notify: (text: string, level?: "warning" | "info" | "error") => void } },
  args: ParsedArgs,
): Promise<void> {
  if (args.positional.length === 0) {
    ctx.ui.notify(
      "Usage: /belmont:models resolve <agent>. Agents: " + AGENT_ROLES.join(", "),
      "warning",
    );
    return;
  }
  const agent = args.positional[0]!;
  if (!(AGENT_ROLES as readonly string[]).includes(agent)) {
    ctx.ui.notify(
      `Unknown agent "${agent}". Valid: ${AGENT_ROLES.join(", ")}.`,
      "warning",
    );
    return;
  }
  const load = await loadModelsJson(ctx.cwd);
  if (!load.ok) {
    ctx.ui.notify(
      load.errors.map((e) => e.message).join("\n"),
      "warning",
    );
    return;
  }

  // Read milestone overlay if requested.
  let overlay = null;
  if (args.milestone) {
    try {
      const progressMd = await readFile(
        join(ctx.cwd, ".belmont", "PROGRESS.md"),
        "utf8",
      );
      overlay = parseMilestoneOverlay(progressMd, args.milestone).overlay;
    } catch {
      /* fall through to no overlay */
    }
  }

  const cliParse = parseCliTierFlags(args.tierFlags);
  const resolved = resolveTier(load.data, agent as AgentRole, {
    milestoneOverlay: overlay,
    cliOverrides: cliParse.overrides,
  });
  const scopeTag = args.milestone ? ` (scope: ${args.milestone})` : "";
  const lines = [
    `[belmont:models resolve ${agent}${scopeTag}]`,
    `  tier:     ${resolved.tier}`,
    `  provider: ${resolved.provider}`,
    `  model:    ${resolved.model}`,
    `  thinking: ${resolved.thinking ?? "—"}`,
    `  baseURL:  ${resolved.baseURL ?? "—"}`,
    `  auth:     ${resolved.auth ?? "—"}`,
    `  source:   ${resolved.source}`,
  ];
  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleOverlays(ctx: {
  cwd: string;
  ui: { notify: (text: string, level?: "warning" | "info" | "error") => void };
}): Promise<void> {
  let progressMd: string;
  try {
    progressMd = await readFile(
      join(ctx.cwd, ".belmont", "PROGRESS.md"),
      "utf8",
    );
  } catch {
    ctx.ui.notify(
      "Could not read .belmont/PROGRESS.md. Run `belmont init` first.",
      "warning",
    );
    return;
  }
  const parsed = parseProgress(progressMd);
  const lines: string[] = ["[belmont:models overlays]"];
  let foundAny = false;
  for (const m of parsed.milestones) {
    if (m.overlay === null) continue;
    foundAny = true;
    const ov = parseMilestoneOverlay(progressMd, m.id);
    if (!ov.overlay) {
      lines.push(`  ${m.id}: <overlay present but unparseable>`);
      continue;
    }
    const entries = Object.entries(ov.overlay)
      .map(([agent, v]) => {
        const parts: string[] = [v.tier];
        if (v.provider || v.model) {
          parts.push(`+${v.provider ?? ""}/${v.model ?? ""}`);
        }
        if (v.thinking) parts.push(`:${v.thinking}`);
        if (v.baseURL) parts.push(`@${v.baseURL}`);
        return `${agent}=${parts.join("")}`;
      })
      .join(" ");
    lines.push(`  ${m.id}: ${entries}`);
  }
  if (!foundAny) {
    lines.push("  (no per-milestone overlays in PROGRESS.md)");
  }
  ctx.ui.notify(lines.join("\n"), "info");
}
