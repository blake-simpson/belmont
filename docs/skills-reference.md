# Skills Reference

## `working-backwards`

Amazon-style Working Backwards document creation. Produces a PR/FAQ with press release, FAQs, and appendix.

- Guides you through customer definition, problem statement, and solution
- Writes a one-page press release with leader quote and customer testimonial
- Creates external (customer) and internal (stakeholder) FAQs
- Includes appendix with product backlog, KPIs, and competitive analysis
- Enforces writing quality: no weasel words, data over adjectives, under 30 words per sentence
- Scales interview depth to the work — calibrates silently from the brief, walks a fixed domain checklist, digs on ambiguity, and skips what's already settled (no round cap, no visible tier)
- Delegates market, competitor, pricing, and regulatory research to `Explore` / `general-purpose` sub-agents and cites sources in the appendix
- Does NOT create PRDs or implementation plans — that comes next

**Output**: `.belmont/PR_FAQ.md`

## `product-plan`

Interactive planning session. Creates the PRD and PROGRESS files. Supports multi-feature products with a master PRD (feature catalog) and per-feature PRDs.

- Calibrates silently from the brief (no visible tier) and walks a fixed **Domains to Cover** checklist (user flows, edge cases, accessibility, privacy, notifications, monetization, etc.) — running as many rounds per domain as the work requires
- Digs on ambiguity, skips what the brief or prior answers already settle, and only exits when every relevant domain is resolved and the user explicitly confirms nothing more to add
- Creates structured PRD with prioritized tasks (P0-P3)
- Organizes tasks into milestones in PROGRESS.md
- Includes Figma URLs, acceptance criteria, verification steps
- Delegates deep product research (competitive patterns, compliance frameworks, WCAG criteria) to `Explore` / `general-purpose` sub-agents and cites sources in a `### Research Notes` subsection of the PRD
- Does NOT implement anything -- plan mode only

**Output**: `.belmont/PRD.md`, `.belmont/PROGRESS.md` (master feature summary), `.belmont/features/<slug>/PRD.md`, `.belmont/features/<slug>/PROGRESS.md`

## `tech-plan`

Technical planning session. Creates a detailed implementation specification.

- Requires an existing PRD (run plan first)
- Acts as a senior architect reviewing and refining the plan
- Calibrates silently from the PRD and existing master tech plan (no visible tier) and walks a fixed **Domains to Cover** checklist (rendering, data model, auth, observability, testing, CI/CD, migration, etc.) — skipping domains already settled by the master tech plan or prior answers
- Runs as many rounds per domain as the work requires; digs on ambiguity and only exits when every relevant domain is resolved
- Loads Figma designs and extracts exact design tokens
- Produces concrete file structures, component skeletons, API types
- Maps PRD tasks to specific code sections
- Delegates framework / library / version / migration / security research to `Explore` / `general-purpose` sub-agents, flags stale sources (>12 months), and cites URLs in the `## References` section
- Interactive Q&A until the exit criteria are met (every relevant domain covered, user explicitly confirms no more open questions)
- **Reconciles the PRD and PROGRESS** at the end of the session (Phase 4.5): fixes contradictions, removes leaked tech detail from the PRD, adds product-facing decisions to `## Clarifications`, and aligns PROGRESS dependency annotations with the TECH_PLAN's Implementation Order. Respects milestone sizing rules (3–5 tasks, soft ceiling 6) — new tasks become new milestones rather than inflating existing ones.

**Output**: `.belmont/TECH_PLAN.md`, plus reconciliation edits to `{base}/PRD.md` and `{base}/PROGRESS.md`

## `codex-plan-apply`

Codex-only compatibility skill for applying a `BELMONT_PLAN_PACKET` produced by a Codex plan-mode `product-plan` or `tech-plan` interview.

- Does not ask new planning questions
- Writes only explicit `.belmont/` paths named in the packet
- Refuses malformed packets, source-code paths, or missing operation details
- Lets Claude Code, opencode, Cursor, Windsurf, Gemini, GitHub Copilot, and Pi keep using `product-plan` and `tech-plan` directly

**Output**: The `.belmont/` file writes already specified by the packet

## `implement`

Implements the next pending milestone from the PRD.

- Reads PROGRESS.md to find the first incomplete milestone
- Creates a **MILESTONE file** (`.belmont/MILESTONE.md`) with orchestrator context
- Runs 3 agents, each reading from and writing to the MILESTONE file:
  1. **Codebase Scan** (codebase-agent) -- Reads MILESTONE + codebase, writes `## Codebase Analysis` *(parallel with 2)*
  2. **Design Analysis** (design-agent) -- Reads MILESTONE + Figma, writes `## Design Specifications` *(parallel with 1)*
  3. **Implementation** (implementation-agent) -- Reads MILESTONE only, writes code + `## Implementation Log` *(after 1+2)*
- After each task: marks it as `[x]` done in PROGRESS.md
- After all milestone tasks: marks the milestone complete
- **Archives the MILESTONE file** (`MILESTONE-M2.done.md`) to keep context clean for next run
- Creates follow-up tasks (plain `[ ]` entries) for out-of-scope issues discovered during implementation
- Handles blockers gracefully -- marks blocked tasks as `[!]` and skips to the next

## `next`

Implements just the next single pending task — a lightweight alternative to the full implement pipeline.

- Reads PROGRESS.md to find the first unchecked task in the first pending milestone
- Creates a **minimal MILESTONE file** with just the single task's context (skips analysis agents)
- Dispatches the single task to the `implementation-agent` as a sub-agent
- After the task is done: marks it as `[x]` done in PROGRESS.md
- If it was the last task in the milestone, marks the milestone complete
- **Archives the MILESTONE file** after completion
- Creates follow-up tasks (plain `[ ]` entries) for any out-of-scope issues

**Best for**: Follow-up tasks from verification, small fixes, well-scoped isolated work.
**Use `/belmont:implement` instead for**: Large tasks, first tasks in a milestone, tasks needing Figma analysis.

## `verify`

Runs verification and code review on all completed tasks.

- Runs two agents **in parallel**:
  - **Verification Agent** -- Checks acceptance criteria, Figma pixel comparison (Playwright headless), i18n text keys, edge cases, accessibility
  - **Code Review Agent** -- Runs build and test commands (auto-detects package manager: npm, pnpm, yarn, or bun), reviews code against project patterns, checks PRD alignment
- Both agents read the PRD, TECH_PLAN, and archived MILESTONE files for full context
- Categorizes issues: Critical / Warnings / Suggestions
- Creates follow-up tasks (plain `[ ]` entries) in PROGRESS.md for anything that needs fixing
- Produces a combined summary report

## `loop`

**Claude Code or Codex.** Drives a single feature to completion from inside the interactive REPL, advancing it milestone-by-milestone without you re-typing each skill. Usage: `/belmont:loop <feature-name>` in Claude Code, or `$belmont:loop <feature-name>` / `belmont:loop <feature-name>` in Codex.

- Resolves `<feature-name>` to one feature slug (prompts if omitted or ambiguous), then runs a self-paced loop where each iteration:
  1. `/belmont:implement <feature>` — build the next pending milestone
  2. `/belmont:verify <feature>` — verify what was just built
  3. `/belmont:next <feature>` (repeated until clear) + re-verify — if verify reports follow-ups or failures
  4. `/belmont:status <feature>` — stop if no pending milestones remain, otherwise continue
- Delegates to the host tool's long-running primitive: Claude Code's built-in `/loop`, or Codex Goal mode via `/goal`. Other shared-surface CLIs do not have matching interactive loop mechanics, so Belmont keeps `loop` hidden unless Claude Code or Codex is selected for the install.
- Stays scoped to the one named feature — never starts unrelated work, never edits milestone structure.
- The interactive counterpart to the headless `belmont auto` CLI (also aliased `belmont loop`). Use `/belmont:loop` or `$belmont:loop` to stay in the REPL and watch/steer; use `belmont auto` for fully headless, parallel, worktree-based execution.

## `debug`

Router that directs to the appropriate debug sub-workflow. Detects mode from user's invocation text or asks the user to choose.

## `debug-auto`

Auto debug loop — dispatches a verification agent to check each fix attempt.

- Uses the **agent-dispatch model** — each agent (implementation, verification, optionally design) runs in its own context window via `DEBUG.md` as shared context
- Tight investigate-fix-verify loop with max 3 iterations
- Dispatches design-agent on iteration 1 if Figma URLs are present in the PRD
- Reverts immediately on regression (`git checkout -- [files]`)
- User checkpoint after iteration 2 before continuing
- Single atomic commit with `debug:` prefix after user confirms the fix
- Ephemeral `DEBUG.md` — created at start, deleted when session ends
- Optional PRD integration: can mark follow-up tasks complete if relevant

**Best for**: Complex logic bugs, race conditions, issues needing automated test verification.

## `debug-manual`

Manual debug loop with deep Belmont context and in-place spec reconciliation. The user verifies each fix, and after the fix is confirmed the skill walks the loaded specs to correct any drift the bug exposed — all in one atomic commit.

- **Interactive only** — never invoked from `belmont auto` (which uses `debug-auto`)
- **Step 0 deep context load**: master `.belmont/PR_FAQ.md`, `.belmont/PRD.md`, `.belmont/TECH_PLAN.md`, `.belmont/NOTES.md` + each selected feature's `PRD.md`, `TECH_PLAN.md`, `PROGRESS.md`, `NOTES.md`, and latest `MILESTONE-M*.done.md`. Optional reads skip silently when absent. Files > 500 lines get a `[y/N]` gate; total context > 50 KB on local-LLM CLIs prompts narrowing
- **Multi-feature mode** — supports debugging bugs that span two or more features in one session
- Implementation agent adds strategic `[BELMONT-DEBUG]` logging (5-15 log points per iteration)
- After each fix, presents summary and asks user to verify with debug log output
- All `[BELMONT-DEBUG]` log lines are automatically cleaned up before committing
- Max 3 iterations, regression handling, and user checkpoint match auto mode
- **Spec Reconciliation phase** runs only on FIXED: walks the loaded specs, identifies drift (acceptance criteria mismatch, outdated Solution/Verification fields, contradicted TECH_PLAN decisions, completed follow-ups, root-cause patterns), presents unified diffs for `y/N/edit/skip` per-edit approval, edits in place, appends Five-Whys-style entry to NOTES.md
- **Atomic commit** — code edits + spec edits land in a single `debug: <fix> + spec sync` commit; commit body includes task IDs whose state was flipped so `runEvidenceCheck` finds attribution on a future verify pass
- **Structural prohibitions still apply**: never adds/renames/removes milestones; never uses polish/follow-up/cleanup naming; never flips a task to `[v]` (verify's job); never edits a feature's specs that wasn't selected; never adds `[ ]` follow-up tasks for unfixed drift (fix it or skip it)

**Best for**: UI bugs, visual issues, known reproduction steps, multi-feature debugging, **bugs that exist because the spec drifted from reality**.
**Use `debug-auto` instead for**: Complex logic bugs, race conditions, narrow code-only fixes where you don't want spec edits.
**Use `/belmont:next` or `/belmont:implement` instead for**: New features, large multi-file changes.

## `review-plans`

Reviews alignment between planning documents and the codebase. Detects drift, conflicts, and gaps across the entire document hierarchy.

- Compares PR/FAQ vision against master PRD feature catalog
- Checks each feature's PRD and tech plan against master documents
- Verifies task/milestone consistency between PRD and PROGRESS files
- Scans codebase for unplanned implementations or stale task statuses
- Presents each finding interactively with resolution options
- Can update PRDs, tech plans, PROGRESS files, and NOTES based on decisions
- Does NOT modify source code — planning audit only

**When to use**: After implementation sessions, before major milestones, or periodically to keep plans aligned with reality.

## `cleanup`

Reduce input token bloat by archiving completed features, removing stale milestone files, trimming notes, and auditing convention files.

- Scans all `.belmont/` state and identifies completed features, archived milestones, stale notes
- Presents each item individually — user chooses to archive, keep, delete, or skip per item
- Archives completed features into slim `ARCHIVE.md` summaries (~0.5 KB vs ~5-15 KB original)
- Audits CLAUDE.md, AGENTS.md, `.cursorrules`, `.windsurfrules` for stale file paths and outdated conventions
- Checks tool directories (`.claude/`, `.codex/`, `.cursor/`, etc.) for stale copies or broken symlinks
- Does NOT modify source code or tool directories — only `.belmont/` state and convention files

**When to use**: After completing a batch of features, when context windows feel bloated, or periodically during long-running projects.

## `reset`

Reset belmont state. In feature mode, choose to reset a specific feature, all features, or everything including masters and PR/FAQ.

- Shows a summary of current state (feature name, task/milestone counts, completion status)
- Asks for explicit confirmation before resetting
- Resets PRD.md and PROGRESS.md to blank templates
- Deletes TECH_PLAN.md if it exists
- Does NOT touch agents, skills, or any source code

**Resets**: `.belmont/PR_FAQ.md`, `.belmont/PRD.md`, `.belmont/PROGRESS.md`, `.belmont/TECH_PLAN.md`, `.belmont/MILESTONE.md`, `.belmont/MILESTONE-*.done.md`, `.belmont/features/`

## `repair`

Repair a `PROGRESS.md` whose task states no longer parse. Interactive; runs
outside the auto loop.

Acts on exactly three findings, all of them entries Belmont cannot act on as
written:

- a checkbox marker outside `[ ] [>] [x] [v] [!] [-]`
- a task line sitting outside every milestone (below a column-zero `## ` heading)
- a task whose ID names a different milestone from the one it is filed under

…plus one audit that is not a repair: a task marked `[v]` that the commit log does
not settle — no commit names it, or one does but another feature also claims the
task ID, which makes the match no evidence at all. The commit-evidence guard only
compares one phase's before and after, so a `[v]` already on disk when a run
started is audited by nothing. Reported separately, never applied mechanically,
and `leave` is a legitimate verdict — docs-only and config-only tasks often leave
no commit naming them.

**Evidence, never memory.** The skill does not ask you what a marker meant — a
damaged file carries dozens of these at once, and the honest answer six weeks
later is "I don't know", which is how the file got this way. It asks the
repository instead:

1. `belmont repair --feature <slug> --mechanical-only` settles everything the
   commit log can, at zero token cost — a commit naming the task ID proves the
   work happened, so the marker becomes `[x]`.
2. Whatever survives is read against the current code. If the route, component
   or spec a task names is gone, the task is moot; if it is there and does what
   the task describes, the task is done.

Every conclusion is presented with its evidence and confirmed before anything is
written.

**Bounds** — enforced by the CLI when it dispatches the skill, and stated in the
skill body for interactive use:

- never writes `[v]` (repair stops at `[x]`; `belmont reverify` earns the flip)
- never deletes a task line (dropped work is `[-]` withdrawn, reason in
  `## Decisions Log`)
- never creates, renames or removes a milestone; may move a task between
  milestones that already exist
- never touches a line it did not flag, or a line that changed since it scanned

See [cli-commands.md](cli-commands.md) for the CLI half.

## `status`

Read-only progress report. Does not modify any files.

Example output (project-level):

```
Belmont Status
==============

Product: My App

PR/FAQ: Written
Master Tech Plan: Ready

Chat Application (chat-app)
  Tasks: 3/7 done  |  Milestones: 1/3 done
    M1: Foundation (verified)
    M2: Core Features (in_progress)
    M3: Polish (todo)
  Next: P1-2 — Add real-time message updates
  Blocked:
    - [!] P1-3: Figma design not accessible

Use --feature <slug> for detailed task-level status.
```

Example output (feature-level with `--feature chat-app`):

```
Belmont Status
==============

Feature: Chat Application

Tech Plan: Ready

Tasks: 3 done, 1 in progress, 1 blocked, 2 todo (of 7 total)

  [v] P0-1: Set up project structure
  [v] P0-2: Implement authentication flow
  [x] P1-1: Create chat message component
  [>] P1-2: Add real-time message updates
  [!] P1-3: Implement file attachments
  [ ] P2-1: Add emoji picker
  [ ] P2-2: Dark mode support

Milestones:
  M1: Foundation (verified)
  M2: Core Features (in_progress)
  M3: Polish (todo)

Blocked Tasks:
  - P1-3: Figma design not accessible

Recent Activity:
---
Last completed: P1-1 - Create chat message component
```
