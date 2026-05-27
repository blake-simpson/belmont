// In-memory snapshot of the parsed `.belmont/models.json` for the
// running session.
//
// Why a singleton: the resolver (`tiering/resolve.ts`) is pure; it
// expects the parsed `ModelsJson` shoved in by the caller. Both the
// `/belmont:models …` command surface (interactive, low-rate) and the
// M8 auto loop (per-task, hotter) read from the same cached snapshot
// so a single edit to models.json shows up everywhere consistently.
//
// Invalidation:
//   - session_start: extension.ts loads + primes the cache.
//   - /belmont:repl-refresh (Ctrl+L): invalidates so the next read
//     picks up edits the user made mid-session.
//   - On error during load, the previous good snapshot is preserved
//     (so a transient JSON syntax error while the user is editing
//     models.json doesn't strand the rest of the harness).

import { loadModelsJson, type LoadModelsJsonResult } from "./models-json.js";

let cached: LoadModelsJsonResult | undefined;

export function getCachedModelsJson(): LoadModelsJsonResult | undefined {
  return cached;
}

export async function refreshModelsJsonSnapshot(
  projectRoot: string,
): Promise<LoadModelsJsonResult> {
  const result = await loadModelsJson(projectRoot);
  // Only overwrite the cache on success OR when there's no prior cache
  // — see the rationale comment above (preserve last-known-good).
  if (result.ok || cached === undefined) {
    cached = result;
  }
  return result;
}

export function invalidateModelsJsonSnapshot(): void {
  cached = undefined;
}

/** Test-only — reset the module state. */
export function _resetSnapshotForTests(): void {
  cached = undefined;
}
