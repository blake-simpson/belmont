---
description: Implement just the next single pending task using the implementation agent
alwaysApply: false
---

# Belmont: Next

You are a lightweight implementation orchestrator. Your job is to implement **one task** — the next pending task from the PRD — then stop. Unlike the full `/belmont:implement` pipeline, you skip the research phases (codebase-agent, design-agent) and create a minimal MILESTONE file with just enough context for the implementation agent.

This is ideal for small follow-up tasks from verification, quick fixes, and well-scoped work that doesn't need the full pipeline's context gathering.

## When to Use This

- Follow-up tasks (FWLUP) created by verification
- Small, isolated bug fixes or adjustments
- Tasks with clear, self-contained scope
- Knocking out one quick task without the overhead of the full pipeline

## When NOT to Use This

- Large tasks that touch many files or systems
- Tasks that require Figma design analysis
- The first tasks in a brand-new milestone (use `/belmont:implement` instead)
- Multiple tasks you want done in sequence (use `/belmont:implement` for the full milestone)

## Setup

Read these files first:
- `.belmont/PRD.md` - The product requirements and task definitions
- `.belmont/PROGRESS.md` - Current progress and milestones
- `.belmont/TECH_PLAN.md` - Technical implementation plan (if exists)

## Step 1: Find the Next Task

1. Read `.belmont/PROGRESS.md` and find the **first pending milestone** (any milestone with unchecked `[ ]` tasks)
2. Within that milestone, find the **first unchecked task** (`[ ]`)
3. Look up that task's full definition in `.belmont/PRD.md`
4. If all tasks are complete, report "All tasks complete!" and stop

**Display the task you're about to implement**:

```
Next Task
=========
Milestone: [Milestone ID and name]
Task:      [Task ID]: [Task Name]
```

## Step 2: Create a Minimal MILESTONE File

Create `.belmont/MILESTONE.md` with a focused, lightweight version of the milestone file. Since this is a single-task shortcut, you fill in the context directly instead of spawning analysis agents.

```markdown
# Milestone: [ID] — [Name] (Single Task)

## Status
- **Milestone**: [e.g., M2: Core Features]
- **Mode**: Lightweight (next skill — single task, no analysis agents)
- **Created**: [timestamp]
- **Tasks**:
  - [ ] [Task ID]: [Task Name]

## Orchestrator Context

### Current Task
[Task ID and name — this is the only task being implemented]

### Task Definition
[Copy the FULL task definition from PRD.md verbatim — including all fields: description, solution, notes, verification, Figma URLs, etc.]

### Relevant Technical Context
[Extract sections from TECH_PLAN.md that are relevant to this specific task. If no TECH_PLAN exists, write "No TECH_PLAN.md found."]

### Scope Boundaries
- **In Scope**: Only the single task listed above
- **Out of Scope**: [Copy the PRD's "Out of Scope" section verbatim]

## Codebase Analysis
[Not populated — lightweight mode skips the codebase agent. The implementation agent will explore the codebase as needed.]

## Design Specifications
[Not populated — lightweight mode skips the design agent. Note any Figma URLs here if present.]

## Implementation Log
[Written by implementation-agent]
```

If Figma URLs exist for this task, note them in the Design Specifications section so the implementation agent is aware, but do not spawn a design agent.

## Step 3: Dispatch to Implementation Agent

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont implementation agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/implementation-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions. This is a single-task run — implement only the one task listed, then stop.
>
> **Note**: The Codebase Analysis and Design Specifications sections are not populated (lightweight mode). Explore the codebase as needed while implementing. Follow existing patterns and conventions. Check `CLAUDE.md` (if it exists) for project rules.

**Wait for**: Sub-agent to complete.

## Step 4: Process Results

After the implementation agent completes:

1. **Read the Implementation Log** from `.belmont/MILESTONE.md`
2. **Verify tracking updates** — the implementation agent should have marked the task in PRD.md and PROGRESS.md. If missed, update them now.
3. **Handle follow-up tasks** — if the implementation log listed out-of-scope issues:
   - Add them as new FWLUP tasks to `.belmont/PRD.md`
   - Add them to the appropriate milestone in `.belmont/PROGRESS.md`
4. **Check milestone completion** — if this was the last task in the milestone:
   - Update milestone status: `### ⬜ M1:` becomes `### ✅ M1:`

## Step 5: Clean Up MILESTONE File

Archive the MILESTONE file: `.belmont/MILESTONE.md` → `.belmont/MILESTONE-[TaskID].done.md` (e.g., `MILESTONE-P1-3.done.md`)

This prevents stale context from bleeding into the next run.

## Step 6: Report

Output a brief summary:

```
✅ Next Task Complete
=====================
Task:      [Task ID]: [Task Name]
Milestone: [Milestone ID and name]
Commit:    [short hash] — [commit message]
Files:     [count] changed

[1-2 sentence summary of what was done]
```

If the task turned out to be larger than expected or the implementation agent reported issues, note them and suggest the user run `/belmont:implement` for remaining work or `/belmont:verify` to check quality.

Prompt the user to "/clear" and then "/belmont:status", "/belmont:next", or "/belmont:verify".

## Important Rules

1. **One task only** — find the next task, implement it, stop. Do not continue to the next task.
2. **Use the implementation agent** — dispatch to a sub-agent, don't implement code yourself
3. **Create the MILESTONE file** — even in lightweight mode, use the MILESTONE file as the contract with the implementation agent
4. **Clean up after** — archive the MILESTONE file when done
5. **Stay in scope** — only implement what the task requires
6. **Update tracking** — ensure the task is marked complete in both PRD.md and PROGRESS.md
7. **Know your limits** — if the task is too complex for this lightweight approach, tell the user and suggest `/belmont:implement`
