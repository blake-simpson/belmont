import { describe, expect, it } from "vitest";

import { classifyTarget } from "../src/classify.js";
import {
  REJECTION_TEXT,
  validateProjectedKnowledgeWrite,
} from "../src/validate.js";

function target(path: string) {
  const t = classifyTarget(path);
  if (!t) throw new Error(`classifyTarget returned null for ${path}`);
  return t;
}

describe("classifyTarget", () => {
  it("classifies each known kind", () => {
    expect(classifyTarget(".belmont/PROGRESS.md")?.kind).toBe("progress");
    expect(classifyTarget(".belmont/BELMONT.md")?.kind).toBe("belmont-md");
    expect(classifyTarget(".belmont/preferences.md")?.kind).toBe("preferences");
    expect(classifyTarget(".belmont/models.json")?.kind).toBe("models-json");
    expect(classifyTarget(".belmont/memory/stack.md")?.kind).toBe("stack");
    expect(
      classifyTarget(".belmont/memory/decisions/D-001-foo.md")?.kind,
    ).toBe("adr");
    expect(
      classifyTarget(".belmont/memory/subsystems/auth.md")?.kind,
    ).toBe("subsystem");
    expect(
      classifyTarget(".belmont/memory/constraints/no-parallel.md")?.kind,
    ).toBe("constraint");
    expect(
      classifyTarget(".belmont/memory/prds/prd-auth.md")?.kind,
    ).toBe("prd");
    expect(
      classifyTarget(".belmont/memory/episodic/2026-05-26-m2.md")?.kind,
    ).toBe("episodic");
  });

  it("returns null for paths outside .belmont/", () => {
    expect(classifyTarget("src/foo.ts")).toBeNull();
    expect(classifyTarget(".belmont/auto.json")).toBeNull();
    expect(classifyTarget(".belmont/memory/steering/steering.md")).toBeNull();
  });

  it("normalises path separators and ./ prefixes", () => {
    expect(classifyTarget("./.belmont/PROGRESS.md")?.kind).toBe("progress");
    expect(classifyTarget(".belmont\\BELMONT.md")?.kind).toBe("belmont-md");
  });
});

describe("validateProjectedKnowledgeWrite — file-local rules", () => {
  it("ALWAYS blocks direct writes to PROGRESS.md (even when before === after)", () => {
    const t = target(".belmont/PROGRESS.md");
    const d = validateProjectedKnowledgeWrite("anything", "anything", t);
    expect(d[0]?.code).toBe("PROGRESS_DIRECT_WRITE");
    expect(d[0]?.message).toBe(REJECTION_TEXT.PROGRESS_DIRECT_WRITE);
    expect(d[0]?.suggestion).toContain("belmont_transition");
  });

  it("rejects preferences.md > 60 non-blank lines with the verbatim text", () => {
    const t = target(".belmont/preferences.md");
    const after = Array.from({ length: 80 }, (_, i) => `- rule ${i}`).join("\n");
    const d = validateProjectedKnowledgeWrite("# old\n", after, t);
    const err = d.find((x) => x.code === "PREFERENCES_TOO_LONG");
    expect(err?.message).toBe(REJECTION_TEXT.PREFERENCES_TOO_LONG);
    expect(err?.suggestion).toBeDefined();
  });

  it("accepts preferences.md at exactly 60 non-blank lines", () => {
    const t = target(".belmont/preferences.md");
    const after = Array.from({ length: 60 }, (_, i) => `- rule ${i}`).join("\n");
    const d = validateProjectedKnowledgeWrite("", after, t);
    expect(d.find((x) => x.code === "PREFERENCES_TOO_LONG")).toBeUndefined();
  });

  it("rejects BELMONT.md > 400 non-blank lines with the verbatim text", () => {
    const t = target(".belmont/BELMONT.md");
    const after = Array.from({ length: 450 }, (_, i) => `line ${i}`).join("\n");
    const d = validateProjectedKnowledgeWrite("# old\n", after, t);
    const err = d.find((x) => x.code === "BELMONT_MD_TOO_LONG");
    expect(err?.message).toBe(REJECTION_TEXT.BELMONT_MD_TOO_LONG);
  });

  it("requires Revisions footer + new bullet on ADR diff", () => {
    const t = target(".belmont/memory/decisions/D-007-foo.md");
    const before = "# Decision\n\n## Body\nold body\n";
    const after = "# Decision\n\n## Body\nnew body\n";
    const d = validateProjectedKnowledgeWrite(before, after, t);
    expect(d[0]?.message).toBe(REJECTION_TEXT.REVISIONS_REQUIRED);
  });

  it("accepts an ADR diff that adds a new Revisions bullet", () => {
    const t = target(".belmont/memory/decisions/D-007-foo.md");
    const before = "# Decision\n\n## Revisions\n- 2026-05-20 — Created.\n";
    const after =
      "# Decision\n\n## Revisions\n- 2026-05-20 — Created.\n- 2026-05-26 — Amended for X.\n";
    const d = validateProjectedKnowledgeWrite(before, after, t);
    expect(d).toEqual([]);
  });

  it("rejects timestamp-prefixed filenames in non-episodic kinds", () => {
    const t = target(".belmont/memory/decisions/2026-05-26-bad.md");
    const after = "# Bad name\n\n## Revisions\n- 2026-05-26 — Created.\n";
    const d = validateProjectedKnowledgeWrite("", after, t);
    expect(
      d.find((x) => x.code === "FILENAME_TIMESTAMP_PREFIX")?.message,
    ).toBe(REJECTION_TEXT.FILENAME_TIMESTAMP_PREFIX);
  });

  it("rejects episodic filenames that don't match YYYY-MM-DD-<slug>.md (D-002)", () => {
    const t = target(".belmont/memory/episodic/no-date.md");
    const d = validateProjectedKnowledgeWrite("", "body", t);
    expect(
      d.find((x) => x.code === "EPISODIC_FILENAME_INVALID")?.message,
    ).toBe(REJECTION_TEXT.EPISODIC_FILENAME_INVALID);
  });

  it("accepts an episodic filename in the canonical date-only form", () => {
    const t = target(".belmont/memory/episodic/2026-05-26-m2-knowledge-schema.md");
    const d = validateProjectedKnowledgeWrite("", "body", t);
    expect(
      d.find((x) => x.code === "EPISODIC_FILENAME_INVALID"),
    ).toBeUndefined();
  });

  it("returns no diagnostics on a no-op (before === after) for non-PROGRESS targets", () => {
    const t = target(".belmont/preferences.md");
    const d = validateProjectedKnowledgeWrite("same\n", "same\n", t);
    expect(d).toEqual([]);
  });

  it("emits DECISION_ID_GAP warning when a new D-NNN.md is not monotonic", () => {
    const t = target(".belmont/memory/decisions/D-010-foo.md");
    const after = "# foo\n\n## Revisions\n- 2026-05-26 — Created.\n";
    const d = validateProjectedKnowledgeWrite("", after, t, {
      existingDecisions: ["D-001-omp-evaluation", "D-002-episodic-filename-grammar"],
    });
    const warn = d.find((x) => x.code === "DECISION_ID_GAP");
    expect(warn?.severity).toBe("warning");
  });

  it("emits NEW_FILE_NOT_IN_MEMORY_MAP when the new file is not referenced in BELMONT.md", () => {
    const t = target(".belmont/memory/decisions/D-003-foo.md");
    const after = "# foo\n\n## Revisions\n- 2026-05-26 — Created.\n";
    const belmontMd = "# BELMONT\n\n## Memory map\n| Topic | Kind | File | Read when |\n|---|---|---|---|\n| oh-my-pi | ADR | memory/decisions/D-001-omp-evaluation.md | when... |\n";
    const d = validateProjectedKnowledgeWrite("", after, t, { belmontMd });
    expect(
      d.find((x) => x.code === "NEW_FILE_NOT_IN_MEMORY_MAP")?.message,
    ).toBe(REJECTION_TEXT.NEW_FILE_NOT_IN_MEMORY_MAP);
  });

  it("requires Revisions on a brand-new ADR (no `## Revisions` section)", () => {
    const t = target(".belmont/memory/decisions/D-007-new.md");
    const after = "# foo\n\nplain body\n";
    const d = validateProjectedKnowledgeWrite("", after, t);
    expect(
      d.find((x) => x.code === "REVISIONS_MISSING_SECTION")?.message,
    ).toBe(REJECTION_TEXT.REVISIONS_REQUIRED);
  });

  it("does not flag a clean PRD diff with a new Revisions bullet", () => {
    const t = target(".belmont/memory/prds/prd-auth.md");
    const before = "# PRD\n\n## Revisions\n- 2026-05-20 — Created.\n";
    const after =
      "# PRD\n\n## Revisions\n- 2026-05-20 — Created.\n- 2026-05-26 — Updated.\n";
    const d = validateProjectedKnowledgeWrite(before, after, t);
    expect(d).toEqual([]);
  });

  it("supports subsystem and constraint kinds in the Revisions-required path", () => {
    const tSub = target(".belmont/memory/subsystems/auth.md");
    const tCon = target(".belmont/memory/constraints/no-parallel.md");
    const before = "# old\n";
    const after = "# changed\n";
    expect(validateProjectedKnowledgeWrite(before, after, tSub).length).toBeGreaterThan(0);
    expect(validateProjectedKnowledgeWrite(before, after, tCon).length).toBeGreaterThan(0);
  });

  it("skips revisions enforcement for non-revisions kinds (stack, models-json)", () => {
    const tStack = target(".belmont/memory/stack.md");
    const d = validateProjectedKnowledgeWrite("# old\n", "# new\n", tStack);
    expect(d.find((x) => x.code?.startsWith("REVISIONS"))).toBeUndefined();
  });

  it("rejects with REVISIONS_NO_NEW_BULLET when Revisions section exists but no new bullet was added", () => {
    const t = target(".belmont/memory/decisions/D-007-foo.md");
    const before =
      "# Decision\n\n## Body\noriginal\n\n## Revisions\n- 2026-05-20 — Created.\n";
    const after =
      "# Decision\n\n## Body\nchanged content\n\n## Revisions\n- 2026-05-20 — Created.\n";
    const d = validateProjectedKnowledgeWrite(before, after, t);
    const err = d.find((x) => x.code === "REVISIONS_NO_NEW_BULLET");
    expect(err?.message).toBe(REJECTION_TEXT.REVISIONS_REQUIRED);
  });

  it("DECISION_ID_GAP suppressed when new D-NNN is monotonic (N = max+1)", () => {
    const t = target(".belmont/memory/decisions/D-003-foo.md");
    const after = "# foo\n\n## Revisions\n- 2026-05-26 — Created.\n";
    const d = validateProjectedKnowledgeWrite("", after, t, {
      existingDecisions: ["D-001-omp-evaluation", "D-002-episodic-filename-grammar"],
    });
    expect(d.find((x) => x.code === "DECISION_ID_GAP")).toBeUndefined();
  });

  it("does not emit memory-map error when the new file IS referenced", () => {
    const t = target(".belmont/memory/decisions/D-003-foo.md");
    const after = "# foo\n\n## Revisions\n- 2026-05-26 — Created.\n";
    const belmontMd = "# BELMONT\n\n## Memory map\n| Topic | Kind | File | Read when |\n|---|---|---|---|\n| foo | ADR | memory/decisions/D-003-foo.md | for foo |\n";
    const d = validateProjectedKnowledgeWrite("", after, t, { belmontMd });
    expect(d.find((x) => x.code === "NEW_FILE_NOT_IN_MEMORY_MAP")).toBeUndefined();
  });
});
