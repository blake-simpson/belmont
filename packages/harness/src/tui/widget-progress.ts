// Above-editor auto-progress widget — M6 P1 stub, M8 wires the live data.
//
// v2.3 §6.1 widget format (verbatim):
//
//   M2 ▰▰▰▱▱ 3/5 · current: P1-1 (impl) · tier: high+sonnet · steerable
//
// The widget renders as a single line above the editor when an auto
// loop is active. M6 lands the call sites (`setAutoProgressWidget` +
// `clearAutoProgressWidget`); M8 will start invoking them from the
// auto loop's per-task transitions.
//
// Pi-mono lineage (D-001): `examples/extensions/widget-placement.ts`
// for the `ctx.ui.setWidget(key, content, { placement })` placement
// model.

import type { ExtensionContext } from "../pi/sdk.js";

export const AUTO_WIDGET_KEY = "belmont.auto";

export interface AutoProgressSnapshot {
  milestoneId: string;
  /** Tasks completed in the current milestone (verified). */
  completed: number;
  /** Total tasks in the current milestone. */
  total: number;
  /** ID of the task currently in flight, or undefined when between tasks. */
  currentTaskId?: string;
  /** Role label — implement / verify / etc. */
  role?: string;
  /** Resolved tier label — e.g. "high+sonnet". */
  tier?: string;
  /** Whether the user can /belmont:steer mid-task right now. */
  steerable?: boolean;
}

const BAR_SLOTS = 5;

/** Render the §6.1 progress line. Exported so M8 + tests can assert on it. */
export function formatAutoWidget(snapshot: AutoProgressSnapshot): string {
  const filled = snapshot.total > 0
    ? Math.min(BAR_SLOTS, Math.round((snapshot.completed / snapshot.total) * BAR_SLOTS))
    : 0;
  const bar = "▰".repeat(filled) + "▱".repeat(BAR_SLOTS - filled);
  const parts: string[] = [
    `${snapshot.milestoneId} ${bar} ${snapshot.completed}/${snapshot.total}`,
  ];
  if (snapshot.currentTaskId) {
    const role = snapshot.role ? ` (${snapshot.role})` : "";
    parts.push(`current: ${snapshot.currentTaskId}${role}`);
  }
  if (snapshot.tier) parts.push(`tier: ${snapshot.tier}`);
  if (snapshot.steerable) parts.push("steerable");
  return parts.join(" · ");
}

/** M8 will call this from the auto loop's per-task transitions. */
export function setAutoProgressWidget(ctx: ExtensionContext, snapshot: AutoProgressSnapshot): void {
  ctx.ui.setWidget(AUTO_WIDGET_KEY, [formatAutoWidget(snapshot)], { placement: "aboveEditor" });
}

/** Called when the auto loop ends — clears the widget. */
export function clearAutoProgressWidget(ctx: ExtensionContext): void {
  ctx.ui.setWidget(AUTO_WIDGET_KEY, undefined);
}
