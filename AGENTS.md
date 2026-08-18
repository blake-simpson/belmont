# AGENTS

This file provides guidance to Ai Agents when working with code in this repository.

## Self-learning loop — consult `knowledge/KNOWLEDGE.md` first

Belmont's architectural memory lives in the `knowledge/` tree at the repo root. `knowledge/KNOWLEDGE.md` is a thin index that routes you to self-contained topic entries — one per concept — organised by domain. The index is cheap to read in full; entries are read on-demand based on what you're about to touch.

**Rules:**

- Before designing a fix for any bug in the auto loop, skills, worktree lifecycle, merge strategy, verification, agent dispatch, or state model: read `knowledge/KNOWLEDGE.md`. Match the "Read when you're about to…" column to your task; open only the entries that match. Most sessions need 1–3 entries, not the whole tree.
- Every entry has a stable skeleton (`Why this matters` → `Invariant` → `How it's enforced` → `Failure mode if you break it` → `Don't re-do` → `Evidence` → `Revisions`). Jump to `Don't re-do` before proposing a "why don't we just…" approach — a lot of them are already ruled out with reasoning.
- Cross-domain entries live in `knowledge/cross-cutting/` and carry a `Domains:` header line you can grep. Single-domain entries live in `knowledge/<domain>/`.
- **Amend, don't append.** When you produce a durable insight (a new invariant, a design option deliberately rejected, a rough edge discovered), edit the relevant entry in place and add one line to its `Revisions` footer: `YYYY-MM-DD — what changed`. Do not add dated blocks at the top.
- **New concept → new entry.** If a session uncovers a genuinely new topic that doesn't fit any existing entry, create `knowledge/<domain>/<topic>.md` following the skeleton, add a row to `KNOWLEDGE.md`'s routing table. Do not inline new concepts into existing entries to avoid the file count going up — file count going up is fine when the concept is real.
- **Cross-topic chronology is `git log -- knowledge/`.** There is no global decision log; it would duplicate git and bloat unbounded.
- Treat `AGENTS.md` itself as live: if a change in a knowledge entry implies agents should approach work differently on first read, update the relevant section of `AGENTS.md` so the guidance is immediate. Keep `AGENTS.md` terse — prefer linking into the knowledge tree over duplicating detail.
- When you update `AGENTS.md`, say so in your end-of-turn summary and note which entry motivated the change.

**Why this exists.** Belmont evolves through real failures on real features. Parallel mode has hit the same class of bug (scope leak, state merging, over-eager skills, port collisions) multiple times from different angles. Without a curated, retrieval-optimized memory, each session re-discovers the same constraints. The `knowledge/` tree is the mechanism that keeps us spiraling in, not in circles — domain separation plus per-topic self-containment lets agents pull in only what's relevant to their task without burning context on unrelated history.

## Both invocation paths or it's not done

Belmont skills run in two completely different invocation paths:

- **Auto mode** — the Go CLI shells out to the AI tool's headless print mode (`claude -p`, `codex exec`, `pi -p`, …) and parses its stdout. Belmont assembles the prompt; the tool's own skill discovery is bypassed.
- **Interactive mode** — the user types a skill name (e.g. `/belmont:implement`, or natural language matching a `description:`) into the AI tool's live REPL, and the tool's own skill discovery loads `SKILL.md` from `.agents/skills/belmont/<skill>/`.

Any change that touches tool integration, skill behaviour, sub-agent dispatch, model-tier handling, or the on-disk surface (`.agents/skills/`, `.agents/belmont/`, `.belmont/`, `AGENTS.md`) **must explicitly address both paths in the plan and in tests**. Forgetting interactive mode is a recurring failure: the skill runs from `belmont auto` but breaks the moment a user invokes it directly (or vice versa). See [`knowledge/cross-cutting/dual-invocation-paths.md`](knowledge/cross-cutting/dual-invocation-paths.md).

## Parallel mode invariants — enforced by multiple layers

Belmont's parallel auto mode is the area most prone to subtle bugs. Several structural rules are now enforced **mechanically** by the Go CLI (not by prompts alone). Before touching any of these, open the referenced `knowledge/` entry — each one ends with a `Don't re-do` section listing rejected alternatives.

- **Milestone structure is immutable outside `/belmont:tech-plan`.** Skill content + runtime scope guard + `belmont validate` lint combine to forbid new milestones in any non-tech-plan phase. See [`knowledge/cross-cutting/milestone-immutability.md`](knowledge/cross-cutting/milestone-immutability.md) and [`knowledge/auto-mode/scope-guard-runtime.md`](knowledge/auto-mode/scope-guard-runtime.md). **Exception**: interactive `/belmont:debug-manual` may edit spec prose (PRD/TECH_PLAN/NOTES + PROGRESS `[x]` flips) in place under per-edit user approval — structural prohibitions (no new/renamed/removed milestones, no polish-pattern names, no `[v]` flips) still apply. See [`knowledge/cross-cutting/debug-spec-reconciliation.md`](knowledge/cross-cutting/debug-spec-reconciliation.md). **Every discovered follow-up has a documented destination, including the cross-cutting one** — a follow-up belonging to no single milestone goes in the *highest-numbered* existing milestone whose work it touches (the last in the plan if genuinely global), never a new milestone and never left outside every milestone. Highest, not earliest: the earliest re-opens work the later milestones already built on. Leaving that case unruled was itself a bug — `repair` said "go to tech-plan", tech-plan said "never a new milestone", and the task came back unscheduled (#34). Milestone headings are `### M<n>:`, level 3; a level-2 heading at column zero *ends* the milestones region.
- **`[v]` flips require commit evidence.** Post-phase `runEvidenceCheck` reverts any task marked verified whose ID isn't in a branch-local commit. See [`knowledge/auto-mode/verify-evidence.md`](knowledge/auto-mode/verify-evidence.md).
- **…and a missing `[v]` is the mirror failure.** No Go code ever *promotes* a task to verified — the flip is written by the verify orchestrator, and `computeOverallStatus` returns `"Complete"` for an all-`[x]` feature, which every stop condition treats as finished. `belmont status` warns (both detail and listing views) when a feature reads Complete with unverified tasks and names `belmont reverify`, the only recovery. Never gate that warning on anything looser than the feature reading Complete, and never change the `"Complete"` string itself — `isFeatureTerminal` switches on it. See [`knowledge/cross-cutting/verified-flip-recording.md`](knowledge/cross-cutting/verified-flip-recording.md).
- **Parallel waves always use worktrees; merge overlap is reported at merge time.** No master-tree shortcut, live status overlay, pre-merge overlap warning. See [`knowledge/auto-mode/parallel-wave-orchestration.md`](knowledge/auto-mode/parallel-wave-orchestration.md).
- **Worktree `.belmont/` state moves by copy, and both directions must never destroy state.** `syncFeatureStateAfterMerge` merges `PROGRESS.md` (`mergeProgressState`) rather than replacing it — it runs once per sibling merge, so a wholesale replace was last-writer-wins across a wave (#24). `createWorktreeIfNeeded` is the sole worktree-seeding entry point and no-ops on resume, because seeding overwrites a paused worktree's live `PROGRESS.md` (#29). Since `.belmont/` is `--assume-unchanged` in worktrees, these copies are the *only* transport — anything they drop is in no commit and unrecoverable. See [`knowledge/auto-mode/worktree-state-isolation.md`](knowledge/auto-mode/worktree-state-isolation.md).
- **`--max-parallel=1` interleaves merges with execution; resuming a paused worktree rebases it onto current main.** When max-parallel is 1, each unit merges before the next starts (so cross-unit implicit deps resolve at fork point). When `[r]`-resuming a paused worktree, `rebaseWorktreeOnMain` runs first so sibling merges since the pause are picked up; dirty trees skip-and-warn, conflicts abort-and-warn. See [`knowledge/auto-mode/resume-rebase.md`](knowledge/auto-mode/resume-rebase.md) and the `MaxParallel <= 1` section of [`knowledge/auto-mode/multi-feature-scheduling.md`](knowledge/auto-mode/multi-feature-scheduling.md).
- **Port isolation is env-var-mechanical + prose-reinforced.** `BELMONT_PORT` / `PLAYWRIGHT_BASE_URL` / `CYPRESS_baseUrl` exported per worktree; worktree-awareness partial has the decision tree. See [`knowledge/cross-cutting/port-isolation.md`](knowledge/cross-cutting/port-isolation.md).
- **User steering in-flight** via `belmont steer` → STEERING.md → pre-shell-out consumption. Same pipeline the scope guard and verify guard use to inject corrections. See [`knowledge/cross-cutting/steering.md`](knowledge/cross-cutting/steering.md).
- **Batch mode breaks per-task cleanup steps.** When you tell a skill to do N tasks in one invocation (auto's `FIX_ALL`, `/belmont:loop` step 4), re-read that skill's per-task cleanup first — it was written for one task per run, and running it N times can destroy the previous N−1 results. Known case: `next.md` Step 5 archives `MILESTONE.md` → `MILESTONE-<M>.done.md` and says to **overwrite** an existing file, so a four-task batch keeps only the last log. Both paths now tell `next` to append: `loop.md` step 4 for interactive, and `buildLoopPrompt`'s `actionFixAll` branch for auto. Observed live on 2026-08-12, not theorised: the agent spotted it and appended anyway; a less careful one loses the logs silently and nothing checks.
- **Auto refuses a dirty working tree; `update` auto-commits its own files.** `requireCleanWorkingTree` blocks `belmont auto` startup when uncommitted/untracked changes exist (escape hatch: `--allow-dirty`); `commitBelmontUpdate` stages and commits only Belmont-managed paths after `belmont update` (opt-out: `--no-commit`). See [`knowledge/auto-mode/clean-tree-preflight.md`](knowledge/auto-mode/clean-tree-preflight.md).
- **Monorepo workspaces are auto-detected, env-seeded, and gated on `BELMONT_MONOREPO=1`.** `detectWorkspaces` probes for `turbo.json` / `nx.json` / `pnpm-workspace.yaml` / `package.json#workspaces` / `Cargo.toml#[workspace]` / `go.work` / `pyproject.toml#[tool.uv.workspace]` (also Lerna and Rush). Workspace dirs whose manifest signals env consumption (Prisma deps, postinstall scripts, `build.rs`, Python `[project.scripts]`) get `.env*` seeded into them. Skills and agents toggle workspace-aware command guidance only when `BELMONT_MONOREPO=1`. Single-package projects observe zero behavioural change. See [`knowledge/cross-cutting/monorepo-workspaces.md`](knowledge/cross-cutting/monorepo-workspaces.md).

The canonical anti-pattern these invariants protect against is the "polish milestone running in parallel with its own dependencies" scenario preserved as evidence in [`knowledge/meta/validated-runs.md`](knowledge/meta/validated-runs.md). If you're tempted to weaken any guard, re-read those entries first.

## Notes
- When updating code, always ensure the README and docs/ are up to date with the new changes/paths etc.
  - The README covers the high-level overview, quick start, how it works, installation, and brief tables for skills/tools.
  - Detailed reference content lives in `docs/` (cli-commands, supported-tools, skills-reference, workflow, directory-structure, prd-format, agent-pipeline, updating, troubleshooting).
  - If a change affects both the README summary and a docs page, update both.
- When changing the Go code, always run the compiler after to test + rebuild the file

## Verify
- After every change, build (`go build ./cmd/belmont`) and run unit tests (`go test ./cmd/belmont`). These cover regressions in isolation, but they don't prove the change works end-to-end on a real install.
- **Eval harness.** `go test -tags eval ./cmd/belmont` runs Tier 1 — offline, deterministic, free, and in CI. It is behind a build tag, so plain `go test` does **not** compile it; run it after touching state parsing, the decision engine, wave computation, or the guards.
  - Changing skill **prose** (`skills/belmont/_src/*`) needs Tier 2, which drives a real tool: `BELMONT_EVAL_LIVE=1 go test -tags eval -timeout 0 -run TestEvalLive ./cmd/belmont`. `-timeout 0` is required or the live tool child is orphaned on Go's 10-minute default. Tier 1 **cannot** license a prose change — nothing in it reads a `SKILL.md`. See [`knowledge/meta/evals.md`](knowledge/meta/evals.md).
- **Author smoke test before release** (non-negotiable for any non-trivial change — new tools, skills, CLI behaviour, install paths, auto-loop logic): the plan MUST end with a copy-paste-ready "Author smoke test" section for Blake to run locally before tagging a release. The section must:
  1. Exercise **both invocation paths** for each affected tool (auto mode + interactive mode — see "Both invocation paths or it's not done").
  2. **Sanity-check the unchanged tools** — at minimum Claude Code, the daily driver — in both modes, to prove the change didn't regress the main workflow.
  3. Run against a **real project on a disposable branch**, not just `/tmp/<scratch>`, so the test exercises a realistic install + agent flow with state Blake actually recognises.
  4. List the **exact expected output** at each step so success/failure is unambiguous, and include diagnostic next-steps when a step might fail for reasons outside Belmont (LM Studio not running, API budget, etc.).
- "All unit tests pass" is necessary but not sufficient. The "this actually works on my machine end-to-end" guarantee comes only from a manual run.

## Build & Run

```bash
# Development: compile without embedded files (dev mode)
go build ./cmd/belmont

# Development: run directly (requires --source for install)
go run ./cmd/belmont status --root /path/to/project
go run ./cmd/belmont install --source . --project /tmp/test-project --no-prompt

# Release build: compile with embedded skills/agents + version injection
./scripts/build.sh 0.2.0

# Or use the dev install script (builds + records source path)
./bin/install.sh --setup
```

**Important**: `go run` and plain `go build` do NOT embed skills/agents (they use the `!embed` build tag). The `install` command will fall back to source resolution (`--source` flag, `BELMONT_SOURCE` env, config file, or walking up from binary). Use `scripts/build.sh` to produce a release binary with embedded content.

`go vet ./...` and `staticcheck ./...` both run in CI and are currently clean — keep them that way rather than suppressing findings. Install staticcheck with `go install honnef.co/go/tools/cmd/staticcheck@latest`.

Tests live in `cmd/belmont/*_test.go` (nine files); run them with `go test ./cmd/belmont`. `.github/workflows/ci.yml` runs build, test, vet, staticcheck, gofmt, `GOOS=windows go vet`, the generator `--check` scripts, a plugin-agent truncation assertion, and a five-platform build matrix on every push and pull request.

## Skills Generation

Skills in `skills/belmont/` are generated from templates. **Generated output is gitignored** — only `_src/` and `_partials/` are committed. The generation step transforms flat sources into the agentskills.io folder layout (`<skill>/SKILL.md` with `name:` injected into frontmatter, plus a `<skill>/references/` subdir holding only the references that skill body actually uses).

- **Shared content**: `skills/belmont/_partials/*.md` — reusable blocks with `{{variable}}` placeholders, inlined at build time via `<!-- @include ... -->`
- **Templates**: `skills/belmont/_src/*.md` — flat-with-frontmatter skill source files. Edit these.
- **Progressive-disclosure references**: `skills/belmont/_src/references/<skill>-<topic>.md` — detail loaded on demand by skills. Skill bodies point at them via relative paths like `references/implement-milestone-template.md`; generation copies only the references each skill body mentions into `<skill>/references/`.
- **Generated output (gitignored)**: `skills/belmont/<skill>/SKILL.md` and `skills/belmont/<skill>/references/*.md`. `build.sh` copies this into `cmd/belmont/skills/` for `//go:embed` and cleans up after.

Regenerate after editing sources:

```bash
go generate ./...                     # invokes scripts/generate-skills.sh
./scripts/generate-skills.sh          # direct invocation
./scripts/generate-skills.sh --check  # verify each _src/<name>.md has a corresponding generated SKILL.md
```

Source-mode `belmont install --source <path>` also auto-runs `generate-skills.sh` if any `_src/` or `_partials/` file is newer than the matching generated SKILL.md (`ensureSkillsGenerated`).

The sub-agent dispatch strategy is shared via `skills/belmont/_partials/dispatch-strategy.md` and inlined at build time into orchestrator skills (implement, verify).

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

## Design Decisions

- **`--from`/`--to` is single-feature only**: Milestone range flags (`--from`, `--to`) are blocked in multi-feature mode (`--features`, `--all`) because milestone IDs (M1, M3, etc.) are local to each feature — the same ID means different things across features.
- **Ports: primary vs additional servers**: `PORT`/`BELMONT_PORT` is allocated by the Go CLI for the primary dev server (frameworks auto-detect it). All other servers (Storybook, Prisma Studio, etc.) must dynamically allocate their own free port at runtime — this is handled by agent instructions, not Go code. See `_partials/worktree-awareness.md`.
- **Unified state tracking**: PROGRESS.md is the single source of truth for all task/milestone state. PRD.md is a pure spec with no status markers. See "State Tracking" section below.
- **Per-feature model tiers**: each feature may carry a `.belmont/features/<slug>/models.yaml` that maps agents (codebase / design / implementation / verification / code-review / reconciliation) to `low` / `medium` / `high` tiers. The `cmd/belmont/main.go` registry (`modelTiers`) translates tiers to CLI-specific model IDs; planning and reconciliation always force `high` via the `planningTier` / `reconciliationDefaultTier` constants. Absent file → each agent inherits the **session model** (Belmont agent files pin no `model:` frontmatter, and sub-agents dispatch as `general-purpose` so frontmatter would not be read anyway — `models.yaml` is the single visible per-agent override). Skill-side dispatch honors tiers via the dispatch tool's `model:` parameter on Claude — that tool is named `Agent` (`Task` on CLIs old enough to predate the rename; opencode's is `task`, and its sub-agent type is `general`, not `general-purpose` — #56), and the partial checks for it **by name**, so getting the name wrong silently disables both context isolation and every tier (#45) — and **the name alone is not sufficient**, because the host CLI's own system prompt can refuse the call on authorization grounds; see [`knowledge/cross-cutting/dispatch-authorization.md`](knowledge/cross-cutting/dispatch-authorization.md). Other CLIs get a preflight warning (see `skills/belmont/_partials/tier-preflight.md`). See [`knowledge/cross-cutting/model-tier-economics.md`](knowledge/cross-cutting/model-tier-economics.md). `cmd/belmont/main.go` must remain stdlib-only — the YAML parser is hand-rolled for this flat schema.
- **Pi tier resolution is deliberately user-driven**: Pi runs against user-provided local (or remote) models whose IDs Belmont cannot know in advance, so Pi has *no* entry in `modelTiers`. Instead, `resolvePiModelFlags` (in `cmd/belmont/local_llms.go`) consults a 5-level chain: `BELMONT_PI_PROVIDER_<TIER>` / `BELMONT_PI_MODEL_<TIER>` env vars > `BELMONT_PI_PROVIDER` / `BELMONT_PI_MODEL` env vars > `<project>/.belmont/local-llms.json` > `~/.belmont/local-llms.json` > nothing (Pi falls back to its own default model). When extending the Pi integration, prefer adding to this chain rather than hardcoding model IDs in Go. See `docs/local-llms.example.json` and `docs/supported-tools.md`.

## State Tracking

All task and milestone state lives in PROGRESS.md. PRD.md is a pure specification document with no status markers.

### Task states (PROGRESS.md checkboxes)

| Marker | State | Meaning |
|--------|-------|---------|
| `[ ]` | todo | Not started |
| `[>]` | in_progress | Currently being worked on |
| `[x]` | done | Implemented, not yet verified |
| `[v]` | verified | Implemented and passed verification |
| `[!]` | blocked | Cannot proceed |
| `[-]` | withdrawn | Planned, then deliberately dropped |

The letter markers are **case-insensitive** — `[X]`/`[V]` parse the same as
`[x]`/`[v]`. One rule, and it removes a whole class of "why did this error".

**`[-]` withdrawn is a state, not a deletion.** It covers work that was
superseded, duplicated by another task, relocated to another feature, or
descoped. It is neither outstanding nor done: excluded from both counts, never
offered as next work, and it does not stop a milestone reading complete. Record
*why* in `## Decisions Log` — a marker cannot carry a reason.

Do **not** express withdrawal by deleting the line. `mergeProgressState` takes
the worktree as base and carries master's missing lines back in, so a deleted
task is resurrected by the next sibling sync in **either** direction. A marker
survives, and withdrawal wins from either side of a merge (like `[!]`), so a
stale worktree cannot silently revive dropped work. This state exists because
its absence *is* issue #27: with no way to say "we decided not to do this", a
user invented `[-]`, and every unrecognised marker then parsed as todo.

**`[!]` is a decision queue, not a failure.** It usually means the missing input
is a *person* (an approval, a product or architecture ruling, a credential, a
console action, a spec change owned by `/belmont:tech-plan`) — and that kind no
skill may clear. **Not all of them are:** `_partials/milestone-immutability.md`
mints a `[!]` for work blocked on a later milestone `M<N+k>` (reopen as `[ ]`
once it verifies) and the reconciliation agent clears one when the other side of
a merge is `[x]`/`[v]`, so any absolute "never touch a `[!]`" rule contradicts a
partial the same skills `@include`. The reason line is what tells them apart.
Two opposite mistakes follow from forgetting this, both observed on one feature.
**Stopping on it** strands every independent milestone behind one unanswered
question — and note nothing routes around it for free: `nextMilestone` returns
the first not-all-done milestone and `implement.md` picks the first holding any
non-`[v]` task, so a `[!]` re-targets the same milestone forever unless the
caller names one explicitly. **Grinding at it** is worse: a human-gated follow-up
misfiled as "blocking" burns fix rounds that cannot succeed and then trips the
circuit breaker, which defers it as polish — so classify human-gated *before*
blocking (the test is not severity, it is whether the missing thing is a
person), never count such an attempt as a fix round, and never let a circuit
breaker sweep one. Clearing a human-gated `[!]` to make a milestone read
complete is the `[v]`-without-evidence failure with a different marker and
**almost no guard behind it** — no Go code audits a `[!]` that disappeared.
`skipMilestoneInProgress` used to rewrite one to `[x]` outright; since #40 its
regex is `[ >]`, it leaves `[!]` alone, and it returns an error rather than a
quiet success when a blocked task is all that remains. That closes the one
mechanical launderer, not the audit gap. **These rules
describe `/belmont:loop`. `belmont auto` deliberately does the opposite** —
`decideLoopAction` Rule 1 PAUSEs the whole feature on the first `[!]`, which is
the right headless answer; changing that is a behaviour change needing its own
eval. `belmont blockers` is the surface: it exists because 19 of them
accumulated in one overnight run and `belmont status` showed their headlines but
never the indented body where the question lives. See
[`knowledge/cross-cutting/human-gated-blockers.md`](knowledge/cross-cutting/human-gated-blockers.md).

**One definition per structural concept — see [`knowledge/cross-cutting/progress-md-parsing.md`](knowledge/cross-cutting/progress-md-parsing.md).** PROGRESS.md is read by ~8 independent code paths. Two shipped bugs (#27, #31) came from each path inlining its own answer to "what does this marker mean?" and "where does the milestones region end?", and in both cases every copy was wrong identically. Marker semantics live in `canonicalMarker`; the region boundary lives in `isSectionBreak`, which matches a level-2 heading **at column zero only** — never trim before testing, because `  ## Foo` indented under a list item is that item's body. Anything unplaceable is surfaced, never dropped: unreadable markers become `taskUnknown`, and task lines outside every milestone are reported by `orphanedTaskLines`.

**One definition per structural concept — see [`knowledge/cross-cutting/progress-md-parsing.md`](knowledge/cross-cutting/progress-md-parsing.md).** PROGRESS.md is read by ~8 independent code paths. Two shipped bugs (#27, #31) came from each path inlining its own answer to "what does this marker mean?" and "where does the milestones region end?", and in both cases every copy was wrong identically. Marker semantics live in `canonicalMarker`; the region boundary lives in `isSectionBreak`, which matches a level-2 heading **at column zero only** — never trim before testing, because `  ## Foo` indented under a list item is that item's body; a task's **identity** lives in `parseTaskID`, and its **extent** (the bullet plus its indented body) in `taskBodyEnd`. Anything unplaceable is surfaced, never dropped: unreadable markers become `taskUnknown`, and task lines outside every milestone are reported by `orphanedTaskLines`.

**`parseTaskID` accepts hand-written IDs; the guards' `(\S+?):` stays wider on purpose.** `FWLUP-SWEEP-1` used to read as `(no task ID)` in `repair` while `parseProgressSnapshot` was happily tracking it as a task — so 40 tasks from one audit sweep never got a commit-evidence lookup (#34). `parseTaskID` now takes `P\d+-…` (first in the alternation, so nothing that parsed before parses differently) plus an **uppercase-initial** hyphenated identifier ending in a number. Both guards matter: the trailing `-\d+` keeps `Note:` and `Fix the login:` out, the uppercase initial keeps `utf-8` / `sha-256` out, and a bogus ID is not harmless — a commit merely mentioning it becomes evidence, and the mechanical tier auto-writes `[x]` for work nobody did. **The commit side must be widened with it**: `taskIDShape` is shared with `commitNamedTaskIDs`, because leaving that index `P\d+-`-only made the `[v]` audit report every hand-written ID as unproven while `lookupCommitEvidence` found a commit naming it verbatim. `parseProgressSnapshot` / `revertEvidenceMissing` are **deliberately not converted**, and say so at the call site: they ask "what token identifies this line inside its milestone block" for flip detection, where matching too much is fail-safe and matching too little lets an out-of-scope flip past the scope guard unseen. Do not collapse them to reduce the regex count. The two merge readers — `mergeProgressState` and `resolveProgressConflict` — **were** the other exceptions and are now converted (#38), so a hand-written ID is reconciled across a worktree merge rather than silently taking whichever side was the base. Two deliberately wider, four agreeing — still not "all readers". Milestone attribution has one definition too: `taskIDNamedMilestone`, with `extractMilestoneFromTaskID` deleted (#39). Note it is a **disjunction, not a precedence**: `detectFwlupTasksForMilestone` asks `position == M || namedByID == M`, so a task whose position and ID disagree answers yes for *both* milestones rather than only its position. That is deliberate — the loop must not lose a misfiled follow-up — and the line itself is flagged by `belmont validate` as `cross_milestone_task_id` (severityError), which is where it gets fixed.

**A task is a bullet plus its body, and anything that moves one moves both.** `moveTaskLines` (repair) relocates `idx..taskBodyEnd(idx)`. Moving the bullet alone strands the `**Verification**` / `**Evidence**` lines, which then re-attach to whatever task now precedes them — and nothing catches it: the file parses, the count is unchanged, `belmont validate` reports clean (#33). A bullet nested inside another moving task's body is refused **as a separate action** — it still travels with the block enclosing it, and the warning says so and names the destination; reporting a real relocation as "left where it is" would be the same class of false statement. `taskBodyEnd` bounds the body by the task's **own indent**, not by column zero: from a nested bullet the column-zero rule ran to the end of the enclosing list item, so a move dragged unflagged sibling tasks and the parent's evidence along with it. A **blank line does not end a body** either — a loose-list task keeps its `**Evidence**` behind one — but a blank never extends the block on its own, or every move eats a separator.

**Before trusting any claim that "all readers were converted", run the grep.** `grep -n 'isSectionBreak' cmd/belmont/*.go` against `grep -n '"## "' cmd/belmont/*.go`. The first attempt at #31 converted four of the five readers it named, said it had converted all five, and the knowledge entry repeated the claim — leaving the scope guard's rebuilder on the old boundary while its own snapshot moved. (The commit that fixed it miscounted the miss as three rather than one; the number never mattered, the seam did.) A *half*-converted set is worse than an unconverted one: when the snapshot and the rebuilder disagree about where a block ends, the guard writes a file with the block's tail duplicated and the out-of-scope flip it just detected still in place, then amends that into the agent's commit and reports success.

**`canonicalMarker` (state.go) is the single source of truth for what a marker
means.** Every reader that interprets a raw marker must route through it — the
commit-evidence guard, the merge-conflict resolver, `reverify` and the scope
guard's own diff each used to compare raw bytes and disagreed with the parser,
silently. Never write `a != b` on two markers either: `markersDiffer` is the
comparison, or `[v]` → `[V]` reads as a state change and the scope guard reverts
a line nobody meaningfully edited.

**Adding a marker changes the meaning of files already in the wild, and that is
the expensive part.** `[-]` and `[V]` both used to be unrecognised — loud,
blocking, impossible to act on by accident — and now mean withdrawn and
verified. Every reader that classified markers with its own rule quietly started
doing the wrong thing with them (`resolveProgressConflict` revived withdrawals,
`mergeProgressState` ate completions without warning, an all-withdrawn milestone
rendered verified, the listing view counted dropped work as awaiting
verification). Before touching the marker set: grep every consumer of
`markerRank` / `taskStatePriority` for the special cases, and ask what the new
marker means to a file written *before* it existed.

**Every other marker parses to `taskUnknown`** — never `taskTodo`. An unknown
task is excluded from the counts, rendered `[?]`, never returned by `nextTask`,
prevents its milestone reading as complete, and makes `belmont validate` exit 1.
`nextTask`'s positive-match condition is what enforces the scheduling half — do
not rewrite it as a negative. `resolveProgressConflict` refuses to auto-resolve
a PROGRESS.md containing one, so the conflict escalates to the reconciliation
agent instead of being normalised away. See issue #27.

**What the validate gate actually covers.** Do not overstate it: `belmont auto`
runs `detectViolations` only on the **single-feature** path (`autocmd.go`), and
only aborts outright when stdin is not a TTY — interactively it prompts
`Proceed anyway? [y/N]`. `belmont auto --features` / `--all` return to
`runAutoMultiFeature` before the lint and never run it. A milestone holding an
unknown marker can never read as complete and cannot be cleared by
`skipMilestoneInProgress` (its regex is `[ >]` — it clears todo and in-progress
tasks only, and since #40 leaves `[!]` alone too), so on the ungated paths the
loop alternates phases until `--max-iterations`. `belmont repair` is the route
out — it settles what a commit proves and has an agent read the rest against the
code; hand-editing the marker also works.

**Violations carry a severity, and only errors stop anything.** `severityError`
means the loop cannot proceed correctly — an unrecognised marker, colliding
milestone IDs, a polish-milestone name, a cross-milestone task ID. These block
`belmont auto` and make `belmont validate` exit 1. `severityWarning` is
information Belmont refuses to drop but that breaks nothing downstream —
`task_outside_milestone`, because a `- [ ]` bullet in a retro is not work, and
`unreadable_live_milestone`, which says a milestone — or, on the serial and
multi-feature path, a whole feature — was linted against master because its
worktree copy could not be read (#48). The second one is a statement
about coverage rather than about the file, so it carries no remedy and must not
block: a half-cleaned worktree is not a reason to refuse a run that worked
yesterday. Warnings print in `status` and `validate`, exit 0, and auto continues;
`belmont validate --strict` exits 1 on them for CI. **`splitBySeverity` treats
an unset severity as blocking on purpose** — a new rule that forgets the field
fails loudly instead of being silently downgraded to advice. The split exists
because upgrading Belmont must never refuse a run that worked the day before
over something it merely wants to mention.

**Colliding `### M<n>:` headings are refused before the loop starts, on every
path.** `requireUnambiguousMilestones` runs ahead of both the single- and
multi-feature branches and is not overridable. `progressSnapshot.ByID` holds one
block per ID, so a duplicate makes `runScopeGuard` and `runEvidenceCheck` both
decline — and the multi-feature path never reaches the lint, so without this
preflight a stray session note shaped like a milestone header would run a whole
feature with both runtime guards silently absent.

### Milestone status: always computed from tasks
- All `[v]` → verified
- All `[x]` or `[v]` → done (needs verification)
- Any `[>]` → in progress
- Any `[!]` → has blockers
- All `[ ]` → not started

### Feature/master status: computed from milestones

### Key rules
- **No emoji on milestone headers** — milestone status is computed, not stored. Headers are `### M1: Name`.
- **No `## Blockers` section** — blocked tasks are `[!]` checkboxes. The Go CLI counts them directly.
- **No `## Status:` line** — overall status is computed from task states.
- **Follow-up tasks** are plain `[ ]` entries added to the relevant milestone (no special FWLUP format).
- **Reverify** finds milestones with `[x]` (done, not verified) tasks and re-verifies them. On success: `[x]` → `[v]`.
- **Master PRD.md** is a living global document (vision, constraints, cross-cutting decisions). No features table. Actively curated — edit/remove stale info.
- **Master TECH_PLAN.md** is a living global document for cross-cutting architecture. Same active curation.
- **Master PROGRESS.md** has the features table: `| Feature | Slug | Priority | Dependencies | Status | Milestones | Tasks |`. Status/Milestones/Tasks are computed. Priority and Dependencies are manually set during planning.

### Go CLI state parsing
- `parseMilestones()` reads milestone headers and task checkboxes from PROGRESS.md, building `milestone` structs with embedded `[]task` slices
- `flattenTasks()` extracts tasks from milestones for flat task lists
- `milestoneAllDone(m)`, `milestoneAllVerified(m)`, `milestoneHasBlockers(m)`, `milestoneNotStarted(m)` — computed helpers, used throughout decision logic
- Task state enum: `taskTodo`, `taskInProgress`, `taskDone`, `taskVerified`, `taskBlocked`
- `blockedTaskCount()` / `blockedTaskNames()` replace old blocker section parsing
- `parseMasterDeps()` reads Priority + Dependencies from master PROGRESS.md features table (not from master PRD.md)

## Architecture

Belmont is an agent-agnostic AI coding toolkit. It installs markdown-based **skills** (workflow prompts) and **agents** (sub-agent instructions) into any AI coding tool's project directory.

### Key directories

- `cmd/belmont/main.go` — Single-file Go CLI. All logic lives here (status parsing, installer, updater). No external dependencies.
- `cmd/belmont/embed.go` — `//go:embed` directives for release builds (build tag: `embed`). Embeds `skills/`, `agents/`, and `prompts/` into the binary.
- `cmd/belmont/embed_dev.go` — Empty embed vars for dev builds (build tag: `!embed`). Allows `go run` without embedded content.
- `skills/belmont/` — Skill markdown files (product-plan, tech-plan, implement, next, verify, status, reset). These are the source-of-truth copied/linked into target projects.
- `skills/belmont/_partials/` — Shared content blocks used by skill templates (identity-preamble, forbidden-actions, progress-template, dispatch-strategy).
- `skills/belmont/_src/` — Skill template files with `@include` directives. Processed by `generate-skills.sh` to produce `skills/belmont/*.md`.
- `skills/belmont/_src/references/` — Progressive-disclosure detail files (`<skill>-<topic>.md`). Copied verbatim to `skills/belmont/references/` by `generate-skills.sh`. Skill bodies point at them via relative `references/*.md` paths rather than inlining the content, so the detail only loads when the skill actually needs it. Prefix-matched per skill into `plugin/skills/<name>/references/` by `generate-plugin.sh`.
- `agents/belmont/` — Agent instruction markdown files (codebase-agent, design-agent, implementation-agent, verification-agent, code-review-agent, reconciliation-agent). Copied into target projects.
- `prompts/belmont/` — AI prompt templates used by the CLI (e.g. `ai-decision.md`, `post-verify-triage.md`). Loaded via Go `text/template` with dynamic context injection. Embedded in release builds.
- `scripts/build.sh` — Regenerates skills from templates, copies skills/agents/prompts into `cmd/belmont/`, builds with `-tags embed` and ldflags version injection, then cleans up.
- `scripts/release.sh` — Regenerates skills, verifies build, generates CHANGELOG entry, commits, creates annotated git tag.
- `scripts/generate-skills.sh` — Generates skill files from `_src/` templates + `_partials/`. Supports `--check` to verify files are up to date.
- `.github/workflows/release.yml` — GitHub Actions: cross-compile on tag push, create GitHub Release with binaries.
- `install.sh` (root) — Public curl-pipe-sh installer for end users.
- `bin/install.sh` / `bin/install.ps1` — Developer bootstrap scripts that build from source.
- `docs/` — Reference documentation (cli-commands, supported-tools, skills-reference, workflow, directory-structure, prd-format, agent-pipeline, updating, troubleshooting).

### How the installer works

`belmont install` syncs skills and agents into a target project. In release binaries, content is extracted from the embedded filesystem. In dev builds, it reads from a source directory.

1. **Embedded mode** (release binary, no `--source`): extracts from `embed.FS`
2. **Source mode** (`--source` flag or `BELMONT_SOURCE` env): reads from filesystem
3. Phase 2: skills install as agentskills.io folder layout (`.agents/skills/belmont/<skill>/SKILL.md` with required `name:` + `description:` frontmatter). All eight supported CLIs auto-discover `.agents/skills/` natively for skill content. Three tools get additional autocomplete wiring in `setupTool`: Claude Code (`.claude/agents/belmont` symlink + per-skill slash-command symlinks at `.claude/commands/belmont/<skill>.md` → `/belmont:<skill>`), opencode (generated wrapper commands at `.opencode/command/belmont/<skill>.md` → `/belmont/<skill>`), and Codex (generated per-skill UI metadata at `<skill>/agents/openai.yaml` with `interface.display_name: "belmont:<skill>"` so `$belmont` lists all skills in the `$`-mention popup — Codex's `/` menu is built-ins only and not extensible). The remaining tools (Cursor, Windsurf, Gemini, GitHub Copilot, Pi) need zero per-tool wiring. **Conditional skills** (the `conditionalSkills` map — currently just `loop`) are gated twice, and both gates matter. `loop` is *runnable* by Claude Code (delegates to `/loop`) and Codex (delegates to `/goal`). (1) **Shared surface**: only a selected tool that lacks a private delivery path publishes it, so Codex publishes and Claude does not — a Claude-only install keeps `loop` off `.agents/skills/` and gets a real `.claude/commands/belmont/loop.md` file instead; with Codex co-selected the folder exists and Claude gets the normal symlink. The decision is made once per install by `resolveSharedSurfaceSkills` and is **sticky**: an already-installed copy counts as evidence, because `belmont update` re-runs `install --tools all` → *detected* tools, and a pure-selection rule would let any machine without `codex` on PATH prune a folder its Codex teammates committed, auto-commit the deletion, and flap it back on the next update. (2) **Per-tool commands**: `syncSkillCommands` skips skills the owning tool can't run, so a `codex,opencode` install never generates a dead-end `/belmont/loop` for opencode even though the folder is right there. See `knowledge/cross-cutting/skill-format.md`.
4. `runLegacyCleanup` runs before per-tool setup, idempotently removing any pre-Phase-2 install artifacts (`.codex/belmont`, `.cursor/rules/belmont`, `.windsurf/rules/belmont`, `.gemini/rules/belmont`, `.copilot/belmont`, the dead `.claude/skills/belmont` / `.claude/plugins/belmont` attempts, `belmont:skill-routing` sections in `AGENTS.md`/`GEMINI.md`, stale flat skill files at `.agents/skills/belmont/*.md`). `.claude/commands/belmont` is NOT legacy — it's the active Claude Code install path. Detection signals for tool selection: conventional dir presence, tool binary on PATH, or pre-existing Belmont section in `AGENTS.md` / `GEMINI.md` — see `detectTools`.
5. Removes legacy Belmont-managed root `SKILLS.md` (if present from older installs)
6. Creates `.belmont/` state directory with PRD.md and PROGRESS.md templates
7. Cleans stale files — if a skill was renamed/removed in source, the old file is deleted from the target

Source resolution order (source mode only): `--source` flag > `BELMONT_SOURCE` env > `~/.config/belmont/config.json` > walk up from CLI binary location.

### CLI commands

The Go CLI (`cmd/belmont/main.go`) provides: `install`, `update`, `status`, `auto` (alias: `loop`), `reverify`, `repair`, `blockers`, `sync`, `recover`, `steer`, `validate`, `version`. All commands support `--format json` for machine-readable output. The `status` command parses `.belmont/PROGRESS.md` to extract tasks, milestones, and computed statuses. PRD.md is only read for the feature name. When `auto` is running, `status` reads live state from active worktrees via `.belmont/auto.json`. The `auto` command automates end-to-end feature implementation by shelling out to AI tool CLIs (Claude Code, Codex, Gemini, Copilot, Cursor) in headless mode. It supports milestone dependencies with `(depends: M1)` syntax in PROGRESS.md, enabling parallel execution via git worktrees when milestones are independent. Each worktree gets isolated `.belmont/` state (copy-based, not symlinked) so AI agents commit state changes as part of their feature branch. Each worktree is assigned a unique `PORT`/`BELMONT_PORT` env var for dev server isolation, and `.belmont/worktree.json` provides user-configurable setup/teardown hooks (e.g., `npm install`). The `reverify` command finds milestones with `[x]` tasks (done but not verified) and runs verification on each sequentially. On success tasks are marked `[v]`; on failure, new `[ ]` follow-up tasks are added. Supports `--from`/`--to` range filtering and `--tool` to specify the AI tool. The `repair` command is the healer for a PROGRESS.md whose task states no longer parse — the damage #27 and #31 made legible but could not fix. Hybrid, like `reverify`: a mechanical tier runs `lookupCommitEvidence` per task ID at zero token cost (a commit naming the ID proves the work happened, so the marker becomes `[x]`), then an agent reads whatever survived against the current code. **Evidence-first, never memory-first** — it never asks what a marker meant, because a damaged file carries dozens at once and the honest answer months later is a guess, which is issue #27 again. The action set is closed (`set_marker` / `move_milestone` / `withdraw` / `leave` / `escalate`) and the cause travels as a reason string; `validateRepairPlans` is the single gate, whoever proposed the action. Capped at `[x]` — repair never mints `[v]`. Withdrawal is `[-]` plus the reason in `## Decisions Log`, never a deletion. It never creates, renames or removes a milestone (moving a task between existing ones is allowed **only** because repair runs outside the auto loop, where `runScopeGuard` is not running), never touches a line it did not flag, and refuses a file with a repeated `### M<n>:` heading. Repair also runs one **audit** that is not a repair: every task marked `[v]` that no commit in this repository settles — no commit names it, or one does but another feature's PROGRESS.md claims the same task ID, which makes the match no evidence at all (task IDs are feature-local, the commit log is not; same rule `taskIDsClaimedElsewhere` applies to the mechanical tier). That is the mirror of `runEvidenceCheck` for the half the guard cannot see — it compares a phase's before and after, so a `[v]` already on disk when a run started is never a flip and is audited by nothing, ever. It is reported separately from the parse findings (those lines are illegal; a stale `[v]` is merely unproven, and folding it in would mean a clean file never reads clean) and is **never applied mechanically**: no commit is not proof of no work, so `leave` is a first-class verdict for docs- or config-only tasks. The remedy when the claim does not hold is `set_marker "x"`, which hands the flip back to `belmont reverify`. **One line, one finding, one action** — a `[v]` filed under a milestone its ID does not name that no commit names is both a parse finding and an audit finding, so `reviewable` carries a single entry per line (the parse finding, flagged `AlsoUnverified`); the gate accepts exactly one action per line, so two entries asked an obedient agent for an action that would then be refused. See [`knowledge/cross-cutting/progress-repair.md`](knowledge/cross-cutting/progress-repair.md). The `blockers` command is the decision queue — every `[!]` task across every feature (or one, with `--feature`), grouped by feature and milestone, with each task's indented body intact so the question is readable. `[!]` is the one marker no agent can clear, and until this command the only surface for it was `belmont status`, which prints each blocker's headline but never the indented body where the question actually lives, and never groups the queue across features; a single overnight run banked 19 of them and nothing showed them together. It reports and never writes — a command that both raises a question and resolves it is free to guess the answer. `--summary` drops the bodies for a scannable view (and is what skills should call), `--format json` for machines. `renderStatus` names it after the detail view's blocked list, and `renderFeatureListing` caps blockers at `blockedListingCap` per feature and prints the withheld count plus the exact command. See [`knowledge/cross-cutting/human-gated-blockers.md`](knowledge/cross-cutting/human-gated-blockers.md). The `sync` command updates the master `.belmont/PROGRESS.md` feature table to match computed feature-level states (explicit command only). The `recover` command manages preserved worktrees from failed merges — listing, retrying merges with improved error handling, or cleaning up. It **refuses to act on a worktree the running wave still owns**: `activeRunWorktrees` reads the same `.belmont/auto.json` the process already has open, `--list` marks those `[IN FLIGHT]`, and `--merge` / `--clean` / `--clean-all` decline on them unless `--force` is passed. Before #52 there was no such filter, so `recover --list` mid-run reported the live wave's worktrees as preserved leftovers and offered `--clean-all` on them — a one-keystroke path to deleting work in flight. The `steer` command injects user instructions into an in-flight auto run: it appends a pending entry to `STEERING.md` inside each active worktree (or the master feature dir for serial runs). `executeLoopAction` consumes matching entries before each phase, prepending them to the agent prompt as a higher-priority block than NOTES.md. Consumed entries are dropped from disk and `STEERING.md` is deleted once no pending entries remain — the live file only exists while there's unread instruction, so skills exploring the feature dir don't re-read steering text that's already in the prompt. The audit trail lives in the auto run's stderr (`[STEERING] injected …` lines with timestamps). `copyBelmontStateToWorktree` preserves the worktree's STEERING.md across the state copy (master never holds STEERING.md, so without this the copy would clobber pending user instructions); the copy itself now only runs when seeding a **fresh** worktree — `createWorktreeIfNeeded` returns early on resume, because replacing a preserved worktree's feature dir destroys the completions it earned before pausing. In `runAutoParallel`, single-milestone waves only take the master-tree shortcut when no branch/worktree already exists; if one does, the wave routes through `runWaveParallel` so the resume prompt fires and worktree-local state is honoured. The `validate` command lints PROGRESS.md for milestone-structure violations (polish/follow-up milestone names, cross-milestone task IDs like `P3-FWLUP-M2-1` sitting under a non-M2 milestone). It runs at `belmont auto` startup and is available standalone. Violations surface the polish-milestone anti-pattern (see [`knowledge/cross-cutting/milestone-immutability.md`](knowledge/cross-cutting/milestone-immutability.md)); fix via `/belmont:tech-plan`. The `update` command self-updates by downloading the latest release from GitHub, then auto-commits Belmont-managed files (`.agents/`, `.claude/commands/belmont`, etc.) via `commitBelmontUpdate` on the user's behalf — opt out with `--no-commit`. The `auto` command refuses to start when the working tree is dirty (`requireCleanWorkingTree`); opt out with `--allow-dirty`. See [`knowledge/auto-mode/clean-tree-preflight.md`](knowledge/auto-mode/clean-tree-preflight.md).

### Runtime scope guards (Layers 1 + 2)

`executeLoopAction` snapshots `PROGRESS.md` before every agent shell-out and re-parses it after. `runScopeGuard` reverts (a) new milestone headings added during any non-`actionReplan` phase and (b) checkbox flips on tasks outside the action's target milestone. `runEvidenceCheck` reverts `[v]` flips whose task ID has no commit in the current branch's history since the merge base. Both guards amend the agent's last commit (best-effort) and append a `(pending)` entry to `STEERING.md` so the next phase's prompt carries an explicit correction. These guards run outside the agent subprocess — `git commit --no-verify` does not bypass them. When changing this area, re-read [`knowledge/auto-mode/scope-guard-runtime.md`](knowledge/auto-mode/scope-guard-runtime.md) and [`knowledge/auto-mode/verify-evidence.md`](knowledge/auto-mode/verify-evidence.md) before weakening anything.
