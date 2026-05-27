import { afterEach, describe, expect, it } from "vitest";

import {
  formatBytes,
  getRtkSummary,
  recordRtkSavings,
  resetRtkStats,
} from "../src/state/rtk-stats.js";

describe("rtk-stats singleton", () => {
  afterEach(() => {
    resetRtkStats();
  });

  it("getRtkSummary returns undefined before any records", () => {
    expect(getRtkSummary()).toBeUndefined();
  });

  it("accumulates savedBytes / originalBytes / commandCount across records", () => {
    recordRtkSavings({ savedBytes: 500, originalBytes: 1000 });
    recordRtkSavings({ savedBytes: 300, originalBytes: 600 });
    const summary = getRtkSummary();
    expect(summary).toEqual({
      savedBytes: 800,
      originalBytes: 1600,
      percent: 50,
      commandCount: 2,
    });
  });

  it("rounds the percent to an integer", () => {
    recordRtkSavings({ savedBytes: 333, originalBytes: 1000 });
    expect(getRtkSummary()?.percent).toBe(33);
  });

  it("clamps savedBytes > originalBytes (defends against malformed trailer)", () => {
    recordRtkSavings({ savedBytes: 9999, originalBytes: 1000 });
    const summary = getRtkSummary();
    expect(summary?.savedBytes).toBe(1000);
    expect(summary?.percent).toBe(100);
  });

  it("clamps negative bytes to zero", () => {
    recordRtkSavings({ savedBytes: -50, originalBytes: -100 });
    const summary = getRtkSummary();
    expect(summary?.savedBytes).toBe(0);
    expect(summary?.originalBytes).toBe(0);
    expect(summary?.commandCount).toBe(1);
  });

  it("resetRtkStats wipes the counter", () => {
    recordRtkSavings({ savedBytes: 100, originalBytes: 200 });
    expect(getRtkSummary()).toBeDefined();
    resetRtkStats();
    expect(getRtkSummary()).toBeUndefined();
  });

  it("percent is 0 when originalBytes is 0 across all records", () => {
    recordRtkSavings({ savedBytes: 0, originalBytes: 0 });
    const summary = getRtkSummary();
    expect(summary?.percent).toBe(0);
    expect(summary?.commandCount).toBe(1);
  });
});

describe("formatBytes", () => {
  it("renders single-byte counts as `<N>B`", () => {
    expect(formatBytes(0)).toBe("0B");
    expect(formatBytes(1023)).toBe("1023B");
  });

  it("renders kilobyte counts with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0K");
    expect(formatBytes(2048)).toBe("2.0K");
    expect(formatBytes(1536)).toBe("1.5K");
  });

  it("renders megabyte counts with one decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0M");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5M");
  });

  it("renders gigabyte counts with one decimal", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0G");
  });
});
