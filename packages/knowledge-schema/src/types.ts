// Shared types for @belmont/knowledge-schema.

export type TaskState =
  | "todo"
  | "in_progress"
  | "done"
  | "verified"
  | "blocked";

export type MilestoneStatus =
  | "not_started"
  | "in_progress"
  | "done"
  | "verified"
  | "blocked";

export type Task = {
  /** Task identifier ('P0-1', 'P1-2', etc.) — empty string if line had no parseable ID prefix. */
  id: string;
  /** Task name (text after the marker and optional ID prefix, trimmed). */
  name: string;
  /** Parsed state from the marker character. Unknown markers fall back to "todo" with a warning. */
  state: TaskState;
  /** Raw marker character between the [ ] brackets (e.g. ' ', '>', 'x', 'v', '!'). */
  marker: string;
  /** 0-based line index in the source markdown. Used for byte-faithful mutation. */
  lineIndex: number;
  /** Verbatim source line (preserves leading whitespace and trailing content). */
  rawLine: string;
};

export type Milestone = {
  /** Milestone identifier — 'M1', 'M2', etc. */
  id: string;
  /** Numeric milestone number (1, 2, ...). */
  num: number;
  /** Display name (header text after 'M<n>:', with `(depends: ...)` annotation stripped). */
  name: string;
  /** Declared dependencies ['M1', 'M3']; empty array when no `(depends: ...)` annotation present. */
  deps: string[];
  /** Raw HTML-comment overlay content — the inner text of `<!-- belmont:models ... -->` — or null. */
  overlay: string | null;
  /** 0-based line index of the overlay comment, or null. */
  overlayLineIndex: number | null;
  /** Parsed tasks in source order. */
  tasks: Task[];
  /** 0-based line index of the `### M<n>: ...` header line. */
  headerLineIndex: number;
  /** Source lines for the full milestone block: header + everything up to (exclusive) next block boundary. */
  rawLines: string[];
  /** Status computed from the task markers — never stored in the source markdown. */
  status: MilestoneStatus;
  /** True if the legacy emoji prefix (✅⬜🔄🚫) was detected on the header line. Validator hard-fails this. */
  hadEmojiPrefix: boolean;
};

export type Diagnostic = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
  path?: string;
  line?: number;
};

export type ParseProgressResult = {
  milestones: Milestone[];
  warnings: Diagnostic[];
  /** Verbatim source input. */
  source: string;
  /** Source split on `\n`; `lines[i]` is the content of source line `i` without the line terminator. */
  lines: string[];
};

/** The 11 named agent roles from v2.3 §9.1. */
export const AGENT_ROLES = [
  "working_backwards",
  "codebase",
  "design",
  "planning",
  "implementation",
  "verification",
  "code_review",
  "reconciliation",
  "status",
  "next",
  "debug",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** The 3 named tier slots from v2.3 §9.1. */
export const TIER_NAMES = ["high", "medium", "low"] as const;
export type TierName = (typeof TIER_NAMES)[number];

/** Pi thinking levels recognized in the overlay token grammar. */
export const THINKING_LEVELS = ["high", "medium", "low", "off"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type OverlayValue = {
  /** Base tier slot (always present). */
  tier: TierName;
  /** Optional provider override (e.g. 'anthropic', 'ollama'). */
  provider?: string;
  /** Optional model override (e.g. 'claude-sonnet-4-6', 'qwen3:8b' — may contain colons). */
  model?: string;
  /** Optional thinking-level override. */
  thinking?: ThinkingLevel;
  /** Optional baseURL override for openai-compatible endpoints. */
  baseURL?: string;
};

export type OverlayTokens = Partial<Record<AgentRole, OverlayValue>>;

export type ParseOverlayResult = {
  overlay: OverlayTokens | null;
  warnings: Diagnostic[];
};

/** What kind of knowledge file a path points to (for write-time validation). */
export type KnowledgeKind =
  | "progress"
  | "belmont-md"
  | "preferences"
  | "models-json"
  | "adr"
  | "subsystem"
  | "constraint"
  | "prd"
  | "episodic"
  | "stack";

export type ClassifiedTarget = {
  kind: KnowledgeKind;
  /** Repo-relative path normalized with forward slashes. */
  relativePath: string;
  /** For directory-bound kinds, the filename basename (no extension). */
  basename: string;
};
