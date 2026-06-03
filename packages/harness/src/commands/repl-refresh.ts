// /belmont:repl-refresh — the receiving end of the Ctrl+Alt+R shortcut.
//
// pi 0.75.5's `pi.registerShortcut` handler signature gives the
// callback an `ExtensionContext` (not the wider `ExtensionCommandContext`),
// so it cannot call `ctx.newSession()` directly. The Ctrl+Alt+R shortcut in
// tui/shortcuts.ts queues `/belmont:repl-refresh` as a follow-up user
// message; this command handler — which DOES receive the command
// context — invokes `newSession()` to refresh the REPL.
//
// v2.3 §17 M6 "Done when":
//   - `Ctrl+Alt+R` runs `runtime.session.newSession()` on Runtime A
//     (manual REPL context refresh).
//
// Pi-mono lineage (D-001):
//   - `examples/extensions/reload-runtime.ts` — the
//     `pi.sendUserMessage("/foo", { deliverAs: "followUp" })` →
//     command-with-ExtensionCommandContext → `ctx.reload()` pattern.
//     We adapt that same indirection for `ctx.newSession()`.

import type { ExtensionAPI } from "../pi/sdk.js";
import { resetRtkStats } from "../state/rtk-stats.js";
import { invalidateModelsJsonSnapshot } from "../tiering/snapshot.js";

export function registerReplRefreshCommand(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:repl-refresh", {
    description: "Refresh the Belmont REPL (start a new session, keep extensions)",
    handler: async (_args, ctx) => {
      // M7: invalidate the models.json snapshot so the next read picks
      // up edits the user made mid-session. The next /belmont:models
      // (or auto-loop tier resolution at M8) will hit the file again.
      invalidateModelsJsonSnapshot();
      // M9 §11.4: per-session RTK counter resets on Ctrl+Alt+R. The next
      // status-bar recompute will see getRtkSummary() === undefined and
      // drop the `· rtk: …` suffix until new commands accumulate.
      resetRtkStats();
      const result = await ctx.newSession();
      if (result.cancelled) {
        ctx.ui.notify("REPL refresh cancelled.", "warning");
        return;
      }
      ctx.ui.notify("REPL refreshed.", "info");
    },
  });
}
