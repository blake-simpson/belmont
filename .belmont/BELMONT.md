---
schema: belmont.entrypoint.v1
updated_at: 2026-05-26
---

# Belmont

## Identity

Belmont is a pi-native coding harness — the user runs `belmont`, the pi
REPL boots with the Belmont extension preloaded, and a structured memory
+ REPL-native auto mode + per-milestone model tiering let one developer
drive a multi-feature codebase from one keyboard. v1.0 is a from-scratch
rewrite starting from `v0.10.7-final`; the legacy (Go binary at v0.10.x
→ bun-compile pi-experiment at v1.0-experiment, with worktree
parallelism) is the reference for what NOT to re-do.

## PR/FAQ

### Future press release (2026 Q4)

> Belmont v1.0 ships today as a pi-native coding harness. The single
> developer who runs `belmont` can plan, implement, verify, and ship a
> multi-feature codebase using only their keyboard — typing in the REPL
> while a side panel shows live milestone progress, an auto worker
> drives sequential tasks in fresh sub-sessions, and per-milestone model
> overlays route Claude Sonnet to Swift code, Opus to UI, and a local
> Qwen to status queries. RTK and pi-lean-ctx cut context costs by
> 60-90%. No worktrees, no parallel scheduler, no headless framing —
> auto IS the REPL. The 4-package monorepo
> (`@belmont/{knowledge-schema, skills, harness, cli}`) ships skills
> standalone-installable in any agentskills.io CLI. The legacy v0.10.x
> Go-binary architecture and the abandoned v1.0-experiment's worktree
> complexity are both gone.

### FAQ

- **Q. Why pi as the runtime?** Free for the user; no per-call
  `claude -p` / `codex -p` charges; extensible via the documented hook
  surface.
- **Q. Why no parallel mode?** The legacy v1.0-experiment burned weeks
  on worktree + IPC complexity for a single-developer use case that
  benefited zero from parallelism. Sequential auto is what the user
  actually needs.
- **Q. Why directory-per-kind for memory?** Verona's reference + the
  brief's vocabulary ("PRDs, ADRs, subsystems, constraints") map to
  directories 1:1.
- **Q. Why two runtimes?** Same-runtime `newSession` would clobber the
  REPL's context. Runtime B isolates the worker's session lifecycle.

## Master PRD

### prd-knowledge-model

Status: planned. Brief: ship the directory-per-kind memory layout with
amend-in-place enforcement at the `tool_call` hook. →
`memory/prds/prd-knowledge-model.md` (to be authored at M5).

### prd-auto-mode

Status: planned. Brief: ship REPL-native sequential auto with two pi
runtimes and fresh sub-session per task. →
`memory/prds/prd-auto-mode.md` (to be authored at M8).

### prd-multi-model-tiers

Status: planned. Brief: ship `models.json` + per-milestone HTML-comment
overlay + 4-layer resolver. → `memory/prds/prd-multi-model-tiers.md`
(to be authored at M7).

### prd-tui

Status: planned. Brief: 2-pane TUI with hotkey-driven nav, status bar,
panel toggle + auto-open-on-/belmont:auto. →
`memory/prds/prd-tui.md` (to be authored at M6).

### prd-v1-rebuild-masterplan

Status: locked. Authoritative spec for the entire v1.0 rebuild,
including all 12 milestones (M0–M11) and the §18 author smoke ship
gate. Lives outside the repo at
`~/Desktop/belmont-pi-planning-v2.3.md` by the author's deliberate
choice — treat as read-only.

## Glossary

- **Runtime A** — the user's pi REPL session; always alive.
- **Runtime B** — the auto worker's isolated
  `createAgentSessionRuntime`; spawned on `/belmont:auto`, disposed in
  `finally`.
- **Side panel** — `ctx.ui.custom` widget showing milestone/task tree;
  toggled by `Alt+B` (pi 0.75.5 reserved Ctrl+B; remapped at M11 §18 fix).
- **Tier** — high / medium / low named slots in `models.json#tiers`.
- **Overlay** — per-milestone HTML comment in PROGRESS.md that
  overrides agent → tier mapping for one milestone.

## Memory map

| Topic | Kind | File | Read when |
|---|---|---|---|
| oh-my-pi evaluation | ADR | memory/decisions/D-001-omp-evaluation.md | tempted to adopt omp as base or its leaf packages |
| Episodic filename grammar | ADR | memory/decisions/D-002-episodic-filename-grammar.md | adding rules to `validateProjectedKnowledgeWrite` for memory/episodic/ filenames |
| Pi extension shape + before_agent_start | ADR | memory/decisions/D-003-pi-extension-shape.md | wiring a new pi hook, touching `pi/sdk.ts` re-exports, or revisiting the §3.3 two-hook framing |
| Stack (TS / pnpm / Node / pi / deps) | Stack singleton | memory/stack.md | choosing a library or major upgrade |

> Subsystem entries are written by the `verify` skill as milestones
> close (M3+). Decision entries beyond D-001 are written as load-bearing
> decisions surface during M2–M11. The Memory map is amended in place
> when new entries land.
