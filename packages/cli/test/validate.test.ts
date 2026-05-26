// cmdValidate CLI wrapper — verifies exit codes against
// runBelmontValidate's report shape.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cmdValidate } from "../src/validate.js";

let TMP = "";

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "belmont-cli-validate-test-"));
});
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

const captureLines = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    log: (line: string) => out.push(line),
    error: (line: string) => err.push(line),
  };
};

async function seed(rel: string, content: string): Promise<void> {
  const abs = join(TMP, rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content, "utf8");
}

describe("cmdValidate", () => {
  it("exits 2 when .belmont/ is missing", async () => {
    const cap = captureLines();
    const result = await cmdValidate(undefined, {
      cwd: TMP,
      out: cap.log,
      err: cap.error,
    });
    expect(result.exitCode).toBe(2);
    expect(cap.err.join("\n")).toContain("BELMONT_DIR_MISSING");
  });

  it("exits 0 and prints OK on a clean tree", async () => {
    await seed(
      ".belmont/BELMONT.md",
      [
        "---",
        "schema: belmont.entrypoint.v1",
        "updated_at: 2026-05-26",
        "---",
        "",
        "# Project",
        "",
        "## Master PRD",
        "",
        "## Memory map",
        "",
      ].join("\n"),
    );
    await seed(
      ".belmont/preferences.md",
      [
        "---",
        "schema: belmont.preferences.v1",
        "updated_at: 2026-05-26",
        "---",
        "",
        "# Preferences",
        "",
        "- Be concise.",
        "",
      ].join("\n"),
    );
    await seed(
      ".belmont/PROGRESS.md",
      ["# PROGRESS", "", "### M1: x", "", "- [ ] P0-1 Build", ""].join("\n"),
    );

    const cap = captureLines();
    const result = await cmdValidate(undefined, {
      cwd: TMP,
      out: cap.log,
      err: cap.error,
    });
    expect(result.exitCode).toBe(0);
    expect(cap.out.join("\n")).toContain("belmont validate: OK");
    expect(cap.err).toHaveLength(0);
  });

  it("accepts an explicit project-dir argument", async () => {
    const cap = captureLines();
    const result = await cmdValidate("nonexistent", {
      cwd: TMP,
      out: cap.log,
      err: cap.error,
    });
    expect(result.exitCode).toBe(2);
  });
});
