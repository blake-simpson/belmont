# Belmont v1.0 — pi-native rebuild

> **Status.** Pre-release. The `v1-rebuild` branch is the from-scratch
> rewrite cut off `v0.10.7-final`. The prior `feature/belmont-rework`
> branch is the abandoned v1.0 experiment (discard pile).

## What this is

A pi-native coding harness. The user runs `belmont`, the pi REPL boots
with the `@belmont/harness` extension preloaded, and a structured
`.belmont/` memory + REPL-native sequential auto mode + per-milestone
model tiering lets one developer drive a multi-feature codebase from
one keyboard.

## Layout (target — landing milestone by milestone)

```
packages/
├── knowledge-schema/   # pure parsers, validators, transitions; no pi imports
├── skills/             # canonical SKILL.md sources + composer + standalone installer
├── harness/            # the SOLE pi importer; hooks, tools, TUI, auto loop
└── cli/                # `belmont` launcher, init, update, validate
apps/docs/              # docs site placeholder (M11)
spike/                  # M0 try-and-fail evaluation of candidate pi packages
.belmont/               # dogfood: BELMONT.md + preferences + PROGRESS + memory/
```

## How to follow the rebuild

- Master plan: `~/Desktop/belmont-pi-planning-v2.3.md` (outside repo by
  author choice — authoritative spec; M0–M11 in §17).
- Dogfooded knowledge: `.belmont/BELMONT.md`.
- Current progress: `.belmont/PROGRESS.md`.
- Decisions: `.belmont/memory/decisions/D-*.md`.

## License

MIT — see `LICENSE` + `NOTICE`.
