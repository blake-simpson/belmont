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
// M8 wiring (now):
//   - /belmont:auto + /belmont:steer + /belmont:stop + /belmont:pause +
//     /belmont:resume commands (commands/auto.ts).
//   - belmont.worker message renderer (auto/render.ts) — worker events
//     stream into Runtime A's left pane.
//   - panel.setAutoActiveProbe(isAutoActive) — M6's deliberate install-
//     point: Ctrl+B-from-active returns to PASSIVE (not closed) while
//     auto is running.
//
// M9 wiring (now):
//   - hooks/rtk-bash.ts            — user_bash → BashOperations wrapper
//                                    that prepends `rtk ` to the user's
//                                    shell command + parses gain
//                                    trailers into state/rtk-stats.ts.
//   - hooks/thinking-collapse.ts   — context hook that walks
//                                    event.messages and blanks
//                                    AssistantMessage thinking blocks
//                                    when isThinkingCollapsed()===true
//                                    (preserves thinkingSignature for
//                                    multi-turn continuity).
//   - hooks/session-before-compact.ts — observer that writes a compact
//                                    episodic entry before pi
//                                    compacts; returns undefined so
//                                    pi's default compaction runs.
//   - cli/rtk-detect.ts            — startup `which rtk` probe with
//                                    warn-once on missing.
//
// M9 deliberately DOES NOT register a pi-lean-ctx context hook. The
// M0 spike verdict was GO partial, but pi-lean-ctx 3.6.21 pivoted to a
// CLI-first shell-routing surface that directly conflicts with M9's
// RTK at user_bash, AND the package distribution requires a Rust
// binary on PATH — hostile to v1.0's npm-only install path. The full
// rationale is recorded in .belmont/memory/episodic/2026-05-27-m9-
// rtk-and-token-reduction.md. When v1.1 picks lean-ctx back up, the
// composition order per §11.5 is:
//
//     registerLeanCtxHook(pi);          // ← context, first
//     registerThinkingCollapseHook(pi); // ← context, second
//
// Future milestones extend this file:
//   - M10: MCP bridge (.belmont/mcp.json + blast-radius gate).
//   - M11: distribution + smoke + ship.

import type { ExtensionAPI } from "./pi/sdk.js";
import { isAutoActive } from "./auto/loop.js";
import { registerWorkerRenderer } from "./auto/render.js";
import {
  consumeMissingRtkWarning,
  detectRtk,
  rtkWarningMessage,
} from "./cli/rtk-detect.js";
import { registerAutoCommands } from "./commands/auto.js";
import { registerInitCommand } from "./commands/init.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerReplRefreshCommand } from "./commands/repl-refresh.js";
import { registerSkillCommands } from "./commands/skills.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerKnowledgeGuard } from "./hooks/knowledge-guard.js";
import { registerRtkBashHook } from "./hooks/rtk-bash.js";
import { registerScopeGuard } from "./hooks/scope-guard.js";
import { registerSessionBeforeCompactHook } from "./hooks/session-before-compact.js";
import { appendBelmontContext } from "./hooks/system-prompt.js";
import { registerThinkingCollapseHook } from "./hooks/thinking-collapse.js";
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
  registerAutoCommands(pi);

  registerBelmontTransitionTool(pi);
  registerBelmontEpisodeEventTool(pi);
  registerBelmontAskUserTool(pi);

  registerKnowledgeGuard(pi);
  registerScopeGuard(pi);

  // ── M9 hooks ──────────────────────────────────────────────────────
  // Order matters for `context` handlers — pi fans them in registration
  // order. v1.1 lean-ctx will register BEFORE thinking-collapse per
  // §11.5 (it may delete entire messages; thinking-collapse then
  // touches fewer). M9 has only the one context handler.
  registerThinkingCollapseHook(pi);
  // RTK user_bash wrapper. Hook always installs; the handler short-
  // circuits when rtk is not on PATH or BELMONT_RTK_DISABLE=1, so the
  // boundary is the rtk-detect cache, not the registration.
  registerRtkBashHook(pi);
  // Compaction observer — writes an episodic snapshot then returns
  // undefined so pi's default compaction proceeds.
  registerSessionBeforeCompactHook(pi);

  // ── M8 worker renderer ────────────────────────────────────────────
  // belmont.worker messages stream from the auto loop into Runtime A's
  // pane via a custom MessageRenderer.
  registerWorkerRenderer(pi);

  // ── M6 TUI ────────────────────────────────────────────────────────
  const panel = new PanelController({
    sendUserMessage: (content, options) => pi.sendUserMessage(content, options),
  });
  // M8 install: when auto is running, Ctrl+B-from-active returns to
  // PASSIVE (REPL retains focus) instead of closing the panel.
  panel.setAutoActiveProbe(() => isAutoActive());

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

    // M9 §11.3: warn ONCE at startup if rtk is missing/disabled.
    // Subsequent session_start fires (reload/new/resume/fork) re-prime
    // pi state but do not re-warn — consumeMissingRtkWarning() flips
    // its single-shot flag on first call. Pi-mono pattern of attaching
    // session-scoped notices to session_start is the same as the M7
    // models-doctor warning surface (commands/models.ts).
    if (consumeMissingRtkWarning()) {
      ctx.ui.notify(rtkWarningMessage(detectRtk()), "warning");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => appendBelmontContext(event, ctx.cwd));
};

export default belmontExtension;
