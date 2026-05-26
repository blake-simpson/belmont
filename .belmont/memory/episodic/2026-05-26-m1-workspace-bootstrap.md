---
schema: belmont.episodic.v1
date: 2026-05-26
phase: M1
---

# 2026-05-26 — M1 workspace bootstrap

## What happened

- Root config landed: `package.json` (pnpm@10.33.0, Node >=22.19.0,
  scripts: build/test/dep-check/typecheck), `pnpm-workspace.yaml`
  (packages/* + apps/*), `tsconfig.base.json` (strict TS),
  `tsconfig.json` (composite references), `vitest.config.ts`,
  `.dependency-cruiser.cjs`.
- 4 packages scaffolded with their own `package.json` + `tsconfig.json` +
  `src/index.ts`:
  - `@belmont/knowledge-schema` — pure, zero deps.
  - `@belmont/skills` — depends only on knowledge-schema.
  - `@belmont/harness` — exact-pins `@earendil-works/pi-coding-agent@0.75.5`;
    `src/pi/sdk.ts` is the SOLE pi importer (B5 anti-corruption layer).
  - `@belmont/cli` — depends only on harness; `bin/belmont.ts` stub.
- `apps/docs/` placeholder (M11 site).
- CI workflow at `.github/workflows/ci.yml`: `pnpm install
  --frozen-lockfile && pnpm build && pnpm test` on push/PR to main +
  v1-rebuild.
- pi-boundary enforcement landed at three layers:
  1. dep-cruiser rule `no-pi-outside-harness` — path-based, blocks pi
     imports outside `packages/harness/src/pi/`.
  2. dep-cruiser rule `no-pi-outside-harness-pi-subdir` — even inside
     harness, only `src/pi/*.ts` may import pi.
  3. dep-cruiser `not-to-unresolvable` — catches any unresolvable
     import (defense in depth).
  4. `test/pi-boundary.test.ts` — static AST scan over all packages
     `.ts` files, regex match handles `from`/`import`/`require`/`import()`
     with proper whitespace.

## Author smoke (v2.3 §17 M1) — executed and passing

| Step | Expected | Observed |
|---|---|---|
| `pnpm install` | 225 packages installed, workspace symlinks created | ✅ |
| `pnpm build` | dep-cruiser ✓ + 4 tsc builds ✓ | ✅ |
| `pnpm test` | dep-cruiser ✓ + pi-boundary.test.ts (2 tests) ✓ | ✅ |
| Inject `import * as pi` into knowledge-schema → `pnpm test` | FAIL with clear violation message | ✅ Vitest reports: `pi-boundary violation — pi imports outside packages/harness/src/pi/: packages/knowledge-schema/src/index.ts:11: import * as pi from '@earendil-works/pi-coding-agent';` |
| Inject same → `pnpm build` | FAIL | ✅ TS2307 (knowledge-schema doesn't declare pi as a dep, so TS can't resolve) |
| Revert and re-run | both green | ✅ |

## Notes on the dep-cruiser-vs-vitest layering

`pnpm test` is the load-bearing pi-boundary gate (catches unresolvable
imports). `pnpm build` catches resolvable cases via dep-cruiser's
`no-pi-outside-harness-pi-subdir` path rule AND catches unresolvable
cases via TS2307. Three independent layers all wired in CI; the M0
"buy/build matrix" + this gate together satisfy v2.3 §2 locked
constraint #2.

## What's next

Session 2 → M2 (knowledge-schema): byte-faithful port of the legacy
`src/state/progress.ts` PROGRESS parser, `applyTransition` state
machine, frontmatter validators, `validateProjectedKnowledgeWrite`,
`parseMilestoneOverlay`, 40+ unit tests. This is the highest-risk
milestone per v2.3 §17 M2 (parser correctness gates everything
downstream).
