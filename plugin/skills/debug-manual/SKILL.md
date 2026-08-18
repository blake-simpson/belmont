---
name: debug-manual
description: Manual debug loop with deep Belmont context and in-place spec reconciliation — user-verified fix + correct the specs that let the bug exist
alwaysApply: false
---

# Belmont: Debug (Manual)

You are the debug orchestrator running in **manual mode**. Your job is to:

1. Load the full Belmont spec context for the bug being investigated (master + per-feature, multi-feature capable).
2. Drive a tight investigate-fix loop where **the user verifies** each fix attempt.
3. After the fix is confirmed, **reconcile the specs in place** to match what the fix taught you about reality.
4. Commit code + spec edits atomically so Belmont's memory stays accurate.

**You do NOT**: read source code, trace bugs, run tests, analyze designs, or implement fixes yourself. You manage DEBUG.md, dispatch the implementation agent, present diffs and findings to the user, and gate every spec edit on explicit approval.

**When to use this**: any bug found in shipped Belmont features — especially when you suspect the bug exists because the spec was wrong or stale. Equally suited to "quick UI fix" workflows and "deep spec-drift" workflows; the spec-reconciliation step is no-op when there's no drift to fix.

**When NOT to use this**: new features, large multi-file changes, or work that should be tracked as new PRD tasks. Use `/belmont:implement` or `/belmont:next`. For agent-verified debugging (no user-in-the-loop, no spec reconciliation), use `/belmont:debug-auto`.

## Interactive-only

This skill is for interactive REPL sessions in Claude Code, Codex, Cursor, Windsurf, Gemini, Copilot, or Pi. `belmont auto` never invokes this skill — `actionDebug` routes to `/belmont:debug-auto`. As a defensive guard: **if your invocation prompt is bare programmatic syntax (e.g. just `--feature <slug>` with no human prose), treat it as a non-interactive call, do NOT enter Spec Reconciliation, and recommend the user invoke `/belmont:debug-manual` interactively.**

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

## Feature Selection (multi-feature capable)

Belmont organizes work into **features** — each feature gets its own directory under `.belmont/features/<slug>/` with its own PRD, PROGRESS, TECH_PLAN, and MILESTONE files. This skill supports debugging across one OR multiple features in the same session.

### Select the Active Feature(s)

1. List all feature directories under `.belmont/features/`.
2. If no features exist: tell the user to run `/belmont:product-plan` to create their first feature, then stop.
3. If the user's invocation prose names specific features by slug or by recognisable name, pre-select those features and confirm with the user (`Use features X and Y? [y / change selection]`).
4. Otherwise, read each feature's `PRD.md` for its name and status, then ask the user which feature(s) the bug touches.
5. Present a numbered list and ask the user to multi-select:

   ```
   Which feature(s) is this bug related to?

     1. auth-session-fix  — Persistent session refresh logic
     2. dashboard-charts  — Revenue trend visualisations
     3. settings-profile  — User profile edit page

   Reply with:
     - A single number (e.g. "2") for one feature
     - Comma-separated numbers (e.g. "1,3") for cross-feature debugging
     - "all" to include every feature
   ```

6. Validate the response. Reject invalid selections and re-prompt rather than guessing.
7. Resolve each selected feature to its base path: `.belmont/features/<selected-slug>/`.

### Base Path Convention

This skill works with a **list of base paths** `{bases[]}` rather than a single `{base}`. When iterating over loaded context, spec reconciliation, or per-feature reporting, walk the list and operate on each base path independently:

- `{base}/PRD.md` — that feature's PRD
- `{base}/PROGRESS.md` — that feature's progress tracker
- `{base}/TECH_PLAN.md` — that feature's tech plan (optional)
- `{base}/NOTES.md` — that feature's learnings (optional)
- `{base}/MILESTONE-*.done.md` — that feature's archived milestones

When a step only makes sense for a single feature (e.g. creating the shared DEBUG.md), nominate the **primary feature** — the one the user-described symptom most clearly belongs to, or the first selection if it's a tie. Put DEBUG.md under the primary feature's base path; reference cross-feature context inside it explicitly.

**Master files** (always at `.belmont/` root, shared across features):
- `.belmont/PR_FAQ.md` — strategic PR/FAQ document
- `.belmont/PRD.md` — master PRD (feature catalog)
- `.belmont/PROGRESS.md` — master progress tracking (feature summary table)
- `.belmont/TECH_PLAN.md` — master tech plan (cross-cutting architecture)
- `.belmont/NOTES.md` — global learnings

### Degenerate cases

- **Single feature selected**: behave exactly like the single-feature `feature-detection.md` partial — `{bases[]}` has one entry; iteration steps still work; UX-wise, drop the "per-feature" framing in user-facing messages.
- **All features selected** in a project with many features: warn the user that context will be heavy ("you've selected N features — loaded context may exceed local-model limits") and offer to narrow before proceeding.
- **No features available**: route to `/belmont:product-plan`, same as the single-feature partial.

<!-- Debug-manual scope rules. Replaces the milestone-immutability @include for interactive debug-manual ONLY. Every other skill that touches PROGRESS.md keeps milestone-immutability.md unchanged. -->

## Spec-edit scope (interactive debug-manual)

Interactive `/belmont:debug-manual` is the **only** Belmont skill that may edit spec prose in place. The relaxation is deliberate and bounded:

- This skill never runs from `belmont auto` (only `/belmont:debug-auto` does — see the `actionDebug` wiring in the Belmont CLI source (`grep -rn actionDebug cmd/belmont/`)). The auto-mode `runScopeGuard` cannot fire against debug-manual edits.
- A human is in the loop for every edit. Each spec change is presented as a unified diff and gated on explicit `y / N / edit / skip` approval before any write.
- Edits are atomic with the code fix they correspond to — same commit, so the spec-change rationale lives in `git log` alongside the code change that motivated it.

### What you MAY edit

| File | What you may change |
|---|---|
| `{base}/PRD.md` | Acceptance criteria text, `**Solution**:` / `**Verification**:` field text, task descriptions, Overview / Problem Statement prose, Success Criteria, Out of Scope |
| `{base}/TECH_PLAN.md` | Decision narrative, library choices, file-path references, API shapes — anything where reality has moved past the written record |
| `.belmont/TECH_PLAN.md` | Cross-cutting decisions that the fix proved wrong or incomplete |
| `.belmont/PR_FAQ.md` | Only with per-edit explicit approval. PR_FAQ is strategic — flag it for the user before proposing diffs |
| `.belmont/PRD.md` | Master feature-catalog entries (status text, dependency notes) |
| `{base}/NOTES.md` | Append a `## Root Cause Patterns` entry (Five-Whys-style, mirroring `references/verify-five-whys.md`'s template) |
| `{base}/PROGRESS.md` | Flip `[ ]` → `[x]` on follow-up tasks that this fix completed, **scoped to the current or last-shipped milestone of the feature being debugged**. Never `[v]` (that's `/belmont:verify`'s job). Never touch sibling-milestone tasks. |

### What you MUST NOT do

- **No new milestones using polish/follow-up/cleanup/FWLUP/"deviations from"/"verification fixes" naming patterns.** `belmont validate` will reject these on the next auto run and block startup. This anti-pattern stays banned (see `knowledge/cross-cutting/milestone-immutability.md` for the cascade it caused).
- **No new `[ ]` follow-up tasks for unfixed drift.** If drift is real, fix it in place this session. If it's out of scope, log it in DEBUG.md's `## Spec Reconciliation Log` and surface in the final report — don't park it for `/belmont:implement` to find later.
- **No silent edits to other features' specs.** In multi-feature mode you got explicit approval to load multiple features; reconciliation still happens per-feature with separate approval gates.
- **No restructuring**: no renaming milestone headings, no adding milestone headings of any kind, no removing milestones, no reordering tasks across milestones. Structural changes route through `/belmont:tech-plan`.
- **No flipping a task to `[v]`.** Only `/belmont:verify` may mark verified. If the fix completed a follow-up, `[x]` is correct; verify will promote it later.

### Commit attribution rule

When you flip a task `[ ]` → `[x]` in PROGRESS.md, the commit message body MUST mention the task ID (e.g. `P1-M3-2`). The auto-loop's `runEvidenceCheck` walks branch commits looking for task-ID attribution before allowing a later `[v]` flip; missing IDs cause silent reverts on the next verify pass.

### If you find a pre-existing bad milestone

If PROGRESS.md already contains a milestone whose name matches the forbidden patterns above (e.g. a legacy "M5: Polish" from a pre-rule run):

- Do NOT add tasks to it.
- Do NOT depend on it from any edit you make.
- Surface the issue in your end-of-session report and suggest `belmont validate` + `/belmont:tech-plan` to restructure.

This matches the behaviour of every other skill — debug-manual's edit relaxation does not extend to legitimising bad milestone structures left behind by prior runs.

## Step 0: Load Belmont Context

Before asking the user a single follow-up question, load the spec context. Read these files in order, treating every read as optional — skip silently if the file is absent and record `skipped: not present` in the context-load summary.

**Master files** (always at `.belmont/`):

1. `.belmont/PR_FAQ.md` — strategic vision. If file > 500 lines, ask the user `PR_FAQ.md is <N> lines — load anyway? [y/N]`. Default no on large files.
2. `.belmont/PRD.md` — master feature catalog.
3. `.belmont/TECH_PLAN.md` — master cross-cutting architecture.
4. `.belmont/NOTES.md` — global learnings from prior sessions.

**Per-feature files** — for EACH base in `{bases[]}`:

5. `{base}/PRD.md`
6. `{base}/TECH_PLAN.md`
7. `{base}/PROGRESS.md`
8. `{base}/NOTES.md`
9. Latest `{base}/MILESTONE-M*.done.md` — numeric-sorted by milestone ID, take the highest (most recently shipped). Skip if > 500 lines; tell the user and offer to load if they want it.

After all reads, emit a single **Context-load summary** block:

```
Context loaded
  Master:
    .belmont/PR_FAQ.md      <N lines>   | skipped: not present
    .belmont/PRD.md         <N lines>
    .belmont/TECH_PLAN.md   <N lines>
    .belmont/NOTES.md       <N lines>   | skipped: not present
  Features:
    <slug-1>:
      PRD.md, TECH_PLAN.md, PROGRESS.md, NOTES.md, MILESTONE-M<X>.done.md
    <slug-2>: ...
  Total: <N> files, ~<KB> KB
```

**Graceful degradation for local LLMs**: if the total loaded context exceeds ~50 KB and the session is running on Pi or another local-LLM CLI, surface a warning and ask the user to narrow to a single feature before proceeding:

```
⚠ Loaded context is ~<KB> KB. Local LLMs may truncate or degrade on this size.
Recommended: re-run this skill and select a single feature. Continue anyway? [y/N]
```

## Step 1: Understand the Problem

1. If the user provided a description with the skill invocation, use it as the problem statement.
2. If the description is vague or missing, ask **one** focused clarifying question:
   - What's the expected behaviour?
   - What's the actual behaviour?
   - How do you reproduce it?
3. Reference the context you loaded — does the bug map cleanly to a task in any loaded PRD? Note the task ID(s) for later.
4. Write a single-sentence **problem statement** before proceeding.

## Step 2: Create DEBUG.md

Create `{primary_base}/DEBUG.md` (the primary feature is the first slug in `{bases[]}` — see `feature-detection-multi.md`):

```markdown
# Debug: [Problem Statement]

## Status
- **Mode**: Debug (Manual)
- **Primary feature**: <slug>
- **Additional features**: <slug, slug> | None
- **Iteration**: 1/3

## Problem
[Full description — expected behaviour, actual behaviour, reproduction steps]

## Context
- **Feature(s)**: <names from PRDs>
- **Figma URLs**: [if any, otherwise "None"]
- **Related task IDs**: [from Step 1 reference, otherwise "None"]

## Context Loaded
[Paste the Step 0 context-load summary block here verbatim]

### Learnings from Previous Sessions
[From master NOTES.md + per-feature NOTES.md, or "No previous learnings found."]

### Scope Boundaries
- **In Scope**: Fix the reported bug only
- **Out of Scope**: [from PRD's Out of Scope section(s)]

## Design Specifications
[Written by design-agent if dispatched, otherwise "Not applicable"]

## Iteration History
[Updated by orchestrator after each iteration]

## Investigation & Fix Log
[Written by implementation-agent — current iteration only]

## User Feedback
[Collected by orchestrator from user after each iteration]

## Spec Reconciliation Log
[Written by orchestrator during the Spec Reconciliation phase]
```

**IMPORTANT**: DEBUG.md is the single shared context file between you and the agents. Agents read it for problem context and write to their designated sections. Include enough context for agents to work independently.

## Sub-Agent Dispatch Strategy

Apply the following dispatch configuration:
- **Parallel agents**: None by default (agents run sequentially per iteration)
- **Sequential agents**: design-agent (optional, iteration 1 only) → implementation-agent

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

## Step 3: Run the Debug Loop

For each iteration (max 3), dispatch the implementation agent, then ask the user to verify. Each agent reads `{primary_base}/DEBUG.md` and writes to its designated section.

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
> Read `{primary_base}/DEBUG.md` instead of a MILESTONE file. It contains the problem description, context, design specifications (if applicable), and iteration history from previous attempts.
>
> Your goal: investigate the bug described in the `## Problem` section and implement a **minimal fix**. You are NOT implementing milestone tasks — you are fixing a specific bug.
>
> **Debug-specific rules**:
> - Do NOT commit — the orchestrator handles commits after verification
> - Focus your fix on code; the orchestrator will reconcile specs (PRD, TECH_PLAN, NOTES, PROGRESS) in the Spec Reconciliation phase after the user confirms the fix. Do NOT touch spec files yourself.
> - Do NOT create follow-up tasks — just fix the bug; the orchestrator handles tracking
> - Keep changes minimal — touch the fewest files possible
> - Check the `## Iteration History` section for what was already tried (avoid repeating failed approaches)
>
> **Debug logging** (manual mode):
> - Proactively add strategic debug/logging statements (`console.log`, `print`, `fmt.Println`, `logger.debug`, etc. — match the project's language)
> - ALL debug logs MUST be prefixed with `[BELMONT-DEBUG]` for easy identification and cleanup
> - Target 5-15 strategic log points per iteration: function entry/exit, decision points, state changes, variable values at key moments
> - Place logs to help the user trace the bug: before/after the suspected problem area, at data flow boundaries, and around conditional branches
> - Do NOT add logs that would produce excessive output (e.g., inside tight loops with thousands of iterations)
>
> Write your investigation findings and changes to the `## Investigation & Fix Log` section of `{primary_base}/DEBUG.md`. Include:
> - What you investigated
> - Your hypothesis
> - What files you changed and why
> - Any concerns about regressions
>
> Also include a `### Debug Logs Added` subsection listing every debug log you added:
> ```
> ### Debug Logs Added
> - `src/foo.ts:42` — logs entry to handleClick with event details
> - `src/bar.ts:78` — logs state before/after transformation
> - `src/baz.ts:15` — logs API response payload
> ```

**Wait for**: Sub-agent to complete. Verify that `## Investigation & Fix Log` in DEBUG.md has been populated.

---

### Phase 3: User Verification (every iteration)

**Do NOT dispatch a verification agent.** Instead, you verify with the user directly.

1. **Read** the `## Investigation & Fix Log` from `{primary_base}/DEBUG.md`
2. **Present a summary** to the user:

```
Fix Attempt [N]
================
Hypothesis: [what the agent thinks caused the bug]
Changes:    [brief list of files/changes]
Debug logs: [N] log points added (prefixed with [BELMONT-DEBUG])

Please test the fix. If debug logs are relevant, check your console/output for lines starting with [BELMONT-DEBUG].
```

3. **Ask the user**: "Is the bug fixed? If not, what are you seeing? (paste any relevant `[BELMONT-DEBUG]` log output)"

4. **Map the user's response** to an outcome:
   - User confirms fixed → **FIXED**
   - User says partially fixed or improved → **PARTIAL**
   - User says no change → **NO_CHANGE**
   - User says it got worse or something else broke → **REGRESSION**

5. **Write** the user's feedback and the mapped outcome to the `## User Feedback` section of `{primary_base}/DEBUG.md`:
   ```
   ### Iteration [N]
   **Outcome**: [FIXED | PARTIAL | NO_CHANGE | REGRESSION]
   **User said**: [summary of user's response]
   **Debug log output**: [any log output the user shared, or "None provided"]
   ```

---

## Step 4: Assess Outcome

Use the outcome determined in Phase 3 above.

### On FIXED

1. Proceed to **Spec Reconciliation** (below) — do NOT commit yet.

### On REGRESSION

1. **Revert immediately**: `git checkout -- [changed files]` (read the Investigation & Fix Log for the list of changed files)
2. Update `## Iteration History` in DEBUG.md with what was tried and that it caused a regression
3. Clear the `## Investigation & Fix Log` section
4. If iteration < 3, loop back to Step 3 (Phase 2 + Phase 3 only)
5. If iteration = 3, proceed to **Escalate** (Step 5 from the included partial below)

### On PARTIAL or NO_CHANGE

1. Update `## Iteration History` in DEBUG.md with what was tried, the outcome, and any debug log output the user shared
2. Clear the `## Investigation & Fix Log` section
3. Increment the iteration counter in `## Status`
4. If iteration = 2, proceed to **User Checkpoint** below
5. If iteration < 2, loop back to Step 3 (Phase 2 + Phase 3 only)

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
- If continue → loop back to Step 3 for iteration 3
- If stop → proceed to **Cleanup** (Step 6 from the included partial below)
- If redirect → proceed to **Cleanup**, then suggest `/belmont:implement`

### After iteration 3 (still not fixed)

Proceed to **Escalate** (Step 5 from the included partial below).

## Spec Reconciliation

**Only reach this step when the fix is confirmed FIXED.** Do not commit yet — code + spec edits commit atomically in the Commit and Report step below.

Read `references/debug-manual-spec-reconcile.md` and follow it end-to-end. In summary:

1. Walk the drift catalogue across every loaded spec file (master + per-feature).
2. For each candidate edit, present a unified diff and a `y / N / edit / skip` prompt.
3. Apply approved edits in place. Stage them for the upcoming commit (do NOT commit individually).
4. Append a Five-Whys-style `## Root Cause Patterns` entry to `{base}/NOTES.md` for the feature whose bug this was.
5. Log every candidate (applied, rejected, skipped) to DEBUG.md's `## Spec Reconciliation Log` section.
6. If no drift was found, log `No drift detected — code-only fix.` and continue.

In multi-feature mode, iterate per feature — get per-feature confirmation before walking that feature's drift.

### Hard limits during reconciliation

Restated from `debug-scope-rules.md`:

- No new milestone headings. No renames. No removals. Use polish/follow-up/cleanup naming and `belmont validate` will reject on next auto run.
- No new `[ ]` follow-up tasks for unfixed drift — fix it or skip it; never park work for `/belmont:implement` to find later.
- No `[v]` flips. Use `[x]` only, scoped to the current or last-shipped milestone.
- No edits to features not in `{bases[]}`.

## Commit and Report

Reach this step after Spec Reconciliation finishes (with zero or more spec edits applied).

1. **Clean up debug logs** before committing:
   - Search the entire codebase for `[BELMONT-DEBUG]`: `grep -rn "BELMONT-DEBUG" .`
   - Remove ALL lines containing `[BELMONT-DEBUG]` debug logs
   - Cross-reference with the `### Debug Logs Added` entries in DEBUG.md to ensure none are missed
   - Run the search again to verify zero results: `grep -rn "BELMONT-DEBUG" .`
   - If any remain, remove them and re-verify

2. **Ask the user to confirm** the fix (with debug logs removed) looks correct before committing.

3. **Single atomic commit** — stage code AND spec edits together:
   ```bash
   git add <code files> <spec files>
   git commit -m "$(cat <<'EOF'
   debug: <one-line fix description>[ + spec sync]

   Iterations: <N>
   Code files: <list>
   Spec files: <list>
   Task IDs flipped to [x]: <list, or "none">
   Drift categories addressed: <list, or "none">
   EOF
   )"
   ```
   - Subject ends with ` + spec sync` ONLY if Step 5 applied at least one spec edit.
   - Multi-line body MUST include any task ID flipped `[x]` (so `runEvidenceCheck` finds attribution on a future verify pass).
   - Use the user's preferred commit-message style if they set one in CLAUDE.md (no co-author lines unless explicitly asked).

4. **Report summary**:

```
Debug Fix Complete
==================
Problem:       [original problem statement]
Fix:           [what was changed]
Code files:    [list]
Spec edits:    [N applied, N rejected, N skipped]
Spec files:    [list, or "none"]
Commit:        [short hash] — debug: [message]

Iterations:    [N]
Debug logs:    cleaned up ([N] log points removed)
```

### Optional: relay drift findings to the user

If you skipped any drift candidates during Spec Reconciliation, list them in the report so the user knows what's still open. Do NOT create follow-up tasks for them — the user explicitly opted into a "fix it now or skip it" model.

Proceed to **Cleanup** (Step 6 from the included partial below).

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
