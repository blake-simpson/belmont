// rewriteScriptFlag tests — §18 step 4/6/8 lifeline.
//
// `belmont --script "<text>"` MUST translate to pi's native
// `--print "<text>"` exactly once, with all other argv preserved
// verbatim. Pi already supports `--print|-p <message>` (pi 0.75.5
// cli/args.js); we're just renaming the flag so the smoke script
// reads as `belmont --script "/belmont:foo"`.

import { describe, expect, it } from "vitest";
import { rewriteScriptFlag, runWith } from "../src/run.js";

describe("rewriteScriptFlag", () => {
  it("rewrites --script <text> → --print <text>", () => {
    const out = rewriteScriptFlag(["--script", "/belmont:status"]);
    expect(out.argv).toEqual(["--print", "/belmont:status"]);
    expect(out.rewrote).toBe(true);
    expect(out.message).toBe("/belmont:status");
  });

  it("rewrites --script=<text> form too", () => {
    const out = rewriteScriptFlag(["--script=/belmont:auto M1"]);
    expect(out.argv).toEqual(["--print", "/belmont:auto M1"]);
    expect(out.rewrote).toBe(true);
    expect(out.message).toBe("/belmont:auto M1");
  });

  it("preserves preceding + following argv unchanged", () => {
    const out = rewriteScriptFlag(["--theme", "dark", "--script", "/belmont:plan", "--verbose"]);
    expect(out.argv).toEqual(["--theme", "dark", "--print", "/belmont:plan", "--verbose"]);
    expect(out.rewrote).toBe(true);
  });

  it("only rewrites the first --script; later occurrences pass through", () => {
    const out = rewriteScriptFlag(["--script", "/a", "--script", "/b"]);
    expect(out.argv).toEqual(["--print", "/a", "--script", "/b"]);
    expect(out.rewrote).toBe(true);
    expect(out.message).toBe("/a");
  });

  it("passes through --script with no following arg (pi will error)", () => {
    const out = rewriteScriptFlag(["--script"]);
    expect(out.argv).toEqual(["--script"]);
    expect(out.rewrote).toBe(false);
  });

  it("is a no-op when --script absent", () => {
    const out = rewriteScriptFlag(["--theme", "dark", "/belmont:status"]);
    expect(out.argv).toEqual(["--theme", "dark", "/belmont:status"]);
    expect(out.rewrote).toBe(false);
  });
});

describe("runWith integration — --script is forwarded as --print", () => {
  it("calls the injected launcher with the rewritten argv", async () => {
    const captured: string[][] = [];
    const out: string[] = [];
    const err: string[] = [];
    const result = await runWith({
      argv: ["--script", "/belmont:status"],
      cwd: process.cwd(),
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      launch: async (args) => {
        captured.push([...args]);
      },
    });
    expect(result.exitCode).toBe(0);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(["--print", "/belmont:status"]);
  });

  it("forwards a no-script invocation unchanged", async () => {
    const captured: string[][] = [];
    const result = await runWith({
      argv: ["--verbose"],
      cwd: process.cwd(),
      out: () => undefined,
      err: () => undefined,
      launch: async (args) => {
        captured.push([...args]);
      },
    });
    expect(result.exitCode).toBe(0);
    expect(captured[0]).toEqual(["--verbose"]);
  });

  it("--version prints exactly `belmont 1.0.0`", async () => {
    const out: string[] = [];
    const result = await runWith({
      argv: ["--version"],
      cwd: process.cwd(),
      out: (l) => out.push(l),
      err: () => undefined,
      launch: async () => undefined,
    });
    expect(result.exitCode).toBe(0);
    expect(out).toEqual(["belmont 1.0.0"]);
  });
});
