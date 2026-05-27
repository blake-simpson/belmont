// auto/render.ts — `belmont.worker` message renderer + delivery.
//
// v2.3 §6.3 maps "Streaming worker output" to
// `pi.registerMessageRenderer("belmont.worker", …)`. M8 wires the
// renderer here and exposes the `emitWorkerMessage(pi, payload)` helper
// the auto loop's per-event hook uses to push Belmont-shaped events
// into Runtime A's scroll buffer.
//
// User chose (Session 8 plan): "stream every text_delta — proxy all
// message_update events into Runtime A." We honour the spirit by
// emitting one custom message per assistant `message_end` (the
// accumulated text — no deltas are dropped, just batched at the message
// boundary so the renderer doesn't get hammered with 1000 partial
// updates per turn). Tool calls + outcomes ride as their own
// `belmont.worker` messages so the panel marker flips line up visually.
//
// pi-mono lineage (D-001):
//   - examples/extensions/message-renderer.ts — the canonical pattern:
//     `pi.registerMessageRenderer("custom-type", (msg, {expanded}, theme) =>
//     box-with-theme-colors)`.

import {
  Box,
  type Component,
  type ExtensionAPI,
  type MessageRenderOptions,
  Text,
  type Theme,
} from "../pi/sdk.js";

export const WORKER_CUSTOM_TYPE = "belmont.worker";

export type WorkerMessageKind =
  | "phase_start"
  | "phase_end"
  | "text"
  | "tool_call"
  | "tool_result"
  | "abort"
  | "info";

export type WorkerMessagePayload = {
  kind: WorkerMessageKind;
  /** Short, single-line headline rendered in the collapsed row. */
  headline: string;
  /** Optional multi-line body shown when expanded. */
  body?: string;
  /** Marker glyph for the row prefix (✓ ✗ ▶ ⟳ etc.). */
  prefix?: string;
  /** Theme color class for the prefix glyph — pi's `ThemeColor` subset. */
  color?: "success" | "error" | "warning" | "muted" | "accent";
  /** Optional structured details (provider/model/session/etc.) for the expanded view. */
  details?: Record<string, string | number | boolean | undefined>;
};

const COLOR_DEFAULTS: Record<WorkerMessageKind, NonNullable<WorkerMessagePayload["color"]>> = {
  phase_start: "accent",
  phase_end: "success",
  text: "muted",
  tool_call: "accent",
  tool_result: "muted",
  abort: "warning",
  info: "muted",
};

const PREFIX_DEFAULTS: Record<WorkerMessageKind, string> = {
  phase_start: "▶",
  phase_end: "✓",
  text: " ",
  tool_call: "⚙",
  tool_result: " ",
  abort: "⌫",
  info: "·",
};

// ────────────────────────────────────────────────────────────────────
// Pure renderer — exported separately so tests can pin output shape
// without spinning up pi-tui.
// ────────────────────────────────────────────────────────────────────

export function formatWorkerHeadline(payload: WorkerMessagePayload): string {
  const prefix = payload.prefix ?? PREFIX_DEFAULTS[payload.kind];
  return `${prefix} ${payload.headline}`.trim();
}

export function formatWorkerBody(payload: WorkerMessagePayload): string {
  const lines: string[] = [];
  if (payload.body) lines.push(payload.body);
  if (payload.details) {
    for (const [k, v] of Object.entries(payload.details)) {
      if (v === undefined) continue;
      lines.push(`  ${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Renderer registration
// ────────────────────────────────────────────────────────────────────

export function registerWorkerRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer<WorkerMessagePayload>(
    WORKER_CUSTOM_TYPE,
    (message, options, theme) => buildWorkerComponent(message.details, options, theme),
  );
}

function buildWorkerComponent(
  payload: WorkerMessagePayload | undefined,
  options: MessageRenderOptions,
  theme: Theme,
): Component | undefined {
  if (!payload) return undefined;
  const color = payload.color ?? COLOR_DEFAULTS[payload.kind];
  const headline = formatWorkerHeadline(payload);
  let text = theme.fg(color, headline);
  if (options.expanded) {
    const body = formatWorkerBody(payload);
    if (body.length > 0) {
      text += "\n" + theme.fg("dim", body.replace(/^/gm, "  "));
    }
  }
  const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
  box.addChild(new Text(text, 0, 0));
  return box;
}

// ────────────────────────────────────────────────────────────────────
// Loop-side helper — fires one custom message per worker event.
// ────────────────────────────────────────────────────────────────────

export function emitWorkerMessage(pi: ExtensionAPI, payload: WorkerMessagePayload): void {
  pi.sendMessage<WorkerMessagePayload>({
    customType: WORKER_CUSTOM_TYPE,
    content: formatWorkerHeadline(payload),
    display: true,
    details: payload,
  });
}
