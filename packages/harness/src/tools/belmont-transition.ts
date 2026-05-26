// belmont_transition tool — the SOLE path for flipping markers in
// .belmont/PROGRESS.md (v2.3 §5.2). The knowledge-guard hook
// (hooks/knowledge-guard.ts) blocks raw write/edit to PROGRESS.md and
// the rejection text steers the agent here.
//
// Execute reads PROGRESS.md, calls the pure `applyTransition` state
// machine from @belmont/knowledge-schema (M2), writes the result back,
// and appends an episodic event so the auto loop (M8) can reconstruct
// state from the audit trail.
//
// On invalid input — unknown milestone/task, invalid target state, or
// missing evidence_path on a [v] transition — execute throws. Pi's
// agent loop catches the throw and surfaces it as a tool error (per the
// AgentTool contract: "Throw on failure instead of encoding errors in
// content").

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import {
  applyTransition,
  type TaskState,
} from "@belmont/knowledge-schema";
import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from "../pi/sdk.js";
import { appendOrCreateEpisode } from "../state/episodic.js";

const TRANSITION_SCHEMA = Type.Object({
  milestone_id: Type.String({
    description: "Milestone identifier, e.g. 'M2'.",
    pattern: "^M\\d+$",
  }),
  task_id: Type.String({
    description: "Task identifier within the milestone, e.g. 'P0-1'.",
    minLength: 1,
  }),
  to: Type.Union(
    [
      Type.Literal("todo"),
      Type.Literal("in_progress"),
      Type.Literal("done"),
      Type.Literal("verified"),
      Type.Literal("blocked"),
    ],
    {
      description:
        "Target task state. 'verified' requires a non-empty evidence_path.",
    },
  ),
  evidence_path: Type.Optional(
    Type.String({
      description:
        "Required when to='verified'. Project-relative path to the artefact proving the work shipped (file, commit-touched path, or report).",
      minLength: 1,
    }),
  ),
  note: Type.Optional(
    Type.String({
      description:
        "Optional free-text note. Surfaces in the episodic event body but is not written to PROGRESS.md.",
      maxLength: 280,
    }),
  ),
});

export type BelmontTransitionInput = Static<typeof TRANSITION_SCHEMA>;

export type BelmontTransitionDetails = {
  milestoneId: string;
  taskId: string;
  previous: TaskState;
  next: TaskState;
  noop: boolean;
  contentSha1: string;
  /** Project-relative path of the episodic file written. */
  episodicPath: string;
};

export function buildBelmontTransitionTool(): ToolDefinition<
  typeof TRANSITION_SCHEMA,
  BelmontTransitionDetails
> {
  return {
    name: "belmont_transition",
    label: "Belmont transition",
    description:
      "Change a Belmont PROGRESS.md task state. Required for ALL marker mutations — direct edits to .belmont/PROGRESS.md are blocked. Pass { milestone_id, task_id, to }; pass evidence_path when to='verified'.",
    promptSnippet:
      "Flip a Belmont task between [ ]→[>]→[x]→[v] (or [!]). Mandatory for any PROGRESS.md marker change; direct edits to .belmont/PROGRESS.md are rejected.",
    promptGuidelines: [
      "Always call belmont_transition (never the edit tool) to change a task marker in .belmont/PROGRESS.md.",
      "When transitioning to 'verified', set evidence_path to the project-relative path of the artefact proving the work shipped (a file you committed, a report, etc.).",
    ],
    parameters: TRANSITION_SCHEMA,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await executeBelmontTransition(ctx.cwd, params);
    },
  };
}

export async function executeBelmontTransition(
  cwd: string,
  params: BelmontTransitionInput,
): Promise<AgentToolResult<BelmontTransitionDetails>> {
  const progressPath = join(cwd, ".belmont", "PROGRESS.md");
  let before: string;
  try {
    before = await readFile(progressPath, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new Error(
        `.belmont/PROGRESS.md not found at ${cwd}. Run \`belmont init\` first.`,
      );
    }
    throw err;
  }

  const result = applyTransition(before, {
    milestone_id: params.milestone_id,
    task_id: params.task_id,
    to: params.to,
    ...(params.evidence_path !== undefined
      ? { evidence_path: params.evidence_path }
      : {}),
    ...(params.note !== undefined ? { note: params.note } : {}),
  });

  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }

  if (!result.noop) {
    await writeFile(progressPath, result.markdown, "utf8");
  }

  const contentSha1 = sha1(result.markdown);
  const evidence = params.evidence_path
    ? ` (evidence: ${params.evidence_path})`
    : "";
  const noteSuffix = params.note ? ` — ${params.note}` : "";
  const noopSuffix = result.noop ? " (noop)" : "";

  const episodic = await appendOrCreateEpisode({
    cwd,
    slug: "progress-transitions",
    kind: "transition",
    taskId: `${result.milestoneId}/${result.taskId}`,
    content: `${result.previous} → ${result.next}${evidence}${noteSuffix}${noopSuffix}`,
  });

  const summary = `${result.milestoneId}/${result.taskId}: ${result.previous} → ${result.next}${evidence}${noopSuffix}`;

  return {
    content: [{ type: "text", text: summary }],
    details: {
      milestoneId: result.milestoneId,
      taskId: result.taskId,
      previous: result.previous,
      next: result.next,
      noop: result.noop,
      contentSha1,
      episodicPath: episodic.relativePath,
    },
  };
}

export function registerBelmontTransitionTool(pi: ExtensionAPI): void {
  pi.registerTool(buildBelmontTransitionTool());
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
