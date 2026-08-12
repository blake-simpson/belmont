---
name: loop
description: Claude Code or Codex only. Drive a single feature to completion by self-pacing /belmont:implement → verify → next → status until no pending milestones remain.
alwaysApply: false
---

# Belmont: Loop

**Claude Code or Codex only.** This skill drives one Belmont feature to completion by repeatedly running the implement → verify → next → status cycle, pausing between iterations so you can watch progress and steer. It is a thin orchestration wrapper around the host tool's long-running interactive primitive:

- Claude Code delegates to the built-in `/loop` skill.
- Codex delegates to Goal mode with `/goal`.

Other AI CLIs do not have an equivalent interactive loop primitive, so Belmont keeps this skill hidden from their default install surface.

If you are neither Claude Code nor Codex, stop and tell the user to run `belmont auto --feature <feature>` from the terminal instead.

This is the interactive, in-session counterpart to the headless `belmont auto` CLI (also aliased `belmont loop`). Use `/belmont:loop` in Claude Code or `$belmont:loop` in Codex when you want to stay in the REPL and have the agent advance the feature milestone-by-milestone without you re-typing each skill. Use `belmont auto` when you want fully headless, parallel, worktree-based execution from the terminal.

## Argument

`$ARGUMENTS` is the feature name or slug to drive (e.g. `/belmont:loop checkout`). 

- If `$ARGUMENTS` is empty: list the feature directories under `.belmont/features/`, read each `PRD.md` for its name and status, and ask the user which feature to drive. If exactly one feature exists, you may select it and confirm. If none exist, tell the user to run `/belmont:product-plan` first, then stop.
- If `$ARGUMENTS` names a feature that does not resolve to a `.belmont/features/<slug>/` directory: report the mismatch, list the available feature slugs, and ask the user to clarify rather than guessing.

Resolve the argument to a single feature slug before starting the loop. The loop only ever progresses this one feature — never start unrelated work.

## Preflight (run once, before looping)

1. Resolve the feature slug from `$ARGUMENTS` as described above. Call it `<feature>`.
2. Confirm the feature exists and see how many milestones are pending. Prefer `belmont status --feature <feature>` if the CLI is installed — the Go CLI parses PROGRESS.md itself, so this costs one command and no file reads. Fall back to `/belmont:status <feature>` only if the CLI is unavailable.
3. If every milestone is already **verified**, report that the feature is complete and **stop** — do not start a loop.
   - If milestones read *done* but not verified (`[x]`, not `[v]`), that is not finished: `belmont status` flags it and names `belmont reverify`. Either run verification for them or start the loop; do not stop here. See issue #30.
4. Otherwise, hand off to the loop driver below.

## Loop driver

If you are running in Claude Code, start Claude Code's built-in **`/loop`** skill in **self-paced mode** (no fixed interval — let the model decide when to schedule the next iteration). Pass it the iteration recipe below, with `<feature>` substituted for the resolved slug. The exact handoff is:

```
/loop Drive the <feature> Belmont feature to completion. Each iteration:
  1. Run /belmont:implement <feature> to build the next pending milestone.
  2. Run /belmont:verify <feature> on what was just built.
  3. If verify reports follow-up tasks or failures: run /belmont:next <feature>
     and repeat /belmont:next <feature> until those follow-ups clear, then
     re-run /belmont:verify <feature>.
  4. Check whether work remains: run `belmont status --feature <feature>`.
     Do NOT use --format json here — it is ~3x larger and grows with task
     count. Only fall back to /belmont:status <feature> if the CLI is
     unavailable: that skill must load ~6KB of its own instructions before
     it even shells out to the same command, and this step runs once per
     milestone. STOP only when every milestone is verified — the "Next
     Milestone" line reads None AND status prints no done-but-unverified
     warning ("Next Milestone: None" alone is not enough, because [x]
     counts as done) — or when status still reports tasks
     done-but-unverified after a re-verify pass has already run this
     session (some tasks legitimately stay [x] when verification found
     issues). A feature reading "Complete" with unverified tasks is NOT
     finished — status warns about it and names `belmont reverify`.
     Otherwise continue to the next milestone.
  Do not start unrelated work; only progress this one feature.
```

When delegating, you are invoking the `/loop` skill — follow its self-pacing guidance (it uses `ScheduleWakeup` to re-enter the task between milestones, surviving context compaction). Each iteration advances exactly one milestone, so the loop converges as milestones flip to verified.

**If the `/loop` skill is unavailable** in this Claude Code build, fall back to driving the cycle inline: run steps 1–4 yourself in sequence, then repeat from step 1 for the next milestone, using `ScheduleWakeup` to self-pace between milestones. Stop on the same condition (no pending milestones left).

If you are running in Codex, start Goal mode with **`/goal`** and use the same iteration recipe as the goal text. The exact goal text is:

```
/goal Drive the <feature> Belmont feature to completion. Each iteration:
  1. Run belmont:implement <feature> to build the next pending milestone.
  2. Run belmont:verify <feature> on what was just built.
  3. If verify reports follow-up tasks or failures: run belmont:next <feature>
     and repeat belmont:next <feature> until those follow-ups clear, then
     re-run belmont:verify <feature>.
  4. Check whether work remains: run `belmont status --feature <feature>`.
     Do NOT use --format json here — it is ~3x larger and grows with task
     count. Only fall back to belmont:status <feature> if the CLI is
     unavailable: that skill must load ~6KB of its own instructions before
     it even shells out to the same command, and this step runs once per
     milestone. STOP only when every milestone is verified — the "Next
     Milestone" line reads None AND status prints no done-but-unverified
     warning ("Next Milestone: None" alone is not enough, because [x]
     counts as done) — or when status still reports tasks
     done-but-unverified after a re-verify pass has already run this
     session (some tasks legitimately stay [x] when verification found
     issues). A feature reading "Complete" with unverified tasks is NOT
     finished — status warns about it and names `belmont reverify`.
     Otherwise continue to the next milestone.
  Do not start unrelated work; only progress this one feature.
```

If the current Codex surface does not let you invoke `/goal` from inside this skill, stop and ask the user to start the goal manually with the exact goal text above. Do not approximate it with an unmanaged infinite loop.

## Stop conditions

Stop the loop — do not schedule another iteration — when any of these holds:

- The status check in step 4 shows every milestone verified (the success case: feature complete).
- The status check in step 4 still reports done-but-unverified tasks after a re-verify pass has already run this session — report which tasks and stop, rather than churning.
- A milestone is blocked (`[!]` tasks) and cannot proceed after `/belmont:next` attempts; report the blocker and stop for user input.
- `/belmont:verify` keeps failing on the same task across iterations with no new progress (avoid an infinite verify/next churn) — report the stuck task and stop.
- The user steers you to stop, change features, or do other work.

On stop, report: the feature, which milestones completed this run, the final status, any blockers or stuck tasks that need user attention, and — if `belmont status` warned about done-but-unverified tasks — say so explicitly and name `belmont reverify --feature <feature>` as the recovery.

## Scope rules

- **One feature only.** Never let an iteration pull in a different feature or unrelated refactor. The recipe's final line ("Do not start unrelated work") is load-bearing.
- **Do not edit milestone structure.** This skill orchestrates the existing implement/verify/next/status skills — it never adds, renames, or removes milestones. Milestone structure is immutable outside `/belmont:tech-plan`.
- **Respect each underlying skill's rules.** `/belmont:implement`, `/belmont:verify`, and `/belmont:next` enforce their own scope guards, evidence checks, and feature-detection prompts. Do not bypass them; just sequence them.
