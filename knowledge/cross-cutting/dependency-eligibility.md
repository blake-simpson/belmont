# Dependency Eligibility Has One Definition

**Domains:** cli, state, skills, auto-mode

**Why this matters.** `(depends: M<n>)` on a milestone heading used to have one implementation and one caller: `computeWaves`, from `runAutoParallel`. Everything else — `nextMilestone`, `nextTask`, both status views, `/belmont:implement`'s prose selection, `/belmont:next`'s, `/belmont:loop`'s step 0 — was document-order only. So on a feature whose first pending milestone declared unmet deps (`### M16: … (depends: M15, M21, M22)` with M21/M22 not started), every surface that recommends work named the one milestone that must run last, and `belmont auto`'s interactive range prompt defaulted to a range "starting" at it (issue #59, live on PR #32's feature). Execution was never wrong — `autocmd.go` routes to wave-ordered `runAutoParallel` whenever any in-range milestone has deps, so `computeWaves` reorders whatever it is given. The damage was entirely to what humans and skills were told.

## Invariant

- **One predicate.** `depSatisfied` (state.go) is the definition of a satisfied dependency reference: the named milestone is **all-done** (`milestoneAllDone` — done-not-verified already unblocks dependents in wave scheduling), or names no milestone (a dangling reference cannot block; `computeWaves` has always ignored one). `computeWaves`' in-degree count, `nextMilestone`, `nextTask`, and `nextBlockedMilestone` all consult it. Do not inline a second answer, and note it is *all-done*, not *all-verified* — tightening it would make status disagree with the wave scheduler about what is blocked.
- **`nextMilestone` returns the first not-all-done milestone in document order whose deps are met.** `nextTask` offers only tasks whose milestone passes the same test. The positive-match condition in `nextTask` (workable states only, `TestUnknownMarkerIsNeverScheduled`) is untouched — the dependency filter layers on top of it.
- **nil `nextMilestone` is ambiguous, and the render must disambiguate.** When undone milestones remain but every one is dependency-blocked (a cycle, in practice), `nextBlockedMilestone` reports the first undone milestone and its unmet deps, and both views print `(waiting on dependencies) M<a> depends on M<b> (status: …)` — the `scanReadiness` shape. **Never "None":** `loop-recipe.md` stops the interactive loop when "Next Milestone: None" prints with no unverified warning, so a nil-renders-as-None here would make `/belmont:loop` report COMPLETE over pending work. `next_blocked` carries the same information in `--format json`.
- **The prose selectors state the same rule** in `implement.md` Step 1, `next.md` Step 1, `loop-recipe.md` step 0, and `status.md`'s manual-fallback contract — dual-invocation: the Go fix alone corrects the report, not the action, because `/belmont:implement` selects in prose with no CLI involved.

## How it's enforced

- `depSatisfied` / `milestoneDepsMet` / `nextBlockedMilestone` in `cmd/belmont/state.go`, consumed by `computeWaves` (feature.go) and the selectors.
- Tests in `cmd/belmont/deps_next_test.go`: the #59 repro shape (first-in-file blocked milestone is skipped, milestone- and task-level), done-not-verified satisfies a dep, dangling dep does not block, and the two render tests that pin "(waiting on dependencies)" over "None" in both views.
- Tier 1's `multi-milestone-deps` fixture pins wave shape through the shared predicate.

## Failure mode if you break it

- Second inline predicate → the scheduler and the status views disagree about what is blocked; that is the #27/#31 shape (each reader answering a structural question itself, all identically wrong later).
- nil-on-blocked rendering "None" → `/belmont:loop` reports COMPLETE on unfinished work.
- Tighten dep-met to all-verified → status calls milestones blocked that auto is actively scheduling.

## Don't re-do

- **"Have `nextMilestone` return `computeWaves`' first wave's first element."** Rejected: wave members sort numerically while `nextMilestone` has always been document order; for dep-free files the two must stay byte-identical, and wave sorting would silently reorder them. Sharing the predicate, not the traversal, keeps the old behaviour exactly where deps are absent.
- **"Narrow `interactiveMilestoneSelect`'s default range to the first eligible milestone."** Rejected: the default range must span every undone milestone. `--from M21` *excludes* an earlier dep-blocked M16 from the range entirely, which is worse than displaying it first — execution reorders via `computeWaves` regardless, and the picker prints each milestone's `(depends: …)` inline.
- **"Add deps to the AI-decision `milestone_states` JSON."** Not needed: `runLoop` (and with it `decideLoopAction*` and the AI prompt) is only reached when **no** in-range milestone has deps — `autocmd.go` routes to `runAutoParallel` otherwise — so the field would always be empty on the path that would read it.
- **"Mark human-executed milestones with a new heading annotation so loops skip them."** (#58's candidate 3.) Rejected the same way `[a]` was in [`human-gated-blockers.md`](human-gated-blockers.md): `[!]` with a reason line already means "waiting on a person", every reader handles it, and a new annotation changes the meaning of files already in the wild. `loop-recipe.md` step 0 now applies triage's human-gated class *at selection time* — work the spec assigns to a person is marked `[!]` before any agent is dispatched at it.

## Evidence

Issue #59: `belmont status --feature ux-design-rework` on `feat/design-contract` named M16 — `(depends: M15, M21, M22)`, a human-executed gating run whose graders M21/M22 exist to change — as Next Milestone, and an unbounded `/belmont:implement` picked it with no CLI involved. Issue #58 is the loop-side symptom on the same feature.

## Revisions

- 2026-08-18 — Created, closing #59 (with #58's loop bounding in the same PR). Records the shared predicate, the never-"None" render rule, and the rejected alternatives.
