# Belmont docs

Reference documentation for Belmont v1.0 — the pi-native coding harness.
Not marketing copy; this is the precise reference. Pair with
`~/Desktop/belmont-pi-planning-v2.3.md` (off-repo master plan) for the
deeper architectural reasoning.

## Pages

| Doc | Read when |
|---|---|
| [getting-started.md](./getting-started.md) | First install. Covers `npm install -g @belmont/cli`, `belmont init`, the boot doctor, the first `/belmont:working-backwards` flow, and the M3 §7.6 contract. |
| [knowledge-model.md](./knowledge-model.md) | Designing memory schema, amending `BELMONT.md`, writing ADRs/PRDs/subsystems, hitting the knowledge-cap guard. Covers §4 + §5. |
| [auto-mode.md](./auto-mode.md) | Running `/belmont:auto`, the two-runtime model, sequential per-task lifecycle, steering, pause/resume, the 10-iteration leak gate. Covers §8. |
| [multi-model.md](./multi-model.md) | Configuring `models.json`, tiers (low/medium/high), per-milestone HTML-comment overlays, the 4-layer resolver, `/belmont:models doctor`. Covers §7 + §9. |
| [standalone-skills.md](./standalone-skills.md) | The 8 canonical skills, the standalone-skill contract, `npx @belmont/skills install`, the 250-LOC cap + CI grep blocklist. Covers §10. |
| [mcp.md](./mcp.md) | `.belmont/mcp.json`, the §12.3 blast-radius gate, `auto:true` semantics, the cache, `/belmont:mcp doctor/refresh`. Covers §12. |
| [troubleshooting.md](./troubleshooting.md) | Common failure modes — missing tiers, dirty trees, RTK PATH issues, MCP refused-in-auto, scope-guard reverts. |
| [cross-harness.md](./cross-harness.md) | The cross-harness skill story — D-9 copy-not-symlink, materialization paths for Claude Code / Codex CLI / Cursor / vanilla pi. |
| [skills-compatibility-matrix.md](./skills-compatibility-matrix.md) | M4 living doc on per-skill / per-host capability. |

## Related

- Master plan: `~/Desktop/belmont-pi-planning-v2.3.md` (off-repo).
- Dogfooded knowledge: `.belmont/BELMONT.md`, `.belmont/memory/{decisions,prds,subsystems,constraints,episodic}/`.
- Episodic history: `.belmont/memory/episodic/<date>-<slug>.md` (1 per milestone landed).
- CHANGELOG: [`/CHANGELOG.md`](../../CHANGELOG.md).
