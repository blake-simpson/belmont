// §12.4 audit log + auto.json#mcp spine.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordMcpInvocation, recordMcpServersForAutoRun } from "../src/mcp/audit.js";
import { readAutoJson, writeAutoJson } from "../src/state/auto-json.js";

let CWD = "";

beforeEach(async () => {
  CWD = await mkdtemp(join(tmpdir(), "belmont-mcp-audit-"));
});
afterEach(async () => {
  await rm(CWD, { recursive: true, force: true });
});

const today = new Date().toISOString().slice(0, 10);

async function readTodayMcpEpisodic(): Promise<string> {
  return readFile(
    join(CWD, ".belmont", "memory", "episodic", `${today}-mcp-tools.md`),
    "utf8",
  );
}

describe("recordMcpInvocation", () => {
  it("creates today's mcp-tools episodic with the first invocation", async () => {
    await recordMcpInvocation({
      cwd: CWD,
      server: "playwright",
      tool: "screenshot",
      autoMode: false,
      outcome: "ok",
    });
    const body = await readTodayMcpEpisodic();
    expect(body).toContain("schema: belmont.episode.v1");
    expect(body).toContain("playwright/screenshot");
    expect(body).toContain("auto=no");
    expect(body).toContain("outcome=ok");
  });

  it("appends a bullet on subsequent invocations", async () => {
    await recordMcpInvocation({
      cwd: CWD,
      server: "playwright",
      tool: "screenshot",
      autoMode: false,
      outcome: "ok",
    });
    await recordMcpInvocation({
      cwd: CWD,
      server: "github",
      tool: "search-issues",
      autoMode: true,
      outcome: "error",
      errorMessage: "auth failed",
      durationMs: 1234,
    });
    const body = await readTodayMcpEpisodic();
    expect(body).toMatch(/playwright\/screenshot/);
    expect(body).toMatch(/github\/search-issues/);
    expect(body).toMatch(/auto=yes/);
    expect(body).toMatch(/err=auth failed/);
    expect(body).toMatch(/dur=1234ms/);
  });

  it("records refused-not-auto outcome distinctly (for forensic trail)", async () => {
    await recordMcpInvocation({
      cwd: CWD,
      server: "playwright",
      tool: "screenshot",
      autoMode: true,
      outcome: "refused-not-auto",
    });
    const body = await readTodayMcpEpisodic();
    expect(body).toContain("outcome=refused-not-auto");
  });

  it("truncates very long error messages to keep the bullet readable", async () => {
    const huge = "x".repeat(500);
    await recordMcpInvocation({
      cwd: CWD,
      server: "x",
      tool: "y",
      autoMode: false,
      outcome: "error",
      errorMessage: huge,
    });
    const body = await readTodayMcpEpisodic();
    expect(body).toMatch(/err=x+…/);
    expect(body.length).toBeLessThan(700);
  });
});

describe("recordMcpServersForAutoRun", () => {
  it("no-op when auto.json is absent (interactive REPL path)", async () => {
    await recordMcpServersForAutoRun(CWD, [
      { name: "x", type: "stdio", auto: true },
    ]);
    expect(await readAutoJson(CWD)).toBeUndefined();
  });

  it("patches auto.json#mcp when running under auto", async () => {
    await writeAutoJson(CWD, {
      currentMilestone: "M2",
      paused: false,
      stopRequested: false,
      startedAt: "2026-05-27T15:00:00Z",
    });
    await recordMcpServersForAutoRun(CWD, [
      { name: "github", type: "http", auto: true },
      { name: "playwright", type: "stdio", auto: false },
    ]);
    const next = await readAutoJson(CWD);
    expect(next?.mcp).toEqual([
      { name: "github", type: "http", auto: true },
      { name: "playwright", type: "stdio", auto: false },
    ]);
  });

  it("preserves other auto.json fields on patch", async () => {
    await writeAutoJson(CWD, {
      currentMilestone: "M2",
      currentTaskId: "P0-3",
      paused: true,
      stopRequested: false,
      workerSessionId: "abc",
      startedAt: "2026-05-27T15:00:00Z",
    });
    await recordMcpServersForAutoRun(CWD, [
      { name: "x", type: "stdio", auto: true },
    ]);
    const next = await readAutoJson(CWD);
    expect(next).toMatchObject({
      currentMilestone: "M2",
      currentTaskId: "P0-3",
      paused: true,
      workerSessionId: "abc",
      mcp: [{ name: "x", type: "stdio", auto: true }],
    });
  });
});
