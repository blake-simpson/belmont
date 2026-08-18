# Feature Auto

The `belmont auto` command automates the full implementation cycle for a Belmont feature. Given a feature with a PRD and TECH_PLAN, it implements milestones, verifies them, fixes follow-up issues, and continues until the feature is complete.

> **Alias**: `belmont loop` still works as an alias for `belmont auto`.

## Prerequisites

- A feature directory at `.belmont/features/<slug>/` with `PRD.md`, `TECH_PLAN.md`, and `PROGRESS.md`
- The `belmont` CLI installed and on PATH
- At least one supported AI tool CLI installed

## Supported Tools

| Tool | CLI command | Auto-approve flag | Output format |
|------|------------|-------------------|---------------|
| **Claude Code** | `claude -p "<prompt>"` | `--permission-mode bypassPermissions` | `--output-format json` |
| **Codex** | `codex exec "<prompt>"` | `--dangerously-bypass-approvals-and-sandbox` | `--json` |
| **Gemini** | `gemini "<prompt>"` | `--yolo` | `--output-format json` |
| **Copilot** | `copilot -p "<prompt>"` | `--yolo` | text only |
| **Cursor** | `cursor agent -p "<prompt>"` | `--force` | `--output-format json` |
| **Pi** | `pi -p "<prompt>"` | none needed (YOLO by default) | text only |
| **opencode** | `opencode run "<prompt>"` | `--dangerously-skip-permissions` | text only |

Windsurf has no headless CLI and is not supported for auto.

Pi and opencode emit plain text (no JSON envelope); Belmont's decision extractor handles fenced/inline JSON in their output. opencode's skip-permissions flag auto-approves everything *not explicitly denied* in `opencode.json` — `deny` rules still win.

## Usage

```bash
# Run all pending milestones for a feature
belmont auto --feature my-feature

# Run a specific milestone range
belmont auto --feature my-feature --from M2 --to M6
belmont auto --feature my-feature --from M3     # M3 through end
belmont auto --feature my-feature --to M4       # start through M4

# Use a specific AI tool (default: auto-detect)
belmont auto --feature my-feature --tool codex

# Control checkpoint policy
belmont auto --feature my-feature --policy milestone

# Set iteration limits
belmont auto --feature my-feature --max-iterations 30

# Specify project root
belmont auto --feature my-feature --root /path/to/project

# Execute independent milestones in parallel (via git worktrees)
belmont auto --feature my-feature --max-parallel 3
```

## How It Works

The auto command uses a layered decision system:

```
┌──────────────────────┐
│  Hard Guardrails     │  Go code, always runs first
│  (blockers, failures,│  Returns PAUSE/ERROR if triggered
│   stuck detection)   │
├──────────────────────┤
│  Smart Rules Engine  │  Deterministic rules, handles ~80% of cases
│  (work type aware,   │  Uses git diff classification + milestone state
│   milestone tracking)│
├──────────────────────┤
│  AI Decision Layer   │  Only for ambiguous cases, with rich context
│  (enhanced prompt,   │  Includes milestone verification state,
│   rules fallback)    │  work type, file counts, failure history
├──────────────────────┤
│  Execution Layer     │  Shells out to tool with skill prompt
└──────────────────────┘
```

### Hard Guardrails

These always run first:

1. **Blockers detected** → PAUSE for human intervention
2. **Consecutive failures** (default 3) → ERROR, stop the loop
3. **Stuck detection** (no state change after 2 iterations) → PAUSE

### Smart Rules Engine

After guardrails, deterministic rules handle the majority of decisions without an AI call:

1. **After IMPLEMENT_MILESTONE success → almost always VERIFY**
   - Skip only for: 0 files changed, pure docs, or non-critical config with ≤2 files
   - Frontend, backend, mixed, critical config: always VERIFY
2. **After VERIFY success + no follow-ups** → next undone milestone or COMPLETE
3. **After VERIFY success + follow-ups exist** → IMPLEMENT_NEXT
4. **After IMPLEMENT_NEXT success** → re-VERIFY
5. **After VERIFY failure (2+ times same milestone)** → delegate to AI for REPLAN/DEBUG
6. **After VERIFY failure (first time)** → IMPLEMENT_NEXT to fix issues
7. **After DEBUG success** → VERIFY
8. **All milestones done + verified + no follow-ups** → COMPLETE

The smart rules track per-milestone state (implemented, verified, verify failure count) and classify work type from git diffs (frontend, backend, config, docs, mixed, minimal).

### AI Decisions

The AI is only called for ambiguous cases the smart rules can't handle (e.g., repeated verification failures). It receives rich context:

- Per-milestone state: implemented, verified, verify failure count, work type, files changed
- Last 5 actions with success/failure, work type, and 500 chars of output
- Previous iteration output (last 1500 chars)
- Ambiguity reason explaining why the AI was called

The AI responds with a JSON object specifying the action, reason, and optional milestone ID. If the AI call fails, the loop falls back to the legacy deterministic rules engine.

### Action Types

| Action | Description |
|--------|-------------|
| IMPLEMENT_MILESTONE | Implement next incomplete milestone |
| IMPLEMENT_NEXT | Fix follow-up tasks or issues found during verification |
| VERIFY | Run verification on completed milestones |
| DEBUG | Run automated debugging when verification keeps failing |
| REPLAN | Re-run tech planning when current approach has systemic issues |
| SKIP_MILESTONE | Clear the unstarted work in a milestone that cannot proceed |
| COMPLETE | All work in scope is done and verified |
| PAUSE | Stop for human intervention |
| ERROR | Unrecoverable failure, stop the loop |

DEBUG, REPLAN, and SKIP_MILESTONE are only available via AI decisions (not the smart rules or rules fallback). DEBUG triggers `/belmont:debug-auto`, REPLAN triggers `/belmont:tech-plan`, and SKIP_MILESTONE edits PROGRESS.md directly (no tool call).

SKIP_MILESTONE marks `[ ]` and `[>]` tasks done. It deliberately **leaves `[!]` blocked tasks alone**: a blocker is a question waiting on a person, and rewriting one to `[x]` tells every stop condition the work is finished when nobody has answered it. If a milestone has nothing left but blocked tasks, the skip fails rather than reporting success — "skipped" would mean "this milestone is done", which is exactly what it is not. Use `belmont blockers` to see what is waiting.

### Tool Auto-Detection

When `--tool` is not specified, the auto command checks `$PATH` for supported CLIs in priority order: `claude`, `codex`, `gemini`, `copilot`, `cursor`, `windsurf`, `pi`, `opencode`. The first one found is used. If none are found, the command exits with a helpful error message.

### Execution Layer

Each action shells out to the selected tool CLI in headless mode:

| Action | Prompt sent to tool |
|--------|-------------------|
| IMPLEMENT_MILESTONE | `/belmont:implement --feature <slug>` |
| IMPLEMENT_NEXT | `/belmont:next --feature <slug>` |
| VERIFY | `/belmont:verify --feature <slug>` |
| DEBUG | `/belmont:debug-auto --feature <slug>` |
| REPLAN | `/belmont:tech-plan --feature <slug>` |

## Parallel Milestone Execution

The auto command supports executing independent milestones in parallel using git worktrees. This can significantly speed up feature implementation when milestones don't depend on each other.

### How It Works

When `--max-parallel` is set (default: 5), the auto command analyzes milestone dependencies declared in PROGRESS.md and runs independent milestones concurrently. Each parallel milestone executes in its own git worktree, so there are no conflicts between concurrent implementations.

```
┌─────────────────────────────────────────────────────┐
│                  Auto Controller                     │
├─────────────────────────────────────────────────────┤
│  Dependency Graph   │  Worktree Manager             │
│  (reads PROGRESS)   │  (creates/cleans worktrees)   │
├─────────────────────┴───────────────────────────────┤
│                                                      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│   │ Worktree │  │ Worktree │  │ Worktree │  max=3  │
│   │   M1     │  │   M2     │  │   M3     │         │
│   │ (impl)   │  │ (impl)   │  │ (impl)   │         │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│        │              │              │               │
│        ▼              ▼              ▼               │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│   │ Verify   │  │ Verify   │  │ Verify   │         │
│   │   M1     │  │   M2     │  │   M3     │         │
│   └──────────┘  └──────────┘  └──────────┘         │
│                                                      │
│   After M1, M2, M3 complete:                        │
│   ┌──────────┐  (M4 depends on M1)                  │
│   │ Worktree │                                       │
│   │   M4     │                                       │
│   │ (impl)   │                                       │
│   └──────────┘                                       │
└─────────────────────────────────────────────────────┘
```

### Dependency Syntax in PROGRESS.md

Declare dependencies using the `(depends: ...)` syntax on milestone lines:

```markdown
## Milestones

- [x] M1: Project scaffolding
- [x] M2: Database schema (depends: M1)
- [ ] M3: API endpoints (depends: M2)
- [ ] M4: Auth middleware (depends: M2)
- [ ] M5: Frontend components
- [ ] M6: Integration tests (depends: M3, M4, M5)
```

In this example:
- M3 and M4 both depend on M2, so they can run in parallel once M2 is done
- M5 has no dependencies, so it can run in parallel with M3 and M4
- M6 depends on M3, M4, and M5, so it waits for all three

Milestones without a `(depends: ...)` declaration are treated as having no dependencies and are eligible for immediate parallel execution. A `(depends:)` naming no existing milestone is ignored rather than treated as blocking.

Dependencies also drive what is offered as **next** (#59): `belmont status`'s "Next Milestone"/"Next" lines, and the milestone selection in `/belmont:implement`, `/belmont:next` and `/belmont:loop`, all skip a milestone whose `(depends:)` is unmet — a dependency is met once the named milestone is all-done: at least one task, every one `[x]`/`[v]`/`[-]` (an empty milestone never satisfies a dependency). When every pending milestone is dependency-blocked, status prints `(waiting on dependencies) M<a> depends on M<b> (status: …)` instead of `None` — `None` means finished, and loop stop conditions read it that way.

### Worktree Lifecycle

1. **Create**: A git worktree is created for each parallel milestone at `~/.belmont/worktrees/<project-name>/<feature>-<milestone>/`
2. **Env files**: `.env*` files are copied from the project root (they're gitignored, so absent in fresh worktrees)
3. **Port assignment**: A unique port is allocated and set as `PORT` and `BELMONT_PORT` environment variables
4. **Setup hooks**: If `.belmont/worktree.json` exists, its `setup` commands run (e.g., `npm install`)
4. **Execute**: The AI tool runs the implement and verify cycle in the worktree (with `PORT`/`BELMONT_PORT`/`BELMONT_WORKTREE` env vars)
5. **Merge**: On successful verification, changes are merged back to the main branch
6. **Teardown**: Teardown hooks run (if configured), processes are killed, and the worktree is removed

See [Worktree Isolation](worktree-isolation.md) for configuration details.

### Interrupted Run Recovery

If `belmont auto` is interrupted (e.g., Ctrl+C) and restarted, stale branches or worktrees may remain from the previous run. The auto command detects this and handles it gracefully:

**Interactive mode** (terminal): You'll be prompted to choose:
- **Resume** (`r`) — Continue from where the previous run left off, reusing the existing branch and worktree
- **Start fresh** (`s`) — Delete the stale branch/worktree and restart from scratch
- **Quit** (`q`) — Exit without making changes

**Non-interactive mode** (CI/piped stdin): Stale state is automatically cleaned up and the run starts fresh.

On interrupt, the signal handler now cleans up both worktree directories and their associated git branches, preventing the "branch already exists" error on restart.

### Merge Conflict Reconciliation

When parallel milestone branches are merged back, conflicts may occur. The auto command uses a **two-pass reconciliation** flow:

1. **Pass 1 — AI Analysis**: The AI reads all conflicted files and writes a structured JSON report to `.belmont/reconciliation-report.json`. It classifies each conflict as high or low confidence but does not modify files on disk.

2. **Pass 2 — Apply + Review**:
   - **High confidence** (import merges, non-overlapping additions): auto-applied without prompting
   - **Low confidence** (same function modified by both sides, conflicting config values): user is prompted interactively

Interactive prompt options for low-confidence conflicts:
- `a` — Accept the AI's proposed resolution (default)
- `v` — View the proposed resolution with line numbers
- `e` — Edit the proposed resolution in `$EDITOR`
- `s` — Auto-resolve all remaining conflicts without further prompts
- `q` — Abort reconciliation (preserves worktree for manual resolution)

**Non-interactive mode**: When stdin is not a terminal (e.g., CI), all AI proposals are auto-accepted.

**Fallback**: If the AI fails to produce a valid report, the system falls back to legacy behavior where the AI resolves everything directly on disk.

### Limitations

- Milestones that modify the same files may cause merge conflicts — declare dependencies to avoid this
- Each worktree runs a separate AI tool process, so resource usage scales with parallelism
- The `--max-parallel` flag caps concurrency (default: 5) to manage resource usage
- Multiple worktrees with `node_modules` copies consume disk space — consider pnpm or `--prefer-offline`

## Checkpoint Policies

| Policy | Behavior |
|--------|----------|
| `autonomous` (default) | Only pauses on blockers, errors, or stuck detection |
| `milestone` | Pauses before each new milestone, after verification, and for REPLAN/SKIP_MILESTONE |
| `every_action` | Human approves every step |

## Safety Guardrails

- **Max iterations**: Hard cap (default 20) prevents runaway loops
- **Consecutive failures**: 3 failures in a row → stop
- **Stuck detection**: Same state after 2 successful iterations → pause

## Multi-Feature Parallel Execution

Run multiple features in parallel, each in its own git worktree. Milestones within each feature run sequentially, but features execute concurrently. Features with dependencies execute wave-by-wave — independent features run in parallel, dependent features wait for their dependencies to complete and merge first.

### Usage

```bash
# Run specific features in parallel
belmont auto --features feat-a,feat-b,feat-c

# Run all pending (non-complete) features
belmont auto --all

# Cap concurrent features (default: 5)
belmont auto --features feat-a,feat-b,feat-c --max-parallel 2
```

### Feature Dependencies

Dependencies are declared in the master PRD (`.belmont/PRD.md`) in the Features table's Dependencies column using comma-separated feature slugs:

```markdown
## Features

| Feature | Slug | Priority | Dependencies | Status |
|---------|------|----------|-------------|--------|
| Database Setup | setup | P1 | None | Not Started |
| User Auth | auth | P1 | setup | Not Started |
| Payments | payments | P2 | setup, auth | Not Started |
| Dashboard | dashboard | P2 | auth | Not Started |
```

When running `belmont auto --all`, features are grouped into waves:
- **Wave 1**: `setup` (no dependencies)
- **Wave 2**: `auth` (depends on `setup`)
- **Wave 3**: `dashboard`, `payments` (both depend on earlier waves, run in parallel)

If a feature fails, all features that depend on it (directly or transitively) are skipped.

Features without any dependencies run in a single wave (original parallel behavior).

### How It Works

```
belmont auto --all (with dependencies)

  Wave 1:
  [setup worktree]
    M1 → M2
         ↓
      merge setup

  Wave 2:
  [auth worktree]
    M1 → M2 → M3
         ↓
      merge auth

  Wave 3:
  [payments worktree]   [dashboard worktree]   (parallel)
    M1 → M2               M1 → M2
         ↓                      ↓
      merge payments        merge dashboard
```

1. Each feature gets its own git worktree at `~/.belmont/worktrees/<project-name>/<slug>/` on branch `belmont/auto/<slug>`
2. Feature state (`.belmont/features/<slug>/`) is copied into the worktree
3. `belmont install` runs in the worktree to set up the AI tool
4. The full auto loop runs for each feature (sequential milestones)
5. Each wave's features merge back to main before the next wave starts
6. The reconciliation agent handles cross-feature merge conflicts within a wave

### Constraints

- `--feature` and `--features`/`--all` are mutually exclusive
- `--from`/`--to` are not supported with `--features`/`--all`
- `--all` skips features with status "Complete"
- Failed features preserve their worktrees for manual intervention
- Dependency cycles are detected and reported as errors before execution starts
- Dangling dependency references (slugs that don't exist) are detected and reported

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--feature <slug>` | (required*) | Feature slug to implement (single-feature mode) |
| `--features <a,b,c>` | | Comma-separated feature slugs for parallel execution |
| `--all` | `false` | Run all pending features in parallel |
| `--from <milestone>` | | Start from milestone (single-feature only) |
| `--to <milestone>` | | End at milestone (single-feature only) |
| `--tool <name>` | auto-detect | CLI tool: claude, codex, gemini, copilot, cursor, pi, opencode |
| `--policy <policy>` | `autonomous` | Checkpoint policy |
| `--max-iterations <n>` | `50` | Maximum loop iterations per feature |
| `--max-failures <n>` | `3` | Consecutive failures before stopping |
| `--max-parallel <n>` | `5` | Maximum concurrent features or milestones |
| `--root <path>` | `.` | Project root directory |

*Required in single-feature mode. Use `--features` or `--all` for multi-feature mode.

## Architecture

```
┌─────────────────────────────────────────┐
│     belmont auto CLI                    │  belmont auto --feature <slug>
├─────────────────────────────────────────┤
│     Auto Controller                     │  Main loop, error handling
├─────────────────────────────────────────┤
│     Dependency Graph                    │  Parses (depends: ...) from PROGRESS.md
├─────────────────────────────────────────┤
│     Hard Guardrails                     │  Blockers, failures, stuck detection
├─────────────────────────────────────────┤
│     Smart Rules Engine                  │  Work-type-aware deterministic decisions
├─────────────────────────────────────────┤
│     AI Decision Layer                   │  Ambiguous cases only, enhanced context
├─────────────────────────────────────────┤
│     Parallel Executor                   │  Worktree management, concurrent milestones
├─────────────────────────────────────────┤
│     Multi-tool Executor                 │  Shells out to claude/codex/gemini/copilot/cursor
├─────────────────────────────────────────┤
│     State Reader                        │  Calls buildStatus() directly (no subprocess)
└─────────────────────────────────────────┘
```

The state reader reuses the existing Go `buildStatus()` function directly — no subprocess needed. The smart rules engine handles ~80% of decisions deterministically using git diff classification and per-milestone tracking. The AI decision layer is only called for ambiguous cases, with rich context including work type, verification history, and failure patterns. The legacy rules engine serves as automatic fallback if the AI call fails. The parallel executor manages git worktrees for concurrent milestone execution, respecting dependency declarations in PROGRESS.md. The multi-tool executor builds the appropriate CLI command for whichever tool is selected.
