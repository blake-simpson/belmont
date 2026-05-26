// `belmont validate` — preflight walk of `.belmont/`.
//
// Fast (no LLM, no network). Reads frontmatter + body of every file
// under `.belmont/`, validates against the M2 schemas, checks PROGRESS
// grammar, asserts cross-references (PRD index ↔ memory/prds files,
// ADR monotonic IDs, Memory map references), and enforces line caps
// (BELMONT.md ≤400 hard / ≤350 warn, preferences.md ≤60 hard / ≤55 warn).
//
// Exit-code shape mirrors the M3 boot doctor (0 / 1 / 2) so the M11
// release flow can rely on both:
//   - hardFailures.length > 0  → CLI exit 2 (auto preflight blocks)
//   - any warnings only        → CLI exit 0, list printed
//   - clean                    → CLI exit 0, "OK"
//
// The pure-rule logic lives in @belmont/knowledge-schema (parseProgress,
// parseFrontmatter, validateFrontmatter, extractRevisionsBullets,
// extractMemoryMapReferences, classifyTarget). This module is the
// FS walker on top.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  countNonBlankLines,
  extractMemoryMapReferences,
  extractRevisionsBullets,
  parseFrontmatter,
  parseProgress,
  validateFrontmatter,
  type Diagnostic,
  type KnowledgeKind,
} from "@belmont/knowledge-schema";

export type ValidateReport = {
  /** Hard-failures — block auto-loop preflight, CLI exit 2. */
  hardFailures: Diagnostic[];
  /** Warnings — print but don't block, CLI exit 0. */
  warnings: Diagnostic[];
};

export async function runBelmontValidate(cwd: string): Promise<ValidateReport> {
  const out: Diagnostic[] = [];
  const root = join(cwd, ".belmont");

  if (!(await isDir(root))) {
    return {
      hardFailures: [
        {
          code: "BELMONT_DIR_MISSING",
          severity: "error",
          message: ".belmont/ not found. Run `belmont init` first.",
          path: ".belmont",
        },
      ],
      warnings: [],
    };
  }

  await validateProgress(cwd, out);
  await validateBelmontMd(cwd, out);
  await validatePreferences(cwd, out);
  await validateStack(cwd, out);
  await validateKindDir(cwd, "decisions", "adr", out);
  await validateKindDir(cwd, "subsystems", "subsystem", out);
  await validateKindDir(cwd, "constraints", "constraint", out);
  await validateKindDir(cwd, "prds", "prd", out);
  await validateKindDir(cwd, "episodic", "episodic", out);

  await validateMemoryMap(cwd, out);
  await validateAdrMonotonic(cwd, out);
  await validatePrdIndex(cwd, out);

  return splitDiags(out);
}

export function formatValidateReport(report: ValidateReport): string {
  if (report.hardFailures.length === 0 && report.warnings.length === 0) {
    return "belmont validate: OK";
  }
  const lines: string[] = [];
  if (report.hardFailures.length > 0) {
    lines.push(
      `belmont validate: ${report.hardFailures.length} hard-failure${report.hardFailures.length === 1 ? "" : "s"}`,
    );
    for (const d of report.hardFailures) lines.push(formatLine("✗", d));
  }
  if (report.warnings.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `belmont validate: ${report.warnings.length} warning${report.warnings.length === 1 ? "" : "s"}`,
    );
    for (const d of report.warnings) lines.push(formatLine("⚠", d));
  }
  return lines.join("\n");
}

function formatLine(prefix: string, d: Diagnostic): string {
  const where = d.path ? `${d.path}: ` : "";
  return `  ${prefix} [${d.code}] ${where}${d.message}`;
}

function splitDiags(diags: Diagnostic[]): ValidateReport {
  const hardFailures: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  for (const d of diags) {
    if (d.severity === "error") hardFailures.push(d);
    else if (d.severity === "warning") warnings.push(d);
  }
  return { hardFailures, warnings };
}

// ============================================================================
// Per-section walks
// ============================================================================

async function validateProgress(cwd: string, out: Diagnostic[]): Promise<void> {
  const relPath = ".belmont/PROGRESS.md";
  const md = await readIfExists(join(cwd, relPath));
  if (md === undefined) {
    out.push({
      code: "PROGRESS_MISSING",
      severity: "error",
      message: ".belmont/PROGRESS.md is missing.",
      path: relPath,
    });
    return;
  }
  const parsed = parseProgress(md);
  for (const w of parsed.warnings) {
    out.push({ ...w, path: relPath });
  }
  // Duplicate task IDs across all milestones.
  const seen = new Map<string, string>();
  for (const m of parsed.milestones) {
    for (const t of m.tasks) {
      if (t.id === "") continue;
      const key = `${m.id}/${t.id}`;
      if (seen.has(key)) {
        out.push({
          code: "PROGRESS_DUPLICATE_TASK",
          severity: "error",
          message: `Duplicate task id ${key} (also at ${seen.get(key) ?? "?"}).`,
          path: relPath,
        });
      } else {
        seen.set(key, `${relPath}:${t.lineIndex + 1}`);
      }
    }
    if (m.hadEmojiPrefix) {
      out.push({
        code: "PROGRESS_EMOJI_HEADER",
        severity: "error",
        message: `Milestone ${m.id} header has a forbidden emoji prefix. Status is always computed from task markers — never stored on the header.`,
        path: relPath,
        line: m.headerLineIndex + 1,
      });
    }
  }
}

async function validateBelmontMd(
  cwd: string,
  out: Diagnostic[],
): Promise<void> {
  const relPath = ".belmont/BELMONT.md";
  const md = await readIfExists(join(cwd, relPath));
  if (md === undefined) {
    out.push({
      code: "BELMONT_MD_MISSING",
      severity: "error",
      message: ".belmont/BELMONT.md is missing.",
      path: relPath,
    });
    return;
  }
  await validateOneFile(md, relPath, "belmont-md", out);
  const lines = countNonBlankLines(md);
  if (lines > 400) {
    out.push({
      code: "BELMONT_MD_TOO_LONG",
      severity: "error",
      message: `BELMONT.md is ${lines} non-blank lines (cap 400). Consolidate sections or move detail into memory/ entries.`,
      path: relPath,
    });
  } else if (lines > 350) {
    out.push({
      code: "BELMONT_MD_APPROACHING_CAP",
      severity: "warning",
      message: `BELMONT.md is ${lines} non-blank lines (warn at 350, hard cap 400). Consider consolidating before it grows further.`,
      path: relPath,
    });
  }
}

async function validatePreferences(
  cwd: string,
  out: Diagnostic[],
): Promise<void> {
  const relPath = ".belmont/preferences.md";
  const md = await readIfExists(join(cwd, relPath));
  if (md === undefined) {
    out.push({
      code: "PREFERENCES_MISSING",
      severity: "error",
      message: ".belmont/preferences.md is missing.",
      path: relPath,
    });
    return;
  }
  await validateOneFile(md, relPath, "preferences", out);
  const lines = countNonBlankLines(md);
  if (lines > 60) {
    out.push({
      code: "PREFERENCES_TOO_LONG",
      severity: "error",
      message: `preferences.md is ${lines} non-blank lines (cap 60). Rewrite and consolidate before saving; do not append new rules.`,
      path: relPath,
    });
  } else if (lines > 55) {
    out.push({
      code: "PREFERENCES_APPROACHING_CAP",
      severity: "warning",
      message: `preferences.md is ${lines} non-blank lines (warn at 55, hard cap 60).`,
      path: relPath,
    });
  }
}

async function validateStack(cwd: string, out: Diagnostic[]): Promise<void> {
  const relPath = ".belmont/memory/stack.md";
  const md = await readIfExists(join(cwd, relPath));
  if (md === undefined) return; // stack.md is optional.
  await validateOneFile(md, relPath, "stack", out);
}

async function validateKindDir(
  cwd: string,
  subdir: string,
  kind: KnowledgeKind,
  out: Diagnostic[],
): Promise<void> {
  const dir = join(cwd, ".belmont", "memory", subdir);
  if (!(await isDir(dir))) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const relPath = `.belmont/memory/${subdir}/${entry.name}`;
    const md = await readIfExists(join(dir, entry.name));
    if (md === undefined) continue;

    // Filename grammar.
    const base = entry.name.replace(/\.md$/i, "");
    if (kind === "episodic") {
      if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(base)) {
        out.push({
          code: "EPISODIC_FILENAME_INVALID",
          severity: "error",
          message: `Episodic filename must be YYYY-MM-DD-<slug>.md (got '${entry.name}').`,
          path: relPath,
        });
      }
    } else {
      if (/^\d{4}-\d{2}-\d{2}-/.test(base)) {
        out.push({
          code: "FILENAME_TIMESTAMP_PREFIX",
          severity: "error",
          message: `Non-episodic filenames must not be timestamp-prefixed (got '${entry.name}'). Timestamps live in memory/episodic/.`,
          path: relPath,
        });
      }
    }

    await validateOneFile(md, relPath, kind, out);

    if (
      kind === "adr" ||
      kind === "prd" ||
      kind === "subsystem" ||
      kind === "constraint"
    ) {
      const bullets = extractRevisionsBullets(md);
      if (bullets === null) {
        out.push({
          code: "REVISIONS_MISSING_SECTION",
          severity: "error",
          message: `## Revisions section is required for ${kind} files. Add one with a single dated bullet.`,
          path: relPath,
        });
      } else if (bullets.length === 0) {
        out.push({
          code: "REVISIONS_NO_BULLETS",
          severity: "warning",
          message: `## Revisions section exists but has no bullets — each amend must add a dated bullet.`,
          path: relPath,
        });
      }
    }
  }
}

async function validateOneFile(
  md: string,
  relPath: string,
  kind: KnowledgeKind,
  out: Diagnostic[],
): Promise<void> {
  const parsed = parseFrontmatter(md);
  for (const w of parsed.warnings) {
    out.push({ ...w, path: relPath });
  }
  if (parsed.frontmatter === null) {
    if (parsed.warnings.length === 0) {
      out.push({
        code: "FRONTMATTER_MISSING",
        severity: "error",
        message: `Frontmatter is required for ${kind} files.`,
        path: relPath,
      });
    }
    return;
  }
  const fmDiags = validateFrontmatter(parsed.frontmatter, kind);
  for (const d of fmDiags) {
    out.push({ ...d, path: relPath });
  }
}

// ============================================================================
// Cross-file checks
// ============================================================================

async function validateMemoryMap(cwd: string, out: Diagnostic[]): Promise<void> {
  const belmontMd = await readIfExists(
    join(cwd, ".belmont", "BELMONT.md"),
  );
  if (belmontMd === undefined) return; // BELMONT_MD_MISSING already raised.
  const refs = new Set(extractMemoryMapReferences(belmontMd));

  for (const subdir of [
    "decisions",
    "subsystems",
    "constraints",
    "prds",
  ] as const) {
    const dir = join(cwd, ".belmont", "memory", subdir);
    if (!(await isDir(dir))) continue;
    const entries = await readdir(dir);
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const needle = `memory/${subdir}/${name}`;
      const present = [...refs].some((r) => r.includes(needle));
      if (!present) {
        out.push({
          code: "MEMORY_MAP_DRIFT",
          severity: "warning",
          message: `${needle} is not referenced from BELMONT.md > ## Memory map.`,
          path: `.belmont/${needle}`,
        });
      }
    }
  }
}

async function validateAdrMonotonic(
  cwd: string,
  out: Diagnostic[],
): Promise<void> {
  const dir = join(cwd, ".belmont", "memory", "decisions");
  if (!(await isDir(dir))) return;
  const entries = await readdir(dir);
  const nums: { n: number; basename: string }[] = [];
  const seen = new Set<number>();
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const m = /^D-(\d+)/.exec(name);
    if (!m) continue;
    const n = Number.parseInt(m[1] ?? "", 10);
    if (Number.isNaN(n)) continue;
    if (seen.has(n)) {
      out.push({
        code: "ADR_ID_DUPLICATE",
        severity: "error",
        message: `Duplicate decision id D-${pad3(n)} (file '${name}').`,
        path: `.belmont/memory/decisions/${name}`,
      });
    }
    seen.add(n);
    nums.push({ n, basename: name });
  }
  nums.sort((a, b) => a.n - b.n);
  for (let i = 0; i < nums.length; i++) {
    const expected = i + 1;
    const got = nums[i]?.n;
    if (got === undefined) continue;
    if (got !== expected) {
      out.push({
        code: "ADR_ID_GAP",
        severity: "warning",
        message: `Decision id sequence has a gap at D-${pad3(expected)} (found D-${pad3(got)} in '${nums[i]?.basename}'). Gaps are allowed but discouraged.`,
        path: `.belmont/memory/decisions/${nums[i]?.basename}`,
      });
      // Continue counting from the higher number so we don't cascade warnings.
      break;
    }
  }
}

async function validatePrdIndex(cwd: string, out: Diagnostic[]): Promise<void> {
  const belmontMd = await readIfExists(
    join(cwd, ".belmont", "BELMONT.md"),
  );
  if (belmontMd === undefined) return;
  const dir = join(cwd, ".belmont", "memory", "prds");
  const onDisk = new Set<string>();
  if (await isDir(dir)) {
    const entries = await readdir(dir);
    for (const name of entries) {
      const m = /^prd-(.+)\.md$/.exec(name);
      if (m) onDisk.add(m[1] as string);
    }
  }
  const indexed = extractPrdIndex(belmontMd);
  for (const slug of indexed) {
    if (!onDisk.has(slug)) {
      // Per v2.3 §5.3, BELMONT.md drift is a warning (matches Memory
      // map drift treatment). PRD index entries are stubs that point
      // forward to files the relevant milestone will author.
      out.push({
        code: "PRD_INDEX_MISSING_FILE",
        severity: "warning",
        message: `BELMONT.md ## Master PRD references prd-${slug} but memory/prds/prd-${slug}.md is missing.`,
        path: ".belmont/BELMONT.md",
      });
    }
  }
  for (const slug of onDisk) {
    if (!indexed.has(slug)) {
      out.push({
        code: "PRD_INDEX_DRIFT",
        severity: "warning",
        message: `memory/prds/prd-${slug}.md exists but is not listed under BELMONT.md ## Master PRD.`,
        path: `.belmont/memory/prds/prd-${slug}.md`,
      });
    }
  }
}

/**
 * Extract PRD slug list from BELMONT.md `## Master PRD` section.
 * Tolerant of `### prd-<slug>` sub-headings and `- prd-<slug>` bullets.
 */
export function extractPrdIndex(belmontMd: string): Set<string> {
  const lines = belmontMd.split("\n");
  const slugs = new Set<string>();
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+Master PRD\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    let m = /^###\s+prd-([a-z0-9][a-z0-9-]*)\s*$/i.exec(line);
    if (m) {
      slugs.add(m[1] as string);
      continue;
    }
    m = /^[-*]\s+`?prd-([a-z0-9][a-z0-9-]*)`?/i.exec(line);
    if (m) {
      slugs.add(m[1] as string);
    }
  }
  return slugs;
}

// ============================================================================
// FS helpers
// ============================================================================

async function readIfExists(absPath: string): Promise<string | undefined> {
  try {
    return await readFile(absPath, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
}

async function isDir(absPath: string): Promise<boolean> {
  try {
    const s = await stat(absPath);
    return s.isDirectory();
  } catch (err: unknown) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

