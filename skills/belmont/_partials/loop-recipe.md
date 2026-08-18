<!-- The iteration recipe, shared by both drivers.
     Claude Code runs it under /loop, Codex under /goal. It lived twice in
     loop.md until the two copies drifted: #35 added the Codex block, and the
     next change to the recipe landed in the Claude one only, so Codex users
     would have kept the old loop. Nothing kept them in step, so nothing did.
     {{driver}} = the driver command, {{call}} = how that tool names a skill
     (`/belmont:` for Claude, `belmont:` for Codex). <feature> and <range> are
     substituted by the invoking skill at handoff time, not at build time:
     <range> is "M<a>..M<b>" when the user bounded the run, else
     "all milestones". -->
{{driver}} Drive the <feature> Belmont feature to completion within <range>.
  Work ONLY milestones in <range>; treat every other milestone's state as
  read-only context, whatever its markers say. Each iteration:
  0. PICK THE TARGET MILESTONE <M> from <range>, and do not assume the
     status check picked it for you. `belmont status` names the first
     milestone that is not all-done and whose (depends: …) is met (all-done
     means every task [x]/[v]/[-] — so an all-[x] milestone is NOT named) —
     it knows nothing about <range> — and {{call}}implement independently
     selects a milestone of its own. A [!] task satisfies both forever, so
     a milestone whose ONLY live work is [!] is named again on every
     iteration and neither tool will ever move on.
     So: confirm the named milestone is in <range> and has at least one
     [ ], [>] or [x] task. If not, walk down PROGRESS.md's milestone
     headings within <range> to the first one that does. SKIP a milestone
     whose heading's (depends: …) names any milestone that is not yet
     all-done — all-done means it has at least one task and every one
     reads [x], [v] or [-]; an EMPTY milestone is never all-done and so
     never satisfies a dependency, while a name matching no milestone at
     all does not block. Its dependencies
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
  1. Run {{call}}implement <feature> to build milestone <M>.
     Append: "IMPLEMENT MILESTONE <M>. This names the milestone
     explicitly and supersedes your own Step 1 selection — do not
     re-derive it. MILESTONE-SCOPED IMPLEMENTATION: only implement tasks in
     milestone <M>. Do NOT flip checkboxes, add/remove tasks, or edit notes
     for any other milestone — treat their state as read-only context."
  2. ALWAYS run {{call}}verify <feature> — there is no skip. Only verify
     writes [v], so a skipped milestone can never reach a verified state,
     and every milestone must. Append:
     "MILESTONE-SCOPED VERIFICATION: verify milestone <M>. Do NOT change
     the task state of any other milestone — they may be intentionally
     incomplete. ONE EXCEPTION, and it is an instruction to INCLUDE, not
     merely to record: if your Step 1 scan surfaces [x] tasks in an EARLIER
     milestone IN <range>, add them to this pass — dispatch them to the
     verification and code-review agents alongside <M>'s tasks, and record
     the resulting [x]->[v] flips for those that pass. That rescan is the documented
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
         or a spec change that belongs to {{call}}tech-plan. The test is
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
     Run {{call}}next <feature> and append: "BATCH MODE: implement ALL
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
     Do NOT invoke {{call}}next once per task — each invocation reloads the
     whole skill, and that cost is why this loop runs out of session.
     Then re-verify FOCUSED: run {{call}}verify <feature> and append
     "FOCUSED RE-VERIFICATION: only verify (1) the FWLUP tasks just fixed,
     (2) build and tests pass, (3) any previously-failing acceptance
     criteria. Do NOT re-run Lighthouse. Do NOT re-check visual specs unless
     a FWLUP addressed UI. Do NOT create new Polish-level issues."
     Return to step 3 to triage whatever that re-verify surfaced.
  5. Decide whether to continue, then record what the verdict will need.
     Run `belmont status --feature <feature>`. Do NOT use --format json — it
     is ~3x larger and grows with task count. Only fall back to
     {{call}}status <feature> if the CLI is unavailable: that skill loads
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
         {{call}}debug-manual <feature> as the next step, NOT
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
       name {{call}}debug-manual <feature> as the next step.
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
