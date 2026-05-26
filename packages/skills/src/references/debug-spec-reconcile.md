# Debug — spec reconcile (manual mode)

Read from `debug/SKILL.md > Step 6`. The full walk for amending
drifted memory in place after a manual-mode bug fix.

## The drift principle

The running system is authoritative truth. Memory files
(`memory/subsystems/<name>.md`, `memory/decisions/D-NNN-*.md`) describe
how the system was at the moment the verify-fold step wrote them.
Bugs surface drift in two directions:

- **Memory ahead of code** — the subsystem note describes behavior the
  code does not (yet) have. Either the code is buggy and needs to be
  brought to match, or the spec was aspirational and was never
  delivered (less common in v1.0 because PRDs hold the aspiration and
  subsystems hold present-tense truth).
- **Code ahead of memory** — the system's behavior moved past the
  subsystem note. The bug surfaced this because the user (or an agent)
  reasoned from the stale memory and was surprised.

In both cases, after the code fix lands, the memory needs to match
reality.

## Five Whys → memory placement

Walk the five whys against the bug. The depth at which the root cause
sits decides where the memory edit goes.

| Five-whys depth | Where to write |
|---|---|
| 1 (surface symptom)        | Episodic entry only; no memory amend. |
| 2 (immediate cause in one function) | Episodic entry. |
| 3 (subsystem behavior — touches more than one file) | Amend `memory/subsystems/<name>.md` `## Behavior` block. |
| 4 (implicit invariant the agent didn't know) | Add a row to `memory/subsystems/<name>.md > ## Don't re-do`. |
| 5 (cross-cutting decision the project never recorded) | New `memory/decisions/D-NNN-<topic>.md`. |

Pick the deepest layer that genuinely caused the bug — not the
deepest layer you can rationalize down to. Bugs usually have one
honest root cause; chasing further is reverse-engineering virtue.

## Present-the-diff protocol

Before any memory edit, show the user the diff:

```
Spec drift detected — please confirm before I amend.

File: .belmont/memory/subsystems/<name>.md

Before:
    [the current line(s)]

After:
    [the corrected line(s)]

Reason: <one-sentence about the drift>.
```

Wait for explicit approval. Do not amend memory silently. If the user
says "leave it for now", record the drift in the episodic entry and
do not touch the subsystem file — the user knows their context.

## Subsystem amend (in place)

Open `memory/subsystems/<name>.md`:

- Edit the prose in `## Behavior` so it reflects current truth.
- Add or update entries in `## Implementation pointers` if the bug
  touched a file the pointers didn't mention.
- Add a row to `## Don't re-do` when the fix exposed an alternative
  approach that was rejected (silently, until now). One clause for
  the rejected approach, one clause for the reason.
- Bump `updated_at` in the frontmatter.
- Append a fresh Revisions line: `- YYYY-MM-DD — <one-sentence
  change>.`

Never append a new `## Update YYYY-MM-DD` section. Memory is
amend-in-place; the git log is the chronology.

## New ADR (rare, depth-5 only)

If the bug is a manifestation of a settled-but-unrecorded decision,
write a new `memory/decisions/D-NNN-<topic>.md` per the
`/belmont:plan` ADR shape:

```markdown
---
schema: belmont.adr.v1
id: D-NNN-<topic>
topic: <topic>
status: accepted
updated_at: YYYY-MM-DD
supersedes: null
---

# D-NNN: <one-clause decision>

## Why this matters
The concern this decision pins.

## Decision
The accepted choice.

## Rationale
Why this and not the alternatives, surfaced by the bug.

## Don't re-do
- <rejected alternative> — rejected because <one-clause>.

## Consequences
What downstream choices this constrains.

## Revisions
- YYYY-MM-DD — Accepted retroactively after debug session reconciled
  the drift.
```

Pick the next free `D-NNN` integer. Cross-link from the relevant
subsystem note's memory map row.

## Atomic commit

Code + memory edits go in ONE commit so future readers see the spec
and the code change together:

```
fix(<area>): <symptom> + reconcile subsystem-<name>

<2-4 sentence why — cause, fix, drift detected, spec corrected.>

Refs: <issue-id|task-id|none>
```

The atomicity matters: if memory and code drift apart again, `git
blame` on the subsystem line points at the commit that explains
both.

## When NOT to reconcile

- The bug was a typo / cosmetic / one-line slip. The episodic entry
  is enough.
- The bug was in test code only.
- The subsystem note in question is not yet present (the milestone
  that should have created it has not been verified — the fold step
  is overdue, not the spec). File a follow-up task on that milestone
  and stop.
- The user explicitly says "skip the reconcile".
