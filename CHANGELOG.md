# Changelog

## v0.2.0

**Released:** 2026-02-11

### Highlights

- **Single-command install**: `curl -fsSL https://raw.githubusercontent.com/blake-simpson/belmont/main/install.sh | sh`
- **Self-updating binary**: `belmont update` downloads the latest release from GitHub
- **Embedded skills/agents**: Release binaries include all skills and agents — no source directory needed
- **Version info**: `belmont version` now shows version, commit SHA, and build date
- **Release automation**: GitHub Actions builds cross-platform binaries on tag push

### Changes

- Added `//go:embed` support — release binaries embed all skills and agents
- Added `belmont update` command with `--check` and `--force` flags
- Added `scripts/build.sh` for building release binaries with embedded content
- Added `scripts/release.sh` for preparing releases (changelog + tag)
- Added `.github/workflows/release.yml` for CI-driven cross-platform builds
- Added `install.sh` (root) — public curl-pipe-sh installer
- Added version injection via ldflags (`Version`, `CommitSHA`, `BuildDate`)
- Modified `belmont install` to use embedded files when no `--source` is specified
- Modified `belmont version` to show version, commit, and build date

## v0.1.0

**Released:** 2025-01-01

### Initial Release

- Go CLI with `install`, `status`, `tree`, `find`, `search`, `version` commands
- Agent-agnostic installer supporting Claude Code, Codex, Cursor, Windsurf, Gemini, and GitHub Copilot
- Markdown-based skills and agents for structured AI coding sessions
- PRD and PROGRESS tracking with milestone support
