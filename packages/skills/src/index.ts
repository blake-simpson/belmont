// @belmont/skills — canonical SKILL.md sources + composer + standalone
// installer. Depends only on @belmont/knowledge-schema (enforced by
// dependency-cruiser + the pi-boundary test).

import { PACKAGE_NAME as KNOWLEDGE_SCHEMA } from "@belmont/knowledge-schema";

export const PACKAGE_NAME = "@belmont/skills";
export const KNOWLEDGE_SCHEMA_DEP = KNOWLEDGE_SCHEMA;

export { SKILLS, type Slug } from "./slugs.js";
export {
  compose,
  composeSkill,
  materializeSkill,
  bundledSourceDir,
  resolveBundledSource,
  listShared,
  type ComposeOptions,
  type ComposeEntry,
  type ComposeError,
  type ComposeResult,
} from "./compose.js";
export {
  install,
  parseArgv,
  runCli,
  type InstallOptions,
  type InstallReport,
} from "./installer.js";
