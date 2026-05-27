// Global hotkeys — the M6 deliverable.
//
// v2.3 §17 M6 "Done when":
//   - Ctrl+B opens/toggles the panel
//   - Ctrl+O toggles thinking-block visibility globally (a session-
//     state flag the message renderer respects)
//   - Ctrl+L runs `ctx.newSession()` on Runtime A (manual REPL refresh)
//
// In-panel keys (j/k/Enter/a/v/Esc) live on the PanelComponent in
// tui/panel.ts — they're NOT pi.registerShortcut bindings, because
// pi-tui's overlay system routes input to the focused overlay's
// Component.handleInput. That keeps in-panel keys scoped to the
// panel; the three Ctrl+_ bindings here are the only *global* ones.
//
// Ctrl+L plumbing: pi.registerShortcut hands the handler an
// ExtensionContext (NOT an ExtensionCommandContext), so we cannot call
// `ctx.newSession()` from the shortcut directly. Instead, the
// shortcut sends `/belmont:repl-refresh` as a follow-up user message;
// the matching command (`commands/repl-refresh.ts`) receives an
// ExtensionCommandContext and invokes `ctx.newSession()` there. This is
// the same indirection pi's own `examples/extensions/reload-runtime.ts`
// uses for its `reload_runtime` tool → `/reload-runtime` command chain.
//
// Ctrl+O wires only the FLAG today; the corresponding context-hook
// that actually collapses thinking blocks lands in M9 alongside the
// lean-ctx integration. The status bar's `belmont.model` slot reflects
// the flag immediately (suffix `· thinking-collapse`) so the user gets
// visual confirmation the toggle fired.
//
// Pi-mono lineage (D-001):
//   - `examples/extensions/reload-runtime.ts` — the shortcut →
//     sendUserMessage("/foo", { deliverAs: "followUp" }) → command
//     → ctx.reload() / ctx.newSession() chain.
//   - `examples/extensions/hidden-thinking-label.ts` — the
//     `setHiddenThinkingLabel` API the M9 hook will use when the
//     flag is on.

import type { ExtensionAPI, ExtensionContext } from "../pi/sdk.js";
import type { PanelController } from "./panel.js";

/** Lives at module scope so status-bar.ts can read it via the getter
 *  passed to registerStatusBar. */
let thinkingCollapsed = false;

export function isThinkingCollapsed(): boolean {
  return thinkingCollapsed;
}

/** Test-only reset. */
export function resetThinkingCollapseFlag(): void {
  thinkingCollapsed = false;
}

export interface ShortcutDeps {
  pi: ExtensionAPI;
  panel: PanelController;
  /** Called after Ctrl+O flips the flag — typically `() => recomputeStatusSlots(...)`. */
  onThinkingFlagChange: (ctx: ExtensionContext) => void;
}

export function registerShortcuts(deps: ShortcutDeps): void {
  const { pi, panel, onThinkingFlagChange } = deps;

  pi.registerShortcut("ctrl+b", {
    description: "Toggle the Belmont side panel",
    handler: async (ctx) => {
      await panel.toggle(ctx);
    },
  });

  pi.registerShortcut("ctrl+o", {
    description: "Toggle thinking-block collapse (session-state flag)",
    handler: (ctx) => {
      thinkingCollapsed = !thinkingCollapsed;
      ctx.ui.notify(
        thinkingCollapsed
          ? "Thinking blocks collapsed (M9 context hook will enforce; status bar reflects now)."
          : "Thinking blocks shown in full.",
        "info",
      );
      onThinkingFlagChange(ctx);
    },
  });

  pi.registerShortcut("ctrl+l", {
    description: "Refresh the Belmont REPL (ctx.newSession on Runtime A)",
    handler: () => {
      pi.sendUserMessage("/belmont:repl-refresh", { deliverAs: "followUp" });
    },
  });
}

/** Wire the input watcher that auto-opens the panel passively when the
 *  user types `/belmont:auto …`. M6 P0-5. */
export function registerAutoOpenWatcher(pi: ExtensionAPI, panel: PanelController): void {
  const AUTO_RE = /^\s*\/belmont:auto(\s|$)/;
  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive") return;
    if (AUTO_RE.test(event.text)) {
      await panel.openPassive(ctx);
    }
  });
}
