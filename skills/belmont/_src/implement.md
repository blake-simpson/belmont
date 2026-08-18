---
description: Implement the next pending milestone from the PRD using the agent pipeline
alwaysApply: false
---

# Belmont: Implement

You are the implementation orchestrator. Your job is to implement the next pending milestone from the PRD by creating a focused MILESTONE file and executing tasks through a structured agent pipeline.

<!-- @include feature-detection.md feature_action="Ask which feature to implement, or auto-select the one with pending tasks" -->

<!-- @include worktree-awareness.md -->

<!-- @include milestone-immutability.md -->

## Setup

Read in this order. You do not know which milestone you are working on until
you have read PROGRESS.md, so reading the specs first means reading them for
every milestone instead of for yours.

**Always read:**
1. `{base}/PROGRESS.md` — first. Select the milestone before reading anything else.
2. `{base}/models.yaml` — small, and needed up front to resolve tiers (if exists — see "Model Tiers" below).
3. `{base}/NOTES.md` and `.belmont/NOTES.md` — feature-level and global learnings (if they exist). These stay eager on purpose: they are small, and Step 2 requires copying them into the MILESTONE file's `### Learnings from Previous Sessions`.

**Then read, scoped to the milestone you selected:**
4. `{base}/PRD.md` — the sections covering that milestone's task IDs. Read the whole file if it has no per-task structure, or if the sections you find do not fully explain the work.
5. `{base}/TECH_PLAN.md` — if the milestone touches architecture it describes (if exists). Skip when the milestone is self-contained.
6. `.belmont/TECH_PLAN.md` — only when the milestone is cross-cutting: it changes shared infrastructure or spans features (if in feature mode and exists).

This is guidance for the common case, not a prohibition. If a file you skipped
turns out to matter — the task is ambiguous, the design is unclear, an
acceptance criterion refers to something you have not read — read it. A wrong
implementation costs far more than a file read.

Optional helper:
- If the CLI is available, `belmont status --format json` can provide a quick summary of milestones/tasks.

## Model Tiers

Per-agent model tiers (low/medium/high) are defined in `{base}/models.yaml`. If that file is absent, each agent inherits the session model and you can skip the rest of this section.

<!-- @include tier-registry.md -->

<!-- @include tier-preflight.md -->

When dispatching sub-agents (Step 3 below), apply the tier overrides per `dispatch-strategy.md → Model Tier Overrides`. Specifically: for each dispatch call, if the corresponding agent has an entry in `models.yaml` `tiers:`, include `model: "<alias>"` in that call using the tier-registry mapping. Agents not listed in `models.yaml` inherit the session model — do NOT pass `model:` for those.

## Step 1: Find Next Milestone

0. **If the invocation names a milestone explicitly** (e.g. "IMPLEMENT MILESTONE M11"), use that one and skip the selection below — do not re-derive it. A caller that names a milestone has already ruled out the one you would pick: a milestone whose only live tasks are `[!]` stays pending by rule 3 forever, so first-pending selection returns it on every invocation and the work behind it is never reached.
1. Read `{base}/PROGRESS.md` and find the Milestones section
2. A milestone is **complete** if every task that is still live is marked `[v]` (verified). `[-]` withdrawn tasks are resolved — skip them, they neither block completion nor count towards it
3. A milestone is **pending** if any task is `[ ]`, `[>]`, `[x]`, or `[!]`
4. A pending milestone is **eligible** only if its heading's `(depends: …)` annotation, when present, is met — a dependency is met when every live task in the named milestone reads `[x]`, `[v]` or `[-]`, or when the name matches no milestone (the CLI ignores a dangling reference, and so must you). A milestone with an unmet dependency runs *after* what it depends on, never first, however early it sits in the file
5. Select the **first eligible pending milestone**
6. If milestones are pending but none is eligible, do not build anything: report which milestone waits on which dependency (`belmont status` prints the same thing as "(waiting on dependencies)") and stop
7. If all milestones are complete, report "All milestones complete!" and stop

## Step 2: Create the MILESTONE File

Write a structured MILESTONE file that all agents read from and write to. The MILESTONE file is a **coordination document**: it names the active tasks and points sub-agents at the canonical PRD and TECH_PLAN, which each sub-agent reads directly.

**Read `references/implement-milestone-template.md` for the exact structure, then write `{base}/MILESTONE.md` using that template.** Fill in the `## Orchestrator Context` section using information from PROGRESS.md and the user's invocation context.

**Mandatory rules while writing MILESTONE** (these MUST be observed every run — they are not in the reference file because they can never be skipped):

- **Do NOT copy PRD or TECH_PLAN content into MILESTONE.** The pointers in `### File Paths` are enough. Duplicating content wastes context across every sub-agent invocation.
- **`### Active Task IDs` lists IDs only** (e.g. `P0-1, P0-2`). The PRD holds the full definitions.
- **The three sub-agent-written sections (`## Codebase Analysis`, `## Design Specifications`, `## Implementation Log`) remain the source of truth for downstream agents** — they ARE written into MILESTONE and ARE read by Phase 3. Only the PRD/TECH_PLAN content is externalised; the sub-agent hand-off data stays inside MILESTONE. Leave these three headings present but empty; each agent will fill in its section.

## Sub-Agent Dispatch Strategy

Apply the following dispatch configuration:
- **Parallel agents**: Phase 1 (codebase-agent) + Phase 2 (design-agent, when not skipped) — spawn simultaneously
- **Sequential agent**: Phase 3 (implementation-agent) — runs after Phases 1 and 2 complete

<!-- @include dispatch-strategy.md -->

## Step 3: Run the Agent Pipeline

Run ALL incomplete tasks in the milestone through the phases below. Each agent reads its context from the MILESTONE file and writes its output back to it. You spawn **3 sub-agents per milestone — or 2 when Phase 2 is skipped** (see its skip rule).

**Phases 1 and 2 run simultaneously** (issue both dispatch calls in the same message). If Phase 2 is skipped, Phase 1 runs alone. Phase 3 runs after the preceding phases complete.

Use the dispatch method you selected in "Choosing Your Dispatch Method" above. Under **Approach A**, issue the parallel dispatch calls in one message. Under the **Sequential Inline** fallback (Approach B), execute each agent's instructions inline, finishing one completely before starting the next.

---

### Phase 1: Codebase Scan (codebase-agent) — *runs in parallel with Phase 2*

**Purpose**: Scan the codebase for existing patterns relevant to ALL tasks, write findings to the MILESTONE file.

**Spawn a sub-agent with this prompt**:

<!-- @include identity-preamble.md agent_role="codebase analysis" agent_file="codebase-agent.md" -->
>
> The MILESTONE file is at `{base}/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete. Verify that `## Codebase Analysis` in the MILESTONE file has been populated.

---

### Phase 2: Design Analysis (design-agent) — *runs in parallel with Phase 1*

**Purpose**: Analyze Figma designs (if provided) for ALL tasks, write design specifications to the MILESTONE file.

**Skip this phase entirely when the milestone has no design input.** You have already read the active tasks' PRD sections in Setup. Skip when **none** of them:

- carries a `**Figma**:` field or any Figma URL,
- links a mockup, screenshot or reference image, or
- produces visible UI — a page, component, layout, style, or user-facing copy change.

When you skip, write this into the MILESTONE file's `## Design Specifications` section and go straight to Phase 3:

```
[Not populated — no design input: no task in this milestone has a Figma URL,
reference image, or visible UI.]
```

Do **not** spawn the agent just to have it report there is nothing to analyse. That spends a full sub-agent's context — its own spec reads included — on a null result. A backend, data, infrastructure or tooling milestone typically has no design input at all.

**If in doubt, run it.** A missed design spec costs a rework cycle; an unnecessary run costs one sub-agent. This is a skip for the clear-cut case, not a judgement call to agonise over.

**Otherwise, spawn a sub-agent with this prompt**:

<!-- @include identity-preamble.md agent_role="design analysis" agent_file="design-agent.md" -->
>
> The MILESTONE file is at `{base}/MILESTONE.md`. Read it, then follow your instructions.

**Wait for**: Sub-agent to complete. Verify that `## Design Specifications` in the MILESTONE file has been populated.

**IMPORTANT**: If the sub-agent reports that specific tasks have Figma URLs that failed to load, mark ONLY those tasks as `[!]` blocked in PROGRESS.md with a note about the Figma failure. The remaining tasks continue to Phase 3.

---

**After both Phases 1 and 2 complete**, verify `## Codebase Analysis` is populated, and that `## Design Specifications` is either populated or carries the skip note above. Then proceed to Phase 3.

---

### Phase 3: Implementation (implementation-agent) — *runs after Phases 1 and 2*

**Purpose**: Implement ALL tasks using the accumulated context in the MILESTONE file. Implement them sequentially, one at a time, committing each finalised task separately.

Spawn a sub-agent with this prompt:

<!-- @include identity-preamble.md agent_role="implementation" agent_file="implementation-agent.md" -->
>
> The MILESTONE file is at `{base}/MILESTONE.md`. Read it, then follow your instructions.

**Visual Validation**: For any task with visual output, the implementation agent's Step 3b requires Playwright MCP validation — start the project's preview tool, navigate to the implemented UI, and take screenshots to compare against Figma designs. Do NOT silently skip this step.

**Wait for**: Sub-agent to complete with all tasks implemented, verified, and committed. Verify that `## Implementation Log` in the MILESTONE file has been populated.

---

## Step 4: After Implementation Completes

Read the `## Implementation Log` section from `{base}/MILESTONE.md`. For each task:

1. **Verify tracking updates** — The implementation agent should have already marked tasks `[x]` (done, not yet verified) in `{base}/PROGRESS.md`. If any were missed, update them now: `[>]` -> `[x]` for completed tasks.
2. **Handle follow-up tasks** — If the implementation log listed out-of-scope issues, add them as new `[ ]` tasks to the **current milestone** in `{base}/PROGRESS.md`. Follow the milestone-immutability rule below — do not create a new milestone for follow-ups and do not retarget them at a different milestone.
3. **Handle blocked tasks** — If any tasks were reported as blocked during implementation:
   - Mark them as `[!]` in `{base}/PROGRESS.md` with a note about why they are blocked
4. **Update master docs** — After implementing, update `.belmont/PRD.md` and `.belmont/TECH_PLAN.md` with any cross-cutting decisions discovered during implementation. Edit existing sections, remove stale info. These are living documents — actively curate them.

## Step 5: After Milestone Completes

When all tasks in the milestone are marked `[x]` (done):
1. Milestone status is computed — do NOT add emoji to milestone headers. A milestone is complete when all its tasks are `[x]` or `[v]`.
2. Report summary of the milestone:
   - Tasks completed
   - Commits made
   - Follow-up tasks created
   - Any issues encountered
3. **Update master PROGRESS** (`.belmont/PROGRESS.md`): If the file doesn't exist or still contains template/placeholder text (e.g., `[Feature Name]`, `[Milestone Name]`), initialize it first using the master progress format from the product-plan skill:
   ```
   # Progress: [Product Name from .belmont/PRD.md]
   ## Features
   | Feature | Slug | Priority | Dependencies | Status | Milestones | Tasks |
   |---------|------|----------|-------------|--------|------------|-------|
   ## Recent Activity
   | Date | Feature | Activity |
   |------|---------|----------|
   ```
   Then find the row for the current feature's slug in the `## Features` table (add a new row if missing) and update the Status, Milestones, and Tasks columns. Add a row to `## Recent Activity` noting the milestone completion.

## Step 6: Clean Up

**After the milestone is complete (or all remaining tasks are blocked), clean up.**

### Archive the MILESTONE file
1. **Archive** the MILESTONE file to `{base}/MILESTONE-[ID].done.md` (e.g., `MILESTONE-M2.done.md`)
   - **If no file of that name exists**, rename `{base}/MILESTONE.md` to it.
   - **If one already exists, APPEND to it — never rename over it.** A rename replaces the file silently, and the archive is keyed on the *milestone* while this skill can run against the same milestone more than once (a re-entered milestone, a reopened follow-up, a `/belmont:next` batch that already archived there). Separate each append with a `---` rule and keep the incoming file's `# Milestone:` heading, so each pass stays identifiable.
2. This prevents stale context from a completed milestone bleeding into the next one — what matters is that `MILESTONE.md` itself is cleared, not that the archive is short
3. If the user runs `/belmont:implement` again for the next milestone, a fresh MILESTONE file will be created

**IMPORTANT**: Do NOT delete the MILESTONE file — archive it. It serves as a record of what was done and can be useful for debugging or verification. That record is the *only* copy of what each sub-agent actually did, so overwriting an existing archive destroys it exactly as thoroughly as deleting it would.

<!-- @include commit-belmont-changes.md commit_context="after milestone implementation" -->

## Step 7: Final Actions

**Do NOT run `/belmont:verify` yourself.** Verification is a separate step — in the `auto` pipeline it runs automatically after implementation, and in manual mode the user decides when to verify. Running it here would duplicate work and cause the dedicated VERIFY step to find nothing to do.

Exit and prompt the user to "/clear" and then run "/belmont:verify", "/belmont:implement", or "/belmont:status" as appropriate.
- If you are Codex, instead prompt: "/new" and then "belmont:verify", "belmont:implement", or "belmont:status"
- If you are opencode, instead prompt: "/new" and then "/belmont/verify", "/belmont/implement", or "/belmont/status"

## Blocker Handling

If any task is blocked:
1. Mark it as `[!]` in `{base}/PROGRESS.md` with a note about why (e.g., `[!] P0-1: Task Name — blocked: reason`)
2. Skip to the next task in the milestone
3. If ALL remaining tasks in the milestone are blocked, report and stop (still clean up the MILESTONE file)

## Scope Guardrails

### Milestone Boundary (HARD RULE)

You may ONLY implement tasks that belong to the **current milestone** — the first pending milestone identified in Step 1. You MUST NOT:

- Implement tasks from future milestones, even if they seem easy or related
- "Get ahead" by starting work on the next milestone's tasks
- Add tasks to the current milestone that weren't already there

If you finish all tasks in the current milestone, **stop**. Report the milestone as complete. The user will invoke implement again for the next milestone.

### PRD Scope Boundary (HARD RULE)

ALL work must trace back to a specific task in `{base}/PRD.md`. You MUST NOT:

- Implement features, capabilities, or behaviors not described in the PRD
- Add "nice to have" improvements that aren't part of any task
- Refactor, restructure, or optimize code beyond what is required to complete the current task
- Create files, components, utilities, or endpoints that aren't needed by a task in the current milestone

If during implementation you discover something that **should** be done but **isn't in the PRD**, the correct action is:

1. Add it as a new `[ ]` task in the appropriate milestone in PROGRESS.md
2. Do NOT implement it now

### Scope Validation Checkpoint

The implementation agent (Phase 3) performs scope validation for each task before implementing it (see Step 0 in `implementation-agent.md`). As the orchestrator, verify before dispatching Phase 3:

1. All task IDs in the milestone exist in `{base}/PRD.md`
2. All tasks belong to the current milestone in `{base}/PROGRESS.md`
3. No tasks from other milestones have been included

If any check fails, STOP and report the issue rather than proceeding.

## Important Rules

1. **Create the MILESTONE file first** - Write it with active task IDs and file-path pointers to PRD/TECH_PLAN before spawning any agent. Do NOT copy PRD/TECH_PLAN content verbatim.
2. **MILESTONE is the coordination hub** - It lists active tasks and points sub-agents at the PRD/TECH_PLAN, which they read directly. Sub-agents fetch their own task definitions and technical specs from the canonical files.
3. **Minimal agent prompts** - Agents read from the MILESTONE file (and the PRD/TECH_PLAN it points at), not from your prompt

Additional operational rules (phase ordering, cleanup, blocker handling, quality gates) are in `references/implement-important-rules.md`. Read it for the full operational checklist.
