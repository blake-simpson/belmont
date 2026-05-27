// RTK user_bash hook — wraps user-typed `!`/`!!` shell commands with
// the `rtk` token-reduction proxy.
//
// v2.3 §17 M9 P0-1: "rtk gain invoked transparently for user bash when
// rtk is on PATH and BELMONT_RTK_DISABLE is unset."
//
// Scope (CRITICAL — easy to misread):
//   - `user_bash` ONLY fires for USER-typed `!`/`!!` REPL commands (see
//     pi-coding-agent dist/core/extensions/types.d.ts L555: "Fired when
//     user executes a bash command via ! or !! prefix"). LLM-issued
//     bash tool calls go through `tool_call` / `tool_execution_*` and
//     are NOT intercepted by this hook. This is per §11.1 scoping —
//     RTK is a USER-input wrapper, not an agent-output filter. The
//     agent's tool calls already pay their own token cost in pi's
//     accounting; double-wrapping would also conflict with pi's
//     built-in BashOperations contract (the agent expects exact output).
//
//   - The wrap is COMPLETELY transparent — pi's local-shell execution
//     semantics are preserved by delegating to `createLocalBashOperations
//     ()` (re-exported through pi/sdk.js). Only the command STRING is
//     rewritten from `cmd` → `rtk cmd`; cwd, env, timeouts, abort
//     signals all pass through unchanged.
//
//   - Idempotence: if the user already typed `rtk <something>`
//     manually, we skip the second wrap (no `rtk rtk git status`).
//
// RTK gain trailer parsing:
//   RTK is expected (per §11.4) to emit a one-line trailer like
//   `rtk gain: <orig> → <kept> (<percent>% saved)` to stderr (or
//   stdout) at the END of each wrapped command. We tee `onData` to a
//   line-buffered parser that scans for this trailer and feeds the
//   record into state/rtk-stats.ts.
//
//   The canonical trailer formats we recognise (single regex, multiple
//   capture groups handle both):
//     "rtk gain: 1234 → 567 (54% saved)"        ← primary
//     "rtk gain: saved 567 bytes of 1234 (54%)" ← legacy variant
//
//   If real-world RTK emits a different format, this regex is the
//   single edit point — the status-bar slot is data-driven and degrades
//   to empty when the parser fires zero times (the §11.3 graceful-
//   degradation contract).
//
//   We DO NOT strip the trailer from the output the user sees, so the
//   user still gets visual confirmation. This matches the RTK CLAUDE.md
//   "transparent, 0 tokens overhead" wording — the trailer is one line,
//   visible, and serves as the human confirmation of token savings.
//
// Pi-mono upstream lineage (per D-001-omp-evaluation):
//   - examples/extensions/bash-spawn-hook.ts — the createBashTool +
//     spawnHook + custom-operations pattern. We adapt it to the
//     user_bash event surface rather than registering a tool definition.
//   - The `createLocalBashOperations` factory (pi-coding-agent
//     0.75.5) ships exactly for this case: "useful for extensions that
//     intercept user_bash and still want pi's standard local shell
//     behavior while wrapping or rewriting commands" (bash.d.ts L37-40).

import { createLocalBashOperations } from "../pi/sdk.js";
import type {
  BashOperations,
  ExtensionAPI,
  UserBashEvent,
  UserBashEventResult,
} from "../pi/sdk.js";
import { isRtkAvailable } from "../cli/rtk-detect.js";
import { recordRtkSavings } from "../state/rtk-stats.js";

// Trailer regex. Two alternatives joined; the first matched group set
// is the one we use.
//   Group 1: original bytes (primary format)
//   Group 2: kept bytes (primary format)
//   Group 3: saved bytes (legacy format)
//   Group 4: original bytes (legacy format)
const RTK_GAIN_TRAILER_RE =
  /^\s*rtk\s+gain:\s+(?:(\d+)\s*[→>]+\s*(\d+)|saved\s+(\d+)\s+bytes\s+of\s+(\d+))/im;

export function parseRtkGainTrailer(
  line: string,
): { originalBytes: number; savedBytes: number } | undefined {
  const match = RTK_GAIN_TRAILER_RE.exec(line);
  if (!match) return undefined;
  if (match[1] !== undefined && match[2] !== undefined) {
    const original = Number(match[1]);
    const kept = Number(match[2]);
    if (!Number.isFinite(original) || !Number.isFinite(kept)) return undefined;
    const saved = Math.max(0, original - kept);
    return { originalBytes: original, savedBytes: saved };
  }
  if (match[3] !== undefined && match[4] !== undefined) {
    const saved = Number(match[3]);
    const original = Number(match[4]);
    if (!Number.isFinite(saved) || !Number.isFinite(original)) return undefined;
    return { originalBytes: original, savedBytes: saved };
  }
  return undefined;
}

/** Already-rtk-wrapped commands shouldn't be double-wrapped.
 *  Matches `rtk <args>` (with optional leading whitespace) — accepts
 *  `rtk gain`, `rtk discover`, `rtk proxy <cmd>`, etc. */
const ALREADY_RTK_RE = /^\s*rtk(?:\s|$)/;

export function shouldWrapCommand(command: string): boolean {
  return !ALREADY_RTK_RE.test(command);
}

/** Rewrite a raw user command to its RTK-wrapped form. Idempotent —
 *  passing an already-wrapped command returns it unchanged. */
export function rewriteCommand(command: string): string {
  if (!shouldWrapCommand(command)) return command;
  // Preserve leading whitespace (rare but harmless), append `rtk ` to
  // the first non-whitespace position.
  const leadingMatch = /^(\s*)(.*)$/s.exec(command);
  if (!leadingMatch) return `rtk ${command}`;
  return `${leadingMatch[1]}rtk ${leadingMatch[2]}`;
}

/** Build a BashOperations that rewrites the command, captures the
 *  output stream for `rtk gain:` trailer parsing, and delegates to
 *  pi's local-shell executor for the actual run. Exported for tests. */
export function buildRtkBashOperations(
  underlying: BashOperations = createLocalBashOperations(),
): BashOperations {
  return {
    async exec(command, cwd, options) {
      const rewritten = rewriteCommand(command);
      // Line-buffer the streamed output to parse the trailer reliably
      // even when RTK flushes it across chunk boundaries.
      let pendingLine = "";
      const wrappedOnData = (data: Buffer): void => {
        pendingLine += data.toString("utf8");
        let newlineIdx = pendingLine.indexOf("\n");
        while (newlineIdx !== -1) {
          const line = pendingLine.slice(0, newlineIdx);
          const record = parseRtkGainTrailer(line);
          if (record) recordRtkSavings(record);
          pendingLine = pendingLine.slice(newlineIdx + 1);
          newlineIdx = pendingLine.indexOf("\n");
        }
        options.onData(data);
      };
      const result = await underlying.exec(rewritten, cwd, {
        ...options,
        onData: wrappedOnData,
      });
      // Drain any final line that didn't end with `\n` (RTK trailers
      // often skip the trailing newline).
      if (pendingLine.length > 0) {
        const record = parseRtkGainTrailer(pendingLine);
        if (record) recordRtkSavings(record);
      }
      return result;
    },
  };
}

/** Registration entry point — wired from extension.ts. The handler
 *  returns `{operations}` when RTK is in play, or `undefined` (no-op)
 *  otherwise so pi's default user_bash execution path runs. */
export function registerRtkBashHook(pi: ExtensionAPI): void {
  pi.on(
    "user_bash",
    (event: UserBashEvent): UserBashEventResult | undefined => {
      if (!isRtkAvailable()) return undefined;
      if (!shouldWrapCommand(event.command)) return undefined;
      return { operations: buildRtkBashOperations() };
    },
  );
}
