// /belmont:mcp doctor + refresh — formatter tests.
//
// The command's handler is exercised end-to-end via the formatter
// helpers it exports. The mutating subcommand (refresh) is verified
// via the adapter integration in mcp-adapter.test.ts.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatDoctorReport, formatRefreshReport } from "../src/commands/mcp.js";
import { writeToolsCache, sha1 } from "../src/mcp/cache.js";

let CWD = "";

beforeEach(async () => {
  CWD = await mkdtemp(join(tmpdir(), "belmont-mcp-cmd-"));
});
afterEach(async () => {
  await rm(CWD, { recursive: true, force: true });
  delete process.env.BELMONT_AUTO_MODE;
});

async function writeMcpJson(body: object): Promise<void> {
  await mkdir(join(CWD, ".belmont"), { recursive: true });
  await writeFile(join(CWD, ".belmont", "mcp.json"), JSON.stringify(body, null, 2), "utf8");
}

describe("formatDoctorReport", () => {
  it("surfaces the no-mcp-json case clearly", async () => {
    const out = await formatDoctorReport(CWD);
    expect(out).toContain("no .belmont/mcp.json");
  });

  it("reports parse errors with diagnostics", async () => {
    await mkdir(join(CWD, ".belmont"), { recursive: true });
    await writeFile(join(CWD, ".belmont", "mcp.json"), "{ not json", "utf8");
    const out = await formatDoctorReport(CWD);
    expect(out).toContain(".belmont/mcp.json invalid");
    expect(out).toContain("MCP_JSON_PARSE_ERROR");
  });

  it("lists each server with auto + lifecycle flags", async () => {
    await writeMcpJson({
      mcpServers: {
        github: { url: "https://mcp.github.example", auto: true, lifecycle: "eager" },
        playwright: { command: "npx", args: ["server-playwright"] },
      },
    });
    const out = await formatDoctorReport(CWD);
    expect(out).toContain("github");
    expect(out).toContain("auto:yes");
    expect(out).toContain("eager");
    expect(out).toContain("playwright");
    expect(out).toContain("auto:no");
    expect(out).toContain("lazy");
  });

  it("highlights excluded servers under auto mode", async () => {
    process.env.BELMONT_AUTO_MODE = "1";
    await writeMcpJson({
      mcpServers: {
        safe: { command: "x", auto: true },
        risky: { command: "y" },
      },
    });
    const out = await formatDoctorReport(CWD);
    expect(out).toContain("auto (BELMONT_AUTO_MODE=1)");
    expect(out).toContain("Excluded (no auto:true): risky");
  });

  it("shows cache status: missing → fresh → stale", async () => {
    await writeMcpJson({ mcpServers: { x: { command: "x-bin" } } });

    let out = await formatDoctorReport(CWD);
    expect(out).toContain("Cache: missing");

    const sourceSha1 = sha1(
      JSON.stringify({ mcpServers: { x: { command: "x-bin" } } }, null, 2),
    );
    await writeToolsCache(CWD, {
      version: 1,
      sourceSha1,
      entries: { x: { discoveredAt: "2026-05-27T15:00:00Z", configHash: "hash", tools: [] } },
    });
    out = await formatDoctorReport(CWD);
    expect(out).toContain("Cache: fresh");

    // Mutate mcp.json so the stored sha1 no longer matches.
    await writeMcpJson({ mcpServers: { x: { command: "y-bin" } } });
    out = await formatDoctorReport(CWD);
    expect(out).toContain("Cache: STALE");
  });

  it("surfaces parser warnings (e.g. auto+lazy combination)", async () => {
    await writeMcpJson({
      mcpServers: {
        risky: { command: "x", auto: true /* lifecycle defaults to lazy */ },
      },
    });
    const out = await formatDoctorReport(CWD);
    expect(out).toContain("MCP_AUTO_LAZY");
  });
});

describe("formatRefreshReport", () => {
  it("summarises a successful registration", () => {
    const out = formatRefreshReport({
      toolCount: 3,
      results: {
        github: { kind: "registered", tools: 2, fromCache: false },
        playwright: { kind: "registered", tools: 1, fromCache: true },
      },
    });
    expect(out).toContain("3 tools registered");
    expect(out).toContain("github: 2 tools (probed)");
    expect(out).toContain("playwright: 1 tool (from cache)");
  });

  it("calls out failed + skipped servers", () => {
    const out = formatRefreshReport({
      toolCount: 0,
      results: {
        broken: { kind: "failed", reason: "ENOENT: no such command" },
        skipped: { kind: "skipped-no-auto" },
      },
    });
    expect(out).toContain("broken: FAILED — ENOENT");
    expect(out).toContain("skipped: skipped");
  });
});
