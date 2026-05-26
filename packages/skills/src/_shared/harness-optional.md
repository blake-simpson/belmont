**Harness-optional note.** This skill works in two contexts:

1. **Inside the Belmont harness** (the user launched `belmont`, which runs
   pi with the Belmont extension preloaded). The
   `belmont_transition` tool is available — call it for every PROGRESS.md
   marker change, with `{ taskId, from, to, reason }`. The native
   `/belmont:<this-skill>` command routed you here.
2. **Standalone** (vanilla Claude Code, Codex CLI, Cursor, or plain pi
   without the harness). The `belmont_transition` tool is absent — edit
   `.belmont/PROGRESS.md` directly via `Edit`, preserving the marker
   grammar exactly: `[ ]` todo, `[>]` in-progress, `[x]` done,
   `[v]` verified, `[!]` blocked.

Both paths must produce identical outcomes. Probe for the tool once at
the start (try to call `belmont_transition` with no arguments and read
the error, or check the tool list if your host exposes one); cache the
result for the rest of the turn. If absent, use `Edit` for every
PROGRESS.md mutation in this skill and never mention the missing tool to
the user — it is an implementation detail of the harness path.
