# Changelog

## v0.2.0

**Released:** 2026-02-11

### Changes

- Re-build Belmont binary + installation process. Allow for seamless updates.
- Stop status trying to find local version of .bin
- Update README
- Improved handling of Claude + Codex in same project
- Move installer to go, Add windows support, Add helpers, Update docs
- Fixes for Codex install
- Belmont guardrails and testing
- Refine sub-agent workflow
- Remove DoD from progress file
- Allow Belmont to take advantage of agent teams/swarms when avaialable
- Move to milestones file to help save context
- Allow Belmont to work with other package managers
- Add Codex support
- Specify Claude models for sub-agents
- Prevent overwrite of existing plan
- Belmont V1
- Updates
- Allow easy addition of ralph executors to host project
- New multi-agent based workflow - testing for results + token usage
- Attempt build without sub-agent to test difference in output/token use
- Add Playwright MCP in headless mode to sandbox for UI verification
- testing more prompt changes
- More refinements. Simplify PRD. Favour tech plan to save context.
- make skills loading more generic and focused. Allow model to decide.
- Fix AFK logic
- Refactor system to use local project directory
- sub-agent updates
- Add tech plan review stage
- Fixes to status command
- Add escape hatch
- Updated PRD + Progress formats
- Initial ralph setup



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