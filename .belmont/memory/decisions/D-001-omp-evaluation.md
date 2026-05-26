---
schema: belmont.adr.v1
id: D-001-omp-evaluation
topic: ecosystem-base
status: accepted
updated_at: 2026-05-26
supersedes: null
---

# D-001: oh-my-pi evaluation — base, leaf packages, conceptual borrows

## Why this matters

Belmont v1.0 ships as an extension on top of a `@<scope>/pi-coding-agent` SDK. Two viable SDKs exist in the Pi ecosystem: `@earendil-works/pi-coding-agent` (the canonical line, by Pi's original author Mario Zechner + Armin Ronacher) and `@oh-my-pi/pi-coding-agent` (omp — a fork-extension by Can Boluk into a full IDE-grade coding-agent product). v2.3 picked earendil-works without comparing to omp. This ADR closes that gap with empirical evidence so the choice is principled, not incidental, and so future contributors do not re-debate it.

## Decision

1. **Belmont v1.0 base remains `@earendil-works/pi-coding-agent`.** HARD NO on omp-as-base.
2. **`@oh-my-pi/pi-natives` is technically decoupled but DEFERRED to v1.1+.** Adoption requires Belmont's Bun migration (currently v1.1 backlog per stack.md).
3. **`hashline` edit machinery — DEFER.** Useful only if/when Belmont introduces a custom edit-tool. v1.0 uses pi's native `edit`/`write`.
4. **Per-role routing (default/smol/slow/plan/commit), lifecycle commands (retain/recall/reflect), swarm-extension — IGNORE.** Different ontologies / OUT of v1.0 scope.
5. **NEW finding: cite earendil-works' shipped extension examples as templates** for v2.3 §5.4 scope-guard + §4.5 knowledge-guard. Add to M5 task scope.
6. **NEW finding: upstream signal is much stronger than feared.** earendil-works is co-maintained by Pi's original author and a top-tier engineer (Armin Ronacher); 9 versions, latest 3 days ago. The "single-fork-lineage" risk Gemini raised is unfounded for the earendil side.

## Rationale (empirical evidence)

### Gate (a): hook-surface equivalence — PASS

**File inspected:** `earendil/packages/coding-agent/src/core/extensions/types.ts:1084-1379` (the `ExtensionAPI` interface), plus the working examples in `examples/extensions/`.

**Confirmed: every event and registration API v2.3 designs against is in earendil-works' published `ExtensionAPI`:**

- Events: `tool_call`, `tool_result`, `turn_start`, `turn_end`, `session_start`, `session_shutdown`, `session_before_compact`, `session_before_fork`, `session_before_switch`, `session_before_tree`, `context`, `before_provider_request`, `after_provider_response`, `before_agent_start`, `agent_start`, `agent_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `model_select`, `thinking_level_select`, `user_bash`, `input`, `resources_discover`.
- Registration: `registerTool`, `registerCommand`, `registerShortcut`, `registerMessageRenderer`, `registerFlag`/`getFlag`, plus session APIs (`sendMessage`, `sendUserMessage`, `appendEntry`, `setSessionName`).

**Critical: `tool_call` returns `{block: true, reason: "..."}` to pre-empt execution — the exact pattern v2.3 §4.5 / §5.4 designs.** Confirmed in earendil's tests and worked examples.

**Surprise finding: earendil ships TWO precursors of Belmont's scope-guard.** `examples/extensions/protected-paths.ts` (30 lines) blocks writes to `.env`/`.git/`/`node_modules/` via the exact pattern v2.3 §4.5 spec'd. `examples/extensions/permission-gate.ts` (34 lines) blocks dangerous bash commands with `ctx.ui.select()` confirmation. **Belmont's knowledge-guard + scope-guard can be authored as 50-line extension files following these templates — NOT from-scratch hook plumbing.**

**Conclusion (a): PASS.** v2.3's architectural assumptions about pi's hook surface are validated mechanically. No architectural risk.

### omp's "hooks" are a DIFFERENT primitive — HARD NO on omp-as-base

**File inspected:** `omp/packages/coding-agent/src/capability/hook.ts` (40 lines) + `capability/extension.ts` (47 lines).

omp's `Hook` type defines hooks as **user-supplied shell scripts** registered at `pre:<tool>` or `post:<tool>` paths (Claude-Code-style filesystem hooks). omp's `Extension` type defines extensions as **Gemini-style manifests** (`mcpServers`, `tools`, `context`).

**Neither is structurally equivalent to pi's `ExtensionAPI` factory function with `pi.on(...)` event subscription.** Belmont's v2.3 design (which uses `pi.on("tool_call", ...)`) cannot be ported to omp without rewriting every hook as either a shell script or a manifest-based extension — losing the typed, in-process, deterministic-rejection-payload semantics that the knowledge-guard depends on.

**Conclusion: omp as base is mechanically incompatible with v2.3 §4.5 / §5.4 design.** Not just "fights the host's gravity" — actively forbids the architecture.

### Gate (b): pi-natives decoupling — CONDITIONAL (DEFER to v1.1)

**File inspected:** `omp/packages/natives/package.json` + `native/index.js`.

- ✅ **Zero runtime `@oh-my-pi/*` deps.** Only devDeps: `@napi-rs/cli`, `@types/bun`.
- ✅ **Bundle is small** — prebuilt NAPI addon, 5 files in `native/`.
- ❌ **HARD CONSTRAINT: `engines.bun >= 1.3.14`.** Package requires Bun runtime, not Node.
- ⚠️ **Unique value is narrow.** Provides: grep (ripgrep wrapper), find (glob), SIXEL encoding. The grep/find pieces overlap with the ripgrep + fd binaries Belmont v2.3 already plans to vendor in `bin/`. **SIXEL is the only unique value** — useful for in-terminal images, not core to v1.0.

**Conclusion (b): CONDITIONAL YES on the technical-decoupling axis, NO on the runtime-fit axis for v1.0.** v2.3 stack.md says "bun 1.x for compile output (deferred to v1.1)" — adopting pi-natives implies bringing Bun runtime in earlier than planned. **DEFER to v1.1** when Belmont migrates to Bun, then re-evaluate if SIXEL or other narrow features become valuable.

### Gate (c): conceptual borrows

**hashline** (omp/packages/coding-agent/src/hashline/ — 14 files, 2,212 LoC):
- Content-hash anchored edit grammar — claimed 61% token reduction on LLM edits.
- MIT-licensed, port-friendly TypeScript.
- **Applicable only if Belmont introduces a custom edit-tool.** v2.3 uses pi's native `edit`/`write` tools — no custom edit primitive planned for v1.0.
- **DEFER to v1.1+** if/when custom edit-tool becomes a real requirement.

**Per-role routing** (omp's default/smol/slow/plan/commit):
- Different ontology from Belmont's high/medium/low tiers. omp's roles are agent-identity (which model for which work-style); Belmont's tiers are task-difficulty (cheap-vs-expensive). They solve different problems.
- **IGNORE.** Don't conflate v2.3 §8 with omp's role grammar.

**Memory lifecycle commands** (omp's retain/recall/reflect):
- Belmont's knowledge model (subsystems/decisions/constraints/prds/episodic/steering) is purpose-built for amend-in-place + computed status. omp's lifecycle commands are imperative session-memory mutations — completely different model.
- **IGNORE.**

**Swarm extension** (omp/packages/swarm-extension/): YAML-defined multi-agent parallel pipelines. Conflicts with v2.3 §2.3 (sequential only). **IGNORE.**

**LSP / DAP / 40+ providers / 32 built-in tools:** Out of scope for v1.0. earendil pi's surface is sufficient. Reconsider in v1.x as need arises.

## Don't re-do

- **Adopt omp as Belmont's base.** Hook primitive is incompatible (shell scripts + manifests, not `pi.on(...)` factories). Architectural cost = rewrite v2.3 §4.5/§5.4/§6 from scratch.
- **Adopt `@oh-my-pi/pi-natives` in v1.0.** Bun-only engine constraint contradicts v2.3 stack.md ("bun deferred to v1.1"). Unique value (SIXEL) is niche for v1.0.
- **Pre-commit to hashline borrow in v1.0.** Useful only with a custom edit-tool, which v1.0 doesn't have.
- **Conflate omp's per-role routing with Belmont's tier system.** Different ontologies.
- **Treat earendil-works as a fork-lineage risk.** Pi's original author is co-maintaining it with Armin Ronacher (mitsuhiko); 9 versions, latest 3 days ago, deliberate release cadence.

## Consequences

- v2.3 §2 (locked constraints), §3 (architecture), §4.5 (knowledge-guard), §5.4 (scope-guard), §8 (tier system) **do not change** as a result of this evaluation.
- v2.3 §17 M0 P0-OMP is **discharged** by this ADR. M0 no longer needs to repeat the source inspection — it can read `D-001-omp-evaluation.md` and confirm the verdict in `VERDICT.md` per the existing M0 template.
- **NEW M5 task (~30 min)**: Belmont's `packages/harness/src/hooks/scope-guard.ts` and `hooks/knowledge-guard.ts` SHOULD be authored from the templates in `earendil/packages/coding-agent/examples/extensions/{protected-paths,permission-gate}.ts`. Cite the upstream files in the source comments. This saves the M5 author re-deriving the `tool_call → {block, reason}` pattern.
- **NEW v1.1 backlog entry**: re-evaluate `@oh-my-pi/pi-natives` adoption when Belmont migrates to Bun runtime. Specifically the SIXEL encoder (in-terminal image rendering) may be valuable for the panel.
- **NEW v1.1 backlog entry**: re-evaluate `hashline` adoption if a custom edit-tool becomes a real Belmont need.

## Evidence

### Sources inspected
- `git clone --depth=1 https://github.com/can1357/oh-my-pi.git` (omp v15.4.0)
- `git clone --depth=1 https://github.com/earendil-works/pi-mono.git` (`@earendil-works/pi-coding-agent` v0.75.5)
- `npm view @earendil-works/pi-coding-agent` — published 3 days ago by badlogic (Mario Zechner) + mitsuhiko (Armin Ronacher)
- `npm view @oh-my-pi/pi-natives` — v15.3.2

### Files read
- `earendil/packages/coding-agent/src/core/extensions/types.ts` (ExtensionAPI definition, lines 1084-1379)
- `earendil/packages/coding-agent/src/core/extensions/loader.ts` (registerTool, registerCommand, registerShortcut, registerMessageRenderer impls)
- `earendil/packages/coding-agent/examples/extensions/protected-paths.ts` (30 lines — scope-guard precursor)
- `earendil/packages/coding-agent/examples/extensions/permission-gate.ts` (34 lines — bash-block precursor)
- `earendil/packages/coding-agent/docs/extensions.md` (extension authoring guide)
- `earendil/packages/coding-agent/docs/sdk.md` (createAgentSession, SessionManager APIs)
- `omp/packages/coding-agent/src/capability/hook.ts` (omp's shell-script hook primitive — DIFFERENT from pi.on)
- `omp/packages/coding-agent/src/capability/extension.ts` (omp's Gemini-style manifest extensions — DIFFERENT from pi factory)
- `omp/packages/natives/package.json` + `README.md` (deps analysis, Bun-only engine constraint)
- `omp/packages/coding-agent/src/hashline/*` (14 files, 2,212 LoC — for sizing the deferred borrow)
- `omp/packages/swarm-extension/src/extension.ts` (parallel pipeline orchestration — confirms parallel-only architecture)

### Quantitative gates

| Gate | Threshold | Measured | Verdict |
|---|---|---|---|
| (a) Hook-surface equivalence | `tool_call` with pre-execution block; `turn_start`/`turn_end`; `context`; `before_agent_start`; `registerTool`/`registerCommand`/`registerShortcut`/`registerMessageRenderer` all present in earendil | ✅ ALL PRESENT | PASS |
| (b) pi-natives decoupling | Bundle delta ≤ 300KB AND transitive `@oh-my-pi/*` deps ≤ 3 | 0 runtime `@oh-my-pi/*` deps; bundle small; BUT requires Bun runtime | CONDITIONAL (defer to v1.1) |
| (c) hashline / per-role / lifecycle / swarm | Per-feature conceptual-borrow recommendation | hashline=DEFER, per-role=IGNORE, lifecycle=IGNORE, swarm=IGNORE | See §Decision |

## Revisions

- 2026-05-26 — Accepted. Source-inspection executed during planning session (before v1-rebuild branch cut). Audit trail: `~/.claude-octopus/debates/belmont-omp-debate-20260526-105143/001-belmont-vs-omp/`.
