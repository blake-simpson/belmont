import { parseProgress } from "@belmont/knowledge-schema";
import { describe, expect, it, vi } from "vitest";

import {
  PanelController,
  commandForKey,
  nextCursor,
  panelRows,
  renderPanelLines,
  renderPanelLinesPlain,
  renderRowPlain,
} from "../src/tui/panel.js";

const SAMPLE = `# PROGRESS

### M0: Spike

- [v] P0-1 First
- [x] P0-2 Second

### M1: Build

- [>] P0-1 In flight
- [ ] P0-2 Pending
- [!] P0-3 Blocked
`;

describe("panelRows", () => {
  it("flattens milestones+tasks in order, milestone-header first", () => {
    const parsed = parseProgress(SAMPLE);
    const rows = panelRows(parsed);
    expect(rows.map((r) => r.kind)).toEqual([
      "milestone",
      "task",
      "task",
      "milestone",
      "task",
      "task",
      "task",
    ]);
    expect(rows[0]).toMatchObject({ kind: "milestone", milestone: { id: "M0" } });
    expect(rows[3]).toMatchObject({ kind: "milestone", milestone: { id: "M1" } });
  });

  it("handles zero-milestone PROGRESS gracefully", () => {
    const parsed = parseProgress("# PROGRESS\n");
    expect(panelRows(parsed)).toEqual([]);
  });
});

describe("renderRowPlain", () => {
  it("renders milestone header with status + verified ratio", () => {
    const parsed = parseProgress(SAMPLE);
    const rows = panelRows(parsed);
    expect(renderRowPlain(rows[0]!, false)).toBe("  M0: Spike — done (1/2)");
    expect(renderRowPlain(rows[3]!, true)).toBe("▶ M1: Build — blocked (0/3)");
  });

  it("renders task with marker + id + name", () => {
    const parsed = parseProgress(SAMPLE);
    const rows = panelRows(parsed);
    expect(renderRowPlain(rows[1]!, false)).toBe("    [v] P0-1 First");
    expect(renderRowPlain(rows[6]!, true)).toBe("▶   [!] P0-3 Blocked");
  });
});

describe("renderPanelLines / renderPanelLinesPlain", () => {
  it("produces header + body + nav footer", () => {
    const parsed = parseProgress(SAMPLE);
    const lines = renderPanelLinesPlain(parsed, 0);
    expect(lines[0]).toBe("Belmont — 2 milestones · 1/5 verified");
    expect(lines).toContain("▶ M0: Spike — done (1/2)");
    expect(lines[lines.length - 1]).toContain("Esc/Ctrl+Alt+B close");
  });

  it("empty-progress fallback shows 'run /belmont:init' hint", () => {
    const parsed = parseProgress("");
    const lines = renderPanelLinesPlain(parsed, 0);
    expect(lines.some((l) => l.includes("/belmont:init"))).toBe(true);
  });

  it("colour render delegates marker colouring to the supplied colorer", () => {
    const parsed = parseProgress(SAMPLE);
    const lines = renderPanelLines(parsed, 0, {
      fg: (c, t) => `<${c}>${t}</${c}>`,
    });
    expect(lines.some((l) => l.includes("<success>[v]</success>"))).toBe(true);
    expect(lines.some((l) => l.includes("<warning>[>]</warning>"))).toBe(true);
    expect(lines.some((l) => l.includes("<error>[!]</error>"))).toBe(true);
  });
});

describe("nextCursor", () => {
  it("moves up/down with clamp at both ends", () => {
    const rows = panelRows(parseProgress(SAMPLE));
    expect(nextCursor(rows, 0, 1)).toBe(1);
    expect(nextCursor(rows, 6, 1)).toBe(6); // clamp at end
    expect(nextCursor(rows, 0, -1)).toBe(0); // clamp at start
    expect(nextCursor(rows, 3, -1)).toBe(2);
  });

  it("returns 0 for empty rows", () => {
    expect(nextCursor([], 0, 1)).toBe(0);
  });
});

describe("commandForKey", () => {
  const parsed = parseProgress(SAMPLE);
  const rows = panelRows(parsed);

  it("Esc/Ctrl+C/Ctrl+Alt+B → close (regardless of cursor row)", () => {
    expect(commandForKey(rows, 0, "Esc")).toEqual({ kind: "close" });
    expect(commandForKey(rows, 0, "escape")).toEqual({ kind: "close" });
    expect(commandForKey(rows, 3, "")).toEqual({ kind: "close" });
    expect(commandForKey(rows, 3, "")).toEqual({ kind: "close" });
    expect(commandForKey(rows, 3, "ctrl+c")).toEqual({ kind: "close" });
    expect(commandForKey(rows, 3, "")).toEqual({ kind: "close" });
  });

  it("Enter on task → /belmont:implement <id>", () => {
    expect(commandForKey(rows, 1, "Enter")).toEqual({
      kind: "command",
      command: "/belmont:implement P0-1",
    });
    expect(commandForKey(rows, 1, "enter")).toEqual({
      kind: "command",
      command: "/belmont:implement P0-1",
    });
    expect(commandForKey(rows, 2, "\r")).toEqual({
      kind: "command",
      command: "/belmont:implement P0-2",
    });
  });

  it("Enter or 'a' on milestone → /belmont:auto <M>", () => {
    expect(commandForKey(rows, 0, "Enter")).toEqual({
      kind: "command",
      command: "/belmont:auto M0",
    });
    expect(commandForKey(rows, 3, "a")).toEqual({
      kind: "command",
      command: "/belmont:auto M1",
    });
  });

  it("'v' on milestone → /belmont:verify <M>", () => {
    expect(commandForKey(rows, 0, "v")).toEqual({
      kind: "command",
      command: "/belmont:verify M0",
    });
  });

  it("noop on task for 'a'/'v' (these are milestone-only)", () => {
    expect(commandForKey(rows, 1, "a")).toEqual({ kind: "noop" });
    expect(commandForKey(rows, 1, "v")).toEqual({ kind: "noop" });
  });

  it("Enter on a task with no id is a noop", () => {
    const noIdRows = panelRows(
      parseProgress("### M0: Test\n\n- [ ] Just a name no id\n"),
    );
    expect(commandForKey(noIdRows, 1, "Enter")).toEqual({ kind: "noop" });
  });

  it("unknown key → noop", () => {
    expect(commandForKey(rows, 0, "x")).toEqual({ kind: "noop" });
  });
});

// ────────────────────────────────────────────────────────────────────
// PanelController state machine
// ────────────────────────────────────────────────────────────────────

import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function makeRepoWithProgress(content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "belmont-panel-"));
  await mkdir(join(root, ".belmont"), { recursive: true });
  await writeFile(join(root, ".belmont", "PROGRESS.md"), content, "utf8");
  return root;
}

/** Flush several microtask rounds so customMock's async + the
 *  controller's `.then(...)` settlement chain completes. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

type FakeOverlayHandle = {
  hidden: boolean;
  focused: boolean;
  hide: () => void;
  setHidden: (h: boolean) => void;
  focus: () => void;
  unfocus: () => void;
  isHidden: () => boolean;
  isFocused: () => boolean;
};

function makeFakeHandle(initialFocused: boolean): FakeOverlayHandle {
  const h = {
    hidden: false,
    focused: initialFocused,
    hide() {
      h.hidden = true;
      h.focused = false;
    },
    setHidden(hidden: boolean) {
      h.hidden = hidden;
    },
    focus() {
      h.focused = true;
    },
    unfocus() {
      h.focused = false;
    },
    isHidden() {
      return h.hidden;
    },
    isFocused() {
      return h.focused;
    },
  };
  return h;
}

type FakeCtx = {
  cwd: string;
  ui: {
    custom: ReturnType<typeof vi.fn>;
  };
  // Other ExtensionContext fields unused by the controller path.
};

function makeFakeCtx(cwd: string): {
  ctx: FakeCtx;
  resolveCustom: (handle: FakeOverlayHandle) => void;
  emitInput: (data: string) => void;
  invalidate: () => void;
  component: { render: (w: number) => string[]; invalidate: () => void; handleInput?: (d: string) => void } | undefined;
  done: () => void;
} {
  let comp: ReturnType<typeof Object> | undefined;
  let resolveFn: ((v: unknown) => void) | undefined;
  let doneFn: () => void = () => {};
  const customMock = vi.fn(async (factory: (tui: any, theme: any, kb: any, done: (r: unknown) => void) => any, opts: any) => {
    const fakeTui = { requestRender: vi.fn() };
    const fakeTheme = { fg: (_c: string, t: string) => t };
    const fakeKb = {};
    const promise = new Promise((resolve) => {
      resolveFn = resolve;
    });
    const done = (r: unknown) => {
      resolveFn?.(r);
    };
    doneFn = () => done(undefined);
    comp = await factory(fakeTui, fakeTheme, fakeKb, done);
    // onHandle is part of the options; call it later when test invokes resolveCustom.
    return promise;
  });
  const ctx: FakeCtx = {
    cwd,
    ui: { custom: customMock },
  };
  return {
    ctx,
    resolveCustom(handle: FakeOverlayHandle) {
      const opts = customMock.mock.calls.at(-1)?.[1] as { onHandle?: (h: FakeOverlayHandle) => void } | undefined;
      opts?.onHandle?.(handle);
    },
    emitInput(data: string) {
      (comp as { handleInput?: (d: string) => void } | undefined)?.handleInput?.(data);
    },
    invalidate() {
      (comp as { invalidate: () => void } | undefined)?.invalidate?.();
    },
    get component() {
      return comp as { render: (w: number) => string[]; invalidate: () => void; handleInput?: (d: string) => void } | undefined;
    },
    done: () => doneFn(),
  };
}

describe("PanelController", () => {
  it("default state is hidden", () => {
    const ctrl = new PanelController({ sendUserMessage: vi.fn() });
    expect(ctrl.getState()).toBe("hidden");
  });

  it("refresh() re-parses PROGRESS.md and caches the rows", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const ctrl = new PanelController({ sendUserMessage: vi.fn() });
      await ctrl.refresh(cwd);
      const rows = ctrl.getCachedRows();
      expect(rows).toHaveLength(7);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("toggle() opens the overlay focused (active) from hidden", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const send = vi.fn();
      const ctrl = new PanelController({ sendUserMessage: send });
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.toggle(ctxWrap.ctx as unknown as Parameters<PanelController["toggle"]>[0]);
      const handle = makeFakeHandle(true);
      ctxWrap.resolveCustom(handle);
      expect(ctrl.getState()).toBe("active");
      expect(handle.isFocused()).toBe(true);
      expect(handle.isHidden()).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("openPassive() opens the overlay unfocused (passive)", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const ctrl = new PanelController({ sendUserMessage: vi.fn() });
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.openPassive(ctxWrap.ctx as unknown as Parameters<PanelController["openPassive"]>[0]);
      const handle = makeFakeHandle(true); // pi starts focused; controller should unfocus
      ctxWrap.resolveCustom(handle);
      expect(ctrl.getState()).toBe("passive");
      expect(handle.isFocused()).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("Ctrl+Alt+B (toggle) from passive → active (focus)", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const ctrl = new PanelController({ sendUserMessage: vi.fn() });
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.openPassive(ctxWrap.ctx as unknown as Parameters<PanelController["openPassive"]>[0]);
      const handle = makeFakeHandle(true);
      ctxWrap.resolveCustom(handle);
      expect(ctrl.getState()).toBe("passive");
      await ctrl.toggle(ctxWrap.ctx as unknown as Parameters<PanelController["toggle"]>[0]);
      expect(ctrl.getState()).toBe("active");
      expect(handle.isFocused()).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("Ctrl+Alt+B (toggle) from active → hidden (M6 behaviour; M8 widens)", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const ctrl = new PanelController({ sendUserMessage: vi.fn() });
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.openActive(ctxWrap.ctx as unknown as Parameters<PanelController["openActive"]>[0]);
      const handle = makeFakeHandle(true);
      ctxWrap.resolveCustom(handle);
      expect(ctrl.getState()).toBe("active");
      await ctrl.toggle(ctxWrap.ctx as unknown as Parameters<PanelController["toggle"]>[0]);
      expect(ctrl.getState()).toBe("hidden");
      expect(handle.isHidden()).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("with autoActive probe returning true, active+toggle → passive (M8 widening simulation)", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const ctrl = new PanelController({ sendUserMessage: vi.fn() });
      ctrl.setAutoActiveProbe(() => true);
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.openActive(ctxWrap.ctx as unknown as Parameters<PanelController["openActive"]>[0]);
      const handle = makeFakeHandle(true);
      ctxWrap.resolveCustom(handle);
      await ctrl.toggle(ctxWrap.ctx as unknown as Parameters<PanelController["toggle"]>[0]);
      expect(ctrl.getState()).toBe("passive");
      expect(handle.isFocused()).toBe(false);
      expect(handle.isHidden()).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("close() makes the controller hidden + idempotent", () => {
    const ctrl = new PanelController({ sendUserMessage: vi.fn() });
    expect(() => ctrl.close()).not.toThrow();
    expect(ctrl.getState()).toBe("hidden");
  });

  it("input dispatch through the Component invokes pi.sendUserMessage on Enter, then dismisses", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const send = vi.fn();
      const ctrl = new PanelController({ sendUserMessage: send });
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.openActive(ctxWrap.ctx as unknown as Parameters<PanelController["openActive"]>[0]);
      const handle = makeFakeHandle(true);
      ctxWrap.resolveCustom(handle);
      // Cursor starts at 0 → M0 (milestone); Enter → /belmont:auto M0.
      ctxWrap.emitInput("Enter");
      expect(send).toHaveBeenCalledWith("/belmont:auto M0", { deliverAs: "followUp" });
      // Flush the resolution chain (customMock → then → state flip).
      await flushMicrotasks();
      expect(ctrl.getState()).toBe("hidden");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("arrow keys and j/k move cursor and trigger re-render", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const send = vi.fn();
      const ctrl = new PanelController({ sendUserMessage: send });
      const ctxWrap = makeFakeCtx(cwd);
      await ctrl.openActive(ctxWrap.ctx as unknown as Parameters<PanelController["openActive"]>[0]);
      const handle = makeFakeHandle(true);
      ctxWrap.resolveCustom(handle);
      expect(ctrl.getCursor()).toBe(0);
      ctxWrap.emitInput("j");
      expect(ctrl.getCursor()).toBe(1);
      ctxWrap.emitInput("down");
      expect(ctrl.getCursor()).toBe(2);
      ctxWrap.emitInput("k");
      expect(ctrl.getCursor()).toBe(1);
      ctxWrap.emitInput("up");
      expect(ctrl.getCursor()).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("Esc/Ctrl+C/Ctrl+Alt+B dismiss the focused panel without sending any command", async () => {
    for (const input of ["", "", ""]) {
      const cwd = await makeRepoWithProgress(SAMPLE);
      try {
        const send = vi.fn();
        const ctrl = new PanelController({ sendUserMessage: send });
        const ctxWrap = makeFakeCtx(cwd);
        await ctrl.openActive(ctxWrap.ctx as unknown as Parameters<PanelController["openActive"]>[0]);
        const handle = makeFakeHandle(true);
        ctxWrap.resolveCustom(handle);
        ctxWrap.emitInput(input);
        expect(send).not.toHaveBeenCalled();
        await flushMicrotasks();
        expect(ctrl.getState()).toBe("hidden");
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }
  });

  it("refresh() after a transition rewrites PROGRESS — cached rows reflect the new state", async () => {
    const cwd = await makeRepoWithProgress(SAMPLE);
    try {
      const ctrl = new PanelController({ sendUserMessage: vi.fn() });
      await ctrl.refresh(cwd);
      const before = ctrl.getCachedRows();
      // Mutate the file outside the controller.
      const NEW_SAMPLE = SAMPLE.replace("- [ ] P0-2 Pending", "- [v] P0-2 Pending");
      await writeFile(join(cwd, ".belmont", "PROGRESS.md"), NEW_SAMPLE, "utf8");
      await ctrl.refresh(cwd);
      const after = ctrl.getCachedRows();
      expect(before.length).toBe(after.length);
      const newPending = after.find((r) => r.kind === "task" && r.task.name === "Pending");
      expect(newPending).toBeDefined();
      if (newPending?.kind === "task") {
        expect(newPending.task.state).toBe("verified");
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
