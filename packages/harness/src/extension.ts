// The Belmont harness extension factory. `pi.main()` calls this once
// per process with the live ExtensionAPI; we register commands and
// event handlers here. Types come exclusively via ./pi/sdk.js so the
// pi-boundary lint stays clean for this file (it sits outside src/pi/).
//
// M3 wiring:
//   - session_start  : refresh the BELMONT.md/preferences.md snapshot
//   - before_agent_start: append .belmont/BELMONT.md + preferences.md
//                         to the system prompt (D-003: single hook
//                         covers both interactive + auto in pi 0.75.5)
//   - /belmont:status, /belmont:init, /belmont:models  (doctor subcmd)
//
// Future milestones extend this file:
//   - M4: more slash commands for the 8 skills
//   - M5: belmont_transition tool + tool_call/turn_start/turn_end hooks
//   - M6: side panel (ctx.ui.custom) + status bar + shortcuts
//   - M7: per-agent tier resolution + provider registration
//   - M8: auto loop wiring + worker message renderer

import type { ExtensionAPI } from "./pi/sdk.js";
import { registerInitCommand } from "./commands/init.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerStatusCommand } from "./commands/status.js";
import { appendBelmontContext } from "./hooks/system-prompt.js";
import { refreshSnapshot } from "./state/snapshot.js";

export const belmontExtension = (pi: ExtensionAPI): void => {
  registerStatusCommand(pi);
  registerInitCommand(pi);
  registerModelsCommand(pi);

  pi.on("session_start", async (_event, ctx) => {
    await refreshSnapshot(ctx.cwd);
  });

  pi.on("before_agent_start", async (event, ctx) => appendBelmontContext(event, ctx.cwd));
};

export default belmontExtension;
