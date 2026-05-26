---
schema: belmont.episode.v1
date: 2026-05-26
phase: M5
---

# 2026-05-26 — M5 state machine + scope guards + preflight validate

## What happened

- The harness's pi anti-corruption layer (`packages/harness/src/pi/sdk.ts`)
  grew to cover the M5 surface: type re-exports for `ToolDefinition`,
  `ToolCallEvent`, `ToolCallEventResult`, `TurnStartEvent`, `TurnEndEvent`,
  `WriteToolCallEvent`, `EditToolCallEvent`, `AgentToolResult`,
  `AgentToolUpdateCallback`, plus the first non-type re-export
  (`isToolCallEventType` — the value-level type guard sibling hooks use
  to narrow `ToolCallEvent` to the write/edit input shapes). The
  pi-boundary regex still catches only `@earendil-works/pi-coding-agent`
  specifiers, and `typebox` is now a direct dep of `@belmont/harness`
  (used in tool parameter schemas — pi takes its tool-schema constructor
  from `typebox` directly, not via re-export).
- Three new tools registered via `pi.registerTool`:
  - **`belmont_transition`** (`tools/belmont-transition.ts`, 158 LOC)
    wraps the M2 `applyTransition` pure state machine. Schema:
    `{ milestone_id, task_id, to, evidence_path?, note? }` with regex
    constraint on `milestone_id` and union over the 5 task states.
    Reads `.belmont/PROGRESS.md`, applies the transition, writes back
    only on non-noop, appends a `transition` episodic event under
    `<today>-progress-transitions.md`. Returns `AgentToolResult` with
    text summary + structured `details` (milestoneId, taskId, previous,
    next, noop, contentSha1, episodicPath). Invalid input (unknown
    milestone, missing evidence_path on [v]) throws — pi surfaces the
    throw as a tool error.
  - **`belmont_episode_event`** (`tools/belmont-episode-event.ts`,
    73 LOC) — small wrapper around the shared `appendOrCreateEpisode`
    helper in `state/episodic.ts`. Schema:
    `{ slug, kind, content, task_id? }`. M5 lands the registration so
    M8's auto loop has a clean way to log phase transitions.
  - **`belmont_ask_user`** (`tools/belmont-ask-user.ts`, 80 LOC) —
    routes through `ctx.ui.select` (choices supplied) or
    `ctx.ui.input` (free text). When `ctx.hasUI === false` the tool
    throws with a deterministic "no UI attached" message so the calling
    agent knows to ask the user directly via its own response.
- Two new hooks registered:
  - **`hooks/knowledge-guard.ts`** (`tool_call` hook, 117 LOC) authored
    from earendil-works' `examples/extensions/protected-paths.ts`
    template per D-001. Filters `write` and `edit`; pre-empts writes
    inside `.belmont/memory/steering/` as the harness-only zone;
    classifies the path via `classifyTarget`; reads the current file;
    projects the after-state (write: `event.input.content`; edit:
    sequentially applies `event.input.edits[]` via first-occurrence
    replace); runs `validateProjectedKnowledgeWrite`; on first error
    diagnostic returns
    `{ block: true, reason: JSON.stringify({ message, suggestion }) }`.
    Pi's `ToolCallEventResult` has no separate `suggestion` slot, so
    the JSON envelope is the wire-level encoding — locked by session
    scope-policy answer. The verbatim §4.5 deterministic rejection
    text lives in `message`; the suggestion lives in the optional
    `suggestion` field (omitted when the suggest generator returns
    undefined).
  - **`hooks/scope-guard.ts`** (`turn_start` + `turn_end` hooks,
    180 LOC) authored from earendil-works'
    `examples/extensions/permission-gate.ts` template. Snapshots the
    `.belmont/` subtree as a `Map<absPath, { sha1, content }>` at
    `turn_start`; at `turn_end` walks the diff and reverts any:
    (1) write or new file at an unclassified `.belmont/` path,
    (2) write inside `memory/steering/`, or
    (3) deletion of a classified file outside `memory/episodic/`.
    Reverts use the snapshotted content (or `unlinkSafe` when the
    file was new). Every revert emits a `ctx.ui.notify` warning and
    appends one bullet to `<today>-scope-revert.md`.
- **The ultrathink call** for M5: this baseline is what's enforceable
  without an active-task context. v2.3 §5.4's phase-aware rules
  ("marker flips inside M2's task block only", "new
  memory/subsystems/X.md only in the verify phase") depend on M8's
  auto-loop introducing an `activeAuto: { milestoneId, phase }`
  field — M5 does not have that and would have to invent it
  speculatively. The §5.4 always-illegal rules (steering writes,
  classified-knowledge deletions, unclassified paths) are
  categorical and ship now. Phase scoping is the M8 add.
- **`belmont validate`** wired through `packages/harness/src/validate.ts`
  (FS walker, 304 LOC) + `packages/cli/src/validate.ts` (33-LOC thin
  wrapper). Walk order: `.belmont/` presence → PROGRESS grammar
  (duplicate task IDs, emoji headers) → BELMONT.md/preferences.md
  schemas + line caps → stack.md → per-kind dirs
  (decisions/subsystems/constraints/prds/episodic) with schema +
  Revisions footer + filename grammar → Memory map cross-ref → ADR
  monotonicity → PRD index ↔ disk cross-ref. Exit codes 0/2 mirror
  the M3 boot doctor: hard-failures → 2, warnings only → 0 with
  printed list, clean → 0 with "OK". M8's auto-loop preflight will
  import `runBelmontValidate` from `@belmont/harness` directly so
  the two entry points share the walker.
- Shared `state/episodic.ts` helper (135 LOC) covers append-or-create
  with content-hash idempotence (same bullet not appended twice),
  `## Events` section auto-creation when absent, and slug grammar
  validation. Used by both `belmont_transition` and the scope-guard
  revert path so the format stays consistent.
- M5 test suite: 59 new tests across 6 files —
  `belmont-transition.test.ts` (8), `belmont-episode-event.test.ts`
  (7), `knowledge-guard.test.ts` (10), `scope-guard.test.ts` (11),
  `validate.test.ts` (20), and `packages/cli/test/validate.test.ts`
  (3). All assert against tmpdir fixtures — no real `.belmont/` is
  touched by the suite.

## Author smoke (v2.3 §17 M5) — executed and passing

| Step | Expected | Observed |
|---|---|---|
| `pnpm build` | clean tsc + dep-check (42 modules / 75 deps) | ✅ |
| `pnpm test` | full suite green | ✅ 177 tests across 16 files (118 prior + the new 59) |
| `node packages/cli/dist/bin/belmont.js validate` against this repo | exit 0; warnings only for the deliberately-deferred PRD index stubs | ✅ exit 0 with 5 PRD_INDEX_MISSING_FILE warnings |
| Dogfood: flip M5 P0-1..P0-5 via `executeBelmontTransition` on the live `.belmont/PROGRESS.md` | each transition writes the marker and appends a `transition` bullet to `<today>-progress-transitions.md` | ✅ 5 transitions, single episodic file with 5 bullets |
| `knowledgeGuardForEvent` blocks direct write/edit to PROGRESS.md with JSON envelope reason | reason parses to `{ message: "Direct writes…", suggestion: "Call belmont_transition…" }` | ✅ covered by 10 knowledge-guard tests |
| `knowledgeGuardForEvent` blocks BELMONT.md > 400 lines and preferences.md > 60 lines | first error diag wins; suggestion populated from M2 `suggest()` | ✅ |
| Scope guard reverts unclassified `.belmont/scratch.md` write at `turn_end` | file deleted; revert action returned with reason `unclassified_path` | ✅ covered by 11 scope-guard tests |
| Scope guard restores deleted ADRs from snapshot | content rewritten from `before` snapshot | ✅ |
| Scope guard ALLOWS deletions inside `memory/episodic/` (intentional GC) | no revert; file stays deleted | ✅ |

## Deliberate design notes

- **JSON envelope for rejection `reason`.** Pi's `ToolCallEventResult`
  shape is `{ block?, reason? }` only — no separate `suggestion` slot.
  Two encodings were considered: a labelled inline form
  (`"<msg>\n\nSuggestion: <hint>"`) and a JSON envelope. JSON won at
  session scope-policy confirmation because (a) the rejection consumer
  is the LLM agent loop, which is bias-trained on JSON, and (b) tests
  can `JSON.parse(reason)` and assert structurally rather than against
  formatting. The §4.5 deterministic rejection strings still live
  verbatim in `message` so the M2 validator's pinned tests still pass
  unchanged.
- **Conservative scope-guard baseline.** The four scope-violation
  classes M5 enforces (steering writes, unclassified-path
  writes/creates, classified-knowledge deletions outside episodic,
  PROGRESS direct-writes [via knowledge-guard]) are the
  phase-independent always-illegal cases. Phase-aware scoping
  ("marker flips inside the active milestone only", "subsystem fold
  only in verify phase") requires the M8 auto-loop's `activeAuto`
  field — wiring it in M5 would mean inventing a speculative API
  shape M8 then changes. The brief explicitly notes this: "the
  task's expected file set comes from the milestone's `## Scope`
  block in the PRD, or — when absent — from the files the task name
  names" — neither input exists in M5 without auto-loop state. The
  M5 baseline is a strict subset of the §5.4 design; M8 layers on.
- **`belmont_transition` writes directly via `fs.writeFile`, bypassing
  the `tool_call` hook.** This is the intended single mutation path
  for PROGRESS.md. Pi's `tool_call` hook only fires on built-in
  `write`/`edit`/`bash`/etc.; extension-internal FS operations do
  not re-enter the hook chain. The knowledge-guard's
  `PROGRESS_DIRECT_WRITE` block therefore catches only agent intent
  expressed through the standard tools — the transition tool is the
  exclusive structured path.
- **PRD index drift demoted to warning.** §5.3's hard-failure list is
  narrow (PROGRESS direct-writes per git-log inspection, ADR missing
  Revisions, duplicate task IDs, emoji headers). The brief asked for
  "every PRD listed in BELMONT.md's Master PRD index exists at
  memory/prds/prd-<slug>.md" but did not specify severity. The
  dogfood `.belmont/BELMONT.md` legitimately lists 5 PRD stubs whose
  files will be authored at the milestone that ships each (knowledge
  model at M5, TUI at M6, multi-model at M7, auto mode at M8,
  masterplan deliberately external). Treating this as a hard failure
  would brick `belmont validate` against the dogfood itself for the
  next 3 milestones. PRD index drift is now `severity: "warning"` —
  consistent with how `MEMORY_MAP_DRIFT` is handled.
- **`belmont validate` is FS-tolerant where it can be.** `stack.md`,
  the kind dirs, and the Memory map are all optional inputs that
  short-circuit when absent rather than triggering a phantom error.
  The required-presence checks (BELMONT.md, preferences.md,
  PROGRESS.md, `.belmont/` itself) explicitly hard-fail.
- **No knowledge-schema changes.** All the pure rule helpers were
  already in place from M2: `applyTransition`,
  `validateProjectedKnowledgeWrite`, `generateSuggestion`,
  `classifyTarget`, `parseProgress`, `parseFrontmatter`,
  `validateFrontmatter`, `extractRevisionsBullets`,
  `extractMemoryMapReferences`. The walker is on top.

## What's next

Session 6 → **M6 — TUI panel + status bar + hotkeys + ctx-weight indicator**
per v2.3 §17 M6. First milestone that touches `ctx.ui.custom` — the
side panel with milestone tree, the 3-slot status bar (task | model
+thinking+rtk | session+ctx), `Ctrl+B`/`Ctrl+O`/`Ctrl+L` shortcuts,
in-panel `j`/`k`/Enter/a/v/Esc keymap, and the auto-open hook on
`/belmont:auto` invocation. The ctx-weight indicator polls pi's
`getContextUsage()` and renders 🟢/🟡/🔴 against the thresholds in
`models.json#ctx_thresholds` (80k/120k).
