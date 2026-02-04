# Ralph CLI Toolkit

A CLI toolkit for running autonomous coding sessions with Claude. Ralph manages a PRD (Product Requirements Document) and tracks progress across multiple implementation iterations, supporting both local and Docker sandbox execution.

Based on the original work by Matt Pocock: [https://www.aihero.dev/getting-started-with-ralph](https://www.aihero.dev/getting-started-with-ralph)

## Quick Start

```bash
# One-time setup
cd /Users/blake/code/sandbox/ralph
./bin/ralph-setup

# Start a new project
cd ~/your-project
ralph-init               # Create Docker sandbox for this project
ralph-clear              # Reset PRD and progress
ralph-plan               # Create PRD interactively with Claude
ralph-once               # Test one task locally
ralph-afk 10             # Run 10 iterations in Docker sandbox
```

## Installation

Run the setup script:

```bash
cd /Users/blake/code/sandbox/ralph
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
Initialize a Docker sandbox for the current project. Run once per project before using `ralph-afk`.

- Creates a sandbox named `claude-<project-folder-name>`
- Prompts you to log in to Claude inside the sandbox
- Must be run from within your project directory

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

### `ralph-once`
Run a single task implementation locally. Good for testing before going AFK.

- Uses `--permission-mode acceptEdits`
- Implements one task from PRD.md (highest priority first)
- Updates PRD.md marking task complete with ✅
- Updates PROGRESS.md with session history

```bash
ralph-once
```

### `ralph-afk <iterations> [--loud]`
Run multiple iterations in Docker sandbox. The main AFK mode.

- Runs in project-specific Docker sandbox (`claude-<project-name>`)
- Each iteration implements one task from PRD.md
- Stops early if all tasks complete or a task is blocked
- Tracks active tasks in `~/.local/ralph-active.json`

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

Milestones:
  ✅ M1: Core functionality
  ⬜ M2: Enhanced features

Recent Activity:
---
Last completed: P1-1 - Create chat message component
Working on: P1-2: Add real-time message updates

Recent decisions:
  - Chose WebSocket over polling for real-time
  - Using React Query for state management
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
2. **Initialize** sandbox (once per project): `ralph-init`
3. **Clear** previous state: `ralph-clear`
4. **Plan** interactively: `ralph-plan`
5. **Test** locally: `ralph-once`
6. **Go AFK**: `ralph-afk 20`

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

# Check what was planned
ralph-status

# Test one iteration locally to verify setup
ralph-once

# Verify it worked
git log -1
ralph-status

# Go AFK - Claude works autonomously
ralph-afk 15
```

### Checking Progress

While AFK mode is running (or after):

```bash
ralph-status              # Quick summary with task states
cat ~/.local/PRD.md       # Full PRD with task details
cat ~/.local/PROGRESS.md  # Session history and decisions
git log --oneline -10     # See commits
```

## Directory Structure

```
/Users/blake/code/sandbox/ralph/
├── bin/
│   ├── ralph-init
│   ├── ralph-plan
│   ├── ralph-once
│   ├── ralph-afk
│   ├── ralph-clear
│   ├── ralph-status
│   ├── ralph-setup
│   └── ralph-configure-mcp
└── README.md

~/.local/
├── PRD.md              # Task definitions (markdown)
├── PROGRESS.md         # Session history and status
├── ralph-active.json   # Currently running tasks
└── bin/
    ├── ralph-plan -> /Users/blake/code/sandbox/ralph/bin/ralph-plan
    ├── ralph-once -> ...
    └── ...

~/.ralph/
└── config              # FIGMA_TOKEN and other settings
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

## Open Questions
- Which WebSocket library to use?

## Clarifications
- Using socket.io for WebSocket (decided during planning)

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

### Priority Levels
- **P0 (CRITICAL)**: Must be done first, blockers for other work
- **P1 (HIGH)**: Core functionality
- **P2 (MEDIUM)**: Important but not blocking
- **P3 (LOW)**: Nice to have

## PROGRESS.md Format

```markdown
# Progress: Chat Application Redesign

## Status: 🟡 In Progress

## PRD Reference
~/.local/PRD.md

## Milestones

### ✅ M1: Foundation
- [x] WebSocket setup
- [x] Auth integration

### ⬜ M2: Core Features
- [x] Message component
- [ ] Real-time sync
- [ ] File attachments

## Definition of Done Checklist
- [x] WebSocket connected
- [ ] All tests pass
- [ ] Figma parity verified

## Session History
| Session | Date | Context Used | Tasks Completed |
|---------|------|--------------|-----------------|
| 1 | 2026-02-04 | PRD + Figma | P0-1 |
| 2 | 2026-02-04 | PRD + socket.io docs | P1-1 |

## Decisions Log
1. Using socket.io over raw WebSocket for reconnection handling
2. Optimistic UI updates for better perceived performance
3. React Query for server state management

## Blockers
- P1-2: Figma file access revoked, need new link from design team
```

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
2. Review `~/.local/PROGRESS.md` Blockers section
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
- **Git safety**: PRD.md and PROGRESS.md should be in .gitignore
- **Voice feedback**: Use `--loud` flag for audio notifications when AFK
- **Project sandboxes**: Each project gets its own sandbox for isolation
- **Handle blocks**: Check status after `ralph-afk` exits - exit code 2 means blocked

## Requirements

- Claude CLI (`claude` command available)
- Docker Desktop with sandbox support
- Python 3 (for `ralph-status` parsing)
- macOS (for `say` command with `--loud` flag, optional)
