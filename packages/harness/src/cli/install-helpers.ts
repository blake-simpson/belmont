// Helpers used by @belmont/cli's `belmont install` (§13.2) and
// `belmont update` (§13.3) subcommands. These live in the harness so
// the CLI never has to reach across the dep boundary into
// @belmont/skills directly (dep direction: cli → harness → skills →
// knowledge-schema).
//
// All FS / network / spawn — no pi imports — so the pi-boundary lint
// is irrelevant here. The single coupling these introduce is between
// @belmont/cli's `belmont install` and the skills composer.

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { bundledSourceDir, compose, type ComposeResult } from "@belmont/skills";

import {
  consumeMissingRtkWarning,
  detectRtk,
  rtkWarningMessage,
  type RtkDetectResult,
} from "./rtk-detect.js";

/** Cross-harness skill discovery target. Resolved per-call so test
 *  harnesses can re-point HOME mid-process. Materialized into
 *  `~/.agents/skills/` (flat) with `belmont-` prefixed dir names so
 *  Codex CLI / Cursor / Claude Code / vanilla pi pick the same
 *  canonical SKILL.md bodies up WITHOUT colliding on names like
 *  `prototype` / `plan` / `debug` that vanilla third-party skills
 *  also publish. The `belmont-` prefix lives at install time
 *  (compose's `namespacePrefix`), not in the canonical sources. Copies,
 *  not symlinks — Windows-portability + content-hashed idempotence.
 *
 *  D-9 evolution (M11 §18 fix): the original D-9 design installed to
 *  `~/.agents/skills/belmont/<slug>/`. Pi's auto-discovery sweeps that
 *  sub-tree and registers each frontmatter `name: <slug>` — which
 *  collides with vanilla `~/.agents/skills/<slug>/` of the same name
 *  (Blake hit this for `prototype`). The flat-with-prefix layout
 *  resolves the collision while keeping the cross-harness intent. */
export function defaultSkillsTarget(): string {
  return join(homedir(), ".agents", "skills");
}

/** Cross-harness namespace prefix per D-4 (the M11 ADR amending D-9).
 *  Set on every cross-harness materialization; canonical harness use
 *  (in-process compose for skill bodies) does NOT set the prefix. */
export const CROSS_HARNESS_PREFIX = "belmont-";

export type SkillsMaterializeReport = ComposeResult & {
  target: string;
  source: string;
  namespacePrefix: string;
};

/** Materialize the 8 canonical SKILL.md sources into `target`
 *  (default: ~/.agents/skills/) with the `belmont-` namespace prefix
 *  so the resulting directory layout is
 *  `~/.agents/skills/belmont-{working-backwards,plan,...}/SKILL.md`.
 *  Idempotent via the content-hash check inside `compose()` — running
 *  this twice on a clean tree produces zero file writes. */
export async function materializeBelmontSkills(
  target?: string,
): Promise<SkillsMaterializeReport> {
  const resolvedTarget = target ?? defaultSkillsTarget();
  const source = bundledSourceDir();
  const result = await compose({
    source,
    target: resolvedTarget,
    namespacePrefix: CROSS_HARNESS_PREFIX,
  });
  return {
    ...result,
    target: resolvedTarget,
    source,
    namespacePrefix: CROSS_HARNESS_PREFIX,
  };
}

export type RtkPreflightOutcome = {
  /** Probe result. */
  rtk: RtkDetectResult;
  /** One-line human-readable summary; ALWAYS safe to print. */
  message: string;
  /** True when the warn-once gate just fired (so callers can decide
   *  to emit louder banners in that one case). */
  firstWarning: boolean;
};

/** CLI-flavoured RTK probe wrapping the harness's interactive
 *  detector. Used by `belmont install` to print exactly one preflight
 *  line — the contract is "warn + continue", never hard-fail (D-3
 *  tiered strictness). */
export function runRtkPreflight(): RtkPreflightOutcome {
  const rtk = detectRtk();
  if (rtk.available) {
    const versionTail = rtk.version ? ` (${rtk.version})` : "";
    return {
      rtk,
      message: `rtk: detected${versionTail}.`,
      firstWarning: false,
    };
  }
  const firstWarning = consumeMissingRtkWarning();
  return { rtk, message: rtkWarningMessage(rtk), firstWarning };
}

/** Existence probe — `fs.access` rejects on miss, so wrap in a boolean.
 *  Used in `belmont install` to gate the models-doctor step. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
