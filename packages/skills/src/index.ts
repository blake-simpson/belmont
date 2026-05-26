// @belmont/skills — canonical SKILL.md sources + composer + standalone installer.
// Depends only on @belmont/knowledge-schema (enforced by dependency-cruiser).
// Real implementation lands in M4 (v2.3 §17 M4): 8 skills × ≤250 LOC each,
// composer materialization, `npx @belmont/skills install`.

import { PACKAGE_NAME as KNOWLEDGE_SCHEMA } from "@belmont/knowledge-schema";

export const PACKAGE_NAME = "@belmont/skills";
export const KNOWLEDGE_SCHEMA_DEP = KNOWLEDGE_SCHEMA;

export type PlaceholderM4 = {
  message: "M1 stub — replaced in M4 with composer, standalone installer, and 8 canonical skills";
};
