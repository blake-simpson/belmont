---
description: Reset belmont state files (PRD, PROGRESS, TECH_PLAN) to start fresh
alwaysApply: false
---

# Belmont: Reset

You are resetting the belmont state directory so the user can start a new planning session from scratch.

## CRITICAL RULES

1. **NEVER** clear files without explicit user confirmation.
2. **ONLY** modify files in the `.belmont/` directory.
3. Do NOT touch `.agents/`, source code, or any other files.

## Step 1: Read Current State

Read the following files (if they exist) and collect a summary:

- `.belmont/PRD.md` — Extract the feature name (from `# PRD: ...` heading), count of tasks, count of completed tasks (✅)
- `.belmont/PROGRESS.md` — Extract the status line, count of milestones, count of completed milestones (✅)
- `.belmont/TECH_PLAN.md` — Check if it exists and has content
- `.belmont/MILESTONE.md` — Check if an active MILESTONE file exists
- `.belmont/MILESTONE-*.done.md` — Check for any archived MILESTONE files

Optional helper:
- If the CLI is available, `belmont status --format json` can provide a quick task/milestone summary. Still check for MILESTONE files and TECH_PLAN existence.

If `.belmont/` does not exist or contains only empty templates, tell the user there is nothing to reset and stop.

## Step 2: Confirm With User

Present a clear summary of what will be destroyed and ask for confirmation. Use this exact format:

```
⚠️  Reset Belmont State
========================

This will reset ALL belmont planning files to blank templates:

  PRD.md        [feature name] — [X] tasks ([Y] complete)
  PROGRESS.md   [status] — [N] milestones ([M] complete)
  TECH_PLAN.md  [Exists / Does not exist]
  MILESTONE.md  [Active / Does not exist]
  Archives      [N archived MILESTONE files / None]

⚠️  This cannot be undone.

Type "yes" to confirm, or anything else to cancel.
```

Fill in the bracketed values from Step 1. If a file is already a blank template or doesn't exist, say "blank template" or "does not exist" instead of counts.

**Wait for the user's response.** Do NOT proceed until you receive a reply.

## Step 3: Handle Response

### If the user confirms (responds "yes", "y", "confirm", or similar affirmative):

Reset each file to its template state:

**`.belmont/PRD.md`** — overwrite with:

```
Run the /belmont:product-plan skill to create a plan for your feature.
```

**`.belmont/PROGRESS.md`** — overwrite with:

```markdown
# Progress: [Feature Name]

## Status: 🔴 Not Started

## PRD Reference
.belmont/PRD.md

## Milestones

### ⬜ M1: [Milestone Name]
- [ ] Task 1
- [ ] Task 2

## Session History
| Session | Date/Time           | Context Used | Milestones Completed |
|---------|------|--------------|---------------------|

## Decisions Log
[Numbered list of key decisions with rationale]

## Blockers
[Any blocking issues]
```

**`.belmont/TECH_PLAN.md`** — delete the file if it exists.

**`.belmont/MILESTONE.md`** — delete the file if it exists.

**`.belmont/MILESTONE-*.done.md`** — delete all archived MILESTONE files if any exist.

After clearing, report:

```
✅ Belmont state reset.

  PRD.md        → reset to template
  PROGRESS.md   → reset to template
  TECH_PLAN.md  → [deleted / did not exist]
  MILESTONE.md  → [deleted / did not exist]
  Archives      → [N deleted / none existed]

Run /belmont:product-plan to start a new plan.
```

### If the user declines (anything other than clear affirmative):

Report:

```
Cancelled. No files were changed.
```

Stop. Do not modify anything.

## Important Rules

1. Always show the summary BEFORE asking for confirmation
2. Never proceed without an explicit "yes" from the user
3. Do not partially reset — either reset everything or nothing
4. After clearing, prompt the user toward `/belmont:product-plan`
