// /belmont:<skill> — route each of the 7 LLM-driven Belmont skills to
// its materialized SKILL.md body via pi.sendUserMessage. The 8th canonical
// skill (`status`) is bound to the deterministic M3 renderer in
// ../commands/status.ts; the standalone SKILL.md exists for vanilla CLI
// hosts that lack a fast deterministic renderer.
//
// Materialization happens in-process and is cached per-slug for the life
// of the process (canonical source is the single source of truth — same
// file the standalone `belmont-skills install` path materializes; v2.3
// §10.4). The harness ships @belmont/skills' bundled src/ tree via npm.

import {
  SKILLS,
  bundledSourceDir,
  materializeSkill,
  type Slug,
} from "@belmont/skills";
import type { ExtensionAPI } from "../pi/sdk.js";

// `status` is wired separately (commands/status.ts → renderStatus, M3).
// The other 7 share this LLM dispatch path.
const LLM_DISPATCHED: readonly Slug[] = SKILLS.filter((s) => s !== "status");

const SKILL_DESCRIPTIONS: Record<Slug, string> = {
  "working-backwards": "Run a Working Backwards / PR-FAQ session and write the result to BELMONT.md",
  plan: "Plan ONE feature — write its PRD, mint milestones+tasks, record ADRs",
  next: "Show the first ready task in PROGRESS.md (read-only)",
  implement: "Implement one named task — edit source, run checks, commit, flip the marker",
  verify: "Verify [x] tasks, flip to [v], and (on milestone close) run the fold step",
  status: "Show Belmont milestone/task state from .belmont/PROGRESS.md",
  prototype: "Build a throwaway prototype to make one design tradeoff visible",
  debug: "Surgical bug fix — auto (agent-verified) or manual (user + spec-reconcile) mode",
};

const cache = new Map<Slug, string>();

async function loadSkill(slug: Slug, source: string): Promise<string> {
  const cached = cache.get(slug);
  if (cached !== undefined) return cached;
  const body = await materializeSkill(slug, source);
  cache.set(slug, body);
  return body;
}

export function registerSkillCommands(pi: ExtensionAPI): void {
  const source = bundledSourceDir();
  for (const slug of LLM_DISPATCHED) {
    pi.registerCommand(`belmont:${slug}`, {
      description: SKILL_DESCRIPTIONS[slug],
      handler: async (args, _ctx) => {
        const body = await loadSkill(slug, source);
        const trimmed = args.trim();
        const message =
          trimmed.length > 0
            ? `${body}\n\n## Invocation arguments\n\n${trimmed}\n`
            : body;
        pi.sendUserMessage(message);
      },
    });
  }
}

/** Test-only: clear the per-process materialization cache. */
export function _resetSkillCache(): void {
  cache.clear();
}
