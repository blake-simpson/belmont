# PROGRESS

### M0: Pi-package spike

- [x] P0-1 Probe pi-mcp-adapter — VERDICT in spike/pi-mcp-adapter/
- [x] P0-2 Probe pi-lean-ctx — VERDICT in spike/pi-lean-ctx/
- [x] P0-3 Probe pi-web-access — VERDICT in spike/pi-web-access/
- [x] P0-OMP oh-my-pi evaluation — DISCHARGED by D-001; spike/omp/VERDICT.md
- [x] P1-1 Probe @juicesharp/rpiv-ask-user-question
- [x] P1-2 Probe adaptive-memory-multi-model-router
- [x] P2-1 Probe pi-antigravity-rotator (deferred to v1.1)

### M1: Workspace bootstrap

- [x] P0-1 pnpm-workspace.yaml + root package.json + tsconfig.base.json
- [x] P0-2 Scaffold @belmont/knowledge-schema
- [x] P0-3 Scaffold @belmont/skills
- [x] P0-4 Scaffold @belmont/harness (sole pi importer via src/pi/sdk.ts)
- [x] P0-5 Scaffold @belmont/cli (bin/belmont stub)
- [x] P0-6 dependency-cruiser config enforcing cli→harness→skills→knowledge-schema (+ not-to-unresolvable + not-to-pi-by-package-name belt-and-braces)
- [x] P0-7 GitHub Actions: pnpm install --frozen-lockfile && pnpm build && pnpm test
- [x] P0-8 test/pi-boundary.test.ts — only packages/harness/src/pi/*.ts may import pi (static AST scan, regex matches `from`/`import`/`require`/`import()` with whitespace)
- [x] P1-1 apps/docs/ placeholder

### M2: Knowledge schema

- [x] P0-1 PROGRESS.md byte-faithful parser (parseProgress)
- [x] P0-2 Transition state machine (applyTransition)
- [x] P0-3 Frontmatter parser + validators for BELMONT/preferences/PRD/ADR/subsystem/episodic
- [x] P0-4 validateProjectedKnowledgeWrite with rejection texts + suggestion generator scaffold
- [x] P0-5 parseMilestoneOverlay token grammar + golden fixtures
- [x] P1-1 Markdown golden fixtures

### M3: Harness shell + boot doctor

- [x] P0-1 Extension entrypoint with empty session_start handler
- [x] P0-2 @belmont/cli resolves project root, execs pi with --extension
- [x] P0-3 /belmont:status command
- [x] P0-4 /belmont:init command (creates .belmont/ skeleton + boot doctor)
- [x] P0-5 Wire BELMONT.md + preferences.md via before_agent_start (D-003: single hook covers both interactive + auto in pi 0.75.5)
- [x] P0-6 Boot doctor in belmont init (per §7.6; M3 stub — full check lands in M7)

### M4: Skills + composer + standalone fixture

- [ ] P0-1 8 skill bodies (working-backwards, plan, next, implement, verify, status, prototype, debug)
- [ ] P0-2 Composer: read canonical, expand @include, validate frontmatter, copy referenced files
- [ ] P0-3 bin/belmont-skills script for standalone install
- [ ] P0-4 CI gates: static grep blocklist, runtime fixture, line-count cap (≤250 LOC)
- [ ] P0-5 _shared/harness-optional.md inlined into every skill
- [ ] P1-1 Compatibility matrix doc

### M5: State machine + scope guards + preflight validate

- [ ] P0-1 belmont_transition registration + applyTransition wiring
- [ ] P0-2 tool_call hook: PROGRESS direct-write block + knowledge-cap + suggestion
- [ ] P0-3 turn_start snapshot + turn_end diff revert
- [ ] P0-4 Episodic event writes
- [ ] P0-5 belmont validate CLI subcommand + auto-loop preflight wiring

### M6: TUI panel + status + hotkeys + ctx-weight indicator

- [ ] P0-1 ctx.ui.custom side panel (milestone/task tree)
- [ ] P0-2 3-slot status bar (task | model+thinking+rtk | session+ctx)
- [ ] P0-3 Above-editor progress widget for auto
- [ ] P0-4 Shortcuts: Ctrl+B (panel), Ctrl+O (thinking), Ctrl+L (REPL refresh); panel: j/k/Enter/a/v/Esc
- [ ] P0-5 Panel auto-open on /belmont:auto

### M7: Multi-model tiers + per-milestone overlay + models doctor

- [ ] P0-1 models.json schema + 4-layer resolver (CLI > milestone overlay > project > tier base)
- [ ] P0-2 pi.registerProvider for codex/kimi/openai-compat
- [ ] P0-3 /belmont:models doctor implementation
- [ ] P0-4 Per-milestone HTML-comment overlay parsing
- [ ] P0-5 Boot-doctor reachability check (≥1 reachable tier)

### M8: Auto mode (two-runtime, sequential) + lifecycle ownership + 10-iter leak test

- [ ] P0-1 Sequential per-task auto loop (packages/harness/src/auto/loop.ts)
- [ ] P0-2 createAgentSessionRuntime wrapper + dispose discipline
- [ ] P0-3 Steering: working/steering.md consume-before-invoke
- [ ] P0-4 Decide ladder: rules first + AI fallback (in-process)
- [ ] P0-5 Worker message renderer streaming to Runtime A left pane
- [ ] P0-6 10-iteration leak test (M8 ship-gate per §8.4)

### M9: RTK + token reduction

- [ ] P0-1 RTK user_bash hook (default-on, BELMONT_RTK_DISABLE=1 opt-out)
- [ ] P0-2 Optional pi-lean-ctx at context hook
- [ ] P0-3 Status bar RTK savings counter
- [ ] P0-4 Missing-RTK fallback (warn or hard-fail per strictness tier)

### M10: MCP bridge

- [ ] P0-1 .belmont/mcp.json schema (Claude-compatible)
- [ ] P0-2 Blast-radius gate: auto:true required for unattended auto mode
- [ ] P0-3 Cache + audit (.belmont/mcp-tools-cache.json)
- [ ] P0-4 Buy-or-port decision wired from M0 spike (pi-mcp-adapter)

### M11: Distribution + smoke + ship

- [ ] P0-1 npm publish: @belmont/{knowledge-schema, skills, harness, cli}
- [ ] P0-2 pi packages gallery metadata mirror
- [ ] P0-3 install.sh (curl-pipe-sh on top of npm)
- [ ] P0-4 belmont update self-update path
- [ ] P0-5 §18 author smoke on disposable branch of a real Blake project
- [ ] P0-6 Tag v1.0.0
