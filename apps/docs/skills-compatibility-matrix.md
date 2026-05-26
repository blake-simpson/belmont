# Skills compatibility matrix (M4 P1)

The 8 Belmont skills (`working-backwards`, `plan`, `next`, `implement`,
`verify`, `status`, `prototype`, `debug`) ship as standalone-installable
SKILL.md bodies plus an in-process invocation path inside the Belmont
harness. This document records what works where.

This is a P1 living doc — amend in place as host-CLI behavior changes.

## Hosts covered

| Host | Discovery target | Belmont tools available? |
|---|---|---|
| Belmont harness (`belmont` → pi 0.75.5 + Belmont extension) | in-process (bundled) | Yes — `belmont_transition`, `belmont_ask_user`, `belmont_episode_event` (full set lands M5). |
| Claude Code CLI | `~/.claude/skills/belmont/<slug>/` | No — bodies fall back to `Edit` on `PROGRESS.md`. |
| Codex CLI | `~/.agents/skills/belmont/<slug>/` (also `~/.codex/skills/belmont/<slug>/` per Codex version) | No — bodies fall back to `Edit`. |
| Cursor | `~/.agents/skills/belmont/<slug>/` (Cursor reads agentskills.io discovery dirs) | No — bodies fall back to `Edit`. |
| Vanilla pi (no Belmont extension) | `~/.agents/skills/belmont/<slug>/` | No — bodies fall back to `Edit`. |

Default standalone install target: `~/.agents/skills/belmont/`. Override
with `belmont-skills install --target <path>`.

## Per-skill capabilities by host

| Skill | Harness | Claude Code | Codex CLI | Cursor | Vanilla pi |
|---|---|---|---|---|---|
| `working-backwards` | Full — sub-agents for research, BELMONT.md write | Full — Task tool spawns research, Edit writes BELMONT.md | Full — Codex sub-agents, fs writes | Full — Cursor's Composer + fs writes | Limited — no built-in research sub-agent; falls back to manual user research |
| `plan` | Full — sub-agents + memory writes + `belmont_transition` for milestones | Full — Edit for PRD/PROGRESS, Task for research | Full | Full | Limited |
| `next` | Full — deterministic read-only render | Full — Read + format | Full | Full | Full |
| `implement` | Full — `belmont_transition` for marker flip, source edits | Full — Edit for source + PROGRESS | Full | Full | Full |
| `verify` | Full — `belmont_transition` for [x]→[v], fold-step writes | Full — Edit for everything | Full | Full | Full |
| `status` | **Native deterministic renderer** (commands/status.ts); SKILL.md body is the standalone-only fallback | Full via SKILL.md | Full | Full | Full |
| `prototype` | Full — runs `belmont-prototype/` outside the working tree, writes ADR on exit | Full | Full | Full | Full |
| `debug` (auto + manual modes) | Full — both modes; manual-mode spec reconcile uses `belmont_ask_user` for diff approval (M5) | Full — manual-mode falls back to plain user prompts for diff approval | Full | Full | Full |

## Fallback behavior in standalone hosts

The `_shared/harness-optional.md` partial (inlined at compose time into
every materialized SKILL.md) tells the LLM that `belmont_transition` is
absent and that `Edit` on `.belmont/PROGRESS.md` is the substitute. The
canonical marker grammar (`[ ]` / `[>]` / `[x]` / `[v]` / `[!]`) survives
the substitution byte-for-byte.

The host-CLI's own tool set (Edit, Read, Bash, Glob, Grep, Task) carries
the rest of the work. Standalone hosts that lack a Task-equivalent (some
vanilla-pi configurations) downgrade research-driven skills
(`working-backwards`, `plan`) to manual-research mode — the SKILL.md
body recognizes this and continues with whatever the host provides.

## Install discovery rules (where each host looks)

- Claude Code: `~/.claude/skills/<plugin>/<slug>/SKILL.md`. Install with
  `belmont-skills install --target ~/.claude/skills/belmont/`.
- Codex CLI + Cursor + vanilla pi: agentskills.io convention,
  `~/.agents/skills/<plugin>/<slug>/SKILL.md`. This is the default
  `belmont-skills install` target.
- Belmont harness: skills are read from the bundled `@belmont/skills`
  source at runtime; no filesystem install needed.

## CI gates that protect this matrix

- `packages/skills/test/ci-gates.test.ts` enforces:
  1. ≤250 LOC per canonical SKILL.md.
  2. `name: <slug>` frontmatter matches directory basename.
  3. `<!-- @include _shared/harness-optional.md -->` present in every
     SKILL.md.
  4. The §10.5 grep blocklist — no harness-only constructs (`ctx.ui`,
     `createAgentSession`, `registerTool`, `registerCommand`,
     "belmont_transition is required", "must use belmont_transition",
     `@belmont/harness`) leak into the skill bodies.
- `packages/skills/test/compose.test.ts` enforces:
  1. `@include _shared/<file>.md` expands verbatim.
  2. Frontmatter-name validation rejects mismatches.
  3. Content-hash idempotence — re-running `compose()` writes nothing.
  4. References are copied alongside each skill in the install target.

The M11 runtime fixture (`codex exec --no-tools` round-trip on a fresh
project) is the standalone-ship gate and lives outside this matrix.

## Open questions

- Should `belmont-skills install` also drop a top-level `INDEX.md` /
  `README.md` in the target? Currently it does not — every host's
  discovery rule looks for `<slug>/SKILL.md` directly. Revisit if a
  host requires the index file for cross-skill links.
- The harness-side `belmont:status` skill body is shipped to standalone
  installers even though the harness path uses the deterministic
  renderer. That is deliberate — the standalone body is the contract
  for non-harness hosts.
