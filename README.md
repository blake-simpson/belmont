# Ralph CLI Toolkit

A CLI toolkit for running autonomous coding sessions with Claude. Ralph manages a PRD (Product Requirements Document), orchestrates specialized sub-agents, and tracks progress across multiple implementation iterations.

Based on the original work by Matt Pocock: [https://www.aihero.dev/getting-started-with-ralph](https://www.aihero.dev/getting-started-with-ralph)

## Quick Start

```bash
# One-time setup
cd /path/to/ralph
./bin/ralph-setup

# Start a new project
cd ~/your-project
ralph-init               # Initialize .ralph directory and Docker sandbox
ralph-clear              # Reset PRD and progress
ralph-plan               # Create PRD interactively with Claude
ralph-tech-plan          # Create technical implementation plan
ralph-once               # Test one task locally
ralph-afk 10             # Run 10 iterations in Docker sandbox
```

## Architecture

Ralph uses a multi-agent pipeline to implement tasks. The orchestrator coordinates specialized sub-agents that each handle a specific part of the workflow.

### Agent Pipeline

#### Phase 1 - Sequential Execution

| Order | Agent | Model | Purpose |
|-------|-------|-------|---------|
| 1 | prd-agent | Sonnet | Analyze task from PRD/TECH_PLAN |
| 2 | codebase-agent | Sonnet | Scan codebase for patterns and context |
| 3 | design-agent | Opus | Analyze Figma designs, extract UI specs |
| 4 | implementation-agent | Opus | Implement the task, write tests, commit |

#### Phase 2 - Parallel Execution

| Agent | Model | Purpose |
|-------|-------|---------|
| verification-agent | Sonnet | Verify implementation meets requirements |
| code-review-agent | Sonnet | Review code quality and PRD alignment |

The **ralph-orchestrator** (Opus) coordinates all agents, manages the PRD/PROGRESS files, and handles blockers.

### Agent Responsibilities

- **prd-agent**: Reads the PRD and TECH_PLAN, extracts the current task, and produces a focused summary for downstream agents
- **codebase-agent**: Scans the codebase to find existing patterns, utilities, and conventions relevant to the task
- **design-agent**: Loads Figma designs (if provided), extracts design tokens, and produces implementation-ready component code
- **implementation-agent**: Implements the task using all previous agent outputs, writes tests, runs verification, and commits
- **verification-agent**: Verifies the implementation meets acceptance criteria, runs build/tests, checks visual fidelity
- **code-review-agent**: Reviews code quality, pattern adherence, and PRD alignment

## Installation

Run the setup script:

```bash
cd /path/to/ralph
./bin/ralph-setup
```

This will:
1. Create `~/.local/bin` directory (if needed)
2. Create symlinks for all ralph commands
3. Create `~/.ralph/` config directory
4. Optionally configure your Figma token

Make sure `~/.local/bin` is in your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add this line to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) for persistence.

## Commands

### `ralph-init`
Initialize a Docker sandbox and `.ralph` directory for the current project. Run once per project.

- Creates `.ralph/` directory with PRD.md, PROGRESS.md templates
- Creates a sandbox named `claude-<project-folder-name>`
- Prompts you to log in to Claude inside the sandbox
- Optionally adds `.ralph/` to `.gitignore`

```bash
cd ~/your-project
ralph-init
```

### `ralph-plan`
Interactive planning session with Claude. Runs **locally** (not in sandbox) for interactive PRD creation.

- Uses `--permission-mode plan` for safe exploration
- Guides you through defining tasks with iterative Q&A
- Creates structured markdown PRD with prioritized tasks (P0, P1, P2, P3)
- Includes Figma URLs, acceptance criteria, and verification steps

```bash
cd ~/your-project
ralph-plan
```

### `ralph-tech-plan`
Creates a detailed implementation specification. Runs **locally** with interactive Q&A.

- Requires an existing PRD (run `ralph-plan` first)
- Acts as a senior architect planning the entire implementation
- Loads Figma designs and extracts exact design tokens (colors, spacing, typography)
- Produces concrete file structures, component skeletons, and API types
- Maps PRD tasks to specific code sections
- The tech plan is automatically loaded by `ralph-afk` and `ralph-once`

```bash
ralph-tech-plan
```

**What it produces:**
- PRD task mapping to code sections
- Exact file structure with paths and descriptions
- Design tokens extracted from Figma (hex colors, px values, font specs)
- Component specifications with TypeScript interfaces and skeleton code
- API integration details with types and function signatures
- List of existing components to reuse
- State management approach
- Verification checklist per component
- Edge cases and error handling
- Implementation order mapped to PRD tasks

### `ralph-once`
Run a single task implementation locally. Good for testing before going AFK.

- Uses `--permission-mode acceptEdits`
- Triggers the full agent pipeline for one task
- Implements highest priority incomplete task from PRD.md
- Updates PRD.md marking task complete with ✅
- Updates PROGRESS.md with session history

```bash
ralph-once
```

### `ralph-afk <iterations> [--loud]`
Run multiple iterations in Docker sandbox. The main AFK mode.

- Runs in project-specific Docker sandbox (`claude-<project-name>`)
- Each iteration triggers the full agent pipeline for one task
- Stops early if all tasks complete or a task is blocked
- Tracks active tasks in `.ralph/ralph-active.json`

```bash
ralph-afk 10           # Run up to 10 iterations
ralph-afk 50 --loud    # Run with voice announcements
```

**Options:**
- `--loud` - Enable voice announcements (macOS `say` command)

**Exit codes:**
- `0` - All tasks completed successfully
- `2` - Blocked on a task (Figma unavailable, missing context, etc.)

### `ralph-clear`
Reset PRD.md and PROGRESS.md to start fresh with template structure.

```bash
ralph-clear
```

### `ralph-status`
Show task completion summary without invoking Claude.

```bash
ralph-status
```

Example output:
```
Ralph Status
============

Feature: Chat Application Redesign

Status: 🟡 In Progress

Tasks: 3 done, 1 in progress, 1 blocked, 2 pending (of 7)

  ✅ P0-1: Set up project structure
  ✅ P0-2: Implement authentication flow
  ✅ P1-1: Create chat message component
  🔄 P1-2: Add real-time message updates
  🚫 P1-3: Implement file attachments
  ⬜ P2-1: Add emoji picker
  ⬜ P2-2: Dark mode support

In Progress: 1 task(s)
  • P1-2: Add real-time message updates...
    Started: 2026-02-04T14:32:00 | PID: 12345 | Sandbox: claude-my-app

Active Blockers:
  - P1-3: Figma design not accessible

Recent Activity:
---
Last completed: P1-1 - Create chat message component
Working on: P1-2: Add real-time message updates
```

### `ralph-setup`
One-time setup script. Creates symlinks and config directory.

```bash
./bin/ralph-setup
```

### `ralph-configure-mcp`
Configure Figma MCP inside Docker sandbox. Run once after sandbox creation.

```bash
ralph-configure-mcp
```

## Configuration

Configuration is stored in `~/.ralph/config`:

```bash
# Ralph configuration
FIGMA_TOKEN=your-figma-personal-access-token
```

The Figma token is:
- Used by `ralph-configure-mcp` to set up the Figma MCP server
- Passed to Docker sandbox via environment variable

## Workflow

### Starting a New Project Cycle

1. **Navigate** to your project directory
2. **Initialize** (once per project): `ralph-init`
3. **Clear** previous state: `ralph-clear`
4. **Plan** interactively: `ralph-plan`
5. **Technical review** (recommended): `ralph-tech-plan`
6. **Test** locally: `ralph-once`
7. **Go AFK**: `ralph-afk 20`

### Typical Session

```bash
cd ~/projects/my-app

# First time only: create sandbox and login
ralph-init
# When Claude starts, run /login, complete auth, then /exit

# Start fresh
ralph-clear

# Interactive planning - Claude asks questions, you provide requirements
ralph-plan
# ... describe your features, provide Figma URLs, etc.

# Technical review - Claude challenges and refines the plan
ralph-tech-plan
# ... discuss architecture, security, performance, edge cases

# Check what was planned
ralph-status

# Test one iteration locally to verify setup
ralph-once

# Verify it worked
git log -1
ralph-status

# Go AFK - Claude works autonomously with the agent pipeline
ralph-afk 15
```

### Checking Progress

While AFK mode is running (or after):

```bash
ralph-status                    # Quick summary with task states
cat .ralph/PRD.md               # Full PRD with task details
cat .ralph/PROGRESS.md          # Session history and decisions
cat .ralph/TECH_PLAN.md         # Technical guidelines (if created)
git log --oneline -10           # See commits
```

## Directory Structure

```
/path/to/ralph/
├── .agents/
│   ├── ralph-executor.md       # Orchestrator agent
│   ├── prd-agent.md            # Task analysis agent
│   ├── codebase-agent.md       # Codebase scanning agent
│   ├── design-agent.md         # Figma/design analysis agent
│   ├── implementation-agent.md # Implementation agent
│   ├── verification-agent.md   # Verification agent
│   └── code-review-agent.md    # Code review agent
├── bin/
│   ├── ralph-init
│   ├── ralph-plan
│   ├── ralph-tech-plan
│   ├── ralph-prompt            # Shared prompt templates
│   ├── ralph-once
│   ├── ralph-afk
│   ├── ralph-clear
│   ├── ralph-status
│   ├── ralph-setup
│   └── ralph-configure-mcp
└── README.md

~/.local/bin/
├── ralph-plan -> /path/to/ralph/bin/ralph-plan
├── ralph-once -> ...
└── ...

~/.ralph/
└── config                      # FIGMA_TOKEN and other settings

~/your-project/.ralph/          # Per-project state (created by ralph-init)
├── PRD.md                      # Task definitions (markdown)
├── PROGRESS.md                 # Session history and status
├── TECH_PLAN.md                # Technical guidelines (optional)
└── ralph-active.json           # Currently running tasks
```

## PRD Format

The PRD.md file uses structured markdown with prioritized tasks:

```markdown
# PRD: Chat Application Redesign

## Overview
Redesign the chat interface with real-time messaging support.

## Problem Statement
Current chat lacks real-time updates and modern UX.

## Success Criteria (Definition of Done)
- [ ] All messages sync in real-time
- [ ] UI matches Figma designs
- [ ] All tests pass

## Acceptance Criteria (BDD)

### Scenario: Send Message
Given I am logged in
And I am in a chat room
When I type a message and press Enter
Then the message appears immediately
And other users see it within 1 second

## Technical Approach
WebSocket-based real-time sync with optimistic UI updates.

## Out of Scope
- Video calling
- Message encryption

---

## Technical Tasks

### P0-1: Set up WebSocket connection ✅
**Severity**: CRITICAL
**File**: src/lib/socket.ts

**Problem**: No real-time communication layer exists

**Solution**: Implement socket.io client with reconnection logic

**Verification**:
1. `npm run lint:fix`
2. `npx tsc --noEmit`
3. Verify connection in browser devtools

### P1-1: Create message component
**Severity**: HIGH
**File**: src/components/Message.tsx
**Figma**: https://figma.com/file/xxx/node-id=123

**Problem**: Need pixel-perfect message bubbles

**Solution**: Build component matching Figma spec exactly

**Verification**:
1. `npm run lint:fix`
2. `npm run test`
3. Visual comparison with Figma

### P1-2: File attachments 🚫 BLOCKED
**Severity**: HIGH
**Figma**: https://figma.com/file/xxx/node-id=456

**Blocked**: Figma design not accessible - need updated link
```

### Task States
- No marker = Pending
- `✅` in header = Completed
- `🚫 BLOCKED` in header = Blocked (cannot proceed)
- `🔵` with `FWLUP` = Follow-up task (discovered during implementation)

### Priority Levels
- **P0 (CRITICAL)**: Must be done first, blockers for other work
- **P1 (HIGH)**: Core functionality
- **P2 (MEDIUM)**: Important but not blocking
- **P3 (LOW)**: Nice to have

## Agent Communication Protocol

Sub-agents communicate via structured XML output:

```xml
<agent-output>
<status>SUCCESS|BLOCKED|PARTIAL|...</status>
<task-id>P0-1</task-id>
<!-- agent-specific fields -->
<report>
[Markdown report content]
</report>
</agent-output>
```

### Status Handling

| Status | Action |
|--------|--------|
| SUCCESS | Proceed to next agent/phase |
| BLOCKED | Stop workflow, update files, report |
| PARTIAL | Evaluate if can proceed, may need to stop |
| FAILED | Treat as BLOCKED |

## Troubleshooting

### Commands not found
Ensure `~/.local/bin` is in your PATH:
```bash
echo $PATH | grep -q ".local/bin" || echo "Add ~/.local/bin to PATH"
```

### Docker sandbox issues
- Verify Docker Desktop is running
- Check sandbox exists: `docker sandbox ls`
- Sandbox names are project-specific: `claude-<project-folder>`
- Recreate if needed: `docker sandbox rm claude-myproject && ralph-init`
- Re-run `ralph-configure-mcp` after recreating

### Sandbox not found
If `ralph-afk` fails with "Sandbox not found":
```bash
ralph-init    # Creates sandbox for current project
```

### Sandbox not logged in
If `ralph-configure-mcp` or `ralph-afk` fails with "Invalid API key" or "Please run /login":
1. Run an interactive session: `docker sandbox run claude-<project-name>`
2. Inside Claude, run `/login` and complete authentication
3. Exit with `/exit`
4. Retry your command

### Figma MCP not working
1. Verify token is set: `grep FIGMA_TOKEN ~/.ralph/config`
2. Ensure sandbox is logged in (see above)
3. Re-run configuration: `ralph-configure-mcp`
4. Verify MCP is configured: `docker sandbox exec claude claude mcp list`

### Task blocked unexpectedly
If a task gets marked as 🚫 BLOCKED:
1. Check `ralph-status` for blocker details
2. Review `.ralph/PROGRESS.md` Blockers section
3. Fix the issue (e.g., update Figma URL, add missing context)
4. Remove the 🚫 BLOCKED marker from the task header in PRD.md
5. Resume with `ralph-afk` or `ralph-once`

### PRD.md issues
- Run `ralph-clear` to reset with fresh template
- Use `ralph-status` to validate current state
- Check for markdown syntax errors in task headers

## Tips

- **Start small**: Use `ralph-once` to test before `ralph-afk`
- **Check progress**: Run `ralph-status` periodically
- **Incremental planning**: You can run `ralph-plan` multiple times to add tasks
- **Git safety**: `.ralph/` should be in .gitignore (ralph-init offers to add it)
- **Voice feedback**: Use `--loud` flag for audio notifications when AFK
- **Project sandboxes**: Each project gets its own sandbox for isolation
- **Handle blocks**: Check status after `ralph-afk` exits - exit code 2 means blocked
- **Follow-up tasks**: Agents may create FWLUP tasks for out-of-scope issues discovered during implementation

## Requirements

- Claude CLI (`claude` command available)
- Docker Desktop with sandbox support
- Python 3 (for task parsing in scripts)
- macOS (for `say` command with `--loud` flag, optional)
