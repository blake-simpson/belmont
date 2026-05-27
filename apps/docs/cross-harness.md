# Cross-harness skills

How Belmont's 8 skills travel to Claude Code, Codex CLI, Cursor, and
vanilla pi. Covers D-9 + §10.4.

## D-9: copy, not symlink

The locked decision (D-9): cross-harness skill discovery via
`~/.agents/skills/belmont/<slug>/`, with COPIES — not symlinks.

Reasons:

- **Windows portability.** Symlinks need elevated permissions on
  Windows; copies work uniformly across macOS / Linux / Windows
  (Windows is a v1.1 target but the decision was made to not paint
  into a corner).
- **CI / sandbox friendliness.** Container builds with
  `COPY --link` or rootless setups handle symlinks inconsistently.
  Copies always work.
- **Content-hashed idempotence.** The composer skips writes when the
  content hash matches — re-running install on a clean tree is
  literally zero file writes. Symlinks couldn't give us that.

The cost: a small amount of disk per skill (each SKILL.md is
≤250 lines + a handful of references). Worth it for the simplicity.

## One materializer, two paths

Per the resolved tension in Appendix §20: both `belmont install`
(the harness CLI subcommand) AND `npx @belmont/skills install`
(the no-binary path) call the SAME `compose()` function in
`packages/skills/src/compose.ts`. No drift between the two.

Paths:

```bash
# Harness path
belmont install
  ↓ packages/cli/src/install.ts → materializeBelmontSkills() in harness
  ↓ harness/src/cli/install-helpers.ts → @belmont/skills compose()
  ↓ writes to ~/.agents/skills/belmont/<slug>/SKILL.md

# Standalone path
npx @belmont/skills install --target <path>
  ↓ packages/skills/bin/belmont-skills (the bin entry)
  ↓ packages/skills/src/installer.ts runCli()
  ↓ @belmont/skills compose()
  ↓ writes to <path>/<slug>/SKILL.md
```

## Per-host discovery paths

| Host | Default discovery path | Override syntax |
|---|---|---|
| **Belmont harness** | in-process bundle (no FS materialization needed for harness use) | n/a |
| **Claude Code CLI** | `~/.claude/skills/belmont-<slug>/` | `npx @belmont/skills install --target ~/.claude/skills/` |
| **Codex CLI (current)** | `~/.agents/skills/belmont-<slug>/` | default works |
| **Codex CLI (older)** | `~/.codex/skills/belmont-<slug>/` | `npx @belmont/skills install --target ~/.codex/skills/` |
| **Cursor** | `~/.agents/skills/belmont-<slug>/` | default works (Cursor reads agentskills.io discovery dirs) |
| **Vanilla pi (no Belmont extension)** | `~/.agents/skills/belmont-<slug>/` | default works |

The DEFAULT default — `~/.agents/skills/` with `belmont-` prefix —
covers Codex current + Cursor + vanilla pi in one shot. Claude Code
is the notable outlier; it reads `~/.claude/skills/`.

### Why the `belmont-` prefix (D-004)

The original D-9 design (`~/.agents/skills/belmont/<slug>/` with bare
slug names) ran into a pi 0.75.5 auto-discovery collision: pi sweeps
the agentskills root recursively and registers every SKILL.md by its
frontmatter `name:` value. The bare names (`prototype`, `plan`,
`debug`, …) collide with any third-party skill of the same name
published directly at `~/.agents/skills/<slug>/`. Belmont remapped
to flat `~/.agents/skills/` with the `belmont-` prefix on dir AND
frontmatter — the canonical agentskills.io vendor-namespacing
convention. See `.belmont/memory/decisions/D-004-cross-harness-skill-namespace.md`.

## What "no harness" means for skill capability

When skills run inside the Belmont harness, the `belmont_transition`
/ `belmont_episode_event` / `belmont_ask_user` tools exist. Skill
bodies probe for them and call them.

When skills run in vanilla Claude Code / Codex / Cursor / pi, those
tools DON'T exist. Each skill body MUST detect this and fall back:

- `belmont_transition` → fallback to `Edit` against
  `.belmont/PROGRESS.md`, byte-faithful marker flips
  (`[ ] [>] [x] [v] [!]`).
- `belmont_episode_event` → fallback to `Edit` against
  `.belmont/memory/episodic/<date>-<slug>.md`, appending a bullet.
- `belmont_ask_user` → fallback to plain prompt text "Please answer:
  ..." and proceed on the user's reply.

The `_shared/harness-optional.md` partial (inlined into every skill
body via `<!-- @include _shared/harness-optional.md -->`) carries
the canonical fallback language. CI grep blocklist (M4 P0-4) fails
the build if a skill body references `ctx.ui`, `pi.registerCommand`,
or any other harness-only construct outside the
`_shared/harness-optional.md` partial.

## Capability table

Compact view (see `skills-compatibility-matrix.md` for the full
per-skill grid):

| Capability | Harness | Claude Code | Codex CLI | Cursor | Vanilla pi |
|---|---|---|---|---|---|
| `belmont_transition` tool | ✅ | fallback `Edit` | fallback `Edit` | fallback `Edit` | fallback `Edit` |
| `belmont_episode_event` tool | ✅ | fallback `Edit` | fallback `Edit` | fallback `Edit` | fallback `Edit` |
| `belmont_ask_user` tool | ✅ | plain prompt | plain prompt | plain prompt | plain prompt |
| `ctx.ui.custom` side panel | ✅ | n/a | n/a | n/a | n/a |
| Tier overlay routing | ✅ | n/a | n/a | n/a | n/a |
| Sub-agent spawning | ✅ (auto loop) | Task tool | Codex sub-agents | Composer flow | none |
| File reads | ✅ | ✅ | ✅ | ✅ | ✅ |
| File writes | ✅ | ✅ | ✅ | ✅ | ✅ |

## Why ship the harness AND standalone skills?

- **Harness users** get the full Belmont experience: tiering, auto
  loop, side panel, knowledge-guard, episodic auto-append.
- **Standalone-skill users** get a meaningful subset: the
  natural-language workflow (working-backwards → plan → next →
  implement → verify) lands the same `.belmont/` shape that a
  harness user would produce. They lose the auto-loop and the
  in-process tools, but they get a working PRD/PROGRESS/episodic
  tree they can hand to a harness user later.

The shared materializer means a project's skill bodies are
identical regardless of how they got installed. No drift.

## The "ship in any agentskills.io CLI" promise

Standalone install puts SKILL.md bodies in the agentskills.io-style
discovery dir. Anything reading that convention (most modern AI
coding harnesses) picks them up automatically. Belmont participates
in the broader ecosystem without forcing users into Belmont's
specific runtime.

## Read next

- [standalone-skills.md](./standalone-skills.md) — the 8 skills,
  the 250-LOC cap, the CI grep blocklist.
- [skills-compatibility-matrix.md](./skills-compatibility-matrix.md)
  — the M4 living doc on per-skill / per-host detail.
