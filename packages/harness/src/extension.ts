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
// M4 wiring:
//   - 7 LLM-dispatched skill commands routed via pi.sendUserMessage
//     (status keeps the deterministic M3 renderer; standalone status
//     SKILL.md exists for vanilla CLI hosts) — see commands/skills.ts.
//
// M5 wiring (now):
//   - belmont_transition / belmont_episode_event / belmont_ask_user
//     tools (the harness side of the contract every SKILL.md is
//     written against).
//   - tool_call hook (hooks/knowledge-guard.ts) blocking direct writes
//     to .belmont/PROGRESS.md + knowledge-cap violations with a JSON
//     reason envelope { message, suggestion }.
//   - turn_start / turn_end hook (hooks/scope-guard.ts) snapshotting
//     .belmont/ and reverting unclassified-path / steering-zone /
//     knowledge-deletion mutations.
//
// Future milestones extend this file:
//   - M6: side panel (ctx.ui.custom) + status bar + shortcuts
//   - M7: per-agent tier resolution + provider registration
//   - M8: auto loop wiring + worker message renderer

import type { ExtensionAPI } from "./pi/sdk.js";
import { registerInitCommand } from "./commands/init.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerSkillCommands } from "./commands/skills.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerKnowledgeGuard } from "./hooks/knowledge-guard.js";
import { registerScopeGuard } from "./hooks/scope-guard.js";
import { appendBelmontContext } from "./hooks/system-prompt.js";
import { refreshSnapshot } from "./state/snapshot.js";
import { registerBelmontAskUserTool } from "./tools/belmont-ask-user.js";
import { registerBelmontEpisodeEventTool } from "./tools/belmont-episode-event.js";
import { registerBelmontTransitionTool } from "./tools/belmont-transition.js";

export const belmontExtension = (pi: ExtensionAPI): void => {
  registerStatusCommand(pi);
  registerInitCommand(pi);
  registerModelsCommand(pi);
  registerSkillCommands(pi);

  registerBelmontTransitionTool(pi);
  registerBelmontEpisodeEventTool(pi);
  registerBelmontAskUserTool(pi);

  registerKnowledgeGuard(pi);
  registerScopeGuard(pi);

  pi.on("session_start", async (_event, ctx) => {
    await refreshSnapshot(ctx.cwd);
  });

  pi.on("before_agent_start", async (event, ctx) => appendBelmontContext(event, ctx.cwd));
};

export default belmontExtension;
