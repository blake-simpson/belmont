Domains: skills, agents, auto-mode

# Dispatch authorization: the host's rules outrank the skill's

## Why this matters

Belmont's orchestrator skills do not run on bare metal. They run *inside* a host CLI that has its own system prompt, and that prompt is not neutral about sub-agent dispatch. Claude Code sessions on the build and account this was measured against carry a standing line — quoted verbatim out of a live headless child — reading:

> Do not call the AgentTool unless the user requested it

Belmont's prompt is machine-assembled, and no human is typing at the moment it arrives. So an orchestrator reading `dispatch-strategy.md` faces two instructions in genuine conflict: the skill says *prefer Approach A*, the host says *not unless asked*. Both are legitimate; neither cites the other.

**Be precise about the prompt's shape — the obvious guess is wrong.** Under `belmont auto` on Claude Code the prompt is a literal `/belmont:<skill> --feature X` slash command (`auto_loop.go`), resolved by the child's own command discovery through the `.claude/commands/belmont/<skill>.md` symlink. The "Run the belmont:… skill. Read .agents/skills/…/SKILL.md fully" phrasing belongs to `adaptPromptForTool`, which returns early for every tool except `pi` and `opencode`. Two consequences. First, the authorization argument is *stronger* than it looks on the tool where the bug was actually observed: the invocation already has the exact shape the host's own carve-out names. Second, auto ships a **pointer**, not the prose — so a fix reaches a real project only once its installed `.agents/skills/` copy is regenerated and re-installed. "Covered by construction" does not cover a stale install.

The host wins, and it wins **silently**. A model resolving that conflict downgrades to sequential inline execution and, unless something forces it to say so, reports a completed milestone that reads exactly like a dispatched one.

The conflict is also **not deterministic**. It is a judgement call, so the same fixture on the same commit resolves differently run to run — which is worse than a consistent failure, because it defeats the "run it again" instinct that normally exposes a broken path.

## Invariant

Prose that tells an orchestrator to dispatch MUST also tell it that dispatch is **authorized**, not merely preferred. The orchestrator's job is to check *whether a dispatch tool is present*; the prose must never leave it deciding *whether it is allowed*.

Approach selection is gated on **tool presence alone**. A runtime *refusal* of a specific call is the one legitimate reason to fall back with the tool present — and it must be reported as a refusal, not as an absence.

## How it's enforced

`skills/belmont/_partials/dispatch-strategy.md`, inlined at build time into every orchestrator skill (`implement`, `verify`, `debug-auto`, `debug-manual`):

- **"Running this skill is the request to dispatch."** States the authorization as fact and tells the orchestrator not to re-litigate it: a human ran `/belmont:<skill>`, or ran `belmont auto`, which shells out on their behalf. The skill they invoked *is* delegation; the prompt is the user asking, relayed through Belmont.
- **The choice is re-scoped to presence.** "Choose Approach B because a name below is missing from your tool list — never because dispatching felt unrequested."
- **Approach B's entry condition is stated negatively at its own heading**, so the fallback section refuses to apply to a session that has the tool.
- **The orchestrator must announce its selection in one line** (from #45). This is what makes a silent downgrade visible at all, and it is the mechanism that caught this.
- **The sub-agent type name is per-CLI, stated in the partial** (from #56). Claude Code's full-access agent is `general-purpose`; opencode's is `general`, reached through its `task` tool, and an unknown name hard-fails (`Unknown agent type: … is not a valid agent type`) rather than degrading — so before #56, letting opencode into Approach A produced a failing call, and the post-#51 rule that a failed dispatch must be reported-then-fallen-back-from was the only thing standing between that and a silent inline run. opencode's `task` carries no model parameter, so tiers remain Claude-only and opencode stays in `tier-preflight.md`'s group.

This mirrors the host's own carve-out rather than fighting it: Claude Code's `Workflow` tool documentation, on the build measured, lists "the user invoked a skill or slash command whose instructions tell you to call Workflow" as explicit opt-in. Belmont asserts that same shape for the dispatch tool. Treat that quotation as version- and account-dependent — if a future build drops the enumerated carve-out, the fix still stands on the plain *unless the user requested it* conditional, which is the part actually being satisfied.

## Known rough edges

**The invariant is universal; the enforcement is not.** `dispatch-strategy.md` is included by exactly four skills — `implement`, `verify`, `debug-auto`, `debug-manual`. At least four more instruct sub-agent dispatch and include none of it:

- **`next`** — the important one. It calls itself a "lightweight implementation orchestrator", says "dispatch to a sub-agent, don't implement code yourself", and carries no tool-name check, no authorization, and **no announcement line** — so a silent downgrade there is invisible by construction, which is the pre-#45 state. It is not interactive-only: `belmont auto` drives it for `actionImplementNext` and for `actionFixAll`, whose own prompt orders "dispatch to implementation agent" for every FWLUP task, and `loop-recipe.md` routes `/belmont:loop`'s whole follow-up step through it.
- **`tech-plan`** (reached by `actionReplan`), **`product-plan`**, **`working-backwards`** — all dispatch research sub-agents via `proactive-research.md`. Lower stakes: a skipped research sub-agent degrades a plan rather than dropping implementation work.

Tracked as issue #54. Until it closes, do not read "four orchestrator skills" as "everywhere that dispatches".

## Why Approach A is sub-agents and not agent teams

`main` ranked Agent Teams *above* plain sub-agent dispatch. #45 removed it because it could not run at all: the gate named `TeamCreate`, `TeamDelete` and `Task` with a `team_name` parameter, and all three were withdrawn from Claude Code in v2.1.178 — `team_name` is now accepted and ignored on the `Agent` tool. That much is a correctness fix and needs no defending; the uniform inline result on `main` in the Evidence section is what it looks like from the outside.

What follows is the separate question — whether it should come back when a stable teams API ships — and it is an argument from Belmont's design, **not an eval result**. Recorded so the next person does not re-derive it.

**Belmont already has both of the things a team provides.** A team's two differentiators are a shared task list and inter-agent messaging. Belmont's agents coordinate through `MILESTONE.md` / `DEBUG.md` and track through `PROGRESS.md`. Those are files: they survive `/resume`, they show up in a diff, they are what the archive step preserves, and they cost nothing per message. A team's mailboxes live under `~/.claude/teams/{team}/inboxes/`, in a directory removed when the session ends, and in-process teammates are documented as not restored by `/resume` or `/rewind`.

**It is absent exactly where Belmont parallelises hardest.** `belmont auto` shells out `claude -p` (`toolexec.go`), and teammates do not spawn in non-interactive mode. Auto's parallelism is wave-level across isolated git worktrees with their own ports and a merge-back — real filesystem isolation. Teammates share one working tree.

Skill by skill, for the four that include this partial:

- **`implement`, phases 1–2.** `codebase-agent` and `design-agent` run simultaneously, never address each other, and write disjoint sections of the MILESTONE file. There is nothing to message about, and they already run concurrently as parallel dispatch calls in one message. A team buys two extra session spawns and no additional concurrency.
- **`implement`, phase 3.** This is the one to not restore. `main` carried the only instruction where a team changed behaviour: *"Add an implementation-agent into the team per task in the milestone… Use the team-lead to coordinate between them if they need to edit the same areas."* A milestone is 3–6 tasks in one vertical slice, so they routinely touch the same files; `implementation-agent` commits each task separately; and every one of those agents appends to the same `## Implementation Log`, which Step 4 reads and which is the only record of what actually ran. "The team-lead coordinates" is prose, not a lock.
- **`verify`.** The one that would *break* rather than merely cost more. Both agents return their findings as call output — *"Collect: The code review report document"*, then Step 3 merges the two. A teammate does not return output: the lead receives an idle notification and has to be sent the result separately.
- **`debug-auto`, `debug-manual`.** Both declare **"Parallel agents: None by default"** — a strictly sequential design → implementation → verification chain over a single `DEBUG.md`, bounded at 3 iterations. Team setup and teardown around a serial chain is overhead with no counterpart.

**The one case worth revisiting is not this dispatch path.** Parallel competing-hypothesis debugging — several investigators trying to disprove each other's theories — is a real technique, and Belmont's debug skills do not do it. That is a redesign of `debug-*`, it works just as well over plain sub-agent dispatch, and it is not a reason to restore an approach in `dispatch-strategy.md`.

## Failure mode if you break it

- **Silent Approach B.** Every phase runs in the orchestrator's own context. A long `implement` burns context far faster than its phase count suggests, and nothing in the output says why.
- **`models.yaml` loses its per-agent half.** Tiers are applied through the dispatch call's `model:` parameter, and with no dispatch call there is nowhere to put one. Be exact about the damage: under `belmont auto` the *phase* tier still lands, because `executeLoopAction` resolves `resolveModelFlags(…, tierForAction(action.Type, …))` and passes it on the shell-out — so an implement phase already runs at the implementation tier. What is lost is differentiation *within* a phase (codebase / design / code-review each getting their own tier), and in interactive mode, where Belmont sets no flags, the whole mechanism. There is no runtime validation of `models.yaml` — nothing reports either loss.
- **Evals go nondeterministic instead of red.** With dispatch genuinely available, some runs dispatch and some do not, and the two paths file different numbers of follow-up tasks for the same seeded defect. The suite fails on a cross-run comparison rather than on any assertion, which reads as flakiness and invites someone to relax the check.

## Don't re-do

- **"Name the tool correctly and dispatch will happen."** That was #45's fix and it was necessary but not sufficient. Correcting `Task`/`TeamCreate` → `Agent` moved Claude Code from *never* dispatching to dispatching in roughly half of observed runs; the rest declined on authorization grounds while explicitly stating they had the tool.
- **"It must be leaking from the orchestrating session."** Measured and false. The directive survives a scrubbed environment: a bare `claude -p` with `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, the session ID and the messaging socket all unset still reports carrying it. It is in no file on disk — `~/.claude/settings.json`, `~/.claude.json`, `~/.claude/CLAUDE.md`, project settings and managed-settings were all checked.
- **"Tell the model to ignore its system prompt."** Rejected, and it is not what the fix does. The host's rule is conditional — *unless the user requested it* — so the honest move is to establish that the condition is met, which it is. Prose instructing an agent to disregard its host would be both untrue and unstable.
- **"Set `--permission-mode bypassPermissions` and the problem goes away."** It does not. Belmont already passes it, and `Agent` is already in the `--allowedTools` list (`toolexec.go`). Permission was never the blocker; the blocker was an instruction about *when to choose* to call, which no permission flag addresses.
- **Three mechanical alternatives on the auto path**, all rejected for the same reason: each fixes **one** invocation path, and this repo's bar is both. (a) `--append-system-prompt` carrying the authorization, which would rank it alongside the rule it answers; (b) rewording the assembled prompt to read as an explicit request to delegate; (c) steering the child to invoke the skill through its own `Skill` tool, landing the invocation in the host's blessed category rather than arguing equivalence to it. All three are invisible to an interactive `/belmont:implement`, which is where half the exposure is. **(a) remains the best candidate for belt-and-braces reinforcement** if the prose ever proves insufficient under `belmont auto` — it is cheap and does not conflict with the prose.
- **"Restore Agent Teams as the preferred approach once the API stabilises."** The withdrawn tools are why it was removed; they are not why it stays out. See *Why Approach A is sub-agents and not agent teams* above — Belmont's file-mediated coordination already does the job a team's task list and mailbox do, and does it durably, while auto's worktree waves already provide the isolation a shared working tree cannot. The specific line never to reinstate is `main`'s per-task `implementation-agent` fan-out inside a team.
- **"Assert dispatch happened in the eval."** Tempting, and forbidden by `meta/evals.md` — that is an assertion on prose, and it breaks on the first model swap. The announcement line exists so a human reading a transcript can see it; it is not an assertion target.

## Evidence

- Issue #45. Found by *reading* a Tier 2 transcript, not by an assertion: children said "no Task/TeamCreate dispatch available here" in their own words.
- The follow-on, found the same way: after #45, children said *"I have the `Agent` tool, but this session carries a standing directive not to call it unless the user asks for it"* — and then took the fallback. Three fixtures, same reasoning, independently phrased.
- The `failing-acceptance` fixture, 3 runs per commit. **Mind the renumbering**: on `main` the letters were A = Agent Teams, B = parallel sub-agents, C = inline, and #45 collapsed them to A = dispatch, B = inline. So "C on main" and "B on the branch" are the *same* inline outcome, and "a mix of A and B" means *some dispatched and some did not* — not two flavours of dispatch.
  - **On `main`: inline three times out of three.** Uniform, because the tool-name check could not pass — so the cross-run comparison was trivially satisfied by a path that was uniformly broken. (Those runs did name their approach, but `main` has no instruction to; the announcement requirement arrived with #45, so credit ordinary transcript reading for the `main`-side observation, not the mechanism.)
  - **On the fix branch before this entry's fix: a mix of dispatch and inline**, and the suite failed on `P1-M1-FIX-2` present in run 1 and absent in run 2. The nondeterminism was not introduced by the branch; it was *uncovered* by it. Every `LiveExpect` transition held in all 9 runs.
  - **After the authorization prose, at `da0ab36`: dispatch 3 runs out of 3, inline zero, zero mentions of the directive**, across two `failing-acceptance` batches.
  - **After the red-team rewrite, at `f50cfa8`: the full live suite green — 3 fixtures × 3 runs, 13 dispatch announcements, inline zero, refusals zero, zero mentions of the directive.** This is the run that licenses the *current* wording, and it was worth doing separately: `c0f54a6` deliberately removed the paragraph's two most forceful sentences as overclaims, and rhetorical force was plausibly part of what moved the behaviour. It was not — the argument carries it. Both `implement` (single-milestone-clean, mid-milestone) and `verify` (failing-acceptance) paths are covered.
- **The remaining variance was not this bug.** With dispatch uniform, one batch still failed the cross-run check on `P1-M1-FIX-3`: one run filed three follow-ups for the seeded defect, another filed two, folding "add the npm test script" into the test task instead of splitting it out. Both verdicts are correct; they differ only in task *granularity*. The check was comparing agent-invented follow-up IDs — asserting that a model's granularity judgement is reproducible — and is now scoped to seeded IDs. See [`../meta/evals.md`](../meta/evals.md).
- A live headless child, given Belmont's exact argv, quoted the directive back verbatim on request and confirmed `Agent` was in its tool list at the same time.

## Revisions

- 2026-08-15 — initial. Records the host-vs-skill dispatch conflict found while diagnosing a nondeterministic Tier 2 run after #45, the authorization prose that resolves it, and the measurements ruling out session leak and permission flags as causes.
- 2026-08-15 — red-teamed. Corrected the stated cause (auto sends a literal slash command on Claude; the "Read …SKILL.md" phrasing is pi/opencode-only), narrowed the `models.yaml` claim to per-agent differentiation, scoped "every Claude Code session" to the measured build/account, added `## Known rough edges` for the four dispatching skills the partial does not reach, recorded three rejected mechanical alternatives, and noted #45's approach-letter renumbering so the evidence cannot be misread. Re-measured against the rewritten prose: full live suite green, 13 dispatch announcements, zero inline.
- 2026-08-16 — recorded why Agent Teams should not return when a stable API ships, skill by skill, and separated that design argument from the correctness fix that removed it. Added the matching `Don't re-do` entry. No new measurement: the section reasons from the four skills' own dispatch configurations and the host's documented teammate semantics.
- 2026-08-18 — #56: Approach A names the sub-agent type per-CLI (`general-purpose` on Claude Code, `general` on opencode via its `task` tool) instead of hardcoding Claude's, and the tool-presence check names `task` alongside `Agent`/`Task`. Verified against the opencode 1.17.0 binary: the task tool's input schema is `{description, prompt, subagent_type[, task_id, command]}` — no model parameter — so tiers stay Claude-only and `tier-preflight.md` now says "no per-dispatch model override" rather than the no-longer-true "no sub-agent dispatch".
