---
name: status
description: Show the current project state — milestones, tasks, blocked items, recent activity — from .belmont/PROGRESS.md. Read-only. Use when the user says "show status", "what's the state", or wants the milestone view. Inside the Belmont harness, the native /belmont:status command runs a faster deterministic renderer — this skill body is the standalone fallback for vanilla Claude Code / Codex CLI / Cursor / vanilla pi.
---

# Belmont: Status

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/progress-grammar.md -->

You produce a formatted status report from `.belmont/PROGRESS.md`. You
do not modify anything. You do not inspect git. You do not scan the
codebase.

## Step 1 — Read the ledger + memory map

Read:

- `.belmont/PROGRESS.md` — the task ledger.
- `.belmont/BELMONT.md` — for the project name (from frontmatter or
  `# <Project>` heading) and the Master PRD index (feature → status
  rollup).

If `.belmont/` is missing, tell the user to run `belmont init`
(or `/belmont:init` in the harness) and stop.

## Step 2 — Compute milestone status

A milestone's status is **computed**, never read from a marker on its
header (milestone headers carry no markers). Compute:

- `verified` — every task in the milestone is `[v]`.
- `done` — every task is `[x]` or `[v]`, at least one is `[x]`.
- `blocked` — any task is `[!]`.
- `in_progress` — mix of states with at least one `[ ]` / `[>]` / `[x]`.
- `not_started` — every task is `[ ]`.

## Step 3 — Render

Output exactly:

```
Belmont Status
==============

Project: <name>

Master PRD:
  <status-marker> prd-<slug> — <one-clause brief>
  <status-marker> prd-<slug> — <one-clause brief>

Where <status-marker> is:
  [v] for shipped
  [>] for in-progress
  [ ] for planned

Milestones:
  <status-marker> M<N>: <name>   (<verified>/<total> verified, <done> done, <blocked> blocked)
  <status-marker> M<N>: <name>   ...

Where <status-marker> is:
  [v] all verified
  [x] all done (awaiting verify)
  [>] in progress
  [!] blocked
  [ ] not started

Tasks: <V> verified, <X> done, <P> in progress, <B> blocked, <T> pending (of <N> total)

Blocked tasks:
  [!] <task-id> — <name>  reason: <inline reason from task line>

Next ready task:
  <task-id> — <name> (M<N>: <milestone name>)
```

If `Blocked tasks:` is empty, omit the section. If `Next ready task:`
is empty (everything verified), say `All milestones verified — run /belmont:plan to add more.`

## Step 4 — Color and truncation

If the host CLI supports ANSI color and the output is going to a TTY,
color the markers: green `[v]`, white `[x]`, yellow `[>]`, red `[!]`,
grey `[ ]`. Otherwise output plain ASCII.

Truncate long task names to ~55 characters with an ellipsis. Never
truncate task IDs or milestone IDs.

## Rules

- **Read-only.** Never edit any file.
- **Never inspect git.** Belmont status is independent of working-tree
  state.
- **Never scan source.** The task ledger is the single source of truth.
- **Show every task.** Do not summarize away tasks the user might be
  looking for; the report's value is its completeness within one
  screenful.

## Begin

Read PROGRESS.md + BELMONT.md, render the report, stop. No questions
unless the file is missing.
