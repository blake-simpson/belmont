import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  isThinkingCollapsed,
  registerAutoOpenWatcher,
  registerShortcuts,
  resetThinkingCollapseFlag,
} from "../src/tui/shortcuts.js";
import {
  AUTO_WIDGET_KEY,
  clearAutoProgressWidget,
  formatAutoWidget,
  setAutoProgressWidget,
} from "../src/tui/widget-progress.js";

beforeEach(() => {
  resetThinkingCollapseFlag();
});

// ────────────────────────────────────────────────────────────────────
// Shortcuts
// ────────────────────────────────────────────────────────────────────

function makeShortcutHarness() {
  const shortcuts: Record<string, (ctx: unknown) => Promise<void> | void> = {};
  const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<void> | void> = {};
  const pi = {
    registerShortcut: vi.fn((key: string, opts: { handler: (ctx: unknown) => Promise<void> | void }) => {
      shortcuts[key] = opts.handler;
    }),
    on: vi.fn((event: string, h: (event: unknown, ctx: unknown) => Promise<void> | void) => {
      handlers[event] = h;
    }),
    sendUserMessage: vi.fn(),
  };
  const panel = {
    toggle: vi.fn(),
    openPassive: vi.fn(),
  };
  return { pi, panel, shortcuts, handlers };
}

describe("registerShortcuts", () => {
  it("registers ctrl+alt+b/t/r/h (Belmont-owned chord family clear of pi 0.75.5 defaults)", () => {
    const { pi, panel } = makeShortcutHarness();
    registerShortcuts({
      pi: pi as unknown as Parameters<typeof registerShortcuts>[0]["pi"],
      panel: panel as unknown as Parameters<typeof registerShortcuts>[0]["panel"],
      onThinkingFlagChange: vi.fn(),
    });
    expect(pi.registerShortcut).toHaveBeenCalledTimes(4);
    const keys = pi.registerShortcut.mock.calls.map(([k]) => k);
    expect(keys.sort()).toEqual(["ctrl+alt+b", "ctrl+alt+h", "ctrl+alt+r", "ctrl+alt+t"]);
  });

  it("ctrl+alt+b → panel.toggle(ctx)", async () => {
    const { pi, panel, shortcuts } = makeShortcutHarness();
    registerShortcuts({
      pi: pi as unknown as Parameters<typeof registerShortcuts>[0]["pi"],
      panel: panel as unknown as Parameters<typeof registerShortcuts>[0]["panel"],
      onThinkingFlagChange: vi.fn(),
    });
    const fakeCtx = { cwd: "/x" };
    await shortcuts["ctrl+alt+b"]?.(fakeCtx);
    expect(panel.toggle).toHaveBeenCalledWith(fakeCtx);
  });

  it("ctrl+alt+t flips the thinking-collapse flag + notifies + invokes onThinkingFlagChange", () => {
    const { pi, panel, shortcuts } = makeShortcutHarness();
    const onChange = vi.fn();
    registerShortcuts({
      pi: pi as unknown as Parameters<typeof registerShortcuts>[0]["pi"],
      panel: panel as unknown as Parameters<typeof registerShortcuts>[0]["panel"],
      onThinkingFlagChange: onChange,
    });
    const fakeCtx = { ui: { notify: vi.fn() } };
    expect(isThinkingCollapsed()).toBe(false);
    shortcuts["ctrl+alt+t"]?.(fakeCtx);
    expect(isThinkingCollapsed()).toBe(true);
    expect(fakeCtx.ui.notify).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(fakeCtx);
    // Second press toggles back.
    shortcuts["ctrl+alt+t"]?.(fakeCtx);
    expect(isThinkingCollapsed()).toBe(false);
  });

  it("ctrl+alt+r queues /belmont:repl-refresh as a follow-up user message", () => {
    const { pi, panel, shortcuts } = makeShortcutHarness();
    registerShortcuts({
      pi: pi as unknown as Parameters<typeof registerShortcuts>[0]["pi"],
      panel: panel as unknown as Parameters<typeof registerShortcuts>[0]["panel"],
      onThinkingFlagChange: vi.fn(),
    });
    shortcuts["ctrl+alt+r"]?.({});
    expect(pi.sendUserMessage).toHaveBeenCalledWith("/belmont:repl-refresh", { deliverAs: "followUp" });
  });

  it("ctrl+alt+h shows the Belmont help legend", () => {
    const { pi, panel, shortcuts } = makeShortcutHarness();
    registerShortcuts({
      pi: pi as unknown as Parameters<typeof registerShortcuts>[0]["pi"],
      panel: panel as unknown as Parameters<typeof registerShortcuts>[0]["panel"],
      onThinkingFlagChange: vi.fn(),
    });
    const fakeCtx = { ui: { notify: vi.fn() } };
    shortcuts["ctrl+alt+h"]?.(fakeCtx);
    expect(fakeCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Ctrl+Alt+B"), "info");
    expect(fakeCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("/belmont:auto"), "info");
  });
});

describe("registerAutoOpenWatcher", () => {
  it("opens the panel passively when interactive input begins with /belmont:auto", async () => {
    const { pi, panel, handlers } = makeShortcutHarness();
    registerAutoOpenWatcher(
      pi as unknown as Parameters<typeof registerAutoOpenWatcher>[0],
      panel as unknown as Parameters<typeof registerAutoOpenWatcher>[1],
    );
    expect(handlers.input).toBeDefined();
    const fakeCtx = { cwd: "/x" };
    await handlers.input!({ source: "interactive", text: "/belmont:auto M2" }, fakeCtx);
    expect(panel.openPassive).toHaveBeenCalledWith(fakeCtx);
  });

  it("ignores non-interactive input sources (rpc, extension)", async () => {
    const { pi, panel, handlers } = makeShortcutHarness();
    registerAutoOpenWatcher(
      pi as unknown as Parameters<typeof registerAutoOpenWatcher>[0],
      panel as unknown as Parameters<typeof registerAutoOpenWatcher>[1],
    );
    await handlers.input!({ source: "rpc", text: "/belmont:auto M2" }, {});
    await handlers.input!({ source: "extension", text: "/belmont:auto M2" }, {});
    expect(panel.openPassive).not.toHaveBeenCalled();
  });

  it("ignores unrelated input text", async () => {
    const { pi, panel, handlers } = makeShortcutHarness();
    registerAutoOpenWatcher(
      pi as unknown as Parameters<typeof registerAutoOpenWatcher>[0],
      panel as unknown as Parameters<typeof registerAutoOpenWatcher>[1],
    );
    await handlers.input!({ source: "interactive", text: "hello world" }, {});
    await handlers.input!({ source: "interactive", text: "/belmont:status" }, {});
    await handlers.input!({ source: "interactive", text: "/belmont:autopilot" }, {});
    expect(panel.openPassive).not.toHaveBeenCalled();
  });

  it("matches /belmont:auto with leading whitespace + no args", async () => {
    const { pi, panel, handlers } = makeShortcutHarness();
    registerAutoOpenWatcher(
      pi as unknown as Parameters<typeof registerAutoOpenWatcher>[0],
      panel as unknown as Parameters<typeof registerAutoOpenWatcher>[1],
    );
    await handlers.input!({ source: "interactive", text: "  /belmont:auto" }, {});
    expect(panel.openPassive).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Auto-progress widget (M6 P1 stub)
// ────────────────────────────────────────────────────────────────────

describe("formatAutoWidget", () => {
  it("renders the §6.1 example line", () => {
    expect(
      formatAutoWidget({
        milestoneId: "M2",
        completed: 3,
        total: 5,
        currentTaskId: "P1-1",
        role: "impl",
        tier: "high+sonnet",
        steerable: true,
      }),
    ).toBe("M2 ▰▰▰▱▱ 3/5 · current: P1-1 (impl) · tier: high+sonnet · steerable");
  });

  it("omits optional parts when not provided", () => {
    expect(formatAutoWidget({ milestoneId: "M0", completed: 0, total: 3 })).toBe("M0 ▱▱▱▱▱ 0/3");
  });

  it("rounds bar slots when completed/total doesn't divide evenly", () => {
    expect(formatAutoWidget({ milestoneId: "M1", completed: 1, total: 3 })).toContain("▰▰▱▱▱");
  });

  it("handles 0/0 without throwing", () => {
    expect(formatAutoWidget({ milestoneId: "M9", completed: 0, total: 0 })).toBe("M9 ▱▱▱▱▱ 0/0");
  });
});

describe("setAutoProgressWidget / clearAutoProgressWidget", () => {
  it("setAutoProgressWidget writes a single-line widget at the AUTO_WIDGET_KEY (above editor)", () => {
    const setWidget = vi.fn();
    const ctx = { ui: { setWidget } };
    setAutoProgressWidget(
      ctx as unknown as Parameters<typeof setAutoProgressWidget>[0],
      { milestoneId: "M2", completed: 3, total: 5 },
    );
    expect(setWidget).toHaveBeenCalledWith(AUTO_WIDGET_KEY, ["M2 ▰▰▰▱▱ 3/5"], { placement: "aboveEditor" });
  });

  it("clearAutoProgressWidget calls setWidget with undefined content", () => {
    const setWidget = vi.fn();
    const ctx = { ui: { setWidget } };
    clearAutoProgressWidget(ctx as unknown as Parameters<typeof clearAutoProgressWidget>[0]);
    expect(setWidget).toHaveBeenCalledWith(AUTO_WIDGET_KEY, undefined);
  });
});
