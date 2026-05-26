// Suggestion generator scaffold (v2.3 §5.3).
//
// Lightweight content scan that produces a starting-point hint for the
// rejection-response `suggestion` field. Best-effort — never the deciding
// judgment, just a content-aware nudge so the agent doesn't loop.

import type { Diagnostic } from "./types.js";

export type SuggestContext = {
  /** Latest content being written (the projected "after" state). */
  after: string;
  /** Optional original content; helps with "what changed" hints. */
  before?: string;
};

export function generateSuggestion(
  diagnostic: Diagnostic,
  context: SuggestContext,
): string | undefined {
  switch (diagnostic.code) {
    case "PREFERENCES_TOO_LONG":
      return suggestPreferencesTrim(context.after);
    case "BELMONT_MD_TOO_LONG":
      return suggestBelmontMdTrim(context.after);
    case "REVISIONS_MISSING_SECTION":
      return "Add a `## Revisions` section at the bottom of the file with one bullet describing this change (e.g. `- 2026-05-26 — <one-line summary>.`).";
    case "REVISIONS_NO_NEW_BULLET":
      return "Append a new bullet under `## Revisions` (e.g. `- 2026-05-26 — <one-line summary of this change>.`).";
    case "FILENAME_TIMESTAMP_PREFIX":
      return "Rename to a topic-prefixed slug (e.g. `D-007-auth-rotation.md` or `auth.md`); move time-of-event content into memory/episodic/.";
    case "EPISODIC_FILENAME_INVALID":
      return "Use the canonical YYYY-MM-DD-<slug>.md form, e.g. `2026-05-26-m2-knowledge-schema.md`.";
    case "PROGRESS_DIRECT_WRITE":
      return "Call the `belmont_transition` tool with { milestone_id, task_id, to } instead.";
    default:
      return undefined;
  }
}

function suggestPreferencesTrim(md: string): string {
  // Cluster bullets by leading H2 section, find the section with the most
  // bullets, propose dropping its tail. This is a deliberately small heuristic.
  const lines = md.split("\n");
  const sections: { heading: string; bullets: { line: number; text: string }[] }[] = [];
  let current: { heading: string; bullets: { line: number; text: string }[] } = {
    heading: "(top)",
    bullets: [],
  };
  sections.push(current);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = { heading: h[1] as string, bullets: [] };
      sections.push(current);
      continue;
    }
    const b = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (b !== null) {
      current.bullets.push({ line: i + 1, text: b[1] as string });
    }
  }
  // `sections` always has ≥1 entry (seeded with `(top)` before the loop).
  let largest = sections[0] as {
    heading: string;
    bullets: { line: number; text: string }[];
  };
  for (const s of sections) {
    if (s.bullets.length > largest.bullets.length) {
      largest = s;
    }
  }
  if (largest.bullets.length < 2) {
    return "Trim the file to ≤60 non-blank lines by consolidating overlapping bullets or moving stable rules into a memory/constraints/ file.";
  }
  const tail = largest.bullets.slice(-2);
  const lineHint = tail.map((t) => t.line).join("–");
  return `Trim the file to ≤60 non-blank lines. Section "${largest.heading}" has ${largest.bullets.length} bullets — consider consolidating the tail (lines ${lineHint}).`;
}

function suggestBelmontMdTrim(md: string): string {
  // Identify the largest H2 section by line count.
  const lines = md.split("\n");
  const sections: { heading: string; start: number; end: number }[] = [];
  let cursor = { heading: "(top)", start: 0, end: lines.length };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cursor.end = i;
      sections.push(cursor);
      cursor = { heading: h[1] as string, start: i, end: lines.length };
    }
  }
  sections.push(cursor);
  // `sections` always has ≥1 entry because we seed it with the synthetic
  // "(top)" cursor; the first comparison can use it as the seed largest.
  let largest = sections[0] as { heading: string; start: number; end: number };
  for (const s of sections) {
    if (s.end - s.start > largest.end - largest.start) {
      largest = s;
    }
  }
  return `Move detail from the largest section "${largest.heading}" (${largest.end - largest.start} lines) into a memory/{subsystems,decisions,prds}/ entry, then reference it from the Memory map.`;
}
