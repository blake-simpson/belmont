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
- [x] P0-6 dependency-cruiser config enforcing cli→harness→skills→knowledge-schema
- [x] P0-7 GitHub Actions: pnpm install --frozen-lockfile && pnpm build && pnpm test
- [x] P0-8 test/pi-boundary.test.ts — only packages/harness/src/pi/*.ts may import pi
- [x] P1-1 apps/docs/ placeholder

### M2: Knowledge schema

- [ ] P0-1 PROGRESS.md byte-faithful parser (parseProgress)
- [ ] P0-2 Transition state machine (applyTransition)
- [ ] P0-3 Frontmatter parser + validators for BELMONT/preferences/PRD/ADR/subsystem/episodic
- [ ] P0-4 validateProjectedKnowledgeWrite with rejection texts + suggestion generator scaffold
- [ ] P0-5 parseMilestoneOverlay token grammar + golden fixtures
- [ ] P1-1 Markdown golden fixtures
