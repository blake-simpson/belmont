// commands/auto.ts — the §7.2 user-facing slash commands:
//
//   /belmont:auto <M> [--tier <agent>=<value> [--tier ...]]
//   /belmont:steer <text>
//   /belmont:stop
//   /belmont:pause
//   /belmont:resume
//
// Each command is a thin shim: parse args → mutate the singleton in
// auto/loop.ts (via getActiveAuto + writeSteeringFile + writeAutoStop)
// → notify the user. The actual auto loop is launched by /belmont:auto
// (via `runAuto`); the other four commands speak to a loop already
// running.
//
// CLI tier-flag grammar reuses the M7 parser (parseCliTierFlags) —
// `--tier implementation=high+anthropic/claude-sonnet-4-6 --tier
// verification=medium`. Multiple flags merge with right-bias.

import type { ExtensionAPI } from "../pi/sdk.js";
import { runAuto, getActiveAuto } from "../auto/loop.js";
import { parseCliTierFlags } from "../tiering/cli-flag.js";
import { writeSteeringFile } from "../auto/steering.js";
import { writeAutoStop } from "../state/auto-json.js";

// ────────────────────────────────────────────────────────────────────
// Arg parsing
// ────────────────────────────────────────────────────────────────────

export type ParsedAutoArgs = {
  milestoneId?: string;
  tierFlags: string[];
};

export function parseAutoArgs(args: string): ParsedAutoArgs {
  const out: ParsedAutoArgs = { tierFlags: [] };
  const tokens = args.split(/\s+/).filter((t) => t.length > 0);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok === "--tier") {
      const next = tokens[i + 1];
      if (next && !next.startsWith("--")) {
        out.tierFlags.push(next);
        i += 1;
      }
      continue;
    }
    if (tok.startsWith("--tier=")) {
      out.tierFlags.push(tok.slice("--tier=".length));
      continue;
    }
    if (!out.milestoneId && /^M\d+$/.test(tok)) {
      out.milestoneId = tok;
      continue;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────────────

export function registerAutoCommands(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:auto", {
    description: "Run Belmont in auto mode for a milestone — /belmont:auto M2 [--tier role=value]",
    handler: async (args, ctx) => {
      const parsed = parseAutoArgs(args);
      const tierResult = parseCliTierFlags(parsed.tierFlags);
      if (tierResult.warnings.length > 0) {
        ctx.ui.notify(
          `--tier flag warnings:\n${tierResult.warnings.map((w) => `  - ${w.message}`).join("\n")}`,
          "warning",
        );
      }
      const scope = parsed.milestoneId
        ? ({ kind: "milestone", milestoneId: parsed.milestoneId } as const)
        : ({ kind: "all" } as const);
      await runAuto({
        ctx,
        pi,
        scope,
        cliOverrides: tierResult.overrides,
      });
    },
  });

  pi.registerCommand("belmont:steer", {
    description: "Inject a steering message for the next auto iteration",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) {
        ctx.ui.notify("Usage: /belmont:steer <text>", "error");
        return;
      }
      await writeSteeringFile(ctx.cwd, text);
      ctx.ui.notify(
        `Steering queued (${text.length} chars). Consumed before the next sub-session.`,
        "info",
      );
    },
  });

  pi.registerCommand("belmont:stop", {
    description: "Halt the auto loop cleanly after the current task",
    handler: async (_args, ctx) => {
      const active = getActiveAuto();
      if (active) active.stopRequested = true;
      await writeAutoStop(ctx.cwd);
      ctx.ui.notify("Stop requested. Auto will halt after the current task.", "info");
    },
  });

  pi.registerCommand("belmont:pause", {
    description: "Pause the auto loop after the current sub-session",
    handler: async (_args, ctx) => {
      const active = getActiveAuto();
      if (!active) {
        ctx.ui.notify("No auto loop is running.", "warning");
        return;
      }
      active.paused = true;
      ctx.ui.notify("Auto paused. /belmont:resume to continue.", "info");
    },
  });

  pi.registerCommand("belmont:resume", {
    description: "Resume a paused auto loop",
    handler: async (_args, ctx) => {
      const active = getActiveAuto();
      if (!active) {
        ctx.ui.notify("No auto loop is running.", "warning");
        return;
      }
      if (!active.paused) {
        ctx.ui.notify("Auto is not paused.", "info");
        return;
      }
      active.paused = false;
      ctx.ui.notify("Auto resumed.", "info");
    },
  });
}
