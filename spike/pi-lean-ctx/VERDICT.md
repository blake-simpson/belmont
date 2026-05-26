# pi-lean-ctx — GO (partial adoption)

**Pin.** `pi-lean-ctx@3.6.17` (very actively maintained — 40+ versions
across 3.x; latest in the 3.6.x band). Peer-depends on
`@earendil-works/pi-coding-agent >= 0.50.0` and `@earendil-works/pi-tui`.

**Repository.** https://github.com/yvgude/lean-ctx (the `packages/pi-lean-ctx`
sub-tree in the `lean-ctx` monorepo). Upstream binary is `lean-ctx` on
crates.io + AUR + npm (`lean-ctx-bin`). The pi-specific wrapper is the
package we depend on.

## Deciding criterion (§11.2 + §11.3)

| Gate | Status | Evidence |
|---|---|---|
| 1. Hooks pi's `context` event (not just shell) | ✅ | The README's "Layer 1: Compression" and the package's role within the leanCTX architecture describe MCP-tool registration (62 `ctx_*` tools) plus a `context`-time compression pass. The MCP-tool surface is the load-bearing piece for Belmont. |
| 2. Does NOT rewrite tool calls; only compresses payloads | ✅ | Compression is structural (tree-sitter AST for 21 languages, 56 pattern modules, 10 read modes) applied to the payloads pi already produces — file reads, shell output. The tool-call shape (name + args) is unchanged. |
| 3. Composes AFTER RTK at `user_bash` without double-wrap | ⚠️ Belmont-owned | leanCTX's own shell hook (the "transparently compresses common commands" path) **overlaps** with v2.3 §11.1's RTK at `user_bash`. Belmont must enable the `context`-hook + MCP-tools features and **disable** the shell-hook surface. Mechanism: the leanCTX config (in `~/.config/lean-ctx/` or equivalent) supports per-feature toggles; Belmont's `belmont init` writes the recommended config; the harness env-checks `BELMONT_LEAN_CTX_SHELL_HOOK=disabled` before bootstrap. |
| 4. Opt-out path exists | ✅ | The leanCTX binary is independently configurable; `BELMONT_LEAN_CTX=disabled` is the planned Belmont-side opt-out (mirrors `BELMONT_RTK_DISABLE` for symmetry). |

## What we adopt vs decline

**Adopt:**

- `context` hook compression (file reads + shell output payload reshape).
- Selected `ctx_*` MCP tools when they map to v2.3 milestones (e.g.
  `ctx_search`, `ctx_read` modes for M2/M3, `ctx_handoff` is
  out-of-scope for v1.0 single-runtime auto).
- Session memory layer (Layer 2) — useful for cross-session continuity
  in `.belmont/memory/episodic/`. Locked decision M8/M9 whether to
  surface this to the user or keep it adapter-internal.

**Decline (defer to v1.1+):**

- leanCTX's shell hook (collides with RTK at `user_bash`; §11.3
  ordering is RTK-first, lean-ctx-second).
- Multi-agent layer (`ctx_agent`, `ctx_handoff`) — Belmont v1.0 is
  strictly sequential per §2 locked constraint.
- Property graph + LSP refactor (`ctx_refactor`) — large surface
  outside v1.0 scope.

## Risks

- leanCTX is a Rust binary distributed alongside the npm wrapper. Install
  is `pi install npm:pi-lean-ctx` which pulls the host binary via
  `lean-ctx-bin`. v1.0's npm-only distribution channel (§13.1) is
  compatible, but the binary needs a working `cargo`/prebuilt path. M9
  (`belmont install`) preflight must `command -v lean-ctx` and offer
  install guidance.
- Telemetry: leanCTX advertises "Opt-in Only". Belmont's harness must
  audit on first run that telemetry remains opt-in (no surprise data
  egress when `belmont auto` fires).
- Active development at 3.6.x: minor releases ship 1–3 weeks apart.
  v1.0 must exact-pin and bump deliberately. Update runbook: re-run
  this probe + the §11.2 acceptance gates on each minor bump.

## Re-evaluation triggers

- pi-lean-ctx major-version bump (currently 3.x).
- `@earendil-works/pi-coding-agent` major bump (currently `>=0.50.0`
  peer; tighten to exact-pin once Belmont decides the pi peer for v1.0).
- The user actually needs cross-session memory beyond what
  `.belmont/memory/episodic/` provides — promotes leanCTX Layer 2 from
  optional to required.
