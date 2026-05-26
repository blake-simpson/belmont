// CI gates for M4 (v2.3 §10.5 — unit-level; the M11 runtime fixture
// `codex exec --no-tools` round-trip lands at the ship milestone).
//
//   1. ≤250 LOC cap on every canonical SKILL.md (§10.2).
//   2. Static grep blocklist — no harness-only constructs leak into
//      skill bodies (§10.5).
//   3. Frontmatter validation — `name: <slug>` matches directory.

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "@belmont/knowledge-schema";
import { describe, expect, it } from "vitest";

import { SKILLS } from "../src/slugs.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "..", "src");

const BLOCKLIST =
  /ctx\.ui|createAgentSession|registerTool|registerCommand|belmont_transition is required|must use belmont_transition|@belmont\/harness/;

const SKILL_LOC_CAP = 250;

async function* walk(root: string): AsyncGenerator<string> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

describe("M4 CI gates — skill catalog", () => {
  it("the 8 canonical slugs each have a SKILL.md", async () => {
    for (const slug of SKILLS) {
      const path = join(SRC, slug, "SKILL.md");
      const stats = await stat(path);
      expect(stats.isFile(), `${slug}/SKILL.md missing`).toBe(true);
    }
  });

  it("every canonical SKILL.md is ≤250 LOC (§10.2)", async () => {
    for (const slug of SKILLS) {
      const path = join(SRC, slug, "SKILL.md");
      const body = await readFile(path, "utf8");
      const lines = body.split("\n").length;
      expect(lines, `${slug}/SKILL.md has ${lines} lines (cap ${SKILL_LOC_CAP})`).toBeLessThanOrEqual(SKILL_LOC_CAP);
    }
  });

  it("every SKILL.md has frontmatter with name == directory basename", async () => {
    for (const slug of SKILLS) {
      const path = join(SRC, slug, "SKILL.md");
      const body = await readFile(path, "utf8");
      const { frontmatter, warnings } = parseFrontmatter(body);
      expect(warnings.filter((w) => w.severity === "error"), `${slug} frontmatter errors`).toHaveLength(0);
      expect(frontmatter, `${slug} has no frontmatter`).not.toBeNull();
      expect(frontmatter?.name, `${slug} frontmatter.name mismatch`).toBe(slug);
      expect(frontmatter?.description, `${slug} missing description`).toBeTruthy();
    }
  });

  it("the harness-optional preamble is included by every skill (§10.3)", async () => {
    for (const slug of SKILLS) {
      const path = join(SRC, slug, "SKILL.md");
      const body = await readFile(path, "utf8");
      expect(body, `${slug} missing harness-optional include`).toMatch(
        /<!-- @include _shared\/harness-optional\.md -->/,
      );
    }
  });

  it("the §10.5 blocklist does not match anywhere under packages/skills/src/", async () => {
    const hits: { path: string; line: number; match: string }[] = [];
    for await (const path of walk(SRC)) {
      if (!path.endsWith(".md") && !path.endsWith(".ts")) continue;
      const lines = (await readFile(path, "utf8")).split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = BLOCKLIST.exec(lines[i] ?? "");
        if (m) hits.push({ path, line: i + 1, match: m[0] });
      }
    }
    expect(hits, `blocklist hits:\n${hits.map((h) => `  ${h.path}:${h.line} — ${h.match}`).join("\n")}`).toHaveLength(0);
  });
});
