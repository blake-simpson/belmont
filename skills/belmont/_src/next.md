---
description: Implement just the next single pending task using the implementation agent
alwaysApply: false
---

# Belmont: Next

You are a lightweight implementation orchestrator. Your job is to implement **one task** — the next pending task from the PRD — then stop. Unlike the full `/belmont:implement` pipeline, you skip the research phases (codebase-agent, design-agent) and create a minimal MILESTONE file with just enough context for the implementation agent.

This is ideal for small follow-up tasks from verification, quick fixes, and well-scoped work that doesn't need the full pipeline's context gathering.

<!-- @include feature-detection.md feature_action="Ask which feature to implement the next task for, or auto-select the one with pending tasks" -->

<!-- @include milestone-immutability.md -->

## When to Use This

- Follow-up tasks created by verification
- Small, isolated bug fixes or adjustments
- Tasks with clear, self-contained scope
- Knocking out one quick task without the overhead of the full pipeline

## When NOT to Use This

- Large tasks that touch many files or systems
- Tasks that require Figma design analysis
- The first tasks in a brand-new milestone (use `/belmont:implement` instead)

## Batch Mode

If the invoking prompt contains "BATCH MODE" instructions, implement **ALL pending follow-up tasks** in the current milestone sequentially instead of stopping after one:

1. After completing a task (Steps 1-5), loop back to Step 1 to find the next pending follow-up task
2. Continue until no pending follow-up tasks remain in the milestone
3. Archive each MILESTONE file individually after each task (Step 5) — which **appends** to the milestone's done-file, so every task's log survives the batch
4. Report a combined summary at the end listing all tasks completed

**Critical**: In batch mode, ONLY work on follow-up tasks (tasks added by verification). If Step 1 finds no pending follow-up tasks, stop immediately and report "No follow-up tasks to fix — batch mode complete." Do NOT pick up regular tasks. Regular tasks require the full `/belmont:implement` pipeline.

This mode is used by the auto loop to fix all follow-up issues in a single invocation, avoiding the overhead of re-invoking the tool CLI for each small fix.

**Important**: In batch mode, still dispatch each task individually to the implementation agent (one sub-agent per task). Do not try to batch multiple tasks into a single implementation agent call.

## Setup

Read in this order. You do not know which task you are implementing until you
have read PROGRESS.md, so reading the specs first means reading them for the
whole feature instead of for one task — and this is the lightweight path, where
that cost is least justified.

**Always read:**
1. `{base}/PROGRESS.md` — first. Select the task before reading anything else.
2. `{base}/NOTES.md` and `.belmont/NOTES.md` — feature-level and global learnings (if they exist). Small, and they carry the anti-patterns this loop exists to stop repeating.

**Then read, scoped to the task you selected:**
3. `{base}/PRD.md` — the section defining that task ID. Read the whole file if it has no per-task structure, or if the section does not fully explain the work.
4. `{base}/TECH_PLAN.md` — if the task touches architecture it describes (if exists). Skip when the task is self-contained.
5. `.belmont/TECH_PLAN.md` — only when the task is cross-cutting: it changes shared infrastructure or spans features (if in feature mode and exists).

This is guidance for the common case, not a prohibition. If a file you skipped
turns out to matter — the task is ambiguous, or an acceptance criterion refers
to something you have not read — read it. A wrong implementation costs far more
than a file read.

Optional helper:
- If the CLI is available, `belmont status --format json` can provide a quick summary of the next pending milestone/task.

## Model Tiers

Per-agent model tiers (low/medium/high) are defined in `{base}/models.yaml`. If that file is absent, the implementation agent inherits the session model and you can skip the rest of this section.

<!-- @include tier-registry.md -->

<!-- @include tier-preflight.md -->

When dispatching the implementation agent (Step 3 below), apply the tier override per `dispatch-strategy.md → Model Tier Overrides`: if `models.yaml` `tiers:` has an `implementation` entry, include `model: "<alias>"` in the dispatch call using the tier-registry mapping. If it does not, omit `model:` — the agent inherits the session model.

## Step 1: Find the Next Task

1. Read `{base}/PROGRESS.md` and find the **first pending milestone** (any milestone with unchecked `[ ]` tasks) **whose `(depends: …)` annotation, if present, is met** — a dependency is met when every live task in the named milestone reads `[x]`, `[v]` or `[-]`, or when the name matches no milestone. Never take a task from a milestone whose dependencies are unmet: it runs after them, however early it sits in the file. If pending milestones exist but every one has an unmet dependency, report which milestone waits on which and stop
2. Within that milestone, find the **first unchecked task** (`[ ]`)
   - **In batch mode**: Only consider follow-up tasks (tasks added by verification). If no follow-up tasks are pending, report "No follow-up tasks to fix — batch mode complete." and stop. Do NOT implement regular tasks.
3. Look up that task's full definition in `{base}/PRD.md`
4. If all tasks are complete, report "All tasks complete!" and stop

**Display the task you're about to implement**:

```
Next Task
=========
Milestone: [Milestone ID and name]
Task:      [Task ID]: [Task Name]
```

## Step 2: Create a Minimal MILESTONE File

Create `{base}/MILESTONE.md` with a focused, lightweight version of the milestone file. Since this is a single-task shortcut, you fill in the context directly instead of spawning analysis agents.

```markdown
# Milestone: [MilestoneID] — [Milestone Name] (Single Task)

## Status
- **Milestone**: [MilestoneID]: [Milestone Name] (e.g., M2: Core Features)
- **Git Baseline**: [Run `git rev-parse HEAD` and record the SHA here — this is used by verification agents to distinguish new code from pre-existing code]
- **Mode**: Lightweight (next skill — single task, no analysis agents)
- **Created**: [timestamp]
- **Tasks**:
  - [ ] [Task ID]: [Task Name]

## Orchestrator Context

### Current Task
[Task ID and name — this is the only task being implemented]

### Active Task IDs
[The single task ID being implemented, e.g. `P1-3`. The implementation-agent will look up the full task definition (description, solution, acceptance criteria, Figma URLs, notes) in {base}/PRD.md.]

### File Paths
- **PRD**: {base}/PRD.md — authoritative task definition, acceptance criteria, Figma URLs
- **TECH_PLAN**: {base}/TECH_PLAN.md — technical specs (if present)
- **Master TECH_PLAN**: .belmont/TECH_PLAN.md — cross-cutting architecture (if present)
- **PROGRESS**: {base}/PROGRESS.md
- **Feature Notes**: {base}/NOTES.md
- **Global Notes**: .belmont/NOTES.md

### Scope Boundaries
- **In Scope**: Only the single task ID listed above
- **Out of Scope**: See the "Out of Scope" section of {base}/PRD.md — nothing outside the listed task ID

### Learnings from Previous Sessions
[If `.belmont/NOTES.md` exists, copy its contents here under "#### Global Notes".]
[If `{base}/NOTES.md` exists, copy its contents here under "#### Feature Notes".]
[If neither exists, write "No previous learnings found."]

## Codebase Analysis
[Not populated — lightweight mode skips the codebase agent. The implementation agent will explore the codebase as needed.]

## Design Specifications
[Not populated — lightweight mode skips the design agent. Note any Figma URLs here if present.]

## Implementation Log
[Written by implementation-agent]
```

If Figma URLs exist for this task, note them in the Design Specifications section so the implementation agent is aware, but do not spawn a design agent.

## Sub-Agent Dispatch Strategy

Apply the following dispatch configuration:
- **Parallel agents**: None
- **Sequential agent**: implementation-agent — one dispatch per task. In batch mode that is one dispatch per follow-up task, sequentially; never batch several tasks into a single call.

<!-- @include dispatch-strategy.md -->

## Step 3: Dispatch to Implementation Agent

Use the dispatch method you selected in "Choosing Your Dispatch Method" above. Under **Approach A**, issue a single dispatch call — with `model:` per the Model Tiers section when `models.yaml` names an implementation tier. Under the **Sequential Inline** fallback (Approach B), execute the implementation agent's instructions inline, and say so.

**The sub-agent prompt**:

<!-- @include identity-preamble.md agent_role="implementation" agent_file="implementation-agent.md" -->
>
> The MILESTONE file is at `{base}/MILESTONE.md`. Read it, then follow your instructions. This is a single-task run — implement only the one task listed, then stop.
>
> **Note**: The Codebase Analysis and Design Specifications sections are not populated (lightweight mode). Explore the codebase as needed while implementing. Follow existing patterns and conventions. Check `CLAUDE.md` (if it exists) for project rules.

**Wait for**: Sub-agent to complete.

## Step 4: Process Results

After the implementation agent completes:

1. **Read the Implementation Log** from `{base}/MILESTONE.md`
2. **Verify tracking updates** — the implementation agent should have marked the task `[x]` in `{base}/PROGRESS.md`. If missed, update it now: `[ ]` or `[>]` -> `[x]`.
3. **Handle follow-up tasks** — if the implementation log listed out-of-scope issues:
   - Add them as new `[ ]` tasks to the appropriate milestone in `{base}/PROGRESS.md`
4. **Check milestone completion** — milestone status is computed from its tasks. No header changes needed.
5. **Update master docs** — If cross-cutting decisions were discovered, update `.belmont/PRD.md` and `.belmont/TECH_PLAN.md`. Edit existing sections, remove stale info.
6. **Update master PROGRESS** (`.belmont/PROGRESS.md`): If the file doesn't exist or still contains template/placeholder text (e.g., `[Feature Name]`, `[Milestone Name]`), initialize it first:
   ```
   # Progress: [Product Name from .belmont/PRD.md]
   ## Features
   | Feature | Slug | Priority | Dependencies | Status | Milestones | Tasks |
   |---------|------|----------|-------------|--------|------------|-------|
   ## Recent Activity
   | Date | Feature | Activity |
   |------|---------|----------|
   ```
   Then find the row for the current feature's slug in the `## Features` table (add a new row if missing). Increment the Tasks done count. If this completed a milestone, also update the Milestones count and Status columns. Add a row to `## Recent Activity` noting what was completed.

## Step 5: Clean Up MILESTONE File

Archive the MILESTONE file: `{base}/MILESTONE.md` → `{base}/MILESTONE-[MilestoneID].done.md` (e.g., `MILESTONE-M2.done.md`). Use the **milestone ID** (M1, M2, etc.), NOT the task ID.

**If a file with that name already exists, APPEND to it — never overwrite.** The filename is keyed on the milestone, but this skill runs once per *task*, so a milestone with four follow-ups produces four logs under one name. Overwriting keeps only the last, and the other three are in no commit and nowhere else — the implementation log is the only record of what a sub-agent actually did. Separate each append with a `---` rule and a `## Task <task ID>` heading so the file stays readable.

This still prevents stale context bleeding into the next run: what matters is that `MILESTONE.md` itself is cleared, not that the archive is short.

<!-- @include commit-belmont-changes.md commit_context="after task completion" -->

## Step 6: Report

Output a brief summary:

```
Next Task Complete
=====================
Task:      [Task ID]: [Task Name]
Milestone: [Milestone ID and name]
Commit:    [short hash] — [commit message]
Files:     [count] changed

[1-2 sentence summary of what was done]
```

If the task turned out to be larger than expected or the implementation agent reported issues, note them and suggest the user run `/belmont:implement` for remaining work or `/belmont:verify` to check quality.

Prompt the user to "/clear" and then "/belmont:status", "/belmont:next", or "/belmont:verify".
   - If you are Codex, instead prompt: "/new" and then "belmont:status", "belmont:next", or "belmont:verify"
   - If you are opencode, instead prompt: "/new" and then "/belmont/status", "/belmont/next", or "/belmont/verify"

## Important Rules

1. **One task only** (unless in batch mode) — find the next task, implement it, stop. In batch mode, continue to the next follow-up task until none remain.
2. **Use the implementation agent** — dispatch to a sub-agent, don't implement code yourself
3. **Create the MILESTONE file** — even in lightweight mode, use the MILESTONE file as the contract with the implementation agent
4. **Clean up after** — archive the MILESTONE file when done
5. **Stay in scope** — only implement what the task requires
6. **Update tracking** — ensure the task is marked `[x]` in PROGRESS.md
7. **Know your limits** — if the task is too complex for this lightweight approach, tell the user and suggest `/belmont:implement`
