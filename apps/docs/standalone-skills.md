# Standalone skills

The 8 canonical Belmont skills, shipped as standalone-installable
SKILL.md bodies. Covers §10 of the master plan.

## The 8

The list and order are locked (per Appendix §20 resolved tension):

1. **working-backwards** — PR/FAQ generator. Skill #1 on new projects (D-11).
2. **plan** — milestone + task expansion; PRD writes.
3. **next** — read-only "what to do right now."
4. **implement** — drive a single task to `[v]`.
5. **verify** — evidence collection + subsystem-memory fold.
6. **status** — read-only milestone tree render.
7. **prototype** — throwaway prototype for design exploration.
8. **debug** — focused diagnose loop.

`init` is intentionally NOT a skill — it's CLI scaffolding (`belmont
init`). Per the same resolution, `next`, `debug`, and
`working-backwards` are load-bearing.

## SKILL.md bodies

Each skill is `packages/skills/src/<slug>/SKILL.md` — markdown with
YAML frontmatter:

```yaml
---
name: plan
description: One-paragraph trigger for when this skill should activate.
license: MIT
---

# Plan

(skill body — natural-language instructions for the agent)
```

Body bodies are capped at **≤250 lines**. The CI gate at M4 P0-4
fails the build if a body grows past that. The cap forces precision:
"longer is not better" is the working principle.

## Composer + `@include`

Each skill's body may include shared partials:

```markdown
<!-- @include _shared/harness-optional.md -->
```

At install time, the composer (`packages/skills/src/compose.ts`)
inlines the partial verbatim. The ONE directive is
`<!-- @include _shared/<file>.md -->`; nothing else is expanded.

Composer responsibilities:

1. Parse YAML frontmatter via `@belmont/knowledge-schema`.
2. Assert `frontmatter.name === <directory basename>` (catches
   rename bugs).
3. Walk the body line-by-line; replace `@include` lines with the
   partial content. Missing partials surface as `PARTIAL_MISSING`
   errors.
4. Hash the composed output (sha256); write only if the existing
   target file's hash differs. Idempotent.
5. Copy each `references/<file>.md` referenced anywhere in the
   skill body into `<target>/<slug>/references/`.

## Standalone install

```bash
npx @belmont/skills install
```

Default target: `~/.agents/skills/` (flat root) with the `belmont-`
prefix on each materialized dir AND the frontmatter `name:` field
rewritten to match. The layout post-install is:

```
~/.agents/skills/belmont-working-backwards/SKILL.md   # name: belmont-working-backwards
~/.agents/skills/belmont-plan/SKILL.md                # name: belmont-plan
~/.agents/skills/belmont-next/SKILL.md                # name: belmont-next
~/.agents/skills/belmont-implement/SKILL.md           # name: belmont-implement
~/.agents/skills/belmont-verify/SKILL.md              # name: belmont-verify
~/.agents/skills/belmont-status/SKILL.md              # name: belmont-status
~/.agents/skills/belmont-prototype/SKILL.md           # name: belmont-prototype
~/.agents/skills/belmont-debug/SKILL.md               # name: belmont-debug
```

Per D-004, this avoids pi's auto-discovery sweep colliding with
vanilla third-party skills at `~/.agents/skills/<slug>/` of the same
name (e.g. a non-Belmont `prototype/` next to ours).

Override the target or prefix:

```bash
# Custom target dir.
npx @belmont/skills install --target ~/.claude/skills/

# Custom prefix.
npx @belmont/skills install --prefix acme-

# Opt out of the prefix (legacy M4 layout — rarely what you want).
npx @belmont/skills install --no-prefix
```

The same composer runs from `belmont install` (the harness CLI
subcommand) — one materializer, no drift between the two paths
(per the resolved tension in Appendix §20).

## The standalone contract

A skill body MUST run in vanilla Claude Code, Codex CLI, Cursor, and
pi-without-the-Belmont-extension. To make that real:

- **Probe for harness tools.** Skill bodies say:

  > "If `belmont_transition` is available, call it. Otherwise edit
  > `.belmont/PROGRESS.md` directly via `Edit` and update the marker
  > byte-for-byte using the legacy markers (`[ ] [>] [x] [v] [!]`)."

  The `_shared/harness-optional.md` partial carries the canonical
  language; every skill `@include`s it.

- **Probe for episodic event tool.** Same shape:
  `belmont_episode_event` → fallback to `Edit` against
  `.belmont/memory/episodic/<date>-<slug>.md`.

- **No `ctx.ui`, no pi types, no `pi.registerCommand` references** —
  CI grep blocklist (M4 P0-4) fails the build on first leak. Plus
  the runtime fixture at M11 (deferred) runs `codex exec
  --skip-git-repo-check` against the standalone-installed body to
  catch leaks the regex doesn't.

## Material vs canonical

- **Canonical sources** — `packages/skills/src/<slug>/SKILL.md`.
  Hand-edited; live in the source tree.
- **Materialized copies** — what landed in the target directory
  after `compose()` ran. Per content-hashed idempotence, re-running
  install writes 0 files when the canonical didn't change.

If a user edits a materialized copy by hand, the next
`belmont install` will overwrite it (content hash differs). The
fix is to amend the canonical source.

## How harness mode invokes them

Inside the harness, each skill is a registered slash command — see
`packages/harness/src/commands/skills.ts`. The command handler
reads the canonical SKILL.md body, runs the composer once at
session_start (to expand `@include`s), and `pi.sendUserMessage()`s
the resolved body as a follow-up user message. Pi then dispatches
it through the normal LLM agent loop.

The harness also wires the `belmont_transition` /
`belmont_episode_event` / `belmont_ask_user` tools at the same
session_start so skill bodies that probe for them succeed.

## Per-host availability

See [cross-harness.md](./cross-harness.md) and
[skills-compatibility-matrix.md](./skills-compatibility-matrix.md)
for the per-host capability table.

## Read next

- [cross-harness.md](./cross-harness.md) — D-9 + the
  materialization paths for non-Belmont hosts.
- [knowledge-model.md](./knowledge-model.md) — what `verify`
  writes when it folds evidence into subsystem memory.
