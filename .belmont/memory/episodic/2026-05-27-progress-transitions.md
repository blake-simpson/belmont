---
schema: belmont.episode.v1
date: 2026-05-27
---

# 2026-05-27 — progress transitions

## Events

- [transition/M6/P0-1] todo → done — M6 TUI panel + status bar + hotkeys + ctx-weight indicator
- [transition/M6/P0-2] todo → done — M6 TUI panel + status bar + hotkeys + ctx-weight indicator
- [transition/M6/P0-3] todo → done — M6 TUI panel + status bar + hotkeys + ctx-weight indicator
- [transition/M6/P0-4] todo → done — M6 TUI panel + status bar + hotkeys + ctx-weight indicator
- [transition/M6/P0-5] todo → done — M6 TUI panel + status bar + hotkeys + ctx-weight indicator
- [transition/M7/P0-1] todo → done — M7 multi-model tiers + per-milestone overlay + models doctor
- [transition/M7/P0-2] todo → done — M7 multi-model tiers + per-milestone overlay + models doctor
- [transition/M7/P0-3] todo → done — M7 multi-model tiers + per-milestone overlay + models doctor
- [transition/M7/P0-4] todo → done — M7 multi-model tiers + per-milestone overlay + models doctor
- [transition/M7/P0-5] todo → done — M7 multi-model tiers + per-milestone overlay + models doctor
- [transition/M7/P0-5] done → done (noop)
- [transition/M8/P0-1] todo → done
- [transition/M8/P0-2] todo → done
- [transition/M8/P0-3] todo → done
- [transition/M8/P0-4] todo → done
- [transition/M8/P0-5] todo → done
- [transition/M8/P0-6] todo → done
- [transition/M9/P0-1] todo → in_progress
- [transition/M9/P0-1] in_progress → done
- [transition/M9/P0-1] done → verified (evidence: packages/harness/src/hooks/rtk-bash.ts)
- [transition/M9/P0-2] todo → in_progress
- [transition/M9/P0-2] in_progress → done
- [transition/M9/P0-2] done → verified (evidence: packages/harness/src/hooks/thinking-collapse.ts) — lean-ctx deferred to v1.1; M9 P0-2 satisfied by thinking-collapse on context per §11.5 composition contract — see episodic
- [transition/M9/P0-3] todo → in_progress
- [transition/M9/P0-3] in_progress → done
- [transition/M9/P0-3] done → verified (evidence: packages/harness/src/tui/status-bar.ts)
- [transition/M9/P0-4] todo → in_progress
- [transition/M9/P0-4] in_progress → done
- [transition/M9/P0-4] done → verified (evidence: packages/harness/src/cli/rtk-detect.ts)
- [transition/M10/P0-1] todo → in_progress
- [transition/M10/P0-1] in_progress → done
- [transition/M10/P0-1] done → verified (evidence: packages/knowledge-schema/src/mcp-json.ts)
- [transition/M10/P0-2] todo → in_progress
- [transition/M10/P0-2] in_progress → done
- [transition/M10/P0-2] done → verified (evidence: packages/harness/src/mcp/blast-radius.ts)
- [transition/M10/P0-3] todo → in_progress
- [transition/M10/P0-3] in_progress → done
- [transition/M10/P0-3] done → verified (evidence: packages/harness/src/mcp/cache.ts)
- [transition/M10/P0-4] todo → in_progress
- [transition/M10/P0-4] in_progress → done
- [transition/M10/P0-4] done → verified (evidence: .belmont/memory/episodic/2026-05-27-m10-mcp-bridge.md)
- [transition/M11/P0-1] todo → in_progress
- [transition/M11/P0-1] in_progress → done
- [transition/M11/P0-1] done → verified (evidence: packages/cli/package.json) — pnpm -r pack produces belmont-{cli,harness,skills,knowledge-schema}-1.0.0.tgz with workspace:^ resolved to ^1.0.0 + pi exact-pinned to 0.75.5
- [transition/M11/P0-2] todo → in_progress
- [transition/M11/P0-2] in_progress → done
- [transition/M11/P0-2] done → verified (evidence: pi-package.json) — gallery mirror: name, version, bin@belmont/cli, install channels, skills[], features{}
- [transition/M11/P0-3] todo → in_progress
- [transition/M11/P0-3] in_progress → done
- [transition/M11/P0-3] done → verified (evidence: install.sh) — Node 22+ check + npm install -g @belmont/cli + PATH-warning fallback; bash -n syntax-clean
- [transition/M11/P0-4] todo → in_progress
- [transition/M11/P0-4] in_progress → done
- [transition/M11/P0-4] done → verified (evidence: packages/cli/src/update.ts) — update: clean-tree guard + npm install -g @belmont/cli@<tag>; install: skills materializer + scaffold + RTK + doctor; --script flag → pi --print
- [transition/M11/P0-5] todo → in_progress
- [transition/M11/P0-5] in_progress → done
- [transition/M11/P0-5] done → verified (evidence: .belmont/memory/episodic/2026-05-27-m11-distribution-and-ship.md) — §18 mechanical steps 1-3 + 6 green in M11 session; steps 4/5/7/8 (LLM-driven) require Blake's manual end-to-end before tagging
- [transition/M11/P0-6] todo → in_progress
- [transition/M11/P0-6] in_progress → done
- [transition/M11/P0-6] done → verified (evidence: CHANGELOG.md) — v1.0.0 entry authored; tag op queued for Blake's explicit yes per ground-rules
