import { afterEach, describe, expect, it, vi } from "vitest";

import { recordRtkSavings, resetRtkStats } from "../src/state/rtk-stats.js";
import {
  CTX_POLL_INTERVAL_MS,
  SLOT_KEYS,
  costSlot,
  ctxSlot,
  formatRtkSummarySuffix,
  modelSlot,
  recomputeStatusSlots,
  registerStatusBar,
  taskSlot,
} from "../src/tui/status-bar.js";

afterEach(() => {
  resetRtkStats();
});

describe("slot string helpers", () => {
  describe("taskSlot", () => {
    it("renders project name (M6 — task/role/tier added by M7+M8)", () => {
      expect(taskSlot("belmont")).toBe("belmont");
      expect(taskSlot("my-app")).toBe("my-app");
    });
  });

  describe("modelSlot", () => {
    it("renders 'provider/id · thinking' when model present", () => {
      expect(
        modelSlot({ provider: "anthropic", id: "claude-opus-4-7" }, "high", false),
      ).toBe("anthropic/claude-opus-4-7 · high");
    });

    it("renders 'no model' when undefined", () => {
      expect(modelSlot(undefined, "off", false)).toBe("no model · off");
    });

    it("appends '· thinking-collapse' when collapsed flag on", () => {
      expect(
        modelSlot({ provider: "anthropic", id: "claude-opus-4-7" }, "high", true),
      ).toBe("anthropic/claude-opus-4-7 · high · thinking-collapse");
    });

    it("appends '· rtk: -X% (Y saved)' when a non-zero rtk summary is supplied (M9)", () => {
      const summary = {
        savedBytes: 2048,
        originalBytes: 8192,
        percent: 25,
        commandCount: 4,
      };
      expect(
        modelSlot(
          { provider: "anthropic", id: "claude-opus-4-7" },
          "high",
          false,
          summary,
        ),
      ).toBe("anthropic/claude-opus-4-7 · high · rtk: -25% (2.0K saved)");
    });

    it("omits the rtk suffix entirely when summary is undefined", () => {
      expect(
        modelSlot(
          { provider: "anthropic", id: "claude-opus-4-7" },
          "high",
          false,
          undefined,
        ),
      ).toBe("anthropic/claude-opus-4-7 · high");
    });

    it("omits the rtk suffix when savedBytes === 0 (§11.3 graceful degrade)", () => {
      expect(
        modelSlot(
          { provider: "anthropic", id: "claude-opus-4-7" },
          "high",
          false,
          { savedBytes: 0, originalBytes: 100, percent: 0, commandCount: 1 },
        ),
      ).toBe("anthropic/claude-opus-4-7 · high");
    });

    it("composes thinking-collapse AND rtk suffixes in order", () => {
      expect(
        modelSlot(
          { provider: "anthropic", id: "claude-opus-4-7" },
          "medium",
          true,
          { savedBytes: 1024, originalBytes: 2048, percent: 50, commandCount: 2 },
        ),
      ).toBe(
        "anthropic/claude-opus-4-7 · medium · thinking-collapse · rtk: -50% (1.0K saved)",
      );
    });
  });

  describe("formatRtkSummarySuffix", () => {
    it("returns empty string for undefined summary", () => {
      expect(formatRtkSummarySuffix(undefined)).toBe("");
    });

    it("returns empty string for zero savedBytes", () => {
      expect(
        formatRtkSummarySuffix({
          savedBytes: 0,
          originalBytes: 1000,
          percent: 0,
          commandCount: 1,
        }),
      ).toBe("");
    });

    it("formats non-zero savings as ' · rtk: -X% (Y saved)'", () => {
      expect(
        formatRtkSummarySuffix({
          savedBytes: 512,
          originalBytes: 1024,
          percent: 50,
          commandCount: 1,
        }),
      ).toBe(" · rtk: -50% (512B saved)");
    });
  });

  describe("ctxSlot", () => {
    it("renders traffic-light at the §9.1 boundaries", () => {
      expect(ctxSlot(40_000)).toBe("ctx 40k 🟢");
      expect(ctxSlot(85_000)).toBe("ctx 85k 🟡");
      expect(ctxSlot(150_000)).toBe("ctx 150k 🔴");
    });

    it("renders dim 'ctx — ·' on post-compaction null tokens", () => {
      expect(ctxSlot(null)).toBe("ctx — ·");
    });

    it("respects custom thresholds", () => {
      const custom = { amber: 50_000, red: 100_000 };
      expect(ctxSlot(40_000, custom)).toBe("ctx 40k 🟢");
      expect(ctxSlot(55_000, custom)).toBe("ctx 55k 🟡");
      expect(ctxSlot(110_000, custom)).toBe("ctx 110k 🔴");
    });
  });

  describe("costSlot", () => {
    it("is empty in M6 (M9 owns RTK+cost)", () => {
      expect(costSlot()).toBe("");
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// recomputeStatusSlots — idempotent fan-in
// ────────────────────────────────────────────────────────────────────

interface FakeCtx {
  cwd: string;
  model?: { provider: string; id: string };
  getContextUsage: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
  ui: {
    setStatus: ReturnType<typeof vi.fn>;
  };
}

function makeCtx(opts: {
  cwd?: string;
  model?: { provider: string; id: string };
  tokens?: number | null;
} = {}): FakeCtx {
  return {
    cwd: opts.cwd ?? "/tmp/belmont-fake",
    model: opts.model,
    getContextUsage: () => ({
      tokens: opts.tokens === undefined ? 0 : opts.tokens,
      contextWindow: 200_000,
      percent: opts.tokens === null ? null : 0,
    }),
    ui: { setStatus: vi.fn() },
  };
}

function makePi(thinkingLevel = "medium") {
  return { getThinkingLevel: () => thinkingLevel } as unknown as Parameters<typeof recomputeStatusSlots>[1]["pi"];
}

describe("recomputeStatusSlots", () => {
  it("writes all 4 slots in a single call", () => {
    const ctx = makeCtx({
      cwd: "/tmp/myproj",
      model: { provider: "anthropic", id: "claude-opus-4-7" },
      tokens: 42_000,
    });
    recomputeStatusSlots(ctx as unknown as Parameters<typeof recomputeStatusSlots>[0], {
      pi: makePi("high"),
      isThinkingCollapsed: () => false,
    });
    const calls = ctx.ui.setStatus.mock.calls;
    expect(calls).toHaveLength(4);
    const keys = calls.map(([k]) => k);
    expect(keys).toEqual([SLOT_KEYS.task, SLOT_KEYS.model, SLOT_KEYS.ctx, SLOT_KEYS.cost]);
    const byKey = Object.fromEntries(calls.map(([k, v]) => [k, v]));
    expect(byKey[SLOT_KEYS.task]).toBe("myproj");
    expect(byKey[SLOT_KEYS.model]).toBe("anthropic/claude-opus-4-7 · high");
    expect(byKey[SLOT_KEYS.ctx]).toBe("ctx 42k 🟢");
    expect(byKey[SLOT_KEYS.cost]).toBe("");
  });

  it("propagates thinking-collapse flag into the model slot", () => {
    const ctx = makeCtx({ model: { provider: "anthropic", id: "claude-opus-4-7" }, tokens: 1000 });
    recomputeStatusSlots(ctx as unknown as Parameters<typeof recomputeStatusSlots>[0], {
      pi: makePi("medium"),
      isThinkingCollapsed: () => true,
    });
    const byKey = Object.fromEntries(ctx.ui.setStatus.mock.calls.map(([k, v]) => [k, v]));
    expect(byKey[SLOT_KEYS.model]).toBe("anthropic/claude-opus-4-7 · medium · thinking-collapse");
  });

  it("ctx slot is dim ('ctx — ·') when tokens unknown post-compaction", () => {
    const ctx = makeCtx({ model: { provider: "anthropic", id: "claude-opus-4-7" }, tokens: null });
    recomputeStatusSlots(ctx as unknown as Parameters<typeof recomputeStatusSlots>[0], {
      pi: makePi("high"),
      isThinkingCollapsed: () => false,
    });
    const byKey = Object.fromEntries(ctx.ui.setStatus.mock.calls.map(([k, v]) => [k, v]));
    expect(byKey[SLOT_KEYS.ctx]).toBe("ctx — ·");
  });

  it("two calls back-to-back produce identical 4-slot output (idempotence)", () => {
    const ctx = makeCtx({ model: { provider: "anthropic", id: "claude-opus-4-7" }, tokens: 90_000 });
    recomputeStatusSlots(ctx as unknown as Parameters<typeof recomputeStatusSlots>[0], {
      pi: makePi("high"),
      isThinkingCollapsed: () => false,
    });
    recomputeStatusSlots(ctx as unknown as Parameters<typeof recomputeStatusSlots>[0], {
      pi: makePi("high"),
      isThinkingCollapsed: () => false,
    });
    const calls = ctx.ui.setStatus.mock.calls;
    expect(calls).toHaveLength(8);
    // First 4 == second 4 (same args, same order).
    for (let i = 0; i < 4; i++) {
      expect(calls[i]).toEqual(calls[i + 4]);
    }
  });

  it("M9: picks up live rtk-stats counter into the model slot", () => {
    recordRtkSavings({ savedBytes: 1024, originalBytes: 2048 });
    const ctx = makeCtx({
      model: { provider: "anthropic", id: "claude-opus-4-7" },
      tokens: 1000,
    });
    recomputeStatusSlots(
      ctx as unknown as Parameters<typeof recomputeStatusSlots>[0],
      { pi: makePi("high"), isThinkingCollapsed: () => false },
    );
    const byKey = Object.fromEntries(ctx.ui.setStatus.mock.calls.map(([k, v]) => [k, v]));
    expect(byKey[SLOT_KEYS.model]).toBe(
      "anthropic/claude-opus-4-7 · high · rtk: -50% (1.0K saved)",
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// registerStatusBar — handler fan-out
// ────────────────────────────────────────────────────────────────────

describe("registerStatusBar", () => {
  it("registers handlers for session_start, session_shutdown, turn_end, model_select, thinking_level_select", () => {
    const handlers: Record<string, (...args: unknown[]) => Promise<void> | void> = {};
    const pi = {
      on: vi.fn((event: string, h: (...args: unknown[]) => Promise<void> | void) => {
        handlers[event] = h;
      }),
      getThinkingLevel: () => "medium",
    } as unknown as Parameters<typeof registerStatusBar>[0]["pi"];

    registerStatusBar({ pi, isThinkingCollapsed: () => false });

    expect(Object.keys(handlers).sort()).toEqual(
      ["model_select", "session_shutdown", "session_start", "thinking_level_select", "turn_end"].sort(),
    );
  });

  it("CTX_POLL_INTERVAL_MS is 1s (matches the §6.1 footer cadence)", () => {
    expect(CTX_POLL_INTERVAL_MS).toBe(1000);
  });
});
