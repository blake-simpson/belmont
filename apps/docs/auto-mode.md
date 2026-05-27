# Auto mode

Sequential, two-runtime, REPL-native. Covers §8 of the master plan.

## What `/belmont:auto` does

```
> /belmont:auto M1
```

1. **Preflight** — runs `belmont validate` on the project. Hard
   failures stop the loop before any task starts. (M5 P0.)
2. **Open the panel** — the side panel auto-opens into PASSIVE mode
   (D-13). Worker events stream into the left pane.
3. **Spawn Runtime B** — `createAgentSessionRuntime` builds an
   isolated session manager + provider scope. The user's REPL
   (Runtime A) stays untouched and accepts input throughout.
4. **For each pending task in the milestone** (in PROGRESS.md order):
   a. **Consume steering** — `memory/steering/steering.md`, if
      present, is read + prepended to the sub-session's prompt. Then
      cleared (D-8 consume-and-prepend; never mid-turn splice).
   b. **Resolve the model tier** for the task. The 4-layer resolver
      runs: CLI override > per-milestone overlay > project default >
      tier base. See [multi-model.md](./multi-model.md).
   c. **Open a new sub-session** in Runtime B with the resolved tier.
   d. **Run the skill** chain that the task needs (`implement` →
      `verify` is the common shape; `plan` reorders only when the
      spec changes).
   e. **`belmont_transition`** flips the marker as work progresses:
      `[ ]` → `[>]` → `[x]` → `[v]`. Each transition appends to the
      `<date>-progress-transitions.md` episodic file.
   f. **Dispose Runtime B's per-task session** in a lockstep
      `try/finally`. The 10-iteration leak test (M8 ship gate)
      verifies no SessionManager / provider / event-listener leaks.
5. **Stream the run-summary** to Runtime A — final marker counts,
   any blockers, any rejected `belmont_transition` attempts.
6. **Dispose Runtime B** in a lockstep `try/finally`. `BELMONT_AUTO_MODE`
   env var unset.

## Two runtimes — why

Per **D-4**:

- Same-runtime `session.newSession()` would clobber the REPL's
  context. Runtime B isolates the worker's SessionManager + provider
  registry + event bus; Runtime A is untouched.
- `createAgentSessionRuntime` is pi 0.75.5's documented entry-point
  for "auxiliary agent runtime alongside the main interactive one."
  Per §8.1, the harness reaches it via `src/pi/sdk.ts` — every other
  module sees it through the type-only re-export.
- Same-runtime newSession was tried in the legacy v1.0-experiment.
  It worked until it didn't — the user's first follow-up after auto
  came back with empty context. Hard-deprecated.

## Steering

```
> /belmont:steer "skip the npm tests; we know they're flaky"
```

Per **D-8**:

- Steering writes to `memory/steering/steering.md`.
- The next sub-session's prompt-build CONSUMES the file (reads +
  deletes) and PREPENDS the content. No mid-turn splice; no
  in-flight interrupt of the current task.
- Multiple steerings between tasks accumulate; the prompt-build
  consumes the whole file.
- `Ctrl+C` aborts via pi's signal handler. Steering takes effect at
  the next decide iteration, not in the running one.

## Pause / resume / stop

| Slash | Effect |
|---|---|
| `/belmont:pause` | Finish the in-flight task, then suspend the loop. Resume continues from the next task. |
| `/belmont:resume` | Wake a paused loop. No-op when no paused state. |
| `/belmont:stop` | Finish the in-flight task, then exit the loop. Reset auto.json#status. |
| `Ctrl+C` (in REPL) | Pi's signal handler. Aborts mid-task. The aborted task stays at `[>]`; re-run picks it up. |

## `auto.json` audit spine

Per §8.5, every auto run writes `.belmont/auto.json` (gitignored)
with:

```jsonc
{
  "milestone": "M1",
  "status": "running" | "paused" | "stopped" | "done",
  "startedAt": "2026-05-27T18:00:00Z",
  "tasks": [
    {
      "id": "P0-1",
      "title": "...",
      "status": "queued" | "running" | "done" | "blocked",
      "marker": "[v]",
      "model": "anthropic/claude-sonnet-4-6",
      "tier": "high",
      "startedAt": "...",
      "endedAt": "..."
    }
  ],
  "rtk": { "totalCommandsWrapped": 42, "estimatedTokensSaved": 12345 },
  "mcp": [ /* per-server entries — see mcp.md */ ]
}
```

Used by `/belmont:status` to render the live milestone tree without
re-parsing PROGRESS.md every keystroke.

## The 10-iteration leak gate

Per §8.4 — the M8 ship gate. `packages/harness/test/leak.test.ts`
runs the auto loop 10 times against a tiny milestone fixture and
asserts:

1. Process RSS does not grow more than ~5 MB across the 10 iterations.
2. Process active handles return to the baseline count after each
   `runAuto` finishes.
3. No `SessionManager` or `ExtensionRunner` instances are retained.

The test runs as part of `pnpm test` on every CI build. If pi
upstream changes break the lifecycle (per §8.2 risk #2), this is the
test that fails first.

## What auto does NOT do

- **Spawn separate processes.** No `belmont __worker` / `__guard`
  subprocesses. D-6 + D-7 took those out. The worker is a function
  in the same Node process as the REPL.
- **Run tasks in parallel.** D-1 — sequential only in v1.x.
- **Re-plan mid-run.** `/belmont:plan` re-ordering happens between
  runs, not inside one. The auto loop reads the PROGRESS.md snapshot
  at startup; mid-run edits are noticed at the next `runAuto`
  invocation.
- **Auto-Ctrl+L the REPL.** Per the resolved tension (Appendix §20),
  fresh-ctx for Runtime A is MANUAL only — Ctrl+L. Auto-reset destroys
  the user's most common follow-up ("now show me what just happened").
- **Touch MCP servers without `auto:true`.** See [mcp.md](./mcp.md).

## Common patterns

- **Single-task burst** — `/belmont:auto M1 --task P0-3` skips ahead
  to a specific task (rare; usually `next` + `implement` is the
  manual equivalent).
- **Tier override** — `/belmont:auto M1 --tier implementation=high` overrides
  the milestone overlay just for this run. The override is NOT
  written to PROGRESS.md.
- **Dry preflight** — `belmont validate` is the cheap version; runs
  in milliseconds against the static `.belmont/` tree. Prefer
  invoking validate manually before kicking auto on a big milestone.

## Read next

- [multi-model.md](./multi-model.md) — how tiers + overlays decide
  which model runs each task.
- [troubleshooting.md](./troubleshooting.md) — common auto-mode
  failure modes.
