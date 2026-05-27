// belmont update — refuses on dirty tree, shells out to npm install -g
// otherwise. Both spawn paths are dependency-injected so the test
// suite stays hermetic.

import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import {
  checkCleanWorkingTree,
  cmdUpdate,
  parseUpdateArgs,
} from "../src/update.js";

describe("parseUpdateArgs", () => {
  it("defaults to latest tag, no flags", () => {
    expect(parseUpdateArgs([])).toEqual({ allowDirty: false, dryRun: false, tag: "latest" });
  });
  it("accepts --allow-dirty + --dry-run + --tag", () => {
    expect(parseUpdateArgs(["--allow-dirty", "--dry-run", "--tag", "next"])).toEqual({
      allowDirty: true,
      dryRun: true,
      tag: "next",
    });
  });
  it("accepts --tag=<value> form", () => {
    expect(parseUpdateArgs(["--tag=rc"])).toEqual({
      allowDirty: false,
      dryRun: false,
      tag: "rc",
    });
  });
});

describe("checkCleanWorkingTree", () => {
  it("returns clean when git reports empty porcelain", () => {
    const fake = ((..._args: unknown[]) =>
      ({ status: 0, stdout: "", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    expect(checkCleanWorkingTree(".", fake)).toEqual({ clean: true });
  });
  it("returns clean when git command isn't available", () => {
    const fake = ((..._args: unknown[]) =>
      ({ status: null, stdout: "", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    expect(checkCleanWorkingTree(".", fake)).toEqual({ clean: true });
  });
  it("returns dirty + sample when porcelain emits lines", () => {
    const fake = ((..._args: unknown[]) =>
      ({ status: 0, stdout: " M src/foo.ts\n?? new.txt\n", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    const out = checkCleanWorkingTree(".", fake);
    expect(out.clean).toBe(false);
    if (!out.clean) {
      expect(out.reason).toContain("src/foo.ts");
      expect(out.reason).toContain("new.txt");
    }
  });
});

function makeFakeSpawn(exitCode: number) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const factory: any = (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const ee = new EventEmitter() as EventEmitter & { exitCode?: number };
    queueMicrotask(() => ee.emit("exit", exitCode));
    return ee;
  };
  return { factory, calls };
}

describe("cmdUpdate", () => {
  it("refuses on dirty tree without --allow-dirty", async () => {
    const fakeSync = ((..._args: unknown[]) =>
      ({ status: 0, stdout: " M src/a.ts\n", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    const { factory } = makeFakeSpawn(0);
    const out: string[] = [];
    const err: string[] = [];
    const result = await cmdUpdate({
      cwd: ".",
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      spawnFn: factory,
      spawnSyncFn: fakeSync,
    });
    expect(result.exitCode).toBe(2);
    expect(err.join("\n")).toContain("dirty working tree");
  });

  it("runs npm install -g on a clean tree", async () => {
    const fakeSync = ((..._args: unknown[]) =>
      ({ status: 0, stdout: "", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    const { factory, calls } = makeFakeSpawn(0);
    const out: string[] = [];
    const err: string[] = [];
    const result = await cmdUpdate({
      cwd: ".",
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      spawnFn: factory,
      spawnSyncFn: fakeSync,
    });
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe("npm");
    expect(calls[0]?.args).toEqual(["install", "-g", "@belmont/cli@latest"]);
    expect(out.some((l) => l.includes("npm install -g"))).toBe(true);
  });

  it("--dry-run prints the install command without spawning", async () => {
    const fakeSync = ((..._args: unknown[]) =>
      ({ status: 0, stdout: "", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    const { factory, calls } = makeFakeSpawn(0);
    const out: string[] = [];
    const result = await cmdUpdate({
      cwd: ".",
      out: (l) => out.push(l),
      err: () => undefined,
      args: ["--dry-run"],
      spawnFn: factory,
      spawnSyncFn: fakeSync,
    });
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(0);
    expect(out.some((l) => l.includes("(dry-run; not executing)"))).toBe(true);
  });

  it("--allow-dirty + --tag thread through to the spawn call", async () => {
    const fakeSync = ((..._args: unknown[]) =>
      ({ status: 0, stdout: " M dirty.ts\n", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    const { factory, calls } = makeFakeSpawn(0);
    const result = await cmdUpdate({
      cwd: ".",
      out: () => undefined,
      err: () => undefined,
      args: ["--allow-dirty", "--tag", "next"],
      spawnFn: factory,
      spawnSyncFn: fakeSync,
    });
    expect(result.exitCode).toBe(0);
    expect(calls[0]?.args).toEqual(["install", "-g", "@belmont/cli@next"]);
  });

  it("propagates non-zero exit codes from npm", async () => {
    const fakeSync = ((..._args: unknown[]) =>
      ({ status: 0, stdout: "", stderr: "" } as unknown)) as typeof import("node:child_process").spawnSync;
    const { factory } = makeFakeSpawn(123);
    const result = await cmdUpdate({
      cwd: ".",
      out: () => undefined,
      err: () => undefined,
      spawnFn: factory,
      spawnSyncFn: fakeSync,
    });
    expect(result.exitCode).toBe(123);
  });
});
