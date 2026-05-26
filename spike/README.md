# M0 spike outcome — buy/build matrix

> One day of try-and-fail validation. Each candidate package has a 50-line
> probe script + a `VERDICT.md` containing `GO / NO-GO / DEFERRED` + the
> deciding criterion. This file is the rolled-up matrix.

## P0 (block v1 if wrong)

| Package | Latest | Verdict | Pin | Replaces (if GO) / Falls back to (if NO-GO) |
|---|---|---|---|---|
| [pi-mcp-adapter](./pi-mcp-adapter/) | 2.8.0 | **GO** (conditional wrapper) | `2.8.0` | Belmont adds `auto: true` blast-radius gate in `@belmont/harness/src/mcp/`; 3 of 4 §12.1 criteria met natively, 4th is Belmont-policy not adapter-policy. |
| [pi-lean-ctx](./pi-lean-ctx/) | 3.6.17 | **GO** (partial adoption) | `3.6.17` | Adopt the `context`-hook + MCP-tools layer; **disable** the package's own shell hook to avoid double-wrap with RTK at `user_bash` (§11.3 ordering invariant). |
| [pi-web-access](./pi-web-access/) | 0.10.7 | **GO** (no v1.0 milestone consumer) | `0.10.7` | Stable schema + opt-in install satisfied; available for v1.1+ once a milestone needs web search/fetch. Not wired into v1.0 by default. |
| [omp (oh-my-pi)](./omp/) | n/a | **NO-GO as base; CONDITIONAL leaf-package deferred to v1.1** | (none) | See `.belmont/memory/decisions/D-001-omp-evaluation.md` for full evidence. |

## P1 (informs design; not blocking)

| Package | Latest | Verdict | Notes |
|---|---|---|---|
| [@juicesharp/rpiv-ask-user-question](./rpiv-ask-user-question/) | 1.13.0 | **DEFERRED** — probe authored | rpiv is a non-earendil pi fork lineage; ecosystem-compat check required before adopting. Belmont's own `belmont_ask_user` tool (§5.2 design slot) is the v1.0 default; reconsider only if a feature gap surfaces in M5/M8. |
| [adaptive-memory-multi-model-router](./adaptive-memory-multi-model-router/) | 2.12.4 | **NO-GO** | Different ontology from Belmont's locked 3-tier (high/medium/low) per §9. v2.3 §17 M0 expected this outcome. |

## P2 (v1.1+ candidates)

| Package | Latest | Verdict |
|---|---|---|
| [pi-antigravity-rotator](./pi-antigravity-rotator/) | 2.1.2 | **DEFERRED to v1.1** per §17 M0 |

## How the verdicts inform §12 + §11

- §12 (MCP bridge): **BUY** `pi-mcp-adapter@2.8.0`. Belmont owns the
  `auto: true` blast-radius gate as a thin wrapper module
  (`@belmont/harness/src/mcp/blast-radius.ts`) on top of the adapter.
- §11.2 (token reduction): optional layer is `pi-lean-ctx@3.6.17` at the
  `context` hook. RTK stays at `user_bash` per §11.1; pi-lean-ctx's own
  shell hook is disabled in the Belmont config.
- §11.1 (RTK at `user_bash`): unchanged. RTK is Belmont-owned (not a
  buyable dep); the harness writes the `user_bash` integration.

## Re-running the probes

```bash
cd spike/<package>/
pnpm install            # each spike dir is a tiny self-contained workspace
pnpm tsx probe.ts       # runs the probe, prints findings against the §17 acceptance criteria
```

Probes are authored to be runnable from a fresh checkout. They depend on
the latest of the candidate package + `@earendil-works/pi-coding-agent`
peer where required. Re-run on every major-version bump of any GO
package.
