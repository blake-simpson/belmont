---
name: verify
description: Re-read [x] tasks' Done when, gather evidence, flip [x] → [v]. On full-milestone verification, run the fold step — amend or create memory/subsystems/<name>.md, update Glossary, update Master PRD status, graduate matching PRDs to shipped. Use when the user says "verify", "check the last task", or after /belmont:implement.
---

# Belmont: Verify

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/progress-grammar.md -->

You are the verification step. You scan for `[x]` tasks (or a specific
task ID the user names), confirm each task's **Done when** evidence is
in the working tree, and flip `[x] → [v]`. When the last `[x]` in a
milestone flips to `[v]`, you run the **fold step** — write the
subsystem note, update the Glossary, graduate the Master PRD row.

You do **not** edit source code to make a verification pass — if a
task's evidence is missing, you mark it `[x]` (leave it where it is)
and add a follow-up `[ ]` task to the **same milestone**.

<!-- @include _shared/knowledge-discipline.md -->

## Step 0 — Scope the run

- If the user named a task ID, verify that task only.
- If the user named a milestone (e.g. `M3`), verify all `[x]` tasks in
  that milestone, then attempt the fold step.
- Otherwise, scan `.belmont/PROGRESS.md` for every `[x]` task and
  process them in document order.

State the scope aloud and the count of tasks to verify.

## Step 1 — Read context per task

For each `[x]` task to verify:

- `.belmont/PROGRESS.md` — the task line.
- `.belmont/memory/prds/prd-<topic>.md` — the **Done when** bullets
  that scoped the task.
- The corresponding `memory/episodic/YYYY-MM-DD-<task-id>.md` (if
  present) — what the implementer wrote about the change.
- The relevant `memory/subsystems/*.md` and `memory/decisions/*.md`
  per the BELMONT.md memory map.

## Step 2 — Gather evidence

For each Done-when bullet, find concrete evidence in the working tree:

| Done-when shape | Evidence |
|---|---|
| "Feature X works" | the file(s) implementing X; the test(s) covering X passing locally |
| "Endpoint Y exists" | the route definition, the handler, an integration test or curl example in the episodic entry |
| "Migration Z applied" | the migration file, the schema diff, the rollback path |
| "Doc Z published" | the doc file, the right metadata, links resolvable |
| "Behavior B changes" | the regression test asserting the new behavior; the surrounding code path |
| "≤N lines / ≤T ms / ≥V %" | the measurement, captured in the episodic entry or a CI run |

Do not re-implement. Do not run heavy suites speculatively. Run only
the tests that prove the bullet. If a bullet is genuinely unverifiable
from the tree (e.g. "user can subjectively feel it's faster"), say so
in the report and ask the user.

## Step 3 — Decide per task

- **All Done-when bullets evidenced** → flip `[x] → [v]` via
  `belmont_transition` (harness) or `Edit` (standalone). Record the
  evidence sources in the verify report.
- **Any Done-when bullet missing / failing evidence** → leave the
  task `[x]`. Add a `[ ]` follow-up task to the same milestone naming
  the gap. Categorize the gap as one of:
  - **Critical** — blocks the feature; must fix before milestone close.
  - **Warning** — should fix; quality gap.
  - **Polish** — minor; record but do not block.

Polish-only gaps DO NOT block a flip — flip the task to `[v]` and
record the polish notes in the episodic entry instead of a follow-up.
Critical and Warning gaps DO block.

## Step 4 — Fold step (only when the milestone completes)

Run the fold ONLY when, after this verify pass, every task in the
milestone is `[v]`. The fold step pins the milestone's lessons into
the living memory.

Read `references/verify-fold.md` for the full template. The summary:

1. **Subsystem note.** For each durable subsystem the milestone
   created or changed, amend or create
   `.belmont/memory/subsystems/<name>.md`:
   - `## Behavior` — present-tense truth: how this subsystem currently
     works.
   - `## Implementation pointers` — file paths (and line ranges if
     load-bearing).
   - `## Don't re-do` — approaches considered + rejected, with a
     one-clause reason each.
   - `## Revisions` — `- YYYY-MM-DD — <one-sentence change>.`
2. **Glossary.** Add new project nouns to `BELMONT.md > ## Glossary`.
   Agents must use these terms verbatim.
3. **Master PRD index.** In `BELMONT.md > ## Master PRD`, find the
   feature's `### prd-<slug>` row. If every task across every
   milestone for that feature is `[v]`, flip status to `shipped` and
   add a one-line completion summary.
4. **PRD graduation.** In `memory/prds/prd-<slug>.md`, flip frontmatter
   `status: active → shipped` when the feature is wholly done. Add a
   Revisions line. The PRD stays alive as the historical spec — the
   subsystem note now carries the present-tense truth.
5. **Memory map.** Update `BELMONT.md > ## Memory map` so the new
   subsystem/ADR entries are discoverable.

## Step 5 — Write the verify report

Output:

```
Verify report — M<N> (or task <id>)
=====================================

Scope: <N tasks>

Verified ([x] → [v]):
  - <task-id> — <name>   evidence: <pointer(s)>

Held ([x] remained):
  - <task-id> — <name>   gap: <one-clause>   follow-up: <new-task-id>

Polish (recorded, not blocking):
  - <task-id> — <one-clause note>

Fold step: <ran / skipped — milestone has N tasks still at [x]>

Overall: ALL PASSED | ISSUES FOUND | CRITICAL ISSUES
```

## Step 6 — Commit fold-step changes

If the fold step amended memory files, commit them in a separate
commit (do not bundle with source code). Message:

```
verify(M<N>): fold subsystem/<name>; graduate prd-<slug> to shipped

Task: M<N>-fold
```

No co-author. No `--no-verify`.

## Step 7 — Episodic entry

Write `memory/episodic/YYYY-MM-DD-verify-M<N>.md` summarizing the
pass: what was verified, what was held with follow-ups, what folded
into subsystems, what surprised.

## Step 8 — Handoff

> Run `/belmont:next` for the next ready task, or `/belmont:status` to
> see the milestone view. If issues were filed, the next ready task
> will surface them automatically. (Codex: `/new` then the equivalent.)

## Rules

- **Never edit source code** in this skill. Verification observes; it
  does not change the system under test.
- **Never flip `[v]` without evidence.** Trust the tree, not the
  commit message.
- **Critical and Warning gaps block.** Polish never blocks; it gets
  recorded in the episodic entry and folded into the subsystem's
  `## Polish` (or similar) section if persistent.
- **Follow-ups go on the same milestone.** Milestone-immutability rule
  applies to verify just as it does to implement.
- **Don't re-do work.** If a Done-when bullet is genuinely unverifiable
  from the tree, ask the user — don't speculate.

## Begin

Scope the run, gather evidence per task, flip `[x] → [v]` for the
clear ones, file follow-ups for the rest, and fold if the milestone
closes.
