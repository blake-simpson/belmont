import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CTX_THRESHOLDS,
  classifyCtxLevel,
  ctxLevelGlyph,
  formatCtxStatus,
  readCtxThresholds,
} from "../src/tui/thresholds.js";

const tmpDirs: string[] = [];

async function makeRepo(modelsJson?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "belmont-thresholds-"));
  tmpDirs.push(root);
  await mkdir(join(root, ".belmont"), { recursive: true });
  if (modelsJson !== undefined) {
    await writeFile(join(root, ".belmont", "models.json"), modelsJson, "utf8");
  }
  return root;
}

afterEach(async () => {
  while (tmpDirs.length) {
    const root = tmpDirs.pop();
    if (root) await import("node:fs/promises").then((fs) => fs.rm(root, { recursive: true, force: true }));
  }
});

describe("classifyCtxLevel", () => {
  it("uses the §9.1 80k/120k boundaries by default (inclusive on upper)", () => {
    expect(classifyCtxLevel(0)).toBe("green");
    expect(classifyCtxLevel(79_999)).toBe("green");
    expect(classifyCtxLevel(80_000)).toBe("amber");
    expect(classifyCtxLevel(119_999)).toBe("amber");
    expect(classifyCtxLevel(120_000)).toBe("red");
    expect(classifyCtxLevel(200_000)).toBe("red");
  });

  it("null tokens (post-compaction) → unknown", () => {
    expect(classifyCtxLevel(null)).toBe("unknown");
  });

  it("non-finite tokens → unknown", () => {
    expect(classifyCtxLevel(Number.NaN)).toBe("unknown");
    expect(classifyCtxLevel(Number.POSITIVE_INFINITY)).toBe("unknown");
  });

  it("respects custom thresholds", () => {
    const custom = { amber: 50_000, red: 100_000 };
    expect(classifyCtxLevel(49_999, custom)).toBe("green");
    expect(classifyCtxLevel(50_000, custom)).toBe("amber");
    expect(classifyCtxLevel(99_999, custom)).toBe("amber");
    expect(classifyCtxLevel(100_000, custom)).toBe("red");
  });
});

describe("ctxLevelGlyph", () => {
  it("returns the v2.3 §6.1 traffic-light glyphs", () => {
    expect(ctxLevelGlyph("green")).toBe("🟢");
    expect(ctxLevelGlyph("amber")).toBe("🟡");
    expect(ctxLevelGlyph("red")).toBe("🔴");
    expect(ctxLevelGlyph("unknown")).toBe("·");
  });
});

describe("formatCtxStatus", () => {
  it("renders 'ctx NNk 🟢' for known token counts", () => {
    expect(formatCtxStatus(42_000)).toBe("ctx 42k 🟢");
    expect(formatCtxStatus(80_000)).toBe("ctx 80k 🟡");
    expect(formatCtxStatus(125_000)).toBe("ctx 125k 🔴");
  });

  it("renders 'ctx — ·' when tokens unknown (post-compaction)", () => {
    expect(formatCtxStatus(null)).toBe("ctx — ·");
  });

  it("rounds tokens to the nearest 1k", () => {
    expect(formatCtxStatus(42_499)).toBe("ctx 42k 🟢");
    expect(formatCtxStatus(42_500)).toBe("ctx 43k 🟢");
  });
});

describe("readCtxThresholds", () => {
  it("returns §9.1 defaults when models.json is absent", async () => {
    const root = await makeRepo();
    expect(await readCtxThresholds(root)).toEqual(DEFAULT_CTX_THRESHOLDS);
  });

  it("returns defaults when models.json is invalid JSON", async () => {
    const root = await makeRepo("{not json");
    expect(await readCtxThresholds(root)).toEqual(DEFAULT_CTX_THRESHOLDS);
  });

  it("returns defaults when ctx_thresholds is missing", async () => {
    const root = await makeRepo(JSON.stringify({ tiers: {} }));
    expect(await readCtxThresholds(root)).toEqual(DEFAULT_CTX_THRESHOLDS);
  });

  it("returns parsed values when ctx_thresholds is present and valid", async () => {
    const root = await makeRepo(JSON.stringify({ ctx_thresholds: { amber: 60_000, red: 90_000 } }));
    expect(await readCtxThresholds(root)).toEqual({ amber: 60_000, red: 90_000 });
  });

  it("falls back per-field when one value is non-numeric", async () => {
    const root = await makeRepo(JSON.stringify({ ctx_thresholds: { amber: "lol", red: 100_000 } }));
    expect(await readCtxThresholds(root)).toEqual({ amber: DEFAULT_CTX_THRESHOLDS.amber, red: 100_000 });
  });

  it("swaps amber/red if user writes them backwards", async () => {
    const root = await makeRepo(JSON.stringify({ ctx_thresholds: { amber: 150_000, red: 60_000 } }));
    expect(await readCtxThresholds(root)).toEqual({ amber: 60_000, red: 150_000 });
  });
});
