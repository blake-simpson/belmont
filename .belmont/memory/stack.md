---
schema: belmont.stack.v1
updated_at: 2026-05-26
---

# Stack

## Languages & toolchain

- TypeScript 5.5+ (strict mode, no `any`).
- Node.js 22.x LTS.
- pnpm 9.x (workspace mode).
- Vitest for unit tests.
- `tsx` for development entry-points.

## Frameworks & runtimes

- `@earendil-works/pi-coding-agent` — exact-pinned; sole pi importer is
  `packages/harness/src/pi/*.ts`.
- Bun runtime — DEFERRED to v1.1 (per D-001 §Gate-b, would unlock
  `@oh-my-pi/pi-natives`).

## Standards

- Strict dep direction enforced by `dependency-cruiser`:
  `@belmont/cli → @belmont/harness → @belmont/skills → @belmont/knowledge-schema`.
- Zod (or TypeBox where pi requires it) for runtime schema validation.
- ESLint + TypeScript-ESLint baseline.
- Conventional commits not required; one commit per milestone with
  `M<N>: …` prefix.

## Revisions

- 2026-05-26 — Authored at M0 alongside the dogfood `.belmont/` scaffold.
