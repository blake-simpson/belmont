**Where things live (load-bearing).** Belmont's project knowledge sits
under `.belmont/`. Every write in this skill MUST route to the right
file by kind.

| Kind | Path | When to write |
|---|---|---|
| Identity, PR/FAQ, Master PRD index, Glossary, Memory map | `.belmont/BELMONT.md` | `working-backwards` (PR/FAQ + index seed), `plan` (index updates), `verify` (status flips, glossary), `debug` (glossary on new nouns). |
| User preferences (≤60 lines) | `.belmont/preferences.md` | Only when the user explicitly states a behavioral rule. |
| Task ledger | `.belmont/PROGRESS.md` | Every marker mutation (see progress grammar above). |
| Tier config | `.belmont/models.json` | Never from a skill — managed by `/belmont:models`. |
| Subsystem behavior | `.belmont/memory/subsystems/<name>.md` | `verify` fold-step when a subsystem stabilizes; `debug` when truth drifts from spec. |
| Architectural decisions | `.belmont/memory/decisions/D-NNN-<topic>.md` | `plan` (irreversible choices), `prototype` (the only durable output), `debug` (root-cause patterns worth pinning). |
| Cross-cutting non-negotiables | `.belmont/memory/constraints/<name>.md` | Rarely; when the user states a non-negotiable that spans features. |
| Feature specs (aspirational) | `.belmont/memory/prds/prd-<topic>.md` | `plan` (one file per feature in the Master PRD index). Becomes `status: shipped` via `verify`'s fold-step. |
| Phase narratives | `.belmont/memory/episodic/YYYY-MM-DD-<task>.md` | At the end of `implement`/`verify`/`debug`/`prototype` runs — short prose of what happened, why, what surprised. |
| User steering notes | `.belmont/memory/steering/steering.md` | Only when the user explicitly writes steering input. |
| Stack singleton | `.belmont/memory/stack.md` | When a project-wide tech choice changes. |

**Amend in place.** Memory files are living documents. Edit existing
sections, remove stale lines, append a `## Revisions` line dated today
(`- YYYY-MM-DD — <one-sentence change>`). Never append a new section
when an existing one is now wrong; rewrite the existing one and record
the change in Revisions.

**Don't write outside `.belmont/`.** This skill must not edit source code
(except `implement`, `next`, `debug`), commit logs, or files in other
project directories. Touching `.git/`, `node_modules/`, build outputs,
or sibling-tool config (e.g. `.claude/`, `.codex/`) is out of scope.

**Never commit secrets, PII, or absolute paths from the user's machine
into `.belmont/`** — use abstract examples (`/path/to/project`,
`example.com`, `acme-customer`).
