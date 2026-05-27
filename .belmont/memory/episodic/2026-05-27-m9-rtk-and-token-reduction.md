---
schema: belmont.episode.v1
date: 2026-05-27
phase: M9
---

# 2026-05-27 — M9 RTK + token reduction + thinking-collapse enforcement

## What happened

- **RTK `user_bash` hook landed** (`packages/harness/src/hooks/rtk-bash
  .ts`). The handler is the simple shape pi 0.75.5 exposes: when
  `pi.on("user_bash", …)` fires (which only happens for the user's `!`
  / `!!` REPL commands — NOT LLM tool calls; we verified the scoping
  against pi-coding-agent dist/core/extensions/types.d.ts L555), it
  returns a custom `BashOperations` whose `exec` rewrites the command
  to `rtk <cmd>` and tee's the data stream to a `rtk gain:` trailer
  parser. The trailer parser feeds `state/rtk-stats.ts.recordRtkSavings
  (...)`. Pi's local-shell execution path is preserved by delegating
  to the re-exported `createLocalBashOperations()` (added to
  `pi/sdk.ts` as the second value re-export after `isToolCallEventType`).
  Two trailer formats are recognised (`A → B (P% saved)` primary plus
  the `saved N bytes of M (P%)` legacy variant). When real-world RTK
  emits a different shape, the regex is the single edit point —
  graceful no-op until the next bump.

- **`hooks/thinking-collapse.ts` picks up the M6 deferral** (M6 wired
  the FLAG via Ctrl+O in `tui/shortcuts.ts` + the status-bar `·
  thinking-collapse` suffix; M6 episodic noted enforcement deferred to
  M9). The hook registers on `context` — the first registration since
  D-003 reserved the slot for messages-array pruning — and on every
  fire, when `isThinkingCollapsed()===true`, walks `event.messages`,
  finds every `AssistantMessage`'s `ThinkingContent` blocks, and
  replaces the `thinking` body with `"[Thinking]"`. **`thinkingSignature`
  is PRESERVED** — that opaque encrypted payload is the multi-turn
  continuity field Anthropic's interleaved-thinking uses (per pi-ai/
  types.d.ts L151-155); dropping it would break the next turn's
  reasoning. The handler returns `{messages}` ONLY when something
  actually changed (avoids spurious pi context-cache invalidation).
  The hook's flag-getter is dependency-injected (`ThinkingCollapseDeps
  .isThinkingCollapsed`) so tests can drive both branches without
  poking the shortcuts.ts module-internal boolean.

- **`hooks/session-before-compact.ts` is an OBSERVER, not an override.**
  Returns `undefined` from every fire so pi's default compaction (or
  any other extension's custom-compaction handler) proceeds normally —
  contrast with pi-mono's `examples/extensions/custom-compaction.ts`
  which DOES override with a Gemini Flash summarisation pass. We
  observe `event.preparation.{tokensBefore, messagesToSummarize.length,
  turnPrefixMessages.length}` plus the first text line of the last 3
  assistant messages, and write a one-line bullet to
  `.belmont/memory/episodic/<date>-auto-compactions.md` (slug
  `auto-compactions`, kind `phase` per the existing EpisodeKind
  taxonomy). Failure mode: episodic write errors are caught and
  surfaced via `ctx.ui.notify(…, "warning")`. Compaction proceeds
  either way. Belmont does not want a failed memory write to interfere
  with pi's context-management.

- **`cli/rtk-detect.ts` startup probe.** `which rtk` runs via
  `child_process.spawnSync` (sync, single-shot at module init), then
  the result is cached forever. `BELMONT_RTK_DISABLE=1` short-circuits
  even the `which` call. The detector is dependency-injected
  (`setRtkDetectorForTest`) for clean test tear-down — same pattern
  M3's boot-doctor uses. The first session_start emits the warn-once
  notice via `consumeMissingRtkWarning()` + `rtkWarningMessage()`.
  Mid-session env toggles are NOT supported in v1.0; that's a v1.1
  affordance once the install runbook stabilises.

- **Live RTK status-bar slot** (`tui/status-bar.ts.modelSlot`). The M6
  comment said "RTK (-X% / Y saved) lands in M9; placeholder omitted
  to keep the status bar quiet rather than misleading." — M9 honours
  that contract by gating the suffix on `summary && summary.savedBytes
  > 0`. Format: ` · rtk: -X% (Y saved)` where `Y` is human-formatted
  via `formatBytes()` (`512B`, `1.0K`, `2.5M`, `1.0G`). When no
  trailers have been parsed this session, the suffix is empty — the
  user sees the bare `<model> · <thinking>` slot. Ctrl+L (REPL refresh
  via `commands/repl-refresh.ts`) resets the counter per §11.4
  "per-SESSION running total" framing.

- **No new pi-package imports outside pi-boundary.** `pi/sdk.ts`
  gained: one value re-export (`createLocalBashOperations`), 11 type
  re-exports from pi-coding-agent (`BashOperations`, `BashSpawnContext`,
  `BashSpawnHook`, `BashToolOptions`, `ContextEvent`,
  `SessionBeforeCompactEvent`, `SessionEntry`, `UserBashEvent`,
  `UserBashEventResult` — the bash + event surface for M9), 7 type
  re-exports from pi-ai (`Message`, `UserMessage`, `AssistantMessage`,
  `ToolResultMessage`, `TextContent`, `ThinkingContent`, `ImageContent`,
  `ToolCall` — the message-content vocabulary for the thinking-collapse
  hook), plus 3 locally-declared types: `AgentMessage` (derived from
  `ContextEvent["messages"][number]` so it auto-widens for any
  declaration-merged custom message type — currently picks up pi-coding-
  agent's `BashExecutionMessage`), `ContextEventResult` (pi doesn't
  surface it top-level), and `CompactionPreparation` (index access).
  Boundary lint + dep-cruiser both clean at 68 modules / 142 deps.

- **446 tests across 39 files** (was 381/34). +65 new: `rtk-stats.test.ts`
  (11 — counter accumulator + clamping + formatBytes), `rtk-detect.test
  .ts` (7 — cache + warn-once + injected detector), `rtk-bash.test.ts`
  (18 — trailer parsing across both formats + chunk-boundary handling +
  EOF-without-newline + idempotence + handler short-circuits),
  `thinking-collapse.test.ts` (12 — pure rewrite + signature
  preservation + idempotence + injected flag getter), `session-before-
  compact.test.ts` (9 — bullet formatter + last-N extractor + episodic
  write + notify-on-failure), plus `status-bar.test.ts` extended by
  8 cases for the new `modelSlot(..., rtkSummary)` overload and
  `formatRtkSummarySuffix` helper. No regressions in the existing 32
  test files.

## Deliberate design notes

### 1. pi-lean-ctx — DEFERRED to v1.1 (re-evaluating the M0 GO verdict)

The M0 spike at `spike/pi-lean-ctx/VERDICT.md` was GO partial: "Adopt:
context hook compression (file reads + shell output payload reshape)."
At M0 time, pi-lean-ctx exposed a `context`-hook compression layer that
composed cleanly behind RTK at user_bash.

Re-probing at M9 time (2026-05-27) found that pi-lean-ctx 3.6.21 has
pivoted to a **CLI-first shell-routing surface**:

> Pi Coding Agent extension (CLI-first) — routes bash/read/grep/find/ls
> through lean-ctx CLI for strong token savings. Optional MCP bridge
> can register advanced tools.

This is now the package's PRIMARY surface — directly conflicting with
M9's RTK at `user_bash`. The M0 VERDICT explicitly carved out this
overlap as the one "Belmont-owned" plumbing item; at the time, the
shell hook was OPTIONAL and could be disabled via lean-ctx config. The
3.6.21 reframing makes it the default behaviour, and the integration
surface now requires:

1. A working `lean-ctx` Rust binary on PATH (the npm package is a thin
   shell wrapper — install dance is hostile to v1.0's "npm install
   belmont; belmont init" smooth path per §13.1).
2. `BELMONT_LEAN_CTX_SHELL_HOOK=disabled` env handling so RTK isn't
   double-wrapped (per VERDICT.md).
3. `BELMONT_LEAN_CTX=disabled` opt-out for symmetry with
   `BELMONT_RTK_DISABLE`.
4. `belmont init` preflight `command -v lean-ctx` with install guidance.
5. Telemetry audit on first run (VERDICT.md: "Belmont's harness must
   audit on first run that telemetry remains opt-in").

That's at least half a milestone's worth of work, and ALL of it
predicated on the assumption that lean-ctx's `context`-hook surface
still ships — which the 3.6.21 description doesn't confirm.

**Decision:** defer the lean-ctx integration to v1.1. Update the M0
VERDICT in a v1.1 episodic when we re-probe.

**Impact on M9 P0-2:** the §17 done-when says "pi-lean-ctx (if M0 GO)
invoked at context BEFORE user_bash." — conditional on M0 GO. The
condition no longer cleanly holds; M9 P0-2 is satisfied by the
thinking-collapse hook on `context` (the first registration there).
The composition order in §11.5 (lean-ctx first, then thinking-collapse)
remains the contract; M9 has only the second handler, v1.1 will add
the first.

### 2. user_bash scoping is narrower than the plan summary may read

`pi.on("user_bash", …)` fires ONLY when the user types `!` or `!!` at
the REPL — NOT when the LLM/agent calls a bash tool. This is documented
upstream at pi-coding-agent dist/core/extensions/types.d.ts L555 ("Fired
when user executes a bash command via `!` or `!!` prefix"). The
distinction matters because:

- §11.1 RTK token-reduction is a USER-input wrapper, not an
  agent-output filter. Wrapping the LLM's tool calls would conflict
  with pi's built-in BashOperations contract (the agent expects exact
  output) and would also already be accounted for in pi's own token
  accounting.
- §11.4 status-bar savings counter reflects USER shell commands the
  user typed — which is the cohort whose tokens the user is paying
  for (the LLM's tool calls are paid for separately).

This matches the §11.3 "RTK is opt-in capability, not gate" framing —
RTK is a quality-of-life feature for power-users who shell out a lot
mid-REPL, not a global egress filter.

### 3. `thinkingSignature` preservation (Anthropic interleaved-thinking)

`pi-ai/types.d.ts` L151-155 documents `thinkingSignature` as:

> When true, the thinking content was redacted by safety filters. The
> opaque encrypted payload is stored in `thinkingSignature` so it can
> be passed back to the API for multi-turn continuity.

Dropping the signature on collapse would break the next turn's
reasoning for Anthropic interleaved-thinking. The hook explicitly
preserves both `thinkingSignature` and `redacted` — only the `thinking`
string body is replaced with the placeholder. Token savings come from
the body shrinkage (a real Opus thinking block is hundreds to
thousands of tokens; `"[Thinking]"` is 1 token).

### 4. `getRtkSummary()` as a module-state singleton, NOT a pi-context field

The counter lives in `state/rtk-stats.ts` as module-state — same shape
as M8's `activeAuto` singleton in `auto/loop.ts`. The reason: pi's
extension factory runs once per process, and multiple consumers
(`status-bar.ts` recompute, `commands/repl-refresh.ts` reset,
`hooks/rtk-bash.ts` record) all need access. A class with a
passed-around instance would require threading it through every
status-bar refresh trigger — singleton is the simpler shape for a
per-process counter, and matches the "one Belmont per pi run" model
the auto loop already established.

### 5. session_before_compact slug is `auto-compactions`, not `compactions`

The slug discriminates this episodic file from any future Belmont
"compactions" surface (e.g. a manual `/belmont:compact` command). The
prefix `auto-` makes it clear these entries record pi's automatic
compaction passes — distinguishing from user-initiated ones a v1.1
might add. The kind is `phase` (the existing EpisodeKind taxonomy from
state/episodic.ts), with a future option to add a dedicated
`compaction` kind if the surface grows.

### 6. No new dep added (pi-agent-core specifically NOT pulled in)

`AgentMessage` upstream is `Message | CustomAgentMessages[keyof
CustomAgentMessages]` (pi-agent-core dist/types.d.ts L271). We could
have added `pi-agent-core` as a fourth pi-* dep + widened the
pi-boundary lint to cover it. Instead, we derive AgentMessage locally
from `ContextEvent["messages"][number]` — the same union, accessed
through pi-coding-agent's already-allowed types. This keeps the
boundary AT THREE pi-* packages (pi-coding-agent + pi-tui + pi-ai)
and avoids a fourth dep-cruiser block.

## Author smoke (v2.3 §17 M9) — executed and passing

| Step | Expected | Observed |
|---|---|---|
| `pnpm build` | clean tsc (4 packages) | ✅ |
| `pnpm test` | full suite green | ✅ 446 tests across 39 files (381 prior + 65 new) |
| `pnpm dep-check` | no boundary violations (68 modules / 142 deps) | ✅ "no dependency violations found (68 modules, 142 dependencies cruised)" |
| `node packages/cli/dist/bin/belmont.js validate` against this repo | exit 0; same 5 PRD-index warnings carried from M5/M6/M7/M8 | ✅ exit 0 with 5 `PRD_INDEX_MISSING_FILE` warnings |
| Dogfood: flip M9 P0-1..P0-4 via `executeBelmontTransition` on the live `.belmont/PROGRESS.md` | each transition writes the marker (`todo`→`in_progress`→`done`→`verified`) and appends a `transition` bullet | ✅ 12 transitions (4 tasks × 3 hops), today's `progress-transitions.md` extended with 12 bullets |
| Pi-boundary still green w/ M9 surfaces added | no harness file outside `src/pi/` imports `@earendil-works/pi-{coding-agent,tui,ai}` | ✅ AST regex confirms; sdk.ts is still the sole importer for all three |
| §11.3 graceful-degrade when rtk is missing | startup notify fires once; subsequent `session_start` events do not re-warn; user_bash commands pass through untouched | ✅ `consumeMissingRtkWarning()` single-shot; `isRtkAvailable() → false` short-circuits the handler |
| §11.4 status-bar slot lights up when records accumulate | `recordRtkSavings({savedBytes: 1024, originalBytes: 2048})` followed by a recompute renders `… · rtk: -50% (1.0K saved)` | ✅ `status-bar.test.ts` "M9: picks up live rtk-stats counter into the model slot" |
| §6.4 thinking-collapse rewrites assistant thinking blocks | flag ON → ThinkingContent.thinking → `"[Thinking]"`; signature preserved | ✅ `thinking-collapse.test.ts` |
| session_before_compact writes an episodic snapshot then returns undefined | pi's default compaction proceeds; episodic file gets a bullet | ✅ `session-before-compact.test.ts` |

## What's next

Session 10 → **M10 — MCP bridge** per v2.3 §17 M10. First milestone
that lands `.belmont/mcp.json` (Claude-compatible `mcpServers.*`
schema), the blast-radius gate (`"auto": true` opt-in required for
unattended auto mode per §12.3), the `.belmont/mcp-tools-cache.json`
tool-metadata cache + audit, and the buy/build decision wired from the
M0 `pi-mcp-adapter` spike (which was GO conditional — VERDICT.md
documents the `auto`-gate as Belmont-owned, the rest is upstream).

M10 is also the milestone where the `mcp_servers` BELMONT.md frontmatter
field starts to matter — currently parsed but unused; M10 turns it
into routing data.
