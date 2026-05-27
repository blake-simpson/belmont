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
// M5 wiring:
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
// M6 wiring (now):
//   - tui/panel.ts                — side panel (ctx.ui.custom overlay)
//                                   with j/k/Enter/a/v/Esc keymap.
//   - tui/status-bar.ts           — 4-slot status bar +
//                                   1s ctx-usage polling.
//   - tui/shortcuts.ts            — Ctrl+B/O/L global hotkeys + the
//                                   /belmont:auto input watcher that
//                                   auto-opens the panel passively.
//   - tui/widget-progress.ts      — above-editor progress widget
//                                   helpers (M6 P1 stub; M8 wires data).
//   - commands/repl-refresh.ts    — /belmont:repl-refresh that backs
//                                   the Ctrl+L shortcut's newSession.
//
// M7 wiring (now):
//   - session_start: refresh the models.json snapshot AND, when the
//     file validates, call registerConfiguredProviders so codex/kimi/
//     openai-compatible/ollama become available before the user runs
//     /model or /belmont:auto.
//   - /belmont:repl-refresh (M6 Ctrl+L) invalidates the snapshot via
//     tiering/snapshot.ts so the next read picks up live edits.
//
// Future milestones extend this file:
//   - M8: auto loop wiring + worker message renderer + autoActive
//         probe install onto the PanelController.

import type { ExtensionAPI } from "./pi/sdk.js";
import { registerInitCommand } from "./commands/init.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerReplRefreshCommand } from "./commands/repl-refresh.js";
import { registerSkillCommands } from "./commands/skills.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerKnowledgeGuard } from "./hooks/knowledge-guard.js";
import { registerScopeGuard } from "./hooks/scope-guard.js";
import { appendBelmontContext } from "./hooks/system-prompt.js";
import { refreshSnapshot } from "./state/snapshot.js";
import { registerConfiguredProviders } from "./tiering/providers.js";
import { refreshModelsJsonSnapshot } from "./tiering/snapshot.js";
import { registerBelmontAskUserTool } from "./tools/belmont-ask-user.js";
import { registerBelmontEpisodeEventTool } from "./tools/belmont-episode-event.js";
import { registerBelmontTransitionTool } from "./tools/belmont-transition.js";
import { PanelController } from "./tui/panel.js";
import {
  isThinkingCollapsed,
  registerAutoOpenWatcher,
  registerShortcuts,
} from "./tui/shortcuts.js";
import { recomputeStatusSlots, registerStatusBar } from "./tui/status-bar.js";

export const belmontExtension = (pi: ExtensionAPI): void => {
  registerStatusCommand(pi);
  registerInitCommand(pi);
  registerModelsCommand(pi);
  registerSkillCommands(pi);
  registerReplRefreshCommand(pi);

  registerBelmontTransitionTool(pi);
  registerBelmontEpisodeEventTool(pi);
  registerBelmontAskUserTool(pi);

  registerKnowledgeGuard(pi);
  registerScopeGuard(pi);

  // ── M6 TUI ────────────────────────────────────────────────────────
  const panel = new PanelController({
    sendUserMessage: (content, options) => pi.sendUserMessage(content, options),
  });

  const statusBarDeps = {
    pi,
    isThinkingCollapsed,
  };
  registerStatusBar(statusBarDeps);

  registerShortcuts({
    pi,
    panel,
    onThinkingFlagChange: (ctx) => {
      // Push the new flag value through the same idempotent recompute
      // path used by every other refresh trigger.
      recomputeStatusSlots(ctx, statusBarDeps);
    },
  });

  registerAutoOpenWatcher(pi, panel);

  // Re-parse PROGRESS.md after every turn so a `belmont_transition`
  // mutation in the closing turn shows up on the panel without the
  // user needing to manually refresh. The scope-guard's turn_end hook
  // is already registered upstream; pi fans turn_end to every handler.
  pi.on("turn_end", async (_event, ctx) => {
    await panel.refresh(ctx.cwd);
  });

  pi.on("session_start", async (_event, ctx) => {
    await refreshSnapshot(ctx.cwd);
    // Pre-prime the panel's parse cache so the first Ctrl+B opens
    // without an empty flash.
    await panel.refresh(ctx.cwd);

    // M7: load + cache the models.json snapshot and register any
    // custom providers it names. Silently no-op when models.json is
    // missing or invalid — the doctor surfaces those at /belmont:init
    // and /belmont:models doctor time; this hook just keeps the cache
    // warm for the M8 auto loop's hot-path resolveTier calls.
    const snapshot = await refreshModelsJsonSnapshot(ctx.cwd);
    if (snapshot.ok) {
      registerConfiguredProviders(pi, snapshot.data, ctx.modelRegistry);
    }
  });

  pi.on("before_agent_start", async (event, ctx) => appendBelmontContext(event, ctx.cwd));
};

export default belmontExtension;
