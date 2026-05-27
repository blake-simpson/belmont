// Global hotkeys — the M6 deliverable.
//
// v2.3 §17 M6 "Done when":
//   - Alt+B opens/toggles the panel
//   - Alt+T toggles thinking-block visibility globally (a session-
//     state flag the message renderer respects)
//   - Alt+R runs `ctx.newSession()` on Runtime A (manual REPL refresh)
//
// **Hotkey history (M11 §18 fix).** The original M6 bindings were
// `Ctrl+B / Ctrl+O / Ctrl+L` (mirroring tmux + a few common TUIs).
// Pi 0.75.5 has since baked in Ctrl+O (`app.tools.expand`), Ctrl+L
// (`app.model.select`), Ctrl+T (`app.thinking.toggle`), and Ctrl+B
// (`tui.editor.cursorLeft`) — three of those swallow our handlers
// outright (registerShortcut → "skipped"), and Ctrl+B "wins" only by
// stealing pi's editor cursor-left. The M11 ship-gate dogfood
// surfaced the warnings; we remapped to `alt+` prefix per Blake's
// pick — the alt-prefix space is free in pi 0.75.5 and conventional
// in TUIs.
//
// In-panel keys (j/k/Enter/a/v/Esc) live on the PanelComponent in
// tui/panel.ts — they're NOT pi.registerShortcut bindings, because
// pi-tui's overlay system routes input to the focused overlay's
// Component.handleInput. That keeps in-panel keys scoped to the
// panel; the three Alt+_ bindings here are the only *global* ones.
//
// Alt+R plumbing: pi.registerShortcut hands the handler an
// ExtensionContext (NOT an ExtensionCommandContext), so we cannot call
// `ctx.newSession()` from the shortcut directly. Instead, the
// shortcut sends `/belmont:repl-refresh` as a follow-up user message;
// the matching command (`commands/repl-refresh.ts`) receives an
// ExtensionCommandContext and invokes `ctx.newSession()` there. This is
// the same indirection pi's own `examples/extensions/reload-runtime.ts`
// uses for its `reload_runtime` tool → `/reload-runtime` command chain.
//
// Alt+T wires only the FLAG today; the M9 context-hook
// (`hooks/thinking-collapse.ts`) reads `isThinkingCollapsed()` to
// actually blank thinking blocks. The status bar's `belmont.model`
// slot reflects the flag immediately (suffix `· thinking-collapse`)
// so the user gets visual confirmation the toggle fired.
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
  /** Called after Alt+T flips the flag — typically `() => recomputeStatusSlots(...)`. */
  onThinkingFlagChange: (ctx: ExtensionContext) => void;
}

export function registerShortcuts(deps: ShortcutDeps): void {
  const { pi, panel, onThinkingFlagChange } = deps;

  pi.registerShortcut("alt+b", {
    description: "Toggle the Belmont side panel",
    handler: async (ctx) => {
      await panel.toggle(ctx);
    },
  });

  pi.registerShortcut("alt+t", {
    description: "Toggle thinking-block collapse (session-state flag)",
    handler: (ctx) => {
      thinkingCollapsed = !thinkingCollapsed;
      ctx.ui.notify(
        thinkingCollapsed
          ? "Thinking blocks collapsed (M9 context hook enforces; status bar reflects now)."
          : "Thinking blocks shown in full.",
        "info",
      );
      onThinkingFlagChange(ctx);
    },
  });

  pi.registerShortcut("alt+r", {
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
