// 4-slot status bar — the M6 deliverable.
//
// v2.3 §6.1 status bar layout:
//
//   <project> | <task-id> | <role> | <tier>   ← belmont.task
//   <model> · <thinking> · rtk: -X% (Y saved) ← belmont.model
//   ctx NNk 🟢/🟡/🔴                          ← belmont.ctx
//   $X.XX                                     ← belmont.cost
//
// M6 ships the recompute scaffolding for all four slots. The two slots
// that M6 can populate fully — model and ctx — get real content. The
// task slot shows `<project>` (M7 adds task-id/role/tier on the auto
// path). The cost slot stays empty until M9 lands rtk + cost tracking.
//
// IDEMPOTENT RECOMPUTE. Every refresh path (session_start, turn_end,
// model_select, thinking_level_select, the 1-second ctx poller) calls
// the SAME `recomputeStatusSlots(ctx, opts)` which reads current pi
// state and writes all four slots. No partial mutation, no per-slot
// fast-paths — that's what keeps the trigger fan-out from racing.
//
// Pi-mono lineage (D-001):
//   - `examples/extensions/status-line.ts` — `ctx.ui.setStatus(key, t)`
//     per-key slot model.
//   - `examples/extensions/model-status.ts` — `model_select` hook for
//     refreshing the model slot.
//   - `examples/extensions/border-status-editor.ts` — `getContextUsage`
//     polling pattern (interval-driven refresh).
//   - `examples/extensions/working-indicator.ts` — `setInterval` +
//     `requestRender` cadence.

import { basename } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "../pi/sdk.js";
import {
  type CtxThresholds,
  DEFAULT_CTX_THRESHOLDS,
  formatCtxStatus,
  readCtxThresholds,
} from "./thresholds.js";

export const SLOT_KEYS = {
  task: "belmont.task",
  model: "belmont.model",
  ctx: "belmont.ctx",
  cost: "belmont.cost",
} as const;

export interface StatusBarDeps {
  pi: ExtensionAPI;
  /** Set by tui/shortcuts.ts Ctrl+O toggle. M9 context-hook reads it too. */
  isThinkingCollapsed: () => boolean;
}

// ────────────────────────────────────────────────────────────────────
// Pure slot-string helpers — exported for tests.
// ────────────────────────────────────────────────────────────────────

export function taskSlot(projectName: string): string {
  // M7 will append `| <task-id> | <role> | <tier>` when the auto loop
  // installs an active-task probe (mirrors the `setAutoActiveProbe`
  // contract on PanelController).
  return projectName;
}

export function modelSlot(
  model: { provider: string; id: string } | undefined,
  thinkingLevel: string,
  thinkingCollapsed: boolean,
): string {
  const head = model ? `${model.provider}/${model.id}` : "no model";
  const thinking = thinkingLevel ? thinkingLevel : "off";
  const collapseSuffix = thinkingCollapsed ? " · thinking-collapse" : "";
  // RTK (-X% / Y saved) lands in M9; placeholder omitted to keep the
  // status bar quiet rather than misleading.
  return `${head} · ${thinking}${collapseSuffix}`;
}

export function ctxSlot(
  tokens: number | null,
  thresholds: CtxThresholds = DEFAULT_CTX_THRESHOLDS,
): string {
  return formatCtxStatus(tokens, thresholds);
}

export function costSlot(): string {
  // M9 will populate. Empty string clears the slot per pi's setStatus
  // contract for non-undefined "no content".
  return "";
}

// ────────────────────────────────────────────────────────────────────
// Recompute — idempotent fan-in for every refresh trigger.
// ────────────────────────────────────────────────────────────────────

export interface RecomputeOptions {
  thresholds?: CtxThresholds;
}

export function recomputeStatusSlots(
  ctx: ExtensionContext,
  deps: StatusBarDeps,
  options: RecomputeOptions = {},
): void {
  const thresholds = options.thresholds ?? DEFAULT_CTX_THRESHOLDS;
  const usage = ctx.getContextUsage();
  const tokens = usage?.tokens ?? null;
  const thinkingLevel = deps.pi.getThinkingLevel();
  const model = ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined;
  const projectName = basename(ctx.cwd);

  ctx.ui.setStatus(SLOT_KEYS.task, taskSlot(projectName));
  ctx.ui.setStatus(SLOT_KEYS.model, modelSlot(model, thinkingLevel, deps.isThinkingCollapsed()));
  ctx.ui.setStatus(SLOT_KEYS.ctx, ctxSlot(tokens, thresholds));
  ctx.ui.setStatus(SLOT_KEYS.cost, costSlot());
}

// ────────────────────────────────────────────────────────────────────
// Registration — wires the event handlers + the 1s poller.
// ────────────────────────────────────────────────────────────────────

/** Polling cadence for the ctx slot. 1s is the same heartbeat pi's
 *  border-status-editor uses for its model/ctx footer refresh. */
export const CTX_POLL_INTERVAL_MS = 1000;

export function registerStatusBar(deps: StatusBarDeps): void {
  let interval: ReturnType<typeof setInterval> | undefined;
  let thresholds: CtxThresholds = DEFAULT_CTX_THRESHOLDS;
  let activeCtx: ExtensionContext | undefined;

  const refresh = () => {
    if (!activeCtx) return;
    recomputeStatusSlots(activeCtx, deps, { thresholds });
  };

  deps.pi.on("session_start", async (_event, ctx) => {
    activeCtx = ctx;
    thresholds = await readCtxThresholds(ctx.cwd);
    refresh();
    if (interval) clearInterval(interval);
    interval = setInterval(refresh, CTX_POLL_INTERVAL_MS);
  });

  deps.pi.on("session_shutdown", async () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
    activeCtx = undefined;
  });

  deps.pi.on("turn_end", async (_event, ctx) => {
    activeCtx = ctx;
    refresh();
  });

  deps.pi.on("model_select", async (_event, ctx) => {
    activeCtx = ctx;
    refresh();
  });

  deps.pi.on("thinking_level_select", async (_event, ctx) => {
    activeCtx = ctx;
    refresh();
  });
}
