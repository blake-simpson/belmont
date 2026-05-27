// auto/steering.ts — consume-and-prepend contract (v2.3 §7.2, D-008).

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  consumeSteeringFile,
  steeringFilePath,
  writeSteeringFile,
} from "../src/auto/steering.js";

let CWD = "";

beforeEach(async () => {
  CWD = await mkdtemp(join(tmpdir(), "belmont-steering-"));
});
afterEach(async () => {
  await rm(CWD, { recursive: true, force: true });
});

describe("consumeSteeringFile", () => {
  it("returns undefined when no steering file exists", async () => {
    expect(await consumeSteeringFile(CWD)).toBeUndefined();
  });

  it("returns trimmed text + deletes the file when present", async () => {
    await mkdir(join(CWD, ".belmont/memory/steering"), { recursive: true });
    await writeFile(steeringFilePath(CWD), "  use the existing user model  \n", "utf8");
    const text = await consumeSteeringFile(CWD);
    expect(text).toBe("use the existing user model");
    await expect(stat(steeringFilePath(CWD))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats whitespace-only file as no steering (still deletes)", async () => {
    await mkdir(join(CWD, ".belmont/memory/steering"), { recursive: true });
    await writeFile(steeringFilePath(CWD), "\n   \n", "utf8");
    const text = await consumeSteeringFile(CWD);
    expect(text).toBeUndefined();
    await expect(stat(steeringFilePath(CWD))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("writeSteeringFile", () => {
  it("replaces (not appends) the steering body", async () => {
    await writeSteeringFile(CWD, "first message");
    await writeSteeringFile(CWD, "second message overrides first");
    const body = await readFile(steeringFilePath(CWD), "utf8");
    expect(body.trim()).toBe("second message overrides first");
  });

  it("creates the memory/steering/ directory if absent", async () => {
    await writeSteeringFile(CWD, "ok");
    const stats = await stat(steeringFilePath(CWD));
    expect(stats.isFile()).toBe(true);
  });
});
