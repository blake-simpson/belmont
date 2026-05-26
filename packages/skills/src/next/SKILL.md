---
name: next
description: Return the first ready task in PROGRESS.md whose milestone-immutability + dependency conditions are satisfied. Read-only — never mutates a marker. Use when the user says "what's next", "next task", "what should I work on", or starts a fresh session unsure what to pick up.
---

# Belmont: Next

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/progress-grammar.md -->

You are a read-only task picker. You scan `.belmont/PROGRESS.md`, find
the first task that is **ready to start**, and report it. You do NOT
mutate any marker; that is `/belmont:implement`'s job. You do NOT edit
source.

## Step 1 — Read PROGRESS.md

Read `.belmont/PROGRESS.md`. If the file is missing, tell the user to
run `belmont init` (or `/belmont:init` in the harness) and stop.

## Step 2 — Find the first pending milestone

A milestone is **pending** if any of its tasks is `[ ]`, `[>]`, `[x]`,
or `[!]`. (Milestones containing only `[v]` tasks are complete; skip.)
Pick the first pending milestone by document order.

If every milestone is complete, report `All milestones complete — run
/belmont:plan to add more.` and stop.

## Step 3 — Find the first ready task in that milestone

Walk the milestone's task list in document order. Pick the first task
whose marker is `[ ]` and whose dependencies are satisfied.

A task's dependencies are satisfied when:

- Every task above it in the same milestone with a *lower priority
  number* in the same priority class is either `[x]` or `[v]`. (P0-2
  needs P0-1 done; P1-1 doesn't need P0-1 done in principle, but in
  practice P0 tasks are usually completed before P1 tasks — surface
  this if relevant.)
- The milestone is not blocked by a sibling `[!]` task that the
  candidate task obviously depends on (judgement call; if unsure,
  flag it).
- The task line does not itself carry an inline `blocked: ...` note.

If no `[ ]` task in the milestone is ready, report any `[>]` (an
in-progress task that someone left mid-flight — usually the right
thing to resume) or any `[!]` (blocked, with the reason from the task
line). Otherwise report `Milestone M<N> has no ready task — every
remaining task is blocked or in-flight.`

## Step 4 — Surface the per-milestone tier overlay (informational)

If the picked milestone's header is followed by an HTML-comment
overlay (`<!-- belmont:models <agent>=<tier>+<provider>/<model> -->`),
quote it verbatim in the report. The user can pass `--tier` flags to
`/belmont:implement` to override individual agents per the M7
overlay-resolution rules.

## Step 5 — Report

Output exactly:

```
Next task
=========
Milestone: M<N>: <name>
Task:      <task-id> — <task name>
Overlay:   <quoted HTML-comment overlay or "none">
```

Then, on a second block, copy the task line verbatim and the milestone
header line so the user can paste them into a follow-up command.

Suggest the next move:

> Run `/belmont:implement <task-id>` to start, or
> `/belmont:plan <feature>` if the task feels wrong-sized.

## Rules

- **Read-only.** Never edit PROGRESS.md, never call `belmont_transition`.
- **Never inspect git, source, or the codebase.** This skill answers
  from the task ledger alone — fast and deterministic.
- **One task at a time.** Do not list multiple candidates unless the
  user explicitly asks for the queue.
- **Show, don't pick for them.** If the answer is genuinely ambiguous
  (two tasks in the same milestone at the same priority, neither with
  a clear dependency), say so and let the user choose.

## Begin

Read PROGRESS.md and report the first ready task. Do not ask
clarifying questions unless PROGRESS.md is missing or malformed.
