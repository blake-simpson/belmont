# Belmont Knowledge Index

Curated operational knowledge for working on Belmont itself. Scan the table below, open only the entries that match what you're touching. Every entry is self-contained — one read per entry is sufficient; there are no required chain lookups.

## How to use

- **Before non-trivial architectural work** (skills, CLI, parallel mode, state model, agent coordination), scan this index. Entries are grouped by domain; match the "Read when you're about to…" column to what you're doing.
- **Open only relevant entries.** If you're changing `runScopeGuard`, you need `auto-mode/scope-guard-runtime.md` — you don't need `cross-cutting/port-isolation.md`. Skip files that don't match.
- **Amend, don't append.** When you make a change that updates an entry's truth, edit the entry in place and add one line to its `Revisions` footer. Do not add a new dated block at the top.
- **Cross-domain chronology comes from git log.** `git log --oneline -- knowledge/` gives you the full history of decisions across every topic. There is no global decision log file; it would bloat unbounded and duplicate git.
- **Every entry follows the same skeleton** so you can jump to the section you need: `Why this matters` → `Invariant` → `How it's enforced` → `Failure mode if you break it` → `Don't re-do` → `Evidence` → `Revisions`. Cross-cutting entries additionally carry a `Domains:` header line.

## When to read which entry

### Auto-mode specific

| Entry | Read when you're about to... |
|---|---|
| [auto-mode/scope-guard-runtime.md](auto-mode/scope-guard-runtime.md) | change `runScopeGuard` / `diffScopeViolations` / `rebuildAfterScopeGuard`, propose a new runtime enforcement for parallel mode, or weaken any post-phase check |
| [auto-mode/parallel-wave-orchestration.md](auto-mode/parallel-wave-orchestration.md) | change `runWaveParallel`, `runMilestoneInWorktree`, `copyBelmontStateToWorktree`, `gracefulShutdown`, merge sequencing, or the live-status overlay |
| [auto-mode/verify-evidence.md](auto-mode/verify-evidence.md) | change `runEvidenceCheck`, `taskHasCommit`, how verify marks `[v]`, or design a new evidence contract |
| [auto-mode/clean-tree-preflight.md](auto-mode/clean-tree-preflight.md) | touch `requireCleanWorkingTree`, `commitBelmontUpdate`, `belmontManagedPaths`, the `--allow-dirty` / `--no-commit` flags, or weaken auto's startup contract that the working tree must be clean |
| [auto-mode/multi-feature-scheduling.md](auto-mode/multi-feature-scheduling.md) | change `computeFeatureWaves`, `filterWaveByBlocked`, `runAutoMultiFeature`'s wave/skip plumbing, the pause→dependents cascade, `scanReadiness`, `resolveFeatureSlugs` ordering, or the `MaxParallel <= 1` serial-merge branch |
| [auto-mode/resume-rebase.md](auto-mode/resume-rebase.md) | touch `rebaseWorktreeOnMain`, `announceWorktreeRebase`, `handleStaleWorktree`'s `[r]`-resume path, or the dirty-tree / conflict policy for picking up sibling merges on resume |
| [auto-mode/worktree-state-isolation.md](auto-mode/worktree-state-isolation.md) | touch `untrackBelmontInWorktree`, `syncFeatureStateAfterMerge`, `commitWorktreeChanges`, or `copyBelmontStateToWorktree`'s git handling — or propose *any* git-exclude / gitignore mechanism for `.belmont/` inside a worktree |

### Cross-cutting (multiple domains)

| Entry | Domains | Read when you're about to... |
|---|---|---|
| [cross-cutting/milestone-immutability.md](cross-cutting/milestone-immutability.md) | skills, state, auto-mode | edit any skill that writes PROGRESS.md, add a new milestone, or design how follow-ups / polish / fixes are routed |
| [cross-cutting/port-isolation.md](cross-cutting/port-isolation.md) | cli, skills, agents | touch `buildWorktreeEnv`, `worktree-awareness.md`, or any agent logic that starts a server or probes a URL |
| [cross-cutting/steering.md](cross-cutting/steering.md) | cli, skills, auto-mode | change `belmont steer`, `consumePendingSteering`, STEERING.md lifecycle, or have another guard inject its own correction |
| [cross-cutting/skill-format.md](cross-cutting/skill-format.md) | cli, skills, agents | touch `generate-skills.sh`, the SKILL.md frontmatter shape, per-tool install wiring, `syncSkillsFolderDir`, `runLegacyCleanup`, or add support for a new AI CLI |
| [cross-cutting/dual-invocation-paths.md](cross-cutting/dual-invocation-paths.md) | cli, skills, agents, auto-mode | plan or change anything that touches tool integration, skill content, sub-agent dispatch, model-tier handling, or the on-disk surface — both auto mode and interactive mode must be addressed |
| [cross-cutting/monorepo-workspaces.md](cross-cutting/monorepo-workspaces.md) | cli, skills, agents | touch `detectWorkspaces` / `resolveWorkspaces` / `seedWorkspaceEnv` / `monorepoEnvVars`, modify `worktreeHooks.Workspaces`, or change how skills/agents read the BELMONT_MONOREPO* env vars |
| [cross-cutting/dependency-eligibility.md](cross-cutting/dependency-eligibility.md) | cli, state, skills, auto-mode | touch `depSatisfied` / `nextMilestone` / `nextTask` / `nextBlockedMilestone`, change what `(depends: …)` means anywhere, alter the "Next Milestone" render, or make any surface recommend what to work on next |
| [cross-cutting/debug-spec-reconciliation.md](cross-cutting/debug-spec-reconciliation.md) | skills, state | change `debug-manual.md`, `debug-scope-rules.md`, `feature-detection-multi.md`, or `references/debug-manual-spec-reconcile.md`; weaken or extend the spec-edit relaxation; or wire `debug-manual` into a non-interactive code path |
| [cross-cutting/progress-md-parsing.md](cross-cutting/progress-md-parsing.md) | cli, state, auto-mode | touch `canonicalMarker` / `markerRank` / `isSectionBreak` / `orphanedTaskLines`, add a reader of PROGRESS.md structure, or write any inline regex for a marker or a `## ` boundary |
| [cross-cutting/progress-repair.md](cross-cutting/progress-repair.md) | cli, skills, state | change `belmont repair` or its skill, add an action to the repair set, alter what the mechanical tier auto-applies, or design any tooling that asks a human what a task's state used to be |
| [cross-cutting/verified-flip-recording.md](cross-cutting/verified-flip-recording.md) | skills, cli, state, auto-mode | change how `[v]` is recorded, touch `verify.md`'s Mark Verified Tasks section or the verify report format, alter `computeOverallStatus` / `doneNotVerifiedTasks` / the `belmont status` done-but-unverified warning, or change any stop condition that treats `Complete` as finished |
| [cross-cutting/human-gated-blockers.md](cross-cutting/human-gated-blockers.md) | skills, cli, state, auto-mode | change `belmont blockers` / `buildBlockers` / `blockedListingCap`, alter how `[!]` is written or read, change how a loop reacts to a blocked task, or design any triage that classifies follow-up work |
| [cross-cutting/model-tier-economics.md](cross-cutting/model-tier-economics.md) | agents, skills, cli, auto-mode | add a `model:` pin to any `agents/belmont/*.md`, change the `modelTiers` registry or `planningTier`/`reconciliationDefaultTier`, touch how `models.yaml` tiers resolve to a dispatch model, or trade model quality against token cost |
| [cross-cutting/dispatch-authorization.md](cross-cutting/dispatch-authorization.md) | skills, agents, auto-mode | change `dispatch-strategy.md`'s approach selection, weaken the rule that the choice turns on tool presence alone, or debug an orchestrator that silently ran its agents inline |
| [cross-cutting/codex-plan-handoff.md](cross-cutting/codex-plan-handoff.md) | skills, cli | touch `codex-plan-apply`, the `BELMONT_PLAN_PACKET` emit logic in `product-plan`/`tech-plan`, or design how a tool-specific skill is scoped to one CLI without mechanical install gating |

### Meta

| Entry | Read when... |
|---|---|
| [meta/validated-runs.md](meta/validated-runs.md) | proposing "let's simplify" or "we don't need X anymore" for any guard — cross-reference against the preserved proof branches before touching load-bearing code |
| [meta/evals.md](meta/evals.md) | adding or changing an eval fixture, or about to claim a change to skill **prose** is safe — offline evals cannot license that, and the tier split explains why |

## Maintenance rules

- **Per-topic, not per-session.** Amend existing entries rather than appending dated blocks.
- **Keep each entry under ~200 lines.** Split if it balloons. Two related topics with clear boundaries are better than one overstuffed file.
- **`Revisions` footer per amendment.** One line: `YYYY-MM-DD — what changed`.
- **New topic → new file + new row in this index.** Do not inline entry content into KNOWLEDGE.md.
- **Two entries covering the same ground → merge, delete the loser.** Then update this index.
- **If you change an entry, confirm the routing-table "Read when..." still matches.** A stale trigger is worse than no trigger.
