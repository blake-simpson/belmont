// models.json schema + validator (v2.3 §9.1).
//
// Pure: Zod schema, no FS, no fetch, no pi. The harness's
// `tiering/models-json.ts` wraps this with a `loadModelsJson(cwd)` FS
// entrypoint; `belmont validate` (CLI) consumes `validateModelsJson` to
// surface schema errors at preflight; the M7 resolver
// (`tiering/resolve.ts`) consumes the parsed type for the 4-layer lookup.
//
// Schema shape per §9.1 LOCKED set: `tiers + agents + features +
// ctx_thresholds`. Risk #6 in the plan locks the schema at M7 — no
// additions in v1.0. The optional `_comment` field at the top is allowed
// for human notes (Belmont's own dogfooded models.json uses it) and
// silently stripped from the typed output.
//
// `tiers` must always contain `high`, `medium`, `low` — those are the
// three named slots the resolver looks up.

import { z } from "zod";

import type { Diagnostic } from "./types.js";
import { AGENT_ROLES, THINKING_LEVELS, TIER_NAMES } from "./types.js";

const THINKING = z.enum(THINKING_LEVELS);

const TIER = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  thinking: THINKING.optional(),
  // Local-endpoint tier provides baseURL directly (§9.1 dogfood +
  // §9.3 grammar both support this).
  baseURL: z.string().min(1).optional(),
  auth: z.enum(["subscription", "local", "api_key", "none"]).optional(),
});

const TIERS = z.object({
  high: TIER,
  medium: TIER,
  low: TIER,
});

// agents block — each agent role maps to one of the 3 tier names. Missing
// agent roles fall back to `medium` at resolve-time (deliberate; spelled
// in the resolver, not the schema, so the schema stays a pure shape
// check). Zod v4's `z.record(z.enum(KEYS), ...)` treats all enum keys as
// REQUIRED, so we build the shape as a strict object with each agent
// optional.
const AGENT_TIER_VALUE = z.enum(TIER_NAMES);
type AgentShape = Record<
  (typeof AGENT_ROLES)[number],
  z.ZodOptional<typeof AGENT_TIER_VALUE>
>;
const AGENTS_SHAPE = Object.fromEntries(
  AGENT_ROLES.map((role) => [role, AGENT_TIER_VALUE.optional()] as const),
) as AgentShape;
const AGENTS = z.object(AGENTS_SHAPE).strict();

const FEATURES = z.record(z.string().min(1), z.unknown());

const CTX_THRESHOLDS = z.object({
  amber: z.number().int().positive(),
  red: z.number().int().positive(),
});

export const MODELS_JSON_SCHEMA = z
  .object({
    _comment: z.string().optional(),
    schema: z.literal("belmont.models.v1"),
    tiers: TIERS,
    agents: AGENTS.optional(),
    features: FEATURES.optional(),
    ctx_thresholds: CTX_THRESHOLDS.optional(),
  })
  .strict();

export type ModelsTier = z.infer<typeof TIER>;
export type ModelsJson = z.infer<typeof MODELS_JSON_SCHEMA>;
export type ModelsAgentMap = z.infer<typeof AGENTS>;
export type CtxThresholds = z.infer<typeof CTX_THRESHOLDS>;

export type ValidateModelsJsonResult =
  | { ok: true; data: ModelsJson; warnings: Diagnostic[] }
  | { ok: false; errors: Diagnostic[] };

export function validateModelsJson(raw: unknown): ValidateModelsJsonResult {
  const result = MODELS_JSON_SCHEMA.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const pathPart =
        issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return {
        code: "MODELS_JSON_INVALID",
        severity: "error" as const,
        message: `models.json invalid: ${pathPart}${issue.message}`,
      };
    });
    return { ok: false, errors };
  }
  const data = result.data;
  const warnings: Diagnostic[] = [];

  // Cross-field warnings — soft checks the schema can't express but the
  // user wants to see at validate-time.
  if (data.agents) {
    // Unknown agent keys would already be rejected by `z.enum(AGENT_ROLES)`
    // via the AGENTS record's key type. Nothing to add here.
    for (const [agent, tierName] of Object.entries(data.agents)) {
      if (!(tierName in data.tiers)) {
        // Defensive — the schema makes this unreachable, but if Zod's
        // record key narrowing slips, surface the issue rather than
        // crashing downstream.
        warnings.push({
          code: "MODELS_JSON_UNKNOWN_TIER",
          severity: "error",
          message: `agents.${agent} references unknown tier "${tierName}".`,
        });
      }
    }
  }

  if (data.ctx_thresholds) {
    if (data.ctx_thresholds.amber >= data.ctx_thresholds.red) {
      warnings.push({
        code: "MODELS_JSON_CTX_THRESHOLDS_INVERTED",
        severity: "warning",
        message: `ctx_thresholds.amber (${data.ctx_thresholds.amber}) is not below ctx_thresholds.red (${data.ctx_thresholds.red}); the indicator will look swapped.`,
      });
    }
  }

  return { ok: true, data, warnings };
}

/**
 * Return the tier name configured for a given agent role, falling back to
 * the resolver default ("medium") when the agent has no explicit assignment.
 * Centralised here so both the resolver and the doctor agree on the
 * default.
 */
export function agentTier(
  modelsJson: ModelsJson,
  agent: (typeof AGENT_ROLES)[number],
): (typeof TIER_NAMES)[number] {
  return modelsJson.agents?.[agent] ?? "medium";
}
