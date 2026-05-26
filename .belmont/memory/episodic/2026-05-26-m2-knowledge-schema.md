---
schema: belmont.episode.v1
date: 2026-05-26
phase: M2
---

# 2026-05-26 — M2 knowledge-schema

## What happened

- Implemented `@belmont/knowledge-schema` — pure parsers, validators,
  transitions. Zero pi dependencies. 8 source files (≈800 LOC), 6 test
  files (101 tests, 99 in this package + 2 pi-boundary).
- Byte-faithful `parseProgress` port from v0.10.7-final's
  `parseMilestones` (`cmd/belmont/main.go:2505`) and
  `parseProgressSnapshot` (`:11664`). Broadened to accept both legacy
  colon-form (`P0-1: Task`) and v1.0 space-form (`P0-1 Task`) per the
  current dogfooded `.belmont/PROGRESS.md` format and v2.3 §5.1.
- `applyTransition` operates on the source string via captured
  `lineIndex`; mutations splice only the single marker character
  between `[…]`. Round-trip preserves every other byte (asserted by
  test).
- `parseMilestoneOverlay` token grammar (§9.3) parses right-to-left
  inside the override block: peel `@baseURL` first, then peel
  `:thinking` iff the trailing suffix matches `{high|medium|low|off}`.
  This is how `ollama/qwen3:8b` (colon-inside-model) parses correctly
  vs `anthropic/claude-sonnet-4-6:high` (model + thinking-level).
- Frontmatter parsing via `yaml@^2`; per-kind validators via `zod@^4`.
  Eight schemas: entrypoint, preferences, adr, subsystem, prd,
  **episode** (note: `belmont.episode.v1`, not the `belmont.episodic.v1`
  that the M0/M1 entries originally used — fixed in this commit),
  constraint, stack.
- `validateProjectedKnowledgeWrite` enforces every rejection text from
  v2.3 §4.5 verbatim (pinned by tests). Cross-file rules
  (memory-map cross-ref, monotonic decision IDs) gate on optional
  `context` so the function stays usable from a per-write `tool_call`
  hook without forcing a full tree walk.
- `generateSuggestion` is the §5.3 scaffold for the `suggestion` field
  on rejection responses. Content-aware nudges for preferences/BELMONT
  cap overruns; fixed hints for the other rejection codes.

## Housekeeping landed in the same commit

- Fixed schema literal in both existing episodic entries:
  `belmont.episodic.v1` → `belmont.episode.v1` (the plan §4.3 canonical).
- Authored `D-002-episodic-filename-grammar.md` capturing the deviation
  from plan §4.4 rule 7: episodic filenames are date-only
  `YYYY-MM-DD-<slug>.md`, no `HH-mm-ss` segment. Both existing entries
  already follow this; the validator enforces it.
- Updated `BELMONT.md > ## Memory map` to reference D-002.

## Author smoke (v2.3 §17 M2) — executed and passing

| Step | Expected | Observed |
|---|---|---|
| `pnpm --filter @belmont/knowledge-schema test` | ≥40 tests pass | ✅ 99 tests pass across 6 files |
| `pnpm --filter @belmont/knowledge-schema test:coverage` | ≥95% branch on parser + validators | ✅ 95.61% branch, 99.76% lines, 100% functions |
| `pnpm build` (root) | dep-cruiser + 4 tsc builds clean | ✅ |
| `pnpm test` (root) | full suite green incl. pi-boundary | ✅ 101 tests across 7 files |
| `pnpm dep-check` | no boundary violations | ✅ 18 modules, 26 deps, zero violations |
| pi-boundary | knowledge-schema imports no pi | ✅ verified by both dep-cruiser + AST scan |

## Deliberate design notes

- **No legacy mining wholesale.** The Go parser at v0.10.7-final
  informed the regex grammar (extracted to TS) and the byte-faithful
  block-buffer pattern (legacy `milestoneBlockText` → v1.0
  `Milestone.rawLines`). The earlier TS port at the discarded
  `feature/belmont-rework` branch was NOT consulted.
- **Defensive guards have `/* v8 ignore */` comments** where the type
  system forces a fallback that runtime contracts make unreachable
  (regex capture-group safety, `replaceMarkerAtLine` REWRITE_FAILED
  after parseProgress success). The remaining gaps are real branches
  exercised by tests.
- **Overlay tier-name validation is at parse time**, not at write time
  (which would need PROGRESS.md write access — but those are blocked
  by rule #9 anyway). The hook in M5 calls
  `parseOverlayString(milestone.overlay)` to surface validation errors
  separately.

## What's next

Session 3 → **M3 — harness shell + boot doctor** per v2.3 §17 M3:

- `@belmont/cli` resolves project root and execs pi with
  `--extension=@belmont/harness`.
- `@belmont/harness` registers a no-op `session_start` handler and
  `/belmont:status` + `/belmont:init` commands.
- `belmont init` scaffolds `.belmont/` and ends by invoking
  `/belmont:models doctor` with ≥1 reachable tier (or hard-fails with
  recovery commands).
- M3 is where `@belmont/harness/src/pi/sdk.ts` actually starts wrapping
  pi types — the B5 boundary becomes load-bearing for the first time.
