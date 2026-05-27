// State → coloured PROGRESS marker.
//
// v2.3 §17 M6 "Done when" locks the colour mapping:
//
//   green [v], yellow [>], red [!], grey [ ], white [x]
//
// We bind to pi's `Theme.fg(color, text)` interface — pi exposes the
// theme via `ctx.ui.theme` — so the actual ANSI escape sequence comes
// from the user's selected pi theme rather than being hard-coded here.
// Tests stub the colorer interface; only the colour name (success /
// warning / error / dim / text) is asserted, not the raw escape codes.
//
// The mapping lives here, OUTSIDE tui/panel.ts, so future renderers
// (the M11 author-smoke text output, the M8 worker-stream renderer
// when it echoes phase markers, etc.) can reuse the same five colours
// instead of inventing parallel mappings.
//
// Pi-mono lineage (D-001): the colour-via-theme pattern is the same one
// `examples/extensions/border-status-editor.ts` uses for its bottom-bar
// model/thinking labels.

import type { TaskState } from "@belmont/knowledge-schema";

/** Subset of pi's ThemeColor enum that markers.ts needs. */
export type MarkerColor = "success" | "warning" | "error" | "dim" | "text";

/** Minimal pi-Theme-shaped interface — `theme.fg(color, text)`. */
export interface MarkerColorer {
  fg(color: MarkerColor, text: string): string;
}

/** Pass-through colorer used by tests + fallback paths where no theme is bound. */
export const noopColorer: MarkerColorer = {
  fg: (_color, text) => text,
};

const STATE_TO_RAW: Record<TaskState, string> = {
  todo: "[ ]",
  in_progress: "[>]",
  done: "[x]",
  verified: "[v]",
  blocked: "[!]",
};

const STATE_TO_COLOR: Record<TaskState, MarkerColor> = {
  verified: "success",
  in_progress: "warning",
  blocked: "error",
  todo: "dim",
  done: "text",
};

/** Return the coloured 3-char marker (e.g. `"\x1b[…m[v]\x1b[…m"`). */
export function colorMarker(colorer: MarkerColorer, state: TaskState): string {
  const raw = STATE_TO_RAW[state];
  const color = STATE_TO_COLOR[state];
  return colorer.fg(color, raw);
}

/** Plain (no-ANSI) marker, for non-TTY output paths. */
export function plainMarker(state: TaskState): string {
  return STATE_TO_RAW[state];
}

/** Inverse mapping useful in tests + callers that want the colour name. */
export function markerColorFor(state: TaskState): MarkerColor {
  return STATE_TO_COLOR[state];
}
