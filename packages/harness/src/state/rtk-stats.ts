// RTK savings counter — the per-session running total surfaced in the
// status bar's `belmont.model` slot (v2.3 §11.4 + §6.1).
//
// "Per-session" means the counter resets on every Ctrl+L REPL refresh
// (commands/repl-refresh.ts calls `resetRtkStats()` alongside
// `invalidateModelsJsonSnapshot()`), and on `session_start` events
// (extension.ts re-registers it). It does NOT survive across `pi` runs;
// that would require a `.belmont/rtk-stats.json` ledger, which v1.0
// explicitly defers (§11 leaves cross-session tallies to v1.1 once the
// `rtk gain --since` semantic stabilises).
//
// The counter is fed by hooks/rtk-bash.ts: every user-typed `!`/`!!`
// command that gets wrapped through `rtk` has its stderr/stdout scanned
// for `rtk gain:` trailers (the canonical format documented in
// hooks/rtk-bash.ts), parsed into {originalBytes, savedBytes}, and
// pushed here via `recordRtkSavings`.
//
// Graceful degradation: if the underlying RTK build does not emit
// trailers (or emits them in an unrecognised format), the counter stays
// at zero and `getRtkSummary()` returns undefined — the status bar's
// model slot then drops the `· rtk: …` suffix entirely (no misleading
// 0% display). This is the desired behaviour per §11.3's "RTK is opt-in
// capability, not gate."

export interface RtkSavingsRecord {
  /** Bytes the underlying command would have emitted without RTK. */
  originalBytes: number;
  /** Bytes saved by RTK's filtering (≤ originalBytes). */
  savedBytes: number;
}

export interface RtkSummary {
  /** Sum of `savedBytes` across every recorded command this session. */
  savedBytes: number;
  /** Sum of `originalBytes` — denominator for `percent`. */
  originalBytes: number;
  /** Integer percent (`0..100`) of `savedBytes / originalBytes`. */
  percent: number;
  /** Number of `recordRtkSavings` calls — useful for diagnostics. */
  commandCount: number;
}

// Module-scope state — the singleton lives here for the same reason
// `activeAuto` lives in auto/loop.ts: pi's extension factory runs once
// per process, and the harness consumes the counter from multiple
// callsites (status-bar.ts + commands/repl-refresh.ts + hooks/rtk-bash
// .ts). A class with a passed-around instance would require threading
// the instance through every status-bar refresh trigger — singleton is
// the simpler shape for a per-process counter.
let savedBytesTotal = 0;
let originalBytesTotal = 0;
let commandCountTotal = 0;

export function recordRtkSavings(record: RtkSavingsRecord): void {
  // Defensive clamping — a malformed trailer that produced
  // savedBytes > originalBytes (impossible in valid RTK output) would
  // otherwise spike the percent display. Cap saved at original.
  const saved = Math.max(0, Math.min(record.savedBytes, record.originalBytes));
  const original = Math.max(0, record.originalBytes);
  savedBytesTotal += saved;
  originalBytesTotal += original;
  commandCountTotal += 1;
}

export function getRtkSummary(): RtkSummary | undefined {
  if (commandCountTotal === 0) return undefined;
  const percent =
    originalBytesTotal === 0
      ? 0
      : Math.round((savedBytesTotal / originalBytesTotal) * 100);
  return {
    savedBytes: savedBytesTotal,
    originalBytes: originalBytesTotal,
    percent,
    commandCount: commandCountTotal,
  };
}

export function resetRtkStats(): void {
  savedBytesTotal = 0;
  originalBytesTotal = 0;
  commandCountTotal = 0;
}

/** Human-readable byte string (`1.2K`, `345B`, `2.3M`). Used by the
 *  status-bar's `rtk: -X% (Y saved)` slot rendering. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
