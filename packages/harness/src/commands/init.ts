// /belmont:init — scaffold .belmont/ from inside the running REPL, then
// run the boot doctor. Shares scaffoldBelmontDir + runModelsDoctor with
// the CLI `belmont init` subcommand. Refuses to overwrite an existing
// .belmont/; refreshes the prompt-hook snapshot after scaffolding so
// the next agent turn picks up BELMONT.md + preferences.md without a
// manual /reload.

import type { ExtensionAPI } from "../pi/sdk.js";
import { scaffoldBelmontDir } from "../init/scaffold.js";
import { refreshSnapshot } from "../state/snapshot.js";
import { formatDoctorReport, runModelsDoctor } from "../tiering/doctor.js";

export function registerInitCommand(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:init", {
    description: "Scaffold .belmont/ in the current project and run the boot doctor",
    handler: async (_args, ctx) => {
      const result = await scaffoldBelmontDir(ctx.cwd);
      if (!result.scaffolded) {
        ctx.ui.notify(
          `.belmont/ already exists at ${ctx.cwd}. Refusing to overwrite. Inspect or delete it manually first.`,
          "warning",
        );
        return;
      }
      ctx.ui.notify(
        `Scaffolded .belmont/ with ${result.created.length} files: ${result.created.join(", ")}`,
        "info",
      );

      await refreshSnapshot(ctx.cwd);

      // M7: pass the live ModelRegistry from ctx so the doctor's
      // subscription-tier reachability check runs for real (per
      // §9.6 — credentials-on-disk check, no network probe).
      const doctor = await runModelsDoctor(ctx.cwd, {
        modelRegistry: ctx.modelRegistry,
      });
      ctx.ui.notify(
        formatDoctorReport(doctor),
        doctor.hardFail ? "error" : "info",
      );
      if (doctor.hardFail) {
        ctx.ui.notify(
          "Boot doctor reports zero reachable tiers. Fix the recovery commands above before running `/belmont:auto`.",
          "error",
        );
      }
    },
  });
}
