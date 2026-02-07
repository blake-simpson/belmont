# Belmont AI

A toolkit for running structured coding sessions with AI coding agents. Belmont manages a PRD (Product Requirements Document), orchestrates specialized sub-agent phases, and tracks progress across milestones.

**Agent-agnostic** -- works with Claude Code, Codex, Cursor, Windsurf, Gemini, GitHub Copilot, and any tool that can read markdown files. No Docker required. No loops. Just skills and agents.

A flexible PRD system has been used to provide the best level of context from plan to implementation. Tech plans allow you to specify specifics for the agent to follow while building.

Strong guardrails are in place to keep the agent focused and on task.

**Figma-first design workflow** -- Belmont is built heavily around understanding Figma designs. The design-agent extracts exact tokens (colors, typography, spacing), maps them to your design system, and produces implementation-ready component specs. The verification-agent compares your implementation against the Figma source using Playwright headless screenshots. For the best experience, install [figma-mcp](https://github.com/nichochar/figma-mcp) so Belmont can load and analyze your designs automatically.

---

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Supported Tools](#supported-tools)
- [Skills Reference](#skills-reference)
- [Full Workflow](#full-workflow)
- [Directory Structure](#directory-structure)
- [PRD & Progress Format](#prd--progress-format)
- [Agent Pipeline Details](#agent-pipeline-details)
- [Updating Belmont](#updating-belmont)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# One-time: make belmont-install available globally
cd /path/to/belmont
./bin/install.sh

# Per-project: install into your project
cd ~/your-project
belmont-install
```

The installer detects which AI tools you have (Claude Code, Codex, Cursor, Windsurf, etc.) and installs skills to `.agents/skills/belmont/`, then creates symlinks from each tool's native directory. Agents are installed to `.agents/belmont/`.

Then use the skills in your AI tool of choice. For example, in Claude Code:

```
/belmont:product-plan
/belmont:implement
/belmont:next
/belmont:status
```

---

## How It Works

Belmont breaks coding work into **phases**, each driven by a specialized agent. The user interacts through **skills** (markdown files loaded as slash commands or rules) that orchestrate these agents.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Plan       │ ──▶ │  Tech Plan   │ ──▶ │  Implement   │
│  (PRD.md)   │     │ (TECH_PLAN)  │     │  (milestone) │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                         ┌──────────────────────┤
                         ▼                      ▼
                   ┌───────────┐         ┌────────────┐
                   │  Verify   │         │  Status    │
                   │ (parallel)│         │ (read-only)│
                   └───────────┘         └────────────┘
                         │
                         ▼
                   ┌───────────┐
                   │  Next     │  (single task, lightweight)
                   └───────────┘
```

### MILESTONE File Architecture

Belmont uses a **MILESTONE file** (`.belmont/MILESTONE.md`) as the shared context between agents. Instead of the orchestrator passing large outputs between agents in their prompts, each agent reads from and writes to this single file. This dramatically reduces token usage and keeps each agent focused.

```
Orchestrator
    │
    ├─ 1. Creates MILESTONE.md with task list & PRD context
    │
    ├─ 2. Spawns prd-agent ──────── reads MILESTONE.md + TECH_PLAN ── writes PRD Analysis section
    │
    ├─ 3. Spawns codebase-agent ─── reads MILESTONE.md + TECH_PLAN ── writes Codebase Analysis section
    │
    ├─ 4. Spawns design-agent ───── reads MILESTONE.md + TECH_PLAN ── writes Design Specifications section
    │
    ├─ 5. Spawns implementation-agent reads MILESTONE.md + TECH_PLAN ── writes code + Implementation Log
    │
    └─ 6. Archives MILESTONE.md → MILESTONE-M2.done.md
```

Each agent receives a **minimal prompt** (just identity + "read the MILESTONE file") instead of having the orchestrator paste all prior outputs into the prompt. The orchestrator's context stays flat — it never accumulates the massive outputs from each phase.

### Implementation Pipeline

When you run the implement skill, the orchestrator creates a MILESTONE file, then each phase runs sequentially:

| Phase              | Agent                  | Model  | Reads                              | Writes to MILESTONE             |
|--------------------|------------------------|--------|------------------------------------|---------------------------------|
| 1. Task Analysis   | `prd-agent`            | Sonnet | MILESTONE + PRD + TECH_PLAN        | `## PRD Analysis`               |
| 2. Codebase Scan   | `codebase-agent`       | Sonnet | MILESTONE + TECH_PLAN + codebase   | `## Codebase Analysis`          |
| 3. Design Analysis | `design-agent`         | Sonnet | MILESTONE + TECH_PLAN + Figma      | `## Design Specifications`      |
| 4. Implementation  | `implementation-agent` | Opus   | MILESTONE + TECH_PLAN              | Code, tests, `## Implementation Log` |

After implementation, the MILESTONE file is archived (renamed to `MILESTONE-[ID].done.md`) to prevent stale context from bleeding into the next milestone.

### Verification Pipeline

When you run the verify skill, two agents run **in parallel**:

| Agent                | Model  | What It Does                                                                           |
|----------------------|--------|----------------------------------------------------------------------------------------|
| `verification-agent` | Sonnet | Checks acceptance criteria, visual Figma comparison via Playwright headless, i18n keys |
| `core-review-agent`  | Sonnet | Runs build and test commands (auto-detects package manager), reviews code quality and PRD alignment |

Both agents read the PRD, TECH_PLAN, and archived MILESTONE files for full context. Any issues found become follow-up tasks added to the PRD and PROGRESS files.

---

## Installation

### Step 1: Global Setup (once)

Clone the belmont repo and run the installer:

```bash
cd /path/to/belmont
./bin/install.sh
```

This creates a `belmont-install` symlink in `~/.local/bin/`. Make sure it's in your PATH:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
```

### Step 2: Per-Project Install

Navigate to your project and run:

```bash
cd ~/your-project
belmont-install
```

The installer will:

1. **Scan for AI tools** -- detects `.claude/`, `.codex/`, `.cursor/`, `.windsurf/`, `.gemini/`, `.github/`
2. **Ask which to install for** -- all detected, a specific one, or skip
3. **Sync agents** to `.agents/belmont/` (shared, tool-agnostic)
4. **Sync skills** to `.agents/skills/belmont/` (canonical location, shared across tools)
5. **Create symlinks** from each selected tool's native directory into `.agents/skills/belmont/`
6. **Clean stale files** -- if a skill was renamed or removed in source, the old file is deleted from the target
7. **Create `.belmont/`** directory with PRD.md and PROGRESS.md templates (if they don't exist)
8. **Offer to update `.gitignore`** for the `.belmont/` state directory

Example output:

```
Belmont Project Setup
=====================

Project: /Users/you/projects/my-app

Detected AI tools:
  [1] Claude Code (.claude/)
  [2] Codex (.codex/)
  [3] Cursor (.cursor/)

Install skills for:
  [a] All detected tools
  [1] Claude Code (.claude/) only
  [2] Codex (.codex/) only
  [3] Cursor (.cursor/) only
  [s] Skip (install agents only)

Choice [a]: a

Installing agents to .agents/belmont/...
  + prd-agent.md
  + codebase-agent.md
  + design-agent.md
  + implementation-agent.md
  + verification-agent.md
  + core-review-agent.md

Installing skills to .agents/skills/belmont/...
  + product-plan.md
  + tech-plan.md
  + implement.md
  + next.md
  + verify.md
  + status.md

Linking Claude Code...
  + .claude/commands/belmont -> ../../.agents/skills/belmont

Linking Codex...
  + .codex/belmont -> ../.agents/skills/belmont

Linking Cursor...
  + .cursor/rules/belmont/product-plan.mdc -> ../../../.agents/skills/belmont/product-plan.md
  + .cursor/rules/belmont/tech-plan.mdc -> ../../../.agents/skills/belmont/tech-plan.md
  + .cursor/rules/belmont/implement.mdc -> ../../../.agents/skills/belmont/implement.md
  + .cursor/rules/belmont/next.mdc -> ../../../.agents/skills/belmont/next.md
  + .cursor/rules/belmont/verify.mdc -> ../../../.agents/skills/belmont/verify.md
  + .cursor/rules/belmont/status.mdc -> ../../../.agents/skills/belmont/status.md

  + .belmont/PRD.md
  + .belmont/PROGRESS.md

Belmont installed!
```

If no AI tool directories are found, the installer asks which tool you want to set up and creates the directory for you.

---

## Supported Tools

Agents and skills are always installed to `.agents/` -- the single source of truth shared across all tools.

Each AI tool gets a **symlink** from its native directory into `.agents/skills/belmont/`:

| Tool               | Symlink                       | Target                          | How to Use                                                            |
|--------------------|-------------------------------|---------------------------------|-----------------------------------------------------------------------|
| **Claude Code**    | `.claude/commands/belmont`    | `→ .agents/skills/belmont`      | Slash commands: `/belmont:product-plan`, `/belmont:implement`, etc.   |
| **Codex**          | `.codex/belmont`              | `→ .agents/skills/belmont`      | Reference files in Codex                                              |
| **Cursor**         | `.cursor/rules/belmont/*.mdc` | `→ .agents/skills/belmont/*.md` | Toggle rules in Settings > Rules, or reference in Composer/Agent mode |
| **Windsurf**       | `.windsurf/rules/belmont`     | `→ .agents/skills/belmont`      | Reference rules in Cascade                                            |
| **Gemini**         | `.gemini/rules/belmont`       | `→ .agents/skills/belmont`      | Reference rules in Gemini                                             |
| **GitHub Copilot** | `.github/belmont`             | `→ .agents/skills/belmont`      | Reference files in Copilot Chat                                       |
| **Any other tool** | *(none)*                      | `.agents/skills/belmont/`       | Point your tool at the skill files directly                           |

Cursor requires `.mdc` extension, so individual file symlinks are created (e.g. `implement.mdc → implement.md`). All other tools use a directory symlink.

### Claude Code Usage

Skills become native slash commands:

```
/belmont:product-plan   Interactive PRD creation
/belmont:tech-plan      Technical implementation plan
/belmont:implement      Implement next milestone (full pipeline)
/belmont:next           Implement next single task (lightweight)
/belmont:verify         Run verification and code review
/belmont:status         View progress
/belmont:reset          Reset state and start fresh
```

### Codex Usage

Skills are installed as a symlink. To use them:

1. Open Codex in your project directory
2. Reference the skill files when prompting (e.g., *"Follow the belmont implement workflow"*)
3. Or point Codex at the skill file directly when starting a session

### Cursor Usage

Skills are installed as rules (`.mdc` files). To use them:

1. Open **Settings > Cursor Settings > Rules**
2. You'll see the belmont rules listed (product-plan, tech-plan, implement, next, verify, status)
3. Enable the one you want to activate
4. Start a Composer or Agent session -- the rule will be loaded as context
5. Or reference them directly: *"Follow the belmont implement workflow"*

In the **Cursor Agent CLI**, you can reference the skill files directly:

```bash
cursor agent --rules .cursor/rules/belmont/implement.mdc
```

### Generic / Other Tools

If your tool isn't auto-detected, the agent and skill files are still plain markdown. Point your tool at:

- **Skills**: Read from `.agents/belmont/` (or wherever you've placed them)
- **Agents**: `.agents/belmont/prd-agent.md`, `codebase-agent.md`, etc.
- **State**: `.belmont/PRD.md`, `.belmont/PROGRESS.md`, `.belmont/TECH_PLAN.md`, `.belmont/MILESTONE.md`

You can paste the skill content directly into a chat or configure your tool to load it as system context.

---

## Skills Reference

### `product-plan`

Interactive planning session. Creates the PRD and PROGRESS files.

- Asks clarifying questions one at a time until the plan is concrete
- Creates structured PRD with prioritized tasks (P0-P3)
- Organizes tasks into milestones in PROGRESS.md
- Includes Figma URLs, acceptance criteria, verification steps
- Does NOT implement anything -- plan mode only

**Output**: `.belmont/PRD.md`, `.belmont/PROGRESS.md`

### `tech-plan`

Technical planning session. Creates a detailed implementation specification.

- Requires an existing PRD (run plan first)
- Acts as a senior architect reviewing and refining the plan
- Loads Figma designs and extracts exact design tokens
- Produces concrete file structures, component skeletons, API types
- Maps PRD tasks to specific code sections
- Interactive Q&A until both you and the AI are confident

**Output**: `.belmont/TECH_PLAN.md`

### `implement`

Implements the next pending milestone from the PRD.

- Reads PROGRESS.md to find the first incomplete milestone
- Creates a **MILESTONE file** (`.belmont/MILESTONE.md`) with orchestrator context
- Runs 4 agents sequentially, each reading from and writing to the MILESTONE file:
  1. **Task Analysis** (prd-agent) -- Reads MILESTONE + PRD + TECH_PLAN, writes `## PRD Analysis`
  2. **Codebase Scan** (codebase-agent) -- Reads MILESTONE + TECH_PLAN + codebase, writes `## Codebase Analysis`
  3. **Design Analysis** (design-agent) -- Reads MILESTONE + TECH_PLAN + Figma, writes `## Design Specifications`
  4. **Implementation** (implementation-agent) -- Reads MILESTONE + TECH_PLAN, writes code + `## Implementation Log`
- After each task: marks it complete in PRD.md, updates PROGRESS.md
- After all milestone tasks: marks the milestone complete
- **Archives the MILESTONE file** (`MILESTONE-M2.done.md`) to keep context clean for next run
- Creates follow-up tasks (FWLUP) for out-of-scope issues discovered during implementation
- Handles blockers gracefully -- marks blocked tasks and skips to the next

### `next`

Implements just the next single pending task — a lightweight alternative to the full implement pipeline.

- Reads PROGRESS.md to find the first unchecked task in the first pending milestone
- Creates a **minimal MILESTONE file** with just the single task's context (skips analysis agents)
- Dispatches the single task to the `implementation-agent` as a sub-agent
- After the task is done: marks it complete in PRD.md and PROGRESS.md
- If it was the last task in the milestone, marks the milestone complete
- **Archives the MILESTONE file** after completion
- Creates follow-up tasks (FWLUP) for any out-of-scope issues

**Best for**: Follow-up tasks from verification, small fixes, well-scoped isolated work.
**Use `/belmont:implement` instead for**: Large tasks, first tasks in a milestone, tasks needing Figma analysis.

### `verify`

Runs verification and code review on all completed tasks.

- Runs two agents **in parallel**:
  - **Verification Agent** -- Checks acceptance criteria, Figma pixel comparison (Playwright headless), i18n text keys, edge cases, accessibility
  - **Core Review Agent** -- Runs build and test commands (auto-detects package manager: npm, pnpm, yarn, or bun), reviews code against project patterns, checks PRD alignment
- Both agents read the PRD, TECH_PLAN, and archived MILESTONE files for full context
- Categorizes issues: Critical / Warnings / Suggestions
- Creates follow-up tasks in PRD.md and PROGRESS.md for anything that needs fixing
- Produces a combined summary report

### `reset`

Reset belmont state to start a new planning session.

- Shows a summary of current state (feature name, task/milestone counts, completion status)
- Asks for explicit confirmation before resetting
- Resets PRD.md and PROGRESS.md to blank templates
- Deletes TECH_PLAN.md if it exists
- Does NOT touch agents, skills, or any source code

**Resets**: `.belmont/PRD.md`, `.belmont/PROGRESS.md`, `.belmont/TECH_PLAN.md`, `.belmont/MILESTONE.md`, `.belmont/MILESTONE-*.done.md`

### `status`

Read-only progress report. Does not modify any files.

Example output:

```
Belmont Status
==============

Feature: Chat Application Redesign

Tech Plan: ✅ Ready

Status: 🟡 In Progress

Tasks: 3 done, 1 blocked, 3 pending (of 7)

  ✅ P0-1: Set up project structure
  ✅ P0-2: Implement authentication flow
  ✅ P1-1: Create chat message component
  🔄 P1-2: Add real-time message updates
  🚫 P1-3: Implement file attachments
  ⬜ P2-1: Add emoji picker
  ⬜ P2-2: Dark mode support

Milestones:
  ✅ M1: Foundation
  ⬜ M2: Core Features
  ⬜ M3: Polish

Active Blockers:
  - P1-3: Figma design not accessible

Recent Activity:
---
Last completed: P1-1 - Create chat message component
```

---

## Full Workflow

### 1. Install

```bash
cd ~/projects/my-app
belmont-install
```

### 2. Plan

Start an interactive planning session. Describe what you want to build. The AI will ask clarifying questions, then write a structured PRD with prioritized tasks organized into milestones.

```
Claude Code:  /belmont:product-plan
Cursor:       Enable the belmont product-plan rule, then: "Let's plan a new feature"
Other:        Load skills/belmont/product-plan.md as context
```

**What happens:**
- You describe the feature
- AI asks questions one at a time (edge cases, dependencies, Figma URLs, etc.)
- You finalize the plan together
- AI writes `.belmont/PRD.md` and `.belmont/PROGRESS.md`

It is strongly recommended you read the PRD created yourself. You can manually make edits before tech plan/implementation or you can run `belmont:product-plan` again and tell it what to refine.

### 3. Tech Plan (recommended)

Have a senior architect agent review the PRD and produce a detailed technical plan. This step is optional but strongly recommended -- it produces the TECH_PLAN.md that guides the implementation agents.

You may add any additional context to the tech plan agent that you want to include.

```
Claude Code:  /belmont:tech-plan
Cursor:       Enable the belmont tech-plan rule, then: "Let's review the technical plan"
Other:        Load skills/belmont/tech-plan.md as context
```

**What happens:**
- AI reads the PRD and explores the codebase
- Interactive discussion about architecture, patterns, edge cases
- AI writes `.belmont/TECH_PLAN.md` with file structures, component specs, API types

### 4. Implement

Run the implementation pipeline. The AI finds the next incomplete milestone and works through each task using the 4-phase agent pipeline.

```
Claude Code:  /belmont:implement
Cursor:       Enable the belmont implement rule, then: "Implement the next milestone"
Other:        Load skills/belmont/implement.md as context
```

**What happens:**
1. Orchestrator creates `.belmont/MILESTONE.md` with task list and PRD context
2. `prd-agent` reads MILESTONE + PRD + TECH_PLAN, writes structured task summaries to MILESTONE
3. `codebase-agent` reads MILESTONE + TECH_PLAN, scans codebase, writes patterns to MILESTONE
4. `design-agent` reads MILESTONE + TECH_PLAN, loads Figma, writes design specs to MILESTONE
5. `implementation-agent` reads MILESTONE + TECH_PLAN, writes code, tests, verification, commits
6. PRD.md and PROGRESS.md are updated
7. MILESTONE file is archived (`MILESTONE-M2.done.md`)

**After all tasks in the milestone:**
- Milestone is marked complete in PROGRESS.md
- MILESTONE file is archived
- Summary is reported

### 5. Quick Fix (optional)

If verification created follow-up tasks or there's a small task to knock out, use `next` to implement just one task without the full pipeline overhead.

```
Claude Code:  /belmont:next
Cursor:       Enable the belmont next rule, then: "Implement the next task"
Other:        Load skills/belmont/next.md as context
```

**What happens:**
- Finds the next unchecked task in the current milestone
- Creates a minimal MILESTONE file with the task's context (skips analysis sub-agents)
- Dispatches the single task to the implementation agent
- Task is implemented, verified, committed, and marked complete
- MILESTONE file is archived
- Reports a brief summary

### 6. Verify

Run comprehensive verification on all completed work.

```
Claude Code:  /belmont:verify
Cursor:       Enable the belmont verify rule, then: "Verify the completed tasks"
Other:        Load skills/belmont/verify.md as context
```

**What happens:**
- Verification agent checks acceptance criteria, visual fidelity, i18n
- Core review agent runs build, tests, reviews code quality
- Issues become follow-up tasks in the PRD
- Combined report is produced

### 7. Check Progress

Check where things stand at any point.

```
Claude Code:  /belmont:status
Cursor:       Enable the belmont status rule, then: "Show belmont status"
Other:        Load skills/belmont/status.md as context
```

### 8. Iterate

After implementing a milestone:
- Run `/belmont:verify` to catch issues
- Run `/belmont:next` to quickly fix follow-up tasks from verification
- Run `/belmont:implement` again for the next milestone
- Run `/belmont:status` to check progress
- Continue until all milestones are complete

### 9. Start Fresh

When you're done with a feature and want to plan something new:

```
Claude Code:  /belmont:reset
Cursor:       Enable the belmont reset rule, then: "Reset belmont state"
Other:        Load skills/belmont/reset.md as context
```

**What happens:**
- Agent reads current state and shows what will be cleared (feature name, tasks, milestones)
- Asks for explicit "yes" confirmation
- Resets PRD.md and PROGRESS.md to blank templates
- Deletes TECH_PLAN.md
- Prompts you to start fresh with `/belmont:product-plan`

---

## Directory Structure

### Belmont Repository

```
belmont/
├── skills/
│   └── belmont/
│       ├── product-plan.md      # Planning skill
│       ├── tech-plan.md         # Tech plan skill
│       ├── implement.md         # Implementation skill (full milestone)
│       ├── next.md              # Next task skill (single task, lightweight)
│       ├── verify.md            # Verification skill
│       ├── status.md            # Status skill
│       └── reset.md             # Reset state skill
├── agents/
│   └── belmont/
│       ├── prd-agent.md         # Task analysis agent
│       ├── codebase-agent.md    # Codebase scanning agent
│       ├── design-agent.md      # Figma/design analysis agent
│       ├── implementation-agent.md  # Implementation agent
│       ├── verification-agent.md    # Verification agent
│       └── core-review-agent.md     # Code review agent
├── bin/
│   └── install.sh               # Installer script
└── README.md
```

### After Installing in a Project

```
your-project/
├── .agents/                     # Shared (committed to git)
│   ├── belmont/                 # Agent instructions
│   │   ├── prd-agent.md
│   │   ├── codebase-agent.md
│   │   ├── design-agent.md
│   │   ├── implementation-agent.md
│   │   ├── verification-agent.md
│   │   └── core-review-agent.md
│   └── skills/
│       └── belmont/             # Skills (canonical location)
│           ├── product-plan.md
│           ├── tech-plan.md
│           ├── implement.md
│           ├── next.md
│           ├── verify.md
│           ├── status.md
│           └── reset.md
├── .belmont/                    # Local state (gitignored)
│   ├── PRD.md
│   ├── PROGRESS.md
│   ├── TECH_PLAN.md
│   ├── MILESTONE.md             # Active milestone context (created during implement)
│   └── MILESTONE-M1.done.md     # Archived milestone (after completion)
├── .claude/                     # Claude Code (if selected)
│   └── commands/
│       └── belmont -> ../../.agents/skills/belmont   (symlink)
├── .codex/                      # Codex (if selected)
│   └── belmont -> ../.agents/skills/belmont   (symlink)
├── .cursor/                     # Cursor (if selected)
│   └── rules/
│       └── belmont/
│           ├── product-plan.mdc -> ../../../.agents/skills/belmont/product-plan.md
│           ├── tech-plan.mdc    -> ../../../.agents/skills/belmont/tech-plan.md
│           ├── next.mdc         -> ../../../.agents/skills/belmont/next.md
│           └── ...              (per-file symlinks, .mdc -> .md)
└── ...
```

**Key separation:**
- `.agents/belmont/` -- Shared agent instructions. Committed to git. Referenced by all tools.
- `.agents/skills/belmont/` -- Canonical skill files. Single source of truth.
- `.belmont/` -- Local planning state (PRD, PROGRESS, TECH_PLAN, MILESTONE). Gitignored. Per-developer.
- `.claude/`, `.codex/`, `.cursor/`, etc. -- Symlinks into `.agents/skills/belmont/`. No duplicate files.

---

## PRD & Progress Format

### PRD.md

Tasks use structured markdown with priority levels:

```markdown
# PRD: Feature Name

## Overview
Brief description of the feature.

## Problem Statement
What problem does this solve?

## Success Criteria (Definition of Done)
- [ ] Criterion 1
- [ ] Criterion 2

## Acceptance Criteria (BDD)

### Scenario: User logs in
Given a registered user
When they enter valid credentials
Then they see the dashboard

## Technical Approach
High-level implementation strategy.

## Tasks

### P0-1: Set up authentication ✅
**Severity**: CRITICAL
**Task Description**: Implement OAuth2 login flow
**Solution**: Use next-auth with Google provider
**Verification**: npm run test, manual login test

### P1-1: Create dashboard layout
**Severity**: HIGH
**Task Description**: Build the main dashboard page
**Figma**: https://figma.com/file/xxx/node-id=123
**Solution**: Responsive grid layout with sidebar
**Verification**: npm run build, visual comparison with Figma
```

### Task States

| Marker       | State     | Meaning                                                |
|--------------|-----------|--------------------------------------------------------|
| *(none)*     | Pending   | Not yet started                                        |
| `✅`          | Complete  | Task finished and verified                             |
| `🚫 BLOCKED` | Blocked   | Cannot proceed (missing info, Figma unavailable, etc.) |
| `🔵 FWLUP`   | Follow-up | Discovered during implementation or verification       |

### Priority Levels

| Priority | Severity | Meaning                               |
|----------|----------|---------------------------------------|
| P0       | CRITICAL | Must be done first, blocks other work |
| P1       | HIGH     | Core functionality                    |
| P2       | MEDIUM   | Important but not blocking            |
| P3       | LOW      | Nice to have                          |

### PROGRESS.md

Tracks milestones, session history, and blockers:

```markdown
# Progress: Feature Name

## Status: 🟡 In Progress

## Milestones

### ✅ M1: Foundation
- [x] P0-1: Set up authentication
- [x] P0-2: Database schema

### ⬜ M2: Core Features
- [ ] P1-1: Dashboard layout
- [ ] P1-2: User settings

## Session History
| Session | Date/Time           | Context Used    | Milestones Completed |
|---------|---------------------|-----------------|----------------------|
| 1       | 2026-02-05 10:00:00 | PRD + TECH_PLAN | M1                   |

## Blockers
[None currently]
```

---

## Agent Pipeline Details

All implementation agents communicate through the **MILESTONE file** (`.belmont/MILESTONE.md`). Each agent reads its context from the file and writes its output to a designated section. This eliminates the need for the orchestrator to pass large outputs between agents.

### Phase 1: Task Analysis (prd-agent)

**File**: `.agents/belmont/prd-agent.md` | **Model**: Sonnet

Reads the MILESTONE file, PRD, and TECH_PLAN to produce focused task summaries:
- Task ID, priority, description
- Acceptance criteria
- Figma URLs and design references
- Target files and dependencies
- Verification requirements
- Scope boundaries

**Writes to**: `## PRD Analysis` section of MILESTONE.md

### Phase 2: Codebase Scan (codebase-agent)

**File**: `.agents/belmont/codebase-agent.md` | **Model**: Sonnet

Reads the MILESTONE file and TECH_PLAN, then scans the project:
- Framework, language, styling, testing stack
- Project structure and conventions
- Related code, utilities, and type definitions
- CLAUDE.md rules (if present)
- Import patterns, error handling patterns, test patterns

**Writes to**: `## Codebase Analysis` section of MILESTONE.md

### Phase 3: Design Analysis (design-agent)

**File**: `.agents/belmont/design-agent.md` | **Model**: Sonnet

Reads the MILESTONE file and TECH_PLAN, then analyzes Figma designs when provided:
- Loads designs via Figma MCP
- Extracts exact colors, typography, spacing, effects
- Maps to existing design system components
- Identifies new components to create
- Produces implementation-ready component code

**Writes to**: `## Design Specifications` section of MILESTONE.md

**Blocking**: If Figma URLs are provided but fail to load, the task is blocked.

### Phase 4: Implementation (implementation-agent)

**File**: `.agents/belmont/implementation-agent.md` | **Model**: Opus

Reads the complete MILESTONE file (all previous phases' output) and TECH_PLAN:
- Types/interfaces first, then utilities, then components
- Follows project patterns from `## Codebase Analysis`
- Uses design specifications from `## Design Specifications` for UI code
- Writes unit tests
- Runs verification: `tsc`, `lint:fix`, `test`, `build`
- Commits to git with structured commit message
- Reports out-of-scope issues as follow-up tasks

**Writes to**: `## Implementation Log` section of MILESTONE.md

### Verification (verification-agent)

**File**: `.agents/belmont/verification-agent.md` | **Model**: Sonnet

Verifies implementations against requirements:
- Reads PRD, TECH_PLAN, and archived MILESTONE files for context
- Acceptance criteria pass/fail
- Visual comparison with Figma (Playwright headless)
- i18n key verification
- Functional testing (happy path, edge cases, accessibility)

### Code Review (core-review-agent)

**File**: `.agents/belmont/core-review-agent.md` | **Model**: Sonnet

Reviews code for quality and alignment:
- Reads PRD, TECH_PLAN, and archived MILESTONE files for context
- Runs build and test commands (auto-detects the project's package manager)
- Checks pattern adherence and CLAUDE.md compliance
- Verifies PRD/tech plan alignment
- Security and performance review
- Categorizes issues: critical, warnings, suggestions

---

## Updating Belmont

To update skills and agents in an existing project after pulling new changes to the belmont repo:

```bash
cd ~/your-project
belmont-install
```

The installer detects changes between the belmont source and your installed files:
- **New files** are copied
- **Changed files** are updated
- **Renamed/deleted files** are removed from the target (keeps installed tree exact)
- **Unchanged files** are skipped
- **Symlinks** are verified and updated if needed
- `.belmont/` state files (PRD, PROGRESS, TECH_PLAN) are always preserved

---

## Troubleshooting

### `belmont-install` command not found

Ensure `~/.local/bin` is in your PATH:

```bash
echo $PATH | tr ':' '\n' | grep local
# If missing:
export PATH="$HOME/.local/bin:$PATH"
```

Or re-run the global setup:

```bash
cd /path/to/belmont
./bin/install.sh
```

### No AI tools detected during install

If your project doesn't have a `.claude/`, `.codex/`, `.cursor/`, etc. directory yet, the installer will ask which tool you're using and create the directory for you.

### Skills not showing up in Claude Code

Verify the symlink exists and points to the right place:

```bash
ls -la .claude/commands/belmont
# Should show: belmont -> ../../.agents/skills/belmont

ls .agents/skills/belmont/
# Should list the .md skill files
```

If the symlink is missing or broken, re-run `belmont-install` and select Claude Code.

### Skills not showing up in Cursor

Cursor uses per-file symlinks with `.mdc` extension. Verify:

```bash
ls -la .cursor/rules/belmont/
# Should show .mdc symlinks pointing to .agents/skills/belmont/*.md
```

If you need to manually refresh, restart Cursor or reload the window.

### PRD is empty / template only

Run the product-plan skill first to create your PRD interactively. The tech-plan and implement skills require a populated PRD.

### Task marked as BLOCKED

Check `.belmont/PROGRESS.md` for blocker details. Common causes:
- Figma URL not accessible
- Missing context or dependencies
- Build/test failures that can't be auto-resolved

Fix the underlying issue, remove the `🚫 BLOCKED` marker from the task header in PRD.md, and re-run implement.

### Want to start fresh

Run the reset skill (`/belmont:reset` in Claude Code) to reset all state files. Alternatively, delete `.belmont/PRD.md`, `.belmont/PROGRESS.md`, `.belmont/TECH_PLAN.md`, `.belmont/MILESTONE.md`, and any `.belmont/MILESTONE-*.done.md` files manually, then re-run `belmont-install` to recreate templates.

---

## Requirements

- An AI coding tool (Claude Code, Codex, Cursor, Windsurf, Gemini, Copilot, or any tool that reads markdown)
- [figma-mcp](https://github.com/nichochar/figma-mcp) (recommended) -- enables Belmont to load Figma designs, extract design tokens, and perform visual verification
- No Docker required
- No Python required
- bash (for the installer only)
