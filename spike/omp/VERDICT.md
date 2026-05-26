# omp (oh-my-pi) — NO-GO as base; CONDITIONAL leaf-package adoption deferred to v1.1

**Pin.** None for v1.0. Re-probe candidates for v1.1: `@oh-my-pi/pi-natives`
(deferred — requires Bun runtime per `engines.bun >= 1.3.14`), `hashline`
edit grammar (deferred — only useful if Belmont introduces a custom
edit-tool, which v1.0 does not).

**Audit trail.** `.belmont/memory/decisions/D-001-omp-evaluation.md`
(executed during the planning session, before `v1-rebuild` was cut —
P0-OMP DISCHARGED per v2.3 §17 M0).

## Deciding criterion

- **HARD NO on omp-as-base** because omp's "hooks" are user-supplied
  shell scripts at `pre:<tool>`/`post:<tool>` paths (Claude-Code-style
  filesystem hooks), and its "extensions" are Gemini-style manifests.
  Neither primitive is structurally equivalent to pi's `ExtensionAPI`
  factory function with `pi.on(...)` event subscription. Belmont's
  v2.3 §4.5 / §5.4 designs use `pi.on("tool_call", ...)` returning
  `{block: true, reason, suggestion}` — that pattern **cannot be
  ported** to omp without rewriting every hook as either a shell script
  or a manifest extension, losing the typed, in-process,
  deterministic-rejection-payload semantics the knowledge-guard depends
  on. (D-001 §"omp's 'hooks' are a DIFFERENT primitive — HARD NO".)
- **CONDITIONAL leaf-package adoption** is deferred to v1.1 because:
  - `@oh-my-pi/pi-natives` has **zero runtime `@oh-my-pi/*` deps**
    (technically clean to adopt) BUT requires Bun runtime, which v1.0
    explicitly does not use (npm distribution channel per §13.1).
  - The unique value of pi-natives is SIXEL (in-terminal image
    rendering); grep/find pieces overlap with our planned fd/rg vendor.
    Not load-bearing for v1.0.
  - `hashline` is a content-hash-anchored edit grammar — only useful
    with a custom edit-tool, which v1.0 deliberately doesn't have
    (pi's native `edit`/`write` are the v1.0 contract).

## What v1.0 takes from omp anyway (free conceptual borrows)

None for adoption, but **two upstream examples cited** for v1.0
implementation lineage:
- `earendil/packages/coding-agent/examples/extensions/protected-paths.ts`
  (30 lines, identical `tool_call → {block, reason}` pattern) — template
  for `@belmont/harness/src/hooks/knowledge-guard.ts` per D-001
  §Consequences.
- `earendil/packages/coding-agent/examples/extensions/permission-gate.ts`
  (34 lines, `ctx.ui.confirm()` pattern) — template for the bash-block
  flow.

Both upstream sources are in earendil-works' `pi-mono` repo, NOT in
omp. Cite the upstream files in source comments when the M5 author
lands these hooks.

## Re-evaluation triggers

- Belmont migrates to Bun runtime (currently v1.1 backlog per
  `.belmont/memory/stack.md`) → re-probe `@oh-my-pi/pi-natives`,
  specifically the SIXEL encoder for in-panel images.
- Belmont introduces a custom edit-tool (no v1.x milestone planned) →
  re-probe `hashline` for content-hash-anchored edit grammar.

## Cross-references

- `.belmont/memory/decisions/D-001-omp-evaluation.md` — the durable
  ADR, including 4-round debate audit trail.
- Audit folder:
  `~/.claude-octopus/debates/belmont-omp-debate-20260526-105143/001-belmont-vs-omp/`
  (4 rounds, 4 participants, synthesis.md).
