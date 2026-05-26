---
schema: belmont.episodic.v1
date: 2026-05-26
phase: M0
---

# 2026-05-26 — M0 spike + v1-rebuild kickoff

## What happened

- Tagged `v0.10.7-final` at `b14acf2` (the existing v0.10.7 release commit).
- Cut `v1-rebuild` branch off `v0.10.7-final`; pristine — every legacy
  file (Go binary, M1–M9 abandoned-experiment TS, knowledge/, plugin/,
  marketplace.json) deleted in the same commit that scaffolded M0.
- Moved `D-001-omp-evaluation.md` from `~/Desktop/` into
  `.belmont/memory/decisions/`. P0-OMP DISCHARGED per v2.3 §17 M0.
- Authored 7 spike directories (4 P0 + 3 P1/P2) each with `VERDICT.md`.
  Probe scripts (`probe.ts`) authored for the 4 GO/conditional packages
  to be runnable from a future fresh checkout.
- Composed the buy/build matrix in `spike/README.md`.

## Verdicts

| Package | Verdict | Pin |
|---|---|---|
| pi-mcp-adapter | GO (Belmont wraps blast-radius) | `2.8.0` |
| pi-lean-ctx | GO (context hook + MCP only; shell hook off) | `3.6.17` |
| pi-web-access | GO (no v1.0 consumer; pin recorded) | `0.10.7` |
| omp (oh-my-pi) | NO-GO as base; leaf-pkg DEFERRED to v1.1 | — |
| @juicesharp/rpiv-ask-user-question (P1) | DEFERRED (fork lineage) | — |
| adaptive-memory-multi-model-router (P1) | NO-GO (ontology mismatch) | — |
| pi-antigravity-rotator (P2) | DEFERRED to v1.1 | — |

## What's next

M1 — pnpm workspace bootstrap (4 packages, dep-cruiser, CI, pi-boundary
test). Same session per the kickoff prompt.
