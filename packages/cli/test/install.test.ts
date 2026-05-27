// belmont install — end-to-end coverage on a temp project root.
//
// The skills materializer is exercised against the real bundled source
// (so this also acts as a guardrail on @belmont/skills' compose path),
// but uses a unique homedir-like target so the test doesn't write into
// the developer's actual ~/.agents/.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cmdInstall } from "../src/install.js";

let TMP_PROJECT = "";
let ORIGINAL_HOME = "";

beforeEach(async () => {
  TMP_PROJECT = await mkdtemp(join(tmpdir(), "belmont-cli-install-test-"));
  ORIGINAL_HOME = process.env.HOME ?? "";
  // Re-point HOME so the default skills target lands inside the temp
  // dir instead of touching the developer's real ~/.agents/.
  process.env.HOME = TMP_PROJECT;
});

afterEach(async () => {
  await rm(TMP_PROJECT, { recursive: true, force: true });
  if (ORIGINAL_HOME) process.env.HOME = ORIGINAL_HOME;
  else delete process.env.HOME;
});

const captureLines = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    log: (l: string) => out.push(l),
    error: (l: string) => err.push(l),
  };
};

describe("cmdInstall", () => {
  it("scaffolds .belmont/ + materializes skills on a fresh tree", async () => {
    const cap = captureLines();
    const result = await cmdInstall(undefined, {
      cwd: TMP_PROJECT,
      out: cap.log,
      err: cap.error,
    });
    expect(result.exitCode).toBe(0);
    const text = cap.out.join("\n");
    expect(text).toContain("belmont install →");
    expect(text).toContain("Scaffolded .belmont/");
    expect(text).toMatch(/skills: \d+ written/);
    // Spot-check one canonical skill — `plan` is on the §10 skill list.
    // Per D-004, the cross-harness install path is the FLAT
    // `$HOME/.agents/skills/` (redirected to TMP_PROJECT above) with
    // the `belmont-` prefix on each materialized dir AND the frontmatter
    // `name:` field rewritten to match. So `plan` lives at
    // `.agents/skills/belmont-plan/SKILL.md` with `name: belmont-plan`.
    const planSkill = await readFile(
      join(TMP_PROJECT, ".agents", "skills", "belmont-plan", "SKILL.md"),
      "utf8",
    );
    expect(planSkill).toContain("name: belmont-plan");
    expect(planSkill).not.toContain("name: plan\n");
  });

  it("is idempotent: second run writes zero skill files and leaves .belmont/ alone", async () => {
    await cmdInstall(undefined, {
      cwd: TMP_PROJECT,
      out: () => undefined,
      err: () => undefined,
    });
    const cap = captureLines();
    const second = await cmdInstall(undefined, {
      cwd: TMP_PROJECT,
      out: cap.log,
      err: cap.error,
    });
    expect(second.exitCode).toBe(0);
    const text = cap.out.join("\n");
    expect(text).toContain("skills: 0 written");
    expect(text).toContain(".belmont/ already exists");
  });

  it("emits an RTK preflight line on every run", async () => {
    const cap = captureLines();
    await cmdInstall(undefined, {
      cwd: TMP_PROJECT,
      out: cap.log,
      err: cap.error,
    });
    // The preflight always prints something — either "rtk: detected"
    // or one of the missing/disabled messages.
    expect(cap.out.some((l) => /rtk/i.test(l))).toBe(true);
  });
});
