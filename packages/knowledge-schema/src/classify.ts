// classifyTarget — map a project-relative path to its knowledge kind.

import type { ClassifiedTarget, KnowledgeKind } from "./types.js";

/**
 * Normalise a path to forward slashes and strip a leading `./`. Returns the
 * lowercased path; classification matchers operate on the original casing
 * via the returned `relativePath`.
 */
function normalize(p: string): string {
  let s = p.replace(/\\/g, "/");
  if (s.startsWith("./")) s = s.slice(2);
  return s;
}

const KIND_PATTERNS: Array<{
  kind: KnowledgeKind;
  regex: RegExp;
}> = [
  { kind: "progress", regex: /^(?:.*\/)?\.belmont\/PROGRESS\.md$/ },
  { kind: "belmont-md", regex: /^(?:.*\/)?\.belmont\/BELMONT\.md$/ },
  { kind: "preferences", regex: /^(?:.*\/)?\.belmont\/preferences\.md$/ },
  { kind: "models-json", regex: /^(?:.*\/)?\.belmont\/models\.json$/ },
  { kind: "stack", regex: /^(?:.*\/)?\.belmont\/memory\/stack\.md$/ },
  { kind: "adr", regex: /^(?:.*\/)?\.belmont\/memory\/decisions\/[^/]+\.md$/ },
  { kind: "subsystem", regex: /^(?:.*\/)?\.belmont\/memory\/subsystems\/[^/]+\.md$/ },
  { kind: "constraint", regex: /^(?:.*\/)?\.belmont\/memory\/constraints\/[^/]+\.md$/ },
  { kind: "prd", regex: /^(?:.*\/)?\.belmont\/memory\/prds\/[^/]+\.md$/ },
  { kind: "episodic", regex: /^(?:.*\/)?\.belmont\/memory\/episodic\/[^/]+\.md$/ },
];

export function classifyTarget(p: string): ClassifiedTarget | null {
  const relativePath = normalize(p);
  for (const { kind, regex } of KIND_PATTERNS) {
    if (regex.test(relativePath)) {
      // .pop() on a string.split("/") result is always defined because split
      // returns at least one element; cast is safe.
      const basename = relativePath.split("/").pop() as string;
      return {
        kind,
        relativePath,
        basename: basename.replace(/\.(md|json)$/i, ""),
      };
    }
  }
  return null;
}
