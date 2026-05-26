---
name: plan
description: Plan ONE feature — write its PRD, mint its milestones and tasks into PROGRESS.md, and record any irreversible choices as ADRs. Use when the user says "plan feature X", "let's break down X into milestones", "evolve the plan for X", or "replan X".
---

# Belmont: Plan

<!-- @include _shared/harness-optional.md -->

You are running ONE conversational planning session for ONE feature in
the project's Master PRD index. By the end of the session:

- `.belmont/memory/prds/prd-<topic>.md` exists with a complete feature
  spec (brief, done-when, in-scope, out-of-scope, decisions table).
- `.belmont/PROGRESS.md` contains the feature's milestones (one per
  vertical slice) and tasks (`P0-*`, `P1-*`, `P2-*` per priority).
- `.belmont/memory/decisions/D-NNN-<topic>.md` files exist for each
  irreversible architectural choice surfaced during planning.
- `.belmont/BELMONT.md > ## Master PRD` is updated: the feature's
  status line moves from `planned` to `in-progress`, with a fresh
  2–3 sentence brief.

This is **planning only** — no source code edits. Only `.belmont/` is
in scope.

<!-- @include _shared/progress-grammar.md -->

<!-- @include _shared/knowledge-discipline.md -->

## Step 0 — Detect mode

Read `.belmont/BELMONT.md > ## Master PRD` and `.belmont/PROGRESS.md`.
The user invokes with a feature slug (or you ask).

- **`memory/prds/prd-<slug>.md` does not exist** → **new mode**: write
  the PRD from scratch, mint milestones + tasks, record decisions.
- **PRD exists, no `### M<N>:` milestone for this feature in PROGRESS.md**
  → **evolve mode**: amend PRD with new sections, append milestones
  + tasks. Do NOT rewrite existing milestones.
- **PRD exists, milestones exist, user says "replan"** → **replan
  mode**: ask the user which milestones to revise. Only touch
  milestones the user names — milestone immutability rule still
  applies to the rest.

State the detected mode aloud at the top of the response and continue.

## Step 1 — Read context

- `.belmont/BELMONT.md` — Identity, PR/FAQ, Master PRD index, Glossary.
- `.belmont/preferences.md` — user behavioral rules.
- `.belmont/memory/stack.md` (if present) — tech-stack facts.
- `.belmont/memory/constraints/*.md` — non-negotiables.
- Existing `memory/prds/prd-<slug>.md` if evolve / replan mode.

Read the relevant codebase as needed — entry points, configuration,
existing subsystems mentioned in `memory/subsystems/` if any. Do not
load the entire tree.

## Step 2 — Interview

Ask the user in one or two structured batches until you have concrete
answers for the **Domains** in play. Prefer fewer, higher-signal
questions over a long survey.

### Product domains

User & audience; problem & motivation; primary happy-path flow;
alternate flows (first-time, returning, admin); edge cases (empty
states, errors, permission-denied, concurrency); success criteria;
content & copy; accessibility; i18n; analytics & telemetry; privacy &
legal; onboarding; notifications; offline / degraded states;
monetization (if commercial).

### Technical domains

Framework choices (if no `memory/stack.md` yet); data model &
persistence; API surface; state management; styling / design system;
error handling & resilience; observability; auth / authz / security;
performance budgets; testing strategy; CI/CD; migration / rollback
plan; infra & hosting.

Skip domains the user has already pinned in `BELMONT.md`, `stack.md`,
or earlier ADRs. Cite the source when you skip (`"taking <choice>
from memory/stack.md"`).

## Step 3 — Research triggers

Spawn an `Explore` or `general-purpose` sub-agent when any of these
fire: framework / library comparison; current-stable-version check;
deprecations / breaking changes; security advisories; performance
benchmarks; ecosystem maturity; migration paths; regional / regulatory
context. Loop findings back through the interview, do not paste raw
research dumps into the PRD.

## Step 4 — Write the PRD

Write `.belmont/memory/prds/prd-<slug>.md`:

```markdown
---
schema: belmont.prd.v1
id: prd-<slug>
topic: <slug>
status: active
updated_at: YYYY-MM-DD
---

# <Feature name>

## Brief
One paragraph: what this feature is and why it exists. Cross-reference
the PR/FAQ row.

## Done when
- <verifiable outcome 1>
- <verifiable outcome 2>
- <verifiable outcome 3>

## In scope
- <bounded statement>

## Out of scope
- <bounded statement> — captures things the user named that this
  feature explicitly does not address.

## Decisions
| ID | Topic | Choice | ADR |
|----|-------|--------|-----|
| D-NNN | <topic> | <one-clause choice> | `memory/decisions/D-NNN-<topic>.md` |

## Open questions
- <question> — owner: <user|me>

## Revisions
- YYYY-MM-DD — Created in plan mode.
```

If evolve / replan mode, amend the existing sections instead of
rewriting. Add a fresh Revisions line.

## Step 5 — Mint milestones + tasks into PROGRESS.md

Append to `.belmont/PROGRESS.md` a milestone header per vertical
slice. Milestone sizing rules:

- A milestone is a vertical slice that ships independently.
- 3–8 tasks per milestone is healthy; fewer = trivial, more = split.
- Tasks are `P0` (must-have for the slice), `P1` (should-have), `P2`
  (nice-to-have). Numbering is `P<priority>-<n>` per milestone.
- Each task names a single verifiable outcome.
- Cross-cutting work (schema, auth, build) gets its own milestone, not
  hidden inside a feature milestone.

```markdown
### M<N>: <Feature> — <slice name>

- [ ] P0-1 <Task name>
- [ ] P0-2 <Task name>
- [ ] P1-1 <Task name>
```

Milestone-immutability rule: **never re-write a milestone defined in
an earlier session.** Append new milestones, append follow-up tasks to
the milestone that surfaced them.

If `belmont_transition` is available, you can mint tasks via that tool
when the contract supports it; otherwise write the PROGRESS.md block
directly via `Edit`.

## Step 6 — Record decisions

For every irreversible architectural choice surfaced this session
(framework, persistence, auth strategy, etc.), write
`.belmont/memory/decisions/D-NNN-<topic>.md`:

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
2–3 sentences naming the concern.

## Decision
The accepted choice as one statement.

## Rationale
Why this and not the alternatives. Trade-offs taken.

## Don't re-do
- <rejected alternative> — rejected because <one-clause reason>.

## Consequences
What changes downstream.

## Revisions
- YYYY-MM-DD — Accepted during planning for <feature>.
```

Pick the next free `D-NNN` integer by scanning the existing
`memory/decisions/` directory. Cross-link from the PRD's Decisions
table.

## Step 7 — Update BELMONT.md > Master PRD

Find the feature's `### prd-<slug>` row. Flip status from `planned` to
`in-progress`, refresh the brief, ensure the link points at
`memory/prds/prd-<slug>.md`. Bump `updated_at` in the frontmatter.

## Step 8 — Confirm + handoff

Present a summary:

- PRD: `memory/prds/prd-<slug>.md` (N lines).
- Milestones added: M<N>, M<N+1>, ... with task counts.
- ADRs created: D-NNN-..., D-NNN-...
- Open questions still requiring user input (if any).

Then prompt:

> Run `/belmont:implement P0-1` to start the first task, or `/belmont:next`
> to pick automatically. (Codex: `/new` then `belmont:implement P0-1`.)

## Begin

Confirm or ask for the feature slug, detect mode, run the interview.
Do NOT implement. Do NOT edit source code.
