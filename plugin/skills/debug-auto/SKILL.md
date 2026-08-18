---
name: debug-auto
description: Auto debug loop — investigate, fix, verify using agent-dispatched pipeline
alwaysApply: false
---

# Belmont: Debug (Auto)

You are the debug orchestrator running in **auto mode**. Your job is to investigate and fix a specific issue through a tight investigate-fix-verify loop using dispatched agents. Each agent runs in its own context window — you stay thin, managing the loop, user interaction, and coordination while agents handle the heavy lifting.

The verification agent automatically checks each fix attempt. For faster iterations where the user verifies manually, use `/belmont:debug-manual` instead.

**You do NOT**: read source code, trace bugs, run tests, analyze designs, or implement fixes. You create/update `DEBUG.md`, dispatch agents, read their outputs, and make loop decisions.

**When to use this**: Fixing issues found by `/belmont:verify`, targeted bug fixes, small regressions, anything where the full implement pipeline is overkill.

**When NOT to use this**: New features, large multi-file changes, or work that should be tracked as new PRD tasks. Use `/belmont:implement` or `/belmont:next` instead.

## Feature Selection

Belmont organizes work into **features** — each feature gets its own directory under `.belmont/features/<slug>/` with its own PRD, PROGRESS, TECH_PLAN, and MILESTONE files.

### Select the Active Feature

1. List all feature directories under `.belmont/features/`
2. If features exist: read each feature's `PRD.md` for its name and status, then Ask which feature the bug relates to, or auto-select if obvious from context
3. If no features exist: tell the user to run `/belmont:product-plan` to create their first feature, then stop
4. Set the **base path** to `.belmont/features/<selected-slug>/`

### Base Path Convention

Once the base path is resolved, use `{base}` as shorthand:
- `{base}/PRD.md` — the feature PRD
- `{base}/PROGRESS.md` — the feature progress tracker
- `{base}/TECH_PLAN.md` — the feature tech plan
- `{base}/MILESTONE.md` — the active milestone file
- `{base}/MILESTONE-*.done.md` — archived milestones
- `{base}/NOTES.md` — learnings and discoveries from previous sessions

**Master files** (always at `.belmont/` root):
- `.belmont/PR_FAQ.md` — strategic PR/FAQ document
- `.belmont/PRD.md` — master PRD (feature catalog)
- `.belmont/PROGRESS.md` — master progress tracking (feature summary table)
- `.belmont/TECH_PLAN.md` — master tech plan (cross-cutting architecture)

<!-- Canonical milestone-immutability rule. Included by every skill that can modify PROGRESS.md. Do not paraphrase in skill bodies — @include this partial so the rule stays a single source of truth. -->

## Milestone structure is immutable outside `/belmont:tech-plan`

**You MUST NOT add, remove, rename, re-scope, or re-parent any `### M<N>:` milestone heading in `PROGRESS.md`.** Only `/belmont:tech-plan` may restructure milestones. Every other skill — `implement`, `verify`, `next`, `debug-auto`, `debug-manual`, the triage phase — may only edit tasks **inside** existing milestone headings.

A milestone heading is **level 3** — `### M<N>: Name`, at column zero. Never write it as `## M<N>:`. A level-2 heading at column zero is what *ends* the milestones region: every task line below one belongs to no milestone, is counted by nothing and is never scheduled. So `## M30:` would both fail to create a milestone and silently orphan everything after it.

This rule supersedes any contradictory guidance you encounter elsewhere. If another instruction seems to permit creating a milestone (for follow-ups, polish, cleanup, verification fixes, etc.), prefer this rule.

### Where follow-ups go

- **Issue discovered while implementing or verifying milestone `M<N>`** → new `[ ]` task inside `M<N>`, under the same `### M<N>:` heading. Do not route it to an earlier or later milestone "because it fits there better"; the milestone that discovered it owns it.
- **Issue blocked by work that will land in a later milestone `M<N+k>`** → new `[!]` task inside `M<N>`, with a one-line reason that names `M<N+k>`. Auto surfaces `[!]` tasks as blockers; the task can be reopened as `[ ]` once the blocker lifts.
- **Issue found by a cross-cutting sweep, belonging to no single milestone** → new `[ ]` task inside the **highest-numbered existing milestone whose work it touches**. If it is genuinely global — it touches everything, or nothing in particular — that is the **last milestone in the plan**. Still never a new milestone, and never left outside every milestone: a task below the last `### M<N>:` heading is counted by nothing and never scheduled, which is not "deferred", it is lost. Pick the milestone by what the fix *depends on*, not by where the problem started: filing it under the earliest milestone it touches re-opens work the later ones already built on, which is exactly the dependency-graph lie described below.

  **This bullet applies only to `/belmont:tech-plan`, `/belmont:repair` and `/belmont:debug-manual`** — the skills that run outside the auto loop. If you are in an `implement` / `verify` / `next` / `debug-auto` phase, you may only write inside the milestone your phase targets: `runScopeGuard` reverts a task added to any other milestone and your follow-up text is lost with it. There, the first bullet governs — the milestone you are in owns the finding — and if it genuinely belongs elsewhere, say so in your report and let the user run `/belmont:tech-plan`.
- **Cosmetic / nice-to-have item the user may never want** → append to `NOTES.md` under a `## Polish` section, creating the file if needed. These are context, not tasks.
- **Never a new milestone.** Not "M<last+1>: Polish", not "M<N>-FIX", not "MX: Deviations from M<N>", not "MY: Verification Fixes". Even if the existing `PROGRESS.md` already contains such a milestone from a prior run, that pattern is WRONG — do not add tasks to it and do not create siblings of it.

### Why this rule is non-negotiable

A polish/follow-up milestone looks tidy on paper but quietly breaks two invariants of the auto loop:

1. **Dependency graph lies.** A milestone labelled "polish M<N>" typically declares `(depends: M<N>)`. That makes it a sibling of every other `M<N+i>` that depends on `M<N>`. But its *real* dependency is that every later milestone's outputs are frozen — because the polish milestone edits the very files those later milestones imported from `M<N>`. Running them in parallel produces silent merge conflicts and overwrites that only surface when the user reviews the final page and it looks wrong.
2. **Auto loop grows without bound.** Every verify pass can discover follow-ups. If those follow-ups become a new milestone instead of new tasks in the current one, a 5-milestone feature can turn into 9 milestones mid-run, each re-triggering its own verify-fix-reverify cycle, compounding scope drift with every iteration.

Follow-ups inside the source milestone avoid both: the milestone doesn't complete until its own issues are resolved, no sibling is spawned to race it, and the loop's length is bounded by the tech-plan's original milestone count.

### If you find a pre-existing bad milestone

If `PROGRESS.md` already contains a milestone whose name or description matches the forbidden patterns (polish, follow-ups, cleanup, verification fixes, deviations from M<N>, etc.), do the following:

- Do NOT add new tasks to it.
- Do NOT create new milestones that depend on it or reference its tasks.
- Surface the issue in your summary/report to the user, suggesting `belmont validate` and `/belmont:tech-plan` to restructure.

Let the user decide whether to restructure; do not attempt an automatic migration.

## Step 0: Understand the Problem

1. If the user provided a description with the skill invocation, use it as the problem statement
2. If the description is vague or missing, ask **one** clarifying question — keep it focused:
   - What's the expected behavior?
   - What's the actual behavior?
   - How do you reproduce it?
3. Read `{base}/NOTES.md` and `.belmont/NOTES.md` (if they exist) briefly for context from previous sessions
4. Check `{base}/PRD.md` briefly for Figma URLs (needed to decide whether to dispatch design-agent)
5. Write a single-sentence **problem statement** before proceeding

## Step 1: Create DEBUG.md

Create `{base}/DEBUG.md` with the following structure:

```markdown
# Debug: [Problem Statement]

## Status
- **Mode**: Debug (Auto)
- **Feature Base**: {base}
- **Iteration**: 1/3

## Problem
[Full description — expected behavior, actual behavior, reproduction steps]

## Context
- **Feature**: [name from PRD]
- **Figma URLs**: [if any, otherwise "None"]
- **Related Follow-up**: [if this relates to a follow-up task, otherwise "None"]

### Learnings from Previous Sessions
[From NOTES.md files, or "No previous learnings found."]

### Scope Boundaries
- **In Scope**: Fix the reported bug only
- **Out of Scope**: [from PRD's Out of Scope section]

## Design Specifications
[Written by design-agent if dispatched, otherwise "Not applicable"]

## Iteration History
[Updated by orchestrator after each iteration]

## Investigation & Fix Log
[Written by implementation-agent — current iteration only]

## Verification Report
[Written by verification-agent — current iteration only]
```

**IMPORTANT**: DEBUG.md is the single shared context file between you and the agents. Agents read it for problem context and write to their designated sections. Include enough context for agents to work independently.

## Sub-Agent Dispatch Strategy

Apply the following dispatch configuration:
- **Parallel agents**: None by default (agents run sequentially per iteration)
- **Sequential agents**: design-agent (optional, iteration 1 only) → implementation-agent → verification-agent

### Core Principle

You are the **orchestrator**. You MUST NOT perform the agent work yourself. Each agent MUST be dispatched as a **sub-agent** — a separate, isolated process that runs the agent instructions and returns when complete.

**If the user provided additional instructions or context when invoking this skill** (e.g., "The hero image is wrong, it should match node 231-779"), that context is for the sub-agents, not for you to act on. Your only job is to forward it. See "User Context Forwarding" below.

### Choosing Your Dispatch Method

Use the **first** approach below whose required tool is available to you. Check your available tools **by name** — do not guess or skip ahead.

Then **state which approach you selected, in one line, before you dispatch anything** — e.g. `Dispatching via Approach A (Agent).` This costs one line and it is the only thing that makes a wrong selection visible: if you silently fall back, nobody can tell the difference between "this CLI cannot dispatch" and "the check was wrong".

**Running this skill is the request to dispatch.** Some sessions carry a standing rule not to call the dispatch tool unless the user asked for it. That condition is met here: this skill only ever runs because someone invoked it — directly, or through `belmont auto` / `belmont reverify` / a loop they started — and the skill they invoked is defined as delegation rather than as doing the work yourself. The prompt in front of you *is* that request, relayed through Belmont; under `belmont auto` on Claude Code it arrives as a literal `/belmont:<skill>` slash command.

So when you choose, the question is whether a dispatch tool is **present**, not whether you are permitted to use one. Never take the inline fallback because dispatching felt unrequested.

A dispatch call that *fails* is not the same as having no tool. If one is refused by the permission system, or rejected because this CLI names its sub-agents differently from the example below, say what happened and then fall back — the fallback stays open to you. One exception: if a **user** declined the call, stop and ask. Do not perform the declined work inline instead.

#### Approach A: Parallel Sub-Agent Dispatch (preferred)

**Required tool**: `Agent` — or `Task`, which is the same tool under its older name on earlier Claude Code versions — or, on opencode, `task`, its own dispatch tool with the same call shape. **Any one alone is enough.** If more than one appears in your tool list, use `Agent`.

If you have one of them, you MUST use this approach:

1. **For agents that run in parallel**, issue all dispatch calls **in the same message** (i.e., as parallel tool calls). Every call passes:
   - `subagent_type`: **the host CLI's name for its full-access general agent — the name is per-CLI, and a wrong one hard-fails the call.** On Claude Code it is `"general-purpose"`. On opencode it is `"general"` — passing `"general-purpose"` there fails with `Unknown agent type: general-purpose is not a valid agent type`. All belmont agents need full tool access including file editing and bash, which is what these general agents carry.
   - `description`: the agent role, e.g. `"codebase-agent"` / `"verification-agent"`
   - `prompt`: the sub-agent prompt given below, verbatim
   - `model`: only for agents that have a tier in `models.yaml`, and only on Claude Code — opencode's `task` has no model parameter, so a tier cannot ride a dispatch there. See "Model Tier Overrides" below
   - Do **NOT** set `run_in_background: true` — foreground calls return their results to you directly; a background one must be polled for, and the polling is fragile and can lose contact with the sub-agent.
   - Do **NOT** pass `mode:` or `team_name:`. Both are deprecated and ignored. A sub-agent inherits the session's permission mode, which under `belmont auto` is already `bypassPermissions` — the CLI passes `--permission-mode bypassPermissions` to the tool it shells out to.
2. Because all calls are foreground, you **automatically block** until they complete and **receive their output directly** — no polling, no sleeping.
3. **For agents that run sequentially** (after the parallel ones complete), issue a single dispatch call with the same parameters.

**No teardown is required.** Sub-agents are per-call — nothing outlives the call, so there is nothing to shut down afterwards. This is about dispatch only: a skill's own cleanup step (archiving MILESTONE, deleting DEBUG.md) still runs.

#### Approach B: Sequential Inline Execution (fallback)

Reach this when **none** of the dispatch tools named above is present — several supported CLIs genuinely have no sub-agent dispatch — or when a dispatch call failed and you have said so. Never reach it because dispatching felt unrequested. Then:

1. For each agent, read its agent file (e.g. `.agents/belmont/<agent-name>.md`)
2. Execute its instructions fully within your own context
3. Complete all output before moving to the next agent
4. Do NOT blend agent work together — finish one completely before starting the next

Say plainly that you are taking this path, and why. It costs the two things dispatch exists for: every phase runs inside your own context rather than an isolated one, and the per-agent model tiers in `models.yaml` cannot be applied at all, because there is no dispatch call to carry `model:`.

### Model Tier Overrides (Claude Code only)

Belmont agent files pin no model — a dispatched sub-agent therefore **inherits the session model** by default (the same model the orchestrator is running on). Under Approach A you set the model per-dispatch via the dispatch tool's `model:` parameter, driven by `models.yaml` — this takes precedence over the inherited session model.

**When to pass `model:`**: read `.belmont/features/<slug>/models.yaml` at start-of-skill (if it exists) and translate each agent's tier into the appropriate model alias for this session:

- `low` → `haiku`
- `medium` → `sonnet`
- `high` → `opus`

Then include `model: "<alias>"` in the dispatch call for each agent whose tier appears in `models.yaml`. Agents not listed in `models.yaml` inherit the session model — do NOT pass `model:` for those.

Example (Approach A):
```
Agent(description: "implementation-agent", subagent_type: "general-purpose",
      model: "opus",  // from models.yaml: tiers.implementation = high
      prompt: "...")
```

**If `models.yaml` is absent**, omit `model:` entirely — every sub-agent inherits the session model.

**Under Approach B the tiers cannot be honoured**, since there is no dispatch call to put `model:` on. Nothing else reports that — `models.yaml` has no runtime validation — so if you fall back, say so.

**Non-Claude CLIs** (Codex, Gemini, Cursor, Copilot, Pi, opencode): Belmont does not drive a per-dispatch `model:` override on these — opencode dispatches sub-agents, but its `task` tool carries no model parameter (a sub-agent runs at its agent config's pinned model or inherits the session's), and the rest have no dispatch tool at all — so mid-session model override is not available. Use the preflight partial (`tier-preflight.md`) instead, which surfaces a warning if the session model doesn't match the tier the skill expects. Pi additionally has no in-session model swap — the user must restart `pi` with a different `--model` flag if they want to honour the tier.

### User Context Forwarding (CRITICAL)

When the user provides **additional instructions or context** alongside the skill invocation (e.g., `/belmont:verify The hero image is wrong...`), you MUST:

1. **Capture** the user's additional context verbatim
2. **Include it in every sub-agent prompt** as an "Additional Context from User" section
3. **DO NOT act on it yourself** — your job is to pass it through, not to do the work

Format for including user context in sub-agent prompts:
```
> **Additional Context from User**:
> [paste the user's additional instructions/context here verbatim]
```

Append this block to the end of each sub-agent's prompt, after the standard prompt content. If the user provided no additional context, omit this block entirely.

**Why this matters**: The orchestrator seeing actionable instructions (e.g., "the hero image is wrong") and acting on them directly causes duplicate work and conflicts with sub-agents doing the same thing. The orchestrator's role is delegation, not execution.

### Dispatch Rules (apply to ALL approaches)

1. **DO NOT** read `.agents/belmont/*-agent.md` files yourself (unless using Approach B) — the sub-agents read them
2. **DO NOT** perform the sub-agents' work yourself — sub-agents do this
3. **DO** prepare all required context before spawning any sub-agent
4. **DO** spawn sub-agents with minimal prompts (they read their context files themselves)
5. **DO** wait for sub-agents to complete before proceeding to the next step
6. **DO** handle blockers and errors reported by sub-agents
7. **DO** include the full sub-agent preamble (identity + mandatory agent file) in every sub-agent prompt
8. **DO** forward any user-provided context to every sub-agent (see "User Context Forwarding" above)

## Step 2: Run the Debug Loop

For each iteration (max 3), dispatch agents sequentially. Each agent reads `{base}/DEBUG.md` and writes to its designated section.

Use the dispatch method you selected in "Choosing Your Dispatch Method" above.

---

### Phase 1: Design Analysis (optional — iteration 1 only, if Figma URLs present)

**Skip this phase** if there are no Figma URLs in the PRD or if this is iteration 2+.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont design analysis agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/design-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> **DEBUG MODE OVERRIDE**: You are operating in debug mode, not milestone mode.
>
> Read `{base}/DEBUG.md` for the problem description and context. There is no MILESTONE file — use DEBUG.md instead.
>
> Your goal: analyze the Figma designs relevant to the reported bug. Focus ONLY on the design specifications that help diagnose or fix the reported issue — do not do a full design analysis.
>
> Write your findings to the `## Design Specifications` section of `{base}/DEBUG.md`.

**Wait for**: Sub-agent to complete. Verify that `## Design Specifications` in DEBUG.md has been populated.

---

### Phase 2: Investigation & Fix (every iteration)

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont implementation agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/implementation-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> **DEBUG MODE OVERRIDE**: You are operating in debug mode, not milestone mode.
>
> Read `{base}/DEBUG.md` instead of a MILESTONE file. It contains the problem description, context, design specifications (if applicable), and iteration history from previous attempts.
>
> Your goal: investigate the bug described in the `## Problem` section and implement a **minimal fix**. You are NOT implementing milestone tasks — you are fixing a specific bug.
>
> **Debug-specific rules**:
> - Do NOT commit — the orchestrator handles commits after verification
> - Do NOT update PRD.md or PROGRESS.md — the orchestrator handles tracking
> - Do NOT create follow-up tasks — just fix the bug
> - Keep changes minimal — touch the fewest files possible
> - Check the `## Iteration History` section for what was already tried (avoid repeating failed approaches)
>
> Write your investigation findings and changes to the `## Investigation & Fix Log` section of `{base}/DEBUG.md`. Include:
> - What you investigated
> - Your hypothesis
> - What files you changed and why
> - Any concerns about regressions

**Wait for**: Sub-agent to complete. Verify that `## Investigation & Fix Log` in DEBUG.md has been populated.

---

### Phase 3: Verification (every iteration)

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont verification agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/verification-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> **DEBUG MODE OVERRIDE**: You are operating in debug mode, not standard verification mode.
>
> Read `{base}/DEBUG.md` for the problem description and what was changed. There is no MILESTONE file — use DEBUG.md instead.
>
> Your goal: verify whether the specific bug described in `## Problem` has been fixed, and check for regressions.
>
> **Debug-specific rules**:
> - Primary check: does the specific bug still reproduce?
> - Secondary check: regressions (test suite, build, basic functionality)
> - Do NOT create follow-up tasks — just report your findings
> - Do NOT update PRD.md or PROGRESS.md
> - Clean up any temporary artifacts (screenshots, test files, etc.)
>
> Write your findings to the `## Verification Report` section of `{base}/DEBUG.md`. You MUST include a classification line:
> ```
> **Outcome**: [FIXED | PARTIAL | NO_CHANGE | REGRESSION]
> ```
>
> - **FIXED**: Bug is resolved, no regressions detected
> - **PARTIAL**: Bug is partially fixed or a related issue remains
> - **NO_CHANGE**: Fix didn't help, bug still reproduces
> - **REGRESSION**: Fix made things worse or broke something else

**Wait for**: Sub-agent to complete. Verify that `## Verification Report` in DEBUG.md has been populated with an outcome classification.

---

## Step 3: Assess Outcome

Read the `## Verification Report` section from `{base}/DEBUG.md`. Extract the **Outcome** classification.

### On FIXED

1. Proceed to Step 4 (Commit and Report)

### On REGRESSION

1. **Revert immediately**: `git checkout -- [changed files]` (read the Investigation & Fix Log for the list of changed files)
2. Update `## Iteration History` in DEBUG.md with what was tried and that it caused a regression
3. Clear the `## Investigation & Fix Log` and `## Verification Report` sections
4. If iteration < 3, loop back to Step 2 (Phase 2 + Phase 3 only)
5. If iteration = 3, proceed to Step 5 (Escalate)

### On PARTIAL or NO_CHANGE

1. Update `## Iteration History` in DEBUG.md with what was tried and the outcome
2. Clear the `## Investigation & Fix Log` and `## Verification Report` sections
3. Increment the iteration counter in `## Status`
4. If iteration = 2, proceed to **User Checkpoint** below
5. If iteration < 2, loop back to Step 2 (Phase 2 + Phase 3 only)

### User Checkpoint (after iteration 2)

Present a summary to the user:

```
Debug Summary (2 iterations)
============================
Problem: [original problem]

Attempt 1: [what was tried, result]
Attempt 2: [what was tried, result]

Current state: [what's different now]
Next hypothesis: [what to try next]
```

Ask the user: **continue with iteration 3, stop here, or redirect?**
- If continue → loop back to Step 2 for iteration 3
- If stop → proceed to Step 6 (Cleanup)
- If redirect → proceed to Step 6 (Cleanup), then suggest `/belmont:implement`

### After iteration 3 (still not fixed)

Proceed to Step 5 (Escalate).

## Step 4: Commit and Report

Only reach this step when the fix is confirmed FIXED.

1. **Ask the user to confirm** the fix looks correct before committing
2. **Commit with debug prefix**:
   ```bash
   git add [specific changed files]
   git commit -m "debug: [brief description of fix]"
   ```
3. **Report summary**:

```
Debug Fix Complete
==================
Problem:  [original problem statement]
Fix:      [what was changed]
Files:    [list of changed files]
Commit:   [short hash] — debug: [message]

Iterations: [N]
```

### Optional: Update Planning Files

If this fix relates to a follow-up task in PROGRESS.md:
- Ask the user if they want to mark it complete
- If yes, mark the task as `[x]` in `{base}/PROGRESS.md`

Proceed to Step 6 (Cleanup).

## Step 5: Escalate

If 3 iterations were exhausted without a fix:

```
Debug limit reached (3 iterations). This issue may need the full pipeline.
Recommendation: /belmont:implement or /belmont:next with a follow-up task.

Summary of attempts:
- Iteration 1: [what was tried, result]
- Iteration 2: [what was tried, result]
- Iteration 3: [what was tried, result]
```

Proceed to Step 6 (Cleanup).

## Step 6: Cleanup

**DEBUG.md is ephemeral** — delete it regardless of outcome.

1. **Delete DEBUG.md**: `rm {base}/DEBUG.md`
   - On FIXED: delete after commit is confirmed
   - On escalation: delete after reporting
   - On user stop: delete after reporting
   - On unrecoverable REGRESSION: delete after revert

### Commit Planning File Changes

After completing all updates to `.belmont/` planning files, commit them:

1. **Check if `.belmont/` is git-ignored** — run:
   ```bash
   git check-ignore -q .belmont/ 2>/dev/null
   ```
   If exit code is 0, `.belmont/` is ignored — skip this section entirely.

2. **Check for changes** — run:
   ```bash
   git status --porcelain .belmont/
   ```
   If there is no output, nothing to commit — skip the rest.

3. **Stage and commit** — stage only `.belmont/` files and commit:
   ```bash
   git add .belmont/ && git commit -m "belmont: update planning files after debug fix"
   ```

## Step 7: Final Actions

Once done, prompt the user to "/clear" and then "/belmont:status", "/belmont:verify", or "/belmont:next".
   - If you are Codex, instead prompt: "/new" and then "belmont:status", "belmont:verify", or "belmont:next"
   - If you are opencode, instead prompt: "/new" and then "/belmont/status", "/belmont/verify", or "/belmont/next"

## Scope Guardrails

These are hard rules. Do not break them:

1. **Fix only the reported issue** — no refactoring, no feature additions, no "improvements"
2. **DEBUG.md is the shared context file** — agents read from and write to it
3. **Dispatch to agents** — do NOT investigate, fix, or verify yourself (unless the Sequential Inline fallback, Approach B, is in effect)
4. **No PRD task creation** — if you discover new issues, mention them in the report but don't create tasks
5. **Max 3 iterations** — if you can't fix it in 3 tries, escalate
6. **Revert on regression** — if a fix makes things worse, undo it immediately
7. **Single commit** — one atomic commit for the fix, only after user confirms
8. **Minimal changes** — touch the fewest files possible to fix the issue
9. **Cleanup always** — delete DEBUG.md when the session ends, regardless of outcome
