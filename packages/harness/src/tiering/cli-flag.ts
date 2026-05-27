// Parser for the `--tier <agent>=<value>` CLI flag (Layer 1 of the
// §9.2 resolver priority).
//
// Grammar reuses `parseOverlayString` from knowledge-schema — the CLI
// flag format is identical to the per-milestone overlay token grammar
// (e.g. `implementation=high+anthropic/claude-sonnet-4-6:high`). M7
// lands the parser + plumbing through resolveTier; M8 wires the actual
// `/belmont:auto --tier …` arg parsing into runAuto.

import {
  type Diagnostic,
  type OverlayTokens,
  parseOverlayString,
} from "@belmont/knowledge-schema";

export type ParseCliTierFlagsResult = {
  overrides: OverlayTokens;
  warnings: Diagnostic[];
};

/**
 * Parse one or more --tier flag values into an OverlayTokens map.
 * Multiple values (`--tier a=high --tier b=low`) merge right-to-left
 * (last wins).
 */
export function parseCliTierFlags(values: readonly string[]): ParseCliTierFlagsResult {
  const overrides: OverlayTokens = {};
  const warnings: Diagnostic[] = [];
  for (const v of values) {
    const r = parseOverlayString(v, "<cli>");
    warnings.push(...r.warnings);
    if (r.overlay) Object.assign(overrides, r.overlay);
  }
  return { overrides, warnings };
}
