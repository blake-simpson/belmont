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
//   - tui/shortcuts.ts            — Ctrl+Alt+B/T/R/H global hotkeys (M11 §18
//                                   remapped from the original
//                                   Ctrl+B/O/L; pi 0.75.5 reserves
//                                   those Ctrl letters) + the
//                                   /belmont:auto input watcher that
//                                   auto-opens the panel passively.
//   - tui/widget-progress.ts      — above-editor progress widget
//                                   helpers (M6 P1 stub; M8 wires data).
//   - commands/repl-refresh.ts    — /belmont:repl-refresh that backs
//                                   the Ctrl+Alt+R shortcut's newSession.
//
// M7 wiring (now):
//   - session_start: refresh the models.json snapshot AND, when the
//     file validates, call registerConfiguredProviders so codex/kimi/
//     openai-compatible/ollama become available before the user runs
//     /model or /belmont:auto.
//   - /belmont:repl-refresh (M6 Ctrl+Alt+R) invalidates the snapshot via
//     tiering/snapshot.ts so the next read picks up live edits.
//
// M8 wiring (now):
//   - /belmont:auto + /belmont:steer + /belmont:stop + /belmont:pause +
//     /belmont:resume commands (commands/auto.ts).
//   - belmont.worker message renderer (auto/render.ts) — worker events
//     stream into Runtime A's left pane.
//   - panel.setAutoActiveProbe(isAutoActive) — M6's deliberate install-
//     point: Ctrl+Alt+B-from-active returns to PASSIVE (not closed) while
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
// M10 wiring (now):
//   - mcp/adapter.ts            — registerMcpServers reads
//                                 .belmont/mcp.json, applies the
//                                 §12.3 blast-radius gate
//                                 (BELMONT_AUTO_MODE-aware), warms
//                                 the §12.4 tools cache, registers
//                                 each MCP tool as
//                                 `mcp__<server>__<tool>`.
//   - commands/mcp.ts           — /belmont:mcp doctor + refresh.
//   - auto/loop.ts              — sets BELMONT_AUTO_MODE=1 around
//                                 runAuto so subsequent session_starts
//                                 trigger the auto:true filter.
//
// Future milestones extend this file:
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
import { registerMcpCommand } from "./commands/mcp.js";
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
import { registerMcpServers } from "./mcp/index.js";
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
  registerMcpCommand(pi);

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
  // M8 install: when auto is running, Ctrl+Alt+B-from-active returns to
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
    // Pre-prime the panel's parse cache so the first Ctrl+Alt+B opens
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

    // M10 §12: read .belmont/mcp.json, apply the §12.3 blast-radius
    // gate (process.env.BELMONT_AUTO_MODE is the signal — set by
    // auto/loop.ts around runAuto), warm the §12.4 tools cache, and
    // register each MCP tool as `mcp__<server>__<tool>`. Failure of a
    // single server doesn't poison the bridge — graceful degrade per
    // §17 M10 done-when. A user with no mcp.json sees nothing extra.
    try {
      const mcp = await registerMcpServers(pi, ctx.cwd);
      const failed = Object.entries(mcp.results).filter(([, r]) => r.kind === "failed");
      if (failed.length > 0) {
        const summary = failed
          .map(([n, r]) => `${n}: ${r.kind === "failed" ? r.reason : ""}`)
          .join("; ");
        ctx.ui.notify(`MCP: ${failed.length} server(s) failed — ${summary}`, "warning");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`MCP registration error: ${msg}`, "warning");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => appendBelmontContext(event, ctx.cwd));
};

export default belmontExtension;
