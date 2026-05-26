# AGENTS — Belmont v1.0 rebuild

You are working on the **v1.0 pi-native rebuild** of Belmont. This is a
pristine cut off `v0.10.7-final`; the prior `feature/belmont-rework` branch
(M1–M9 of the abandoned v1.0 experiment) is the **discard pile** — do NOT
mine it for code or patterns.

## Where to find what

| Topic | Source of truth |
|---|---|
| Master plan (sections §0–§19) | `~/Desktop/belmont-pi-planning-v2.3.md` (lives outside the repo by the author's choice; treat as read-only authoritative reference) |
| Dogfooded knowledge for this repo | `.belmont/BELMONT.md` (entry point), `.belmont/memory/{subsystems,decisions,constraints,prds,episodic,steering}/`, `.belmont/preferences.md`, `.belmont/PROGRESS.md`, `.belmont/models.json` |
| Decision audit (only D-001 so far) | `.belmont/memory/decisions/D-001-omp-evaluation.md` |
| Current milestone state | `.belmont/PROGRESS.md` (M0–M11, byte-faithful PROGRESS grammar per plan §5.1) |

## Read order before designing anything

1. `.belmont/BELMONT.md` — identity, PR/FAQ, master PRD index, memory map.
2. `.belmont/PROGRESS.md` — what's done, what's in flight, what's next.
3. `~/Desktop/belmont-pi-planning-v2.3.md` — the relevant §17 milestone(s)
   for the task, plus any §-references the milestone cites (§3, §4, §5,
   §7, §8, §9 are the load-bearing architecture sections).
4. The ADRs under `.belmont/memory/decisions/` whose `## Why this matters`
   line matches your task.

## Hard rules (from §2 Locked Constraints)

- **Pi is the harness.** Belmont ships as a pi extension via npm. No
  custom TUI, no fork.
- **Sequential auto mode, two pi runtimes.** No worktrees. No parallel.
  No `belmont __guard` / `__worker` subprocesses.
- **4-package pnpm monorepo.** Strict dep direction:
  `@belmont/cli → @belmont/harness → @belmont/skills → @belmont/knowledge-schema`.
  Only `@belmont/harness/src/pi/*.ts` may import
  `@earendil-works/pi-coding-agent`. The `pi-boundary` test +
  `dependency-cruiser` config mechanically enforce this.
- **Living, indexed memory under `.belmont/memory/<kind>/`.** Amend in
  place; git log is the chronology. No append-only decision logs.
- **PROGRESS.md grammar from legacy ported byte-faithfully** (5 markers
  `[ ] [>] [x] [v] [!]`; milestone status always computed, never stored).
- **Standalone skill contract**: skills probe for `belmont_transition`
  and fall back to plain `Edit` on `PROGRESS.md` so they run in vanilla
  Claude Code / Codex CLI / Cursor.
- **NPM is the primary distribution channel.** No bun-compile binary
  in v1.0 (deferred to v1.1).
- **Belmont owns pi's version.** Pi is exact-pinned across v1.x.

## Author smoke is the ship gate

Every non-trivial change ends with a copy-paste-ready author-smoke block
in the milestone PROGRESS entry. The §18 author smoke is the v1.0.0
ship gate — not unit tests.

## Branch + commit hygiene

- Current branch: `v1-rebuild`. Tagged anchor: `v0.10.7-final`.
- Never co-author commits. Never push without explicit user ask.
- One commit per milestone landed; the commit message names the
  milestone (`M0: …`, `M1: …`) and lists the deliverables against the
  §17 "Done when" checklist.
