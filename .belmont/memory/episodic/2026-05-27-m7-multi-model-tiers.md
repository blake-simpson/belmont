---
schema: belmont.episode.v1
date: 2026-05-27
phase: M7
---

# 2026-05-27 — M7 multi-model tiers + per-milestone overlay + models doctor

## What happened

- **Zod schema for `models.json` landed in `@belmont/knowledge-schema`**
  (`src/models-json.ts`, ~110 LOC + 16 tests). Schema is LOCKED at the
  §9.1 set (`tiers + agents + features + ctx_thresholds`) per risk #6 —
  no top-level `providers` block, no schema sprawl. The `_comment`
  field is allowed for human notes (the dogfooded `.belmont/models.json`
  uses it) and gets stripped out of the typed result. `validateModelsJson`
  returns `{ ok, data, warnings }` on success — warnings cover the
  cross-field soft check (amber ≥ red ctx threshold). Schema location
  matches §17 M7 P0 literal wording AND the user's brief: the harness
  side (`packages/harness/src/tiering/models-json.ts`) is a thin
  FS-loader wrapper that calls into knowledge-schema. Both invariants
  hold; no actual split.
- **Zod v4 gotcha (`z.record` on enum keys)**: in Zod v4,
  `z.record(z.enum(KEYS), z.enum(VALUES))` treats EVERY key in the key
  enum as REQUIRED — which would force every agent role to be present
  in `models.json#agents`, breaking the dogfood that only maps 6 of 11
  agents. Switched to a strict `z.object` built from
  `Object.fromEntries(AGENT_ROLES.map(r => [r, AGENT_TIER_VALUE.optional()]))`
  with an explicit `AgentShape` type alias to keep tsc's narrowing happy.
- **`packages/harness/src/pi/sdk.ts` extended at M7** with new
  type re-exports: `ProviderConfig`, `ProviderModelConfig`, `AuthStatus`,
  `AuthCredential`, `ApiKeyCredential`, `OAuthCredential`, the
  `AuthStorage` class (as a TYPE — the value isn't needed since we
  consume it via `ctx.modelRegistry.authStorage`), `ModelRegistry`
  (also as a TYPE), and via `@earendil-works/pi-ai` re-exports:
  `Api`, `Model`, `OAuthCredentials`. New direct dep
  `@earendil-works/pi-ai 0.75.5` listed in `packages/harness/package.json`.
- **Pi-boundary widened to also cover `@earendil-works/pi-ai`** —
  same pattern as the M6 pi-tui widening. `.dependency-cruiser.cjs`
  gets three new rules (`no-pi-ai-outside-harness`,
  `no-pi-ai-outside-harness-pi-subdir`, `not-to-pi-ai-by-package-name`),
  and `test/pi-boundary.test.ts`'s regex alternation extended to
  `(pi-coding-agent|pi-tui|pi-ai)`. Dep-check now reports `56 modules
  / 104 dependencies` (was 49/87 at M6).
- **`tiering/resolve.ts` is a PURE function** of `(modelsJson,
  agent, scope)` returning `ResolvedTier { tier, provider, model,
  thinking?, baseURL?, auth?, source }`. The `source` field reports
  which of the 4 layers won (`"cli" | "overlay" | "agent-default" |
  "tier-base"`). No FS, no fetch, no pi — testable without fixtures.
  20 unit tests across the 4 priority layers + the auth-classification
  helper. `parseMilestoneOverlay` (from M2) is the consumer's
  upstream: callers parse PROGRESS.md and pass the tokens in.
- **`tiering/known-providers.ts` + `tiering/providers.ts`** — the
  registerProvider path. Since the §9.1 schema is locked (no
  `providers` block), Belmont ships a small `KNOWN_PROVIDER_TEMPLATES`
  dict keyed by provider name for the four §17 M7 P0 names
  (`openai-compatible`, `ollama`, `codex`, `kimi`).
  `registerConfiguredProviders(pi, modelsJson, modelRegistry)`
  iterates tiers, dedupes by `(provider, model)`, calls
  `modelRegistry.find()` to skip pi built-ins (anthropic etc.), and
  for anything in `KNOWN_PROVIDER_TEMPLATES` builds a `ProviderConfig`
  from `template.defaultBaseURL` (or tier's `baseURL`) +
  `template.api` + `template.apiKeyEnv` + a minimal `ProviderModelConfig`
  (reasoning/input/cost/contextWindow/maxTokens defaults from the
  template). 7 tests cover dedup, baseURL override, unknown providers,
  template-needs-baseURL errors, registry-already-knows-it short-circuit.
  Cites pi-mono `custom-provider-anthropic/` + `custom-provider-gitlab-duo/`
  in the source comments per D-001.
- **`tiering/doctor.ts` replaced the M3 stub**: new
  `runModelsDoctor(cwd, { modelRegistry?, milestoneId?, cliOverrides? })`
  with full reachability classification — local providers (HTTP probe
  preserved from M3) and subscription/api-key providers
  (`modelRegistry.authStorage.getAuthStatus(provider).configured`, no
  network call per §9.6). When `modelRegistry` is undefined (CLI-only
  path), subscription tiers fall back to the M3 stub behaviour with a
  `[STUB]` tag in the formatted output. Per-agent resolution dump
  (all 11 agents) included in `DoctorResult.agentResolutions`. The
  formatter renders the §9.4 mockup verbatim — per-tier section +
  agent resolution table + result line + the `✗ HARD FAIL` line when
  `reachableCount === 0`. 13 tests cover missing-file, invalid-file,
  stub-path, live-registry path (reachable + unreachable), HTTP probe
  (mocked fetch), --milestone overlay, --tier CLI override, and the
  formatter output.
- **`commands/models.ts` replaced the M3 stub** with the full §9.4
  subcommand surface: `doctor [--milestone Mn] [--tier agent=value]`,
  `resolve <agent> [--milestone Mn] [--tier agent=value]`,
  `overlays`. `parseModelsArgs` is exported so tests can pin the
  arg-grammar (both `--milestone M3` and `--milestone=M3` forms,
  repeated `--tier` flags, unknown leading token → help). 16 tests
  cover routing + each subcommand's formatted output. The new
  `tiering/cli-flag.ts` reuses `parseOverlayString` from
  knowledge-schema (the CLI flag grammar is identical to the
  per-milestone overlay grammar — same parser, same output shape).
- **`tiering/snapshot.ts`** — module-state cache of the parsed
  models.json. Loaded once at `session_start`, invalidated on
  `/belmont:repl-refresh` (M6 Ctrl+L). Same idiom as the M6
  `isThinkingCollapsed` flag — a singleton with an explicit reset
  hook for tests. On load error, the previous good snapshot is
  preserved so a transient JSON syntax error while the user is
  editing models.json doesn't strand the rest of the harness.
- **`extension.ts` wiring at session_start**: after the existing
  snapshot refresh (BELMONT.md + preferences.md cache) and the panel
  cache prime, the session_start handler now calls
  `refreshModelsJsonSnapshot(ctx.cwd)` followed by
  `registerConfiguredProviders(pi, snapshot.data, ctx.modelRegistry)`
  when the file validates. Silent no-op on missing/invalid models.json
  — the doctor surfaces those at `/belmont:init` and
  `/belmont:models doctor` time.
- **`/belmont:init` now passes `ctx.modelRegistry`** into
  `runModelsDoctor` (single-line change in `commands/init.ts`). The
  real subscription auth check runs at init time, not the M3 stub.
- **`/belmont:repl-refresh` (Ctrl+L) invalidates the snapshot** so
  the user can edit `.belmont/models.json` mid-session and have the
  next `/belmont:models` or M8 auto-loop tier-resolution pick up the
  changes without restarting.
- **The ultrathink call** for M7: **hard-fail on zero reachable tiers
  at boot, no `--force` escape hatch in v1.0**. §7.6 + §9.5 are
  unambiguous ("≥1 tier MUST work"); warn-and-continue would silently
  defer the failure deep into an auto loop with a hostile stack
  trace. The subscription reachability check is *credentials on
  disk* via `modelRegistry.authStorage.getAuthStatus(provider).configured`,
  NOT a live network probe — that's how the air-gapped /
  offline-first dev path stays unbroken: cached OAuth or env-var
  keys count as reachable, and live network errors surface at first
  agent call where the error context is richer. Local providers
  (Ollama) DO get the network probe because "not running" is the
  diagnostic the user actually wants surfaced.
- M7 test suite: **72 new tests across 5 files** —
  `models-json.test.ts` (16, in knowledge-schema), `resolve-tier.test.ts`
  (20), `providers.test.ts` (7), `doctor.test.ts` (13),
  `models-command.test.ts` (16). Suite now **326 tests across 27
  files** (was 254 across 22 at M6).

## Author smoke (v2.3 §17 M7) — executed and passing

| Step | Expected | Observed |
|---|---|---|
| `pnpm build` | clean tsc (knowledge-schema, skills, harness, cli) | ✅ |
| `pnpm test` | full suite green | ✅ 326 tests across 27 files (254 prior + 72 new) |
| `pnpm dep-check` | no boundary violations including the new pi-ai rules | ✅ "no dependency violations found (56 modules, 104 dependencies cruised)" |
| `node packages/cli/dist/bin/belmont.js validate` against this repo | exit 0; same 5 PRD-index warnings carried from M5/M6 | ✅ exit 0 with 5 `PRD_INDEX_MISSING_FILE` warnings |
| Dogfood: flip M7 P0-1..P0-5 via `executeBelmontTransition` on the live `.belmont/PROGRESS.md` | each transition writes the marker and appends a `transition` bullet | ✅ 5 transitions, today's episodic file extended with 5 bullets |
| `resolveTier` 4-layer priority | CLI > overlay > agent-default > tier-base, each verified | ✅ 4 dedicated tests per layer winning |
| §9.5 hard-fail contract | zero reachable tiers → DoctorResult.hardFail === true | ✅ `doctor.test.ts` "hard-fails when zero subscription tiers have credentials" |
| Local probe path | HTTP fetch mocked, OK → reachable; reject → recovery `curl …/models` | ✅ |
| Per-milestone overlay (`--milestone M3`) surfaced through doctor + resolve | source: overlay; CLI flag overrides to source: cli | ✅ `doctor.test.ts` + `models-command.test.ts` |
| Pi-boundary widened to pi-ai | path-based rule + belt-and-braces rule + AST regex extension | ✅ |

## Deliberate design notes

- **Zod schema in `knowledge-schema/src/models-json.ts`, not
  `harness/src/tiering/models-json.ts`.** Matches §17 M7 P0 line 1724
  verbatim ("models.json Zod schema in `knowledge-schema`") and the
  existing precedent set by `frontmatter.ts`. The harness module
  exists as a thin FS-loader wrapper around it. The CLI's
  `belmont validate` can surface schema errors without pulling in
  the harness.
- **`KNOWN_PROVIDER_TEMPLATES` over a top-level `providers` block.**
  Risk #6 locks the v1.0 schema at `tiers + agents + features +
  ctx_thresholds` — no additions. The dict in
  `tiering/known-providers.ts` covers the four providers §17 M7 P0
  names explicitly and stays out of the user's models.json. New
  templates are pure-additive — adding `mistral` to the dict
  doesn't touch resolveTier or doctor.
- **Reachability is credentials-on-disk for subscription tiers, NOT
  a live network probe.** Doctor runs at every `belmont init` + every
  `/belmont:auto` preflight (M8). Hitting Anthropic/Codex on every
  boot is gratuitous + slow + rate-limit-risky. Cached OAuth + env
  vars are the right "do we have what we need" signal; live errors
  surface at first-call. Air-gapped users with cached creds pass; air-
  gapped users without creds AND without a local server genuinely
  can't use Belmont and the hard-fail is correct.
- **Hard-fail over warn-and-continue.** Per §7.6 and §9.5. The 30-
  second fix at boot ("`pi /login anthropic`" copy-paste) beats the
  30-minute debugging session mid-auto. No `--force` flag in v1.0.
- **Resolver is PURE; snapshot is SEPARATE.** The cache lives in
  `tiering/snapshot.ts`, the resolver doesn't know about it. Callers
  read the cache (or pass a freshly-loaded snapshot in) and call
  `resolveTier`. Unit tests don't need a tempdir.
- **CLI flag parser reuses the overlay grammar from M2.** Same
  `parseOverlayString` powers `--tier implementation=high+...` and
  the per-milestone HTML comment. One grammar, one parser, one
  test surface.
- **Init's `.modelRegistry` plumbing is a one-line change** — the
  M3 doctor signature already took an optional opts arg shape; M7
  adds `{ modelRegistry }` to that bag. The CLI path
  (`packages/cli/src/init.ts`) is unchanged (no live pi context to
  pass), so it continues to use the M3 stub behaviour — which is
  fine: `belmont init` from the CLI happens BEFORE the user enters
  the REPL, so the stub-marked output reads honestly.

## What's next

Session 8 → **M8 — Auto mode (two-runtime, sequential) + lifecycle
ownership + 10-iter leak test** per v2.3 §17 M8. First milestone that
calls `createAgentSessionRuntime`, wires the auto loop's worker
runtime, installs the M6 `setAutoActiveProbe` on the PanelController,
and ships the 10-iteration leak test as the §8.4 ship-gate. M7's
`resolveTier` + cached snapshot are the inputs to the loop's per-task
prompt build (`buildImplementPrompt(task, repl, steering)` consumes
`resolveTier(snapshot, "implementation", { milestoneOverlay })`).
M7's `runModelsDoctor` (with modelRegistry) gates auto-start — the
preflight refuses to spawn Runtime B if zero tiers are reachable.
