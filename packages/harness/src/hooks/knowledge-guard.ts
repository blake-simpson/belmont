// hooks/knowledge-guard.ts — the `tool_call` write/edit gate for
// .belmont/ knowledge files.
//
// Authored from earendil-works' shipped extension example
//   packages/coding-agent/examples/extensions/protected-paths.ts (30 LOC,
//   `pi.on("tool_call", …) → { block: true, reason }` pattern).
// Lineage cited per D-001-omp-evaluation §Decision item 5 and the M5
// "Implementation hint" in v2.3 §17.
//
// Responsibilities:
//   1. Block writes/edits inside `.belmont/memory/steering/` (harness-
//      only zone — only `/belmont:steer` writes here).
//   2. Classify write/edit targets against the M2 knowledge taxonomy.
//      Non-knowledge paths short-circuit (project code is allowed).
//   3. For knowledge paths, read the current file, project the post-
//      write content, run `validateProjectedKnowledgeWrite`, and on the
//      first error diagnostic return
//         { block: true, reason: JSON.stringify({ message, suggestion }) }
//      Pi's `ToolCallEventResult` has no separate `suggestion` slot, so
//      we inline a JSON envelope per the M5 design (machine-parseable
//      for the agent loop; the message half preserves the verbatim
//      §4.5 deterministic rejection text).
//
// Things the guard deliberately does NOT do:
//   - re-validate content after `belmont_transition` writes (the tool
//     calls fs.writeFile directly, not the write/edit tools — pi's
//     tool_call hook only fires on built-in write/edit/bash/etc.)
//   - revert post-hoc; out-of-scope reverts live in `scope-guard.ts` at
//     turn_end.

import { isAbsolute, join, relative, sep } from "node:path";
import { readFile } from "node:fs/promises";
import {
  classifyTarget,
  generateSuggestion,
  validateProjectedKnowledgeWrite,
  type Diagnostic,
} from "@belmont/knowledge-schema";
import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "../pi/sdk.js";

// "/.belmont/memory/steering/" (forward-slash form) — matched against the
// normalized path. We use the forward-slash literal because pi normalizes
// posix-style internally and our classify normalizes too.
const STEERING_FRAGMENT = "/.belmont/memory/steering/";

export function registerKnowledgeGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    return await knowledgeGuardForEvent(event, ctx);
  });
}

export async function knowledgeGuardForEvent(
  event: ToolCallEvent,
  ctx: { cwd: string } & Partial<Pick<ExtensionContext, "hasUI" | "ui">>,
): Promise<ToolCallEventResult | undefined> {
  const rawPath = readPathFromEvent(event);
  if (rawPath === undefined) return undefined;

  const absPath = isAbsolute(rawPath) ? rawPath : join(ctx.cwd, rawPath);
  const normPath = absPath.split(sep).join("/");

  // (1) Steering zone — harness-only. Pre-empts classification.
  if (normPath.includes(STEERING_FRAGMENT)) {
    const rel = toRel(ctx.cwd, absPath);
    const reason = encodeReason({
      message: `Direct writes to ${rel} are not allowed. \`memory/steering/\` is harness-only — use the /belmont:steer command instead.`,
      suggestion: "Run `/belmont:steer <text>` from the REPL.",
    });
    notify(ctx, `Blocked write to harness-only path: ${rel}`, "warning");
    return { block: true, reason };
  }

  // (2) Classify against the knowledge taxonomy.
  const relPath = toRel(ctx.cwd, absPath);
  const target = classifyTarget(relPath);
  if (target === null) return undefined; // project code — allowed.

  // (3) Project the after-state, validate, and convert the first error
  //     diagnostic to a block.
  const before = await safeRead(absPath);
  const after = projectAfter(event, before);
  const diags = validateProjectedKnowledgeWrite(before, after, target);

  const firstError = diags.find((d) => d.severity === "error");
  if (!firstError) return undefined;

  const reason = encodeReason({
    message: firstError.message,
    suggestion: firstError.suggestion ?? deriveSuggestion(firstError, after),
  });

  notify(ctx, firstError.message, "warning");
  return { block: true, reason };
}

// ============================================================================
// Path + projection
// ============================================================================

function readPathFromEvent(event: ToolCallEvent): string | undefined {
  if (isToolCallEventType("write", event)) return event.input.path;
  if (isToolCallEventType("edit", event)) return event.input.path;
  return undefined;
}

/**
 * Approximate the file's post-write content for projection.
 *
 * - `write` overwrites with `input.content` (exact).
 * - `edit` applies `input.edits` sequentially via first-occurrence
 *   `String.prototype.replace`. Pi's real edit tool enforces uniqueness
 *   of `oldText`; our projection trusts the agent to supply a unique
 *   anchor and falls back to identity when the anchor is missing
 *   (validators still see `before` and `after` differ when ANY edit
 *   landed; a wholly bogus edit set projects to `before` and the
 *   validator short-circuits on `before === after`).
 */
function projectAfter(event: ToolCallEvent, before: string): string {
  if (isToolCallEventType("write", event)) {
    return event.input.content;
  }
  if (isToolCallEventType("edit", event)) {
    let cur = before;
    for (const e of event.input.edits) {
      if (e.oldText.length === 0) {
        // Empty oldText would replace at index 0 with newText; pi rejects
        // this. Skip in projection to avoid spurious diffs.
        continue;
      }
      const idx = cur.indexOf(e.oldText);
      if (idx === -1) continue;
      cur = cur.slice(0, idx) + e.newText + cur.slice(idx + e.oldText.length);
    }
    return cur;
  }
  return before;
}

async function safeRead(absPath: string): Promise<string> {
  try {
    return await readFile(absPath, "utf8");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    ) {
      return "";
    }
    throw err;
  }
}

function toRel(cwd: string, absPath: string): string {
  const rel = relative(cwd, absPath);
  return rel.split(sep).join("/");
}

// ============================================================================
// Reason envelope + notification
// ============================================================================

export type RejectionEnvelope = {
  message: string;
  suggestion?: string;
};

/**
 * Encode the rejection as a JSON envelope. The agent loop sees the
 * envelope verbatim in the tool-call rejection event; tests assert
 * `JSON.parse(reason)` yields { message, suggestion? }.
 */
export function encodeReason(env: RejectionEnvelope): string {
  if (env.suggestion === undefined || env.suggestion.length === 0) {
    return JSON.stringify({ message: env.message });
  }
  return JSON.stringify({ message: env.message, suggestion: env.suggestion });
}

function deriveSuggestion(
  diag: Diagnostic,
  after: string,
): string | undefined {
  // The M2 validator already runs generateSuggestion via attachSuggestion;
  // this is a defensive fallback if a caller-supplied diagnostic arrives
  // without one (e.g. future synthetic diags).
  return generateSuggestion(diag, { after });
}

function notify(
  ctx: { hasUI?: boolean; ui?: ExtensionContext["ui"] },
  message: string,
  level: "info" | "warning" | "error",
): void {
  if (ctx.hasUI && ctx.ui) {
    ctx.ui.notify(message, level);
  }
}
