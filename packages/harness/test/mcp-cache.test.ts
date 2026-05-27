// §12.4 cache R/W + invalidation.

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearToolsCache,
  readToolsCache,
  serverConfigHash,
  sha1,
  toolsCachePath,
  writeToolsCache,
  type ToolsCache,
} from "../src/mcp/cache.js";

let CWD = "";

beforeEach(async () => {
  CWD = await mkdtemp(join(tmpdir(), "belmont-mcp-cache-"));
});
afterEach(async () => {
  await rm(CWD, { recursive: true, force: true });
});

const sample: ToolsCache = {
  version: 1,
  sourceSha1: sha1("mcp.json contents"),
  entries: {
    playwright: {
      discoveredAt: "2026-05-27T15:00:00.000Z",
      configHash: serverConfigHash({ type: "stdio", command: "npx" }),
      tools: [{ name: "screenshot", description: "Take a screenshot", inputSchema: {} }],
    },
  },
};

describe("tools cache R/W", () => {
  it("readToolsCache returns undefined on missing file", async () => {
    expect(await readToolsCache(CWD)).toBeUndefined();
  });

  it("writeToolsCache + readToolsCache round-trip", async () => {
    await writeToolsCache(CWD, sample);
    expect(await readToolsCache(CWD)).toEqual(sample);
  });

  it("write uses atomic tmp+rename (no .tmp leftover)", async () => {
    await writeToolsCache(CWD, sample);
    const files = (await import("node:fs/promises")).readdir(join(CWD, ".belmont"));
    const names = await files;
    expect(names.filter((n) => n.includes(".tmp"))).toEqual([]);
    expect(names).toContain("mcp-tools-cache.json");
    const body = await readFile(toolsCachePath(CWD), "utf8");
    expect(body.endsWith("\n")).toBe(true);
  });

  it("clearToolsCache removes the file (idempotent on missing)", async () => {
    await writeToolsCache(CWD, sample);
    await clearToolsCache(CWD);
    await expect(stat(toolsCachePath(CWD))).rejects.toMatchObject({ code: "ENOENT" });
    await clearToolsCache(CWD); // idempotent
  });

  it("returns undefined on malformed JSON", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(CWD, ".belmont"), { recursive: true });
    await writeFile(toolsCachePath(CWD), "not json {", "utf8");
    expect(await readToolsCache(CWD)).toBeUndefined();
  });

  it("returns undefined when the cache version is unknown (forward-compat skip)", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(CWD, ".belmont"), { recursive: true });
    await writeFile(
      toolsCachePath(CWD),
      JSON.stringify({ version: 99, sourceSha1: "x", entries: {} }),
      "utf8",
    );
    expect(await readToolsCache(CWD)).toBeUndefined();
  });
});

describe("serverConfigHash", () => {
  it("is deterministic for the same input", () => {
    const a = { type: "stdio", command: "npx", args: ["x"] };
    expect(serverConfigHash(a)).toBe(serverConfigHash(a));
  });

  it("changes when the input changes (cache busts on `${VAR}` resolution change)", () => {
    const before = serverConfigHash({ env: { TOKEN: "old" } });
    const after = serverConfigHash({ env: { TOKEN: "new" } });
    expect(before).not.toBe(after);
  });
});

describe("sha1", () => {
  it("is the standard hex sha1", () => {
    expect(sha1("hello")).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  });
});

describe("§12.4 invalidation contract", () => {
  it("mcp.json content change → sourceSha1 differs → caller knows to re-probe", async () => {
    const oldBody = JSON.stringify({ mcpServers: { x: { command: "a" } } });
    const newBody = JSON.stringify({ mcpServers: { x: { command: "b" } } });
    expect(sha1(oldBody)).not.toBe(sha1(newBody));
  });
});
