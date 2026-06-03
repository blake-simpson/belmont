---
schema: belmont.subsystem.v1
id: subsystem-tui
updated_at: 2026-06-02
---

# TUI subsystem

## Behavior

- The side panel is a pi `ctx.ui.custom` overlay showing the parsed milestone/task tree from `.belmont/PROGRESS.md`.
- `Ctrl+Alt+B` opens the panel in active/focused mode; `/belmont:auto` opens it passively so the REPL keeps keyboard focus.
- In active panel mode, both arrow keys and `j`/`k` move the cursor. `Enter` on a task queues `/belmont:implement <task-id>`. `Enter` or `a` on a milestone queues `/belmont:auto <milestone-id>`. `v` on a milestone queues `/belmont:verify <milestone-id>`. `Esc`, `Ctrl+C`, or `Ctrl+Alt+B` closes.
- The panel key matcher accepts both raw terminal escape sequences and pi-normalized key identifiers, because pi's TUI examples recommend `matchesKey()` and terminals can surface either form.

## Don't re-do

- Do not make `/belmont:auto` steal REPL focus when it auto-opens the panel; passive auto-open is intentional so steering and stop commands remain typeable.
- Do not bind panel navigation as global shortcuts. In-panel keys belong to the focused overlay component so normal REPL editing remains unaffected.

## Revisions

- 2026-06-02 — Added the TUI subsystem note after panel navigation dispatched only for some key encodings.
