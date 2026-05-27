import { afterEach, describe, expect, it, vi } from "vitest";

import { setRtkDetectorForTest } from "../src/cli/rtk-detect.js";
import {
  buildRtkBashOperations,
  parseRtkGainTrailer,
  registerRtkBashHook,
  rewriteCommand,
  shouldWrapCommand,
} from "../src/hooks/rtk-bash.js";
import {
  getRtkSummary,
  resetRtkStats,
} from "../src/state/rtk-stats.js";
import type {
  BashOperations,
  ExtensionAPI,
  UserBashEvent,
  UserBashEventResult,
} from "../src/pi/sdk.js";

afterEach(() => {
  setRtkDetectorForTest(undefined);
  resetRtkStats();
});

describe("parseRtkGainTrailer", () => {
  it("parses the primary 'A → B (P%)' format", () => {
    expect(parseRtkGainTrailer("rtk gain: 4000 → 1200 (70% saved)")).toEqual({
      originalBytes: 4000,
      savedBytes: 2800,
    });
  });

  it("parses the primary format with > separator (no arrow glyph)", () => {
    expect(parseRtkGainTrailer("rtk gain: 4000 > 1200 (70% saved)")).toEqual({
      originalBytes: 4000,
      savedBytes: 2800,
    });
  });

  it("parses the legacy 'saved N bytes of M' format", () => {
    expect(parseRtkGainTrailer("rtk gain: saved 250 bytes of 1000 (25%)")).toEqual({
      originalBytes: 1000,
      savedBytes: 250,
    });
  });

  it("matches case-insensitively and ignores leading whitespace", () => {
    expect(parseRtkGainTrailer("  RTK GAIN: 100 → 50")).toEqual({
      originalBytes: 100,
      savedBytes: 50,
    });
  });

  it("returns undefined for non-trailer lines", () => {
    expect(parseRtkGainTrailer("foo bar baz")).toBeUndefined();
    expect(parseRtkGainTrailer("rtk gain:")).toBeUndefined();
    expect(parseRtkGainTrailer("rtk gain saved 100 bytes")).toBeUndefined();
  });
});

describe("shouldWrapCommand / rewriteCommand", () => {
  it("wraps a fresh command with `rtk ` prefix", () => {
    expect(rewriteCommand("git status")).toBe("rtk git status");
    expect(shouldWrapCommand("git status")).toBe(true);
  });

  it("does NOT double-wrap an already-rtk command", () => {
    expect(rewriteCommand("rtk git status")).toBe("rtk git status");
    expect(shouldWrapCommand("rtk gain")).toBe(false);
    expect(shouldWrapCommand("rtk proxy ls")).toBe(false);
  });

  it("preserves leading whitespace when rewriting", () => {
    expect(rewriteCommand("  ls -la")).toBe("  rtk ls -la");
  });

  it("treats bare `rtk` as already-wrapped", () => {
    expect(shouldWrapCommand("rtk")).toBe(false);
  });
});

describe("buildRtkBashOperations", () => {
  it("rewrites the command before delegating to the underlying ops", async () => {
    const underlying: BashOperations = {
      exec: vi.fn(async (command) => {
        expect(command).toBe("rtk git status");
        return { exitCode: 0 };
      }),
    };
    const ops = buildRtkBashOperations(underlying);
    const onData = vi.fn();
    await ops.exec("git status", "/tmp", { onData });
    expect(underlying.exec).toHaveBeenCalledOnce();
  });

  it("forwards onData chunks transparently to the caller", async () => {
    const captured: string[] = [];
    const underlying: BashOperations = {
      exec: async (_cmd, _cwd, opts) => {
        opts.onData(Buffer.from("hello\n", "utf8"));
        opts.onData(Buffer.from("world\n", "utf8"));
        return { exitCode: 0 };
      },
    };
    const ops = buildRtkBashOperations(underlying);
    await ops.exec("foo", "/tmp", {
      onData: (data) => captured.push(data.toString("utf8")),
    });
    expect(captured.join("")).toBe("hello\nworld\n");
  });

  it("records savings when stream contains an rtk gain trailer", async () => {
    const underlying: BashOperations = {
      exec: async (_cmd, _cwd, opts) => {
        opts.onData(Buffer.from("output line 1\n", "utf8"));
        opts.onData(Buffer.from("rtk gain: 2000 → 500 (75% saved)\n", "utf8"));
        return { exitCode: 0 };
      },
    };
    const ops = buildRtkBashOperations(underlying);
    await ops.exec("git status", "/tmp", { onData: () => {} });
    const summary = getRtkSummary();
    expect(summary).toBeDefined();
    expect(summary?.originalBytes).toBe(2000);
    expect(summary?.savedBytes).toBe(1500);
    expect(summary?.commandCount).toBe(1);
  });

  it("handles trailers split across chunk boundaries", async () => {
    const underlying: BashOperations = {
      exec: async (_cmd, _cwd, opts) => {
        opts.onData(Buffer.from("rtk gain: 1000 → ", "utf8"));
        opts.onData(Buffer.from("250 (75% saved)\n", "utf8"));
        return { exitCode: 0 };
      },
    };
    const ops = buildRtkBashOperations(underlying);
    await ops.exec("ls", "/tmp", { onData: () => {} });
    expect(getRtkSummary()?.savedBytes).toBe(750);
  });

  it("handles trailers that lack a final newline (the EOF case)", async () => {
    const underlying: BashOperations = {
      exec: async (_cmd, _cwd, opts) => {
        opts.onData(Buffer.from("rtk gain: 100 → 25", "utf8"));
        return { exitCode: 0 };
      },
    };
    const ops = buildRtkBashOperations(underlying);
    await ops.exec("ls", "/tmp", { onData: () => {} });
    expect(getRtkSummary()?.savedBytes).toBe(75);
  });

  it("does not record when output has no trailer", async () => {
    const underlying: BashOperations = {
      exec: async (_cmd, _cwd, opts) => {
        opts.onData(Buffer.from("nothing useful here\n", "utf8"));
        return { exitCode: 0 };
      },
    };
    const ops = buildRtkBashOperations(underlying);
    await ops.exec("ls", "/tmp", { onData: () => {} });
    expect(getRtkSummary()).toBeUndefined();
  });
});

describe("registerRtkBashHook handler", () => {
  function captureHandler(): {
    handler: (event: UserBashEvent) => UserBashEventResult | undefined;
    pi: ExtensionAPI;
  } {
    let captured:
      | ((event: UserBashEvent) => UserBashEventResult | undefined)
      | undefined;
    const pi = {
      on: vi.fn(
        (
          eventName: string,
          h: (event: UserBashEvent) => UserBashEventResult | undefined,
        ) => {
          if (eventName === "user_bash") captured = h;
        },
      ),
    } as unknown as ExtensionAPI;
    registerRtkBashHook(pi);
    if (!captured) throw new Error("user_bash handler not registered");
    return { handler: captured, pi };
  }

  it("returns operations when rtk is available + command is wrappable", () => {
    setRtkDetectorForTest(() => ({ available: true }));
    const { handler } = captureHandler();
    const result = handler({
      type: "user_bash",
      command: "ls -la",
      cwd: "/tmp",
      excludeFromContext: false,
    });
    expect(result).toBeDefined();
    expect(result?.operations).toBeDefined();
  });

  it("returns undefined (pass-through) when rtk is NOT available", () => {
    setRtkDetectorForTest(() => ({ available: false, reason: "not_on_path" }));
    const { handler } = captureHandler();
    const result = handler({
      type: "user_bash",
      command: "ls -la",
      cwd: "/tmp",
      excludeFromContext: false,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when command is already rtk-prefixed (idempotence)", () => {
    setRtkDetectorForTest(() => ({ available: true }));
    const { handler } = captureHandler();
    expect(
      handler({
        type: "user_bash",
        command: "rtk git status",
        cwd: "/tmp",
        excludeFromContext: false,
      }),
    ).toBeUndefined();
    expect(
      handler({
        type: "user_bash",
        command: "rtk gain",
        cwd: "/tmp",
        excludeFromContext: false,
      }),
    ).toBeUndefined();
  });
});
