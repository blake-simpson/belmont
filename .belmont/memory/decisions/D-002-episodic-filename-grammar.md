---
schema: belmont.adr.v1
id: D-002-episodic-filename-grammar
topic: knowledge-model
status: accepted
updated_at: 2026-05-26
supersedes: null
---

# D-002: Episodic filenames are date-only, not timestamp-prefixed

## Why this matters

Plan v2.3 §4.4 rule 7 specifies that `memory/episodic/*.md` filenames must
match `YYYY-MM-DD-HH-mm-ss-<task>.md`. That grammar carries no information
the directory listing doesn't already supply — sub-day ordering is
implicit in `ls -t` and irrelevant for retrieval. The two existing
episodic entries (`2026-05-26-m0-spike-and-scaffold.md`,
`2026-05-26-m1-workspace-bootstrap.md`) already adopted the date-only
form during M0/M1, before the validator existed to enforce either rule.

## Decision

The canonical v1.0 episodic filename grammar is:

    YYYY-MM-DD-<slug>.md

where `<slug>` is `[a-z0-9][a-z0-9-]*`. The HH-mm-ss segment from plan
v2.3 §4.4 rule 7 is dropped. `validateProjectedKnowledgeWrite` enforces
the date-only form and rejects timestamp-prefixed names in this
directory.

## Rationale

- **Existing dogfood already uses date-only.** Fixing them retroactively
  to `YYYY-MM-DD-HH-mm-ss-` would invalidate the M0 / M1 record without
  any retrieval benefit.
- **Multiple episodes per day are rare for a single-developer harness.**
  When they happen, the slug discriminates (e.g.
  `2026-05-26-m1-workspace-bootstrap.md` vs
  `2026-05-26-m2-knowledge-schema.md`).
- **The HH-mm-ss grammar is `git log`'s job.** Episodic entries are
  human-curated narratives, not auto-logged events; the harness can
  reconstruct sub-day chronology from commit timestamps when needed.
- The grammar tightening is local (one regex in
  `validateProjectedKnowledgeWrite`) and ships with M2's validator.

## Don't re-do

- **Re-introducing HH-mm-ss** — would invalidate every existing entry
  without retrieval gain. If sub-day ordering is ever genuinely needed,
  use a `seq-NN` suffix on the slug, not a clock-time segment.
- **Allowing both grammars** — a forked filename rule is worse than
  picking one. The validator is strict, the rejection text is
  deterministic.

## Consequences

- `validateProjectedKnowledgeWrite` rejects timestamp-prefixed episodic
  names with: `memory/episodic/*.md filenames must match
  YYYY-MM-DD-<slug>.md. The HH-mm-ss segment from the plan is dropped
  per D-002; sub-day discrimination uses the slug.`
- Plan v2.3 §4.4 rule 7 stays as historical reference; this ADR is the
  current source of truth.
- Existing entries pass the validator unchanged.

## Revisions

- 2026-05-26 — Accepted before M2's validator landed, to avoid
  invalidating M0/M1 dogfood.
