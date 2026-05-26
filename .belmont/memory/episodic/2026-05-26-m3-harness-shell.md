---
schema: belmont.episode.v1
date: 2026-05-26
phase: M3
---

# 2026-05-26 — M3 harness shell + boot doctor

## What happened

- `@belmont/harness` now ships a real default extension factory
  (`packages/harness/src/extension.ts`) plus a thin pi-launcher wrapper
  (`packages/harness/src/pi/launch.ts`). `@belmont/cli` calls
  `launchPi(argv)` to start pi with the harness preloaded; the CLI
  never imports `@earendil-works/pi-coding-agent` directly. The
  pi-boundary regex + dep-cruiser path rule both stay green
  (`pnpm dep-check` → 30 modules / 52 deps, zero violations).
- Three slash commands wired: `/belmont:status` (read PROGRESS.md via
  `parseProgress`, render milestone tree), `/belmont:init` (scaffold +
  refresh prompt snapshot + run boot doctor), `/belmont:models doctor`
  (M3 stub — only the `doctor` subcommand exists; full surface lands
  in M7).
- BELMONT.md + preferences.md are injected via a single
  `before_agent_start` handler. v2.3 §3.3 / §17 M3 P0-5 said
  "`before_agent_start` (auto) and `context` (interactive)" — pi
  0.75.5's `ExtensionAPI` does not match that framing: `context` is
  the per-LLM-call messages-array pruning hook (the M9 lean-ctx slot),
  not a system-prompt mutator. Captured as
  `memory/decisions/D-003-pi-extension-shape.md`.
- Boot doctor (`packages/harness/src/tiering/doctor.ts`) is a stub —
  subscription tiers are assumed reachable with a clear `[STUB]`
  marker; local-endpoint tiers are probed for real via HTTP GET to
  `${baseURL}/models` with a 1.5s timeout. `belmont init` hard-fails
  only when `reachableCount === 0`. M7 replaces the subscription
  branch with `AuthStorage` + `/models` probe; the return shape is
  stable so callers (init, /belmont:models, M8 auto preflight) don't
  need to change.
- The scaffolded `.belmont/{BELMONT.md, preferences.md, PROGRESS.md,
  models.json, .gitignore}` plus the six `memory/<kind>/` dirs pass
  `parseFrontmatter` + `validateFrontmatter` cleanly against the M2
  schemas (entrypoint, preferences) — empty diagnostics array.
- `pi/sdk.ts` now re-exports the type surface the rest of the harness
  needs (`ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`,
  `BeforeAgentStartEvent`, `BeforeAgentStartEventResult`,
  `SessionStartEvent`, `ExtensionFactory`). Sibling files import via
  `./pi/sdk.js` — never reaching `@earendil-works/...` directly, even
  for `import type` (the pi-boundary regex does not distinguish
  value vs. type imports).

## Author smoke (v2.3 §17 M3) — executed and passing

| Step | Expected | Observed |
|---|---|---|
| `pnpm --filter @belmont/cli build` | clean tsc | ✅ Done (all 4 packages) |
| `node packages/cli/dist/bin/belmont.js --version` | prints CLI version | ✅ `@belmont/cli 0.0.0 (M3 scaffold)` |
| `node packages/cli/dist/bin/belmont.js --help` | prints help | ✅ subcommand list visible |
| `belmont init` in fresh /tmp project | scaffolds `.belmont/` + doctor | ✅ 5 files + 6 memory subdirs + doctor report |
| existence of 4 canonical files | BELMONT/preferences/PROGRESS/models.json | ✅ all present |
| boot doctor shows ≥1 reachable tier | exit 0 on success | ✅ 2 of 3 reachable (high+medium stubbed; low actually probed and unreachable since Ollama not running) |
| re-running `belmont init` over existing dir | refuses, exit 1 | ✅ "Refusing to overwrite" + exit 1 |
| `pnpm test` | full suite green | ✅ 101 tests across 7 files (pi-boundary, parser, validators, transition, frontmatter, overlay, suggest) |
| `pnpm dep-check` | no boundary violations | ✅ 30 modules / 52 deps / 0 violations |

The end-to-end "launch pi REPL and exercise /belmont:status" half of
the §17 M3 author smoke is best run by Blake interactively (it boots
pi's interactive TUI, which we don't drive headless from this
session). The unit-level pieces — parseProgress wiring, render
function, hook factories — are exercised by the M2 test suite + the
new programmatic frontmatter validation above.

## Deliberate design notes

- **One default factory, programmatic registration via
  `pi.main(argv, { extensionFactories })`.** Avoids a
  `--extension=<path>` flag and the filesystem-materialisation step
  that would require. Matches every shipped pi example
  (`hello.ts`, `commands.ts`, `claude-rules.ts`).
- **`session_start` is no-op outside of snapshot refresh.** It does
  NOT notify on a fresh project ("no `.belmont/` directory"); we
  don't want startup spam for users running plain `pi` without the
  harness's scaffolding.
- **`/belmont:init` refreshes the prompt snapshot mid-session** so
  the next agent turn picks up BELMONT.md + preferences.md without
  requiring `/reload`.
- **Templates kept minimal.** Fresh-project BELMONT.md is a skeleton
  with placeholder copy in each section; `/belmont:working-backwards`
  in M4 fills out PR/FAQ. Compare to the dogfooded BELMONT.md at
  Belmont's own repo, which is fully populated.
- **`belmont init` exit codes**: 0 on success; 1 on
  already-exists refusal; 2 on doctor hard-fail (zero reachable
  tiers). M11 release flow can rely on these.

## What's next

Session 4 → **M4 — skills + composer + standalone fixture** per v2.3
§17 M4:

- 8 canonical skill bodies (`working-backwards`, `plan`, `next`,
  `implement`, `verify`, `status`, `prototype`, `debug`) at ≤250 LOC.
- `composer.compose(target)` materializer with `<!-- @include
  _shared/X.md -->` expansion + content-hash idempotence.
- `bin/belmont-skills install` for standalone (vanilla CLI) install.
- CI gates: static grep blocklist (no harness-only constructs leaking
  into skill bodies), line-count cap (≤250 LOC), the runtime fixture
  (M11 ship-gate stays out of M4 — just the unit-level grep/cap).
- `_shared/harness-optional.md` inlined into every skill so the body
  knows whether `belmont_transition` exists.

The harness side (`/belmont:<skill>` slash commands routing to the
materialized SKILL bodies via `pi.sendUserMessage`) lands in M4 too —
that's where M3's command-registration plumbing pays off.
