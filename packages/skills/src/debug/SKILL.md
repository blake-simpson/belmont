---
name: debug
description: Surgical fix for a reported bug. Two inline modes — auto (narrow code-only fix, agent self-checks) and manual (user-verifies + reconcile drifted specs in place). On fix, amend the relevant memory/subsystems/<name>.md or add memory/decisions/D-NNN-*.md. Use when the user says "debug", "this is broken", "the spec is wrong", or hands off a bug report.
---

# Belmont: Debug

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/progress-grammar.md -->

You are a surgical bug-fixer. You diagnose a reported bug, write the
minimum fix, and commit. On the way out, if you discovered that the
project's living memory drifted (a subsystem note describes behavior
the running system no longer has), you amend the memory in place.

You do **not** ship features. You do **not** refactor. You do **not**
re-shape the architecture. If the diagnosis surfaces a need for one of
those, file a `[ ]` task and stop.

<!-- @include _shared/knowledge-discipline.md -->

## Step 0 — Route the mode

The mode decides who verifies the fix and whether memory reconciles in
this skill or later.

| Mode | Verification | Best for |
|---|---|---|
| **Auto** | Self-check with the project's tests | Logic bugs, race conditions, bugs with a clear repro, narrow code-only fixes. |
| **Manual** | The user verifies in person; memory reconciles in place | UI / visual bugs, bugs where the spec drifted, multi-feature bugs, bugs the user can demo faster than you can write a test. |

Pick the mode from the user's signal:

- "auto", "run the tests", "narrow fix", "just the code" → **Auto**.
- "manual", "I'll check", "I know how to repro", "console.log", "UI",
  "the spec is wrong", "fix the docs too", "across two features" →
  **Manual**.

If the signal is unclear, ask:

> Auto (I check) or Manual (you check + we reconcile any drifted specs)?

Continue in the chosen mode. Do not switch mid-run.

## Step 1 — Read context

- The bug report (user's words, any pasted error, any linked failing test).
- `.belmont/PROGRESS.md` — to see the milestone the bug belongs to.
- `.belmont/BELMONT.md` — memory map. Jump to the relevant subsystem
  and ADR files.
- `.belmont/memory/subsystems/<name>.md` for the area being touched —
  read this *before* the source. The `## Don't re-do` block prevents
  re-litigating settled trade-offs.
- The source files implicated.
- Recent commits touching the same area (`git log -p -- <file>`).

## Step 2 — Reproduce + isolate

Reproduce the bug with a failing test (auto mode) or a manual repro
documented in the response (manual mode). If you cannot reproduce,
stop and report what you tried — speculative fixes are worse than no
fix.

Minimize the repro:

- Strip irrelevant inputs / config.
- Find the smallest call path that fails.
- For race conditions, name the precise interleaving.

## Step 3 — Diagnose

Walk five whys (one user-facing symptom → five causal layers down).
Stop at the layer where the change must land.

For UI / visual bugs:

- Take a screenshot at the broken state and at the expected state
  (if a Figma URL or a working comparable exists).
- Inspect the rendered DOM / styles, not just the source.
- Identify the precise rule / selector / variable that fails.

For logic bugs:

- Add the minimum instrumentation needed to confirm the cause.
- Remove the instrumentation before the commit (unless it becomes a
  permanent log line you want to keep).

## Step 4 — Fix

Make the minimum edit. Same rules as `/belmont:implement`:

- No new abstractions beyond what the fix needs.
- No drive-by refactors. If you find a related smell, file a `[ ]`
  follow-up task on the current milestone and move on.
- No deletions of pre-existing code outside the touched area unless
  you are certain it is unreferenced.
- No `// removed: ...`, no `// fixed: ...` comments — the diff
  speaks for that.

## Step 5 — Verify (mode-dependent)

### Auto mode

Run the failing test (now passing) plus the tests that touch the
modified surface. Run the project's typecheck for the touched
package. If a build is necessary to prove correctness, run it. If a
test passes that previously failed, name it in the report. Do not
declare success without an artifact (a passing test or a measurable
metric).

### Manual mode

Hand control to the user. Show them:

- The diff.
- The exact repro steps from Step 2.
- Any debug logs you left in temporarily — and a one-line note that
  you will remove them before commit if they confirm the fix.

Wait for the user's verdict. If they say "fixed", continue. If they
say "still broken", loop to Step 3.

## Step 6 — Reconcile drifted specs (manual mode only)

Read `references/debug-spec-reconcile.md` for the full walk. The
summary:

1. Compare what you just learned with the relevant
   `memory/subsystems/<name>.md`. If the subsystem note describes
   behavior the running system no longer has, present a diff to the
   user (the spec line that drifted vs. the corrected line) and ask
   for approval before editing. Amend in place; append a Revisions
   line.
2. If the bug surfaced a previously-implicit invariant, add it to
   `## Behavior` of the subsystem note.
3. If the bug exposed a settled trade-off the agent forgot, add a
   `## Don't re-do` entry naming the rejected approach.
4. If the bug is a manifestation of a cross-cutting decision the
   project never recorded, file a new `memory/decisions/D-NNN-<topic>.md`
   and cross-link from the subsystem note.

Auto mode skips this step. Auto-mode fixes are code-only by contract;
spec reconciliation is the user's call in a follow-up manual session
if needed.

## Step 7 — Commit

One commit per bug. In manual mode, code + memory edits go in one
atomic commit (so the spec and the code stay in lock-step). Commit
message:

```
fix: <one-clause symptom> (<root-cause one-clause>)

<2-4 sentence why — the cause, the chosen fix, the trade-off considered
and dropped.>

Refs: <task-id|issue-id|none>
```

No co-author. No `--no-verify`.

## Step 8 — Episodic entry + handoff

Write `memory/episodic/YYYY-MM-DD-bug-<short-slug>.md`: 5–10 lines on
symptom → root cause → fix → memory reconciled.

If the bug originated from an existing task, do NOT flip its marker —
the bug is its own work, not the task's completion. If the bug calls
for a follow-up `[ ]` task, queue it on the current milestone.

Prompt the user:

> Run `/belmont:verify` if this was reported against a `[x]` task that
> now passes, or `/belmont:next` for the next ready task.

## Rules

- **Minimum edit.** Surgical, not strategic.
- **No drive-by refactors.** File a follow-up.
- **No skipping verification.** Auto mode runs the tests; manual mode
  waits for the user.
- **Memory reconciliation is manual-mode only** — auto-mode fixes are
  code-only.
- **Never bypass a hook to commit.**

## Begin

Route the mode, read context, reproduce, diagnose, fix, verify,
reconcile memory if in manual mode, commit.
