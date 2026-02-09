# AGENTS

This file provides guidance to Ai Agents when working with code in this repository.

## Notes
- When updating code, always ensure the README is up to date with the new changes/paths etc.
- When changing the Go code, always run the compiler after to test + rebuild the file

## Verify
- Try to verify your work after changes are made.
- If required, create a test directory and install to it to test your changes, symlinks, etc.

## Build & Run

```bash
# Build the CLI (installs to ~/.local/bin/belmont)
go build -o ~/.local/bin/belmont ./cmd/belmont

# Or use the install script (builds + records source path)
./bin/install.sh --setup

# Run directly during development
go run ./cmd/belmont status --root /path/to/project
go run ./cmd/belmont tree
go run ./cmd/belmont find --name PRD --type file
go run ./cmd/belmont search --pattern "TECH_PLAN"
go run ./cmd/belmont install --source . --project /tmp/test-project --no-prompt
```

There are no tests or linter configured. Verify changes by compiling (`go build ./cmd/belmont`) and manually testing commands.

## Architecture

Belmont is an agent-agnostic AI coding toolkit. It installs markdown-based **skills** (workflow prompts) and **agents** (sub-agent instructions) into any AI coding tool's project directory.

### Key directories

- `cmd/belmont/main.go` — Single-file Go CLI. All logic lives here (status parsing, tree/find/search, installer). No external dependencies.
- `skills/belmont/` — Skill markdown files (product-plan, tech-plan, implement, next, verify, status, reset). These are the source-of-truth copied/linked into target projects.
- `agents/belmont/` — Agent instruction markdown files (codebase-agent, design-agent, implementation-agent, verification-agent, core-review-agent). Copied into target projects.
- `bin/install.sh` / `bin/install.ps1` — Bootstrap scripts that build the Go CLI and run `belmont install`.
- `codex/SKILLS.md` — Codex-specific skill index, installed to project root when Codex is selected.

### How the installer works

`belmont install` syncs skills and agents from this repo into a target project:
1. Copies agents to `.agents/belmont/` and skills to `.agents/skills/belmont/`
2. Wires each detected AI tool to those canonical locations (symlinks for Cursor/Windsurf/Gemini/Copilot, copies for Claude Code/Codex)
3. Creates `.belmont/` state directory with PRD.md and PROGRESS.md templates
4. Cleans stale files — if a skill was renamed/removed in source, the old file is deleted from the target

Source resolution order: `--source` flag > `BELMONT_SOURCE` env > `~/.config/belmont/config.json` > walk up from CLI binary location.

### CLI commands

The Go CLI (`cmd/belmont/main.go`) provides: `install`, `status`, `tree`, `find`, `search`, `version`. All commands support `--format json` for machine-readable output. The `status` command parses `.belmont/PRD.md` and `.belmont/PROGRESS.md` to extract tasks, milestones, and blockers.
