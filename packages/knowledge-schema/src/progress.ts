// PROGRESS.md byte-faithful parser.
//
// Lineage: ported from v0.10.7-final's parseMilestones (cmd/belmont/main.go:2505)
// and parseProgressSnapshot (:11664). Broadened to accept BOTH the legacy
// colon-form (`P0-1: Task`) and the v1.0 space-form (`P0-1 Task`) — see
// CLAUDE.md / `.belmont/memory/decisions/` and plan §5.1.

import type {
  Diagnostic,
  Milestone,
  MilestoneStatus,
  ParseProgressResult,
  Task,
  TaskState,
} from "./types.js";

// Legacy supported these emoji prefixes on milestone headers; v1.0 forbids
// them ("milestone status always computed, never stored"). The parser still
// matches them so the VALIDATOR can hard-fail with a deterministic message;
// otherwise we'd silently accept legacy state files but produce inscrutable
// errors downstream.
const EMOJI_PREFIX = /^[✅⬜🔄🚫]/u;
const MILESTONE_HEADER = /^###\s+(?:([✅⬜🔄🚫])\s*)?M(\d+):\s*(.+?)\s*$/u;
const DEPS_ANNOTATION = /\(depends:\s*(M\d+(?:\s*,\s*M\d+)*)\)\s*$/;
const TASK_LINE = /^(\s*)-\s+\[(.)\]\s+(.+?)\s*$/;
const TASK_ID_PREFIX = /^(P\d+-[\w][\w-]*)(?::\s+|\s+)(.+)$/;
const OVERLAY_LINE = /^\s*<!--\s*belmont:models\s+(.+?)\s*-->\s*$/;
const LEVEL_2_HEADING = /^##\s+/;

const MARKER_TO_STATE: Record<string, TaskState> = {
  " ": "todo",
  ">": "in_progress",
  x: "done",
  v: "verified",
  "!": "blocked",
};

export function parseProgress(md: string): ParseProgressResult {
  const source = md;
  const lines = source.split("\n");
  const milestones: Milestone[] = [];
  const warnings: Diagnostic[] = [];

  type Block = {
    headerLineIndex: number;
    headerLine: string;
    num: number;
    name: string;
    deps: string[];
    hadEmojiPrefix: boolean;
    rawLines: string[];
    innerLines: { idx: number; line: string }[];
  };

  let current: Block | null = null;

  const flushBlock = () => {
    if (!current) return;
    const milestone = finalizeBlock(current, warnings);
    milestones.push(milestone);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const headerMatch = MILESTONE_HEADER.exec(line);
    if (headerMatch) {
      flushBlock();
      const emoji = headerMatch[1] ?? "";
      const num = Number.parseInt(headerMatch[2] ?? "0", 10);
      let name = (headerMatch[3] ?? "").trim();
      const deps: string[] = [];
      const depsMatch = DEPS_ANNOTATION.exec(name);
      if (depsMatch) {
        name = name.replace(DEPS_ANNOTATION, "").trim();
        for (const dep of (depsMatch[1] ?? "").split(",")) {
          const trimmed = dep.trim();
          if (trimmed) deps.push(trimmed);
        }
      }
      current = {
        headerLineIndex: i,
        headerLine: line,
        num,
        name,
        deps,
        hadEmojiPrefix: emoji.length > 0,
        rawLines: [line],
        innerLines: [],
      };
      if (emoji) {
        warnings.push({
          code: "PROGRESS_EMOJI_HEADER",
          severity: "warning",
          message: `Milestone M${num} header carries a legacy status emoji (${emoji}). v1.0 computes status from tasks — strip the emoji.`,
          line: i + 1,
        });
      }
      continue;
    }

    // Level-2 heading (`## ...`) closes the current block. Level-3 (`### `)
    // never reaches this branch because it would have matched MILESTONE_HEADER
    // when it's a milestone, or fallen through as inner content otherwise.
    if (current && LEVEL_2_HEADING.test(line.trimStart())) {
      flushBlock();
      continue;
    }

    if (current) {
      current.rawLines.push(line);
      current.innerLines.push({ idx: i, line });
    }
  }

  flushBlock();

  return { milestones, warnings, source, lines };
}

function finalizeBlock(
  block: {
    headerLineIndex: number;
    headerLine: string;
    num: number;
    name: string;
    deps: string[];
    hadEmojiPrefix: boolean;
    rawLines: string[];
    innerLines: { idx: number; line: string }[];
  },
  warnings: Diagnostic[],
): Milestone {
  let overlay: string | null = null;
  let overlayLineIndex: number | null = null;

  // The overlay (if present) is on the FIRST non-blank inner line.
  for (const { idx, line } of block.innerLines) {
    if (line.trim().length === 0) continue;
    const overlayMatch = OVERLAY_LINE.exec(line);
    if (overlayMatch) {
      overlay = (overlayMatch[1] as string).trim();
      overlayLineIndex = idx;
    }
    break;
  }

  const tasks: Task[] = [];
  for (const { idx, line } of block.innerLines) {
    const taskMatch = TASK_LINE.exec(line);
    if (!taskMatch) continue;
    const marker = taskMatch[2] as string;
    const rest = (taskMatch[3] as string).trim();

    let state = MARKER_TO_STATE[marker];
    if (!state) {
      warnings.push({
        code: "PROGRESS_UNKNOWN_MARKER",
        severity: "warning",
        message: `Unknown task marker [${marker}] on line ${idx + 1}; falling back to todo.`,
        line: idx + 1,
      });
      state = "todo";
    }

    let id = "";
    let name = rest;
    const idMatch = TASK_ID_PREFIX.exec(rest);
    if (idMatch) {
      // Capture groups are required by the regex; non-null per JS regex semantics.
      id = idMatch[1] as string;
      name = (idMatch[2] as string).trim();
    }

    tasks.push({
      id,
      name,
      state,
      marker,
      lineIndex: idx,
      rawLine: line,
    });
  }

  const status = computeMilestoneStatus(tasks);

  return {
    id: `M${block.num}`,
    num: block.num,
    name: block.name,
    deps: block.deps,
    overlay,
    overlayLineIndex,
    tasks,
    headerLineIndex: block.headerLineIndex,
    rawLines: block.rawLines,
    status,
    hadEmojiPrefix: block.hadEmojiPrefix,
  };
}

export function computeMilestoneStatus(tasks: Task[]): MilestoneStatus {
  if (tasks.length === 0) return "not_started";
  if (tasks.some((t) => t.state === "blocked")) return "blocked";
  if (tasks.every((t) => t.state === "verified")) return "verified";
  if (tasks.every((t) => t.state === "done" || t.state === "verified")) {
    return "done";
  }
  if (tasks.every((t) => t.state === "todo")) return "not_started";
  return "in_progress";
}

/**
 * Replace the marker character of a single task in-place, preserving every
 * other byte. Used by `applyTransition`. Returns null if the indicated line
 * does not parse as a task line (defensive — the caller already validated).
 */
export function replaceMarkerAtLine(
  source: string,
  lineIndex: number,
  newMarker: string,
): string | null {
  const lines = source.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  const original = lines[lineIndex] as string;
  const match = TASK_LINE.exec(original);
  if (!match) return null;
  // The match preserves all bracket positions; we splice the single character.
  // Format: `<indent>- [<m>] <rest>` — replace the single char between brackets.
  /* v8 ignore next 4 — TASK_LINE only matches lines containing `[?]`,
     so openIdx and closeIdx are guaranteed to land at the bracket pair. */
  const openIdx = original.indexOf("[");
  if (openIdx === -1) return null;
  const closeIdx = original.indexOf("]", openIdx);
  if (closeIdx !== openIdx + 2) return null;
  const rewritten =
    original.slice(0, openIdx + 1) + newMarker + original.slice(closeIdx);
  lines[lineIndex] = rewritten;
  return lines.join("\n");
}

/** Render parsed milestones back to markdown. Used for round-trip and tests. */
export function serializeProgress(result: ParseProgressResult): string {
  return result.source;
}

/** Pre-known marker characters (for validation; the parser is more lenient). */
export const KNOWN_MARKERS = Object.keys(MARKER_TO_STATE);

/** State → marker lookup (inverse of MARKER_TO_STATE). */
export const STATE_TO_MARKER: Record<TaskState, string> = {
  todo: " ",
  in_progress: ">",
  done: "x",
  verified: "v",
  blocked: "!",
};

export { EMOJI_PREFIX };
