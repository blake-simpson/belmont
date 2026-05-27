// session_before_compact observer — writes a compact episodic memory
// entry RIGHT BEFORE pi compacts the live transcript.
//
// v2.3 §17 M9 done-when (the M9 P1 line): "session_before_compact
// writes a compact episodic summary (the M9 P1 — 'what got compacted,
// what stayed')."
//
// CRITICAL CONTRACT: this handler is an OBSERVER, not a compaction
// override. It MUST return undefined so pi's default compaction (or
// any other extension's custom-compaction handler) proceeds normally.
// Returning `{cancel: true}` or `{compaction: …}` would change pi's
// runtime behaviour — which is M9 P1 out of scope; M9 only needs the
// episodic snapshot.
//
// Contrast with pi-mono's examples/extensions/custom-compaction.ts
// (the upstream reference per D-001), which DOES return a compaction
// object built from a Gemini Flash summarisation pass. Belmont could
// adopt that pattern in v1.1 (with the multi-model tiering from M7
// picking which tier summarises), but M9 just observes.
//
// Episodic write semantics:
//   - Slug: `auto-compactions` — one file per day, multiple bullets
//     across the day. Matches the slug pattern used by progress-
//     transitions (state/episodic.ts auto-creates the file with the
//     belmont.episode.v1 frontmatter; subsequent same-day writes
//     append under `## Events`).
//   - Bullet body: `tokensBefore=NN, messages=NN, lastAssistantLines=
//     ["…", "…"]` — enough to reconstruct what the session looked
//     like before pi compacted it without bloating the episodic file
//     (we deliberately do NOT serialise the full conversation; that's
//     what pi's own session history is for).
//   - Bullet kind: `phase` (the existing taxonomy from state/episodic.ts).
//     A future M9.x or v1.1 could introduce a `compaction` kind via
//     extending EpisodeKind in state/episodic.ts.
//
// Failure mode: episodic write errors are caught and surfaced via
// ctx.ui.notify(..., "warning"). Compaction proceeds either way.
// Belmont does not want a failed memory write to interfere with pi's
// context-management.
//
// Pi-mono lineage (per D-001):
//   - examples/extensions/custom-compaction.ts — the SessionBefore
//     CompactEvent shape + the `preparation.{tokensBefore,
//     messagesToSummarize, turnPrefixMessages, firstKeptEntryId,
//     previousSummary}` field set. M9 reads tokensBefore + the
//     message counts, ignores the rest.

import { appendOrCreateEpisode } from "../state/episodic.js";
import type {
  AssistantMessage,
  ExtensionAPI,
  SessionBeforeCompactEvent,
} from "../pi/sdk.js";

/** Build the one-line bullet body. Exported for tests so the format
 *  contract is asserted as a pure unit. */
export function buildCompactionBullet(input: {
  tokensBefore: number;
  toSummarizeCount: number;
  turnPrefixCount: number;
  lastAssistantLines: string[];
}): string {
  const lines = input.lastAssistantLines
    .slice(0, 3)
    .map((s) => JSON.stringify(s.length > 80 ? `${s.slice(0, 77)}...` : s))
    .join(", ");
  return [
    `tokensBefore=${input.tokensBefore.toLocaleString("en-US")}`,
    `messages=${input.toSummarizeCount + input.turnPrefixCount}`,
    `(toSummarize=${input.toSummarizeCount}, kept=${input.turnPrefixCount})`,
    `lastAssistantLines=[${lines}]`,
  ].join(", ");
}

/** Walk a SessionEntry[] (the messagesToSummarize array) and pull the
 *  first text line of the last `n` assistant messages — used as the
 *  human-readable signal in the episodic bullet. */
export function extractLastAssistantLines(
  entries: SessionBeforeCompactEvent["preparation"]["messagesToSummarize"],
  n: number,
): string[] {
  const lines: string[] = [];
  for (let i = entries.length - 1; i >= 0 && lines.length < n; i--) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object") continue;
    // SessionEntry shapes vary — pi's session-manager has SessionMessage
    // Entry which wraps an AgentMessage on `.message`. We dig there
    // cautiously without importing the concrete SessionEntry union (it's
    // a wide discriminated union that we don't want to drag through the
    // pi/sdk re-export surface for just one observer).
    const message = (entry as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    if ((message as { role?: unknown }).role !== "assistant") continue;
    const content = (message as AssistantMessage).content;
    if (!Array.isArray(content)) continue;
    const textBlock = content.find(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    );
    if (!textBlock) continue;
    const firstLine = textBlock.text.split("\n")[0]?.trim();
    if (firstLine) lines.push(firstLine);
  }
  return lines.reverse();
}

export function registerSessionBeforeCompactHook(pi: ExtensionAPI): void {
  pi.on("session_before_compact", async (event, ctx) => {
    try {
      const { preparation } = event;
      const lastLines = extractLastAssistantLines(
        preparation.messagesToSummarize,
        3,
      );
      const bullet = buildCompactionBullet({
        tokensBefore: preparation.tokensBefore,
        toSummarizeCount: preparation.messagesToSummarize.length,
        turnPrefixCount: preparation.turnPrefixMessages.length,
        lastAssistantLines: lastLines,
      });
      await appendOrCreateEpisode({
        cwd: ctx.cwd,
        slug: "auto-compactions",
        kind: "phase",
        content: bullet,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(
        `Belmont episodic write before compaction failed: ${message}. Compaction will proceed.`,
        "warning",
      );
    }
    // Always return undefined → pi's default compaction runs.
    return undefined;
  });
}
