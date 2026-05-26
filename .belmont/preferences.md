---
schema: belmont.preferences.v1
updated_at: 2026-05-26
---

# Preferences (Belmont source repo)

- Never co-author commits.
- TypeScript strict; no `any`.
- Run `pnpm test` after every implementation phase.
- Pi version is exact-pinned in `packages/harness/package.json`; never
  relax to caret.
- Skill source bodies stay ≤250 lines; CI gate enforces.
- When taking Playwright screenshots for debugging, clean up the images
  after.
- Cite Verona reference (`~/code/personal/verona`) when arguing for the
  memory shape.
