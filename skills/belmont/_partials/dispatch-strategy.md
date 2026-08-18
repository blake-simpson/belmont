### Core Principle

You are the **orchestrator**. You MUST NOT perform the agent work yourself. Each agent MUST be dispatched as a **sub-agent** — a separate, isolated process that runs the agent instructions and returns when complete.

**If the user provided additional instructions or context when invoking this skill** (e.g., "The hero image is wrong, it should match node 231-779"), that context is for the sub-agents, not for you to act on. Your only job is to forward it. See "User Context Forwarding" below.

### Choosing Your Dispatch Method

Use the **first** approach below whose required tool is available to you. Check your available tools **by name** — do not guess or skip ahead.

Then **state which approach you selected, in one line, before you dispatch anything** — e.g. `Dispatching via Approach A (Agent).` This costs one line and it is the only thing that makes a wrong selection visible: if you silently fall back, nobody can tell the difference between "this CLI cannot dispatch" and "the check was wrong".

**Running this skill is the request to dispatch.** Some sessions carry a standing rule not to call the dispatch tool unless the user asked for it. That condition is met here: this skill only ever runs because someone invoked it — directly, or through `belmont auto` / `belmont reverify` / a loop they started — and the skill they invoked is defined as delegation rather than as doing the work yourself. The prompt in front of you *is* that request, relayed through Belmont; under `belmont auto` on Claude Code it arrives as a literal `/belmont:<skill>` slash command.

So when you choose, the question is whether a dispatch tool is **present**, not whether you are permitted to use one. Never take the inline fallback because dispatching felt unrequested.

A dispatch call that *fails* is not the same as having no tool. If one is refused by the permission system, or rejected because this CLI names its sub-agents differently from the example below, say what happened and then fall back — the fallback stays open to you. One exception: if a **user** declined the call, stop and ask. Do not perform the declined work inline instead.

#### Approach A: Parallel Sub-Agent Dispatch (preferred)

**Required tool**: `Agent` — or `Task`, which is the same tool under its older name on earlier Claude Code versions — or, on opencode, `task`, its own dispatch tool with the same call shape. **Any one alone is enough.** If more than one appears in your tool list, use `Agent`.

If you have one of them, you MUST use this approach:

1. **For agents that run in parallel**, issue all dispatch calls **in the same message** (i.e., as parallel tool calls). Every call passes:
   - `subagent_type`: **the host CLI's name for its full-access general agent — the name is per-CLI, and a wrong one hard-fails the call.** On Claude Code it is `"general-purpose"`. On opencode it is `"general"` — passing `"general-purpose"` there fails with `Unknown agent type: general-purpose is not a valid agent type`. All belmont agents need full tool access including file editing and bash, which is what these general agents carry.
   - `description`: the agent role, e.g. `"codebase-agent"` / `"verification-agent"`
   - `prompt`: the sub-agent prompt given below, verbatim
   - `model`: only for agents that have a tier in `models.yaml`, and only on Claude Code — opencode's `task` has no model parameter, so a tier cannot ride a dispatch there. See "Model Tier Overrides" below
   - Do **NOT** set `run_in_background: true` — foreground calls return their results to you directly; a background one must be polled for, and the polling is fragile and can lose contact with the sub-agent.
   - Do **NOT** pass `mode:` or `team_name:`. Both are deprecated and ignored. A sub-agent inherits the session's permission mode, which under `belmont auto` is already `bypassPermissions` — the CLI passes `--permission-mode bypassPermissions` to the tool it shells out to.
2. Because all calls are foreground, you **automatically block** until they complete and **receive their output directly** — no polling, no sleeping.
3. **For agents that run sequentially** (after the parallel ones complete), issue a single dispatch call with the same parameters.

**No teardown is required.** Sub-agents are per-call — nothing outlives the call, so there is nothing to shut down afterwards. This is about dispatch only: a skill's own cleanup step (archiving MILESTONE, deleting DEBUG.md) still runs.

#### Approach B: Sequential Inline Execution (fallback)

Reach this when **none** of the dispatch tools named above is present — several supported CLIs genuinely have no sub-agent dispatch — or when a dispatch call failed and you have said so. Never reach it because dispatching felt unrequested. Then:

1. For each agent, read its agent file (e.g. `.agents/belmont/<agent-name>.md`)
2. Execute its instructions fully within your own context
3. Complete all output before moving to the next agent
4. Do NOT blend agent work together — finish one completely before starting the next

Say plainly that you are taking this path, and why. It costs the two things dispatch exists for: every phase runs inside your own context rather than an isolated one, and the per-agent model tiers in `models.yaml` cannot be applied at all, because there is no dispatch call to carry `model:`.

### Model Tier Overrides (Claude Code only)

Belmont agent files pin no model — a dispatched sub-agent therefore **inherits the session model** by default (the same model the orchestrator is running on). Under Approach A you set the model per-dispatch via the dispatch tool's `model:` parameter, driven by `models.yaml` — this takes precedence over the inherited session model.

**When to pass `model:`**: read `.belmont/features/<slug>/models.yaml` at start-of-skill (if it exists) and translate each agent's tier into the appropriate model alias for this session:

- `low` → `haiku`
- `medium` → `sonnet`
- `high` → `opus`

Then include `model: "<alias>"` in the dispatch call for each agent whose tier appears in `models.yaml`. Agents not listed in `models.yaml` inherit the session model — do NOT pass `model:` for those.

Example (Approach A):
```
Agent(description: "implementation-agent", subagent_type: "general-purpose",
      model: "opus",  // from models.yaml: tiers.implementation = high
      prompt: "...")
```

**If `models.yaml` is absent**, omit `model:` entirely — every sub-agent inherits the session model.

**Under Approach B the tiers cannot be honoured**, since there is no dispatch call to put `model:` on. Nothing else reports that — `models.yaml` has no runtime validation — so if you fall back, say so.

**Non-Claude CLIs** (Codex, Gemini, Cursor, Copilot, Pi, opencode): Belmont does not drive a per-dispatch `model:` override on these — opencode dispatches sub-agents, but its `task` tool carries no model parameter (a sub-agent runs at its agent config's pinned model or inherits the session's), and the rest have no dispatch tool at all — so mid-session model override is not available. Use the preflight partial (`tier-preflight.md`) instead, which surfaces a warning if the session model doesn't match the tier the skill expects. Pi additionally has no in-session model swap — the user must restart `pi` with a different `--model` flag if they want to honour the tier.

### User Context Forwarding (CRITICAL)

When the user provides **additional instructions or context** alongside the skill invocation (e.g., `/belmont:verify The hero image is wrong...`), you MUST:

1. **Capture** the user's additional context verbatim
2. **Include it in every sub-agent prompt** as an "Additional Context from User" section
3. **DO NOT act on it yourself** — your job is to pass it through, not to do the work

Format for including user context in sub-agent prompts:
```
> **Additional Context from User**:
> [paste the user's additional instructions/context here verbatim]
```

Append this block to the end of each sub-agent's prompt, after the standard prompt content. If the user provided no additional context, omit this block entirely.

**Why this matters**: The orchestrator seeing actionable instructions (e.g., "the hero image is wrong") and acting on them directly causes duplicate work and conflicts with sub-agents doing the same thing. The orchestrator's role is delegation, not execution.

### Dispatch Rules (apply to ALL approaches)

1. **DO NOT** read `.agents/belmont/*-agent.md` files yourself (unless using Approach B) — the sub-agents read them
2. **DO NOT** perform the sub-agents' work yourself — sub-agents do this
3. **DO** prepare all required context before spawning any sub-agent
4. **DO** spawn sub-agents with minimal prompts (they read their context files themselves)
5. **DO** wait for sub-agents to complete before proceeding to the next step
6. **DO** handle blockers and errors reported by sub-agents
7. **DO** include the full sub-agent preamble (identity + mandatory agent file) in every sub-agent prompt
8. **DO** forward any user-provided context to every sub-agent (see "User Context Forwarding" above)
