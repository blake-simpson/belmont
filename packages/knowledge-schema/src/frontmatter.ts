// YAML frontmatter parser + per-kind zod schemas (v2.3 §4.3).

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import type { Diagnostic, KnowledgeKind } from "./types.js";

export type ParsedFrontmatter = {
  /** Parsed YAML as a plain object, or null when the document has no frontmatter. */
  frontmatter: Record<string, unknown> | null;
  /** Markdown body content after the closing `---` (or the whole document when frontmatter is absent). */
  body: string;
  /** Parse-level warnings (malformed YAML, missing closer, etc.). */
  warnings: Diagnostic[];
};

const FENCE = "---";

export function parseFrontmatter(md: string): ParsedFrontmatter {
  const warnings: Diagnostic[] = [];
  // Frontmatter must start at byte 0 with a `---` line.
  const lines = md.split("\n");
  if (lines[0] !== FENCE) {
    return { frontmatter: null, body: md, warnings };
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FENCE) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    warnings.push({
      code: "FRONTMATTER_UNCLOSED",
      severity: "error",
      message: "Frontmatter opens with `---` but has no closing fence.",
    });
    return { frontmatter: null, body: md, warnings };
  }
  const yamlText = lines.slice(1, endIdx).join("\n");
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (e) {
    /* v8 ignore next — yaml.parse always throws an Error subclass */
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push({
      code: "FRONTMATTER_YAML_ERROR",
      severity: "error",
      message: `Frontmatter YAML failed to parse: ${msg}`,
    });
    return { frontmatter: null, body: lines.slice(endIdx + 1).join("\n"), warnings };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push({
      code: "FRONTMATTER_NOT_OBJECT",
      severity: "error",
      message: "Frontmatter YAML must parse to an object.",
    });
    return { frontmatter: null, body: lines.slice(endIdx + 1).join("\n"), warnings };
  }
  return {
    frontmatter: parsed as Record<string, unknown>,
    body: lines.slice(endIdx + 1).join("\n"),
    warnings,
  };
}

// ============================================================================
// Per-kind schemas (v2.3 §4.3).
// ============================================================================

const dateString = z.string().min(1);

export const ENTRYPOINT_SCHEMA = z.object({
  schema: z.literal("belmont.entrypoint.v1"),
  updated_at: dateString,
});

export const PREFERENCES_SCHEMA = z.object({
  schema: z.literal("belmont.preferences.v1"),
  updated_at: dateString,
});

export const ADR_SCHEMA = z.object({
  schema: z.literal("belmont.adr.v1"),
  id: z.string().min(1),
  topic: z.string().min(1),
  status: z.enum(["proposed", "accepted", "superseded"]),
  updated_at: dateString,
  supersedes: z.union([z.string(), z.null()]).optional(),
});

export const SUBSYSTEM_SCHEMA = z.object({
  schema: z.literal("belmont.subsystem.v1"),
  id: z.string().min(1),
  updated_at: dateString,
});

export const PRD_SCHEMA = z.object({
  schema: z.literal("belmont.prd.v1"),
  id: z.string().min(1),
  topic: z.string().min(1),
  status: z.enum(["active", "shipped", "abandoned"]),
  updated_at: dateString,
});

// Episodic schema: kind name is "episode" per plan §4.3 line 416, distinct
// from the existing v0.x style "episodic" which is wrong by spec. v1.0
// canonical is `belmont.episode.v1`. Body fields are mostly optional because
// the harness writes a fuller form than the manual entries (D-002 deviation
// scope).
export const EPISODE_SCHEMA = z.object({
  schema: z.literal("belmont.episode.v1"),
  task_id: z.string().optional(),
  phase: z.string().optional(),
  date: z.string().optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  model: z.string().optional(),
  tier: z.string().optional(),
  session_id: z.string().optional(),
  outcome: z.string().optional(),
});

export const CONSTRAINT_SCHEMA = z.object({
  schema: z.literal("belmont.constraint.v1"),
  id: z.string().optional(),
  updated_at: dateString,
});

export const STACK_SCHEMA = z.object({
  schema: z.literal("belmont.stack.v1"),
  updated_at: dateString,
});

const SCHEMA_BY_KIND: Partial<Record<KnowledgeKind, z.ZodTypeAny>> = {
  "belmont-md": ENTRYPOINT_SCHEMA,
  preferences: PREFERENCES_SCHEMA,
  adr: ADR_SCHEMA,
  subsystem: SUBSYSTEM_SCHEMA,
  prd: PRD_SCHEMA,
  episodic: EPISODE_SCHEMA,
  constraint: CONSTRAINT_SCHEMA,
  stack: STACK_SCHEMA,
};

export function validateFrontmatter(
  fm: unknown,
  kind: KnowledgeKind,
): Diagnostic[] {
  const schema = SCHEMA_BY_KIND[kind];
  if (!schema) return [];
  if (fm === null || typeof fm !== "object" || Array.isArray(fm)) {
    return [
      {
        code: "FRONTMATTER_MISSING",
        severity: "error",
        message: `Frontmatter is required for ${kind} files.`,
      },
    ];
  }
  const result = schema.safeParse(fm);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const pathPart =
      issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return {
      code: "FRONTMATTER_INVALID",
      severity: "error" as const,
      message: `Frontmatter invalid for ${kind}: ${pathPart}${issue.message}`,
    };
  });
}
