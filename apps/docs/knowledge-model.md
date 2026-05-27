# Knowledge model

The living, indexed memory layout under `.belmont/memory/`. Covers
§4 + §5 of the master plan.

## Why directory-per-kind

Per **D-2** (locked decision):

- The brief explicitly names Verona's vocabulary: PRDs, ADRs,
  subsystems, constraints. Directories map 1:1 to that vocabulary;
  flat-prefix doesn't.
- Real projects have many subsystems and many decisions. A single
  mega-file is hostile to amendment and to diff review.
- The Verona reference (`~/code/personal/verona/`) demonstrated the
  shape works for a long-running project.

`feature/belmont-rework`'s flat-prefix `learned/facts/` layout and the
per-feature `features/<slug>/` directory model are both discarded.

## Layout

```
.belmont/
├── BELMONT.md                  # entry-point (Identity, PR/FAQ, Master PRD, Glossary, Memory map)
├── preferences.md              # project-level preferences
├── PROGRESS.md                 # tool-managed (state machine projection)
├── models.json                 # tier config
├── mcp.json                    # MCP server config (optional)
├── auto.json                   # auto-loop state (gitignored)
├── mcp-tools-cache.json        # MCP tool cache (gitignored)
└── memory/
    ├── subsystems/             # one file per coherent subsystem
    ├── decisions/              # ADRs: D-NNN-<kebab-slug>.md
    ├── constraints/            # locked rules; loud, short
    ├── prds/                   # product spec briefs
    ├── episodic/               # auto-managed audit log
    ├── steering/               # gitignored; consume-and-prepend
    └── stack.md                # singleton (TS, pnpm, Node, pi pin)
```

## File schemas

Every knowledge file carries YAML frontmatter (schema name + `updated_at`):

| Schema | Used by | Required fields |
|---|---|---|
| `belmont.entrypoint.v1` | `BELMONT.md` | `schema`, `updated_at` |
| `belmont.preferences.v1` | `preferences.md` | `schema`, `updated_at` |
| `belmont.prd.v1` | `memory/prds/prd-*.md` | `schema`, `updated_at`, `slug`, `status` |
| `belmont.adr.v1` | `memory/decisions/D-*.md` | `schema`, `updated_at`, `id`, `status` |
| `belmont.subsystem.v1` | `memory/subsystems/*.md` | `schema`, `updated_at`, `name` |
| `belmont.constraint.v1` | `memory/constraints/*.md` | `schema`, `updated_at`, `name` |
| `belmont.episode.v1` | `memory/episodic/*.md` | `schema`, `updated_at` *or* `date`, `phase` (or `kind`) |
| `belmont.stack.v1` | `memory/stack.md` | `schema`, `updated_at` |

The schema strings are pinned at `v1`. v2 schemas are a v1.1+ concern
(migrate-in-place, never multi-version-at-once).

## Amend-in-place, never append-only

The hard rule: every knowledge file is amended in place. `git log` is
the chronology — no "history" sections inside files, no
`memory/decisions/2026-05-26-D-001-omp.md` filename timestamps, no
append-only decision logs.

Episodic is the one exception: each milestone gets one or more dated
files (`<YYYY-MM-DD>-<slug>.md`); within a file, events are appended
in chronological order. Episodic is the audit log, not knowledge.

## The `tool_call` knowledge-guard

Per §5.3 (M5 implementation), the `tool_call` hook blocks two
write-time failure modes:

1. **Direct writes to `.belmont/PROGRESS.md`.** PROGRESS is a derived
   projection of the state machine — the `belmont_transition` tool is
   the only legitimate writer. Direct `Edit`/`Write` calls are rejected
   with a `{ message, suggestion }` envelope pointing at the
   transition tool.
2. **Knowledge-cap violations.** Every knowledge kind has a
   line/character cap (defaults vary by kind). Writes that exceed the
   cap are rejected with a suggestion to split into multiple files or
   to use the `verify` skill's subsystem-fold path.

The rejection includes a `suggestion` field with the exact next move
the agent should make — preventing the 3-5-wasted-tool-call loop where
the agent retries the same write expecting a different outcome.

## `belmont validate` — preflight walker

```bash
belmont validate [project-dir]
```

Walks `.belmont/` and prints two report sections:

- **Hard failures** — exit code 2. Examples: missing `BELMONT.md`,
  unparseable frontmatter, PROGRESS.md parser errors, missing required
  fields.
- **Warnings** — exit code 0. Examples: PRDs referenced in BELMONT.md
  that don't exist on disk (the M5–M9 `PRD-INDEX` warnings); episodic
  filename outside the canonical grammar.

The auto-loop runs `belmont validate` as a preflight gate (M5 P0) so
runs against a corrupted `.belmont/` fail fast instead of mid-task.

## Episodic event grammar

Each event in `.belmont/memory/episodic/<date>-<slug>.md` follows:

```
## YYYY-MM-DDTHH:MM:SSZ — <kind>: <subject>

<details, free-form>
```

Where `<kind>` is one of: `phase`, `transition`, `steering`,
`tool-call`, `mcp-tools`, `validate`, `error`, `note`. The episodic
filename grammar is ADR'd in `D-002-episodic-filename-grammar.md`:
the `<slug>` is the milestone or topic identifier (e.g.
`m10-mcp-bridge`, `progress-transitions`, `mcp-tools`).

## Memory map — the index

`BELMONT.md > ## Memory map` is the human-readable index over the
memory tree. Every load-bearing fact in the project should have one
row of the form:

| Topic | Kind | File | Read when |
|---|---|---|---|
| Topic name | ADR / PRD / Constraint / Subsystem / Stack singleton | path | one-sentence trigger |

When a memory file lands or is renamed, amend the table. The CI
`PRD-INDEX` check (M5+) flags any PRD listed in the Master PRD section
without a corresponding `memory/prds/prd-*.md` file.

## How the skills interact with memory

- `working-backwards` writes `BELMONT.md > ## PR/FAQ` + seeds the
  Master PRD list.
- `plan` writes `memory/prds/prd-*.md` and orders `PROGRESS.md` tasks.
- `next` is read-only; renders.
- `implement` writes source code; flips PROGRESS markers via
  `belmont_transition`.
- `verify` writes the verify-fold to `memory/subsystems/<name>.md` —
  the only skill that grows the knowledge tree as a side effect of
  routine task completion.
- `status` is read-only; renders.
- `prototype` is throwaway — no memory writes.
- `debug` may write `memory/episodic/<date>-debug-<slug>.md` for the
  post-mortem of a hard bug.

## Read next

- [auto-mode.md](./auto-mode.md) — how `belmont_transition` is called
  inside the auto loop.
- [standalone-skills.md](./standalone-skills.md) — how skills detect
  whether the `belmont_transition` tool exists and fall back to
  vanilla `Edit` when it doesn't.
