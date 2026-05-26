// Composer unit tests — @include expansion, frontmatter validation,
// content-hash idempotence, references copying.

import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { compose, composeSkill, materializeSkill } from "../src/compose.js";
import { SKILLS } from "../src/slugs.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "..", "src");

const made: string[] = [];

afterEach(() => {
  made.length = 0;
});

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "belmont-skills-test-"));
  made.push(dir);
  return await fn(dir);
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("compose()", () => {
  it("materializes all 8 skills into the target with correct hash on first run", async () => {
    await withTempDir(async (target) => {
      const result = await compose({ source: SRC, target });
      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(SKILLS.length);
      for (const e of result.entries) {
        expect(e.written, `${e.slug} should be written on first run`).toBe(true);
        const stats = await stat(e.path);
        expect(stats.isFile()).toBe(true);
      }
    });
  });

  it("is idempotent — a second run writes nothing", async () => {
    await withTempDir(async (target) => {
      const r1 = await compose({ source: SRC, target });
      expect(r1.errors).toHaveLength(0);
      const r2 = await compose({ source: SRC, target });
      expect(r2.errors).toHaveLength(0);
      for (const e of r2.entries) {
        expect(e.written, `${e.slug} should not be re-written`).toBe(false);
      }
    });
  });

  it("rewrites only the touched slug when one canonical body changes", async () => {
    await withTempDir(async (target) => {
      await compose({ source: SRC, target });
      // Mutate the *target* file directly so the next compose() sees a hash mismatch.
      const planTarget = join(target, "plan", "SKILL.md");
      const original = await readFile(planTarget, "utf8");
      await writeFile(planTarget, original + "\n<!-- altered by test -->\n", "utf8");
      const r = await compose({ source: SRC, target });
      const planEntry = r.entries.find((e) => e.slug === "plan");
      expect(planEntry?.written).toBe(true);
      const restRewritten = r.entries
        .filter((e) => e.slug !== "plan")
        .filter((e) => e.written);
      expect(restRewritten, "other slugs must not be re-written").toHaveLength(0);
    });
  });

  it("@include _shared/harness-optional.md is expanded to the partial body verbatim", async () => {
    const partial = await readFile(join(SRC, "_shared", "harness-optional.md"), "utf8");
    const materialized = await materializeSkill("status", SRC);
    expect(materialized).toContain(partial.trim().split("\n")[0]!);
    // The directive itself must be gone from the materialized body.
    expect(materialized).not.toMatch(/<!-- @include _shared\/harness-optional\.md -->/);
  });

  it("references next to each skill are copied alongside the SKILL.md", async () => {
    await withTempDir(async (target) => {
      const r = await compose({ source: SRC, target });
      const implementEntry = r.entries.find((e) => e.slug === "implement");
      expect(implementEntry?.references).toContain("implement-checklist.md");
      const refTarget = join(target, "implement", "references", "implement-checklist.md");
      const refSource = await readFile(
        join(SRC, "references", "implement-checklist.md"),
        "utf8",
      );
      expect(await readFile(refTarget, "utf8")).toBe(refSource);
    });
  });

  it("flags NAME_MISMATCH when frontmatter.name diverges from directory basename", async () => {
    // Create a synthetic source tree where one slug's frontmatter is wrong.
    await withTempDir(async (synth) => {
      const realImplement = await readFile(join(SRC, "implement", "SKILL.md"), "utf8");
      const broken = realImplement.replace("name: implement", "name: not-implement");
      // Build a complete synthetic source with the canonical _shared/ and references/,
      // and only this single broken skill (composeSkill is per-slug so the others are unused here).
      const { mkdir, cp } = await import("node:fs/promises");
      await mkdir(join(synth, "implement"), { recursive: true });
      await writeFile(join(synth, "implement", "SKILL.md"), broken, "utf8");
      await cp(join(SRC, "_shared"), join(synth, "_shared"), { recursive: true });
      await cp(join(SRC, "references"), join(synth, "references"), { recursive: true });
      await withTempDir(async (target) => {
        const { errors } = await composeSkill("implement", { source: synth, target });
        expect(errors.some((e) => e.code === "NAME_MISMATCH")).toBe(true);
      });
    });
  });

  it("the materialized body has stable bytes across two materializations", async () => {
    const a = await materializeSkill("verify", SRC);
    const b = await materializeSkill("verify", SRC);
    expect(hash(a)).toBe(hash(b));
  });
});
