# Getting started

## Requirements

- **Node 22.19.0 or newer** (`engines.node` is enforced at `belmont
  install` time; older Node will error before pi launches).
- **pnpm 9+** is only needed if you're hacking on the Belmont source
  repo itself; end users install via npm.
- macOS or Linux. Windows is a v1.1 target.
- (optional) [rtk](https://github.com/blake/rtk) on `PATH` for 60–90%
  context savings on bash-heavy workflows. Missing-rtk is warn-only
  (D-3 tiered strictness), never hard-fail.

## Install

Three channels (per §13.1):

```bash
# Primary — npm
npm install -g @belmont/cli

# Secondary — curl pipe sh
curl -sSL https://belmont.dev/install | bash

# Skills-only (no harness binary; for Codex/Cursor/Claude Code users)
npx @belmont/skills install
```

The pi runtime ships pinned inside `@belmont/harness` (per D-12 —
Belmont owns pi's version). You never `pi install` separately.

## First project

```bash
cd /path/to/your/project
belmont init
```

`belmont init` does four things (per §7.6 / §13.2):

1. Scaffolds `.belmont/` — `BELMONT.md`, `preferences.md`,
   `PROGRESS.md`, `models.json`, `.gitignore`, and an empty
   `memory/{subsystems,decisions,constraints,prds,episodic,steering}/`
   tree.
2. Runs `/belmont:models doctor` — auth + reachability check across
   the configured tiers.
3. Exits non-zero if **zero tiers are reachable** (§7.6 boot
   resilience contract). Fix the recovery commands the doctor prints
   and re-run.
4. Leaves the directory in a state where the next command is either
   `belmont` (drop into the pi REPL) or `belmont install` (a
   wider-scope idempotent re-sync — see §13.2).

## First conversation

```bash
belmont
```

This launches pi with the Belmont harness extension preloaded. At
the prompt:

```
> /belmont:working-backwards
```

`working-backwards` is skill #1 (per D-11). It produces the
`BELMONT.md > ## PR/FAQ` section that all subsequent skills key off
of. Without it, `/belmont:plan` has no goalposts.

Then:

```
> /belmont:plan
> /belmont:next
> /belmont:auto M1
```

The four together cover the "one developer drives a multi-feature
codebase from one keyboard" workflow.

## Daily commands

| Command | Surface | Purpose |
|---|---|---|
| `belmont` | shell | Launches pi + extension; equivalent to `pi` with the harness preloaded. |
| `belmont init` | shell | One-time scaffold + boot-doctor. |
| `belmont install` | shell | Idempotent re-sync: materializes skills into `~/.agents/skills/belmont/`, seeds `.belmont/` if missing, RTK preflight, models doctor. |
| `belmont validate` | shell | Walks `.belmont/`, prints hard-failures + warnings (M5 preflight; auto-loop runs this before starting). |
| `belmont update` | shell | `npm install -g @belmont/cli@latest`. Refuses on dirty git tree without `--allow-dirty`. |
| `belmont --version` | shell | Prints `belmont X.Y.Z`. |
| `belmont --script "<text>"` | shell | Non-interactive run of any pi prompt or slash command. Used by the §18 author smoke. Sugar for pi's `--print`. |
| `/belmont:status` | REPL | Read-only milestone tree + slot status. |
| `/belmont:working-backwards` | REPL | PR/FAQ generator. |
| `/belmont:plan` | REPL | Milestone + task expansion. |
| `/belmont:next` | REPL | What to do right now. |
| `/belmont:implement <task>` | REPL | Drive a single task to `[v]`. |
| `/belmont:verify <task>` | REPL | Evidence + verify-fold to subsystem memory. |
| `/belmont:auto <milestone>` | REPL | Sequential auto loop. Panel auto-opens (D-13). |
| `/belmont:steer "<msg>"` | REPL | Consume-before-next-task steering. |
| `/belmont:pause` / `/belmont:resume` / `/belmont:stop` | REPL | Auto-loop lifecycle. |
| `/belmont:models doctor [--milestone Mx]` | REPL | Tier reachability + per-milestone overlay diff. |
| `/belmont:mcp doctor` / `/belmont:mcp refresh` | REPL | MCP server status + tool cache management. |
| `/belmont:debug` | REPL | Drop into a focused diagnose loop. |
| `/belmont:prototype` | REPL | Throwaway prototype for spec exploration. |

## Hotkeys (M6)

| Key | Effect |
|---|---|
| `Alt+B` | Toggle side panel (passive ↔ active ↔ closed). |
| `Alt+T` | Toggle thinking-block visibility (token-collapse). |
| `Alt+R` | REPL refresh — new session, extensions preserved. |
| `j` / `k` | Move selection in panel (active mode). |
| `Enter` | Open selected milestone/task. |
| `a` | Queue `/belmont:auto <milestone>` from the panel. |
| `v` | Queue `/belmont:verify <task>` from the panel. |
| `Esc` | Yield focus from panel back to REPL. |

> The original M6 bindings were `Ctrl+B / Ctrl+O / Ctrl+L`; pi 0.75.5
> took those Ctrl letters for its own commands (`tui.editor.cursorLeft`,
> `app.tools.expand`, `app.model.select`). Belmont remapped to `Alt+_`
> at M11's §18 fix pass; the mnemonic intent is preserved
> (`Alt+B`elmont panel, `Alt+T`hinking, `Alt+R`efresh).

## Where things live

| Path | Owner | Purpose |
|---|---|---|
| `.belmont/BELMONT.md` | hand-edited (via amend) | Identity, PR/FAQ, Master PRD index, Glossary, Memory map. |
| `.belmont/preferences.md` | hand-edited | Project-level preferences (tone, commit rules, library bans). |
| `.belmont/PROGRESS.md` | tool-managed | Derived projection of milestone/task state. Hand-edits blocked at the `tool_call` hook (M5). |
| `.belmont/models.json` | hand-edited | Tier definitions + per-role overrides + features. |
| `.belmont/mcp.json` | hand-edited | MCP server config. Optional. |
| `.belmont/auto.json` | tool-managed (gitignored) | Auto-loop run state + audit spine. |
| `.belmont/memory/decisions/D-NNN-*.md` | hand-edited (via amend) | ADRs. Each carries `## Why this matters`, `## Decision`, `## Rationale`, `## Consequences`. |
| `.belmont/memory/prds/prd-*.md` | hand-edited | PRDs. |
| `.belmont/memory/subsystems/*.md` | hand-edited + verify-fold writes | Subsystem behavior + invariants. |
| `.belmont/memory/constraints/*.md` | hand-edited | Locked constraints. |
| `.belmont/memory/episodic/<date>-<slug>.md` | tool-managed (auto-appended) | Per-milestone audit log. |
| `.belmont/memory/steering/steering.md` | tool-managed (gitignored) | Pending steering messages; consumed-before-prepend by the next sub-session. |
| `.belmont/memory/stack.md` | hand-edited (singleton) | Language, runtime, framework, deps. |
| `.belmont/mcp-tools-cache.json` | tool-managed (gitignored) | MCP per-server tool discovery cache. |

## Read next

- [knowledge-model.md](./knowledge-model.md) — the memory layout, the `tool_call` knowledge-guard, and how PRDs/ADRs/subsystems compose.
- [auto-mode.md](./auto-mode.md) — what actually happens when you type `/belmont:auto`.
