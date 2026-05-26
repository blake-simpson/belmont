**PROGRESS.md grammar (load-bearing).** This file is the task ledger.
Every marker change in this skill MUST follow this contract.

The 5 markers:

| Marker | Meaning |
|---|---|
| `[ ]` | todo — not started |
| `[>]` | in-progress — work started, not yet done |
| `[x]` | done — implemented, awaiting verification |
| `[v]` | verified — verify skill confirmed evidence |
| `[!]` | blocked — explain why on the same line |

The allowed transitions: `[ ] → [>]`, `[ ] → [x]`, `[>] → [x]`,
`[x] → [v]`, any → `[!]`, `[!] → [ ]`. A `[v]` task is terminal — do not
re-flip it. A blocked task carries its reason inline: `[!] P0-1 Auth — blocked: waiting on schema decision`.

**Milestone status is computed, never stored.** Milestone headers never
carry an emoji or marker. The header form is `### M<N>: <name>`; status
is derived from the milestone's tasks (`verified` when all `[v]`, `done`
when all `[x]` or `[v]`, `blocked` when any `[!]`, `in_progress` when
mixed, `not_started` when all `[ ]`).

**Milestones are immutable once defined.** Follow-up tasks discovered
mid-implementation are added to the milestone that surfaced them — never
to a new milestone, never retargeted to a future milestone. Genuinely
new feature work goes through `/belmont:plan` and gets its own
milestone; bug-shaped or polish-shaped follow-ups stay in scope.

Task IDs use the legacy grammar (`P<priority>-<n>`, e.g. `P0-1`, `P1-3`).
When you add a follow-up, append it to the milestone's task list at the
next free ID for that priority.
