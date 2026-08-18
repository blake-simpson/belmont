---
description: Claude Code or Codex only. Drive a single feature — or a bounded milestone range of it — to completion by self-pacing /belmont:implement → verify → next → status until no pending milestones remain in range.
alwaysApply: false
---

# Belmont: Loop

**Claude Code or Codex only.** This skill drives one Belmont feature to completion by repeatedly running the implement → verify → next → status cycle, pausing between iterations so you can watch progress and steer. It is a thin orchestration wrapper around the host tool's long-running interactive primitive:

- Claude Code delegates to the built-in `/loop` skill.
- Codex delegates to Goal mode with `/goal`.

Other AI CLIs do not have an equivalent interactive loop primitive, so Belmont keeps this skill hidden from their default install surface.

If you are neither Claude Code nor Codex, stop and tell the user to run `belmont auto --feature <feature>` from the terminal instead.

This is the interactive, in-session counterpart to the headless `belmont auto` CLI (also aliased `belmont loop`). Use `/belmont:loop` in Claude Code or `$belmont:loop` in Codex when you want to stay in the REPL and have the agent advance the feature milestone-by-milestone without you re-typing each skill. Use `belmont auto` when you want fully headless, parallel, worktree-based execution from the terminal.

**Loop is the steering tool, not the throughput tool.** Auto will always be faster — it runs milestones in parallel worktrees and gives every phase a fresh context. Loop's value is that you are present and can redirect with a sentence. The recipe below therefore optimises for *not wasting your session* — batching follow-up fixes, triaging polish out of the critical path, and scoping re-verification — rather than for raw parallelism. Do not try to recover auto's parallelism here.

<!-- @include milestone-immutability.md -->

## Argument

`$ARGUMENTS` is the feature name or slug to drive, optionally followed by milestone bounds (e.g. `/belmont:loop checkout`, or `/belmont:loop checkout --from M21 --to M22`).

- **`--from M<n>` / `--to M<n>` bound the run to a milestone range**, mirroring single-feature `belmont auto`'s flags. Either may appear alone (`--from M21` means M21 to the end; `--to M5` means the start to M5). Resolve the bounds to `<range>`: `M<a>..M<b>` when given, `all milestones` when not. This is how you drive two dispatchable milestones on a feature whose others are human-executed, and then stop — without bounds, the loop's success condition ("everything verified") is unreachable on such a feature and the loop walks into work no agent can do (issue #58).
- A bound that names no milestone in PROGRESS.md is an error: report it, list the milestone IDs, and stop rather than guessing.

- If `$ARGUMENTS` is empty: list the feature directories under `.belmont/features/`, read each `PRD.md` for its name and status, and ask the user which feature to drive. If exactly one feature exists, you may select it and confirm. If none exist, tell the user to run `/belmont:product-plan` first, then stop.
- If `$ARGUMENTS` names a feature that does not resolve to a `.belmont/features/<slug>/` directory: report the mismatch, list the available feature slugs, and ask the user to clarify rather than guessing.

Resolve the argument to a single feature slug (and `<range>`) before starting the loop. The loop only ever progresses this one feature — and, when bounded, only milestones in `<range>` — never start unrelated work.

## Preflight (run once, before looping)

1. Resolve the feature slug from `$ARGUMENTS` as described above. Call it `<feature>`.
2. Confirm the feature exists and see how many milestones are pending. Prefer `belmont status --feature <feature>` if the CLI is installed — the Go CLI parses PROGRESS.md itself, so this costs one command and no file reads. Fall back to `/belmont:status <feature>` only if the CLI is unavailable. When bounds were given, read the status output through them: every check below is about milestones **in `<range>`**, and out-of-range state — however unfinished — is not this run's business.
3. If every milestone in `<range>` is already **verified**, report that the range is complete (naming what it excluded, if bounded) and **stop** — do not start a loop.
4. If in-range milestones read *done* but not verified (`[x]`, not `[v]`), that is not finished — `belmont status` flags it and names `belmont reverify`. Which route depends on whether there is anything left to build:
   - **No pending milestone in `<range>`, only `[x]` tasks** (everything in range is built but unverified): run `belmont reverify --feature <feature>` — with `--from M<a> --to M<b>` when bounded, so re-verification never touches milestones the bounds excluded — and stop. Do **not** enter the loop. Iteration step 1 is "implement the next pending milestone", and there is no such milestone in range — the loop has nothing to do on its first step, and `reverify` is the command that exists for exactly this state.
   - **Pending in-range milestones as well**: start the loop. Step 2's earlier-milestone rescan picks the in-range `[x]` tasks up as it goes.
5. Otherwise, hand off to the loop driver below.

## Loop driver

If you are running in Claude Code, start Claude Code's built-in **`/loop`** skill in **self-paced mode** (no fixed interval — let the model decide when to schedule the next iteration). Pass it the iteration recipe below, with `<feature>` substituted for the resolved slug and `<range>` for the resolved bounds (`M<a>..M<b>`, or `all milestones` when unbounded). The exact handoff is:

```
<!-- @include loop-recipe.md driver="/loop" call="/belmont:" -->
```

When delegating, you are invoking the `/loop` skill — follow its self-pacing guidance (it uses `ScheduleWakeup` to re-enter the task between milestones, surviving context compaction). Each iteration advances exactly one milestone, so the loop converges as milestones flip to verified.

**If the `/loop` skill is unavailable** in this Claude Code build, fall back to driving the cycle inline: run steps 0–5 yourself in sequence, then repeat from step 0 for the next milestone, using `ScheduleWakeup` to self-pace between milestones. Stop on the same conditions — all of them, including the blocked-queue one.

If you are running in Codex, start Goal mode with **`/goal`** and use the same iteration recipe as the goal text, with `<feature>` and `<range>` substituted the same way. The exact goal text is:

```
<!-- @include loop-recipe.md driver="/goal" call="belmont:" -->
```

If the current Codex surface does not let you invoke `/goal` from inside this skill, stop and ask the user to start the goal manually with the exact goal text above. Do not approximate it with an unmanaged infinite loop.

## Stop conditions

Every stop condition lives **inside** the fenced recipe above, deliberately: the recipe is the only text guaranteed to travel with the delegated `/loop` task and survive compaction. Stop-condition prose that sits only out here can be summarised away mid-run, which is precisely when a stall guard is needed. This section restates them for a reader; the fence is the copy that runs. Do not move any of them out here, and if you add one, add it to the fence.

**Stopping and the verdict are different questions, and step 5 keeps them apart.** Three things bound a *milestone* without ending the *run* — a task left at `[x]`, a fired circuit breaker, and a `[!]` — and all three make the final verdict INCOMPLETE. None of them halts the loop. Ending the whole feature because one milestone hit its bound strands every milestone that had nothing to do with it, which is the failure this skill's blocked-task rule exists to prevent; a stop rule that did it for the breaker instead would just reintroduce it under another name.

The loop stops — no further iteration — when any of these holds. Each is stated in the recipe, and each is scoped to `<range>`:

- Every milestone in `<range>` is verified. Combined with no in-range `[x]`, no breaker and no in-range `[!]`, this is **the only COMPLETE verdict** — and on a bounded run COMPLETE describes the range, not the feature; the report names what the bounds excluded. (A status line reading "(waiting on dependencies)" is not "None": work remains.)
- Every remaining pending task in `<range>` is `[!]` — the decision queue is all that is left, and no agent action can change the file. A single `[!]`, or one whole blocked milestone, is **not** a stop: step 0 selects past it. Step 0 also converts work the spec assigns to a *person* — an interactive run, a sign-off, a console action — into `[!]` before any agent is dispatched at it, which is what makes this stop reachable on a feature with human-executed milestones.
- Nothing in `<range>` qualifies for step 0 because the remaining in-range work waits on milestones that are blocked or outside `<range>`.
- Any of the counted conditions (a) three consecutive phase failures, (b) the same milestone failing verification twice, (c) no state change across two iterations, or (d) the user steers you to stop, change features, or do other work.

On stop, report: the feature, which milestones completed this run, the verdict, and each reason it is INCOMPLETE if it is. Name tasks left at `[x]` and say they need investigation rather than a plain `belmont reverify`. Name milestones the breaker bounded, with `/belmont:debug-manual <feature>` as their next step — its deferrals are open defects, not unrecorded verifications. And if any `[!]` exist, report them with `belmont blockers --feature <feature> --summary`: they are the work the user has to do before the feature can finish, and a count buried in a status dump is not a handover.

## Scope rules

- **One feature only.** Never let an iteration pull in a different feature or unrelated refactor. The recipe's final line ("Do not start unrelated work") is load-bearing.
- **When bounded, in-range only.** A run given `--from`/`--to` never implements, verifies, triages, settles, or re-marks anything outside `<range>` — including step 2's earlier-milestone rescan. The bounds exist because the excluded milestones are deliberately not this run's business.
- **Do not edit milestone structure.** This skill orchestrates the existing implement/verify/next/status skills — it never adds, renames, or removes milestones. The canonical rule and the routing for discovered work are stated above; the triage step in particular must never turn a deferral into a milestone.
- **Respect each underlying skill's rules.** `/belmont:implement`, `/belmont:verify`, and `/belmont:next` enforce their own scope guards, evidence checks, and feature-detection prompts. Do not bypass them; just sequence them.
- **A human-gated `[!]` belongs to the user.** The loop may *write* one — that is what triage's human-gated class does — but it may never clear one, answer it on the user's behalf, or convert it to `[-]` to make a milestone read complete. `mergeProgressState` refuses to rank over `[!]` from either direction; this is the same rule at the skill layer. Two `[!]` writers are **not** human-gated and carry their own reopen condition — the milestone-structure rule's later-milestone dependency, and the reconciliation agent's merge blocker — and the recipe names both. Tell them apart by the reason on the task; that is what the reason is for. `belmont blockers` is how you show the rest.
- **Deferral is a marker, not an edit.** Withdrawn work is `[-]` plus a `## Decisions Log` line. Never express it by deleting the checkbox — see the recipe's step 3 for why that does not survive Belmont's own merge model.
