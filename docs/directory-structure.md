# Directory Structure

## Belmont Repository

```
belmont/
├── cmd/
│   └── belmont/
│       ├── main.go              # Go CLI entrypoint, most CLI logic
│       ├── local_llms.go        # Pi provider/model tier resolution chain
│       ├── embed.go             # go:embed directives (release builds)
│       ├── embed_dev.go         # Empty embed vars (dev builds)
│       ├── process_unix.go      # Process-group signalling (//go:build !windows)
│       ├── process_windows.go   # Process-group signalling (//go:build windows)
│       └── *_test.go            # Unit tests (nine files) — run by CI
├── go.mod
├── skills/
│   └── belmont/
│       ├── _partials/           # Shared content blocks for templates
│       ├── _src/                # Skill templates with @include directives
│       │   └── references/      # Progressive-disclosure detail, source
│       ├── references/          # Detail loaded on demand by skills (generated)
│       ├── product-plan.md      # Planning skill (generated)
│       ├── tech-plan.md         # Tech plan skill (generated)
│       ├── codex-plan-apply.md  # Codex plan-mode handoff apply skill (generated)
│       ├── implement.md         # Implementation skill (generated)
│       ├── next.md              # Next task skill (generated)
│       ├── verify.md            # Verification skill (generated)
│       ├── working-backwards.md  # Working backwards skill (generated)
│       ├── debug.md             # Debug router (generated)
│       ├── debug-auto.md       # Auto debug loop (generated)
│       ├── debug-manual.md     # Manual debug loop (generated)
│       ├── status.md            # Status skill
│       ├── review-plans.md      # Alignment review skill
│       ├── cleanup.md           # Archive completed features, reduce bloat
│       └── reset.md             # Reset state skill
├── agents/
│   └── belmont/
│       ├── codebase-agent.md    # Codebase scanning agent
│       ├── design-agent.md      # Figma/design analysis agent
│       ├── implementation-agent.md  # Implementation agent (inherits session model; pin via models.yaml)
│       ├── verification-agent.md    # Verification agent
│       ├── code-review-agent.md     # Code review agent
│       └── reconciliation-agent.md  # Merge-conflict resolution agent (auto mode runs this at the high tier)
├── scripts/
│   ├── build.sh                 # Build with embedded content + version injection
│   ├── release.sh               # Prepare release (changelog + tag)
│   └── generate-skills.sh      # Generate skills from templates + partials
├── .github/
│   └── workflows/
│       ├── ci.yml               # Build, test, vet, staticcheck, generators, 5-platform
│       └── release.yml          # Cross-compile + publish on tag push
├── install.sh                   # Public installer (curl | sh)
├── bin/
│   ├── install.sh               # Dev installer (macOS/Linux)
│   └── install.ps1              # Dev installer (Windows)
├── docs/                        # Documentation
├── CHANGELOG.md
└── README.md
```

## After Installing in a Project

```
your-project/
├── .agents/                     # Shared (committed to git)
│   ├── belmont/                 # Agent instructions
│   │   ├── codebase-agent.md
│   │   ├── design-agent.md
│   │   ├── implementation-agent.md
│   │   ├── verification-agent.md
│   │   └── code-review-agent.md
│   └── skills/
│       └── belmont/             # Skills (canonical location, agentskills.io folder layout)
│           ├── implement/
│           │   ├── SKILL.md
│           │   ├── references/  # Progressive-disclosure detail (loaded on demand)
│           │   └── agents/
│           │       └── openai.yaml   # Codex UI metadata (if Codex selected) — display_name "belmont:implement"
│           ├── verify/
│           │   └── SKILL.md  (+ references/, agents/openai.yaml)
│           └── ...              # one folder per skill: working-backwards, product-plan, tech-plan,
│                                # next, debug, debug-auto, debug-manual, status, review-plans,
│                                # repair, codex-plan-apply, note, cleanup, reset
│                                # (loop is here only when Codex is selected — see below)
├── .belmont/                    # Planning & state (commit to share with team)
│   ├── PR_FAQ.md
│   ├── PRD.md                   # Living spec (no status markers — purely requirements)
│   ├── PROGRESS.md              # Single source of truth for all state (task checkboxes, milestones)
│   ├── TECH_PLAN.md
│   ├── worktree.json            # Optional: setup/teardown hooks, env, monorepo workspace overrides
│   ├── features/                # Sub-feature directories (optional)
│   │   └── <feature-slug>/
│   │       ├── PRD.md
│   │       ├── TECH_PLAN.md
│   │       ├── PROGRESS.md
│   │       ├── models.yaml      # Per-feature model tiers (optional, written by /belmont:tech-plan)
│   │       └── MILESTONE.md
│   ├── MILESTONE.md             # Active milestone context (created during implement)
│   └── MILESTONE-M1.done.md     # Archived milestone (after completion)
├── .claude/                     # Claude Code (if selected)
│   ├── agents/
│   │   └── belmont -> ../../.agents/belmont   (symlink)
│   └── commands/
│       └── belmont/              # one .md symlink per skill — each registers as /belmont:<skill>
│           ├── implement.md   -> ../../../.agents/skills/belmont/implement/SKILL.md
│           ├── verify.md      -> ../../../.agents/skills/belmont/verify/SKILL.md
│           ├── loop.md           # real file when loop is kept off .agents/skills/; otherwise a symlink
│           └── ...               (per-skill symlinks)
├── .opencode/                   # opencode (if selected)
│   └── command/
│       └── belmont/              # one generated .md wrapper per skill — each registers as /belmont/<skill>
│           ├── implement.md      # description + "read .agents/skills/belmont/implement/SKILL.md" body
│           ├── verify.md
│           └── ...               (per-skill wrapper commands, not symlinks — see supported-tools.md)
└── ...
```

The `loop` skill is conditional. Claude Code always gets `/belmont:loop`: if `loop` is kept off `.agents/skills/belmont/`, Belmont writes a real `.claude/commands/belmont/loop.md` file copied from the generated SKILL.md; if Codex is also selected and `loop` is on the shared surface, Claude gets the normal symlink. Codex installs `loop` into `.agents/skills/belmont/loop/` so `$belmont:loop` can start `/goal`. Other shared-surface CLIs do not get `loop` by default.

Codex, Cursor, Windsurf, Gemini, GitHub Copilot, Pi, and opencode all auto-discover `.agents/skills/belmont/<skill>/SKILL.md` natively (see [supported-tools.md](supported-tools.md)). opencode additionally gets the `.opencode/command/belmont/` wrapper commands above, because its TUI `/` autocomplete only lists commands, not skills. Codex additionally gets per-skill `agents/openai.yaml` UI metadata inside the canonical skill folders (`interface.display_name: "belmont:<skill>"`), so typing `$belmont` in its composer lists every skill — Codex's `/` menu only shows built-ins and can't be extended.

## Key Separation

- `.agents/belmont/` -- Shared agent instructions. Committed to git. Referenced by all tools.
- `.agents/skills/belmont/` -- Canonical skill files. Single source of truth.
- `.belmont/` -- Planning state (PR/FAQ, PRD, PROGRESS, TECH_PLAN, MILESTONE). PRD.md is a status-free living spec; PROGRESS.md is the single source of truth for all task/milestone state. Commit to git so the whole team has shared context.
- `.claude/`, `.codex/`, `.cursor/`, etc. -- Tool-specific wiring. Some use symlinks, some use copied/synced files.

## Should I gitignore `.belmont/`?

Generally, no — commit it so planning docs (PR/FAQ, PRD, TECH_PLAN) are shared across the team. The only case to gitignore it is if you're a solo developer who wants to keep planning state purely local and ephemeral.
