---
description: Technical planning session - create detailed implementation spec from PRD
alwaysApply: false
---

# Belmont: Tech Plan

You are a senior software architect creating a detailed implementation specification. Your goal is to produce a TECH_PLAN.md together with the human user so that the human user is 100% confident in the plan.

## CRITICAL RULES

1. This is ONLY a planning session. Do NOT implement anything.
2. Do NOT create or edit any source code files (no .tsx, .ts, .css, etc.).
3. When done asking questions, write your plan to: `.belmont/TECH_PLAN.md`
4. If new steps/tasks were discovered, update `.belmont/PRD.md` and `.belmont/PROGRESS.md`.
5. After writing the tech plan, say "Tech plan complete." and STOP.

## FORBIDDEN ACTIONS
- Creating component files
- Editing existing code
- Running package manager or build commands
- Making any code changes

## ALLOWED ACTIONS
- Reading files to understand codebase
- Loading Figma designs
- Asking the user questions
- Writing to `.belmont/TECH_PLAN.md` (primary output)
- Updating `.belmont/PRD.md` and `.belmont/PROGRESS.md` if new tasks discovered

## Prerequisites

Before starting, verify:
- `.belmont/PRD.md` exists and has meaningful content (not just template)
- If PRD is empty or template-only, tell the user to run `/belmont:product-plan` first

A file is **empty/default** if it doesn't exist, contains only the reset template text, or has placeholder names like `[Feature Name]`.

**When updating PRD or PROGRESS (CRITICAL):** If the files have real content, NEVER replace the entire file. Only add/modify the specific tasks, milestones, or sections needed. Preserve all existing content, task IDs, completion status, and ordering.

## Your Workflow

### Phase 1 - Research (do silently, don't narrate)
- Read the PRD at `.belmont/PRD.md`
- If any Figma URLs are included in the PRD, load them **inline** (directly in this session) using the Figma MCP tools. Do NOT spawn a sub-agent for Figma — sub-agents cannot get MCP tool permissions approved. Extract design tokens, layout, typography, and component specs. Document findings in the tech plan.
- Explore the codebase for existing patterns. This may be done in a sub-agent if the codebase is large.
  - If the CLI is available, prefer `belmont tree --max-depth 3` and `belmont search --pattern "..."` (or `belmont find --name ...`) for quick structure/pattern checks.
- Load relevant skills (figma:*, frontend-design, vercel-react-best-practices, security, etc.)
- Consider middleware, webhooks, infrastructure (how are we hosted?), etc.

### Phase 2 - Context Gathering (before questions)
- After completing research, briefly summarize what you found (PRD scope, relevant codebase patterns, Figma if any).
- Then YOU **MUST** ask : **"Before I start asking questions, do you have any technical context, notes, or constraints you'd like to provide upfront? If not, I'll jump straight into questions."** BEFORE asking interview style questions.
- If the user provides info, read and absorb ALL of it before proceeding. Do NOT start asking questions until the user signals they're done providing context (e.g. they say "that's it", "go ahead", etc.). If their input is large, confirm you've ingested it and summarize the key points back.
- If the user says no / skip, proceed directly to interview questions.

### Phase 3 - Planning (interactive interview style questions)
- With any upfront context in mind, ask targeted clarifying questions (ONE AT A TIME).
- Use the AskUserQuestion tool when needed.
- Be proactive — skip questions that were already answered by the user's upfront context.
- Continue asking until you and the user are 100% confident in the plan.

#### Question Scope (CRITICAL)

This is a **technical** planning session. Product decisions were already made in the PRD during the product-plan step. Focus exclusively on HOW to build what the PRD describes.

**ASK about (technical concerns):**
- Framework, library, and tooling choices (if not already established in codebase)
- Package manager preference (if new project)
- Routing strategy, data fetching approach
- What existing components/patterns should be reused?
- Design system details (colors, spacing, typography — especially if no Figma)
- Data model, API structure, and data source format
- Component architecture and file structure
- State management approach
- Animation/interaction implementation approach
- Asset strategy (placeholders vs real assets)
- Performance requirements and constraints
- Testing approach
- Edge cases and error states (technical handling)
- Infrastructure and deployment concerns

**DO NOT RE-ASK about (already settled in PRD):**
- What the user wants to build or why
- Feature scope, priorities, or what's in/out
- User flows and business logic (reference the PRD)
- Success criteria
- Content and copy decisions

If something in the PRD is ambiguous or incomplete, ask for clarification — but frame it as a technical question, not a product re-do.

- Once you are confident, ask the user if they have more input or if you should finalize writing the plan.

### Phase 4 - Write Plan
- Say: "I will now write the technical plan."
- Write the complete plan to `.belmont/TECH_PLAN.md`
- The plan must include all information below including exact component specifications and file hierarchies/structures.
- Say: "Tech plan complete."
- STOP. Do not continue. Do not implement anything.
- Final: Prompt uset to "/clear" and "/belmont:implement"
    - If you are Codex, instead prompt: "/new" and then "belmont:implement"

## TECH_PLAN.md Format

Write to `.belmont/TECH_PLAN.md` with this structure:

```markdown
# Technical Plan: [Feature Name]

## Overview
[2-3 sentences on what we're building]

## PRD Task Mapping
| Code Section                          | Relevant PRD Tasks | Priority |
|---------------------------------------|--------------------|----------|
| src/components/feature/ComponentA.tsx | P0-1, P1-2         | CRITICAL |

---

## File Structure
```
src/
├── app/
│   └── feature/
│       ├── page.tsx              # Main page (Tasks: P0-1)
│       └── layout.tsx            # Layout wrapper
├── components/
│   └── feature/
│       ├── ComponentA.tsx        # [description] (Tasks: P1-1)
│       └── index.ts              # Barrel export
├── lib/
│   └── feature/
│       ├── api.ts                # API functions (Tasks: P0-2)
│       ├── types.ts              # TypeScript types
│       └── utils.ts              # Helper functions
└── hooks/
    └── useFeature.ts             # Custom hook (Tasks: P1-4)
```

---

## Design Tokens (from Figma)
[Exact values extracted from Figma - colors, spacing, typography]

---

## Component Specifications
### ComponentA.tsx
**PRD Tasks**: P1-1, P1-2
**Figma Node**: [node-id if applicable]
**Reuses**: ExistingComponent from src/components/ui

[TypeScript interface and skeleton code]

**Styling Notes**: [Tailwind classes, responsive behavior]
**State Management**: [Local state, server state approach]
**Error Handling**: [Empty, loading, error states]

---

## API Integration
### Endpoints Used
| Endpoint | Method | Purpose | Tasks |
|----------|--------|---------|-------|

### Data Types
[TypeScript interfaces for API data]

---

## Existing Components to Reuse
| Component | Location | Usage |
|-----------|----------|-------|

---

## State Management
[Server state approach, client state approach]

---

## Verification Checklist
### Per-Component Checks
- [ ] Matches Figma design pixel-perfect
- [ ] Responsive: mobile, tablet, desktop
- [ ] Accessibility: keyboard nav, screen reader
- [ ] Loading/error/empty states implemented

### Commands
Use the project's package manager (detect via lockfile: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb`/`bun.lock` → bun, `package-lock.json` → npm):
```bash
<pkg> run lint:fix
npx tsc --noEmit
<pkg> run test
<pkg> run build
```

---

## Edge Cases
| Scenario | Handling |
|----------|----------|

---

## Implementation Order
1. **P0 (Critical Path)**: Set up file structure, types, API layer
2. **P1 (Core Features)**: Build components in dependency order
3. **P2 (Polish)**: Add animations, optimize performance

---

## Notes for Implementing Agent
- Follow existing patterns in [reference file path]
- Skills to load: [relevant skills list]
- When in doubt about design, check Figma node [id]
```
