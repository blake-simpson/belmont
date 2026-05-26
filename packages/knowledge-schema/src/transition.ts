// applyTransition — pure state machine for PROGRESS.md marker flips.
// Operates on source string via captured task lineIndex; splices the single
// marker character between [ and ], preserving every other byte.

import {
  parseProgress,
  replaceMarkerAtLine,
  STATE_TO_MARKER,
} from "./progress.js";
import type { TaskState } from "./types.js";

export type TransitionInput = {
  milestone_id: string;
  task_id: string;
  to: TaskState;
  /** Required when `to === "verified"`; relative to project root. */
  evidence_path?: string;
  /** Optional free-text note (not written to the file; for caller logging). */
  note?: string;
};

export type TransitionErrorCode =
  | "EVIDENCE_REQUIRED"
  | "UNKNOWN_MILESTONE"
  | "UNKNOWN_TASK"
  | "INVALID_STATE"
  | "REWRITE_FAILED";

export type TransitionResult =
  | {
      ok: true;
      markdown: string;
      previous: TaskState;
      next: TaskState;
      milestoneId: string;
      taskId: string;
      noop: boolean;
    }
  | {
      ok: false;
      code: TransitionErrorCode;
      message: string;
    };

const VALID_STATES: ReadonlySet<TaskState> = new Set([
  "todo",
  "in_progress",
  "done",
  "verified",
  "blocked",
]);

export function applyTransition(
  md: string,
  input: TransitionInput,
): TransitionResult {
  if (!VALID_STATES.has(input.to)) {
    return {
      ok: false,
      code: "INVALID_STATE",
      message: `Unknown target state '${input.to}'. Valid: todo, in_progress, done, verified, blocked.`,
    };
  }
  if (input.to === "verified" && !input.evidence_path) {
    return {
      ok: false,
      code: "EVIDENCE_REQUIRED",
      message: "evidence_path is required for [v]",
    };
  }

  const parsed = parseProgress(md);
  const milestone = parsed.milestones.find((m) => m.id === input.milestone_id);
  if (!milestone) {
    return {
      ok: false,
      code: "UNKNOWN_MILESTONE",
      message: `Milestone '${input.milestone_id}' not found in PROGRESS.md.`,
    };
  }
  const task = milestone.tasks.find((t) => t.id === input.task_id);
  if (!task) {
    return {
      ok: false,
      code: "UNKNOWN_TASK",
      message: `Task '${input.task_id}' not found in milestone '${input.milestone_id}'.`,
    };
  }

  const previous = task.state;
  if (previous === input.to) {
    return {
      ok: true,
      markdown: md,
      previous,
      next: input.to,
      milestoneId: milestone.id,
      taskId: task.id,
      noop: true,
    };
  }

  const newMarker = STATE_TO_MARKER[input.to];
  const rewritten = replaceMarkerAtLine(md, task.lineIndex, newMarker);
  // task.lineIndex always points to a parseable task line because parseProgress
  // put it there; replaceMarkerAtLine only returns null for OOB or
  // non-task-format lines. Kept as a defensive guard.
  /* v8 ignore start */
  if (rewritten === null) {
    return {
      ok: false,
      code: "REWRITE_FAILED",
      message: `Internal: failed to rewrite marker at line ${task.lineIndex + 1}.`,
    };
  }
  /* v8 ignore stop */

  return {
    ok: true,
    markdown: rewritten,
    previous,
    next: input.to,
    milestoneId: milestone.id,
    taskId: task.id,
    noop: false,
  };
}
