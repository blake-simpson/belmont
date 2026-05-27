// Ctx-weight indicator thresholds.
//
// v2.3 §9.1 defines `models.json#ctx_thresholds`:
//   { "amber": 80000, "red": 120000 }
//
// M6 reads this at session_start. When `.belmont/models.json` is
// absent, malformed, or doesn't carry the `ctx_thresholds` field, the
// §9.1 defaults apply — that way every project boots into the 80k/120k
// boundaries even before the M7 models doctor runs.
//
// Pi-mono lineage (D-001): `examples/extensions/border-status-editor.ts`
// reads `ctx.getContextUsage()` the same way and renders a percentage
// next to the model label; M6 adds the discrete 🟢/🟡/🔴 indicator that
// §6.1 specifies for the Belmont status bar slot.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type CtxLevel = "green" | "amber" | "red" | "unknown";

export interface CtxThresholds {
  amber: number;
  red: number;
}

/** §9.1 defaults — used when models.json is missing or omits ctx_thresholds. */
export const DEFAULT_CTX_THRESHOLDS: CtxThresholds = {
  amber: 80_000,
  red: 120_000,
};

/**
 * Map a token count to the §9.1 traffic-light bucket.
 *
 * Boundaries are inclusive on the upper side: tokens === amber is amber,
 * tokens === red is red. `null` (post-compaction state where pi cannot
 * estimate yet) becomes "unknown" so the indicator renders dimmed.
 */
export function classifyCtxLevel(
  tokens: number | null,
  thresholds: CtxThresholds = DEFAULT_CTX_THRESHOLDS,
): CtxLevel {
  if (tokens === null || !Number.isFinite(tokens)) return "unknown";
  if (tokens >= thresholds.red) return "red";
  if (tokens >= thresholds.amber) return "amber";
  return "green";
}

const LEVEL_GLYPHS: Record<CtxLevel, string> = {
  green: "🟢",
  amber: "🟡",
  red: "🔴",
  unknown: "·",
};

/** Glyph for the indicator slot ("🟢"/"🟡"/"🔴"/"·"). */
export function ctxLevelGlyph(level: CtxLevel): string {
  return LEVEL_GLYPHS[level];
}

/**
 * Read `.belmont/models.json` and pluck `ctx_thresholds`.
 *
 * Tolerant: missing file → defaults; malformed JSON → defaults; missing
 * keys → defaults; non-number values → defaults. We never throw here —
 * the status bar must paint even when the project's models.json is
 * being edited (and would otherwise transiently fail to parse).
 */
export async function readCtxThresholds(cwd: string): Promise<CtxThresholds> {
  let raw: string;
  try {
    raw = await readFile(join(cwd, ".belmont", "models.json"), "utf8");
  } catch {
    return DEFAULT_CTX_THRESHOLDS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_CTX_THRESHOLDS;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_CTX_THRESHOLDS;
  const ctx = (parsed as Record<string, unknown>)["ctx_thresholds"];
  if (!ctx || typeof ctx !== "object") return DEFAULT_CTX_THRESHOLDS;
  const amber = (ctx as Record<string, unknown>)["amber"];
  const red = (ctx as Record<string, unknown>)["red"];
  const amberNum = typeof amber === "number" && Number.isFinite(amber) ? amber : DEFAULT_CTX_THRESHOLDS.amber;
  const redNum = typeof red === "number" && Number.isFinite(red) ? red : DEFAULT_CTX_THRESHOLDS.red;
  // If the user has them in the wrong order, repair silently — amber must
  // be the lower bound. (A noisy diagnostic is M7 models-doctor territory.)
  if (amberNum > redNum) {
    return { amber: redNum, red: amberNum };
  }
  return { amber: amberNum, red: redNum };
}

/** Pretty `ctx 42k 🟢` text for the status bar slot. */
export function formatCtxStatus(
  tokens: number | null,
  thresholds: CtxThresholds = DEFAULT_CTX_THRESHOLDS,
): string {
  const level = classifyCtxLevel(tokens, thresholds);
  if (tokens === null || level === "unknown") {
    return `ctx — ${ctxLevelGlyph(level)}`;
  }
  const k = Math.round(tokens / 1000);
  return `ctx ${k}k ${ctxLevelGlyph(level)}`;
}
