// auto/decide.ts — the decide ladder (v2.3 §7.4).
//
// Two-tier ladder:
//   1. Pure rules (deterministic, instant, no LLM call):
//      a. Consume steering before anything else.
//      b. NO milestones at all                              → "plan"
//      c. All milestones already verified                   → "done"
//      d. Any [!] blocked task                              → "triage"
//      e. Any [>] in-flight task                            → "continue"
//      f. Any milestone where every task is [x] but not [v] → "verify"
//      g. Next ready task in declaration order              → "implement"
//   2. AI fallback (`/belmont:auto` config supplies a tier;
//      auto/loop.ts wires this to a fresh worker.newSession()
//      with the resolved decide-tier model). The fallback
//      ONLY fires when the rules ladder cannot pick — defensive,
//      almost never hit in the steady state but required by §7.4.
//
// Stuck-counter / iteration-bound guards (pre-decide, §7.4) live in
// the loop itself — `decideNextAction` is a pure projection of state
// (with AI fallback as an injected dep) so unit tests don't need a
// running pi worker.

import type { Milestone, Task, TaskState } from "@belmont/knowledge-schema";

export type DecisionAction =
  | { type: "consume_steer"; text: string }
  | { type: "plan"; reason: string }
  | { type: "triage"; milestoneId: string; taskId: string }
  | { type: "continue"; milestoneId: string; taskId: string }
  | { type: "verify"; milestoneId: string }
  | { type: "implement"; milestoneId: string; taskId: string }
  | { type: "done" }
  | { type: "stuck"; reason: string };

export type AutoScope =
  | { kind: "milestone"; milestoneId: string }
  | { kind: "all" };

export type DecideInput = {
  scope: AutoScope;
  milestones: Milestone[];
  /** Optional steering text, consumed BEFORE the rules ladder evaluates. */
  steeringText?: string;
};

/**
 * Pure decision projection. Step 1 of §7.4 (rules ladder). Returns the
 * action to take based on PROGRESS state alone — callers handle the
 * AI fallback for "stuck" results.
 */
export function decideRules(input: DecideInput): DecisionAction {
  if (input.steeringText) {
    return { type: "consume_steer", text: input.steeringText };
  }
  const scoped = scopeMilestones(input.milestones, input.scope);
  if (scoped.length === 0) {
    return { type: "plan", reason: "no milestones in scope" };
  }
  if (scoped.every((m) => m.tasks.length > 0 && m.tasks.every((t) => t.state === "verified"))) {
    return { type: "done" };
  }
  for (const m of scoped) {
    const blocked = m.tasks.find((t) => t.state === "blocked");
    if (blocked) return { type: "triage", milestoneId: m.id, taskId: blocked.id };
  }
  for (const m of scoped) {
    const inFlight = m.tasks.find((t) => t.state === "in_progress");
    if (inFlight) return { type: "continue", milestoneId: m.id, taskId: inFlight.id };
  }
  // Verify a milestone where every task is done but not yet verified.
  for (const m of scoped) {
    if (m.tasks.length === 0) continue;
    const allDone = m.tasks.every((t) => t.state === "done");
    if (allDone) return { type: "verify", milestoneId: m.id };
  }
  // Next ready task — first [ ] in source order.
  for (const m of scoped) {
    const next = m.tasks.find((t) => t.state === "todo");
    if (next) return { type: "implement", milestoneId: m.id, taskId: next.id };
  }
  return { type: "stuck", reason: "rules ladder produced no eligible action" };
}

/**
 * Full ladder. `decideRules` first; on a non-`stuck` result that's the
 * answer. Otherwise (`stuck`), delegate to the supplied `aiFallback`
 * for §7.4 step 2. The fallback is async — it's expected to run a
 * one-shot structured-decision call through the active worker.
 */
export async function decideNextAction(
  input: DecideInput,
  aiFallback?: (state: DecideInput) => Promise<DecisionAction | undefined>,
): Promise<DecisionAction> {
  const ruled = decideRules(input);
  if (ruled.type !== "stuck") return ruled;
  if (!aiFallback) return ruled;
  const ai = await aiFallback(input);
  if (!ai) return ruled;
  if (!isValidDecision(ai)) {
    return {
      type: "stuck",
      reason: `AI fallback returned an invalid decision (${ai.type}); falling back to rules-degraded.`,
    };
  }
  return ai;
}

export function isValidDecision(d: DecisionAction): boolean {
  switch (d.type) {
    case "consume_steer":
      return typeof d.text === "string" && d.text.length > 0;
    case "plan":
      return typeof d.reason === "string";
    case "triage":
    case "continue":
    case "implement":
      return (
        typeof d.milestoneId === "string" &&
        d.milestoneId.length > 0 &&
        typeof d.taskId === "string"
      );
    case "verify":
      return typeof d.milestoneId === "string" && d.milestoneId.length > 0;
    case "done":
    case "stuck":
      return true;
  }
}

// ────────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────────

export function scopeMilestones(
  milestones: Milestone[],
  scope: AutoScope,
): Milestone[] {
  if (scope.kind === "all") return milestones;
  return milestones.filter((m) => m.id === scope.milestoneId);
}

/** Find a specific task across a milestone list. */
export function findTask(
  milestones: Milestone[],
  milestoneId: string,
  taskId: string,
): Task | undefined {
  const m = milestones.find((x) => x.id === milestoneId);
  if (!m) return undefined;
  return m.tasks.find((t) => t.id === taskId);
}

/**
 * Eligible tasks for sequential execution within one /belmont:auto M<n>
 * invocation. Used by the loop to iterate after each decide-implement-
 * verify cycle (verification feeds the NEXT decide, so this is mostly
 * for "max iterations" bookkeeping).
 */
export function eligibleTasksInOrder(milestones: Milestone[], scope: AutoScope): Task[] {
  const out: Task[] = [];
  for (const m of scopeMilestones(milestones, scope)) {
    for (const t of m.tasks) {
      if (t.state === "todo" || t.state === "in_progress" || t.state === "done") {
        out.push(t);
      }
    }
  }
  return out;
}

/** Translate the M2 marker semantics to a human-readable label. */
export function markerLabel(state: TaskState): string {
  switch (state) {
    case "todo":
      return "[ ]";
    case "in_progress":
      return "[>]";
    case "done":
      return "[x]";
    case "verified":
      return "[v]";
    case "blocked":
      return "[!]";
  }
}
