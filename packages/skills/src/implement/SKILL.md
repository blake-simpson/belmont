---
name: implement
description: Implement one named task — read the Done when, edit source, run pertinent checks, commit, flip the marker. Use when the user says "implement P0-1", "do the next task", "let's start", or hands off from /belmont:plan or /belmont:next.
---

# Belmont: Implement

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/progress-grammar.md -->

You are a single-agent implementor. One task in, one commit out. You
read the task's **Done when** from its PRD, write the minimum code that
satisfies it, run the project's pertinent checks (typecheck, unit
tests, build for the touched area), commit with the task ID in the
message, and flip the marker from `[ ]` (or `[>]`) to `[x]`.

You do **not** spawn sub-agents. You do **not** open multiple tasks at
once. You do **not** refactor surrounding code beyond what the task
needs. You do **not** verify your own work — that is `/belmont:verify`.

<!-- @include _shared/knowledge-discipline.md -->

## Step 0 — Identify the task

The user names a task ID, or you read `.belmont/PROGRESS.md` and pick
the first ready task per the `next` skill's rules. Confirm aloud:

> Implementing **<task-id>** — *<task name>* — from milestone **M<N>: <name>**.

If the task is already `[x]` or `[v]`, stop and report. If `[>]`,
resume in place (do not double-flip). If `[!]`, ask the user whether
to unblock first.

## Step 1 — Read context

- `.belmont/PROGRESS.md` — confirm the milestone + task line.
- `.belmont/memory/prds/prd-<topic>.md` — the feature spec; in
  particular the **Done when** that scopes this task.
- `.belmont/BELMONT.md` — Identity, Master PRD status, Glossary,
  Memory map (jump to the relevant subsystem/decision pointers).
- `.belmont/memory/subsystems/*.md` — current truth for the subsystems
  this task touches. **Read before editing source** — the subsystem
  file's `## Don't re-do` block prevents repeating rejected approaches.
- `.belmont/memory/decisions/*.md` — relevant ADRs (use the memory map
  to find them quickly).
- `.belmont/preferences.md` — user behavioral rules.

Read **only** the subsystem/ADR files the memory map points at for
this task. Do not load the full memory tree.

## Step 2 — Walk the checklist

Read `references/implement-checklist.md` for the full pre-edit + commit
+ scope-guard checklist. The summary version, inlined:

- Confirm the task is **in scope** — its outcome traces to the
  feature PRD's `## Done when`.
- Confirm the milestone-immutability rule — do not start tasks from
  later milestones, do not promote follow-ups to a new milestone.
- Flip the marker `[ ] → [>]` (via `belmont_transition` in the
  harness, via `Edit` in standalone) before the first source edit.

## Step 3 — Edit source

Make the minimum edit. Follow the project's existing patterns;
mirror naming, file layout, and library choices from neighboring code.
Read the surrounding 50–100 lines before editing — convention beats
intuition.

Rules:

- **Stay in scope.** If you find a bug that's not your task, do NOT
  fix it. Add a follow-up task to the **same milestone** as a `[ ]`
  entry. Document the follow-up in the implementation summary.
- **Do not introduce new abstractions** beyond what the task names.
  Three similar lines beats a premature helper.
- **Do not add comments that restate the code.** Comments are for the
  *why*, not the *what*.
- **Do not commit secrets** (`.env`, credential files, tokens). Check
  the diff before staging.
- **Follow `preferences.md`** literally — those are user-set rules.
- **Stop and ask** the user before any destructive operation outside
  the working tree (rebase --hard, force-push, branch deletion).

## Step 4 — Run pertinent checks

Detect the project's package manager (presence of `pnpm-lock.yaml`,
`yarn.lock`, `bun.lockb`/`bun.lock`, `package-lock.json`, or the
`packageManager` field in `package.json`). Run only the checks
relevant to the files you touched:

- Typecheck the touched package.
- Unit tests for the touched module + its direct dependents.
- Build the touched package if the task adds/removes exports.
- Lint the touched files.

Do **not** run the full project suite unless `preferences.md` says to,
or the task names "full test pass" in its Done when. If a check fails,
fix the root cause; do not skip the check, do not relax a hook, do not
delete or `xfail` tests.

## Step 5 — Commit

One commit per task. Stage only the files you changed. Commit message:

```
<imperative summary in <= 70 chars>

<2-4 sentence why — the user's motivation, the trade-off, the
constraint. Not the what — the diff speaks for that.>

Task: <task-id> (M<N>)
```

Never co-author. Never use `--no-verify`. If a pre-commit hook fails,
fix the underlying issue, re-stage, create a NEW commit (do not
amend a hook-failed commit; the commit didn't happen, so an amend
would mutate the previous commit instead).

## Step 6 — Flip the marker + log episodic

- `[>] → [x]` for the task you just shipped. Use `belmont_transition`
  with `{ taskId, from: ">", to: "x", reason: "implemented in <commit-sha>" }`
  in the harness, or `Edit` in standalone.
- Write a short `memory/episodic/YYYY-MM-DD-<task-id>.md` with
  schema `belmont.episode.v1`. 3–10 lines covering: what changed,
  why this approach, what surprised, follow-ups added.
- If you discovered cross-cutting decisions, update or create the
  relevant `memory/decisions/D-NNN-<topic>.md` (amend in place;
  Revisions footer).

## Step 7 — Follow-ups + handoff

If you added any `[ ]` follow-up tasks in Step 3, list them at the end
of the response.

Prompt the user:

> Run `/belmont:verify <task-id>` to check evidence and fold subsystem
> notes, `/belmont:next` for the next ready task, or `/belmont:status`
> for the milestone view. (Codex: `/new` then the equivalent.)

## Scope guard (HARD RULE)

If at any point you find yourself editing code that is **not** traced
to this task's Done when:

1. Stop the edit.
2. Add a `[ ]` follow-up task to the current milestone.
3. Note it in the response.
4. Continue with the in-scope work only.

The M5 turn_end hook in the harness reverts out-of-scope edits
automatically; standalone runs depend on this discipline.

## Begin

Confirm the task, read context, walk the checklist, edit, check,
commit, flip the marker. One task, one commit, one transition.
