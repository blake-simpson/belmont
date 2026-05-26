// /belmont:status — read .belmont/PROGRESS.md via the knowledge-schema
// parser and render a compact milestone tree. Read-only; never mutates.
// When .belmont/ is absent, prints the canonical "run `belmont init`
// first" message so users can bootstrap from inside the REPL too.

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseProgress, type Milestone, type MilestoneStatus } from "@belmont/knowledge-schema";
import type { ExtensionAPI } from "../pi/sdk.js";

const MARKERS: Record<string, string> = {
  todo: "[ ]",
  in_progress: "[>]",
  done: "[x]",
  verified: "[v]",
  blocked: "[!]",
};

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: "not started",
  in_progress: "in progress",
  done: "done (unverified)",
  verified: "verified",
  blocked: "blocked",
};

async function readProgress(cwd: string): Promise<string | undefined> {
  try {
    return await readFile(join(cwd, ".belmont", "PROGRESS.md"), "utf8");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw err;
  }
}

function renderMilestone(m: Milestone): string {
  let total = 0;
  let verified = 0;
  for (const t of m.tasks) {
    total += 1;
    if (t.state === "verified") verified += 1;
  }
  const summary = `${verified}/${total}`;
  const header = `### ${m.id}: ${m.name} — ${STATUS_LABEL[m.status]} (${summary})`;
  const taskLines = m.tasks.map((t) => {
    const marker = MARKERS[t.state] ?? `[${t.marker}]`;
    const id = t.id ? `${t.id} ` : "";
    return `  ${marker} ${id}${t.name}`;
  });
  return [header, ...taskLines].join("\n");
}

export function renderStatus(projectName: string, progressMd: string | undefined): string {
  if (progressMd === undefined) {
    return [
      `Project: ${projectName}`,
      "",
      "No .belmont/ directory found.",
      "Run `belmont init` first (or `/belmont:init` from this REPL).",
    ].join("\n");
  }
  const parsed = parseProgress(progressMd);
  const totalTasks = parsed.milestones.reduce((n, m) => n + m.tasks.length, 0);
  const milestoneCount = parsed.milestones.length;
  if (milestoneCount === 0) {
    return `Project: ${projectName}; 0 milestones; 0 tasks.`;
  }
  const verified = parsed.milestones.reduce(
    (n, m) => n + m.tasks.filter((t) => t.state === "verified").length,
    0,
  );
  const heading = `Project: ${projectName}; ${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"}; ${totalTasks} task${totalTasks === 1 ? "" : "s"} (${verified} verified).`;
  const sections = parsed.milestones.map(renderMilestone);
  return [heading, "", ...sections].join("\n");
}

export function registerStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand("belmont:status", {
    description: "Show Belmont milestone/task state from .belmont/PROGRESS.md",
    handler: async (_args, ctx) => {
      const progressMd = await readProgress(ctx.cwd);
      const projectName = basename(ctx.cwd);
      const report = renderStatus(projectName, progressMd);
      ctx.ui.notify(report, "info");
    },
  });
}
