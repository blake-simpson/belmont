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
# Development: compile without embedded files (dev mode)
go build ./cmd/belmont

# Development: run directly (requires --source for install)
go run ./cmd/belmont status --root /path/to/project
go run ./cmd/belmont tree
go run ./cmd/belmont find --name PRD --type file
go run ./cmd/belmont search --pattern "TECH_PLAN"
go run ./cmd/belmont install --source . --project /tmp/test-project --no-prompt

# Release build: compile with embedded skills/agents + version injection
./scripts/build.sh 0.2.0

# Or use the dev install script (builds + records source path)
./bin/install.sh --setup
```

**Important**: `go run` and plain `go build` do NOT embed skills/agents (they use the `!embed` build tag). The `install` command will fall back to source resolution (`--source` flag, `BELMONT_SOURCE` env, config file, or walking up from binary). Use `scripts/build.sh` to produce a release binary with embedded content.

There are no tests or linter configured. Verify changes by compiling (`go build ./cmd/belmont`) and manually testing commands.

## Release Process

```bash
# 1. Prepare release (generates changelog, commits, tags)
./scripts/release.sh 0.2.0

# 2. Push to trigger GitHub Actions
git push origin main --tags

# GitHub Actions will:
#   - Cross-compile for darwin-amd64, darwin-arm64, linux-amd64, linux-arm64, windows-amd64
#   - Generate SHA-256 checksums
#   - Create a GitHub Release with all binaries
```

## Architecture

Belmont is an agent-agnostic AI coding toolkit. It installs markdown-based **skills** (workflow prompts) and **agents** (sub-agent instructions) into any AI coding tool's project directory.

### Key directories

- `cmd/belmont/main.go` — Single-file Go CLI. All logic lives here (status parsing, tree/find/search, installer, updater). No external dependencies.
- `cmd/belmont/embed.go` — `//go:embed` directives for release builds (build tag: `embed`). Embeds `skills/` and `agents/` into the binary.
- `cmd/belmont/embed_dev.go` — Empty embed vars for dev builds (build tag: `!embed`). Allows `go run` without embedded content.
- `skills/belmont/` — Skill markdown files (product-plan, tech-plan, implement, next, verify, status, reset). These are the source-of-truth copied/linked into target projects.
- `agents/belmont/` — Agent instruction markdown files (codebase-agent, design-agent, implementation-agent, verification-agent, core-review-agent). Copied into target projects.
- `scripts/build.sh` — Copies skills/agents into `cmd/belmont/`, builds with `-tags embed` and ldflags version injection, then cleans up.
- `scripts/release.sh` — Generates CHANGELOG entry, commits, creates annotated git tag.
- `.github/workflows/release.yml` — GitHub Actions: cross-compile on tag push, create GitHub Release with binaries.
- `install.sh` (root) — Public curl-pipe-sh installer for end users.
- `bin/install.sh` / `bin/install.ps1` — Developer bootstrap scripts that build from source.

### How the installer works

`belmont install` syncs skills and agents into a target project. In release binaries, content is extracted from the embedded filesystem. In dev builds, it reads from a source directory.

1. **Embedded mode** (release binary, no `--source`): extracts from `embed.FS`
2. **Source mode** (`--source` flag or `BELMONT_SOURCE` env): reads from filesystem
3. Wires each detected AI tool to those canonical locations (symlinks for Cursor/Windsurf/Gemini/Copilot, copies for Claude Code/Codex)
4. For Codex installs, adds/updates a marked section in `AGENTS.md` that routes `belmont:<skill>` requests to local files
5. Removes legacy Belmont-managed root `SKILLS.md` (if present from older installs)
6. Creates `.belmont/` state directory with PRD.md and PROGRESS.md templates
7. Cleans stale files — if a skill was renamed/removed in source, the old file is deleted from the target

Source resolution order (source mode only): `--source` flag > `BELMONT_SOURCE` env > `~/.config/belmont/config.json` > walk up from CLI binary location.

### CLI commands

The Go CLI (`cmd/belmont/main.go`) provides: `install`, `update`, `status`, `tree`, `find`, `search`, `version`. All commands support `--format json` for machine-readable output. The `status` command parses `.belmont/PRD.md` and `.belmont/PROGRESS.md` to extract tasks, milestones, and blockers. The `update` command self-updates by downloading the latest release from GitHub.
