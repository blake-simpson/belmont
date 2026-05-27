// state/auto-json.ts — atomic ledger R/W (v2.3 §4.3).

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  autoJsonPath,
  autoStopExists,
  autoStopPath,
  clearAutoJson,
  consumeAutoStop,
  patchAutoJson,
  readAutoJson,
  writeAutoJson,
  writeAutoStop,
} from "../src/state/auto-json.js";

let CWD = "";

beforeEach(async () => {
  CWD = await mkdtemp(join(tmpdir(), "belmont-auto-json-"));
});
afterEach(async () => {
  await rm(CWD, { recursive: true, force: true });
});

describe("auto.json", () => {
  it("readAutoJson returns undefined for a missing file", async () => {
    expect(await readAutoJson(CWD)).toBeUndefined();
  });

  it("writeAutoJson + readAutoJson round-trips state", async () => {
    const state = {
      currentMilestone: "M2",
      currentTaskId: "P0-1",
      paused: false,
      stopRequested: false,
      workerSessionId: "abc123",
      startedAt: "2026-05-27T15:00:00Z",
    };
    await writeAutoJson(CWD, state);
    expect(await readAutoJson(CWD)).toEqual(state);
  });

  it("writeAutoJson uses atomic tmp+rename (no temp leftover)", async () => {
    await writeAutoJson(CWD, {
      currentMilestone: "M1",
      paused: false,
      stopRequested: false,
      startedAt: "2026-05-27T15:00:00Z",
    });
    const body = await readFile(autoJsonPath(CWD), "utf8");
    expect(body.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(body) as { currentMilestone: string };
    expect(parsed.currentMilestone).toBe("M1");
  });

  it("patchAutoJson updates specific fields without losing others", async () => {
    await writeAutoJson(CWD, {
      currentMilestone: "M2",
      currentTaskId: "P0-1",
      paused: false,
      stopRequested: false,
      startedAt: "2026-05-27T15:00:00Z",
    });
    const next = await patchAutoJson(CWD, { paused: true, currentTaskId: "P0-2" });
    expect(next).toMatchObject({
      currentMilestone: "M2",
      currentTaskId: "P0-2",
      paused: true,
      startedAt: "2026-05-27T15:00:00Z",
    });
  });

  it("patchAutoJson is a noop on missing file", async () => {
    const next = await patchAutoJson(CWD, { paused: true });
    expect(next).toBeUndefined();
  });

  it("clearAutoJson removes the file (idempotent on missing)", async () => {
    await writeAutoJson(CWD, {
      currentMilestone: "M3",
      paused: false,
      stopRequested: false,
      startedAt: "2026-05-27T15:00:00Z",
    });
    await clearAutoJson(CWD);
    await expect(stat(autoJsonPath(CWD))).rejects.toMatchObject({ code: "ENOENT" });
    // Idempotent — second call doesn't throw.
    await clearAutoJson(CWD);
  });

  it("returns undefined on malformed JSON (instead of throwing)", async () => {
    await writeAutoJson(CWD, {
      currentMilestone: "M1",
      paused: false,
      stopRequested: false,
      startedAt: "2026-05-27T15:00:00Z",
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(autoJsonPath(CWD), "{ not valid json", "utf8");
    expect(await readAutoJson(CWD)).toBeUndefined();
  });
});

describe("auto.stop sentinel", () => {
  it("writeAutoStop + autoStopExists + consumeAutoStop round-trip", async () => {
    expect(await autoStopExists(CWD)).toBe(false);
    await writeAutoStop(CWD);
    expect(await autoStopExists(CWD)).toBe(true);
    expect(await consumeAutoStop(CWD)).toBe(true);
    expect(await autoStopExists(CWD)).toBe(false);
    expect(await consumeAutoStop(CWD)).toBe(false);
  });

  it("autoStopPath() returns the .belmont/auto.stop path", () => {
    expect(autoStopPath(CWD)).toBe(join(CWD, ".belmont/auto.stop"));
  });
});
