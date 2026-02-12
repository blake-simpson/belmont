---
description: Implement the next pending milestone from the PRD using the agent pipeline
alwaysApply: false
---

# Belmont: Implement

You are the implementation orchestrator. Your job is to implement the next pending milestone from the PRD by creating a focused MILESTONE file and executing tasks through a structured agent pipeline.

## Setup

Read these files first:
- `.belmont/PRD.md` - The product requirements
- `.belmont/PROGRESS.md` - Current progress and milestones
- `.belmont/TECH_PLAN.md` - Technical implementation plan (if exists)

Optional helper:
- If the CLI is available, `belmont status --format json` can provide a quick summary of milestones/tasks. Still read the files above for full context.

## Step 1: Find Next Milestone

1. Read `.belmont/PROGRESS.md` and find the Milestones section
2. A milestone is **complete** if all its tasks are marked with `[x]` or `✅`
3. A milestone is **pending** if any task is still `[ ]`
4. Select the **first pending milestone**
5. If all milestones are complete, report "All milestones complete!" and stop

## Step 2: Create the MILESTONE File

**This is the key change.** Instead of passing context through sub-agent prompts, you write a structured MILESTONE file that all agents read from and write to.

Create `.belmont/MILESTONE.md` with the following structure. Fill in the `## Orchestrator Context` section using information from the PRD, PROGRESS, and TECH_PLAN:

```markdown
# Milestone: [ID] — [Name]

## Status
- **Milestone**: [e.g., M2: Core Features]
- **Created**: [timestamp]
- **Tasks**:
  - [ ] [Task ID]: [Task Name]
  - [ ] [Task ID]: [Task Name]
  ...

## Orchestrator Context

### Current Milestone
[Milestone ID and name, with the full list of incomplete tasks in this milestone]

### Relevant PRD Context
[Extract from PRD.md: the Overview, Problem Statement, Technical Approach, and Out of Scope sections. Also extract the FULL task definitions for every incomplete task in this milestone — copy them verbatim from the PRD including all fields (description, solution, notes, verification, Figma URLs, etc.)]

### Relevant Technical Context
[Extract from TECH_PLAN.md: file structures, component specifications, TypeScript interfaces, implementation guidelines, and architecture decisions relevant to this milestone's tasks. Include code patterns and API specs. If no TECH_PLAN exists, write "No TECH_PLAN.md found."]

### Scope Boundaries
- **In Scope**: Only tasks listed above in this milestone
- **Out of Scope**: [Copy the PRD's "Out of Scope" section verbatim]
- **Milestone Boundary**: Do NOT implement tasks from other milestones

## Codebase Analysis
[Written by codebase-agent — stack, patterns, conventions, related code, utilities]

## Design Specifications
[Written by design-agent — tokens, component specs, layout code, accessibility]

## Implementation Log
[Written by implementation-agent — per-task status, files changed, commits, issues]
```

**IMPORTANT**: The `## Orchestrator Context` section is the **single source of truth** for all sub-agents. It must contain ALL information they need — task definitions verbatim from the PRD, relevant TECH_PLAN specs, and scope boundaries. Sub-agents read ONLY the MILESTONE file, so anything not in it will be invisible to them. Copy task definitions verbatim — don't summarize.

The three section headings (`## Codebase Analysis`, `## Design Specifications`, `## Implementation Log`) should be present but empty — each agent will fill in its section.

## Sub-Agent Dispatch Strategy

Apply the following dispatch configuration:
- **Team name**: `belmont-m{ID}` (e.g., `belmont-m2`)
- **Parallel agents**: Phase 1 (codebase-agent) + Phase 2 (design-agent) — spawn simultaneously
- **Sequential agent**: Phase 3 (implementation-agent) — runs after Phases 1 and 2 complete
- **Cleanup timing**: After Phase 3 completes (in Step 6)

<!-- @include dispatch-strategy.md -->

## Step 3: Run the Agent Pipeline

Run ALL incomplete tasks in the milestone through the three phases below. Each agent reads its context from the MILESTONE file and writes its output back to it. You spawn exactly **3 sub-agents per milestone**.

**Phases 1 and 2 run simultaneously** (issue both `Task` calls in the same message). Phase 3 runs after both complete.

Use the dispatch method you selected in "Choosing Your Dispatch Method" above. For Approach A, create the team first, then issue parallel `Task` calls. For Approach B, issue parallel `Task` calls directly. For Approach C, execute inline sequentially.

---

### Phase 1: Codebase Scan (codebase-agent) — *runs in parallel with Phase 2*

**Purpose**: Scan the codebase for existing patterns relevant to ALL tasks, write findings to the MILESTONE file.

**Spawn a sub-agent with this prompt**:

<!-- @include identity-preamble.md agent_role="codebase analysis" agent_file="codebase-agent.md" -->
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete. Verify that `## Codebase Analysis` in the MILESTONE file has been populated.

---

### Phase 2: Design Analysis (design-agent) — *runs in parallel with Phase 1*

**Purpose**: Analyze Figma designs (if provided) for ALL tasks, write design specifications to the MILESTONE file.

**Spawn a sub-agent with this prompt**:

<!-- @include identity-preamble.md agent_role="design analysis" agent_file="design-agent.md" -->
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete. Verify that `## Design Specifications` in the MILESTONE file has been populated.

**IMPORTANT**: If the sub-agent reports that specific tasks have Figma URLs that failed to load, mark ONLY those tasks as 🚫 BLOCKED in the PRD. The remaining tasks continue to Phase 3.

---

**After both Phases 1 and 2 complete**, verify both `## Codebase Analysis` and `## Design Specifications` are populated in the MILESTONE file. Then proceed to Phase 3.

---

### Phase 3: Implementation (implementation-agent) — *runs after Phases 1 and 2*

**Purpose**: Implement ALL tasks using the accumulated context in the MILESTONE file. Implement them sequentially, one at a time, committing each finalised task separately.

If you are NOT using Agent Teams: Spawn a sub-agent with this prompt:

<!-- @include identity-preamble.md agent_role="implementation" agent_file="implementation-agent.md" -->
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions.

If you ARE using Agent Teams: Add an implementation-agent into the team per task in the milestone, with the same prompt as above. Use the team-lead to coordinate between them if they need to edit the same areas fo the codebase.

**Wait for**: Sub-agent to complete with all tasks implemented, verified, and committed. Verify that `## Implementation Log` in the MILESTONE file has been populated.

---

## Step 4: After Implementation Completes

Read the `## Implementation Log` section from `.belmont/MILESTONE.md`. For each task:

1. **Verify tracking updates** — The implementation agent should have already marked tasks in PRD.md and PROGRESS.md. If any were missed, update them now.
2. **Handle follow-up tasks** — If the implementation log listed out-of-scope issues:
   - Add them as new FWLUP tasks to `.belmont/PRD.md`
   - Add them to a milestone in `.belmont/PROGRESS.md`:
     - If they relate to existing tasks in an existing milestone, add them to that milestone
     - If they are not related to any existing tasks, create a **new milestone** with the next sequential number (e.g., if implementing M9, create `### ⬜ M10: Follow-ups`) and add them there
3. **Handle blocked tasks** — If any tasks were reported as blocked during implementation:
   - Ensure they are marked 🚫 BLOCKED in PRD.md with the reason
   - Add blocker details to the Blockers section in PROGRESS.md. This should include the task ID and the reason it was blocked.

## Step 5: After Milestone Completes

When all tasks in the milestone are done:
1. Update milestone status in PROGRESS.md: `### ⬜ M1:` becomes `### ✅ M1:`
2. Update overall status if needed
3. Report summary of the milestone:
   - Tasks completed
   - Commits made
   - Follow-up tasks created
   - Any issues encountered

## Step 6: Clean Up

**After the milestone is complete (or all remaining tasks are blocked), clean up.**

### Archive the MILESTONE file
1. **Archive** the MILESTONE file by renaming it: `.belmont/MILESTONE.md` → `.belmont/MILESTONE-[ID].done.md` (e.g., `MILESTONE-M2.done.md`)
2. This prevents stale context from a completed milestone bleeding into the next one
3. If the user runs `/belmont:implement` again for the next milestone, a fresh MILESTONE file will be created

**IMPORTANT**: Do NOT delete the MILESTONE file — archive it. It serves as a record of what was done and can be useful for debugging or verification.

### Tear down team (Approach A only)
If you created a team:
1. Send `shutdown_request` via `SendMessage` to each teammate still active
2. Wait for shutdown confirmations
3. Call `TeamDelete` to remove team resources

Skip this if you used Approach B or C.

## Step 7: Final Actions

1. If you have just completed the final milestone and all work is complete, automatically run "/belmont:verify" to perform QA.
2. If there are more milestones, exit and prompt user to "/clear" and "/belmont:verify", "/belmont:implement", or "/belmont:status"
   - If you are Codex, instead prompt: "/new" and then "belmont:verify", "belmont:implement", or "belmont:status"

## Blocker Handling

If any task is blocked:
1. Mark it as `🚫 BLOCKED` in PRD.md with the reason
2. Add blocker details to the Blockers section in PROGRESS.md
3. Skip to the next task in the milestone
4. If ALL remaining tasks in the milestone are blocked, report and stop (still clean up the MILESTONE file)

## Scope Guardrails

### Milestone Boundary (HARD RULE)

You may ONLY implement tasks that belong to the **current milestone** — the first pending milestone identified in Step 1. You MUST NOT:

- Implement tasks from future milestones, even if they seem easy or related
- "Get ahead" by starting work on the next milestone's tasks
- Add tasks to the current milestone that weren't already there

If you finish all tasks in the current milestone, **stop**. Report the milestone as complete. The user will invoke implement again for the next milestone.

### PRD Scope Boundary (HARD RULE)

ALL work must trace back to a specific task in `.belmont/PRD.md`. You MUST NOT:

- Implement features, capabilities, or behaviors not described in the PRD
- Add "nice to have" improvements that aren't part of any task
- Refactor, restructure, or optimize code beyond what is required to complete the current task
- Create files, components, utilities, or endpoints that aren't needed by a task in the current milestone

If during implementation you discover something that **should** be done but **isn't in the PRD**, the correct action is:

1. Add it as a follow-up task (FWLUP) in the PRD
2. Add it to PROGRESS.md under an appropriate future milestone
3. Do NOT implement it now

### Scope Validation Checkpoint

The implementation agent (Phase 3) performs scope validation for each task before implementing it (see Step 0 in `implementation-agent.md`). As the orchestrator, verify before dispatching Phase 3:

1. All task IDs in the milestone exist in `.belmont/PRD.md`
2. All tasks belong to the current milestone in `.belmont/PROGRESS.md`
3. No tasks from other milestones have been included

If any check fails, STOP and report the issue rather than proceeding.

## Important Rules

1. **Create the MILESTONE file first** - Write it with full orchestrator context (PRD + TECH_PLAN) before spawning any agent
2. **MILESTONE is the single source of truth** - Sub-agents read ONLY the MILESTONE file. Everything they need must be in it.
3. **Minimal agent prompts** - Agents read from the MILESTONE file, not from your prompt
4. **All tasks, all phases** - Pass every task in the milestone through every phase. Exactly 3 sub-agents per milestone.
5. **Parallel research, then implement** - Codebase + Design run simultaneously, then Implementation runs after both complete
6. **Dispatch to sub-agents** - Spawn a sub-agent for each phase. Do NOT do the phase work inline.
7. **Read the Implementation Log** - After Phase 3 completes, read the `## Implementation Log` from the MILESTONE file to know what was done
8. **Update tracking files** - Keep PRD.md and PROGRESS.md current. Create follow-up tasks (FWLUP) for any out-of-scope issues reported by the implementation agent.
9. **Don't skip phases** - Even if no Figma design, still run the design phase (it handles the no-design case)
10. **Clean up the MILESTONE file** - Archive it after the milestone is complete
11. **Quality over speed** - Ensure verification passes before marking complete
12. **Stay in scope** - Never implement anything not traceable to a PRD task in the current milestone
