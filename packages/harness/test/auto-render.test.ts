// auto/render.ts — formatter contracts (pure).

import { describe, expect, it, vi } from "vitest";

import {
  emitWorkerMessage,
  formatWorkerBody,
  formatWorkerHeadline,
  registerWorkerRenderer,
  WORKER_CUSTOM_TYPE,
} from "../src/auto/render.js";

describe("formatWorkerHeadline", () => {
  it("uses the per-kind prefix default", () => {
    expect(
      formatWorkerHeadline({
        kind: "phase_start",
        headline: "M2/P0-1 implement → session ab",
      }),
    ).toBe("▶ M2/P0-1 implement → session ab");
  });

  it("uses the explicit prefix when provided", () => {
    expect(
      formatWorkerHeadline({
        kind: "phase_end",
        prefix: "✗",
        headline: "M2/P0-1 implement failed",
      }),
    ).toBe("✗ M2/P0-1 implement failed");
  });
});

describe("formatWorkerBody", () => {
  it("returns empty string when body + details are absent", () => {
    expect(formatWorkerBody({ kind: "text", headline: "hi" })).toBe("");
  });

  it("includes body then details, skipping undefined details", () => {
    const out = formatWorkerBody({
      kind: "phase_start",
      headline: "x",
      body: "context line",
      details: { phase: "implement", session: "abc1234", thinking: undefined },
    });
    expect(out).toContain("context line");
    expect(out).toContain("phase: implement");
    expect(out).toContain("session: abc1234");
    expect(out).not.toContain("thinking:");
  });
});

describe("registerWorkerRenderer", () => {
  it("registers under the belmont.worker customType", () => {
    const registerMessageRenderer = vi.fn();
    registerWorkerRenderer({ registerMessageRenderer } as unknown as Parameters<
      typeof registerWorkerRenderer
    >[0]);
    expect(registerMessageRenderer).toHaveBeenCalledWith(
      WORKER_CUSTOM_TYPE,
      expect.any(Function),
    );
  });
});

describe("emitWorkerMessage", () => {
  it("sends a belmont.worker custom message with the formatted headline", () => {
    const sendMessage = vi.fn();
    emitWorkerMessage(
      { sendMessage } as unknown as Parameters<typeof emitWorkerMessage>[0],
      { kind: "phase_end", headline: "M1/P0-1 verify ✓", color: "success" },
    );
    expect(sendMessage).toHaveBeenCalledWith({
      customType: WORKER_CUSTOM_TYPE,
      content: "✓ M1/P0-1 verify ✓",
      display: true,
      details: expect.objectContaining({ kind: "phase_end", color: "success" }),
    });
  });
});
