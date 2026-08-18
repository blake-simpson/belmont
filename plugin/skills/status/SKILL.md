---
name: status
description: Show current status of belmont tasks and milestones
alwaysApply: false
---

# Belmont: Status

Read the current project state and produce a formatted status report.

## Fast Path (Preferred)

If available, use the global CLI first:

```bash
belmont status --color=always
```

(`--color=always` forces ANSI colors on the status markers even though stdout is piped by the calling AI tool — the markers render in colour in the tool's output block, making the list easier to scan.)

If the command fails, fall back to the manual steps below.

## Modes

### Feature Listing Mode (default)

When no specific feature is requested:

1. Read `.belmont/PR_FAQ.md` — check if it exists and has content
2. Read `.belmont/PRD.md` — the master PRD (feature catalog)
3. Scan `.belmont/features/` for subdirectories
4. For each feature directory, read its `PRD.md` for the feature name and `PROGRESS.md` for task counts
5. **Archived features** — a feature directory that contains `ARCHIVE.md` (placed there by `/belmont:cleanup`) has no `PROGRESS.md`. Omit archived features entirely from the default listing. Only when the user explicitly asks for them, append a compact `Archived (N):` block (slug — name per line) below the active features.
6. Produce a **feature listing report** (see format below)

If no features exist yet, tell the user to run `/belmont:product-plan` to create their first feature.

If the user ran the CLI fast path above, the `--show-archived` flag controls this same behaviour (default: hidden entirely; with flag: compact list).

### Single Feature Mode

If a specific feature is requested (user says "show status for auth" or similar):

1. Set base path to `.belmont/features/<slug>/`
2. Read `{base}/PROGRESS.md` — every task state, milestone and count in the report comes from here.
3. Read `{base}/PRD.md` only for the feature's **name and one-line description**. If the report does not need more than that, read the header rather than the whole file.
4. For `{base}/TECH_PLAN.md`, `{base}/NOTES.md` and `.belmont/NOTES.md`, the report states only whether they exist and are non-empty — **check existence, do not read their contents.**
5. Produce the standard status report (see format below)

## Files to Read

Status is a **read-only report**, so read the least that produces it. Only the
first entry is read in full.

1. `{base}/PROGRESS.md` — **read fully.** Milestones, task states, session history. Everything the report counts comes from here.
2. `{base}/PRD.md` — **header only**, for the feature name and description. Task definitions are not needed: PROGRESS.md is the single source of truth for task state.
3. `{base}/TECH_PLAN.md` — **existence and non-emptiness only.** Do not read the contents.
4. `{base}/NOTES.md` — existence only.
5. `.belmont/NOTES.md` — existence only.

If the user asks a question the report does not answer, read what you need — this
is the default path, not a restriction.

If `.belmont/` directory doesn't exist, tell the user to run `belmont install` first.

## Feature Listing Report Format

When in feature listing mode:

```
Belmont Status
==============

Product: [Extract from master PRD title, or "Unnamed Product"]

PR/FAQ: [Written / Not written (run /belmont:working-backwards)]
Master Tech Plan: [Ready / Not written]

Features:
  [status] [slug]  [feature name]  [X/Y tasks done]
  [status] [slug]  [feature name]  [X/Y tasks done]
  ...

Use /belmont:status with a feature name for details.
Use /belmont:product-plan to add a new feature.

Legend: [v] verified  [x] done  [>] in progress  [!] blocked  [ ] todo  [-] withdrawn
```

Feature status indicators:
- [v] All tasks verified
- [x] All tasks complete
- [>] In progress
- [ ] Not started

## Standard Status Report Format

Produce a report following this exact format:

```
Belmont Status
==============

Feature: [Extract from PRD title]

Tech Plan: [Ready / Not written (run /belmont:tech-plan to create)]
Notes:     [Has notes / -- None]

Status: [Not Started | In Progress | Complete | Verified]

Tasks: X verified, Y done, Z in progress, W blocked, V pending (of N total)

  [v] P0-1: [Task name]
  [v] P0-2: [Task name]
  [x] P1-1: [Task name]
  [>] P1-2: [Task name]
  [!] P1-3: [Task name]
  [ ] P2-1: [Task name]
  [ ] P2-2: [Task name]

Milestones: (status computed from tasks)
  [v] M1: [Milestone name]       (all tasks verified)
  [>] M2: [Milestone name]       (3/5 tasks done)
  [ ] M3: [Milestone name]       (not started)

Blocked Tasks:
  - [!] P1-3: [Task name] — [reason if noted]

Next Milestone:
  - [Milestone ID] - [Milestone name]
Next Individual Task:
  - [Task ID] - [Task name]

When every pending milestone has an unmet `(depends: …)`, both lines
instead read the CLI's shape — never "None", which means finished:
Next Milestone:
  - (waiting on dependencies) [Milestone ID] depends on [dep ID] (status: [status]), …
Next Individual Task:
  - (waiting on dependencies — see Next Milestone above)

And when the next MILESTONE is offerable but no task is — every workable
task sits in a milestone whose dependencies are unmet — the task line
alone reads:
Next Individual Task:
  - (waiting on dependencies) next candidate sits in [Milestone ID] — depends on [dep ID] (status: [status]), …

Recent Activity:
---
Last completed: [Task ID] - [Task name]
Recent decisions:
  - [Last 3 decisions from Decisions Log]

Legend: [v] verified  [x] done  [>] in progress  [!] blocked  [ ] todo  [-] withdrawn
```

## How to Determine Status

### Task Status (from PROGRESS.md checkboxes)
- **Verified [v]**: `[v]` in PROGRESS.md
- **Done [x]**: `[x]` in PROGRESS.md (implemented, not yet verified)
- **In Progress [>]**: `[>]` in PROGRESS.md
- **Blocked [!]**: `[!]` in PROGRESS.md
- **Todo [ ]**: `[ ]` in PROGRESS.md

PROGRESS.md is the single source of truth for task state. PRD.md is a pure spec with no status markers.

### Overall Status (computed from tasks)
- **Not Started**: All tasks are `[ ]`
- **In Progress**: Mix of states
- **Complete**: All tasks are `[x]` or `[v]`
- **Verified**: All tasks are `[v]`

**Complete is not Verified.** A feature reading Complete with tasks still `[x]` means verification never recorded its result — every stop condition treats it as finished anyway. If the CLI reports done-but-unverified tasks, reproduce that warning verbatim in your output, including the `belmont reverify --feature <slug>` recovery. Do not summarise it away. See issue #30.

### Milestone Status (computed from tasks)
Milestone status is computed from its tasks — no markers on milestone headers. A milestone is verified when all its tasks are `[v]`.

### Next Milestone / Next Task (must match the CLI)
The next milestone is the **first pending milestone in document order whose `(depends: …)` annotation, if present, is met** — a dependency is met when the named milestone has at least one task and every one of them reads `[x]`, `[v]` or `[-]` (an empty milestone never satisfies a dependency), or when the name matches no milestone. The next task is the first `[ ]`/`[>]` task belonging to a milestone whose dependencies are met. When pending milestones exist but every one is dependency-blocked, print the "(waiting on dependencies)" lines shown in the output template — never "None", which loop stop conditions read as the feature being finished. And when a milestone IS offerable but every workable task hides behind an unmet dependency, the task line names the first such task's milestone and its unmet dependencies (the template's third shape) rather than a bare "None", which is indistinguishable from nothing-left.

### Task Priority Order
- Tasks are sorted by priority: P0 first, then P1, P2, P3
- Within same priority, by task number

## Rules

- **DO NOT** modify any files - this is read-only
- **DO NOT** run `git status` or otherwise inspect git. Belmont status is independent of git.
- **DO NOT** scan the codebase. Just use the progress + PRD files for info.
- **DO** read relevant files (PRD for task definitions, PROGRESS for task state)
- **DO** show all tasks with their current status from PROGRESS.md
- **DO** show milestones with computed status from their tasks
- **DO** show blocked tasks (marked [!]) if any exist
- **DO** show recent decisions from the Decisions Log
- **DO** truncate long task names (max ~55 characters)
