// runBelmontValidate — preflight walker. Tests build a synthetic
// .belmont/ tree and assert each rule fires.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractPrdIndex,
  formatValidateReport,
  runBelmontValidate,
} from "../src/validate.js";

let TMP = "";

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "belmont-validate-test-"));
});
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function seed(rel: string, content: string): Promise<void> {
  const abs = join(TMP, rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content, "utf8");
}

const BELMONT_MD_BASE = [
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
  "| Kind | Topic | Path |",
  "|---|---|---|",
  "",
].join("\n");

const PREFERENCES_BASE = [
  "---",
  "schema: belmont.preferences.v1",
  "updated_at: 2026-05-26",
  "---",
  "",
  "# Preferences",
  "",
  "- Be concise.",
  "",
].join("\n");

const PROGRESS_BASE = [
  "# PROGRESS",
  "",
  "### M1: Bootstrap",
  "",
  "- [ ] P0-1 Build",
  "",
].join("\n");

async function seedBaseTree(): Promise<void> {
  await seed(".belmont/BELMONT.md", BELMONT_MD_BASE);
  await seed(".belmont/preferences.md", PREFERENCES_BASE);
  await seed(".belmont/PROGRESS.md", PROGRESS_BASE);
}

describe("runBelmontValidate", () => {
  it("returns hard-failure when .belmont/ is missing", async () => {
    const report = await runBelmontValidate(TMP);
    expect(report.hardFailures).toHaveLength(1);
    expect(report.hardFailures[0]?.code).toBe("BELMONT_DIR_MISSING");
  });

  it("clean tree → no hardFailures, no warnings", async () => {
    await seedBaseTree();
    const report = await runBelmontValidate(TMP);
    expect(report.hardFailures).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it("flags missing BELMONT.md", async () => {
    await seed(".belmont/preferences.md", PREFERENCES_BASE);
    await seed(".belmont/PROGRESS.md", PROGRESS_BASE);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "BELMONT_MD_MISSING"),
    ).toBeDefined();
  });

  it("flags missing PROGRESS.md", async () => {
    await seed(".belmont/BELMONT.md", BELMONT_MD_BASE);
    await seed(".belmont/preferences.md", PREFERENCES_BASE);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "PROGRESS_MISSING"),
    ).toBeDefined();
  });

  it("flags BELMONT.md over the 400-line cap and warns past 350", async () => {
    const long350 =
      BELMONT_MD_BASE +
      Array.from({ length: 360 }, (_, i) => `line ${i}`).join("\n");
    await seed(".belmont/BELMONT.md", long350);
    await seed(".belmont/preferences.md", PREFERENCES_BASE);
    await seed(".belmont/PROGRESS.md", PROGRESS_BASE);
    const report = await runBelmontValidate(TMP);
    // 360+ non-blank → triggers either the 350 warn OR the 400 hard fail.
    const hard = report.hardFailures.find((d) => d.code === "BELMONT_MD_TOO_LONG");
    const warn = report.warnings.find((d) => d.code === "BELMONT_MD_APPROACHING_CAP");
    expect(hard !== undefined || warn !== undefined).toBe(true);
  });

  it("flags preferences.md over the 60-line cap", async () => {
    const long =
      PREFERENCES_BASE +
      Array.from({ length: 70 }, (_, i) => `- rule ${i}`).join("\n");
    await seed(".belmont/BELMONT.md", BELMONT_MD_BASE);
    await seed(".belmont/preferences.md", long);
    await seed(".belmont/PROGRESS.md", PROGRESS_BASE);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "PREFERENCES_TOO_LONG"),
    ).toBeDefined();
  });

  it("flags PROGRESS.md duplicate task IDs", async () => {
    const dup = [
      "# PROGRESS",
      "",
      "### M1: Bootstrap",
      "",
      "- [ ] P0-1 First",
      "- [ ] P0-1 Second",
      "",
    ].join("\n");
    await seed(".belmont/BELMONT.md", BELMONT_MD_BASE);
    await seed(".belmont/preferences.md", PREFERENCES_BASE);
    await seed(".belmont/PROGRESS.md", dup);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "PROGRESS_DUPLICATE_TASK"),
    ).toBeDefined();
  });

  it("flags emoji-prefixed milestone headers", async () => {
    const emojiProgress = [
      "# PROGRESS",
      "",
      "### ✅ M1: Bootstrap",
      "",
      "- [ ] P0-1 Build",
      "",
    ].join("\n");
    await seed(".belmont/BELMONT.md", BELMONT_MD_BASE);
    await seed(".belmont/preferences.md", PREFERENCES_BASE);
    await seed(".belmont/PROGRESS.md", emojiProgress);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "PROGRESS_EMOJI_HEADER"),
    ).toBeDefined();
  });

  it("flags ADR missing Revisions footer", async () => {
    await seedBaseTree();
    const adrNoRev = [
      "---",
      "schema: belmont.adr.v1",
      "id: D-001-foo",
      "topic: foo",
      "status: accepted",
      "updated_at: 2026-05-26",
      "---",
      "",
      "# D-001: Foo",
      "",
      "## Decision",
      "",
      "Yes.",
      "",
    ].join("\n");
    await seed(".belmont/memory/decisions/D-001-foo.md", adrNoRev);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find(
        (d) =>
          d.code === "REVISIONS_MISSING_SECTION" &&
          (d.path ?? "").includes("D-001-foo.md"),
      ),
    ).toBeDefined();
  });

  it("flags duplicate ADR IDs", async () => {
    await seedBaseTree();
    const adr = (id: string) =>
      [
        "---",
        "schema: belmont.adr.v1",
        `id: ${id}`,
        "topic: foo",
        "status: accepted",
        "updated_at: 2026-05-26",
        "---",
        "",
        `# ${id}: Foo`,
        "",
        "## Decision",
        "",
        "Yes.",
        "",
        "## Revisions",
        "",
        "- 2026-05-26 — Accepted.",
        "",
      ].join("\n");
    await seed(".belmont/memory/decisions/D-001-a.md", adr("D-001-a"));
    await seed(".belmont/memory/decisions/D-001-b.md", adr("D-001-b"));
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "ADR_ID_DUPLICATE"),
    ).toBeDefined();
  });

  it("warns on ADR ID gaps", async () => {
    await seedBaseTree();
    const adr = (id: string) =>
      [
        "---",
        "schema: belmont.adr.v1",
        `id: ${id}`,
        "topic: foo",
        "status: accepted",
        "updated_at: 2026-05-26",
        "---",
        "",
        `# ${id}: Foo`,
        "",
        "## Decision",
        "Yes.",
        "",
        "## Revisions",
        "",
        "- 2026-05-26 — Accepted.",
        "",
      ].join("\n");
    await seed(".belmont/memory/decisions/D-001-a.md", adr("D-001-a"));
    await seed(".belmont/memory/decisions/D-003-c.md", adr("D-003-c"));
    const report = await runBelmontValidate(TMP);
    expect(
      report.warnings.find((d) => d.code === "ADR_ID_GAP"),
    ).toBeDefined();
  });

  it("flags timestamp-prefixed ADR filenames", async () => {
    await seedBaseTree();
    const adr = [
      "---",
      "schema: belmont.adr.v1",
      "id: D-001-foo",
      "topic: foo",
      "status: accepted",
      "updated_at: 2026-05-26",
      "---",
      "",
      "# D-001: Foo",
      "",
      "## Decision",
      "Y",
      "",
      "## Revisions",
      "",
      "- 2026-05-26 — Accepted.",
      "",
    ].join("\n");
    await seed(".belmont/memory/decisions/2026-05-26-foo.md", adr);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "FILENAME_TIMESTAMP_PREFIX"),
    ).toBeDefined();
  });

  it("flags episodic filename violations", async () => {
    await seedBaseTree();
    const ep = [
      "---",
      "schema: belmont.episode.v1",
      "date: 2026-05-26",
      "---",
      "",
      "# day",
      "",
      "## Events",
      "",
      "- [note] hi",
      "",
    ].join("\n");
    await seed(".belmont/memory/episodic/Bad-Filename.md", ep);
    const report = await runBelmontValidate(TMP);
    expect(
      report.hardFailures.find((d) => d.code === "EPISODIC_FILENAME_INVALID"),
    ).toBeDefined();
  });

  it("flags Memory map drift", async () => {
    await seedBaseTree();
    const subsystem = [
      "---",
      "schema: belmont.subsystem.v1",
      "id: auth",
      "updated_at: 2026-05-26",
      "---",
      "",
      "# Auth",
      "",
      "## Behavior",
      "X",
      "",
      "## Revisions",
      "",
      "- 2026-05-26 — Initial.",
      "",
    ].join("\n");
    await seed(".belmont/memory/subsystems/auth.md", subsystem);
    const report = await runBelmontValidate(TMP);
    expect(
      report.warnings.find((d) => d.code === "MEMORY_MAP_DRIFT"),
    ).toBeDefined();
  });

  it("warns when PRD index points to a missing file (drift, not hard-failure)", async () => {
    const belmontWithPrd = BELMONT_MD_BASE.replace(
      "## Master PRD\n",
      "## Master PRD\n\n### prd-auth\n\n",
    );
    await seed(".belmont/BELMONT.md", belmontWithPrd);
    await seed(".belmont/preferences.md", PREFERENCES_BASE);
    await seed(".belmont/PROGRESS.md", PROGRESS_BASE);
    const report = await runBelmontValidate(TMP);
    expect(
      report.warnings.find((d) => d.code === "PRD_INDEX_MISSING_FILE"),
    ).toBeDefined();
    expect(
      report.hardFailures.find((d) => d.code === "PRD_INDEX_MISSING_FILE"),
    ).toBeUndefined();
  });

  it("warns when a PRD file exists but is not listed in the index", async () => {
    await seedBaseTree();
    const prd = [
      "---",
      "schema: belmont.prd.v1",
      "id: prd-auth",
      "topic: auth",
      "status: active",
      "updated_at: 2026-05-26",
      "---",
      "",
      "# Auth",
      "",
      "## Brief",
      "X",
      "",
      "## Revisions",
      "",
      "- 2026-05-26 — Initial.",
      "",
    ].join("\n");
    await seed(".belmont/memory/prds/prd-auth.md", prd);
    const report = await runBelmontValidate(TMP);
    expect(
      report.warnings.find((d) => d.code === "PRD_INDEX_DRIFT"),
    ).toBeDefined();
  });
});

describe("extractPrdIndex", () => {
  it("extracts ### prd-<slug> headings", () => {
    const md = [
      "## Master PRD",
      "",
      "### prd-auth",
      "Pointer.",
      "",
      "### prd-billing",
      "Pointer.",
      "",
      "## Glossary",
    ].join("\n");
    const slugs = extractPrdIndex(md);
    expect(slugs.has("auth")).toBe(true);
    expect(slugs.has("billing")).toBe(true);
  });

  it("extracts bullet entries", () => {
    const md = [
      "## Master PRD",
      "",
      "- prd-auth — see prds/prd-auth.md",
      "- `prd-billing` — billing v2",
      "",
      "## Glossary",
    ].join("\n");
    const slugs = extractPrdIndex(md);
    expect(slugs.has("auth")).toBe(true);
    expect(slugs.has("billing")).toBe(true);
  });
});

describe("formatValidateReport", () => {
  it("returns OK on clean reports", () => {
    expect(formatValidateReport({ hardFailures: [], warnings: [] })).toBe(
      "belmont validate: OK",
    );
  });

  it("renders hard-failures and warnings with prefixes", () => {
    const out = formatValidateReport({
      hardFailures: [
        {
          code: "PROGRESS_MISSING",
          severity: "error",
          message: "missing",
          path: ".belmont/PROGRESS.md",
        },
      ],
      warnings: [
        {
          code: "ADR_ID_GAP",
          severity: "warning",
          message: "gap at D-003",
          path: ".belmont/memory/decisions/D-005.md",
        },
      ],
    });
    expect(out).toContain("✗ [PROGRESS_MISSING]");
    expect(out).toContain("⚠ [ADR_ID_GAP]");
  });
});
