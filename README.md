# Belmont AI

A toolkit for running structured coding sessions with AI coding agents. Belmont manages a PRD (Product Requirements Document), orchestrates specialized sub-agent phases, and tracks progress across milestones.

**Agent-agnostic** -- works with Claude Code, Codex, Cursor, Windsurf, Gemini, GitHub Copilot, [Pi](https://pi.dev) (incl. local LLMs via LM Studio / Ollama), [opencode](https://opencode.ai), and any tool that can read markdown files. No Docker required. No loops. Just skills and agents.

A flexible PRD system has been used to provide the best level of context from plan to implementation. Tech plans allow you to specify specifics for the agent to follow while building.

Strong guardrails are in place to keep the agent focused and on task.

**Working Backwards (PR/FAQ)** -- Belmont supports Amazon's Working Backwards methodology as a strategic first step. Define your product vision with a PR/FAQ document before breaking it into features and tasks.

**Figma-first design workflow** -- Belmont is built heavily around understanding Figma designs. The design-agent extracts exact tokens (colors, typography, spacing), maps them to your design system, and produces implementation-ready component specs. The verification-agent compares your implementation against the Figma source using Playwright headless screenshots. For the best experience, install [figma-mcp](https://github.com/nichochar/figma-mcp) so Belmont can load and analyze your designs automatically.

---

## Quick Start

### All AI Tools (CLI)

The CLI installer supports Claude Code, Codex, Cursor, Windsurf, Gemini, GitHub Copilot, Pi, and opencode:

```bash
# Install via Homebrew (macOS / Linux)
brew install blake-simpson/belmont/belmont

# Or install via curl
curl -fsSL https://raw.githubusercontent.com/blake-simpson/belmont/main/install.sh | sh

# Set up your project
cd ~/your-project
belmont install
```

The installer detects which AI tools you have and installs skills to `.agents/skills/belmont/`, then links or copies them into each tool's native directory. Agents are installed to `.agents/belmont/`.

### Claude Code (Plugin)

Install Belmont directly as a Claude Code plugin -- no CLI required:

```bash
claude plugin marketplace add blake-simpson/belmont
claude plugin install belmont@belmont
```

Then use the skills:

```
/belmont:product-plan
/belmont:implement
/belmont:next
/belmont:status
```

**Optional: Install the Belmont CLI** for auto mode -- automated end-to-end feature implementation with headless AI agents, worktree parallelism, and milestone dependency tracking:

```bash
brew install blake-simpson/belmont/belmont
# OR
curl -fsSL https://raw.githubusercontent.com/blake-simpson/belmont/main/install.sh | sh
```

The plugin and CLI work independently. The plugin gives you the full manual workflow; the CLI adds automation on top.

---

## How It Works

Belmont breaks coding work into **phases**, each driven by a specialized agent. The user interacts through **skills** (markdown files loaded as slash commands or rules) that orchestrate these agents.

```
┌──────────────┐     ┌─────────────┐     ┌────────────────┐     ┌─────────────────┐
│  PR/FAQ      │ ──▶ │  Plan       │ ──▶ │  Tech Plan     │ ──▶ │  Implement      │
│ (optional)   │     │  (PRD.md)   │     │ (TECH_PLAN.md) │     │  (MILESTONE.md) │
└──────────────┘     └─────────────┘     └────────────────┘     └─────────────────┘
                                                                      │
                                           ┌──────────────────────────┤
                                           ▼                          ▼
                                      ┌───────────┐           ┌────────────┐
                                      │  Verify   │           │  Status    │
                                      │ (parallel)│           │ (read-only)│
                                      └─────┬─────┘           └────────────┘
                                            │
                         ┌──────────────────┼──────────────┐
                         ▼                  ▼              ▼
                   ┌───────────┐     ┌───────────┐  ┌───────────┐
                   │  Debug    │     │  Next     │  │Plan Review│
                   │ (fix bug) │     │ (1 task)  │  │ (drift)   │
                   └───────────┘     └───────────┘  └─────┬─────┘
                                                          │
                                                          ▼
                                                   Updates PRDs,
                                                   Tech Plans,
                                                   PROGRESS
```

### MILESTONE File Architecture

Belmont uses a **MILESTONE file** (`.belmont/MILESTONE.md`) as the shared context between agents. Instead of the orchestrator passing large outputs between agents in their prompts, each agent reads from and writes to this single file. This dramatically reduces token usage and keeps each agent focused.

```
Orchestrator
    │
    ├─ 1. Creates MILESTONE.md with task list, PRD context & TECH_PLAN context
    │
    ├─ 2. Research phases (parallel — both run simultaneously):
    │     ├─ codebase-agent ─── reads MILESTONE.md + codebase ── writes Codebase Analysis section
    │     └─ design-agent ───── reads MILESTONE.md + Figma ──── writes Design Specifications section
    │
    ├─ 3. Spawns implementation-agent ── reads MILESTONE.md ── writes code + Implementation Log
    │
    └─ 4. Archives MILESTONE.md → MILESTONE-M2.done.md
```

Each agent reads **only the MILESTONE file** — the orchestrator extracts all relevant PRD and TECH_PLAN context into it upfront. Agents receive a minimal prompt (just identity + "read the MILESTONE file"). The orchestrator's context stays flat — it never accumulates the massive outputs from each phase. This helps save tokens & prevent hallucinations.

> **Token-saving companion**: Belmont's agents are heavy consumers of command output (test runs, lints, git, file reads). Pairing Belmont with [RTK](https://www.rtk-ai.app/) (Rust Token Killer, `brew install rtk`) — a hook-based CLI proxy that filters command output before it reaches the model — typically halves tool-I/O input tokens (50–90% on test/lint output) with zero workflow change. This is the right lever for cutting token spend: trim the input side rather than downgrading agent models, since a cheaper model that fails a milestone re-runs the entire pipeline and costs more than it saves.

### Implementation Pipeline

When you run the implement skill, the orchestrator creates a MILESTONE file, then dispatches 3 phases. Phases 1 and 2 run in parallel, Phase 3 runs after both complete:

| Phase              | Agent                  | Model* | Reads                | Writes to MILESTONE                                  |
|--------------------|------------------------|--------|----------------------|------------------------------------------------------|
| 1. Codebase Scan   | `codebase-agent`       | Session | MILESTONE + codebase | `## Codebase Analysis`                               |
| 2. Design Analysis | `design-agent`         | Session | MILESTONE + Figma    | `## Design Specifications`                           |
| 3. Implementation  | `implementation-agent` | Session | MILESTONE (only)     | Code, unit tests, E2E tests, `## Implementation Log` |

\* Agents pin no model — each sub-agent inherits your **session model** by default (run Belmont on a strong model and the whole pipeline follows). Set per-feature tiers in `.belmont/features/<slug>/models.yaml` to pin specific models per agent — see [Per-feature model tiers](docs/workflow.md). When choosing tiers, optimize for first-pass correctness: a failed milestone re-runs the whole pipeline, which costs far more tokens than a premium tier saves.

After implementation, the MILESTONE file is archived (renamed to `MILESTONE-[ID].done.md`) to prevent stale context from bleeding into the next milestone.

### Verification Pipeline

When you run the verify skill, two agents run:

| Agent                | Model* | What It Does                                                                                                   |
|----------------------|--------|----------------------------------------------------------------------------------------------------------------|
| `verification-agent` | Session | Checks acceptance criteria, visual Figma comparison via Playwright headless, i18n keys                         |
| `code-review-agent`  | Session | Runs build, test, and E2E test commands (auto-detects package manager), reviews code quality and PRD alignment |

\* Inherits your session model; pin per feature via `models.yaml`. A verification false-pass is the most expensive mistake in the pipeline (it surfaces later as a debug loop), so set verification `high` when you configure tiers.

Both agents read the PRD, TECH_PLAN, and archived MILESTONE files for full context. Any issues found become follow-up tasks (plain `[ ]` entries) added to PROGRESS.md.

---

## Implementation Pipeline

Research phases 1–2 (codebase scan + design analysis) are fully independent — they each read from the `## Orchestrator Context` section of the MILESTONE file and write to their own designated section (`## Codebase Analysis`, `## Design Specifications`). This makes them safe to run in parallel with no conflicts. Phase 3 (implementation) always runs after both research phases complete.

```
                        ┌──────────────────┐
                        │   Orchestrator   │
                        └────────┬─────────┘
                                 │
              ┌──────────────────┴───────────────────┐
              ▼                                      ▼
     ┌────────────────┐                    ┌─────────────────┐
     │   Codebase     │                    │  Design Analyst │
     │   Analyst      │                    │                 │
     └────────┬───────┘                    └────────┬────────┘
              │                                     │
              └────────── MILESTONE file ───────────┘
                          (shared context)
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │  Implementation     │
                    │  Agent (Sub-agent)  │
                    └─────────────────────┘
```

---

## Agent Teams / Swarms Support

By default, Belmont dispatches all phases as **sub-agents**. This is the most reliable approach and works with every supported tool.

If your environment supports **agent teams** (e.g. Claude Code's multi-agent feature), Belmont's orchestrator skills will take advantage, if Claude thinks it would add value. If not it will use traditional sub-agents. No changes to Belmont's configuration are needed — just enable agent teams in your tool and the orchestrator will use them when appropriate.

---

## Monorepo Support

Belmont auto-detects monorepos and adjusts worktree setup so AI agents run commands in the right package, find env files where postinstall scripts actually need them, and discover sibling workspaces. Detection signals: `turbo.json`, `nx.json`, `pnpm-workspace.yaml`, `package.json` `workspaces`, `lerna.json`, `rush.json`, `Cargo.toml` `[workspace]`, `go.work`, `pyproject.toml` `[tool.uv.workspace]`. When detected, Belmont seeds `.env*` into qualifying workspace dirs (those whose manifest signals env consumption — Prisma deps, postinstall scripts, etc.), and exports `BELMONT_MONOREPO`, `BELMONT_PRIMARY_WORKSPACE`, `BELMONT_PRIMARY_WORKSPACE_PATH`, and `BELMONT_WORKSPACES` so agents can scope their `--filter`/`-w`/`-p` commands. Override auto-detection with optional `workspaces` and `primary_workspace` fields in `.belmont/worktree.json`. See [docs/monorepo-support.md](docs/monorepo-support.md).

Single-package projects are unaffected — none of the monorepo env vars are exported when no workspace is detected.

---

## Working Backwards (PR/FAQ)

Belmont supports Amazon's **Working Backwards** methodology — a product definition process that starts with the customer and works backwards to the solution. The centerpiece is the **PR/FAQ**: a one-page press release describing the product as if it's already launched, followed by FAQs that force clarity on every aspect of the idea.

### Why PR/FAQ?

Traditional product development often starts with solutions and works forward to find customers. Working Backwards reverses this: you write the press release first, then figure out how to build what you promised. This forces you to:

- **Define the customer precisely** — not "users" but "enterprise procurement managers at companies with 500+ employees"
- **Articulate the single most important benefit** — if you can't say it in one sentence, the idea isn't clear enough
- **Eliminate vague thinking** — no weasel words, no adjectives without data, no magic solutions
- **Surface hard questions early** — the FAQ section forces you to confront trade-offs, risks, and alternatives before writing any code

### How It Fits Into Belmont

The PR/FAQ is an optional but recommended first step in Belmont's workflow:

```
/belmont:working-backwards  →  .belmont/PR_FAQ.md    (strategic vision)
        ↓
/belmont:product-plan       →  .belmont/PRD.md       (feature catalog + detailed PRDs)
        ↓
/belmont:tech-plan          →  .belmont/TECH_PLAN.md (master + feature implementation specs)
        ↓
/belmont:implement          →  Code                  (agent pipeline)
```

The PR/FAQ feeds into product planning — when you run `/belmont:product-plan`, it reads the PR/FAQ for strategic context, ensuring your features align with the customer promise.

### Learn More

- [Working Backwards: Insights, Stories, and Secrets from Inside Amazon](https://www.workingbackwards.com/) by Colin Bryar and Bill Carr
- [Werner Vogels on Working Backwards](https://www.allthingsdistributed.com/2006/11/working_backwards.html) — the original blog post
- [The Amazon PR/FAQ Process](https://productstrategy.co/working-backwards-the-amazon-prfaq-for-product-innovation/) — a practical guide

---

## Sub-Feature Architecture

For products with multiple features, Belmont supports a **sub-feature directory structure** that keeps each feature's planning state isolated while maintaining a master product view.

```
.belmont/
  PR_FAQ.md                    ← Strategic vision (created by /belmont:working-backwards)
  PRD.md                       ← Master PRD (feature catalog)
  TECH_PLAN.md                 ← Master tech plan (cross-cutting architecture)
  features/
    user-authentication/
      PRD.md                   ← Feature-specific requirements + tasks
      TECH_PLAN.md             ← Feature-specific technical plan
      PROGRESS.md              ← Milestones + task tracking
      MILESTONE.md             ← Active implementation context
      MILESTONE-M1.done.md     ← Archived milestones
    payment-processing/
      PRD.md
      TECH_PLAN.md
      PROGRESS.md
```

- **Master files** persist at the product level — the PR/FAQ, master PRD (feature catalog), and master tech plan (cross-cutting architecture)
- **Feature directories** contain the detailed planning state for each feature — isolated PRDs, tech plans, progress tracking, and milestone files
- **Skills prompt for feature selection** — when running any skill, you select or create the feature to work on
- **Cleanup reduces bloat** — archive completed features into slim summaries, remove stale milestone files, trim notes, and audit convention files
- **Reset is granular** — reset a single feature, all features, or everything including masters

---

## Installation

### Install (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/blake-simpson/belmont/main/install.sh | sh
```

This downloads the latest release binary to `~/.local/bin/belmont`. Make sure it's in your PATH:

```bash
# Add to ~/.zshrc or ~/.bashrc (if not already)
export PATH="$HOME/.local/bin:$PATH"
```

You can override the install directory with `BELMONT_INSTALL_DIR`:

```bash
BELMONT_INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/blake-simpson/belmont/main/install.sh | sh
```

### Per-Project Setup

Navigate to your project and run:

```bash
cd ~/your-project
belmont install
```

Release binaries have all skills and agents embedded -- no source directory needed. You can also pass options:

```bash
# Target a different project folder
belmont install --project /path/to/project

# Limit tool setup and disable prompts
belmont install --tools claude,codex --no-prompt
```

### Developer Setup (contributors)

If you've cloned the repo and want to build from source:

```bash
# Build with embedded content
./scripts/build.sh

# Or use the dev installer (builds + records source path)
./bin/install.sh --setup

# Run during development (requires --source flag since go run has no embedded files)
go run ./cmd/belmont install --source . --project /tmp/test-project --no-prompt
```

---

## Skills

| Skill               | Description                                       |
|---------------------|---------------------------------------------------|
| `working-backwards` | Amazon-style PR/FAQ document creation             |
| `product-plan`      | Interactive PRD and PROGRESS creation             |
| `tech-plan`         | Technical implementation plan                     |
| `codex-plan-apply`  | Codex-only apply step for plan-mode handoff packets |
| `implement`         | Full milestone implementation pipeline (3 agents) |
| `next`              | Implement a single task (lightweight)             |
| `verify`            | Verification and code review                      |
| `loop`              | **Claude Code or Codex** — drive one feature to completion (implement → verify → next → status) via `/loop` or `/goal` |
| `debug`             | Debug router (auto or manual)                     |
| `debug-auto`        | Auto debug loop with agent verification           |
| `debug-manual`      | User-verified debug loop with deep Belmont context + in-place spec reconciliation |
| `review-plans`      | Document alignment and drift detection            |
| `repair`            | Fix a PROGRESS.md whose task states no longer parse |
| `cleanup`           | Archive completed features, reduce token bloat    |
| `status`            | Read-only progress report                         |
| `reset`             | Reset state and start fresh                       |

See [Skills Reference](docs/skills-reference.md) for detailed descriptions of each skill.

---

## Supported Tools

| Tool                  | How Skills Are Wired                                                  | How to Use                                          |
|-----------------------|-----------------------------------------------------------------------|-----------------------------------------------------|
| **Claude Code**       | `.claude/agents/belmont` symlink + per-skill symlinks `.claude/commands/belmont/<skill>.md` → `.agents/skills/belmont/<skill>/SKILL.md` | `/belmont:product-plan`, `/belmont:implement`, etc. |
| **Codex**             | Generated per-skill `agents/openai.yaml` (`display_name: "belmont:<skill>"`) — skills auto-discovered via `.agents/skills/` | Type `$belmont` to list all skills, or `belmont:implement` in prompt |
| **Cursor**            | None — `.agents/skills/` auto-discovered (Cursor Skills)              | `belmont:implement` in prompt                       |
| **Windsurf**          | None — `.agents/skills/` auto-discovered (Cascade Skills)             | `belmont:implement` in prompt                       |
| **Gemini**            | None — `.agents/skills/` is the documented `.gemini/skills/` alias    | `belmont:implement` in prompt                       |
| **GitHub Copilot**    | None — `.agents/skills/` auto-discovered                              | `belmont:implement` in prompt                       |
| **Pi** (incl. local LLMs) | None — `.agents/skills/` auto-discovered (agentskills.io)         | `belmont:implement` in prompt; configure provider/model in `~/.belmont/local-llms.json` |
| **opencode**          | Generated per-skill wrapper commands `.opencode/command/belmont/<skill>.md` delegating to `.agents/skills/belmont/<skill>/SKILL.md` (skills also auto-discovered) | `/belmont/product-plan`, `/belmont/implement`, etc. (or `belmont:implement` in prompt) |
| **Any other tool**    | None — point your tool at `.agents/skills/belmont/<skill>/SKILL.md`   |                                                     |

Skills are installed as agentskills.io-format folders (`<skill>/SKILL.md`), the open standard supported by Codex, Cursor, Gemini, Windsurf, GitHub Copilot, Claude Code, Pi, opencode, and a growing number of other AI tools.

See [Supported Tools](docs/supported-tools.md) for detailed per-tool setup instructions.

---

## Feature Auto

Belmont includes a built-in auto orchestrator (`belmont auto`) that takes a planned feature (with PRD + TECH_PLAN) and executes it end-to-end: implementing milestones, verifying, fixing follow-up issues, and continuing until the feature is complete. Independent milestones can run in parallel via git worktrees, and multiple features can execute in parallel across worktrees. Pure Go, no Node.js required.

> **Alias**: `belmont loop` still works as an alias for `belmont auto`.

```bash
# Run auto for a feature
belmont auto --feature my-feature

# Run specific milestones
belmont auto --feature my-feature --from M2 --to M6

# Use a specific AI tool
belmont auto --feature my-feature --tool codex

# Run multiple features in parallel
belmont auto --features feat-a,feat-b,feat-c

# Run all pending features
belmont auto --all

# Control checkpoint policy
belmont auto --feature my-feature --policy milestone

# Cap concurrent features or milestones
belmont auto --all --max-parallel 2

# Bypass the clean-working-tree preflight (not recommended — risks merge failures)
belmont auto --feature my-feature --allow-dirty

# Re-verify completed milestones (e.g. after upgrading agents)
belmont reverify --feature my-feature
belmont reverify --feature my-feature --from M3 --to M10

# Sync master PROGRESS.md with actual feature states
belmont sync

# Steer an in-flight auto run — injects instructions into active worktrees
belmont steer --message "pin the ital and MONO axes too"
belmont steer --milestone M5 --file fix-notes.md
belmont steer -   # read from stdin; or run with no source for $EDITOR
```

The auto command auto-detects which AI tool CLI you have installed (Claude Code, Codex, Gemini, Copilot, Cursor, Pi, opencode) and shells out to it in headless mode. Override with `--tool`.

It uses a hybrid decision system: smart deterministic rules handle ~80% of cases (using git diff classification and per-milestone tracking), with AI called only for ambiguous situations like repeated verification failures. The AI receives rich context including work type, failure history, and verification state. Falls back to deterministic rules automatically if the AI call fails.

Independent milestones can execute in parallel using git worktrees. Declare dependencies in PROGRESS.md with `(depends: M1, M2)` syntax, and milestones without unmet dependencies run concurrently up to `--max-parallel` (default 5). Multiple features can also run in parallel with `--features` or `--all`, each in its own worktree with automatic merge and conflict reconciliation. Feature-level dependencies declared in the master PRD's Dependencies column enable wave-based execution — independent features run in parallel, dependent features wait for their dependencies to complete first.

Each worktree gets isolated `.belmont/` state (copy-based, not symlinked) so AI agents can commit state changes as part of their feature branch. Run `belmont status` from the main repo to see live progress across all active worktrees. Each worktree is automatically assigned a unique `PORT` to prevent dev server conflicts. Dependencies are auto-installed by detecting your lock file (e.g., `package-lock.json` → `npm install`). Create `.belmont/worktree.json` to customize setup hooks, teardown, or environment variables. See [Worktree Isolation](docs/worktree-isolation.md) for details.

Three checkpoint policies control human involvement:
- `autonomous` (default) — only pauses on blockers or errors
- `milestone` — pauses before each new milestone
- `every_action` — human approves each step

See [Feature Auto](docs/feature-auto.md) for full documentation.

---

## Documentation

| Document                                           | Description                                                 |
|----------------------------------------------------|-------------------------------------------------------------|
| [CLI Commands](docs/cli-commands.md)               | Full CLI usage, flags, and examples                         |
| [Supported Tools](docs/supported-tools.md)         | Detailed per-tool setup (Claude Code, Codex, Cursor, etc.)  |
| [Skills Reference](docs/skills-reference.md)       | Detailed description of each skill                          |
| [Feature Auto](docs/feature-auto.md)               | Automated orchestrator for end-to-end feature execution     |
| [Worktree Isolation](docs/worktree-isolation.md)   | Port assignment, lifecycle hooks, and parallel execution    |
| [Full Workflow](docs/workflow.md)                  | Step-by-step walkthrough from vision to iteration           |
| [Directory Structure](docs/directory-structure.md) | Repository and installed project layouts                    |
| [PRD & Progress Format](docs/prd-format.md)        | PRD task format, states, priorities, and PROGRESS structure |
| [Agent Pipeline Details](docs/agent-pipeline.md)   | How the 3-phase agent pipeline works internally             |
| [Updating Belmont](docs/updating.md)               | Self-update, re-install, and developer updates              |
| [Troubleshooting](docs/troubleshooting.md)         | Common issues and fixes                                     |

---

## Requirements

- An AI coding tool (Claude Code, Codex, Cursor, Windsurf, Gemini, Copilot, Pi, opencode, or any tool that reads markdown)
- [figma-mcp](https://github.com/nichochar/figma-mcp) (recommended) -- enables Belmont to load Figma designs, extract design tokens, and perform visual verification
- [playwright-mcp](https://github.com/microsoft/playwright-mcp) (recommended) -- enables agents to interact with browsers for visual verification and E2E test debugging
- [RTK](https://www.rtk-ai.app/) (recommended) -- hook-based CLI proxy that filters command output (tests, lints, git) before it reaches the model; typically halves tool-I/O input tokens across Belmont's agent pipeline
- No Go required (pre-built binaries)
- No Docker required
- No Python required

**For contributors**: Go 1.21+ is needed to build from source. See [Developer Setup](#developer-setup-contributors).

---

## Authors

|                                                             | Name                                                                   | Contributions                                                 |
|-------------------------------------------------------------|------------------------------------------------------------------------|---------------------------------------------------------------|
| <img src="https://github.com/blake-simpson.png" width="50"> | **Blake Simpson** ([@blake-simpson](https://github.com/blake-simpson)) | Creator & maintainer                                          |
| <img src="https://github.com/bigbenjoman.png" width="50">   | **Ben Lavender** ([@bigbenjoman](https://github.com/bigbenjoman))      | PR/FAQ skill, Product skill + PRD formats, Test & maintenance |

---

## License

Belmont is licensed under the [Apache License 2.0](LICENSE). See the [NOTICE](NOTICE) file for attribution details.
