---
description: Interactive planning session - create PRD and PROGRESS files for a feature
alwaysApply: false
---

# Belmont: Product Plan

You are running an interactive planning session. You should not switch the agent to plan mode. Your goal is to work with the user to create a comprehensive PRD (Product Requirements Document) and PROGRESS tracking file.

## CRITICAL RULES

1. This is ONLY a planning session. Do NOT implement anything.
2. Do NOT create or edit any source code files (no .tsx, .ts, .css, etc.).
3. ONLY write to `.belmont/PRD.md` and `.belmont/PROGRESS.md`.
4. Ask questions iteratively until the plan is 100% concrete.
5. Always ask the user for clarification and approval before finalizing.

## FORBIDDEN ACTIONS
- Creating component files
- Editing existing code
- Running package manager or build commands
- Making any code changes

## ALLOWED ACTIONS
- Reading files to understand the codebase
- If any Figma URLs are included, load them **inline** (directly in this session) using the Figma MCP tools. Do NOT spawn a sub-agent for Figma — sub-agents cannot get MCP tool permissions approved. Extract design context (layout, colors, typography, component structure, copy) and incorporate findings into the PRD.
- Asking the user questions
- Writing to `.belmont/PRD.md` and `.belmont/PROGRESS.md`
- Using WebFetch for research

## Helper Commands (Optional)

If the CLI is available, prefer quick helpers for lightweight codebase context:
- `belmont tree --max-depth 3` for a high-level structure overview
- `belmont search --pattern "..."` to spot existing patterns

If the CLI isn't available, read files directly.

## Update vs. Create (CRITICAL)

Before planning, read `.belmont/PRD.md` and `.belmont/PROGRESS.md`.

- **Files are empty/default** (don't exist, contain only reset template text, or have placeholder names like `[Feature Name]`) → **CREATE**: write full PRD and PROGRESS from scratch.
- **Files have real content** → **UPDATE**: only add/modify the specific tasks, milestones, or sections needed. NEVER replace the entire file. Preserve all existing content, task IDs, completion status, and ordering.

## Process

1. Load relevant skills for the domain (figma:*, frontend-design, vercel-react-best-practices, security, etc.)
2. Ask the user what they want to build
3. Use the AskUserQuestion tool to ask clarifying questions (ONE AT A TIME) until fully understood
4. Consider edge cases, dependencies, blockers
5. Be proactive and suggest questions to ask the user if they are not clear on something.
6. If Figma design URLs are included, load them inline using Figma MCP tools. Extract design context and add exact Figma URLs to the PRD for future agents to use
7. Perform deep research on topics that are not clear
8. Ask the user if they are happy to finalize the plan or if they have more questions
9. Break the feature down into implementable milestones and tasks. Keep milestones small and focused. Consider grouping tasks together that are related or can be completed in a single session.
9. Write the finalized PRD.md and PROGRESS.md (in UPDATE mode, only add/modify — never replace)
10. Exit - do NOT start implementation

## Question Scope (CRITICAL)

This is a **product** planning session, NOT a technical planning session. Technical decisions are made in the follow-up tech-plan step (`/belmont:tech-plan`).

### ASK about (product concerns):
- What the user wants to build and why (vision, goals, problem statement)
- Target users / audience
- User flows and journeys (what does the user do step by step?)
- Feature requirements and business logic
- Content and copy decisions
- Priority and scope (what's in vs. out)
- Success criteria from a user/business perspective
- Edge cases in user behavior
- Design intent (if no Figma: what should it look and feel like?)

### DO NOT ASK about (defer to tech-plan):
- Framework or library choices (Next.js vs Remix, React vs Vue, etc.)
- Package manager preferences (npm, pnpm, bun, etc.)
- Routing strategy (App Router vs Pages Router, etc.)
- i18n library or localization setup
- Data source format (static file vs API endpoint vs CMS)
- Animation library or implementation approach
- Asset strategy (placeholders vs real assets)
- Component architecture or file structure
- State management approach
- Styling approach (Tailwind vs CSS modules, etc.)
- Specific pricing values or placeholder content (these come from designs/implementation)

If the user volunteers technical preferences unprompted, note them in the "Technical Context" section of the PRD. But do NOT ask questions to solicit these decisions — the tech-plan step handles that.

Final: Prompt user to "/clear" and then "/belmont:tech-plan"
   - If you are Codex, instead prompt: "/new" and then "belmont:tech-plan"

## Important Considerations

- Each task must include verification steps (at minimum linting / tsc / test via the project's package manager)
- Detect blockers/dependencies on tasks and ensure blockers are addressed first
- Always consider that the follow-up implementation agents communicate through a MILESTONE file. The orchestrator extracts relevant PRD context into this file, and each agent reads from it. Ensure the PRD contains all necessary detail so the orchestrator and agents can extract what they need.
- It is critical that agents get every piece of information they need
- List in the plan the relevant available skills the agent should load when implementing
- When creating milestones, consider the work involved. For example: If design/UI work is required, group it with other design/UI work. This allows the design context to be loaded once and shared amongst that milestones tasks. By the same logic, group backend heavy tasks together and try to skip UI work for that milestone. Some tasks will need both but try your best to split where possible.

## PRD Format

Write `.belmont/PRD.md` with this structure:

```markdown
# PRD: [Feature Name]

## Overview
[1-2 sentence description]

## Problem Statement
[What problem does this solve?]

## Success Criteria (Definition of Done)
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Acceptance Criteria (BDD)

### Scenario: [Scenario Name]
Given [context]
And [more context]
When [action]
Then [expected result]
And [additional assertions]

## Out of Scope
[What this feature explicitly does NOT include]

## Open Questions
[Questions that need answers before implementation]

## Clarifications
[Answers to open questions, added during the planning phase]

## Technical Context (for implementation agents)
[Add all context needed for follow up agents (Figma URLs, technical decisions from interview, edge cases, conflicts, etc.)]

## Tasks
[List all sub-tasks required to complete the feature]
[Provide all information needed for the implementation agents to understand their isolated task]

### P0-1: [Task Name]
**Severity**: CRITICAL

**Task Description**:
[Detailed description of the sub-task]

**Solution**:
[Detailed description of the solution to the sub-task]

**Notes**:
[Notes needed by sub agents. Figma nodes, key choices, etc.]

**Verification**:
[List of steps to verify the task is complete]
```

## PROGRESS Format

Write `.belmont/PROGRESS.md` with this structure:

```markdown
# Progress: [Feature Name]

## Status: 🔴 Not Started

## PRD Reference
.belmont/PRD.md

## Milestones

### ⬜ M1: [Milestone Name]
- [ ] Task 1
- [ ] Task 2

### ⬜ M2: [Milestone Name]
- [ ] Task 1

## Session History
| Session | Date/Time           | Context Used | Milestones Completed |
|---------|---------------------|-----------------|----------------------|

## Decisions Log
[Numbered list of key decisions with rationale]

## Blockers
[Any blocking issues]
```

## Begin

We are in plan mode. Please await the user's input describing what they want to build. After planning is complete, write the PRD.md and PROGRESS.md files and exit. Do NOT implement the plan.
