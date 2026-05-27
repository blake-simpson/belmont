import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCompactionBullet,
  extractLastAssistantLines,
  registerSessionBeforeCompactHook,
} from "../src/hooks/session-before-compact.js";
import type {
  ExtensionAPI,
  SessionBeforeCompactEvent,
} from "../src/pi/sdk.js";

describe("buildCompactionBullet", () => {
  it("renders a compact one-line bullet with all fields", () => {
    const out = buildCompactionBullet({
      tokensBefore: 95_432,
      toSummarizeCount: 40,
      turnPrefixCount: 8,
      lastAssistantLines: ["line one", "line two"],
    });
    expect(out).toContain("tokensBefore=95,432");
    expect(out).toContain("messages=48");
    expect(out).toContain("toSummarize=40");
    expect(out).toContain("kept=8");
    expect(out).toContain('"line one"');
    expect(out).toContain('"line two"');
  });

  it("truncates each preview line at 80 chars with ellipsis", () => {
    const long = "x".repeat(100);
    const out = buildCompactionBullet({
      tokensBefore: 0,
      toSummarizeCount: 0,
      turnPrefixCount: 0,
      lastAssistantLines: [long],
    });
    // The truncated form keeps 77 chars then appends "..." → 80 chars
    // before JSON.stringify wraps in quotes.
    expect(out).toMatch(/"x{77}\.\.\."/);
  });

  it("caps preview lines at 3 even when more are supplied", () => {
    const bullet = buildCompactionBullet({
      tokensBefore: 0,
      toSummarizeCount: 0,
      turnPrefixCount: 0,
      lastAssistantLines: ["a", "b", "c", "d", "e"],
    });
    expect((bullet.match(/"/g) ?? []).length).toBe(6); // 3 strings × 2 quotes
  });

  it("handles an empty preview-lines array gracefully", () => {
    const bullet = buildCompactionBullet({
      tokensBefore: 0,
      toSummarizeCount: 0,
      turnPrefixCount: 0,
      lastAssistantLines: [],
    });
    expect(bullet).toContain("lastAssistantLines=[]");
  });
});

describe("extractLastAssistantLines", () => {
  it("returns the first text line of up to N most-recent assistant messages", () => {
    const entries = [
      { message: { role: "user", content: "q", timestamp: 0 } },
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "answer one\nmore" }],
        },
      },
      { message: { role: "user", content: "q2", timestamp: 0 } },
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "answer two" }],
        },
      },
    ] as SessionBeforeCompactEvent["preparation"]["messagesToSummarize"];
    expect(extractLastAssistantLines(entries, 3)).toEqual([
      "answer one",
      "answer two",
    ]);
  });

  it("skips entries with no assistant text block", () => {
    const entries = [
      {
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: "private" }],
        },
      },
      {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "visible" }],
        },
      },
    ] as SessionBeforeCompactEvent["preparation"]["messagesToSummarize"];
    expect(extractLastAssistantLines(entries, 3)).toEqual(["visible"]);
  });

  it("respects the N cap when more assistant messages exist", () => {
    const make = (n: number) => ({
      message: {
        role: "assistant",
        content: [{ type: "text", text: `line ${n}` }],
      },
    });
    const entries = [make(1), make(2), make(3), make(4), make(5)] as SessionBeforeCompactEvent["preparation"]["messagesToSummarize"];
    const lines = extractLastAssistantLines(entries, 2);
    expect(lines).toEqual(["line 4", "line 5"]);
  });
});

describe("registerSessionBeforeCompactHook", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "belmont-m9-compact-"));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function captureHandler() {
    let captured: ((event: SessionBeforeCompactEvent, ctx: unknown) => Promise<unknown>) | undefined;
    const pi = {
      on: vi.fn(
        (
          name: string,
          h: (event: SessionBeforeCompactEvent, ctx: unknown) => Promise<unknown>,
        ) => {
          if (name === "session_before_compact") captured = h;
        },
      ),
    } as unknown as ExtensionAPI;
    registerSessionBeforeCompactHook(pi);
    if (!captured) throw new Error("session_before_compact handler not registered");
    return captured;
  }

  it("writes an episodic bullet then returns undefined", async () => {
    const handler = captureHandler();
    const ctx = {
      cwd: tmpDir,
      ui: { notify: vi.fn() },
    };
    const result = await handler(
      {
        type: "session_before_compact",
        preparation: {
          tokensBefore: 12_345,
          messagesToSummarize: [
            {
              message: {
                role: "assistant",
                content: [{ type: "text", text: "answer one" }],
              },
            },
          ],
          turnPrefixMessages: [],
          firstKeptEntryId: "id-0",
        } as unknown as SessionBeforeCompactEvent["preparation"],
        branchEntries: [],
        signal: new AbortController().signal,
      } as unknown as SessionBeforeCompactEvent,
      ctx,
    );
    expect(result).toBeUndefined();

    // Assert the file got written.
    const today = new Date().toISOString().slice(0, 10);
    const file = join(
      tmpDir,
      ".belmont",
      "memory",
      "episodic",
      `${today}-auto-compactions.md`,
    );
    const body = await readFile(file, "utf8");
    expect(body).toContain("schema: belmont.episode.v1");
    expect(body).toContain("[phase]");
    expect(body).toContain("tokensBefore=12,345");
    expect(body).toContain('"answer one"');
  });

  it("notifies on write failure but still returns undefined (compaction proceeds)", async () => {
    const handler = captureHandler();
    const notify = vi.fn();
    // Force write failure by pointing cwd at a non-existent path that
    // mkdir can't create (use a file as a parent dir).
    const badCwd = join(tmpDir, "is-a-file");
    // Create a regular file at badCwd so mkdir hits ENOTDIR.
    await (await import("node:fs/promises")).writeFile(badCwd, "");
    const result = await handler(
      {
        type: "session_before_compact",
        preparation: {
          tokensBefore: 0,
          messagesToSummarize: [],
          turnPrefixMessages: [],
          firstKeptEntryId: "id-0",
        } as unknown as SessionBeforeCompactEvent["preparation"],
        branchEntries: [],
        signal: new AbortController().signal,
      } as unknown as SessionBeforeCompactEvent,
      { cwd: badCwd, ui: { notify } },
    );
    expect(result).toBeUndefined();
    expect(notify).toHaveBeenCalledOnce();
    expect((notify.mock.calls[0] as unknown[])[1]).toBe("warning");
  });
});
