// Thinking-collapse context hook — picks up the M6 deferral.
//
// v2.3 §17 M6 P0-4 done-when:
//   "Ctrl+Alt+T toggles thinking-block visibility globally (a session-state
//    flag the message renderer respects)."
//
// M6 wired the FLAG (`isThinkingCollapsed()` in tui/shortcuts.ts +
// status-bar `· thinking-collapse` suffix) but EXPLICITLY deferred the
// content-rewrite to M9 (see tui/shortcuts.ts L25-28 and the M6
// episodic). This file closes that loop.
//
// Mechanism:
//   - Register exactly one `pi.on("context", …)` handler.
//   - On every fire, read the live `isThinkingCollapsed()` flag.
//   - When the flag is OFF: return undefined → no messages mutation.
//   - When the flag is ON: walk `event.messages`, find every
//     AssistantMessage, and for each ThinkingContent block in its
//     content array, replace the `thinking` body string with a
//     short placeholder. The `thinkingSignature` is preserved (it's
//     opaque, encrypted, used by Anthropic interleaved-thinking
//     multi-turn continuity per pi-ai/types.d.ts L151-155 — dropping
//     it would break the next turn's reasoning). `redacted` is
//     preserved for the same reason.
//   - Return `{messages: rewritten}` ONLY when at least one block was
//     actually collapsed (avoids spurious cache invalidation).
//
// D-003 anchor:
//   "The `context` hook is reserved for messages-array pruning. That
//    is the v2.2-era 'interactive context hook' — but its actual role
//    in pi 0.75.5 is the lean-ctx slot (M9 P0-2), not system-prompt
//    wiring. M3 leaves it unregistered."
//
// M9 IS the first registration. v2.3 §11.5 hook-composition order says
// lean-ctx runs first (it may remove entire messages, which thinking-
// collapse then has fewer messages to walk). v1.0 ships WITHOUT lean-
// ctx (see M9 episodic — pi-lean-ctx 3.6.21 pivoted to a CLI-first
// shell-routing surface that directly conflicts with M9's RTK at
// user_bash). When v1.1 adds lean-ctx, the registration order in
// extension.ts will be:
//
//     registerLeanCtxHook(pi);          // ← context, first
//     registerThinkingCollapseHook(pi); // ← context, second
//
// Pi fans handlers in registration order; this ordering is the §11.5
// contract.
//
// Pi-mono lineage (per D-001):
//   - examples/extensions/hidden-thinking-label.ts — pi's built-in
//     hidden-thinking display path uses ctx.ui.setHiddenThinkingLabel()
//     to swap the LABEL of an already-collapsed block. That's a DISPLAY
//     concern (the user can still expand via Ctrl+T). Belmont's
//     thinking-collapse is a TOKEN-REDUCTION concern: we shrink the
//     payload sent to subsequent LLM calls. The two mechanisms are
//     complementary — Belmont could also call setHiddenThinkingLabel
//     in M9.1+ to swap the label when our flag is on, but that's a UI
//     polish, not a contract change.

import { isThinkingCollapsed as defaultIsThinkingCollapsed } from "../tui/shortcuts.js";
import type {
  AgentMessage,
  AssistantMessage,
  ContextEvent,
  ContextEventResult,
  ExtensionAPI,
  ThinkingContent,
} from "../pi/sdk.js";

/** Placeholder body that replaces the original thinking content. Kept
 *  short (under 16 chars including the brackets) so the token saving
 *  is real even for shallow reasoning. */
export const THINKING_COLLAPSED_PLACEHOLDER = "[Thinking]";

/** Pure rewrite — exported for tests. Returns the new messages array
 *  when any thinking block was collapsed; returns `undefined` when the
 *  input was already clean so the caller can short-circuit and avoid
 *  pi's context-cache invalidation. */
export function collapseThinkingInMessages(
  messages: AgentMessage[],
): AgentMessage[] | undefined {
  let changed = false;
  const rewritten = messages.map((msg) => {
    if (!isAssistantMessage(msg)) return msg;
    let messageChanged = false;
    const newContent = msg.content.map((block) => {
      if (block.type !== "thinking") return block;
      const thinking = block as ThinkingContent;
      if (thinking.thinking === THINKING_COLLAPSED_PLACEHOLDER) return block;
      messageChanged = true;
      return {
        ...thinking,
        thinking: THINKING_COLLAPSED_PLACEHOLDER,
      } satisfies ThinkingContent;
    });
    if (!messageChanged) return msg;
    changed = true;
    // Preserve every other field on the AssistantMessage (api, provider,
    // model, responseModel, responseId, diagnostics, usage, stopReason,
    // errorMessage, timestamp) so downstream code that depends on these
    // doesn't see drift.
    return { ...msg, content: newContent } satisfies AssistantMessage;
  });
  return changed ? rewritten : undefined;
}

function isAssistantMessage(msg: AgentMessage): msg is AssistantMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as { role?: unknown }).role === "assistant" &&
    Array.isArray((msg as { content?: unknown }).content)
  );
}

export interface ThinkingCollapseDeps {
  /** Live getter for the Ctrl+Alt+T session-state flag. Production wiring
   *  threads `isThinkingCollapsed` from tui/shortcuts.ts; tests inject
   *  their own to exercise both branches without poking the module's
   *  internal `thinkingCollapsed` boolean. */
  isThinkingCollapsed?: () => boolean;
}

export function registerThinkingCollapseHook(
  pi: ExtensionAPI,
  deps: ThinkingCollapseDeps = {},
): void {
  const isCollapsed = deps.isThinkingCollapsed ?? defaultIsThinkingCollapsed;
  pi.on("context", (event: ContextEvent): ContextEventResult | undefined => {
    if (!isCollapsed()) return undefined;
    const rewritten = collapseThinkingInMessages(event.messages);
    if (rewritten === undefined) return undefined;
    return { messages: rewritten };
  });
}
