---
schema: belmont.adr.v1
id: D-004-cross-harness-skill-namespace
topic: cross-harness-skills
status: accepted
updated_at: 2026-05-27
supersedes: null
---

# D-004: Cross-harness skill install path uses `belmont-` prefix on flat `~/.agents/skills/`

## Why this matters

The §17 M11 §18 ship-gate dogfood surfaced a pi 0.75.5 skill-discovery
conflict. The planning doc's D-9 ("cross-harness skill discovery via
`~/.agents/skills/belmont/` (copy, not symlink)") put Belmont's 8 skills
in a `belmont/` subdirectory and named each by its bare slug
(`plan`, `prototype`, `verify`, …). Pi auto-discovers every SKILL.md
under `~/.agents/skills/` recursively and registers each by its
frontmatter `name:` value. The bare slug names collide with vanilla
third-party skills that publish the same names directly at
`~/.agents/skills/<slug>/`. Blake hit this with a `prototype` collision
the moment he ran `belmont` cold against an install populated by an
earlier `belmont install`.

Pi reports the collision and picks the path that registered first.
Even when Belmont's wins, the warning is loud, and the user-facing
mental model breaks down: "is `/prototype` Belmont's prototype skill
or the third-party one?"

The fix has to ship before v1.0.0 because the collision surfaces in
the §18 author smoke — the FIRST thing a user sees on cold start.

## Decision

**Cross-harness skill install path is `~/.agents/skills/` (flat root)
with the `belmont-` prefix prepended to every materialized directory
AND to the frontmatter `name:` field.**

Concretely, after `belmont install` (or `npx @belmont/skills install`):

```
~/.agents/skills/belmont-working-backwards/SKILL.md
~/.agents/skills/belmont-plan/SKILL.md
~/.agents/skills/belmont-next/SKILL.md
~/.agents/skills/belmont-implement/SKILL.md
~/.agents/skills/belmont-verify/SKILL.md
~/.agents/skills/belmont-status/SKILL.md
~/.agents/skills/belmont-prototype/SKILL.md
~/.agents/skills/belmont-debug/SKILL.md
```

Each SKILL.md's frontmatter `name:` is rewritten at compose time:
`name: plan` → `name: belmont-plan`, etc. The canonical sources at
`packages/skills/src/<slug>/SKILL.md` keep their bare slug names —
the prefix is applied only at install time via the composer's
new `namespacePrefix` option.

In-harness use (Belmont's own `pi.registerCommand("belmont:<slug>",
…)` path) does NOT set the prefix. The harness slash commands stay
at `/belmont:plan`, `/belmont:prototype`, etc. — that namespace was
already in place via the command registration name, separate from
the cross-harness discovery layer.

## Rationale

1. **Flat layout with prefix is the canonical agentskills.io shape.**
   Other namespaced toolkits publish as `<vendor>-<skill>/` in the
   flat root (e.g. `claude-search/`, `cursor-edit/`). Belmont follows
   the same convention; users see Belmont skills next to third-party
   skills without name-space surprises.

2. **No collision possible by construction.** A vanilla `prototype/`
   skill at the top of `~/.agents/skills/` registers as `prototype`;
   Belmont's `belmont-prototype/` registers as `belmont-prototype`.
   Different names; no conflict.

3. **Single-source canonical layout is preserved.** Canonical sources
   stay at `packages/skills/src/<slug>/SKILL.md` with `name: <slug>`.
   The harness's in-process use reads them directly. The cross-harness
   materializer adds the prefix at write time. No fork, no duplicate
   sources, no drift.

4. **Idempotence preserved.** The composer's content-hash check still
   works — the materialized bytes (post-prefix-rewrite) are stable;
   a second `belmont install` writes zero files when nothing changed
   in the canonical source.

5. **Backwards-incompatible for any v0-era user.** Belmont v1.0 is a
   fresh cut (no v0 cross-harness installs exist). The new layout
   lands clean; no migration path needed.

## Don't re-do

- The original D-9 design (`~/.agents/skills/belmont/<slug>/` with
  bare slug names). It composes acceptably in pure-Belmont
  environments and breaks in any environment with a competing
  vanilla skill of the same name.
- Per-host overrides ("Codex uses `~/.codex/skills/codex-belmont-<slug>/`
  but Cursor uses…"). The prefix is constant across hosts; per-host
  target paths remain a `--target <path>` flag.
- Renaming the canonical sources to `packages/skills/src/belmont-<slug>/`.
  That would force the harness's in-process registrations to use the
  prefixed name AND change every test that references the bare slug.
  The compose-time rewrite is surgical.

## Consequences

- `packages/skills/src/compose.ts` gains a `namespacePrefix` option
  on `ComposeOptions`. When set, the target dir and the frontmatter
  `name:` field both get the prefix. Default `""` (M4 behaviour).
- `packages/harness/src/cli/install-helpers.ts` `defaultSkillsTarget()`
  changes from `~/.agents/skills/belmont/` to `~/.agents/skills/`
  (flat). `materializeBelmontSkills()` always passes
  `namespacePrefix: "belmont-"`.
- `packages/skills/src/installer.ts` (`npx @belmont/skills install`)
  defaults to the same prefix. `--no-prefix` opts out; `--prefix
  <value>` overrides.
- Any existing `~/.agents/skills/belmont/` from earlier v1.0-rc
  installs is now stale; Belmont does NOT auto-clean it. Users who
  ran `belmont install` against an earlier rc should `rm -rf
  ~/.agents/skills/belmont/` after upgrading. Documented in CHANGELOG.
- `apps/docs/standalone-skills.md` and `apps/docs/cross-harness.md`
  are amended with the new path + the historical note.
- This ADR supersedes the planning-doc-level D-9 (which never had a
  separate ADR file). The amendment lives here.

## Revisions

- 2026-05-27 — Created during M11 §18 fix pass.
