// rtk CLI detection — fired once per process at extension `session_start`
// (extension.ts) and cached forever afterwards.
//
// v2.3 §11.3: "RTK is opt-in capability, not gate. If rtk is not on
// PATH, warn once at startup, then pass-through every user_bash
// unmodified. No hard-fail." This module is the cache that backs that
// contract — the bash hook (hooks/rtk-bash.ts) reads `isRtkAvailable()`
// at every `user_bash` event and, if false, returns undefined so pi's
// default execution path runs without modification.
//
// `BELMONT_RTK_DISABLE=1` is the project-level opt-out (v2.3 §11.2).
// We honour it here as an early short-circuit so even `which rtk` is
// skipped (one fewer syscall per process). Mid-session toggles are NOT
// supported in v1.0 — the env is read at module init only.
//
// `node:child_process.spawnSync` is used over `pi.exec` because:
//   (a) we need a synchronous, single-shot answer at startup before the
//       first `user_bash` event can fire;
//   (b) we're checking a binary's presence, not running a command in
//       pi's bash tool sandbox; `pi.exec` would route through pi's tool
//       infrastructure and emit an unnecessary tool_execution_* event;
//   (c) `which` (or `where` on Windows) is the standard probe and
//       works identically across darwin/linux. Windows-portability is
//       deferred to v1.1 per §13.1 ("npm-only distribution, posix-first").
//
// Tests inject the detector via `setRtkDetectorForTest(fn)` instead of
// touching the global cache directly — this keeps the module-state
// singleton behaviour while enabling clean tear-down between cases.

import { spawnSync } from "node:child_process";

export interface RtkDetectResult {
  /** True if `rtk` is on PATH AND `BELMONT_RTK_DISABLE` is unset. */
  available: boolean;
  /** Reason `available` is false (for status-bar diagnostics + the
   *  warn-once notice). undefined when available is true. */
  reason?: "disabled_via_env" | "not_on_path";
  /** Captured `rtk --version` output when available; useful for
   *  /belmont:status reporting. undefined if probe failed. */
  version?: string;
}

export type RtkDetector = () => RtkDetectResult;

const DEFAULT_DETECTOR: RtkDetector = () => {
  if (process.env.BELMONT_RTK_DISABLE === "1") {
    return { available: false, reason: "disabled_via_env" };
  }
  // `which rtk` exits 0 with the path on stdout when present, non-zero
  // when absent. spawnSync.status is null on signal-kill (treated as
  // not-present here — same outcome).
  const probe = spawnSync("which", ["rtk"], { encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout.trim()) {
    return { available: false, reason: "not_on_path" };
  }
  // Best-effort version capture. Failure (older rtk, slow start) is
  // non-fatal — availability still flips to true.
  const versionProbe = spawnSync("rtk", ["--version"], {
    encoding: "utf8",
    timeout: 1000,
  });
  const version =
    versionProbe.status === 0 ? versionProbe.stdout.trim() || undefined : undefined;
  return { available: true, version };
};

let detector: RtkDetector = DEFAULT_DETECTOR;
let cached: RtkDetectResult | undefined;
let missingWarned = false;

/** Force a re-detect on next call. Test-only. */
export function resetRtkDetectCache(): void {
  cached = undefined;
  missingWarned = false;
}

/** Swap the probe for tests. Pass `undefined` to restore the default. */
export function setRtkDetectorForTest(fn: RtkDetector | undefined): void {
  detector = fn ?? DEFAULT_DETECTOR;
  cached = undefined;
  missingWarned = false;
}

export function detectRtk(): RtkDetectResult {
  if (cached === undefined) {
    cached = detector();
  }
  return cached;
}

export function isRtkAvailable(): boolean {
  return detectRtk().available;
}

/** Returns true the FIRST time it's called after detection landed on a
 *  missing-or-disabled result; false on every subsequent call. The
 *  startup notification in extension.ts uses this to print once. */
export function consumeMissingRtkWarning(): boolean {
  const result = detectRtk();
  if (result.available) return false;
  if (missingWarned) return false;
  missingWarned = true;
  return true;
}

/** Build the user-facing one-line warning text for the missing/disabled
 *  cases. Kept here next to the reason codes so the strings stay in
 *  lockstep. */
export function rtkWarningMessage(result: RtkDetectResult): string {
  if (result.available) return "";
  if (result.reason === "disabled_via_env") {
    return "RTK token-reduction disabled via BELMONT_RTK_DISABLE=1.";
  }
  return "RTK not on PATH — user bash commands run unwrapped. Install rtk to enable token-reduction wrapping. (Set BELMONT_RTK_DISABLE=1 to silence this notice.)";
}
