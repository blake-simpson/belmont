// /belmont:models doctor — surface the boot doctor result on demand
// inside the REPL. M3 stub: subscription tiers report `[STUB]`, local
// tiers are probed. M7 lands per-agent tier resolution + per-milestone
// overlay introspection (`--milestone M3`).

import type { ExtensionAPI } from "../pi/sdk.js";
import { formatDoctorReport, runModelsDoctor } from "../tiering/doctor.js";

export function registerModelsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:models", {
    description: "Inspect Belmont's model tier configuration (M3: `doctor` subcommand only)",
    getArgumentCompletions: (prefix) => {
      const subs = ["doctor"];
      const filtered = subs.filter((s) => s.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      const sub = args.trim().split(/\s+/)[0] ?? "";
      if (sub !== "doctor") {
        ctx.ui.notify(
          "Usage: /belmont:models doctor (M3 stub; full subcommand surface lands at M7)",
          "warning",
        );
        return;
      }
      const doctor = await runModelsDoctor(ctx.cwd);
      ctx.ui.notify(formatDoctorReport(doctor), doctor.hardFail ? "warning" : "info");
    },
  });
}
