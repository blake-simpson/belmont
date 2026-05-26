# Implement — pre-edit + commit checklist

Read this from `implement/SKILL.md > Step 2` for the full operational
walk. Inline summary lives in the SKILL body; this file is the
deep-dive reference.

## Pre-edit

- [ ] The task ID exists in `.belmont/PROGRESS.md`.
- [ ] The task is in the **first pending milestone** (per the next
      skill's rules) OR the user named it explicitly.
- [ ] The task's outcome traces to a `## Done when` bullet in
      `memory/prds/prd-<topic>.md` for its feature.
- [ ] The task is not from a future milestone. If a "small adjacent
      fix" looks tempting from a future milestone, STOP — the
      milestone-immutability rule blocks it.
- [ ] The relevant subsystem(s) in `memory/subsystems/*.md` were read.
      The `## Don't re-do` blocks were considered.
- [ ] The relevant ADR(s) listed in BELMONT.md's memory map were read.
- [ ] The marker was flipped `[ ] → [>]` before the first source edit
      (`belmont_transition` in harness; `Edit` in standalone).

## In-edit

- [ ] Every file touched is **inside the task's scope**. If not, the
      file moves into a `[ ]` follow-up task on the same milestone
      instead of being edited now.
- [ ] No new abstractions beyond what the task names. Three similar
      lines beats a premature helper.
- [ ] No new dependencies beyond what `memory/stack.md` allows.
- [ ] No comments restating what the code does.
- [ ] No `// removed: ...` or `// formerly X` stubs — delete is delete.
- [ ] No `if (process.env.NODE_ENV === ...)` branches that exist only
      to bypass the work.
- [ ] No `--no-verify`, no skipped tests, no `xfail` without a tracked
      follow-up.
- [ ] If the change adds a configurable feature, the configuration
      reaches `memory/stack.md` or the relevant subsystem file (not
      just a `.env` line that future readers cannot find).

## Checks (run the subset that applies)

| Project signal | Run |
|---|---|
| `tsconfig.json` in touched package | typecheck (`tsc --noEmit` or `pnpm typecheck`) |
| `vitest.config.*` / `jest.config.*` / `*.test.*` files | unit tests for the touched module + direct dependents |
| Touched files export module surface | build the touched package |
| Touched files have lint config (`.eslintrc*`, `biome.json`) | lint the touched files |
| `memory/constraints/*.md` names a perf budget | the relevant perf check |
| Visual change (per the task description) | manual smoke documented in the episodic entry — no headless Playwright unless `preferences.md` asks for it |

Do NOT run the full project test suite unless the task names "full
test pass" in Done when, or `preferences.md` requires it. Faster
loops produce better code.

## Commit

- [ ] One commit per task. Stage only the files this task touched.
- [ ] Commit message form:
      `<imperative summary <= 70 chars>` blank line `<2-4 sentence why>`
      blank line `Task: <task-id> (M<N>)`.
- [ ] No co-author footer (Belmont preference).
- [ ] No `--no-verify` / `--no-gpg-sign`.
- [ ] If a pre-commit hook failed: fix the underlying issue, re-stage,
      create a NEW commit. Never `--amend` a hook-failed commit (the
      previous commit hasn't been displaced; amending would mutate
      whatever was last shipped).

## Post-commit

- [ ] Marker flipped `[>] → [x]` via `belmont_transition` (harness) or
      `Edit` (standalone).
- [ ] Short `memory/episodic/YYYY-MM-DD-<task-id>.md` written
      (schema: `belmont.episode.v1`).
- [ ] If decisions surfaced, the relevant `memory/decisions/D-NNN-*.md`
      is amended in place (or a new ADR is added) with a Revisions
      footer line.
- [ ] Follow-up `[ ]` tasks for any out-of-scope finds are queued on
      the current milestone.
- [ ] Master PRD index row (`BELMONT.md > ## Master PRD > ### prd-<slug>`)
      is left as-is — `/belmont:verify` flips it to `shipped` when
      all milestone tasks are `[v]`.

## Scope-violation salvage

If you realize mid-edit that you have crossed scope:

1. Stop. Do not commit the mixed change.
2. `git diff` to identify the in-scope hunks.
3. Either: `git checkout -- <out-of-scope files>` (irreversible — only
   if you have not modified anything else in those files this session)
   OR `git stash --keep-index` after staging only the in-scope hunks.
4. Resume the in-scope edit; commit; flip the marker.
5. Add a follow-up `[ ]` task on the current milestone for the
   out-of-scope work.

The M5 turn_end hook in the harness will auto-revert in many cases;
this salvage is the standalone equivalent.
