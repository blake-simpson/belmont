Domains: skills, cli

# Codex plan-mode write handoff (`codex-plan-apply`)

## Why this matters

Codex is the only supported tool with a hard split between its best *planning* surface and its *file-writing* surface:

- Codex **plan mode** exposes keyboard-navigable structured pick-lists — the best interview UX of any Belmont tool. Outside plan mode the same `product-plan` / `tech-plan` interview degrades to long plain-text question dumps.
- But inside plan mode the session is planning-oriented, so direct writes to `.belmont/` planning files are often unavailable or inappropriate.

Every other tool (Claude Code, opencode, Cursor, Windsurf, Gemini, GitHub Copilot, Pi) asks structured questions **and** writes files in one session, so it has no such gap. Without a bridge, a Codex user is forced to choose between the good pick-list interview (but can't persist the plan) and direct writes (but loses the structured UX). `codex-plan-apply` is the bridge.

## Invariant

- `product-plan` and `tech-plan` write `.belmont/` files **directly** for every tool. The packet path is a Codex-plan-mode-only fallback: emit a single fenced `BELMONT_PLAN_PACKET` *only* when running as Codex in plan mode **and** direct writes are unavailable. No other tool ever takes the packet path.
- `codex-plan-apply` is a pure applicator. It **never** re-opens the interview, never infers missing PRD/PROGRESS/TECH_PLAN/`models.yaml` content, never edits source code, and writes **only** the explicit `.belmont/` paths named in the packet. The planning decisions were already made and approved in plan mode; this skill just persists them.
- The packet is self-contained: every target `.belmont/` path, each operation (`create` / `replace` / `update-section`), full content for creates/replacements, exact section content for updates, the commit message, and the next recommended Belmont prompt. Decisions must not be left only in chat.

## How it's enforced

- **Prose-only, by design (for now).** The Codex-only scope is carried by (a) the skill *name* — `codex-plan-apply` makes the tool scope legible at the install surface — and (b) the "This section is Codex-only…" banners in `product-plan` / `tech-plan` plus the refusal-case list in `codex-plan-apply`'s body. There is **no** Go-side install gating: `belmont install` syncs the skill to the shared `.agents/skills/` surface, so it physically lands for all eight tools. Only convention keeps non-Codex tools off it.
- Refusal cases in the skill body backstop misuse: it stops without editing if no packet is present, any target path escapes `.belmont/`, the packet asks for source-code changes or new planning decisions, or a conflict isn't resolved by an explicit operation.
- Interactive-only. There is no auto-mode path — `belmont auto` assembles its own prompt and never runs in Codex plan mode, so the handoff never fires there. See [`dual-invocation-paths.md`](dual-invocation-paths.md): this skill exists purely on the interactive side.

## Failure mode if you break it

- **Applicator drifts into a planner.** If `codex-plan-apply` starts asking questions or filling gaps, it silently re-decides things the user already settled in plan mode — defeating the whole point and producing a plan the user never approved.
- **Packet path leaks to other tools.** If `product-plan` / `tech-plan` emit a packet for a non-Codex tool (or outside plan mode), that tool stalls waiting for a second `codex-plan-apply` step that was never needed — it could have written the files directly.
- **Underspecified packet.** If decisions are left in chat instead of in the packet, the applicator either guesses (forbidden) or refuses, and the planning work is lost on the plan-mode/exit boundary.
- **Path escape.** A packet writing outside `.belmont/` would let a "planning" step mutate source — the path-escape and source-code refusal cases exist specifically to prevent this.

## Don't re-do

- **"Make every tool use the packet handoff for consistency."** Rejected. Only Codex has the plan-mode/write split; the other seven tools write in-session. Routing all of them through a two-step apply would add a pointless manual step everywhere to paper over one tool's constraint.
- **"Gate `codex-plan-apply` to Codex-only mechanically at install time."** Still deferred for this skill. Belmont now has a narrow selected-tool visibility hook for conditional interactive-loop skills (see `conditionalSkills` in [`skill-format.md`](skill-format.md)), but `codex-plan-apply` intentionally remains prose-scoped for now: the `codex-` name prefix and refusal cases keep the compatibility bridge legible without changing existing install surfaces.
- **"Just avoid Codex plan mode and write files directly."** Rejected — that throws away the structured pick-list interview, which is the single best planning UX Belmont has on any tool.
- **"Write the files from inside plan mode."** Rejected — direct writes are the thing that's unreliable/unavailable in Codex plan mode; that's the constraint this whole path routes around.
- **"Have `codex-plan-apply` fix up or normalise the content as it writes."** Rejected — it must apply verbatim. Any normalisation is a planning decision and belongs in `product-plan` / `tech-plan` before the packet is emitted.

## Evidence

- Skill source: `skills/belmont/_src/codex-plan-apply.md` (applicator + refusal cases); the "Codex write handoff" sections in `_src/product-plan.md` and `_src/tech-plan.md` (emit conditions).
- Generated/committed plugin output: `plugin/skills/codex-plan-apply/SKILL.md` (regenerated via `generate-plugin.sh`; the generated `skills/belmont/codex-plan-apply/` is gitignored).
- Introduced by PR #19 ("Add Codex plan handoff apply skill", external contributor). Originally shipped as `plan-apply`; renamed to `codex-plan-apply` so the tool scope is legible at the shared install surface absent any mechanical gating.

## Revisions

- 2026-06-09 — created when landing PR #19; renamed the skill `plan-apply` → `codex-plan-apply` and recorded the prose-only (un-gated) Codex scoping as a known interim.
- 2026-08-12 — noted that Belmont now has a selected-tool visibility hook for conditional interactive-loop skills, but `codex-plan-apply` remains prose-scoped by design.
