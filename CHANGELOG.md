# Changelog

## v0.11.1

**Released:** 2026-08-19

### Changes since v0.11.0

- Two residuals from the convergence round
- Close what the verification round left open
- Seven defects the adversarial round found in this PR, fixed
- Docs and knowledge for the dependency-eligibility change (#58, #59)
- Give /belmont:next the dispatch strategy it was already claiming to follow (#54)
- Name the sub-agent type per-CLI: opencode dispatches, as `general` (#56)
- Bound /belmont:loop, and teach the prose selectors what (depends:) means (#58, #59)
- Never offer a milestone whose (depends:) is unmet (#59)
- Report reverify milestones as processed, not verified (#61)
- Repair strands evidence too, and four tests that certify nothing
- A checkbox is not a task, and %q is not JSON
- Six tests that could not fail, including the one written to stop that
- Three the anchor fix got wrong, and the claims that covered for them
- Two the red team found in what the review round just added
- Give the milestone anchor one definition, called by both merge paths
- The three non-blocking ones, and the seven flags the first of them exposed
- Three from review: two that weakened "never silently dropped", one test that could not fail
- Give the fourth merge-path difference a destination
- Four claims in this branch that its own code contradicts
- Cite a commit that outlives the rebase, not one only my branch could see
- Prove the wave on a real repository, not on two directories
- Stop the listing calling a worktree preserved and then denying it
- "The last placement disagreement" was two words too strong
- Stop the comment repeating the claim its own commit message corrects
- Make the one-worktree case read as English, and pin it
- Drop a count I could not substantiate from a comment
- Record what these five fixes changed, in the entries that claimed otherwise
- Treat `--help` as the success it is, and stop hiding auto's real modes
- Say what could not be read, instead of rendering it as 0/0
- Stop `recover` offering to delete the wave that is still running
- Carry the task's body, and put a nested one back under its parent
- Reset the milestone being verified, not the six behind it
- Say why agent teams stays out, not just that its tools vanished
- Re-measure the prose the red team rewrote, not the prose it reviewed
- Stop the cross-run check pinning a judgement call
- Six things the authorization commit got wrong, found by red-teaming it
- Say that running the skill is the request to dispatch
- Say "no teardown", not "no cleanup" — the skills still have a Step 6
- Two the nested-carry fix broke, and three claims that were not true
- Check for the dispatch tool by the name it actually has
- Say which milestone came from master, instead of quietly substituting it
- Carry the nested task too, and put it back under its parent
- Let a blocker win from either side, and say what it displaced



## v0.11.0

**Released:** 2026-08-14

### Changes since v0.10.17

- Four regressions this PR introduced, found by red-teaming it
- Refuse the ambiguous file, not just the ambiguous carry
- Close the three the adversarial round left open
- Fix four defects an adversarial round found in the carry I just added
- Pin the review scenario that motivated #42, in its own words
- Record that the merge readers agree now, in both places that said otherwise
- One definition per reader, and stop dropping what the other side wrote
- A deferral is not in the blocker queue, and bounded is not polish
- Rewrite /belmont:loop so a run finishes what it starts, and add belmont blockers
- Span a blank line inside a task body, and file what is deferred
- Bound a task's body by its own indent, and widen the commit side too
- Move a task's whole block, and give a stray follow-up somewhere to go
- Test the invariant the last commit only claimed
- Make the loop gate survive a machine's tool detection
- Support Belmont loop in Codex



## v0.10.17

**Released:** 2026-08-11

### Changes since v0.10.16

- Add the loop-two-milestones eval fixture
- Skip the design agent when a milestone has no design input
- Regenerate plugin/ for the lazy Setup changes
- Fix contradiction in the MILESTONE template
- Cut the per-iteration cost of /belmont:loop
- Optimisation A: make skill Setup blocks lazy
- Add a two-tier eval harness
- Anchor carries past task bodies; refuse duplicate headings in the merge
- Round seven: the four commits nobody but me had read
- Fix a line that is two findings at once
- Audit the [v] flips nothing has ever checked
- Round six: refuse evidence another feature could own
- Close three controls the mutation battery found missing
- Round five: a crash, a stale write, and six narrower holes
- Add belmont repair, the healer
- Fix what [-] and [V] broke in files that already exist
- Add [-] withdrawn, and make the letter markers case-insensitive
- Make a violation report enough to conform the file
- Don't let an upgrade refuse a run that worked yesterday
- Correct the reader count: 8d7f82b converted four of five, not two
- Fix a state loss the previous commit introduced, and refuse ambiguous milestones
- Finish the #31 conversion: six readers still had their own region boundary
- Make mergeProgressState honour isSectionBreak
- Surface the #27 and #31 diagnostics in listing mode too
- Guard TestReverifyResetsEveryVerifiedMarker against a vacuous pass
- Fix three regressions the red team found in the worktree fixes
- Stop a quoted heading inside a task body from deleting the rest of the file
- Stop treating done as verified when the [v] flip never happened
- Stop worktree state sync and resume from destroying completions
- Route every marker reader through canonicalMarker; drop [V]
- Stop silently treating unrecognised task markers as todo



## v0.10.16

**Released:** 2026-08-07

### Changes since v0.10.15

- Repoint knowledge and skill sources after the split
- split: extract state.go tail and render.go — main.go reaches 1,522 lines
- split: extract types.go — shared type and constant declarations
- split: move the guard and worktree tails into their domain files
- split: extract autocmd.go and fsutil.go
- split: relocate stragglers into their real homes
- split: extract merge_conflict.go and feature.go
- split: extract install_sync.go — install-time sync and tool detection helpers
- split: extract validate.go — sync and validate commands
- split: extract status.go — status rendering
- split: extract multifeature.go — multi-feature scheduling
- split: extract auto_loop.go — the auto loop and phase execution
- split: extract auto_parallel.go — wave orchestration and merge sequencing
- split: extract auto_decide.go — loop action decisions
- split: extract install.go — installer and updater
- split: extract reverify.go — the reverify command
- split: extract reconcile.go — merge reconciliation and belmont recover
- split: extract toolexec.go — AI CLI dispatch and model tiers
- split: extract worktree.go — worktree lifecycle
- split: extract monorepo.go — workspace detection and env seeding
- split: extract steer.go — belmont steer and the STEERING.md lifecycle
- split: extract guards.go — runtime scope and evidence guards
- split: extract state.go — PROGRESS.md parsing and computed milestone state
- Add scripts/declsum — purity proof for the main.go split
- Correct docs that the previous commits falsified
- Add CI — the first automated checks this repo has had
- Delete the nine staticcheck findings
- docs(knowledge): add worktree-state-isolation entry
- fix(worktree): remove writeWorktreeGitExcludes, which never worked



## v0.10.15

**Released:** 2026-08-07

### Changes since v0.10.14

- Fix plugin generator emitting empty agent files



## v0.10.14

**Released:** 2026-06-09

### Changes since v0.10.13

- Rename plan-apply -> codex-plan-apply; add knowledge entry
- Add Codex plan handoff apply skill



## v0.10.13

**Released:** 2026-06-08

### Changes since v0.10.12

- Add Claude-only /belmont:loop skill



## v0.10.12

**Released:** 2026-06-04

### Changes since v0.10.10

- docs/agent-pipeline: drop redundant per-agent Model annotation
- AGENTS.md: correct model-tier note to inherit-by-default
- Pin no model in agent frontmatter — inherit session model, configure via models.yaml
- Default all agents to the high model tier (Opus)
- Tune Codex model tiers for quality and speed
- Require Codex plan-mode structured questions
- Optimize Codex model tier configuration



## v0.10.10

**Released:** 2026-06-03

### Changes since v0.10.9

- Group Belmont skills in Codex's $-mention popup via per-skill display names



## v0.10.9

**Released:** 2026-06-03

### Changes since v0.10.8

- Surface Belmont skills in opencode's TUI slash menu via generated wrapper commands



## v0.10.8

**Released:** 2026-06-03

### Changes since v0.10.7-final

- Add opencode (opencode.ai) as a first-class supported tool



## v0.10.7

**Released:** 2026-05-12

### Changes since v0.10.6

- Inline-merge serial wave + rebase paused worktrees on resume



## v0.10.6

**Released:** 2026-05-11

### Changes since v0.10.5

- Updated `belmont:debug-manual` skill to work closer with Belmont tracking files



## v0.10.5

**Released:** 2026-05-11

### Changes since v0.10.4

- Add Pi (pi.dev) as a first-class supported tool



## v0.10.4

**Released:** 2026-05-07

### Changes since v0.10.3

- Add first-class monorepo support and fix Claude Code skill discovery



## v0.10.3

**Released:** 2026-04-30

### Changes since v0.10.2

- Restructure Belmont files, simplify, and update to latest CLI APIs
- Remove "migration" tech debt
- Auto commit the Belmont changes on install + warn on auto mode if git unclean



## v0.10.2

**Released:** 2026-04-24

### Changes since v0.10.1

- Improve status and auto commands in relation to archived features
- Remove emojis from cleanup skills



## v0.10.1

**Released:** 2026-04-23

### Changes since v0.10.0

- Emit colored status markers when piped via --color=always



## v0.10.0

**Released:** 2026-04-22

### Changes since v0.9.9

- Heavy refactoring + bugfixing for parallel auto mode
- Add `belmont steer` command to instruct agents during auto mode
- Dynamic model assignment based on feature



## v0.9.9

**Released:** 2026-04-21

### Changes since v0.9.8

- reconciliation: unstage reconciliation-report.json from merge commit
- recover: auto-detect AI tool (or accept --tool flag)
- install: write relative symlinks; reconciliation: handle symlinks+parents
- agents: add tactical Web Research guidance to implement/verify/review
- auto: grant WebFetch and WebSearch to claude dispatch
- agents: mark tasks [>] in_progress when starting each task
- skills: token-saver — MILESTONE coordinator + references/ convention



## v0.9.8

**Released:** 2026-04-21

### Changes since v0.9.7

- Allow Belmont to understand the "other side" of the planning equation



## v0.9.7

**Released:** 2026-04-21

### Changes since v0.9.6

- Remove the "tiered" approach from planning question analysis



## v0.9.6

**Released:** 2026-04-20

### Changes since v0.9.5

- Improvements to planning modes



## v0.9.5

**Released:** 2026-04-16

### Changes since v0.9.4

- Improve `belmont status` output



## v0.9.4

**Released:** 2026-04-16

### Changes since v0.9.3

- Enforce design reference comparison in visual verification



## v0.9.3

**Released:** 2026-04-16

### Changes since v0.9.2

- Fix reverify command not finding verified tasks to re-verify
- Prevent implementation agent from verifying its own tasks



## v0.9.2

**Released:** 2026-04-15

### Changes since v0.9.1

- Allow belmont --version/-v as well as default belmont version



## v0.9.1

**Released:** 2026-04-10

### Changes since v0.9.0

- Add belmont to Homebrew
- Add Belmont to Claude Marketplace



## v0.9.0

**Released:** 2026-04-10

### Changes since v0.8.7

- Fully rebuild Belmont tracking system



## v0.8.7

**Released:** 2026-04-09

### Changes since v0.8.6.1

- Make reverify a standalone command instead of auto mode flag



## v0.8.6.1

**Released:** 2026-04-09

### Changes since v0.8.6

- Fix reverify loop stopping after first milestone



## v0.8.6

**Released:** 2026-04-09

### Changes since v0.8.5.2

- Enable --reverify in multi-feature auto mode
- Instruct agents to dynamically allocate ports for non-primary servers



## v0.8.5.2

**Released:** 2026-04-08

### Changes since v0.8.5.1

- Fix recover --clean slug in interrupt preservation message



## v0.8.5.1

**Released:** 2026-04-08

### Changes since v0.8.5

- Fix auto --reverify exiting early when milestones already flipped



## v0.8.5

**Released:** 2026-04-08

### Changes since v0.8.4

- Add `belmont reverify` command and `auto --reverify` mode
- Strengthen rules around Playwright MCP usage



## v0.8.4

**Released:** 2026-04-07

### Changes since v0.8.3

- Improvements to workflow: Cleanup skill, Five Whys method, fixes for "single-feature" auto mode



## v0.8.3

**Released:** 2026-04-02

### Changes since v0.8.2.1

- Fix auto mode resume overwriting worktree progress
- Ensure auto.json is added to gitignore on install



## v0.8.2.1

**Released:** 2026-03-31

### Changes since v0.8.2

- Fix next skill archiving MILESTONE files with task ID instead of milestone ID



## v0.8.2

**Released:** 2026-03-31

### Changes since v0.8.1.1

- Fix auto mode triage/fix-all loop and milestone-scoped verification



## v0.8.1.1

**Released:** 2026-03-31

### Changes since v0.8.1

- Fix Windows build: extract platform-specific syscall usage



## v0.8.1

**Released:** 2026-03-31

### Changes since v0.8.0

- Fix master PROGRESS task counts drifting after tech-plan



## v0.8.0

**Released:** 2026-03-27

### Changes since v0.7.6.1

- Improvements to auto-merging capability
- Move all Belmont tracking inside worktree
- Improved auto detection and install of dependencies, when worktree.json missing
- Add setup concept for Belmont auto features



## v0.7.6.1

**Released:** 2026-03-24

### Changes since v0.7.6

- Fix for claude code hook format



## v0.7.6

**Released:** 2026-03-24

### Changes since v0.7.5

- Huge changes to auto workflow



## v0.7.5

**Released:** 2026-03-20

### Changes since v0.7.4

- Add --dry-run flag to belmont auto



## v0.7.4

**Released:** 2026-03-20

### Changes since v0.7.3

- Fix for user question tooling in planning modes



## v0.7.3

**Released:** 2026-03-19

### Changes since v0.7.2

- First version of E2E test flow integration
- Add authors section to README



## v0.7.2

**Released:** 2026-03-17

### Changes since v0.7.1

- Add Apache 2.0 license to Belmont



## v0.7.1

**Released:** 2026-03-17

### Changes since v0.7.0

- Add Ultrathink to Belmont planning modes



## v0.7.0

**Released:** 2026-03-16

### Changes since v0.6.0

- Use wave based parallelisation, with consideration of feature dependencies
- Rename `/belmont:review` to `/belmont:review-plans`
- Move to new "auto" logic
- V1 of parallel development. Working on multiple milestones within a git worktree.



## v0.6.0

**Released:** 2026-03-10

### Changes since v0.5.1

- Add smart rules engine to loop decision system
- Align README style
- Reorganize README into focused overview with docs/ reference pages



## v0.5.1

**Released:** 2026-02-24

### Changes since v0.5.0

- Split debug skill into auto and manual sub-workflows



## v0.5.0

**Released:** 2026-02-23

### Changes since v0.4.4

- Redesign debug skill to use agent-dispatched pipeline



## v0.4.4

**Released:** 2026-02-20

### Changes since v0.4.3

- Auto-cleanup verification screenshots and auto-commit .belmont/ files
- Allow Belmont to commit it's changed plans automatically after implementation



## v0.4.3

**Released:** 2026-02-19

### Changes since v0.4.2

- Let verifier make follow up tasks, it's not good at fixing things directly.



## v0.4.2

**Released:** 2026-02-19

### Changes since v0.4.1

- Release vv0.4.2
- Strength rule to cleanup Playwright MCP screenshots



## vv0.4.2

**Released:** 2026-02-19

### Changes since v0.4.1

- Strength rule to cleanup Playwright MCP screenshots



## v0.4.1

**Released:** 2026-02-19

### Changes since v0.4.0

- Remove tracked build artifacts and update .gitignore
- Add conditional Lighthouse audit phase to verification agent



## v0.4.0

**Released:** 2026-02-18

### Highlights

- **Working Backwards (PR/FAQ)**: New `/belmont:working-backwards` skill — define your product vision using Amazon's Working Backwards methodology before breaking it into features and tasks. Produces `.belmont/PR_FAQ.md` with a press release, FAQs, and product backlog.
- **Sub-Feature Architecture**: Belmont now organizes work into per-feature directories under `.belmont/features/<slug>/`. Each feature gets its own PRD, TECH_PLAN, PROGRESS, and MILESTONE files. A master PRD at `.belmont/PRD.md` acts as the feature catalog.
- **Document Review & Drift Detection**: New `/belmont:review` skill — interactively reviews alignment between your PR/FAQ, master PRD, feature PRDs, tech plans, PROGRESS files, and actual codebase. Surfaces drift, conflicts, and gaps with resolution options for each finding.
- **Live Notes**: New `/belmont:note` skill — save learnings, workarounds, environment quirks, and debugging insights to `NOTES.md` so they persist across sessions and context compactions. The implementation agent also captures non-obvious discoveries automatically after each task.
- **Recommend committing `.belmont/` to git**: The installer no longer adds `.belmont/` to `.gitignore`. Planning documents (PR/FAQ, PRD, TECH_PLAN) are meant to be shared with your team. If you previously had `.belmont/` in your `.gitignore`, consider removing it.

### New Skills

- **`/belmont:working-backwards`** — Amazon-style PR/FAQ creation. Guides you through customer definition, problem statement, and solution. Enforces writing quality: no weasel words, data over adjectives, under 30 words per sentence.
- **`/belmont:review`** — Alignment review across all planning documents. Compares PR/FAQ vision against master PRD, checks feature PRDs against master, verifies task/milestone consistency, scans codebase for unplanned implementations. Presents findings interactively with resolution options.
- **`/belmont:note`** — Capture learnings and discoveries to feature-level or global `NOTES.md`. Supports categories: environment, workaround, discovery, credential, pattern, debugging, performance.

### New `.belmont/` Directory Structure

The `.belmont/` directory has been restructured to support multi-feature products:

```
.belmont/
  PR_FAQ.md                    <- NEW: Strategic vision (Working Backwards)
  PRD.md                       <- Now a master feature catalog
  TECH_PLAN.md                 <- Master cross-cutting architecture
  PROGRESS.md                  <- Master progress (feature summary table)
  NOTES.md                     <- Global learnings (optional)
  features/                    <- NEW: Per-feature directories
    <feature-slug>/
      PRD.md
      TECH_PLAN.md
      PROGRESS.md
      MILESTONE.md
      NOTES.md
```

**Upgrading from v0.3.x**: Run `belmont update && belmont install` in your project. Then ask your AI agent to look at the updated Belmont skills and adjust your `.belmont/` directory to match the new structure — it will help migrate your existing PRD and PROGRESS into a feature directory.

### CLI Changes

- `belmont status` now supports `--feature <slug>` flag for feature-specific status
- `belmont status` (without `--feature`) shows a project-level overview with all features, their progress, and next tasks
- `belmont status` now reports PR/FAQ readiness
- `belmont install` creates `.belmont/PR_FAQ.md` template and `.belmont/features/` directory
- `belmont install` no longer adds `.belmont/` to `.gitignore` — planning docs should be committed

### Agent Changes

- Renamed `core-review-agent.md` to `code-review-agent.md` for clarity
- All agents now read file paths from the orchestrator's prompt instead of hardcoding `.belmont/` paths — enables the sub-feature directory structure
- Implementation agent now captures learnings to `NOTES.md` after each task (Step 5b)
- Verification agent now more strongly nudged to use Playwright for visual verification
- All skill prompts updated with feature selection logic and base path convention

### .gitignore Change

Previous versions of Belmont added `.belmont/` to your `.gitignore` during install. **This is no longer the case.** We now recommend checking `.belmont/` into source control so your team shares planning context (PR/FAQ, PRDs, tech plans, progress).

If you previously had `.belmont/` gitignored, consider removing that line:

```bash
# Remove .belmont/ from .gitignore if present
sed -i '' '/.belmont/d' .gitignore
```

## v0.3.5

**Released:** 2026-02-13

### Changes since v0.3.4

- Fix Figma access in planning skills by using inline MCP calls



## v0.3.4

**Released:** 2026-02-13

### Changes since v0.3.3

- Separate product vs technical question scope in planning skills



## v0.3.3

**Released:** 2026-02-12

### Changes since v0.3.2

- Bugfixing prompts



## v0.3.2

**Released:** 2026-02-11

### Changes since v0.3.1

- Refactor to allow skills generation. Adds strategies to remove token input.



## v0.3.1

**Released:** 2026-02-11

### Changes since v0.3.0

- Remove Claude settings
- Fix GitHub Copilot detection to use .copilot/ directory instead of .github/



## v0.3.0

**Released:** 2026-02-11

### Changes since v0.2.0

- Improve tech-plan to consider infrastructure + SQL optimisation



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