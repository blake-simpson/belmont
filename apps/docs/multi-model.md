# Multi-model tiers

Covers §7 (config) + §9 (resolver) of the master plan.

## The shape

`.belmont/models.json` (JSON, not TS — universal across runtime
boundaries):

```jsonc
{
  "tiers": {
    "low":    { "provider": "ollama",    "model": "qwen3:8b" },
    "medium": { "provider": "codex",     "model": "gpt-4.1-mini" },
    "high":   { "provider": "anthropic", "model": "claude-sonnet-4-6" }
  },
  "agents": {
    "implementation": "high",
    "verification":   "high",
    "planning":       "medium",
    "status":         "low"
  },
  "features": {
    "rtk":             true,
    "thinkingCollapse": true,
    "leanCtx":          false
  },
  "ctx_thresholds": {
    "green":  0,
    "yellow": 80000,
    "red":   120000
  },
  "providers": {
    "codex":   { /* provider-specific config */ },
    "kimi":    { /* ... */ },
    "ollama":  { /* ... */ }
  }
}
```

The schema is **locked at v1**. New top-level fields are a v1.1+
concern (per §16 risk #6 mitigation).

## Tiers

Three named slots: `low`, `medium`, `high`. Each maps to a
`{ provider, model }` pair. The names are deliberately fuzzy —
"high" is not "best model that exists"; it's "the model this user
wants to use for high-stakes work." A free-tier project might map
high→gpt-4.1-mini and low→qwen3:8b; a paid-tier project might map
high→claude-opus-4-7. The harness doesn't judge; it routes.

## Agents → tiers

The `agents` map binds roles to tiers. Belmont ships with four
role slots: `implementation`, `verification`, `planning`, `status`.
A custom config can omit any of them — unbound roles fall through
to the configured `default` (or a sensible fallback if no default).

## Per-milestone overlays

A `### Mx` heading in PROGRESS.md can carry an HTML-comment overlay:

```markdown
### M2: TUI panel
<!-- belmont:models implementation=high+anthropic/claude-sonnet-4-6 verification=high -->

- [ ] P0-1 Side panel scaffold
- [ ] P0-2 Hotkey bindings
```

The grammar (parsed by `@belmont/knowledge-schema/parseMilestoneOverlay`):

- `<key>=<tier>` — re-bind a role to a tier.
- `<key>=<tier>+<provider>/<model>` — re-bind AND pin a concrete
  model for this milestone only.
- Unknown keys fall through and surface as PROGRESS.md warnings
  from `belmont validate`.

The overlay only applies during the named milestone. M3's auto loop
sees only M3's overlay. The grammar tokenizes via golden fixtures
(M2 P0-5) so format drift fails fast.

## 4-layer resolver

When the auto loop picks a model for a task, four layers are checked
in priority order (per §7.4):

1. **CLI override** — `/belmont:auto M2 --tier implementation=high+anthropic/claude-opus-4-7` (highest priority; per-run).
2. **Per-milestone overlay** — the HTML comment on the milestone heading.
3. **Project default** — `models.json#agents` + `models.json#tiers`.
4. **Tier base** — provider's "obvious default" if all else missing
   (e.g. ollama → llama3.1; anthropic → claude-sonnet-4-6).

Layer 4 is a backstop; in practice every project has layer 3
configured.

## `/belmont:models doctor`

```
> /belmont:models doctor
```

Output:

```
implementation → high → anthropic/claude-sonnet-4-6  (reachable)
verification   → high → anthropic/claude-sonnet-4-6  (reachable)
planning       → medium → codex/gpt-4.1-mini         (reachable)
status         → low  → ollama/qwen3:8b              (unreachable: connect refused)

OK: 3 / 4 tiers reachable.
```

With `--milestone M2`, the doctor includes the overlay diff:

```
[overlay M2] implementation → anthropic/claude-sonnet-4-6 (pinned)
```

## Reachability check

Per §9.5, the doctor probes each configured provider's auth surface
plus a minimal "hello" request. The `AuthStorage` re-export in
`src/pi/sdk.ts` is the entry point. Results:

- **reachable** — auth resolves AND the hello round-trip succeeds.
- **unauthenticated** — auth resolves to "no credential."
- **unreachable** — network error / 5xx / timeout.
- **misconfigured** — provider missing entirely from `providers` or
  unknown model name.

`belmont init` ends with the doctor and exits non-zero if ZERO tiers
are reachable (§7.6).

## RTK + thinking-collapse + lean-ctx — `features`

Three optimization features toggleable per project:

- **`rtk`** — when on, the `user_bash` hook prepends `rtk ` to every
  user-issued bash command. 60–90% token savings on bash-heavy
  workflows. Default ON; opt out via `BELMONT_RTK_DISABLE=1` or
  `models.json#features.rtk: false`. See M9 episodic for the wiring.
- **`thinkingCollapse`** — when on, AssistantMessage thinking blocks
  in the context window are blanked from the in-context prompt
  (preserving `thinkingSignature` for multi-turn continuity). Toggleable
  in-session with `Alt+T`. Saves significant tokens on long sessions.
- **`leanCtx`** — placeholder for the v1.1 `pi-lean-ctx` integration
  (deferred per M9 episodic; the package's 3.6.21 pivot to a CLI-first
  shell-routing surface conflicts with M9's RTK wiring).

## Ctx-weight thresholds

`models.json#ctx_thresholds` configures the status-bar weight chip
boundaries:

- 🟢 below `green` (default 0)
- 🟡 between `yellow` (default 80k) and `red`
- 🔴 above `red` (default 120k)

Per the resolved tension in Appendix §20: these defaults are Blake's
preference (Q7 confirmation). Override per-project as needed.

## Read next

- [auto-mode.md](./auto-mode.md) — how tiers resolve at each
  sub-session boundary.
- [troubleshooting.md](./troubleshooting.md) — what the doctor
  output means when tiers are unreachable.
