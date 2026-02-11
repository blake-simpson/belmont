# Contributing to Belmont

Thanks for your interest in contributing to Belmont! Pull requests are welcome for bug fixes, new features, documentation improvements, and new skills or agents.

## Getting Started

1. Fork and clone the repo:

```bash
git clone git@github.com:your-username/belmont.git
cd belmont
```

2. Make sure you have **Go 1.21+** installed.

3. Verify you can build:

```bash
go build ./cmd/belmont
```

> **Note:** `go build` and `go run` produce dev-mode binaries without embedded skills/agents. This is expected — see [Dev vs Release Builds](#dev-vs-release-builds) below.

## Development Workflow

### Running the CLI in dev mode

```bash
# Run commands directly
go run ./cmd/belmont status --root /path/to/project
go run ./cmd/belmont tree
go run ./cmd/belmont version

# Install skills into a project (requires --source since dev builds have no embedded files)
go run ./cmd/belmont install --source . --project ~/your-project --no-prompt
```

### Testing local skill/agent changes

The fastest way to iterate on skills or agents is the `--source` flag. Edit any file under `skills/` or `agents/`, then re-install into a real project:

```bash
# From the belmont repo root
go run ./cmd/belmont install --source . --project ~/your-project --no-prompt
```

This reads directly from your working tree — no rebuild, no git push, no release needed. Every time you save a skill file, re-run the command and the target project gets the update immediately.

**Tip:** Create an alias for faster iteration:

```bash
alias bdev="go run $(pwd)/cmd/belmont install --source $(pwd)"

# Then from any project directory:
bdev --project . --no-prompt
```

### Dev vs Release Builds

| | Dev build (`go build`) | Release build (`scripts/build.sh`) |
|---|---|---|
| Skills/agents embedded | No | Yes |
| `install` requires `--source` | Yes | No |
| Version info | `dev` | Injected (e.g. `0.2.0`) |
| Build tag | `!embed` | `embed` |

To produce a release-style build locally:

```bash
./scripts/build.sh          # version defaults to "dev"
./scripts/build.sh 0.3.0    # specific version

# Output goes to dist/
./dist/belmont-darwin-arm64 version
```

## Project Structure

```
belmont/
├── cmd/belmont/
│   ├── main.go          # All CLI logic (single file, no external deps)
│   ├── embed.go         # go:embed directives (release builds)
│   └── embed_dev.go     # Empty embed vars (dev builds)
├── skills/belmont/      # Skill markdown files (source of truth)
├── agents/belmont/      # Agent markdown files (source of truth)
├── scripts/
│   ├── build.sh         # Build with embedded content + version injection
│   └── release.sh       # Prepare release (changelog + tag)
├── install.sh           # Public curl|sh installer for end users
└── bin/
    ├── install.sh       # Dev installer (macOS/Linux)
    └── install.ps1      # Dev installer (Windows)
```

## Making Changes

### Skills and Agents

Skills live in `skills/belmont/` and agents in `agents/belmont/`. These are plain markdown files — edit them directly and test with `--source` as described above.

### CLI (Go code)

All CLI logic is in `cmd/belmont/main.go`. There are no external dependencies. After making changes, verify it compiles:

```bash
go build ./cmd/belmont
```

There is no test suite or linter configured. Verify changes by compiling and manually testing the relevant commands.

### Documentation

If your change affects CLI behavior, installation, or usage, update the README accordingly.

## Submitting a Pull Request

1. Create a feature branch from `main`:

```bash
git checkout -b my-feature
```

2. Make your changes and verify they compile.

3. Test the affected commands manually.

4. Commit with a clear message describing the change.

5. Push and open a PR against `main`.

### What makes a good PR

- **Focused** — one logical change per PR.
- **Tested** — you've verified the change works (compile + manual testing).
- **Documented** — README updated if user-facing behavior changed.
- **Small** — easier to review, faster to merge.

## Release Process

Releases are cut by maintainers:

```bash
# 1. Prepare release (generates changelog, commits, tags)
./scripts/release.sh 0.3.0

# 2. Push to trigger GitHub Actions
git push origin main --tags
```

GitHub Actions cross-compiles for darwin/linux/windows (amd64 + arm64), generates checksums, and creates a GitHub Release.

## Questions?

Open an issue if something is unclear or you want to discuss a feature idea before writing code.
