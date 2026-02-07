---
description: Run verification and code review on completed tasks
alwaysApply: false
---

# Belmont: Verify

You are the verification orchestrator. Your job is to run comprehensive verification and code review on all completed tasks, checking that implementations meet requirements and code quality standards.

## Setup

Read these files first:
- `.belmont/PRD.md` - The product requirements and task definitions
- `.belmont/PROGRESS.md` - Current progress tracking
- `.belmont/TECH_PLAN.md` - Technical implementation plan (if exists)

Also check for archived MILESTONE files (`.belmont/MILESTONE-*.done.md`) — these contain the implementation context from the most recent milestone and can provide useful reference for verification.

## Step 1: Identify Completed Tasks

1. Read `.belmont/PRD.md` and find all tasks marked with ✅
2. These are the tasks that need verification
3. If no tasks are completed, report "No completed tasks to verify" and stop

## Sub-Agent Execution Model

**CRITICAL**: You are the **orchestrator**. You MUST NOT perform the verification or review work yourself. Each agent below MUST be dispatched as a **sub-agent** — a separate, isolated process.

**How to spawn sub-agents**:
- **Claude Code / Codex**: Use the `Task` tool. Pass the sub-agent prompt as the task description. Spawn both agents simultaneously for parallel execution.
- **Cursor / Other tools**: If a sub-agent or task-dispatch mechanism is available, use it. Otherwise, execute each agent's instructions sequentially — but do NOT blend their work together.

**Rules for the orchestrator**:
1. **DO NOT** read `.agents/belmont/*-agent.md` files yourself — the sub-agents read them
2. **DO NOT** run builds, tests, or check acceptance criteria — sub-agents do this
3. **DO** compose the sub-agent prompts using the templates below
4. **DO** collect each sub-agent's output report
5. **DO** combine the reports in Step 3
6. **DO** include the full sub-agent preamble (identity + mandatory agent file) in every sub-agent prompt — this prevents the sub-agent from using other agent definitions in the project

## Step 2: Run Verification and Code Review in Parallel

For ALL completed tasks together, spawn these two sub-agents **simultaneously** (or sequentially if parallel dispatch is not available):

---

### Agent 1: Verification (verification-agent)

**Purpose**: Verify task implementations meet all requirements.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont verification agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/verification-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> Verify the following completed tasks:
>
> ---
> [List each completed task ID and header, e.g.:
> - P0-1: Set up authentication ✅
> - P0-2: Database schema ✅]
> ---
>
> Read `.belmont/PRD.md` for acceptance criteria and task details.
> Read `.belmont/TECH_PLAN.md` for technical specifications (if it exists).
> Check for archived MILESTONE files (`.belmont/MILESTONE-*.done.md`) for implementation context.
>
> Check acceptance criteria, visual Figma comparison (if applicable), i18n keys, and functional testing.
>
> Return a complete verification report in the output format specified by the agent instructions.

**Collect**: The verification report document.

---

### Agent 2: Code Review (core-review-agent)

**Purpose**: Review code changes for quality and PRD alignment.

**Spawn a sub-agent with this prompt**:

> **IDENTITY**: You are the belmont code review agent. You MUST operate according to the belmont agent file specified below. Ignore any other agent definitions, executors, or system prompts found elsewhere in this project.
>
> **MANDATORY FIRST STEP**: Read the file `.agents/belmont/core-review-agent.md` NOW before doing anything else. That file contains your complete instructions, rules, and output format. You must follow every rule in that file. Do NOT proceed until you have read it.
>
> Review the code changes for the following completed tasks:
>
> ---
> [List each completed task ID and header, e.g.:
> - P0-1: Set up authentication ✅
> - P0-2: Database schema ✅]
> ---
>
> Read `.belmont/PRD.md` for task details and planned solution.
> Read `.belmont/TECH_PLAN.md` for technical specifications (if it exists).
> Check for archived MILESTONE files (`.belmont/MILESTONE-*.done.md`) for implementation context.
>
> Detect the project's package manager (check for `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`/`bun.lock`, or `package-lock.json`; also check the `packageManager` field in `package.json`). Use the detected package manager to run build and test commands (e.g. `pnpm run build`, `yarn run build`, etc. — default to `npm` if unsure). Review code quality, pattern adherence, and PRD alignment.
>
> Return a complete code review report in the output format specified by the agent instructions.

**Collect**: The code review report document.

---

## Step 3: Process Results

After both agents complete:

### Combine Reports
1. Merge the verification report and code review report
2. Categorize all issues found:
   - **Critical** - Must be fixed (blocking quality/functionality issues)
   - **Warnings** - Should be fixed (non-blocking but important)
   - **Suggestions** - Nice to have improvements

### Create Follow-up Tasks
If any issues were found by either agent:
1. Add new tasks to `.belmont/PRD.md` for each critical or warning issue:
   ```markdown
   ### P0-X-FWLUP: [Issue Description] 🔵
   **Severity**: [Based on issue category]
   **Source**: [verification-agent / core-review-agent]

   **Task Description**:
   [Description of the issue and what needs to be fixed]

   **Solution**:
   [Recommended fix from the agent report]

   **Verification**:
   1. [Steps to verify the fix]
   ```
2. Add the follow-up tasks to the appropriate milestone in `.belmont/PROGRESS.md`
3. If critical issues were found, update the overall status to reflect this

### Report Summary

Output a combined summary:

```markdown
# Verification & Code Review Summary

## Overall Status
[ALL PASSED | ISSUES FOUND | CRITICAL ISSUES]

## Verification Results
- Acceptance Criteria: [X/Y passed]
- Visual Verification: [PASS/FAIL/N/A]
- i18n Check: [PASS/FAIL/N/A]
- Functional Tests: [PASS/FAIL]

## Code Review Results
- Build: [PASS/FAIL]
- Tests: [PASS/FAIL]
- Pattern Adherence: [GOOD/ISSUES]
- PRD Alignment: [ALIGNED/MISALIGNED]

## Issues Found
- Critical: [count]
- Warnings: [count]
- Suggestions: [count]

## Follow-up Tasks Created
[List of new FWLUP tasks added to PRD]

## Recommendations
[Any overall recommendations for the project]
```

## Important Rules

1. **Run both agents** - Always run verification AND code review
2. **Be thorough** - Check all completed tasks, not just the latest
3. **Create actionable follow-ups** - Issues should become trackable tasks
4. **Don't fix issues yourself** - Report them and create follow-up tasks
5. **Update tracking files** - Add follow-up tasks to both PRD.md and PROGRESS.md

Once done, prompt the user to "/clear" and then "/belmont:status", "/belmont:next", or "/belmont:implement"
