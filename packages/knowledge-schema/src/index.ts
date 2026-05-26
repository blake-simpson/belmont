// @belmont/knowledge-schema — pure parsers, validators, transitions.
// Zero pi dependencies (enforced by dependency-cruiser + test/pi-boundary.test.ts).

export const PACKAGE_NAME = "@belmont/knowledge-schema";

export type {
  AgentRole,
  ClassifiedTarget,
  Diagnostic,
  KnowledgeKind,
  Milestone,
  MilestoneStatus,
  OverlayTokens,
  OverlayValue,
  ParseOverlayResult,
  ParseProgressResult,
  Task,
  TaskState,
  ThinkingLevel,
  TierName,
} from "./types.js";
export { AGENT_ROLES, THINKING_LEVELS, TIER_NAMES } from "./types.js";

export {
  parseProgress,
  computeMilestoneStatus,
  serializeProgress,
  replaceMarkerAtLine,
  STATE_TO_MARKER,
  KNOWN_MARKERS,
} from "./progress.js";

export type {
  TransitionInput,
  TransitionErrorCode,
  TransitionResult,
} from "./transition.js";
export { applyTransition } from "./transition.js";

export {
  parseMilestoneOverlay,
  parseOverlayString,
} from "./overlay.js";

export type { ParsedFrontmatter } from "./frontmatter.js";
export {
  parseFrontmatter,
  validateFrontmatter,
  ENTRYPOINT_SCHEMA,
  PREFERENCES_SCHEMA,
  ADR_SCHEMA,
  SUBSYSTEM_SCHEMA,
  PRD_SCHEMA,
  EPISODE_SCHEMA,
  CONSTRAINT_SCHEMA,
  STACK_SCHEMA,
} from "./frontmatter.js";

export { classifyTarget } from "./classify.js";

export type { ValidateContext } from "./validate.js";
export {
  validateProjectedKnowledgeWrite,
  REJECTION_TEXT,
  PREFERENCES_MAX_LINES,
  BELMONT_MD_MAX_LINES,
  countNonBlankLines,
  extractRevisionsBullets,
  extractMemoryMapReferences,
} from "./validate.js";

export type { SuggestContext } from "./suggest.js";
export { generateSuggestion } from "./suggest.js";
