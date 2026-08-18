---
name: implement
description: Implement the next pending milestone from the PRD using the agent pipeline
alwaysApply: false
---

# Belmont: Implement

You are the implementation orchestrator. Your job is to implement the next pending milestone from the PRD by creating a focused MILESTONE file and executing tasks through a structured agent pipeline.

## Feature Selection

Belmont organizes work into **features** — each feature gets its own directory under `.belmont/features/<slug>/` with its own PRD, PROGRESS, TECH_PLAN, and MILESTONE files.

### Select the Active Feature

1. List all feature directories under `.belmont/features/`
2. If features exist: read each feature's `PRD.md` for its name and status, then Ask which feature to implement, or auto-select the one with pending tasks
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

## Worktree Environment

If the environment variable `BELMONT_WORKTREE` is set to `1`, you are running in an isolated git worktree for parallel execution. Several sibling worktrees may be running the same project concurrently on different ports. Ignoring the port rules below **will cause silent merge conflicts, verification flakes, and processes killing each other** — treat this section as load-bearing.

### Port variables set for you

Belmont populates these before your process starts. Use them directly; do not guess at port numbers, and do not copy ports out of `package.json` or config files.

| Variable | Purpose |
|---|---|
| `BELMONT_PORT` | Unique primary port for this worktree. Use for the project's dev server. |
| `PORT` | Mirror of `BELMONT_PORT`. Most bundlers (Next.js, many Node servers) honor this. |
| `BELMONT_BASE_URL` | `http://localhost:$BELMONT_PORT`. Use anywhere a URL is expected. |
| `PLAYWRIGHT_BASE_URL` | Overrides `use.baseURL` / `webServer.url` in `playwright.config.*` at runtime. Playwright reads this automatically. |
| `CYPRESS_baseUrl` | Overrides `baseUrl` in `cypress.config.*` at runtime. Cypress reads this automatically. |
| `VITE_PORT` | Mirror of `BELMONT_PORT` for Vite-based projects. |
| `BELMONT_WORKTREE` | Set to `1`. Presence signals that worktree rules apply. |

### Port decision tree

**Question 1 — is this the project's primary dev server?**

Yes: invoke the bundler CLI directly with the worktree's port. **Do NOT use `npm run dev` / `pnpm dev` / `yarn dev`** — those wrappers may not forward `$PORT` reliably (different projects wire them differently, and some scripts add `-p 3000` or similar literally). Go around the wrapper.

| Project stack | Command to run |
|---|---|
| Next.js | `next dev -p $BELMONT_PORT` (add `--turbo` if the project uses Turbopack) |
| Vite | `vite --port $BELMONT_PORT` |
| Astro | `astro dev --port $BELMONT_PORT` |
| Nuxt | `nuxt dev --port $BELMONT_PORT` |
| Remix | `remix dev` with `PORT=$BELMONT_PORT` (Remix honors `PORT`) |
| SvelteKit | `vite dev --port $BELMONT_PORT` |
| Rails / Django / Flask | pass the port via the framework's `-p`/`--port` flag |

No, it's a secondary server (Storybook, Prisma Studio, docs, mock API, etc.): **dynamically allocate a free port and pass it explicitly.** Do NOT use the port from `package.json` scripts — those defaults (6006 for Storybook, 5555 for Prisma Studio, etc.) collide across parallel worktrees.

```bash
FREE_PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")

# Then pass FREE_PORT to the tool, bypassing the npm wrapper:
npx storybook dev -p $FREE_PORT --no-open
npx prisma studio --port $FREE_PORT
npx @stoplight/prism mock api.yaml --port $FREE_PORT
```

### Hard rules

1. **Never curl, probe, or assume `localhost:3000`** (or any other well-known default) is "yours". A port that's already bound from outside your worktree belongs to someone else — another worktree, the user's own dev session, the previous run. Always use `$BELMONT_PORT` / `$BELMONT_BASE_URL`.
2. **Hardcoded ports in committed config files are stale.** If `playwright.config.ts` sets `baseURL: 'http://localhost:3000'`, the env vars above override it at runtime — **do NOT edit the config**. Run tests as normal; Playwright/Cypress/etc. will pick up the env var. Editing a checked-in config to change the port would pollute the merge.
3. **Hardcoded ports in planning docs are stale.** If a `TECH_PLAN.md`, `PRD.md`, `NOTES.md`, or archived `MILESTONE-*.done.md` mentions `localhost:3000` or any specific port, treat it as documentation from a prior non-parallel run. Your ground truth is `$BELMONT_BASE_URL`.
4. **Never run `npm run dev` / `pnpm dev` / `yarn dev` / `npm run storybook` / `npm run test:e2e` without first confirming** the wrapped command forwards `$PORT` and `$PLAYWRIGHT_BASE_URL`. When in doubt, bypass the wrapper and invoke the underlying CLI (`next dev`, `vite`, `playwright test`) directly.
5. **Kill only what you own.** If your dev server fails to start because the port is taken, STOP and report it as a blocker — do not free the port by killing unknown processes. Another worktree, the user, or a system service may own it.
6. **If a port is in use, find another one — do not retry the same port.** The `FREE_PORT=$(python3 -c ...)` snippet above is idempotent and safe.

### Beyond ports

- **Dependencies**: worktree setup hooks have already run (e.g., `npm install`). Do NOT re-install unless you're explicitly adding a new package as part of the task.
- **Build isolation**: `.next/`, `dist/`, `node_modules/`, and other gitignored directories are local to this worktree. Other worktrees are unaffected by your builds.
- **Scope**: only modify files within this worktree. Changes will be merged back via git — the scope guard will revert edits outside your target milestone.

### Monorepo workspaces

If `BELMONT_MONOREPO=1`, the project is a monorepo (Turborepo, Nx, pnpm/npm/yarn/bun workspaces, Cargo, Go workspaces, uv, etc.). Belmont has auto-detected the workspaces and exports the following extra env vars:

| Variable | Purpose |
|---|---|
| `BELMONT_MONOREPO` | Always `1` when in a monorepo. Use as a guard. |
| `BELMONT_MONOREPO_TYPE` | One of `turborepo`, `nx`, `pnpm`, `npm`, `yarn`, `bun`, `cargo`, `go`, `uv`, `lerna`, `rush`. |
| `BELMONT_PRIMARY_WORKSPACE` | ID of the workspace that should host the **primary dev server** (the one that gets `$BELMONT_PORT`). |
| `BELMONT_PRIMARY_WORKSPACE_PATH` | Path of the primary workspace, relative to the worktree root (e.g. `packages/web`). |
| `BELMONT_WORKSPACES` | JSON array of `[{"id":"web","path":"packages/web"}, ...]` — every workspace, primary and otherwise. |

**Primary dev server in monorepo mode.** The dev server still uses `$BELMONT_PORT`, but you must invoke the bundler from inside the workspace dir:

```bash
cd "$BELMONT_PRIMARY_WORKSPACE_PATH" && next dev -p $BELMONT_PORT
# or, if the workspace tool's wrapper forwards --port correctly:
pnpm --filter "$BELMONT_PRIMARY_WORKSPACE" dev -- --port $BELMONT_PORT
```

**Workspace-scoped commands.** Build/test/typecheck/lint commands run via the workspace tool:

| Tool | Run script in workspace |
|---|---|
| pnpm | `pnpm --filter <id> <script>` |
| yarn | `yarn workspace <id> <script>` |
| npm  | `npm -w <id> run <script>` |
| bun  | `bun --filter <id> run <script>` |
| cargo| `cargo run -p <id>` / `cargo test -p <id>` |
| go   | `cd <workspace_path> && go test ./...` |

For new dependencies: `pnpm add -F <id> <pkg>` / `yarn workspace <id> add <pkg>` / `npm -w <id> install <pkg>` / `cargo add -p <id> <pkg>`.

**Multi-service verification.** A task that needs more than the primary dev server (e.g. web depends on a mock API) must enumerate `BELMONT_WORKSPACES` and start each additional server with the dynamic `FREE_PORT` pattern from the section above. Never reuse `$BELMONT_PORT` for a non-primary server — that's the primary's slot.

**Non-monorepo projects.** When `BELMONT_MONOREPO` is unset, ignore this section entirely. The single-package rules above are the full picture.

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

## Step 3: Run the Agent Pipeline

Run ALL incomplete tasks in the milestone through the phases below. Each agent reads its context from the MILESTONE file and writes its output back to it. You spawn **3 sub-agents per milestone — or 2 when Phase 2 is skipped** (see its skip rule).

**Phases 1 and 2 run simultaneously** (issue both dispatch calls in the same message). If Phase 2 is skipped, Phase 1 runs alone. Phase 3 runs after the preceding phases complete.

Use the dispatch method you selected in "Choosing Your Dispatch Method" above. Under **Approach A**, issue the parallel dispatch calls in one message. Under the **Sequential Inline** fallback (Approach B), execute each agent's instructions inline, finishing one completely before starting the next.

---

### Phase 1: Codebase Scan (codebase-agent) — *runs in parallel with Phase 2*

**Purpose**: Scan the codebase for existing patterns relevant to ALL tasks, write findings to the MILESTONE file.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont codebase analysis agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/codebase-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
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

> **IDENTITY**: You are the belmont design analysis agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/design-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
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

> **IDENTITY**: You are the belmont implementation agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/implementation-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
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
   git add .belmont/ && git commit -m "belmont: update planning files after milestone implementation"
   ```

**Note**: PROGRESS.md is the single source of truth for task state. PRD.md is a pure spec document with no status markers — do not add emoji or state indicators to PRD task headers.

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
