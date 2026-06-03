// TUI side panel — the M6 deliverable.
//
// v2.3 §6.1 mockup + §6.4 focus rules:
//   - Ctrl+Alt+B opens the milestone tree as a right-anchored overlay.
//   - j/k navigate; Enter on task → /belmont:implement <id>;
//     Enter or a on milestone → /belmont:auto <M>;
//     v on milestone → /belmont:verify <M>; Esc closes.
//   - Marker colours (§17 M6 lock): green [v], yellow [>], red [!],
//     grey [ ], white [x] — handled by ../tui/markers.ts so any future
//     renderer (M11 author-smoke, M8 worker stream) can reuse the same
//     mapping.
//
// FOCUS DISCIPLINE (the load-bearing UX call for §6.4 + §7):
//
//   Pi 0.75.5's `OverlayHandle` exposes `focus()` / `unfocus()` /
//   `setHidden()` separately from `hide()` — and `OverlayOptions`
//   carries a `nonCapturing` flag. That separation is what lets us
//   honour "REPL retains keyboard focus by default; panel is a view,
//   not a focus-stealing widget" (§6.4) while still letting auto
//   pre-open the panel (§7).
//
//   The panel has THREE states ("hidden" / "passive" / "active"); the
//   live OverlayHandle is the runtime carrier. Ctrl+Alt+B toggles
//   visibility (M6 keeps it simple: hidden ↔ active). The input-watcher
//   on `/belmont:auto` opens passive (visible, unfocused) so REPL still
//   takes keystrokes — typing goes to the editor, not the panel.
//
//   M8 will widen the Esc/Ctrl+Alt+B transitions so Esc-while-focused
//   returns to passive when the auto loop is live, instead of closing.
//   The auto-active predicate is hooked into the controller through
//   `setAutoActiveProbe()` — M6 always returns false.
//
// Pi-mono lineage (D-001):
//   - `examples/extensions/tools.ts` — `ctx.ui.custom(factory)` +
//     `done(undefined)` dismissal pattern.
//   - `examples/extensions/border-status-editor.ts` — Component
//     class with `tui.requestRender()` driven invalidation.
//   - `examples/extensions/widget-placement.ts` — `ctx.ui.setWidget`
//     placement options (used by the M6-stubbed
//     `tui/widget-progress.ts`).

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type Milestone,
  type ParseProgressResult,
  parseProgress,
  type Task,
} from "@belmont/knowledge-schema";

import type {
  Component,
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  OverlayHandle,
  OverlayOptions,
  TUI,
} from "../pi/sdk.js";
import { matchesKey } from "../pi/sdk.js";
import {
  type MarkerColorer,
  colorMarker,
  noopColorer,
  plainMarker,
} from "./markers.js";

// ────────────────────────────────────────────────────────────────────
// Pure helpers — exported for tests.
// ────────────────────────────────────────────────────────────────────

/** A row in the flat panel list — either a milestone header or a task line. */
export type PanelRow =
  | { kind: "milestone"; milestone: Milestone }
  | { kind: "task"; milestone: Milestone; task: Task };

/** Flatten a parse result into the navigable row list. */
export function panelRows(parsed: ParseProgressResult): PanelRow[] {
  const rows: PanelRow[] = [];
  for (const milestone of parsed.milestones) {
    rows.push({ kind: "milestone", milestone });
    for (const task of milestone.tasks) {
      rows.push({ kind: "task", milestone, task });
    }
  }
  return rows;
}

const MILESTONE_STATUS_LABEL: Record<Milestone["status"], string> = {
  not_started: "not started",
  in_progress: "in progress",
  done: "done",
  verified: "verified",
  blocked: "blocked",
};

/** Render one row to plain text (no colour); used as the test surface. */
export function renderRowPlain(row: PanelRow, isCursor: boolean): string {
  const marker = isCursor ? "▶" : " ";
  if (row.kind === "milestone") {
    const verified = row.milestone.tasks.filter((t) => t.state === "verified").length;
    const total = row.milestone.tasks.length;
    const status = MILESTONE_STATUS_LABEL[row.milestone.status];
    return `${marker} ${row.milestone.id}: ${row.milestone.name} — ${status} (${verified}/${total})`;
  }
  const id = row.task.id ? `${row.task.id} ` : "";
  return `${marker}   ${plainMarker(row.task.state)} ${id}${row.task.name}`;
}

/** Render one row with colour. Cursor row is bold-bracketed. */
export function renderRow(row: PanelRow, isCursor: boolean, colorer: MarkerColorer): string {
  const cursorPrefix = isCursor ? "▶" : " ";
  if (row.kind === "milestone") {
    const verified = row.milestone.tasks.filter((t) => t.state === "verified").length;
    const total = row.milestone.tasks.length;
    const status = MILESTONE_STATUS_LABEL[row.milestone.status];
    return `${cursorPrefix} ${row.milestone.id}: ${row.milestone.name} — ${status} (${verified}/${total})`;
  }
  const marker = colorMarker(colorer, row.task.state);
  const id = row.task.id ? `${row.task.id} ` : "";
  return `${cursorPrefix}   ${marker} ${id}${row.task.name}`;
}

/** Render the full panel content to lines (header + body). */
export function renderPanelLines(
  parsed: ParseProgressResult,
  cursor: number,
  colorer: MarkerColorer,
): string[] {
  const rows = panelRows(parsed);
  const verifiedTotal = parsed.milestones.reduce(
    (n, m) => n + m.tasks.filter((t) => t.state === "verified").length,
    0,
  );
  const taskTotal = parsed.milestones.reduce((n, m) => n + m.tasks.length, 0);
  const header = `Belmont — ${parsed.milestones.length} milestones · ${verifiedTotal}/${taskTotal} verified`;
  const footer = "  ↑/↓/j/k nav · Enter implement · a auto · v verify · Esc/Ctrl+Alt+B close";
  const body = rows.map((row, i) => renderRow(row, i === cursor, colorer));
  if (body.length === 0) {
    return [header, "", "  (no milestones — run /belmont:init)", "", footer];
  }
  return [header, "", ...body, "", footer];
}

/** Move the cursor up or down; clamps at ends. */
export function nextCursor(rows: PanelRow[], current: number, dir: -1 | 1): number {
  if (rows.length === 0) return 0;
  const next = current + dir;
  if (next < 0) return 0;
  if (next >= rows.length) return rows.length - 1;
  return next;
}

/** What command (if any) does the given keystroke dispatch on the current row? */
export type PanelDispatch =
  | { kind: "noop" }
  | { kind: "close" }
  | { kind: "command"; command: string };

export function commandForKey(rows: PanelRow[], cursor: number, key: string): PanelDispatch {
  if (isKey(key, "escape") || isKey(key, "ctrl+c") || isKey(key, "ctrl+alt+b")) {
    return { kind: "close" };
  }
  if (rows.length === 0) return { kind: "noop" };
  const row = rows[cursor];
  if (!row) return { kind: "noop" };
  if (row.kind === "task") {
    if (isKey(key, "enter")) {
      if (!row.task.id) return { kind: "noop" };
      return { kind: "command", command: `/belmont:implement ${row.task.id}` };
    }
    return { kind: "noop" };
  }
  // milestone
  if (isKey(key, "enter") || key === "a") {
    return { kind: "command", command: `/belmont:auto ${row.milestone.id}` };
  }
  if (key === "v") {
    return { kind: "command", command: `/belmont:verify ${row.milestone.id}` };
  }
  return { kind: "noop" };
}

// ────────────────────────────────────────────────────────────────────
// Controller — owns the OverlayHandle + the cursor + the cached parse.
// ────────────────────────────────────────────────────────────────────

type PanelStateKind = "hidden" | "passive" | "active";

type ParsedCache = { parsed: ParseProgressResult; cwd: string } | undefined;

/** Optional probe lets M8 say "auto loop is live" so Esc returns to passive. */
export type AutoActiveProbe = () => boolean;

const ALWAYS_FALSE: AutoActiveProbe = () => false;

export interface PanelControllerDeps {
  /** pi.sendUserMessage — captured at construction so Enter/a/v can dispatch. */
  sendUserMessage: ExtensionAPI["sendUserMessage"];
}

export class PanelController {
  private state: PanelStateKind = "hidden";
  private handle: OverlayHandle | undefined;
  private cursor = 0;
  private cache: ParsedCache;
  /** Set by an installed PanelComponent so refresh() can re-render it. */
  private invalidateActiveComponent: (() => void) | undefined;
  private autoActive: AutoActiveProbe = ALWAYS_FALSE;

  constructor(private readonly deps: PanelControllerDeps) {}

  /** M8 install-point. M6 leaves it at the always-false default. */
  setAutoActiveProbe(probe: AutoActiveProbe): void {
    this.autoActive = probe;
  }

  /** Test-only accessor. */
  getState(): PanelStateKind {
    return this.state;
  }

  /** Test-only accessor for the cached parse (e.g. after refresh()). */
  getCachedRows(): PanelRow[] {
    return this.cache ? panelRows(this.cache.parsed) : [];
  }

  /** Test-only accessor for the cursor index. */
  getCursor(): number {
    return this.cursor;
  }

  /** Re-read PROGRESS.md and re-render the panel if visible. */
  async refresh(cwd: string): Promise<void> {
    await this.reparse(cwd);
    if (this.invalidateActiveComponent) {
      this.invalidateActiveComponent();
    }
  }

  /** Ctrl+Alt+B handler: hidden→active, active→hidden, passive→active. */
  async toggle(ctx: ExtensionContext): Promise<void> {
    if (this.state === "hidden") {
      await this.openInternal(ctx, /* focused */ true);
      return;
    }
    if (this.state === "passive") {
      this.handle?.focus();
      this.state = "active";
      return;
    }
    // active → hidden (M6). M8 may switch this to active → passive
    // when auto is live.
    if (this.autoActive()) {
      this.handle?.unfocus();
      this.state = "passive";
      return;
    }
    this.close();
  }

  /** Input watcher hook (M6 P0-5): /belmont:auto pre-opens passively. */
  async openPassive(ctx: ExtensionContext): Promise<void> {
    if (this.state === "active") {
      this.handle?.unfocus();
      this.state = "passive";
      return;
    }
    if (this.state === "passive") return;
    await this.openInternal(ctx, /* focused */ false);
  }

  /** Programmatic open with focus — useful for tests + future entry points. */
  async openActive(ctx: ExtensionContext): Promise<void> {
    if (this.state === "active") return;
    if (this.state === "passive") {
      this.handle?.focus();
      this.state = "active";
      return;
    }
    await this.openInternal(ctx, /* focused */ true);
  }

  /** Close the panel. Idempotent. */
  close(): void {
    if (this.state === "hidden") return;
    // hide() is the permanent overlay removal per pi-tui OverlayHandle docs.
    this.handle?.hide();
    this.handle = undefined;
    this.invalidateActiveComponent = undefined;
    this.state = "hidden";
  }

  // ── private ────────────────────────────────────────────────────────

  private async reparse(cwd: string): Promise<void> {
    const md = await readBelmontProgress(cwd);
    if (md === undefined) {
      this.cache = { parsed: { milestones: [], warnings: [], source: "", lines: [""] }, cwd };
      this.cursor = 0;
      return;
    }
    const parsed = parseProgress(md);
    this.cache = { parsed, cwd };
    // Clamp cursor on re-parse — milestone count may have shrunk.
    const rows = panelRows(parsed);
    if (this.cursor >= rows.length) this.cursor = Math.max(0, rows.length - 1);
  }

  private async openInternal(ctx: ExtensionContext, focused: boolean): Promise<void> {
    await this.reparse(ctx.cwd);
    // `ctx.ui.custom` returns a Promise that resolves when done() is called.
    // We don't await it here — we wire `done` to close the panel and
    // continue concurrently so the caller (a Ctrl+Alt+B handler, the input
    // watcher) returns immediately.
    void ctx.ui
      .custom<undefined>(
        (tui, theme, _kb, done) => {
          const component = new PanelComponent(
            tui,
            theme as unknown as MarkerColorer,
            this,
            done,
          );
          this.invalidateActiveComponent = () => component.invalidate();
          return component;
        },
        {
          overlay: true,
          overlayOptions: panelOverlayOptions(),
          onHandle: (handle) => {
            this.handle = handle;
            if (!focused) handle.unfocus();
          },
        },
      )
      .then(() => {
        // done() was called — overlay dismissed. Reset state.
        this.handle = undefined;
        this.invalidateActiveComponent = undefined;
        this.state = "hidden";
      });
    this.state = focused ? "active" : "passive";
  }

  // Visible to PanelComponent for input dispatch.
  /** @internal */
  _moveCursor(dir: -1 | 1): void {
    const rows = this.cache ? panelRows(this.cache.parsed) : [];
    this.cursor = nextCursor(rows, this.cursor, dir);
  }

  /** @internal */
  _currentRows(): PanelRow[] {
    return this.cache ? panelRows(this.cache.parsed) : [];
  }

  /** @internal */
  _currentParsed(): ParseProgressResult | undefined {
    return this.cache?.parsed;
  }

  /** @internal */
  _dispatch(command: string): void {
    // pi.sendUserMessage with `followUp` queues even while streaming —
    // safe to call from a focused overlay's key handler.
    this.deps.sendUserMessage(command, { deliverAs: "followUp" });
  }

  /** @internal */
  _onComponentMounted(invalidate: () => void): void {
    this.invalidateActiveComponent = invalidate;
  }
}

// ────────────────────────────────────────────────────────────────────
// The pi-tui Component that backs the overlay.
// ────────────────────────────────────────────────────────────────────

class PanelComponent implements Component {
  // tui used only for requestRender(); kept as a private field instead
  // of being read inline so future invalidation paths (timers, etc.)
  // have a single entry point.
  constructor(
    private readonly tui: TUI,
    private readonly colorer: MarkerColorer,
    private readonly controller: PanelController,
    private readonly done: (result: undefined) => void,
  ) {}

  render(_width: number): string[] {
    const parsed = this.controller._currentParsed();
    if (!parsed) return ["Belmont", "", "  (loading…)", "", ""];
    return renderPanelLines(parsed, this.controller.getCursor(), this.colorer);
  }

  invalidate(): void {
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (data === "j" || isKey(data, "down")) {
      this.controller._moveCursor(1);
      this.tui.requestRender();
      return;
    }
    if (data === "k" || isKey(data, "up")) {
      this.controller._moveCursor(-1);
      this.tui.requestRender();
      return;
    }
    const dispatch = commandForKey(this.controller._currentRows(), this.controller.getCursor(), data);
    if (dispatch.kind === "close") {
      this.done(undefined);
      return;
    }
    if (dispatch.kind === "command") {
      this.controller._dispatch(dispatch.command);
      this.done(undefined);
      return;
    }
    // noop — fall through silently.
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function isKey(data: string, key: string): boolean {
  const normalized = data.toLowerCase();
  const wanted = key.toLowerCase();
  if (normalized === wanted) return true;
  if (wanted === "escape" && normalized === "esc") return true;
  return matchesKey(data, key);
}

function panelOverlayOptions(): OverlayOptions {
  // Right-anchored, ~50 cols wide, up to 80% of terminal height.
  // §6.1 mockup shows the panel as a right column; pi 0.75.5 has no
  // split-pane primitive, so we use a right-anchored overlay.
  return {
    anchor: "right-center",
    width: 50,
    minWidth: 32,
    maxHeight: "80%",
  };
}

async function readBelmontProgress(cwd: string): Promise<string | undefined> {
  try {
    return await readFile(join(cwd, ".belmont", "PROGRESS.md"), "utf8");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw err;
  }
}

// Exported helper used by tests when they want the plain (no-ANSI) renderer.
export function renderPanelLinesPlain(parsed: ParseProgressResult, cursor: number): string[] {
  return renderPanelLines(parsed, cursor, noopColorer);
}

// `KeybindingsManager` is part of the ctx.ui.custom factory signature
// but the panel component doesn't use it directly — including the import
// silences "unused" lint without altering behaviour.
export type _PanelKeybindings = KeybindingsManager;
