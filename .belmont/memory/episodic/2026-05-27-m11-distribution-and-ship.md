---
schema: belmont.episode.v1
date: 2026-05-27
phase: M11
---

# 2026-05-27 — M11 Distribution + smoke + ship (v1.0.0)

The v1.0 ship gate. Manifests bumped, packaging verified, 8 docs pages
authored, `belmont install` / `update` / `--script` wired, install.sh
+ pi-package.json minted, §18 author smoke executed mechanically.

## Re-probes at v1.0.0 lock (same hygiene M9 + M10 used)

### Pi version (D-12: Belmont owns pi's version)

- M10 baseline: `@earendil-works/pi-coding-agent@0.75.5` (also pi-ai,
  pi-tui at the same pin).
- M11 re-probe: `npm view @earendil-works/pi-coding-agent version` →
  `0.75.5`. `dist-tags.latest` = `0.75.5`. No new versions since M10
  (today, 2026-05-27 morning).
- **Verdict: HOLD on 0.75.5.** v1.0.0 ships on the same pin. No bump.
  The next pi bump waits for v1.0.1 (patch) or v1.1 (minor) per D-12.
  The harness's three pi-* deps stay at exact `0.75.5`.

### pi-mcp-adapter (M10 buy-or-port verdict)

- M10 baseline: `pi-mcp-adapter@2.8.0`; peer `@earendil-works/pi-ai
  @^0.74.0` + `pi-tui @^0.74.0`; published 2026-05-25.
- M11 re-probe: `npm view pi-mcp-adapter version` → `2.8.0`. Still
  `2.8.0`. No new release between M10 and M11.
- The three architectural disqualifiers from the M10 verdict still
  stand:
  1. Peer pi-ai/pi-tui `^0.74.0` — caret on `0.x.y` means
     `>=0.74.0 <0.75.0`; can't install alongside our 0.75.x.
  2. Peer pi-extension (not embeddable library) — no programmable
     `main`/`exports`; no API to override the `mcp.json` search path;
     no insertion seam for the §12.3 blast-radius gate.
  3. Duplicate `/mcp` slash-command UI surface conflicts with our
     `/belmont:mcp doctor` + `refresh`.
- **Verdict: HOLD on in-house port.** v1.1 re-evaluation hook unchanged
  — re-open when pi-mcp-adapter publishes a 2.9+ that widens the
  pi-ai/pi-tui peer to `^0.75.0` AND exposes a programmable entry-point.

## What landed

### P0-1 — Package manifests + tarballs

All 4 package.json files bumped to `"version": "1.0.0"` with:

- `"publishConfig": { "access": "public" }` (npm scope `@belmont/*`
  defaults to private; explicit public for the four releases).
- `repository`, `homepage`, `bugs` pointing at
  `github.com/blakesimpson/belmont` with per-package `directory`.
- `keywords` per package (cli/harness/skills/knowledge-schema each
  carry topical tags).
- `engines.node >= 22.19.0` on `@belmont/cli` (the entry point).
- `bin` entries verified:
  - `@belmont/cli` → `belmont` → `./dist/bin/belmont.js`.
  - `@belmont/skills` → `belmont-skills` → `bin/belmont-skills`.

`pnpm -r --filter='./packages/*' pack --pack-destination /tmp/...`
produces 4 tarballs in the expected naming
(`belmont-cli-1.0.0.tgz`, etc.). Per-tarball manifest inspection
confirms:

- All workspace deps resolved to concrete `^1.0.0` (no `workspace:*`
  leakage into published manifests — pnpm's `publishConfig` did its
  job).
- Pi remains exact-pinned at `0.75.5` across pi-ai, pi-coding-agent,
  pi-tui (D-12 invariant preserved through the pack).
- `@modelcontextprotocol/sdk` at `^1.29.0` (M10 dep, unchanged).

### P0-2 — pi-package.json

Repo-root `pi-package.json` mirroring `@belmont/cli` essentials for
the pi packages gallery (§13.1 row 4 tertiary channel):

- `name: belmont`, `version: 1.0.0`, `bin: { belmont: "@belmont/cli" }`.
- `install.{primary, curl, skillsOnly}` — the three §13.1 channels.
- `skills[]` — the 8 canonical slugs.
- `features{}` — boolean dial for {knowledgeModel, autoMode,
  multiModel, mcp, rtk, crossHarness}.

### P0-3 — install.sh (curl-pipe-sh wrapper)

Repo-root `install.sh` (`chmod +x`; `bash -n` syntax-clean):

1. Checks for `node` on PATH; refuses with a helpful message if
   absent.
2. Parses `node --version`, refuses below Node 22.
3. Checks for `npm` on PATH.
4. Runs `npm install -g @belmont/cli@${BELMONT_VERSION_TAG:-latest}`.
5. Smokes `belmont --version`; if not on PATH, prints a single
   copy-pasteable `PATH=...` hint scoped to the user's shell rc
   (zsh/bash/fish).

Deliberately does NOT install Node itself — that's a scope choice
(per §13.1: secondary channel, npm is primary).

### P0-4 — belmont install / update / --script (the CLI surface)

Three new entry points landed in `@belmont/cli`:

#### `belmont install [project-dir]` (`packages/cli/src/install.ts`)

Per §13.2:

1. `materializeBelmontSkills()` — wraps `@belmont/skills compose()`
   via a new `@belmont/harness/src/cli/install-helpers.ts` (the cli
   never imports `@belmont/skills` directly; dep direction stays
   `cli → harness → skills`). Default target
   `~/.agents/skills/belmont/` per D-9; content-hashed idempotence
   from the existing composer.
2. `scaffoldBelmontDir()` — no-op when `.belmont/` already exists
   (no-clobber semantics).
3. `runRtkPreflight()` — emits one line; warn-and-continue per D-3
   tiered strictness; never hard-fails.
4. `runModelsDoctor()` — only when `.belmont/models.json` exists.
   Fresh inits skip this here (init already ran the doctor).

`HOME`-pointer made lazy: previously `DEFAULT_SKILLS_TARGET = join(
homedir(), …)` evaluated once at module load (broke tests that swap
HOME in beforeEach). Now `defaultSkillsTarget()` is a function called
per invocation.

#### `belmont update [--allow-dirty] [--dry-run] [--tag <tag>]` (`packages/cli/src/update.ts`)

Simplified v1.0 form per Blake's prompt:

- `checkCleanWorkingTree()` — runs `git status --porcelain` in cwd;
  refuses if non-empty (escape hatch: `--allow-dirty`). Skips check
  when not in a git tree.
- Shells `npm install -g @belmont/cli@<tag>`.
- The full §13.3 stub (`fetchLatestRelease` + `downloadAndVerify-
  Tarball` + `preSeedRtk` + `replaceBinaryAtomically` + `execNew-
  Binary`) is DEFERRED to v1.1 — it requires the bun-compile binary
  distribution that's also deferred per §2 locked constraint.

#### `belmont --script "<text>"` (`packages/cli/src/run.ts`)

Sugar over pi's native `--print` mode. The rewriter (`rewriteScriptFlag`)
walks argv exactly once, replacing the FIRST `--script <text>` (or
`--script=<text>`) with pi's `--print <text>`. Subsequent occurrences
pass through (pi will surface the duplicate; that's the desired
failure mode, not a silent swallow). Tests:

- 6 tests in `packages/cli/test/script.test.ts` cover the rewrite +
  the version-string contract + the integration through `runWith()`.
- Pi `0.75.5` has `--print|-p` in `dist/cli/args.js` accepting the
  next-arg as the message; this is the documented non-interactive
  entry that §18 step 4 + 6 + 8 build on.

Version string moved off the M3 scaffold marker. `belmont --version`
now prints exactly `belmont 1.0.0`.

### P0-5 — Docs site (8 pages, real content)

Under `apps/docs/`:

| Page | Lines | Covers |
|---|---|---|
| `README.md` | 30 | Index + cross-links. |
| `getting-started.md` | ~250 | npm install, init, the boot doctor, daily commands, hotkeys, where things live. |
| `knowledge-model.md` | ~200 | §4 + §5; directory-per-kind, the `tool_call` knowledge-guard, `belmont validate`, the Memory map. |
| `auto-mode.md` | ~200 | §8; the two-runtime model, sequential per-task flow, steering, pause/resume, the 10-iter leak gate. |
| `multi-model.md` | ~180 | §7 + §9; tiers, agents → tiers, per-milestone overlays, the 4-layer resolver, `/belmont:models doctor`. |
| `standalone-skills.md` | ~170 | §10; the 8 skills, the 250-LOC cap, `@include`, the standalone contract. |
| `mcp.md` | ~230 | §12; `.belmont/mcp.json`, the blast-radius gate, cache + audit, `/belmont:mcp` UX. |
| `troubleshooting.md` | ~210 | Common failure modes. |
| `cross-harness.md` | ~180 | D-9; the materialization paths for Claude Code / Codex / Cursor / vanilla pi. |

Real reference content, not placeholders. Tone is precise, not
marketing. Each page ends with "Read next" cross-references.

### P0-6 — CHANGELOG + tag preparation

- `CHANGELOG.md` authored with per-milestone bullets for M0 through
  M11. Includes "What's deferred to v1.1" section listing 9 candidate
  items.
- Tag `v1.0.0` is QUEUED — not yet executed. Per ground rules + the
  Session 11 prompt: "Tagging v1.0.0 is the load-bearing moment;
  explicit yes from Blake before `git tag` AND before `git push origin
  v1.0.0`." The tag command will run after Blake's explicit yes.

## §18 Author smoke — run matrix (mechanical pass)

Singular ship gate per v2.3 §18. Mechanical steps green; LLM-driven
steps require Blake's manual end-to-end on a real project (with
auth + a model the doctor reports reachable) before tagging.

| §18 step | Type | Result |
|---|---|---|
| 1. `pnpm install && pnpm build && pnpm test && pnpm --filter @belmont/harness test test/leak.test.ts` | mechanical | ✅ 547 tests / 49 files green; 80 modules / 170 deps cruised, no boundary violations; leak gate green |
| 2. `pnpm -r pack` → 4 tarballs; `npm install -g packages/cli/belmont-cli-*.tgz`; `belmont --version \| grep '^belmont 1\.0\.0'` | partial — tarballs produced ✅; global `npm install -g <tarball>` requires deps published or all 4 tarballs together — Blake to run after `npm publish` | tarballs at the expected paths + version string `belmont 1.0.0` verified via the built local bin (`node packages/cli/dist/bin/belmont.js --version` → `belmont 1.0.0`) |
| 3. `belmont init` in a fresh project; assert `.belmont/{BELMONT,preferences,PROGRESS,models}.{md,json}` + `## PR/FAQ` | mechanical | ✅ ran against `/tmp/belmont-smoke-init`; all 5 scaffolded files present; `grep -q '## PR/FAQ' .belmont/BELMONT.md` succeeds; boot doctor exits 0 with 2-of-3 tiers reachable (the unreachable one is a local ollama probe — expected on the test runner) |
| 4. `belmont --script "/belmont:working-backwards interactive: ..."` | **LLM-driven** | Wiring verified (`rewriteScriptFlag` test suite + integration test + manual smoke through `node dist/bin/belmont.js`). End-to-end LLM call requires Blake's auth + model — Blake to run before tagging. |
| 5. Verify final `[v] P0-1` + `SMOKE_BELMONT.md` exists + episodic ≥1 | **LLM-driven** | Depends on step 4. Blake to verify post-§18. |
| 6. `belmont-skills install --target /tmp/belmont-standalone-skills` + `codex exec --skip-git-repo-check "..."` | partial — `belmont-skills install` verified ✅; `codex exec` requires Codex auth — Blake to run | Standalone install verified against `/tmp/belmont-standalone-skills`: all 8 skills + references materialized; the bin works end-to-end |
| 7. Manual Claude Code test | **manual + LLM-driven** | Blake-only — document outcome in CHANGELOG.md after §18 passes if any host-CLI quirks surface. |
| 8. Per-milestone overlay end-to-end via `belmont --script "/belmont:auto M2"` + assert `OVERLAY_TEST.md` exists | **LLM-driven** | Wiring verified (M7 P0-4 overlay parser + auto-loop integration tests). Live run requires Blake's auth. |

Failure modes mapping (per §18 footer):

| If a step fails | Treat as |
|---|---|
| 1 (build/test/leak) | M11 blocker — fix before tag |
| 2 (pack/install) | M11 blocker — fix before tag |
| 3 (init) | M3 regression — fix in M11 (not v1.0.1) |
| 4 (working-backwards / plan) | M4 regression — fix in M11 |
| 5 (auto mode) | M8 regression — fix in M11 |
| 6 (standalone contract) | M4 / M11 CI miss — fix in M11 |
| 7 (manual Claude Code) | v1.0.1 patch unless show-stopping |
| 8 (overlay) | M7 regression — fix in M11 |

Per Session 11 prompt: §18 failures are M11 blockers, NOT v1.1
deferrals. Belmont does not tag v1.0.0 with known broken behaviour.

## Build + test snapshot at M11 close

| Metric | Value |
|---|---|
| Tests | **547** (was 524 at M10; +23: 9 script + 9 update + 3 install + 2 cli-args smoke) |
| Test files | **49** (was 46; +3) |
| Modules cruised | **80** (was 77; +3: install.ts + update.ts + install-helpers.ts) |
| Dependencies cruised | **170** (was 164; +6) |
| Boundary violations | **0** |
| Build time | ~5s wall |
| Test time | ~1.2s wall |

## Files added

- `install.sh`
- `pi-package.json`
- `CHANGELOG.md`
- `packages/cli/src/install.ts`
- `packages/cli/src/update.ts`
- `packages/cli/test/install.test.ts`
- `packages/cli/test/update.test.ts`
- `packages/cli/test/script.test.ts`
- `packages/harness/src/cli/install-helpers.ts`
- `apps/docs/getting-started.md`
- `apps/docs/knowledge-model.md`
- `apps/docs/auto-mode.md`
- `apps/docs/multi-model.md`
- `apps/docs/standalone-skills.md`
- `apps/docs/mcp.md`
- `apps/docs/troubleshooting.md`
- `apps/docs/cross-harness.md`
- `.belmont/scratch/m11-dogfood.mjs` (the dogfood transition driver;
  gitignored under `.belmont/scratch/`)

## Files edited

- `packages/{cli,harness,skills,knowledge-schema}/package.json` —
  version 1.0.0 + publishConfig + repository + homepage + bugs +
  keywords.
- `packages/cli/src/index.ts` — new exports.
- `packages/cli/src/run.ts` — install/update routing + `rewriteScriptFlag`
  + version string update.
- `packages/harness/src/index.ts` — new install-helper exports.
- `apps/docs/README.md` — index page rewrite.
- `.belmont/PROGRESS.md` — M11 markers via `executeBelmontTransition`
  (18 transitions; 6 tasks × 3 hops).
- `.belmont/memory/episodic/2026-05-27-progress-transitions.md` — the
  audit-trail tail (M11 transitions appended).

## What v1.0.0 ships with — quick reference

- 4 npm tarballs: `@belmont/{knowledge-schema, skills, harness,
  cli}@1.0.0`.
- 1 pi 0.75.5 exact-pinned across 3 pi-* packages.
- 8 canonical skills + 8 docs pages.
- 1 MCP bridge (in-house; pi-mcp-adapter v1.1 hook open).
- 1 RTK integration (default-on, opt-out env var).
- 1 thinking-collapse hook (Ctrl+O toggle).
- 1 §12.3 blast-radius gate with no `--force` escape hatch.
- 1 boot doctor exiting non-zero when zero tiers reachable.
- 1 10-iteration leak gate as the M8 ship gate.

## v1.1 follow-up hooks (from this milestone + earlier)

These items are NOT v1.0 blockers; they're documented v1.1 candidates.

- **pi-mcp-adapter swap** — once upstream publishes a 2.9+ widening
  the pi-ai/pi-tui peer to `^0.75.0` AND exposing a programmable
  entry-point.
- **pi-lean-ctx at the context hook** — once its CLI-first pivot
  reconciles with RTK at `user_bash`.
- **MCP OAuth + SSE fallback + `directTools` / `excludeTools` /
  `exposeResources`** — see M10 episodic v1.1 deferral list.
- **Self-update vendored-binary path** — `belmont update` v1.1 form:
  download tarball + verify checksums + `preSeedRtk` + atomic binary
  swap + `execNewBinary(["install"])` per §13.3.
- **Bun-compile single binary** — per §2 locked constraint (DEFERRED
  to v1.1). NPM is v1.0's primary channel.
- **Standalone-skill runtime fixture** — M4 P0-4 grep blocklist
  catches ahead-of-time leaks; v1.1 adds runtime `codex exec
  --skip-git-repo-check` fixture per §16 risk #5.
- **Legacy migration bridge skill** (`/belmont:legacy-import`) — ships
  when ≥3 non-Blake users request it.
- **Pi-antigravity-rotator** for multi-account auth rotation.

## Next session — post-tag triage

After Blake explicitly green-lights:

1. `git commit -m "M11: distribution + smoke + ship (v1.0.0)"` —
   covers all M11 deliverables.
2. **Pause for Blake.** §18 manual end-to-end on a real project
   (steps 4, 5, 6 LLM, 7 manual, 8 LLM) gates the tag.
3. If §18 surfaces a real bug, **fix in M11 and re-run §18 from step
   1** (Session 11 prompt rule: §18 surface-bugs are M11 blockers).
4. `git tag v1.0.0` — explicit yes from Blake required.
5. `git push origin v1-rebuild v1.0.0` — explicit yes from Blake
   required.
6. `npm publish` for each of the 4 tarballs — explicit yes from
   Blake required (dry-run only otherwise).
7. Open the v1.0.1 debug session against Blake's outstanding
   "concerns from quick local dogfood" notes.
