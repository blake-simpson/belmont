# Troubleshooting

## `belmont init` fails with "zero tiers reachable" (exit code 2)

The §7.6 boot resilience contract. `belmont init` runs
`/belmont:models doctor` as its last step and refuses to leave
the directory in a state where NO model is callable.

Fix the recovery commands the doctor printed. Common causes:

- **No API key set.** The doctor will say `unauthenticated`. Run
  the provider's auth command (e.g. `pi auth anthropic`, `codex
  login`, `ollama serve` if local).
- **Tier model is unknown.** Spelling mistake in `models.json#tiers`
  — provider says "model not found." Fix the model string and
  re-run `belmont init` (or `/belmont:models doctor` if `.belmont/`
  already exists).
- **All tiers misconfigured.** Re-run `belmont init` in a new
  scratch directory and copy the freshly-scaffolded `models.json`
  in.

After fixing, `/belmont:models doctor` returns to green without
needing a re-init.

## `belmont update: refusing to run with a dirty working tree`

`belmont update` does a courtesy `git status --porcelain` check
in the current cwd before shelling out to npm. The intent: prevent
"the update broke my project" confusion when the user's actual
issue is uncommitted work.

Options:

- `git stash && belmont update && git stash pop` — clean approach.
- `belmont update --allow-dirty` — escape hatch.

Pi version is implicit in the new `@belmont/cli` install — there's
no separate `pi upgrade` to worry about (D-12).

## `rtk not on PATH — user bash commands run unwrapped`

D-3 tiered strictness: missing rtk is a WARNING, never a
hard-fail. Three resolutions:

1. **Install rtk.** Recommended for bash-heavy workflows; 60–90%
   context savings.
2. **Disable RTK.** `export BELMONT_RTK_DISABLE=1` in your shell
   rc. Silences the notice. Or set `features.rtk: false` in
   `.belmont/models.json`.
3. **Live with it.** Pi runs the user_bash commands directly; the
   only cost is more tokens per bash call.

## `belmont validate` exits 2 with "BELMONT_DIR_MISSING"

You're not in a project that has been `belmont init`'d. Either:

- `belmont init` (creates a fresh `.belmont/`).
- `cd` into a directory that already has `.belmont/`.

`belmont validate` is exit-code 0 when the directory is healthy,
exit-code 2 only on hard failures (missing required files,
unparseable schema, parser errors). Warnings (e.g. PRD-INDEX
mismatches) keep exit code 0 and just print.

## Knowledge-cap rejection from the agent

The `tool_call` hook (M5) rejects writes that:

- Touch `.belmont/PROGRESS.md` directly (use `belmont_transition`
  instead).
- Exceed the per-kind knowledge-cap (default ~250 lines for ADRs,
  varies by kind).

The rejection includes a `suggestion` field — the agent should
follow the suggestion verbatim, not retry the same write. Failure
modes when the agent ignores the suggestion: 3-5 retries before
giving up. The §7 risk #7 mitigation routes around this with the
preflight `belmont validate`.

## Scope-guard reverted my edit

The `turn_end` hook (M5) snapshots `.belmont/` at `turn_start` and
reverts:

- Unclassified-path mutations under `.belmont/`.
- Steering-zone mutations from outside the `steer` flow.
- Knowledge file DELETIONS (additions and amendments are allowed;
  deletions need an explicit ADR amendment first).

Check the episodic event log
(`.belmont/memory/episodic/<date>-scope-revert.md`) for the exact
reason. Typical fix: amend the right file rather than deleting,
or add a `D-NNN-*.md` ADR documenting the deletion before
attempting it.

## `/belmont:mcp` says "refused — no auto:true"

You're in auto mode (`BELMONT_AUTO_MODE=1`) and the MCP server
doesn't have `auto: true` in `.belmont/mcp.json`. Add it (and
accept that the server is now callable in unattended auto runs)
or run interactively.

There is no `--force` escape hatch for the blast-radius gate.
v1.0 is strict by design.

## MCP cache is stale after I rotated an env-var token

`.belmont/mcp-tools-cache.json` invalidates on:

1. `mcp.json` content changes.
2. `${VAR}` resolution changes (post-interpolation `configHash`).
3. Explicit `/belmont:mcp refresh`.

Case #2 should auto-invalidate when you `export NEW_TOKEN=...` and
re-launch pi. If you suspect the cache is wedged, run
`/belmont:mcp refresh` — clears the cache, re-probes everything.

## Auto loop hangs on a task

`Ctrl+C` in the REPL — pi's signal handler aborts the worker. The
aborted task stays at `[>]`; re-run `/belmont:auto Mx` picks it up
from there.

If `Ctrl+C` doesn't release, the leak test
(`packages/harness/test/leak.test.ts`) is the canary — if the test
suite is also hanging, file an upstream pi issue. Per §16 risk #2,
this is the documented escape route.

## Side panel doesn't open

Three states (per M6):

- **closed** — `Alt+B` reopens.
- **passive** — `Alt+B` goes ACTIVE.
- **active** — `Alt+B` returns to PASSIVE while auto is running, or
  CLOSED while idle.

Auto-open on `/belmont:auto`: if the panel is closed, `runAuto`'s
preamble opens it. If `Alt+B` doesn't respond at all, you're
likely in a `pi --print "..."` (i.e. `belmont --script` ) run —
that mode has no TUI to open.

## Codex / Cursor / Claude Code doesn't pick up the skills

Cross-harness install lands at `~/.agents/skills/belmont/<slug>/`
by default (D-9). If your host expects a different path:

- Claude Code: `~/.claude/skills/belmont/<slug>/` —
  `npx @belmont/skills install --target ~/.claude/skills/belmont/`.
- Codex CLI: per-version. `~/.codex/skills/belmont/<slug>/` for
  older Codex; `~/.agents/skills/belmont/` for current. Verify with
  `codex --help` against your installed version.
- Cursor: reads `~/.agents/skills/` (agentskills.io discovery).
  No override needed.

See [cross-harness.md](./cross-harness.md) for the full table.

## `belmont --version` says something other than `belmont X.Y.Z`

You're picking up an older install. `which belmont` to find it;
`npm install -g @belmont/cli@latest` to upgrade.

## Where to look next

- For panel / hotkey weirdness: M6 episodic.
- For auto-mode lifecycle: M8 episodic + the 10-iter leak test.
- For MCP gate failures: M10 episodic.
- For everything else: `git log` and `.belmont/memory/episodic/`.
