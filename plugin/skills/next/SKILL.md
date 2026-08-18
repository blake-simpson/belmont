---
name: next
description: Implement just the next single pending task using the implementation agent
alwaysApply: false
---

# Belmont: Next

You are a lightweight implementation orchestrator. Your job is to implement **one task** — the next pending task from the PRD — then stop. Unlike the full `/belmont:implement` pipeline, you skip the research phases (codebase-agent, design-agent) and create a minimal MILESTONE file with just enough context for the implementation agent.

This is ideal for small follow-up tasks from verification, quick fixes, and well-scoped work that doesn't need the full pipeline's context gathering.

## Feature Selection

Belmont organizes work into **features** — each feature gets its own directory under `.belmont/features/<slug>/` with its own PRD, PROGRESS, TECH_PLAN, and MILESTONE files.

### Select the Active Feature

1. List all feature directories under `.belmont/features/`
2. If features exist: read each feature's `PRD.md` for its name and status, then Ask which feature to implement the next task for, or auto-select the one with pending tasks
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

### Model Tier Registry

Belmont uses three user-facing tiers — `low`, `medium`, `high` — which map to concrete model identifiers per AI CLI. When you need to pass a model override explicitly (see `dispatch-strategy.md` Model Tier Overrides or `tier-preflight.md`), translate via this table.

| Tier   | Claude  | Codex          | Gemini                | Cursor             | Copilot              | Pi                   | opencode                     |
|--------|---------|----------------|-----------------------|--------------------|----------------------|----------------------|------------------------------|
| low    | haiku   | gpt-5.4-mini   | gemini-2.5-flash-lite | sonnet-4           | haiku-4.5            | user-configured¹     | anthropic/claude-haiku-4-5²  |
| medium | sonnet  | gpt-5.4        | gemini-2.5-flash      | sonnet-4-thinking  | claude-sonnet-4.5    | user-configured¹     | anthropic/claude-sonnet-4-6² |
| high   | opus    | gpt-5.5        | gemini-2.5-pro        | gpt-5              | gpt-5.4              | user-configured¹     | anthropic/claude-opus-4-8²   |

¹ Pi runs against user-provided local (or remote) models whose IDs Belmont cannot know in advance. The user maps tiers → providers + models in `~/.belmont/local-llms.json` (or per-project `.belmont/local-llms.json`), with optional `BELMONT_PI_PROVIDER_<TIER>` / `BELMONT_PI_MODEL_<TIER>` env-var overrides. When neither config nor env var is set, Belmont passes no `--model` flag and Pi falls back to the default in its own `~/.pi/agent/models.json`. See `docs/supported-tools.md` and `docs/local-llms.example.json`.

² opencode model IDs are `provider/model` tokens; the defaults assume the Anthropic provider. Users on another provider (opencode zen, OpenAI, local models, …) override per tier via `opencode.tiers.<tier>` in `~/.belmont/local-llms.json` / `.belmont/local-llms.json`, or `BELMONT_OPENCODE_MODEL_<TIER>` / `BELMONT_OPENCODE_MODEL` env vars. Codex users can similarly override `codex.tiers.<tier>.model`, `codex.tiers.<tier>.reasoning_effort`, optional `codex.tiers.<tier>.service_tier`, or the corresponding `BELMONT_CODEX_*` env vars. See `docs/supported-tools.md` and `docs/local-llms.example.json`.

The canonical source for the closed-model tiers (Claude / Codex / Gemini / Cursor / Copilot / opencode) is the `modelTiers` map in the Belmont CLI source (`grep -rn "modelTiers" cmd/belmont/`). If this table drifts from the Go registry, the Go registry wins — file an issue and update this partial. `scripts/generate-skills.sh --check` is the place to add a drift guard.

### Model Tier Preflight (non-Claude CLIs)

Non-Claude CLIs (Codex, Gemini, Cursor, Copilot, Pi, opencode) run the skill at whichever model the session was started with — none of them exposes a per-dispatch model override. (opencode can dispatch sub-agents, but its `task` tool carries no model parameter; the rest run everything in one top-level session.) Before doing any heavy work, compare the **required tier** for the current skill to the **session's current model** and surface a warning if they diverge. Do NOT block execution; let the user decide.

**Workflow at start-of-skill (non-Claude only)**:

1. **Read** `.belmont/features/<slug>/models.yaml`. If absent, skip this preflight (defaults apply).
2. **Determine the required tier for this skill**:
   - `implement` → `tiers.implementation`
   - `next` → `tiers.implementation` (the single-task shortcut dispatches the same implementation agent)
   - `verify` → `tiers.verification`
   - `code-review` (if applicable) → `tiers.code-review`
   - `debug-manual` → `tiers.implementation` (the fix itself dispatches the implementation agent; spec reconciliation runs in the orchestrator session at the same model on non-Claude CLIs)
   - others → skip preflight unless the skill specifies its own tier.
3. **Map the required tier to a model ID for the current CLI** using `tier-registry.md`. Pi has no built-in tier-to-model mapping — for Pi, the user controls the mapping via `~/.belmont/local-llms.json`. If that file is absent, skip the preflight (Pi will use whatever model `~/.pi/agent/models.json` defaults to).
4. **Compare to the session's current model**:
   - Codex: run `/model` or check session settings.
   - Gemini: check `/model`.
   - Cursor: check `/model`.
   - Copilot: check `/model`.
   - Pi: Pi has no in-session model swap. Check the model the session was started with (visible in Pi's TUI footer, or the `--model` flag the user passed when launching `pi`).
   - opencode: check the model shown in the TUI status area, or run `/models` to see the current selection.
5. **If they diverge**, print this warning block before doing any further work:

   ```
   ⚠ Model tier mismatch
   models.yaml says this phase should run at <tier> (<expected-model-id>).
   Your session is currently on <current-model-id>.
   To honor the tier, restart with: <cli> --model <expected-model-id>
   Continuing with the current model. Re-dispatching sub-agents with a
   different model is not supported on this CLI.
   ```

   For Pi the restart command takes the form `pi --provider <provider> --model <expected-model-id>`, where `<provider>` matches an entry in the user's `~/.pi/agent/models.json`. For opencode the expected model ID is a `provider/model` token (e.g. `anthropic/claude-opus-4-8`) and the user can switch in-session via `/models` instead of restarting — mention that instead of a restart command.

6. **Proceed with the skill**. The warning is informational; it never blocks execution.

**Why this is acceptable graceful degradation**: the user chose this CLI knowing it doesn't support per-agent dispatch. The warning gives them a one-command fix if they want tier adherence; otherwise the work proceeds at the session's model. Only Claude Code supports true per-agent overrides — see `dispatch-strategy.md` Model Tier Overrides for that path.

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

## Step 3: Dispatch to Implementation Agent

Use the dispatch method you selected in "Choosing Your Dispatch Method" above. Under **Approach A**, issue a single dispatch call — with `model:` per the Model Tiers section when `models.yaml` names an implementation tier. Under the **Sequential Inline** fallback (Approach B), execute the implementation agent's instructions inline, and say so.

**The sub-agent prompt**:

> **IDENTITY**: You are the belmont implementation agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/implementation-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
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
   git add .belmont/ && git commit -m "belmont: update planning files after task completion"
   ```

**Note**: PROGRESS.md is the single source of truth for task state. PRD.md is a pure spec document with no status markers — do not add emoji or state indicators to PRD task headers.

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
