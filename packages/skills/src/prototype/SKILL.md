---
name: prototype
description: Build a throwaway prototype to make a hard design tradeoff visible before committing to it — a runnable logic spike or several radically different UI variants. Interactive only. Use when a planning decision is expensive AND not legible from a description, or the user says "prototype this", "let me see it", "try a few designs", "spike this".
---

# Belmont: Prototype

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/ask-user.md -->

<!-- @include _shared/knowledge-discipline.md -->

A prototype is **throwaway code that answers one question** so the
human can *see* a trade-off instead of judging it from prose. It
exists because `/belmont:plan` sometimes surfaces a decision that is
expensive to get wrong AND genuinely not legible from a description
("which architecture?", "what should this look like?"). Describing the
options is not enough; you build the options.

This skill is **interactive only**. It is never invoked by
`/belmont:auto` (the auto loop has no human to look at variants). If
the user is not in the loop, do not prototype — that is `/belmont:plan`'s
job, which proceeds on its prose recommendation instead.

## Hard contract (non-negotiable)

1. **Throwaway from the first line.** Prototype code is never
   production code and is never a reference for `/belmont:implement`.
   Do not let it bias the implementation — the *answer* survives,
   the code does not.
2. **Never committed.** All prototype files live under
   `belmont-prototype/` at the repo root. Add it to `.git/info/exclude`
   (local-only, no committed `.gitignore` churn) at the start:
   `echo 'belmont-prototype/' >> .git/info/exclude`. Never `git add`
   anything in it.
3. **Deleted before this skill ends.** Once the question is answered
   and the verdict captured, `rm -rf belmont-prototype/`. The only
   durable output is the recorded decision (Step 4). If the user
   explicitly wants to keep playing, leave it but tell them it must
   be deleted before `/belmont:auto` runs.
4. **No polish.** No tests, no error handling beyond runnable, no
   abstractions. Learn fast, delete.
5. **One command to run.** Use the project's existing runner
   (`pnpm <name>`, `bun <path>`, `python <path>`, etc.). The user
   must start it without thinking.

## Step 0 — Get the question

The question is the input. Sources, in order:

- The skill invocation arguments (`prototype` <question>).
- A `/belmont:plan` pointer — if planning flagged a decision and
  recommended prototyping it, the plan's `## Open questions` row IS
  the question.
- Otherwise ask the user one focused question (via `belmont_ask_user` —
  see "Asking the user" above): *"What decision are we de-risking, and
  what are the candidate answers?"*

Write the one-sentence question at the top of every prototype file as
a comment so it never gets lost.

## Step 1 — Pick the branch

The question's *shape* picks the artifact. Getting this wrong wastes
the prototype.

- **"Does this logic / data model / state machine feel right?"** →
  Build a tiny interactive terminal app that drives the state through
  the cases that are hard to reason about on paper. Each variant is
  one CLI command; the user runs through scenarios A/B/C and watches
  state print on every step.
- **"What should this look / feel like?"** → Generate 2–4 radically
  different UI variants on one route, switchable from a floating bar
  at the top. Make the variants *different* in axis (information
  density, visual weight, navigation model), not minor tweaks of one.

If the question is genuinely ambiguous and the user is reachable, ask.
If not, default by surrounding code (backend module → logic; page or
component → UI) and state the assumption at the top.

## Step 2 — Build the variants

Build **2–4 genuinely different** options (A/B/C…), not minor tweaks
of one — the point is contrast. Surface state on every action /
variant switch so the user can see what changed. Keep each variant
small enough to compare side by side. No reusable components shared
between variants — that's premature abstraction; the variants must be
allowed to diverge.

For logic spikes: print the state after every transition so the user
sees the path through the machine.

For UI spikes: include a small bar with `A` / `B` / `C` toggles that
swap the active variant on the route. Mention current variant in the
URL hash or query so reloads stick.

## Step 3 — Show it, iterate

Give the user the one command and how to switch variants. Let them
play. Iterate quickly on what they react to — this is a conversation
with running code, not a deliverable. Drive toward a verdict:
*which option, and why*.

## Step 4 — Capture + handoff

Once the user has a verdict, the **answer is the only thing that
matters**. Do, in order:

1. **Record the decision** in `.belmont/memory/decisions/D-NNN-<topic>.md`
   per the ADR shape from `/belmont:plan`. Pick the next free `D-NNN`
   integer by scanning `memory/decisions/`. Body:
   - `## Why this matters` — the original question.
   - `## Decision` — the chosen variant + one-sentence framing.
   - `## Rationale` — variants tried + the one-clause reason each
     other lost. Cite specific reactions the user had when relevant.
   - `## Don't re-do` — the rejected variants by name + why.
   - `## Consequences` — what downstream choices this pins.
   - `## Revisions` — `- YYYY-MM-DD — Accepted from prototype session.`
2. **Cross-link** from the relevant `memory/prds/prd-<slug>.md`
   Decisions table (one new row pointing to the new ADR).
3. **Update Master PRD index in BELMONT.md** only if the decision
   surfaces a new feature roster row; otherwise leave it alone.
4. **Delete the prototype.** `rm -rf belmont-prototype/` and confirm
   it's gone. If the user explicitly wants to keep tinkering, leave
   it but restate rule 3 of the hard contract.
5. **Episodic entry.** Write `memory/episodic/YYYY-MM-DD-prototype-<slug>.md`:
   what the question was, what variants existed, what the verdict was,
   what surprised. 5–10 lines.

## Step 5 — Handoff

If the prototype unblocked a decision that `/belmont:plan` was waiting
on, prompt:

> Run `/belmont:plan <feature>` to resume planning with the decision now
> recorded. (Codex: `/new` then `belmont:plan <feature>`.)

If planning was already complete and this only confirmed a detail,
say so and skip the handoff.

## Rules

- **Throwaway is non-negotiable.** Rule 3 of the hard contract is the
  ship gate of this skill.
- **No source code outside `belmont-prototype/`.** Not even one line
  in the real tree.
- **Do not implement the real feature.** This skill is decision-making,
  not delivery.
- **Only memory writes are durable.** The ADR + the PRD's Decisions
  row + the episodic entry. Everything else evaporates.

## Begin

Await the user's question (or read the `/belmont:plan` pointer). Add
`belmont-prototype/` to `.git/info/exclude`. Build, iterate, capture
the decision, delete the prototype.
