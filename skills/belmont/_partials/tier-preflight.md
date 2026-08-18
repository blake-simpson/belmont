### Model Tier Preflight (non-Claude CLIs)

Non-Claude CLIs (Codex, Gemini, Cursor, Copilot, Pi, opencode) run the skill at whichever model the session was started with — none of them exposes a per-dispatch model override. (opencode can dispatch sub-agents, but its `task` tool carries no model parameter; the rest run everything in one top-level session.) Before doing any heavy work, compare the **required tier** for the current skill to the **session's current model** and surface a warning if they diverge. Do NOT block execution; let the user decide.

**Workflow at start-of-skill (non-Claude only)**:

1. **Read** `.belmont/features/<slug>/models.yaml`. If absent, skip this preflight (defaults apply).
2. **Determine the required tier for this skill**:
   - `implement` → `tiers.implementation`
   - `verify` → `tiers.verification`
   - `code-review` (if applicable) → `tiers.code-review`
   - `debug-manual` → `tiers.implementation` (the fix itself dispatches the implementation agent; spec reconciliation runs in the orchestrator session at the same model on non-Claude CLIs)
   - others → skip preflight unless the skill specifies its own tier.
3. **Map the required tier to a model ID for the current CLI** using `tier-registry.md`. Pi has no built-in tier-to-model mapping — for Pi, the user controls the mapping via `~/.belmont/local-llms.json`. If that file is absent, skip the preflight (Pi will use whatever model `~/.pi/agent/models.json` defaults to).
4. **Compare to the session's current model**:
   - Codex: run `/model` or check session settings.
   - Gemini: check `/model`.
   - Cursor: check `/model`.
   - Copilot: check `/model`.
   - Pi: Pi has no in-session model swap. Check the model the session was started with (visible in Pi's TUI footer, or the `--model` flag the user passed when launching `pi`).
   - opencode: check the model shown in the TUI status area, or run `/models` to see the current selection.
5. **If they diverge**, print this warning block before doing any further work:

   ```
   ⚠ Model tier mismatch
   models.yaml says this phase should run at <tier> (<expected-model-id>).
   Your session is currently on <current-model-id>.
   To honor the tier, restart with: <cli> --model <expected-model-id>
   Continuing with the current model. Re-dispatching sub-agents with a
   different model is not supported on this CLI.
   ```

   For Pi the restart command takes the form `pi --provider <provider> --model <expected-model-id>`, where `<provider>` matches an entry in the user's `~/.pi/agent/models.json`. For opencode the expected model ID is a `provider/model` token (e.g. `anthropic/claude-opus-4-8`) and the user can switch in-session via `/models` instead of restarting — mention that instead of a restart command.

6. **Proceed with the skill**. The warning is informational; it never blocks execution.

**Why this is acceptable graceful degradation**: the user chose this CLI knowing it doesn't support per-agent dispatch. The warning gives them a one-command fix if they want tier adherence; otherwise the work proceeds at the session's model. Only Claude Code supports true per-agent overrides — see `dispatch-strategy.md` Model Tier Overrides for that path.
