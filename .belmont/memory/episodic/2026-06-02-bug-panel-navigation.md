---
schema: belmont.episode.v1
date: 2026-06-02
---

# 2026-06-02 — bug panel navigation

## Events

- [note] User smoke found the WIP panel visible but not practically navigable/startable. The root cause was that panel input dispatch only covered the key encodings used by tests and a few raw escape sequences, while pi/terminals can surface normalized names such as `down`, `up`, `enter`, and `escape`.
- [note] Widened the active-panel key matcher to accept normalized names plus raw terminal forms, updated the footer to advertise arrow navigation, and added regression coverage.
- [note] Did not graduate Master PRDs yet; this bug means TUI/auto behavior needs user smoke before shipped bookkeeping is trustworthy.
