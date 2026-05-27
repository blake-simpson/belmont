# Changelog

All notable changes to Belmont. Format: each release lists the
milestones that landed, with one bullet per major deliverable. The
canonical per-milestone audit lives at
[`.belmont/memory/episodic/<date>-m*-*.md`](./.belmont/memory/episodic/).

## v1.0.0 — 2026-05-27

The v1.0 pi-native rebuild. Cut from `v0.10.7-final`; the legacy
v0.10.x Go binary architecture and the abandoned `feature/belmont-rework`
v1.0-experiment (with worktrees + parallel workers) are both
discarded. v1.0 ships as a pi extension via npm — no custom TUI, no
fork, no bun-compile binary, no parallel scheduler.

### M0 — Pi-package spike (2026-05-26)

Buy-or-port spikes against the pi ecosystem. Verdicts at
`spike/{pi-mcp-adapter,pi-lean-ctx,pi-web-access,omp}/VERDICT.md`. The
oh-my-pi evaluation was discharged by `D-001-omp-evaluation.md`. Three
v1.1 deferrals documented: pi-antigravity-rotator, @juicesharp probe,
adaptive-memory-multi-model-router.

### M1 — Workspace bootstrap (2026-05-26)

4-package pnpm monorepo: `@belmont/{knowledge-schema, skills, harness,
cli}` with the strict dep direction enforced by `dependency-cruiser`
+ the `test/pi-boundary.test.ts` AST scan (the B5 trust boundary).
GitHub Actions CI green from M1. `apps/docs/` placeholder seeded
(landed for real in M11).

### M2 — Knowledge schema (2026-05-26)

`PROGRESS.md` byte-faithful parser + the `applyTransition` state
machine (the load-bearing piece every other milestone keys off).
Frontmatter parser + validators for the 7 file kinds (entrypoint,
preferences, PRD, ADR, subsystem, episodic, constraint).
`validateProjectedKnowledgeWrite` with rejection-text + suggestion
generator (the §5.3 knowledge-cap UX). `parseMilestoneOverlay` token
grammar.

### M3 — Harness shell + boot doctor (2026-05-26)

`@belmont/cli` resolves the project root and execs pi with the
harness extension. `/belmont:init`, `/belmont:status`, and the boot
doctor (§7.6 contract — `belmont init` exits non-zero if zero tiers
reachable). BELMONT.md + preferences.md wired via `before_agent_start`
per D-003-pi-extension-shape.

### M4 — Skills + composer + standalone fixture (2026-05-26)

The 8 canonical skills (working-backwards, plan, next, implement,
verify, status, prototype, debug) — ≤250 lines each, CI grep blocklist
enforcing the standalone contract. Composer expands `@include` of
`_shared/*.md` partials at materialize time. `bin/belmont-skills`
standalone installer. Compatibility matrix doc.

### M5 — State machine + scope guards + preflight validate (2026-05-26)

`belmont_transition` tool wires the M2 state machine to the agent
surface. `tool_call` hook blocks direct PROGRESS.md writes +
knowledge-cap violations with the `{ message, suggestion }` envelope.
`turn_start` / `turn_end` scope-guard snapshot + diff-revert. Episodic
event auto-writes. `belmont validate` CLI subcommand wires the same
walker the auto-loop preflight runs.

### M6 — TUI panel + status + hotkeys + ctx-weight indicator (2026-05-27)

`ctx.ui.custom` side panel showing the milestone/task tree, with
j/k/Enter/a/v/Esc and Ctrl+B / Ctrl+O / Ctrl+L global hotkeys.
3-slot status bar (task | model + thinking + rtk | session + ctx)
polling at 1Hz. Above-editor progress widget. Panel auto-opens on
`/belmont:auto` per D-13.

### M7 — Multi-model tiers + per-milestone overlay + models doctor (2026-05-27)

`models.json` schema (locked at v1) + the 4-layer resolver
(CLI > overlay > project > tier base). `pi.registerProvider` wiring
for codex / kimi / openai-compat / ollama. `/belmont:models doctor`
with `--milestone` overlay diff. Boot-doctor reachability check
backing the §7.6 contract.

### M8 — Auto mode (two-runtime, sequential) + lifecycle ownership + 10-iter leak test (2026-05-27)

Sequential per-task auto loop with `createAgentSessionRuntime` for
Runtime B (the worker's isolated session) and lockstep `try/finally`
dispose. D-8 consume-and-prepend steering. Rules-first-AI-fallback
decide ladder (in-process per D-6 + D-7). Worker message renderer
streams events to Runtime A's left pane. The 10-iteration leak gate
(`packages/harness/test/leak.test.ts`) is the M8 ship gate — passes
green throughout v1.0.

### M9 — RTK + token reduction + thinking-collapse enforcement (2026-05-27)

`user_bash` hook prepends `rtk ` to bash commands (default-on,
`BELMONT_RTK_DISABLE=1` opt-out). Status-bar RTK savings counter.
`thinking-collapse` context hook blanks AssistantMessage thinking
blocks (Ctrl+O toggle, preserves `thinkingSignature` for multi-turn
continuity). `session-before-compact` observer writes a compact
episodic entry before pi compacts. Missing-rtk fallback per D-3 tiered
strictness (warn-and-continue, never hard-fail). pi-lean-ctx adoption
DEFERRED to v1.1 — its 3.6.21 pivot to a CLI-first shell-routing
surface conflicts with RTK at user_bash, AND its Rust binary install
path is hostile to v1.0's npm-only distribution.

### M10 — MCP bridge (in-house port) (2026-05-27)

`.belmont/mcp.json` parser + the §12.3 blast-radius gate
(`BELMONT_AUTO_MODE=1` filters every server missing `auto:true` — the
fake `McpClient` for the filtered server is never even constructed;
no `--force` escape hatch). Cache at `.belmont/mcp-tools-cache.json`
with source-sha1 + per-entry configHash invalidation. Audit log
(today's `<date>-mcp-tools.md` episodic + `auto.json#mcp` spine).
Per-tool registration as `mcp__<server>__<tool>`.
`/belmont:mcp doctor` / `refresh`. **pi-mcp-adapter adoption DEFERRED
to v1.1** — the disqualifier is the peer `@earendil-works/pi-ai @
^0.74.0` constraint (incompatible with Belmont's 0.75.5 pin) PLUS the
architectural mismatch (peer pi-extension, not embeddable library; no
seam for the §12.3 blast-radius gate; duplicate `/mcp` slash command UI).

### M11 §18 fix pass (2026-05-27, post-94c3930)

The initial M11 commit (`94c3930`) shipped manifests + docs + the
mechanical §18. Blake's cold-start dogfood immediately surfaced three
issues, all M11 blockers per the §18-failures-are-M11-blockers rule.
All three landed before the v1.0.0 tag:

- **Hotkey remap.** Pi 0.75.5 reserved `ctrl+l`, `ctrl+o`, `ctrl+t`,
  and `ctrl+b` for its own commands (`app.model.select`,
  `app.tools.expand`, `app.thinking.toggle`,
  `tui.editor.cursorLeft`). M6's Ctrl+B/O/L bindings either
  collide-and-lose (O, L) or collide-and-warn (B). Remapped to
  `alt+b` (panel), `alt+t` (thinking-collapse), `alt+r` (REPL
  refresh).
- **Skill namespace.** The original D-9 install path
  `~/.agents/skills/belmont/<slug>/` collided with vanilla
  third-party skills of the same slug name when pi auto-discovered
  the agentskills tree (Blake hit `prototype` collision). New
  `D-004-cross-harness-skill-namespace.md` ADR supersedes the
  planning-doc D-9: install path moved to flat `~/.agents/skills/`
  with `belmont-` prefix on directory AND frontmatter `name:`. No
  collision possible by construction.
- **Extension naming.** Pi's `extensionFactories` in-process path
  hard-codes the extension path to `<inline:${index + 1}>`. Switched
  to `pi --extension <abs-path>` loading via a new
  `packages/harness/src/belmont.ts` re-export sibling. Pi now
  displays `belmont.js` as the extension's source label.
  `D-003-pi-extension-shape.md` amended with the loading-shape
  revision.

> **Stale install state.** Users who already ran `belmont install`
> against the D-9 layout should `rm -rf ~/.agents/skills/belmont/`
> before re-running. The new install path is
> `~/.agents/skills/belmont-<slug>/` (flat root with prefix); old
> subdirectory layout is not auto-cleaned.

Final fix-pass state: **552 tests / 49 files** (added 5 namespace
tests; updated the existing shortcut + install assertions). **81
modules / 170 deps** cruised, no boundary violations.

### M11 — Distribution + smoke + ship (2026-05-27)

Per v2.3 §17 M11 done-when:

- All 4 package manifests bumped to `1.0.0` with `publishConfig:
  { access: "public" }`, repository/homepage/bugs/keywords, and node
  engine pin. `pnpm -r pack` produces four tarballs:
  `belmont-{cli,harness,skills,knowledge-schema}-1.0.0.tgz`. Workspace
  references resolve to `^1.0.0` in the packed manifests; pi exact-pinned
  to `0.75.5` (D-12 invariant).
- `belmont install` subcommand (§13.2): skills materializer +
  scaffold + RTK preflight + models doctor (idempotent).
- `belmont update` subcommand (§13.3, simplified): clean-tree guard +
  `npm install -g @belmont/cli@<tag>`. Vendored-binary / atomic-swap
  variant DEFERRED to v1.1.
- `belmont --script "<text>"` flag sugar: rewrites to pi's native
  `--print "<text>"`. Lifts §18 steps 4 + 6 + 8.
- `install.sh` curl-pipe-sh wrapper: Node 22+ check, npm-install
  spawn, PATH-warning fallback for the "global bin not on PATH" case.
- `pi-package.json` gallery metadata mirror.
- 8 docs pages under `apps/docs/`: getting-started, knowledge-model,
  auto-mode, multi-model, standalone-skills, mcp, troubleshooting,
  cross-harness.
- Final test count: **547 tests / 49 files**, all green. **80 modules /
  170 dependencies** cruised — no boundary violations.
- Pi version re-probed at lock — still `0.75.5`, no bump between M10
  and M11 (D-12 hygiene; no v1.0.0 pi bump).
- pi-mcp-adapter re-probed at lock — still `2.8.0` with the same
  peer-dep blocker; in-house port stands; v1.1 hook unchanged.

### What's deferred to v1.1

These items are NOT v1.0 blockers — they're documented v1.1 candidates:

- pi-mcp-adapter swap once upstream widens peer `pi-ai@^0.75.0` AND
  exposes a programmable entry-point (not pi-extension-only) (per M10
  episodic re-evaluation hook).
- pi-lean-ctx at the context hook once its CLI-first pivot reconciles
  with RTK at `user_bash` (per M9 episodic).
- MCP OAuth (authorization_code / client_credentials / dynamic
  clients) + StreamableHTTP→SSE fallback + `directTools` /
  `excludeTools` + `exposeResources` + user-global
  `~/.belmont/mcp.json` merge + `mcp({search, tool, args})` proxy +
  `keep-alive` lifecycle with health checks.
- Bun-compile single-binary distribution (per §2 locked constraint —
  npm is v1.0's primary channel).
- Legacy v0.10.x / v1.0-experiment migration bridge skill
  (`/belmont:legacy-import`).
- Pi-antigravity-rotator (multi-account auth rotation).
- Standalone-skill runtime fixture (M4 P0-4 grep blocklist catches
  ahead-of-time leaks; v1.1 adds the runtime fixture per §16 risk #5).
- pi-web-access deeper integration + a research skill bundle.
- Cross-project preferences inheritance.

## v0.10.7-final — 2026-05-25 (safety anchor)

Last shipped Belmont before the v1.0 rebuild. Tagged for rollback
hygiene; not actively maintained. v0.10.x architecture (Go binary,
worktrees, parallel orchestrator) is the reference for what NOT to
re-do.
