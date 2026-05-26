// validateProjectedKnowledgeWrite — enforces v2.3 §4.4 cap rules.
//
// The deterministic rejection texts in §4.5 are emitted VERBATIM. Tests
// pin those strings — do not paraphrase.
//
// Some rules are file-local (cap counts, revisions footer, filename
// grammar, PROGRESS direct-write). Cross-file rules (memory-map cross-ref,
// monotonic decision-ID gaps) require a `context` argument; without it
// they're skipped so the function stays usable from the per-write
// `tool_call` hook with whatever state the caller can cheaply provide.

import type {
  ClassifiedTarget,
  Diagnostic,
  KnowledgeKind,
} from "./types.js";

import { generateSuggestion } from "./suggest.js";

export const PREFERENCES_MAX_LINES = 60;
export const BELMONT_MD_MAX_LINES = 400;

// Deterministic rejection texts — verbatim from plan v2.3 §4.5. Pinned by
// tests. Do not paraphrase.
export const REJECTION_TEXT = {
  PREFERENCES_TOO_LONG:
    "preferences.md exceeds 60 lines. Rewrite and consolidate it before saving; do not append new rules.",
  REVISIONS_REQUIRED:
    "PRD/ADR/subsystem facts must be amended in place and include exactly one updated bullet under ## Revisions.",
  NEW_FILE_NOT_IN_MEMORY_MAP:
    "New memory/<kind>/*.md files must be referenced from BELMONT.md ## Memory map in the same change.",
  BELMONT_MD_TOO_LONG:
    "BELMONT.md exceeds 400 lines. Consolidate sections or move detail into memory/ entries.",
  PROGRESS_DIRECT_WRITE:
    "Direct writes to .belmont/PROGRESS.md are not allowed. Use the belmont_transition tool.",
  FILENAME_TIMESTAMP_PREFIX:
    "memory/<kind>/*.md filenames must not be timestamp-prefixed. Timestamps live in memory/episodic/.",
  // D-002 deviation: date-only grammar; no HH-mm-ss segment.
  EPISODIC_FILENAME_INVALID:
    "memory/episodic/*.md filenames must match YYYY-MM-DD-<slug>.md. The HH-mm-ss segment from the plan is dropped per D-002; sub-day discrimination uses the slug.",
} as const;

export type ValidateContext = {
  /** Current BELMONT.md content; required for memory-map cross-ref. */
  belmontMd?: string;
  /** List of existing memory/decisions/D-NNN-*.md basenames (no `.md`) — used for monotonic gap warning. */
  existingDecisions?: string[];
};

export function validateProjectedKnowledgeWrite(
  before: string,
  after: string,
  target: ClassifiedTarget,
  context: ValidateContext = {},
): Diagnostic[] {
  const out: Diagnostic[] = [];

  // Rule 9 — PROGRESS.md direct write is always forbidden, even on no-op.
  if (target.kind === "progress") {
    out.push(
      attachSuggestion(
        {
          code: "PROGRESS_DIRECT_WRITE",
          severity: "error",
          message: REJECTION_TEXT.PROGRESS_DIRECT_WRITE,
        },
        after,
        before,
      ),
    );
    return out;
  }

  // No-op write: nothing changed → no rules to enforce.
  if (before === after) return out;

  // Rule 6 — filename grammar for kind directories (no timestamp prefix).
  if (
    target.kind === "adr" ||
    target.kind === "subsystem" ||
    target.kind === "constraint" ||
    target.kind === "prd"
  ) {
    if (/^\d{4}-\d{2}-\d{2}-/.test(target.basename)) {
      out.push(
        attachSuggestion(
          {
            code: "FILENAME_TIMESTAMP_PREFIX",
            severity: "error",
            message: REJECTION_TEXT.FILENAME_TIMESTAMP_PREFIX,
            path: target.relativePath,
          },
          after,
          before,
        ),
      );
    }
  }

  // Rule 7 — episodic filename grammar (date-only, D-002).
  if (target.kind === "episodic") {
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(target.basename)) {
      out.push(
        attachSuggestion(
          {
            code: "EPISODIC_FILENAME_INVALID",
            severity: "error",
            message: REJECTION_TEXT.EPISODIC_FILENAME_INVALID,
            path: target.relativePath,
          },
          after,
          before,
        ),
      );
    }
  }

  // Rule 3 — BELMONT.md cap.
  if (target.kind === "belmont-md") {
    const nonBlank = countNonBlankLines(after);
    if (nonBlank > BELMONT_MD_MAX_LINES) {
      out.push(
        attachSuggestion(
          {
            code: "BELMONT_MD_TOO_LONG",
            severity: "error",
            message: REJECTION_TEXT.BELMONT_MD_TOO_LONG,
            path: target.relativePath,
          },
          after,
          before,
        ),
      );
    }
  }

  // Rule 4 — preferences.md cap.
  if (target.kind === "preferences") {
    const nonBlank = countNonBlankLines(after);
    if (nonBlank > PREFERENCES_MAX_LINES) {
      out.push(
        attachSuggestion(
          {
            code: "PREFERENCES_TOO_LONG",
            severity: "error",
            message: REJECTION_TEXT.PREFERENCES_TOO_LONG,
            path: target.relativePath,
          },
          after,
          before,
        ),
      );
    }
  }

  // Rule 1 — Revisions footer required + new bullet on diff.
  if (isRevisionsKind(target.kind)) {
    const beforeRev = extractRevisionsBullets(before);
    const afterRev = extractRevisionsBullets(after);
    if (afterRev === null) {
      out.push(
        attachSuggestion(
          {
            code: "REVISIONS_MISSING_SECTION",
            severity: "error",
            message: REJECTION_TEXT.REVISIONS_REQUIRED,
            path: target.relativePath,
          },
          after,
          before,
        ),
      );
    } else {
      const beforeSet = new Set(beforeRev ?? []);
      const newBullets = afterRev.filter((b) => !beforeSet.has(b));
      if (newBullets.length === 0) {
        out.push(
          attachSuggestion(
            {
              code: "REVISIONS_NO_NEW_BULLET",
              severity: "error",
              message: REJECTION_TEXT.REVISIONS_REQUIRED,
              path: target.relativePath,
            },
            after,
            before,
          ),
        );
      }
    }
  }

  // Rule 5 — new memory/{kind} file referenced from BELMONT.md Memory map.
  // before === "" means the file is being created.
  if (
    before === "" &&
    isRevisionsKind(target.kind) &&
    context.belmontMd !== undefined
  ) {
    const refs = extractMemoryMapReferences(context.belmontMd);
    // Memory map entries are conventionally relative to the .belmont/ root,
    // not the project root — strip the prefix before searching.
    const needle = target.relativePath.replace(/^(?:.*\/)?\.belmont\//, "");
    const matched = refs.some((r) => r.includes(needle));
    if (!matched) {
      out.push(
        attachSuggestion(
          {
            code: "NEW_FILE_NOT_IN_MEMORY_MAP",
            severity: "error",
            message: REJECTION_TEXT.NEW_FILE_NOT_IN_MEMORY_MAP,
            path: target.relativePath,
          },
          after,
          before,
        ),
      );
    }
  }

  // Rule 8 — monotonic decision IDs (gap = warning, never blocks).
  if (
    target.kind === "adr" &&
    before === "" &&
    context.existingDecisions !== undefined
  ) {
    const myNum = extractDecisionNumber(target.basename);
    if (myNum !== null) {
      const existingNums = context.existingDecisions
        .map(extractDecisionNumber)
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      const maxN = existingNums[existingNums.length - 1] ?? 0;
      if (myNum !== maxN + 1) {
        out.push({
          code: "DECISION_ID_GAP",
          severity: "warning",
          message: `Decision ID D-${pad3(myNum)} is not monotonic (expected D-${pad3(maxN + 1)}). Gaps are allowed but discouraged.`,
          path: target.relativePath,
        });
      }
    }
  }

  return out;
}

// ============================================================================
// Helpers
// ============================================================================

function isRevisionsKind(kind: KnowledgeKind): boolean {
  return (
    kind === "adr" ||
    kind === "prd" ||
    kind === "subsystem" ||
    kind === "constraint"
  );
}

export function countNonBlankLines(md: string): number {
  return md.split("\n").filter((l) => l.trim().length > 0).length;
}

/**
 * Return the list of bullet lines (trimmed) under the `## Revisions` heading,
 * or null when the section is absent.
 */
export function extractRevisionsBullets(md: string): string[] | null {
  if (md.length === 0) return null;
  const lines = md.split("\n");
  let inSection = false;
  const bullets: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+Revisions\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) {
      break;
    }
    if (inSection && /^-\s+\S/.test(line)) {
      bullets.push(line);
    }
  }
  return inSection ? bullets : null;
}

/**
 * Extract paths/refs from a BELMONT.md Memory map table. Returns the raw
 * cell strings of the third column (file path) of each row. Best-effort —
 * tolerant of formatting variations.
 */
export function extractMemoryMapReferences(belmontMd: string): string[] {
  const lines = belmontMd.split("\n");
  let inMap = false;
  const refs: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+Memory map\s*$/i.test(line)) {
      inMap = true;
      continue;
    }
    if (inMap && /^##\s+/.test(line)) break;
    if (inMap && line.startsWith("|") && !/^\|\s*-+/.test(line)) {
      // Pipe-table row; columns delimited by `|`.
      const cells = line.split("|").map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
      for (const cell of cells) {
        if (cell.includes("memory/") || cell.endsWith(".md")) {
          refs.push(cell);
        }
      }
    }
  }
  return refs;
}

function extractDecisionNumber(basename: string): number | null {
  const m = /^D-(\d+)/.exec(basename);
  if (!m) return null;
  return Number.parseInt(m[1] ?? "", 10);
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function attachSuggestion(
  d: Diagnostic,
  after: string,
  before: string,
): Diagnostic {
  const suggestion = generateSuggestion(d, { after, before });
  return suggestion ? { ...d, suggestion } : d;
}
