# Verify — fold step

The full template referenced by `verify/SKILL.md > Step 4`. The fold
step runs only when the last `[x]` task in a milestone flips to `[v]`
during this verify pass.

## When a subsystem is "durable"

A subsystem is durable when:

- It will receive ongoing changes in future milestones (auth, search,
  billing, the data layer, the editor).
- Its truth would not be obvious from one file's name (multi-file
  collaborations, hidden invariants, gotchas).
- Another agent / new contributor would benefit from a present-tense
  description before editing.

If the milestone only added a one-shot script, a fixture, or a config
tweak, there is no subsystem to write — record the change in the
episodic entry and skip the subsystem file.

## Subsystem template

Write or amend `.belmont/memory/subsystems/<name>.md`:

```markdown
---
schema: belmont.subsystem.v1
id: subsystem-<name>
updated_at: YYYY-MM-DD
---

# <Subsystem name>

## Behavior

Present tense. How this subsystem currently works in the running
system. Walk through the happy path in 3–6 sentences. Then name the
invariants and the failure modes the agent that wrote it knew about.

## Implementation pointers

- `src/<file>.ts:<approx-line>` — <one-clause role>
- `src/<file>.ts` — <one-clause role>
- `migrations/<file>.sql` — <one-clause role>

Keep this list short — 5–10 entries. Cross-reference subsystems via
`see [[subsystem-<other>]]` when load-bearing.

## Don't re-do

- <approach> — rejected because <one-clause reason>.
- <approach> — rejected because <one-clause reason>.

The `## Don't re-do` block is the most valuable section — it stops the
next agent from re-litigating settled trade-offs.

## Open questions

- <question> — owner: <user|me>

## Revisions

- YYYY-MM-DD — <one-sentence change>.
```

When amending an existing subsystem note, edit the prose in place and
append a fresh Revisions line. Do not append a `## Update YYYY-MM-DD`
section — those are append-only logs, and Belmont treats memory as
amend-in-place.

## Glossary update

Open `.belmont/BELMONT.md > ## Glossary`. Add the project nouns
introduced this milestone. Each entry:

```
- **<Term>** — <definition in 1–2 sentences>.
```

Agents reading BELMONT.md every turn will then use the terms verbatim.

## Master PRD index update

Open `.belmont/BELMONT.md > ## Master PRD`. Find the feature's
`### prd-<slug>` row:

- **Some milestones still pending** → leave status `in-progress`,
  refresh the brief if the verified milestone changed the framing.
- **All milestones for the feature `[v]`** → flip status to `shipped`,
  rewrite the brief in past tense, add a one-line completion summary
  (verified date + commit range).

## PRD graduation

Open `.belmont/memory/prds/prd-<slug>.md`. If the feature is wholly
done:

- Flip frontmatter `status: active → shipped`.
- Bump `updated_at`.
- Append a Revisions line: `- YYYY-MM-DD — Graduated to shipped after M<N> verify pass.`

The PRD stays alive as the historical spec. The new subsystem note
(written above) is now the present-tense truth. New work that changes
the feature creates a new PRD revision, not a rewrite of the shipped
one.

## Memory map update

Open `.belmont/BELMONT.md > ## Memory map`. Add a row for the new
subsystem (and any new ADRs the milestone produced). Rows take the
form:

```
| <Topic>          | <Kind>            | <path>                                  | <when to read>                       |
|------------------|-------------------|-----------------------------------------|--------------------------------------|
| <subsystem name> | Subsystem         | memory/subsystems/<name>.md             | <one-clause "read when ..." trigger> |
```

The memory map's value is the "read when" column — it's how
`/belmont:implement` and `/belmont:debug` decide which subsystem files
to load.
