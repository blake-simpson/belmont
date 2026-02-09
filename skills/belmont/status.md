---
description: Show current status of belmont tasks and milestones
alwaysApply: false
---

# Belmont: Status

Read the current project state and produce a formatted status report.

## Fast Path (Preferred)

If available, use the global CLI first:

```bash
belmont status
```

If the global CLI is not available, and a local helper exists, use it:

```bash
.belmont/bin/belmont status
```

If both commands fail or the helper is missing, fall back to the manual steps below.

## Files to Read

1. `.belmont/PRD.md` - Task definitions and completion status
2. `.belmont/PROGRESS.md` - Milestones and session history
3. `.belmont/TECH_PLAN.md` - Check if it exists and has content

If `.belmont/` directory doesn't exist, tell the user to run `belmont-install` first.

## Status Report Format

Produce a report following this exact format:

```
Belmont Status
==============

Feature: [Extract from PRD title]

Tech Plan: [✅ Ready / ⚠ Not written (run /belmont:tech-plan to create)]

Status: [🔴 Not Started | 🟡 In Progress | ✅ Complete | 🔴 BLOCKED: reason]

Tasks: X done, Y in progress, Z blocked, W pending (of N total)

  ✅ P0-1: [Task name]
  ✅ P0-2: [Task name]
  🔄 P1-1: [Task name]
  🚫 P1-2: [Task name]
  ⬜ P2-1: [Task name]
  ⬜ P2-2: [Task name]

Milestones:
  ✅ M1: [Milestone name]
  ⬜ M2: [Milestone name]
  ⬜ M3: [Milestone name]

Active Blockers:
  - [Blocker details from PROGRESS.md]

Next Milestone:
  - [Milestone ID] - [Milestone name]
Next Individual Task:
  - [Task ID] - [Task name]

Recent Activity:
---
Last completed: [Task ID] - [Task name]
Recent decisions:
  - [Last 3 decisions from Decisions Log]
```

## How to Determine Status

### Task Status
- **Complete (✅)**: Task header contains ✅ or [DONE]
- **Blocked (🚫)**: Task header contains 🚫 or BLOCKED
- **In Progress (🔄)**: First non-complete, non-blocked task
- **Pending (⬜)**: All other tasks

### Overall Status
- **🔴 Not Started**: No tasks complete, none in progress
- **🟡 In Progress**: Some tasks complete or work in progress
- **✅ Complete**: All tasks are complete (or complete + blocked)
- **🔴 BLOCKED**: Check PROGRESS.md for blocked status with reason

### Task Priority Order
- Tasks are sorted by priority: P0 first, then P1, P2, P3
- Within same priority, by task number

## Rules

- **DO NOT** modify any files - this is read-only
- **DO NOT** run `git status` or otherwise inspect git. Belmont status is independent of git.
- **DO NOT** scan the codebase. Just use the progress + PRD files for info.
- **DO** read relevant files (PRD, PROGRESS only)
- **DO** show all tasks with their current status
- **DO** show milestones from PROGRESS.md
- **DO** show blockers if any exist
- **DO** show recent decisions from the Decisions Log
- **DO** truncate long task names (max ~55 characters)
