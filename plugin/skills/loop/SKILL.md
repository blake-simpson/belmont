---
name: loop
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

<!-- Canonical milestone-immutability rule. Included by every skill that can modify PROGRESS.md. Do not paraphrase in skill bodies — @include this partial so the rule stays a single source of truth. -->

## Milestone structure is immutable outside `/belmont:tech-plan`

**You MUST NOT add, remove, rename, re-scope, or re-parent any `### M<N>:` milestone heading in `PROGRESS.md`.** Only `/belmont:tech-plan` may restructure milestones. Every other skill — `implement`, `verify`, `next`, `debug-auto`, `debug-manual`, the triage phase — may only edit tasks **inside** existing milestone headings.

A milestone heading is **level 3** — `### M<N>: Name`, at column zero. Never write it as `## M<N>:`. A level-2 heading at column zero is what *ends* the milestones region: every task line below one belongs to no milestone, is counted by nothing and is never scheduled. So `## M30:` would both fail to create a milestone and silently orphan everything after it.

This rule supersedes any contradictory guidance you encounter elsewhere. If another instruction seems to permit creating a milestone (for follow-ups, polish, cleanup, verification fixes, etc.), prefer this rule.

### Where follow-ups go

- **Issue discovered while implementing or verifying milestone `M<N>`** → new `[ ]` task inside `M<N>`, under the same `### M<N>:` heading. Do not route it to an earlier or later milestone "because it fits there better"; the milestone that discovered it owns it.
- **Issue blocked by work that will land in a later milestone `M<N+k>`** → new `[!]` task inside `M<N>`, with a one-line reason that names `M<N+k>`. Auto surfaces `[!]` tasks as blockers; the task can be reopened as `[ ]` once the blocker lifts.
- **Issue found by a cross-cutting sweep, belonging to no single milestone** → new `[ ]` task inside the **highest-numbered existing milestone whose work it touches**. If it is genuinely global — it touches everything, or nothing in particular — that is the **last milestone in the plan**. Still never a new milestone, and never left outside every milestone: a task below the last `### M<N>:` heading is counted by nothing and never scheduled, which is not "deferred", it is lost. Pick the milestone by what the fix *depends on*, not by where the problem started: filing it under the earliest milestone it touches re-opens work the later ones already built on, which is exactly the dependency-graph lie described below.

  **This bullet applies only to `/belmont:tech-plan`, `/belmont:repair` and `/belmont:debug-manual`** — the skills that run outside the auto loop. If you are in an `implement` / `verify` / `next` / `debug-auto` phase, you may only write inside the milestone your phase targets: `runScopeGuard` reverts a task added to any other milestone and your follow-up text is lost with it. There, the first bullet governs — the milestone you are in owns the finding — and if it genuinely belongs elsewhere, say so in your report and let the user run `/belmont:tech-plan`.
- **Cosmetic / nice-to-have item the user may never want** → append to `NOTES.md` under a `## Polish` section, creating the file if needed. These are context, not tasks.
- **Never a new milestone.** Not "M<last+1>: Polish", not "M<N>-FIX", not "MX: Deviations from M<N>", not "MY: Verification Fixes". Even if the existing `PROGRESS.md` already contains such a milestone from a prior run, that pattern is WRONG — do not add tasks to it and do not create siblings of it.

### Why this rule is non-negotiable

A polish/follow-up milestone looks tidy on paper but quietly breaks two invariants of the auto loop:

1. **Dependency graph lies.** A milestone labelled "polish M<N>" typically declares `(depends: M<N>)`. That makes it a sibling of every other `M<N+i>` that depends on `M<N>`. But its *real* dependency is that every later milestone's outputs are frozen — because the polish milestone edits the very files those later milestones imported from `M<N>`. Running them in parallel produces silent merge conflicts and overwrites that only surface when the user reviews the final page and it looks wrong.
2. **Auto loop grows without bound.** Every verify pass can discover follow-ups. If those follow-ups become a new milestone instead of new tasks in the current one, a 5-milestone feature can turn into 9 milestones mid-run, each re-triggering its own verify-fix-reverify cycle, compounding scope drift with every iteration.

Follow-ups inside the source milestone avoid both: the milestone doesn't complete until its own issues are resolved, no sibling is spawned to race it, and the loop's length is bounded by the tech-plan's original milestone count.

### If you find a pre-existing bad milestone

If `PROGRESS.md` already contains a milestone whose name or description matches the forbidden patterns (polish, follow-ups, cleanup, verification fixes, deviations from M<N>, etc.), do the following:

- Do NOT add new tasks to it.
- Do NOT create new milestones that depend on it or reference its tasks.
- Surface the issue in your summary/report to the user, suggesting `belmont validate` and `/belmont:tech-plan` to restructure.

Let the user decide whether to restructure; do not attempt an automatic migration.

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
<!-- The iteration recipe, shared by both drivers.
     Claude Code runs it under /loop, Codex under /goal. It lived twice in
     loop.md until the two copies drifted: #35 added the Codex block, and the
     next change to the recipe landed in the Claude one only, so Codex users
     would have kept the old loop. Nothing kept them in step, so nothing did.
     /loop = the driver command, /belmont: = how that tool names a skill
     (`/belmont:` for Claude, `belmont:` for Codex). <feature> and <range> are
     substituted by the invoking skill at handoff time, not at build time:
     <range> is "M<a>..M<b>" when the user bounded the run, else
     "all milestones". -->
/loop Drive the <feature> Belmont feature to completion within <range>.
  Work ONLY milestones in <range>; treat every other milestone's state as
  read-only context, whatever its markers say. Each iteration:
  0. PICK THE TARGET MILESTONE <M> from <range>, and do not assume the
     status check picked it for you. `belmont status` names the first
     milestone that is not fully verified and whose (depends: …) is met —
     it knows nothing about <range> — and /belmont:implement independently
     selects a milestone of its own. A [!] task satisfies both forever, so
     a milestone whose ONLY live work is [!] is named again on every
     iteration and neither tool will ever move on.
     So: confirm the named milestone is in <range> and has at least one
     [ ], [>] or [x] task. If not, walk down PROGRESS.md's milestone
     headings within <range> to the first one that does. SKIP a milestone
     whose heading's (depends: …) names any milestone that is not yet
     all-done — all-done means every live task in it reads [x], [v] or
     [-]; a name matching no milestone does not block. Its dependencies
     come first, and if they are in <range> this walk reaches them. If NO
     milestone in <range> qualifies, stop and report per the blocked-task
     rule below: either every remaining pending task in <range> is [!],
     or what remains waits on milestones that cannot proceed here —
     blocked, or outside <range>. Name which.
     WHO EXECUTES <M>? Before dispatching at it, read its tasks. If the
     spec's own text says the work is done by a person — an interactive
     fixture run, a sign-off, a console or credential action, a demo the
     user drives — do NOT send an implementation agent at it: that is
     triage's human-gated class, known before any agent has tried, and an
     agent pointed at it can only fail or fabricate. Mark each such task
     [!] in place with a reason naming what the person must do, add one
     `## Decisions Log` line per task, and re-run this step. Writing a
     [!] is allowed; clearing one is the user's. This is what makes the
     all-[!] stop reachable on a feature whose tail is human-executed.
     Name <M> explicitly in every append below; never let a sub-skill
     re-derive it.
     THIS IS ALSO HOW A BACKLOG DRAINS. Selecting the FIRST in-range
     milestone with workable tasks means the oldest unsettled work is
     always next, so a
     PROGRESS.md that already carries a large accumulated follow-up backlog
     — from before the settle rule below existed — is worked milestone by
     milestone, oldest first, and each is settled before anything newer is
     started. Do not skip ahead to the newest milestone because it looks
     like the real work; the backlog IS the real work until it is settled.
  1. Run /belmont:implement <feature> to build milestone <M>.
     Append: "IMPLEMENT MILESTONE <M>. This names the milestone
     explicitly and supersedes your own Step 1 selection — do not
     re-derive it. MILESTONE-SCOPED IMPLEMENTATION: only implement tasks in
     milestone <M>. Do NOT flip checkboxes, add/remove tasks, or edit notes
     for any other milestone — treat their state as read-only context."
  2. ALWAYS run /belmont:verify <feature> — there is no skip. Only verify
     writes [v], so a skipped milestone can never reach a verified state,
     and every milestone must. Append:
     "MILESTONE-SCOPED VERIFICATION: verify milestone <M>. Do NOT change
     the task state of any other milestone — they may be intentionally
     incomplete. ONE EXCEPTION, and it is an instruction to INCLUDE, not
     merely to record: if your Step 1 scan surfaces [x] tasks in an EARLIER
     milestone IN <range>, add them to this pass — dispatch them to the
     verification
     alongside <M>'s tasks, and record the resulting
     [x]->[v] flips for those that pass. That rescan is the documented
     recovery for a verification whose flips were never written; this
     scoping rule must not suppress it. An out-of-range [x] is NOT yours
     to verify — on a bounded run the range exists precisely because the
     other milestones are not this loop's business. Never flip a task this pass did not
     actually verify."
  3. If verify reported follow-up (FWLUP) tasks, TRIAGE before fixing.
     Read the actual follow-up descriptions in PROGRESS.md — do not just
     count them. Classify each into exactly one of THREE classes:
       - Human-gated — no agent can close it, at any effort, in any number
         of rounds. It needs an approval ("the apply needs sign-off"), a
         product or architecture ruling ("decide whether…", "rule on…"), a
         credential or console action nobody automated has ("rotate the
         passwords", "populate the roster", "wire it once the App exists"),
         or a spec change that belongs to /belmont:tech-plan. The test is
         not difficulty — it is whether the missing thing is a PERSON.
       - Blocking — build/test failures, runtime errors, security issues,
         acceptance criteria not met, significant visual mismatch from the
         design, missing PRD-specified behaviour, missing i18n keys for
         primary user-facing text.
       - Deferrable — missing aria-labels, Lighthouse warnings, code style,
         docs, console.log cleanup, 1-2px spacing, import ordering, naming,
         perf micro-optimisations, tests for non-critical paths.
     Check human-gated FIRST — it outranks the other two, and a security or
     acceptance-criteria item that needs a person is human-gated, NOT
     blocking. Then, between the remaining two, err toward blocking when
     genuinely unsure; UI/visual fidelity issues are usually blocking.
     Then act:
       - Human-gated → mark the task `[!]` in place, leave its body where it
         is, and add one line to `## Decisions Log` naming what is being
         asked and of whom. NEVER fix it, NEVER defer it, NEVER withdraw it,
         NEVER let the circuit breaker sweep it. It is a question, and the
         only thing that clears it is an answer. Do not count it toward the
         fix rounds in step 4 — an attempt that cannot succeed is not a
         round. Exclude it from every "pending FWLUP" set below.
       - All remaining are deferrable → mark each `[-]` withdrawn in
         PROGRESS.md, add one line per item to `## Decisions Log` saying it
         was deferred as polish, move the detail to NOTES.md under
         `## Polish`, remove its PRD section, commit as "belmont: triage —
         deferred N polish items to NOTES.md", and go to step 5. Do NOT fix
         them, do NOT re-verify.
       - Any blocking → defer only the deferrable ones as above, leave the
         blocking ones pending, and go to step 4.
     DEFERRAL IS `[-]`, NOT A DELETION. Do not delete the checkbox line.
     `mergeProgressState` takes the worktree as base and carries master's
     missing lines back in, so a deleted task is resurrected by the next
     sync in either direction — and a line that is simply gone records no
     reason and shows up in no count. `[-]` is excluded from both counts,
     never offered as next work, does not stop a milestone reading complete,
     and wins from either side of a merge. That is what it is for.
     CIRCUIT BREAKER: if two fix rounds have already run for this milestone
     IN THIS LOOP SESSION, stop fixing and SETTLE the milestone (below).
     The count is per milestone PER SESSION and starts at zero each run. A
     session beginning after the user has answered decisions or reopened
     work carries a fresh mandate, and inheriting the previous run's count
     would defer the very work they just asked for. This session's count
     lives in {base}/NOTES.md under `## Loop decisions`; the milestone's
     whole history is MILESTONE-<M>.done.md, one `# Milestone:` heading per
     pass, which is the durable record and survives compaction better than
     the ledger does.
     SETTLE THE MILESTONE BEFORE LEAVING IT. A milestone is left only when
     EVERY task in it reads `[v]`, `[-]` or `[!]`. Never move on with a
     `[ ]`, `[>]` or `[x]` still in it, whether the breaker fired or the
     work simply ran out. **This is the rule that stops follow-ups
     accumulating.** Without it each milestone leaks its unfinished tail
     into a backlog that grows for the life of the feature: on the run that
     motivated this skill, 92 of 165 task lines were verification-generated
     follow-ups, most of them `[ ]` sitting in milestones the loop had long
     since left. Settle in ONE batch, not one at a time:
       - `[ ]` still classified blocking → `[-]`, with a `## Decisions Log`
         line saying it was bounded, NOT that it was polish.
       - `[x]` that the milestone's final verify would not promote → `[!]`,
         naming what verification objected to. An agent tried and could not
         clear it inside its rounds, so it is a question for the user rather
         than a silent leftover that reads as done.
       - human-gated → already `[!]`; leave it exactly as it is.
     Settling is safe precisely because `[-]` and `[!]` are both reversible
     by the user, and each is parked somewhere they will find it — but they
     are NOT the same somewhere. A `[!]` is listed by `belmont blockers`. A
     `[-]` is NOT: that command is the queue of open questions, and it
     excludes withdrawn work on purpose. A `[-]` is recorded in
     `## Decisions Log`, keeps its body on the task line in PROGRESS.md, and
     is named again by the final verdict in step 5. Never point the user at
     `belmont blockers` to find a deferral — they will see only the `[!]`s
     and reasonably conclude nothing else was parked. Leaving a `[ ]` behind
     is the unsafe option — it looks like scheduled work and is nobody's
     decision.
     Deferral NEVER means creating a milestone — see the milestone-structure
     rule above.
  4. Fix the blocking follow-ups in ONE batch, not one at a time.
     Run /belmont:next <feature> and append: "BATCH MODE: implement ALL
     pending FWLUP tasks in <M> sequentially — the milestone's ENTIRE
     outstanding set, including follow-ups filed in earlier passes or
     earlier sessions, not only the ones this verify produced. Pending
     means `[ ]` — SKIP every `[!]`, which is waiting on a person and
     cannot be closed by working harder. For each: find it, create the MILESTONE file, dispatch
     to the implementation agent, process results, archive MILESTONE, then
     continue to the next pending FWLUP. Stop when no `[ ]` FWLUP tasks
     remain in <M>. Only work on FWLUP tasks belonging to <M>;
     if there are none, stop immediately and report 'No FWLUP tasks to fix.'
     ARCHIVE: Step 5 appends to MILESTONE-<M>.done.md rather than
     overwriting it, which is what keeps every task's log in a batch.
     Follow it as written."
     Do NOT invoke /belmont:next once per task — each invocation reloads the
     whole skill, and that cost is why this loop runs out of session.
     Then re-verify FOCUSED: run /belmont:verify <feature> and append
     "FOCUSED RE-VERIFICATION: only verify (1) the FWLUP tasks just fixed,
     (2) build and tests pass, (3) any previously-failing acceptance
     criteria. Do NOT re-run Lighthouse. Do NOT re-check visual specs unless
     a FWLUP addressed UI. Do NOT create new Polish-level issues."
     Return to step 3 to triage whatever that re-verify surfaced.
  5. Decide whether to continue, then record what the verdict will need.
     Run `belmont status --feature <feature>`. Do NOT use --format json — it
     is ~3x larger and grows with task count. Only fall back to
     /belmont:status <feature> if the CLI is unavailable: that skill loads
     ~6KB of its own instructions before shelling out to the same command,
     and this step runs once per milestone.
     CONTINUE to the next milestone — once the current one is SETTLED per
     step 3, every task in it `[v]`, `[-]` or `[!]` — unless a STOP
     condition below fires.
     Neither a task still at [x] nor a fired circuit breaker is a stop.
     Both BOUND A MILESTONE, not the run. Halting the whole feature because
     one milestone hit its bound strands every milestone that had nothing
     to do with it — which is exactly the mistake the blocked-task rule
     below exists to prevent, and the two rules must not contradict each
     other. They are verdict inputs, not stop triggers.
     STOP when any of these holds:
       - every milestone in <range> is verified — each one's tasks all
         read [v] (withdrawn [-] aside) in the status output. When <range>
         is all milestones this is the "Next Milestone" line reading None
         AND no done-but-unverified warning ("Next Milestone: None" alone
         is not enough, because [x] counts as done; and a line reading
         "(waiting on dependencies)" is NOT None — work remains). On a
         bounded run do NOT use the None line: status reports the whole
         feature, so out-of-range milestones keep it non-None forever, and
         its done-but-unverified warning may name only out-of-range tasks
         — check the in-range milestones' own task states instead;
       - every remaining pending task in <range> is [!] (see the
         blocked-task rule below);
       - nothing in <range> qualifies for step 0 because the remaining
         in-range work waits on milestones that are blocked or outside
         <range> — report which, per step 0;
       - a COUNTED STOP CONDITION (a-d) fires.
     RECORD each iteration, for the final report: any task left at [x], and
     whether the step-3 circuit breaker fired for that milestone. Both go in
     {base}/NOTES.md under `## Loop decisions` — you will have compacted by
     the time you need them.
     THE VERDICT, when you stop. Report COMPLETE only if every milestone
     in <range> is verified, no in-range task is at [x], the circuit
     breaker never fired, and no in-range [!] remains. On a bounded run,
     also name what the range deliberately left out, so COMPLETE cannot be
     read as "the feature is finished". Otherwise report INCOMPLETE and
     say which of these holds:
       - Tasks still at [x]. THERE IS NO SUCCESSFUL RUN THAT LEAVES ONE:
         step 2 has no skip, so a task stays [x] only because verification
         found issues, errored, or never recorded its flips — all failures.
         Name them and say they need investigation, not just a
         `belmont reverify` re-run. (A feature reading "Complete" with
         unverified tasks is NOT finished; status warns and names reverify.)
       - Milestones the circuit breaker bounded. It defers everything still
         classified blocking, so its deferrals may include real defects.
         Name them — they are [-] in PROGRESS.md with their bodies intact,
         listed in `## Decisions Log` as bounded. Do NOT send the user to
         NOTES.md `## Polish` for these, and do NOT send them to
         `belmont blockers`: only step 3's polish deferrals move their
         detail to NOTES.md, and neither command nor heading carries
         bounded work. Bounded work is not polish — that distinction is
         the whole point of the settle rule's wording. Then name
         /belmont:debug-manual <feature> as the next step, NOT
         `belmont reverify`: these are open defects, not unrecorded
         verifications.
       - [!] tasks outstanding — report them per the blocked-task rule.
  BLOCKED TASKS DO NOT STOP THE LOOP. A `[!]` is a question queued for a
  person; it is not a failure, not a stall, and not a reason to abandon
  work that has nothing to do with it. A milestone holding one can never
  read complete, so DO NOT wait on it — step 0 already routed you past it.
  Never flip a HUMAN-GATED `[!]` to any other marker to unblock yourself,
  and never guess the answer. Two `[!]` tasks are NOT human-gated and may
  be reopened as `[ ]`, because their reason names the condition and you
  can check it: one whose reason names a later milestone `M<N+k>` (the
  milestone-structure rule above mints these), once `M<N+k>` reads
  verified; and one the reconciliation agent raised over a merge, once the
  other side is `[x]`/`[v]`. If the reason names a PERSON, it is not one
  of these — leave it. If the reason names nothing checkable, leave it and
  say so in the report. Stop for
  the user ONLY when every remaining pending task in <range> is `[!]`:
  at that point there is nothing an agent can do here, and continuing just
  re-reads the same file. When you stop for that reason, or for any other,
  report the queue with `belmont blockers --feature <feature> --summary`
  (drop --summary when the user needs the full question) and say plainly
  that the feature cannot finish until those are answered. A feature
  holding a `[!]` is INCOMPLETE, never complete — same as a remaining `[x]`
  or a bounded milestone, and for the same reason: the work is not settled.
  Like those two, it is a verdict input, not a reason to halt early.
  COUNTED STOP CONDITIONS — track these across iterations; when one fires,
  stop and report rather than scheduling another iteration:
    a. Three consecutive phase failures (any mix of implement/verify/next).
    b. The same milestone FAILS VERIFICATION twice. "Fails verification"
       means the verify phase errored, OR reported any issue you classified
       as BLOCKING in step 3 that survived a fix round — use step 3's
       blocking list, not verify's Critical/Warning tiers, which do not line
       up with it. It does NOT mean merely producing follow-ups, which is
       the normal path into step 3. This rule outranks the step-3 circuit
       breaker: if both would fire, stop rather than defer-and-proceed, and
       name /belmont:debug-manual <feature> as the next step.
    c. No state change across two iterations — identical task counts from
       `belmont status` twice running. Note that a run whose only remaining
       work is `[!]` trips this on its own; the blocked-task rule above is
       what makes the report say WHY, so report the blocker queue rather
       than "no progress".
    d. The user steers you to stop, change features, or do other work.
       Stop immediately — this outranks every other rule here.
  These counters must live ON DISK, not in your head — this loop survives
  compaction and a remembered count does not. Nothing else records them, so
  after every failed phase and every blocking-issue-survived-a-fix-round,
  append one line to {base}/NOTES.md under `## Loop decisions`:
  "<iso date> <phase> failed for <M> — <one-line reason>". Count from that
  file. (c) alone is derivable without it, from `belmont status` task counts.
  Do not start unrelated work; only progress this one feature.
```

When delegating, you are invoking the `/loop` skill — follow its self-pacing guidance (it uses `ScheduleWakeup` to re-enter the task between milestones, surviving context compaction). Each iteration advances exactly one milestone, so the loop converges as milestones flip to verified.

**If the `/loop` skill is unavailable** in this Claude Code build, fall back to driving the cycle inline: run steps 0–5 yourself in sequence, then repeat from step 0 for the next milestone, using `ScheduleWakeup` to self-pace between milestones. Stop on the same conditions — all of them, including the blocked-queue one.

If you are running in Codex, start Goal mode with **`/goal`** and use the same iteration recipe as the goal text, with `<feature>` and `<range>` substituted the same way. The exact goal text is:

```
<!-- The iteration recipe, shared by both drivers.
     Claude Code runs it under /loop, Codex under /goal. It lived twice in
     loop.md until the two copies drifted: #35 added the Codex block, and the
     next change to the recipe landed in the Claude one only, so Codex users
     would have kept the old loop. Nothing kept them in step, so nothing did.
     /goal = the driver command, belmont: = how that tool names a skill
     (`/belmont:` for Claude, `belmont:` for Codex). <feature> and <range> are
     substituted by the invoking skill at handoff time, not at build time:
     <range> is "M<a>..M<b>" when the user bounded the run, else
     "all milestones". -->
/goal Drive the <feature> Belmont feature to completion within <range>.
  Work ONLY milestones in <range>; treat every other milestone's state as
  read-only context, whatever its markers say. Each iteration:
  0. PICK THE TARGET MILESTONE <M> from <range>, and do not assume the
     status check picked it for you. `belmont status` names the first
     milestone that is not fully verified and whose (depends: …) is met —
     it knows nothing about <range> — and belmont:implement independently
     selects a milestone of its own. A [!] task satisfies both forever, so
     a milestone whose ONLY live work is [!] is named again on every
     iteration and neither tool will ever move on.
     So: confirm the named milestone is in <range> and has at least one
     [ ], [>] or [x] task. If not, walk down PROGRESS.md's milestone
     headings within <range> to the first one that does. SKIP a milestone
     whose heading's (depends: …) names any milestone that is not yet
     all-done — all-done means every live task in it reads [x], [v] or
     [-]; a name matching no milestone does not block. Its dependencies
     come first, and if they are in <range> this walk reaches them. If NO
     milestone in <range> qualifies, stop and report per the blocked-task
     rule below: either every remaining pending task in <range> is [!],
     or what remains waits on milestones that cannot proceed here —
     blocked, or outside <range>. Name which.
     WHO EXECUTES <M>? Before dispatching at it, read its tasks. If the
     spec's own text says the work is done by a person — an interactive
     fixture run, a sign-off, a console or credential action, a demo the
     user drives — do NOT send an implementation agent at it: that is
     triage's human-gated class, known before any agent has tried, and an
     agent pointed at it can only fail or fabricate. Mark each such task
     [!] in place with a reason naming what the person must do, add one
     `## Decisions Log` line per task, and re-run this step. Writing a
     [!] is allowed; clearing one is the user's. This is what makes the
     all-[!] stop reachable on a feature whose tail is human-executed.
     Name <M> explicitly in every append below; never let a sub-skill
     re-derive it.
     THIS IS ALSO HOW A BACKLOG DRAINS. Selecting the FIRST in-range
     milestone with workable tasks means the oldest unsettled work is
     always next, so a
     PROGRESS.md that already carries a large accumulated follow-up backlog
     — from before the settle rule below existed — is worked milestone by
     milestone, oldest first, and each is settled before anything newer is
     started. Do not skip ahead to the newest milestone because it looks
     like the real work; the backlog IS the real work until it is settled.
  1. Run belmont:implement <feature> to build milestone <M>.
     Append: "IMPLEMENT MILESTONE <M>. This names the milestone
     explicitly and supersedes your own Step 1 selection — do not
     re-derive it. MILESTONE-SCOPED IMPLEMENTATION: only implement tasks in
     milestone <M>. Do NOT flip checkboxes, add/remove tasks, or edit notes
     for any other milestone — treat their state as read-only context."
  2. ALWAYS run belmont:verify <feature> — there is no skip. Only verify
     writes [v], so a skipped milestone can never reach a verified state,
     and every milestone must. Append:
     "MILESTONE-SCOPED VERIFICATION: verify milestone <M>. Do NOT change
     the task state of any other milestone — they may be intentionally
     incomplete. ONE EXCEPTION, and it is an instruction to INCLUDE, not
     merely to record: if your Step 1 scan surfaces [x] tasks in an EARLIER
     milestone IN <range>, add them to this pass — dispatch them to the
     verification
     alongside <M>'s tasks, and record the resulting
     [x]->[v] flips for those that pass. That rescan is the documented
     recovery for a verification whose flips were never written; this
     scoping rule must not suppress it. An out-of-range [x] is NOT yours
     to verify — on a bounded run the range exists precisely because the
     other milestones are not this loop's business. Never flip a task this pass did not
     actually verify."
  3. If verify reported follow-up (FWLUP) tasks, TRIAGE before fixing.
     Read the actual follow-up descriptions in PROGRESS.md — do not just
     count them. Classify each into exactly one of THREE classes:
       - Human-gated — no agent can close it, at any effort, in any number
         of rounds. It needs an approval ("the apply needs sign-off"), a
         product or architecture ruling ("decide whether…", "rule on…"), a
         credential or console action nobody automated has ("rotate the
         passwords", "populate the roster", "wire it once the App exists"),
         or a spec change that belongs to belmont:tech-plan. The test is
         not difficulty — it is whether the missing thing is a PERSON.
       - Blocking — build/test failures, runtime errors, security issues,
         acceptance criteria not met, significant visual mismatch from the
         design, missing PRD-specified behaviour, missing i18n keys for
         primary user-facing text.
       - Deferrable — missing aria-labels, Lighthouse warnings, code style,
         docs, console.log cleanup, 1-2px spacing, import ordering, naming,
         perf micro-optimisations, tests for non-critical paths.
     Check human-gated FIRST — it outranks the other two, and a security or
     acceptance-criteria item that needs a person is human-gated, NOT
     blocking. Then, between the remaining two, err toward blocking when
     genuinely unsure; UI/visual fidelity issues are usually blocking.
     Then act:
       - Human-gated → mark the task `[!]` in place, leave its body where it
         is, and add one line to `## Decisions Log` naming what is being
         asked and of whom. NEVER fix it, NEVER defer it, NEVER withdraw it,
         NEVER let the circuit breaker sweep it. It is a question, and the
         only thing that clears it is an answer. Do not count it toward the
         fix rounds in step 4 — an attempt that cannot succeed is not a
         round. Exclude it from every "pending FWLUP" set below.
       - All remaining are deferrable → mark each `[-]` withdrawn in
         PROGRESS.md, add one line per item to `## Decisions Log` saying it
         was deferred as polish, move the detail to NOTES.md under
         `## Polish`, remove its PRD section, commit as "belmont: triage —
         deferred N polish items to NOTES.md", and go to step 5. Do NOT fix
         them, do NOT re-verify.
       - Any blocking → defer only the deferrable ones as above, leave the
         blocking ones pending, and go to step 4.
     DEFERRAL IS `[-]`, NOT A DELETION. Do not delete the checkbox line.
     `mergeProgressState` takes the worktree as base and carries master's
     missing lines back in, so a deleted task is resurrected by the next
     sync in either direction — and a line that is simply gone records no
     reason and shows up in no count. `[-]` is excluded from both counts,
     never offered as next work, does not stop a milestone reading complete,
     and wins from either side of a merge. That is what it is for.
     CIRCUIT BREAKER: if two fix rounds have already run for this milestone
     IN THIS LOOP SESSION, stop fixing and SETTLE the milestone (below).
     The count is per milestone PER SESSION and starts at zero each run. A
     session beginning after the user has answered decisions or reopened
     work carries a fresh mandate, and inheriting the previous run's count
     would defer the very work they just asked for. This session's count
     lives in {base}/NOTES.md under `## Loop decisions`; the milestone's
     whole history is MILESTONE-<M>.done.md, one `# Milestone:` heading per
     pass, which is the durable record and survives compaction better than
     the ledger does.
     SETTLE THE MILESTONE BEFORE LEAVING IT. A milestone is left only when
     EVERY task in it reads `[v]`, `[-]` or `[!]`. Never move on with a
     `[ ]`, `[>]` or `[x]` still in it, whether the breaker fired or the
     work simply ran out. **This is the rule that stops follow-ups
     accumulating.** Without it each milestone leaks its unfinished tail
     into a backlog that grows for the life of the feature: on the run that
     motivated this skill, 92 of 165 task lines were verification-generated
     follow-ups, most of them `[ ]` sitting in milestones the loop had long
     since left. Settle in ONE batch, not one at a time:
       - `[ ]` still classified blocking → `[-]`, with a `## Decisions Log`
         line saying it was bounded, NOT that it was polish.
       - `[x]` that the milestone's final verify would not promote → `[!]`,
         naming what verification objected to. An agent tried and could not
         clear it inside its rounds, so it is a question for the user rather
         than a silent leftover that reads as done.
       - human-gated → already `[!]`; leave it exactly as it is.
     Settling is safe precisely because `[-]` and `[!]` are both reversible
     by the user, and each is parked somewhere they will find it — but they
     are NOT the same somewhere. A `[!]` is listed by `belmont blockers`. A
     `[-]` is NOT: that command is the queue of open questions, and it
     excludes withdrawn work on purpose. A `[-]` is recorded in
     `## Decisions Log`, keeps its body on the task line in PROGRESS.md, and
     is named again by the final verdict in step 5. Never point the user at
     `belmont blockers` to find a deferral — they will see only the `[!]`s
     and reasonably conclude nothing else was parked. Leaving a `[ ]` behind
     is the unsafe option — it looks like scheduled work and is nobody's
     decision.
     Deferral NEVER means creating a milestone — see the milestone-structure
     rule above.
  4. Fix the blocking follow-ups in ONE batch, not one at a time.
     Run belmont:next <feature> and append: "BATCH MODE: implement ALL
     pending FWLUP tasks in <M> sequentially — the milestone's ENTIRE
     outstanding set, including follow-ups filed in earlier passes or
     earlier sessions, not only the ones this verify produced. Pending
     means `[ ]` — SKIP every `[!]`, which is waiting on a person and
     cannot be closed by working harder. For each: find it, create the MILESTONE file, dispatch
     to the implementation agent, process results, archive MILESTONE, then
     continue to the next pending FWLUP. Stop when no `[ ]` FWLUP tasks
     remain in <M>. Only work on FWLUP tasks belonging to <M>;
     if there are none, stop immediately and report 'No FWLUP tasks to fix.'
     ARCHIVE: Step 5 appends to MILESTONE-<M>.done.md rather than
     overwriting it, which is what keeps every task's log in a batch.
     Follow it as written."
     Do NOT invoke belmont:next once per task — each invocation reloads the
     whole skill, and that cost is why this loop runs out of session.
     Then re-verify FOCUSED: run belmont:verify <feature> and append
     "FOCUSED RE-VERIFICATION: only verify (1) the FWLUP tasks just fixed,
     (2) build and tests pass, (3) any previously-failing acceptance
     criteria. Do NOT re-run Lighthouse. Do NOT re-check visual specs unless
     a FWLUP addressed UI. Do NOT create new Polish-level issues."
     Return to step 3 to triage whatever that re-verify surfaced.
  5. Decide whether to continue, then record what the verdict will need.
     Run `belmont status --feature <feature>`. Do NOT use --format json — it
     is ~3x larger and grows with task count. Only fall back to
     belmont:status <feature> if the CLI is unavailable: that skill loads
     ~6KB of its own instructions before shelling out to the same command,
     and this step runs once per milestone.
     CONTINUE to the next milestone — once the current one is SETTLED per
     step 3, every task in it `[v]`, `[-]` or `[!]` — unless a STOP
     condition below fires.
     Neither a task still at [x] nor a fired circuit breaker is a stop.
     Both BOUND A MILESTONE, not the run. Halting the whole feature because
     one milestone hit its bound strands every milestone that had nothing
     to do with it — which is exactly the mistake the blocked-task rule
     below exists to prevent, and the two rules must not contradict each
     other. They are verdict inputs, not stop triggers.
     STOP when any of these holds:
       - every milestone in <range> is verified — each one's tasks all
         read [v] (withdrawn [-] aside) in the status output. When <range>
         is all milestones this is the "Next Milestone" line reading None
         AND no done-but-unverified warning ("Next Milestone: None" alone
         is not enough, because [x] counts as done; and a line reading
         "(waiting on dependencies)" is NOT None — work remains). On a
         bounded run do NOT use the None line: status reports the whole
         feature, so out-of-range milestones keep it non-None forever, and
         its done-but-unverified warning may name only out-of-range tasks
         — check the in-range milestones' own task states instead;
       - every remaining pending task in <range> is [!] (see the
         blocked-task rule below);
       - nothing in <range> qualifies for step 0 because the remaining
         in-range work waits on milestones that are blocked or outside
         <range> — report which, per step 0;
       - a COUNTED STOP CONDITION (a-d) fires.
     RECORD each iteration, for the final report: any task left at [x], and
     whether the step-3 circuit breaker fired for that milestone. Both go in
     {base}/NOTES.md under `## Loop decisions` — you will have compacted by
     the time you need them.
     THE VERDICT, when you stop. Report COMPLETE only if every milestone
     in <range> is verified, no in-range task is at [x], the circuit
     breaker never fired, and no in-range [!] remains. On a bounded run,
     also name what the range deliberately left out, so COMPLETE cannot be
     read as "the feature is finished". Otherwise report INCOMPLETE and
     say which of these holds:
       - Tasks still at [x]. THERE IS NO SUCCESSFUL RUN THAT LEAVES ONE:
         step 2 has no skip, so a task stays [x] only because verification
         found issues, errored, or never recorded its flips — all failures.
         Name them and say they need investigation, not just a
         `belmont reverify` re-run. (A feature reading "Complete" with
         unverified tasks is NOT finished; status warns and names reverify.)
       - Milestones the circuit breaker bounded. It defers everything still
         classified blocking, so its deferrals may include real defects.
         Name them — they are [-] in PROGRESS.md with their bodies intact,
         listed in `## Decisions Log` as bounded. Do NOT send the user to
         NOTES.md `## Polish` for these, and do NOT send them to
         `belmont blockers`: only step 3's polish deferrals move their
         detail to NOTES.md, and neither command nor heading carries
         bounded work. Bounded work is not polish — that distinction is
         the whole point of the settle rule's wording. Then name
         belmont:debug-manual <feature> as the next step, NOT
         `belmont reverify`: these are open defects, not unrecorded
         verifications.
       - [!] tasks outstanding — report them per the blocked-task rule.
  BLOCKED TASKS DO NOT STOP THE LOOP. A `[!]` is a question queued for a
  person; it is not a failure, not a stall, and not a reason to abandon
  work that has nothing to do with it. A milestone holding one can never
  read complete, so DO NOT wait on it — step 0 already routed you past it.
  Never flip a HUMAN-GATED `[!]` to any other marker to unblock yourself,
  and never guess the answer. Two `[!]` tasks are NOT human-gated and may
  be reopened as `[ ]`, because their reason names the condition and you
  can check it: one whose reason names a later milestone `M<N+k>` (the
  milestone-structure rule above mints these), once `M<N+k>` reads
  verified; and one the reconciliation agent raised over a merge, once the
  other side is `[x]`/`[v]`. If the reason names a PERSON, it is not one
  of these — leave it. If the reason names nothing checkable, leave it and
  say so in the report. Stop for
  the user ONLY when every remaining pending task in <range> is `[!]`:
  at that point there is nothing an agent can do here, and continuing just
  re-reads the same file. When you stop for that reason, or for any other,
  report the queue with `belmont blockers --feature <feature> --summary`
  (drop --summary when the user needs the full question) and say plainly
  that the feature cannot finish until those are answered. A feature
  holding a `[!]` is INCOMPLETE, never complete — same as a remaining `[x]`
  or a bounded milestone, and for the same reason: the work is not settled.
  Like those two, it is a verdict input, not a reason to halt early.
  COUNTED STOP CONDITIONS — track these across iterations; when one fires,
  stop and report rather than scheduling another iteration:
    a. Three consecutive phase failures (any mix of implement/verify/next).
    b. The same milestone FAILS VERIFICATION twice. "Fails verification"
       means the verify phase errored, OR reported any issue you classified
       as BLOCKING in step 3 that survived a fix round — use step 3's
       blocking list, not verify's Critical/Warning tiers, which do not line
       up with it. It does NOT mean merely producing follow-ups, which is
       the normal path into step 3. This rule outranks the step-3 circuit
       breaker: if both would fire, stop rather than defer-and-proceed, and
       name belmont:debug-manual <feature> as the next step.
    c. No state change across two iterations — identical task counts from
       `belmont status` twice running. Note that a run whose only remaining
       work is `[!]` trips this on its own; the blocked-task rule above is
       what makes the report say WHY, so report the blocker queue rather
       than "no progress".
    d. The user steers you to stop, change features, or do other work.
       Stop immediately — this outranks every other rule here.
  These counters must live ON DISK, not in your head — this loop survives
  compaction and a remembered count does not. Nothing else records them, so
  after every failed phase and every blocking-issue-survived-a-fix-round,
  append one line to {base}/NOTES.md under `## Loop decisions`:
  "<iso date> <phase> failed for <M> — <one-line reason>". Count from that
  file. (c) alone is derivable without it, from `belmont status` task counts.
  Do not start unrelated work; only progress this one feature.
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
