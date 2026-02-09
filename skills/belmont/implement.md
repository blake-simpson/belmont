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

## Sub-Agent Execution Model

**CRITICAL**: You are the **orchestrator**. You MUST NOT perform the phase work yourself. Each phase below MUST be dispatched to a **sub-agent** — a separate, isolated process that runs the phase instructions and returns when complete.

### Choosing Your Dispatch Method

Use the **first** approach below whose required tools are available to you. Check your available tools **by name** — do not guess or skip ahead.

---

#### Approach A: Agent Teams (preferred)

**Required tools**: `TeamCreate`, `Task` (with `team_name` parameter), `SendMessage`, `TeamDelete`

If ALL of these tools are available to you, you MUST use this approach:

1. **Create a team** before spawning any agents:
   - Use `TeamCreate` with `team_name: "belmont-m{ID}"` (e.g., `"belmont-m2"`)

2. **For phases that run in parallel** (Phases 1 and 2), issue both `Task` calls **in the same message** (i.e., as parallel tool calls). Both calls use:
   - `team_name`: The team name you created
   - `name`: The agent role (e.g., `"codebase-agent"`, `"design-agent"`)
   - `subagent_type`: `"general-purpose"` (all belmont agents need full tool access including file editing and bash)
   - `mode`: `"bypassPermissions"`
   - Do **NOT** set `run_in_background: true`
3. Because both tasks are foreground, the orchestrator **automatically blocks** until both complete and **receives their output directly** — no `TaskOutput`, no polling, no sleeping.
4. **For sequential phases** (Phase 3, which runs after Phases 1 and 2), issue a single `Task` call with the same team parameters.

5. **Clean up after milestone completes** (in Step 6):
   - Send `shutdown_request` via `SendMessage` to each teammate
   - Call `TeamDelete` to remove team resources

---

#### Approach B: Parallel Foreground Sub-Agents

**Required tools**: `Task`

If `Task` is available but `TeamCreate` is NOT:

1. **For phases that run in parallel** (Phases 1 and 2), issue both `Task` calls **in the same message** (i.e., as parallel tool calls). Both calls use:
   - `subagent_type`: `"general-purpose"` (all belmont agents need full tool access including file editing and bash)
   - `mode`: `"bypassPermissions"`
   - Do **NOT** set `run_in_background: true`
2. Because both tasks are foreground, the orchestrator **automatically blocks** until both complete and **receives their output directly** — no `TaskOutput`, no polling, no sleeping.
3. **For sequential phases** (Phase 3, which runs after Phases 1 and 2), issue a single `Task` call with the same parameters.

No team cleanup needed.

---

#### Approach C: Sequential Inline Execution (fallback)

If neither `TeamCreate` nor `Task` is available:

1. For each phase, read the agent file (e.g., `.agents/belmont/codebase-agent.md`)
2. Execute its instructions fully within your own context
3. Complete all output before moving to the next phase
4. Do NOT blend phase work together — finish one completely before starting the next

---

### Important: Foreground, Not Background

**Do NOT use `run_in_background: true`** in Approaches A or B. Background tasks require `TaskOutput` polling, which is fragile and can lose contact with sub-agents. Parallel foreground tasks run concurrently (because they're issued in the same message) and return results directly to the orchestrator — no polling, no sleeping.

---

### Rules (apply to ALL approaches)

1. **DO NOT** read `.agents/belmont/*-agent.md` files yourself (unless using Approach C) — the sub-agents read them
2. **DO NOT** scan the codebase, analyze designs, or write implementation code — sub-agents do this
3. **DO** create the MILESTONE file with full orchestrator context before spawning any sub-agent
4. **DO** spawn sub-agents with minimal prompts (they read the MILESTONE file themselves)
5. **DO** wait for sub-agents to complete before proceeding to the next step
6. **DO** handle blockers and errors reported by sub-agents
7. **DO** include the full sub-agent preamble (identity + mandatory agent file) in every sub-agent prompt

## Step 3: Run the Agent Pipeline

Run ALL incomplete tasks in the milestone through the three phases below. Each agent reads its context from the MILESTONE file and writes its output back to it. You spawn exactly **3 sub-agents per milestone**.

**Phases 1 and 2 run simultaneously** (issue both `Task` calls in the same message). Phase 3 runs after both complete.

Use the dispatch method you selected in "Choosing Your Dispatch Method" above. For Approach A, create the team first, then issue parallel `Task` calls. For Approach B, issue parallel `Task` calls directly. For Approach C, execute inline sequentially.

---

### Phase 1: Codebase Scan (codebase-agent) — *runs in parallel with Phase 2*

**Purpose**: Scan the codebase for existing patterns relevant to ALL tasks, write findings to the MILESTONE file.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont codebase analysis agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/codebase-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete. Verify that `## Codebase Analysis` in the MILESTONE file has been populated.

---

### Phase 2: Design Analysis (design-agent) — *runs in parallel with Phase 1*

**Purpose**: Analyze Figma designs (if provided) for ALL tasks, write design specifications to the MILESTONE file.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont design analysis agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/design-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete. Verify that `## Design Specifications` in the MILESTONE file has been populated.

**IMPORTANT**: If the sub-agent reports that specific tasks have Figma URLs that failed to load, mark ONLY those tasks as 🚫 BLOCKED in the PRD. The remaining tasks continue to Phase 3.

---

**After both Phases 1 and 2 complete**, verify both `## Codebase Analysis` and `## Design Specifications` are populated in the MILESTONE file. Then proceed to Phase 3.

---

### Phase 3: Implementation (implementation-agent) — *runs after Phases 1 and 2*

**Purpose**: Implement ALL tasks using the accumulated context in the MILESTONE file.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont implementation agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/implementation-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> The MILESTONE file is at `.belmont/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete with all tasks implemented, verified, and committed. Verify that `## Implementation Log` in the MILESTONE file has been populated.

---

## Step 4: After Implementation Completes

Read the `## Implementation Log` section from `.belmont/MILESTONE.md`. For each task:

1. **Verify tracking updates** — The implementation agent should have already marked tasks in PRD.md and PROGRESS.md. If any were missed, update them now.
2. **Handle follow-up tasks** — If the implementation log listed out-of-scope issues:
   - Add them as new FWLUP tasks to `.belmont/PRD.md`
   - Add them to the appropriate milestone in `.belmont/PROGRESS.md`
3. **Handle blocked tasks** — If any tasks were reported as blocked during implementation:
   - Ensure they are marked 🚫 BLOCKED in PRD.md with the reason
   - Add blocker details to the Blockers section in PROGRESS.md

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
