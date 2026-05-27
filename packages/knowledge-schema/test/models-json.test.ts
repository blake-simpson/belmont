import { describe, expect, it } from "vitest";

import {
  agentTier,
  MODELS_JSON_SCHEMA,
  validateModelsJson,
} from "../src/models-json.js";

const VALID_DOGFOOD = {
  _comment: "test fixture mirroring the Belmont dogfood file",
  schema: "belmont.models.v1",
  tiers: {
    high: { provider: "anthropic", model: "claude-opus-4-7", thinking: "high" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6", thinking: "medium" },
    low: { provider: "anthropic", model: "claude-haiku-4-5", thinking: "low" },
  },
  agents: {
    codebase: "medium",
    design: "high",
    implementation: "medium",
    verification: "high",
    code_review: "medium",
    reconciliation: "high",
  },
};

const VALID_PLAN_EXAMPLE = {
  schema: "belmont.models.v1",
  tiers: {
    high: { provider: "codex", model: "gpt-5.5", thinking: "high", auth: "subscription" },
    medium: { provider: "kimi", model: "kimi-k2", thinking: "medium", auth: "subscription" },
    low: {
      provider: "openai-compatible",
      model: "qwen3-coder",
      thinking: "low",
      baseURL: "http://127.0.0.1:11434/v1",
      auth: "local",
    },
  },
  agents: {
    working_backwards: "high",
    codebase: "high",
    design: "high",
    planning: "high",
    implementation: "high",
    verification: "medium",
    code_review: "high",
    reconciliation: "medium",
    status: "low",
    next: "low",
    debug: "high",
  },
  features: { web: false, lean_ctx: true },
  ctx_thresholds: { amber: 80000, red: 120000 },
};

describe("validateModelsJson — happy paths", () => {
  it("accepts Belmont's dogfooded shape (anthropic-only, partial agents)", () => {
    const r = validateModelsJson(VALID_DOGFOOD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.tiers.high.provider).toBe("anthropic");
      expect(r.warnings).toEqual([]);
    }
  });

  it("accepts the §9.1 plan example (codex/kimi/local, full agents map)", () => {
    const r = validateModelsJson(VALID_PLAN_EXAMPLE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.tiers.low.baseURL).toBe("http://127.0.0.1:11434/v1");
      expect(r.data.ctx_thresholds?.amber).toBe(80000);
      expect(r.warnings).toEqual([]);
    }
  });

  it("accepts schema with no optional blocks (just tiers)", () => {
    const r = validateModelsJson({
      schema: "belmont.models.v1",
      tiers: {
        high: { provider: "anthropic", model: "claude-opus-4-7" },
        medium: { provider: "anthropic", model: "claude-sonnet-4-6" },
        low: { provider: "anthropic", model: "claude-haiku-4-5" },
      },
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateModelsJson — rejections", () => {
  it("rejects wrong schema literal", () => {
    const r = validateModelsJson({ ...VALID_DOGFOOD, schema: "belmont.models.v0" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.message).toContain("schema:");
    }
  });

  it("rejects missing `tiers.high`", () => {
    const r = validateModelsJson({
      schema: "belmont.models.v1",
      tiers: {
        medium: VALID_DOGFOOD.tiers.medium,
        low: VALID_DOGFOOD.tiers.low,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.message.includes("tiers.high"))).toBe(true);
    }
  });

  it("rejects tier with empty provider", () => {
    const r = validateModelsJson({
      ...VALID_DOGFOOD,
      tiers: {
        ...VALID_DOGFOOD.tiers,
        high: { provider: "", model: "claude-opus-4-7" },
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.message).toMatch(/provider/);
    }
  });

  it("rejects unknown agent role", () => {
    const r = validateModelsJson({
      ...VALID_DOGFOOD,
      agents: { ...VALID_DOGFOOD.agents, frontend: "high" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.message).toMatch(/frontend/);
    }
  });

  it("rejects unknown tier name in agents map", () => {
    const r = validateModelsJson({
      ...VALID_DOGFOOD,
      agents: { implementation: "ultra" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid thinking level", () => {
    const r = validateModelsJson({
      ...VALID_DOGFOOD,
      tiers: {
        ...VALID_DOGFOOD.tiers,
        high: { provider: "anthropic", model: "claude-opus-4-7", thinking: "extreme" },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects extra top-level fields (strict mode)", () => {
    const r = validateModelsJson({ ...VALID_DOGFOOD, providers: { codex: {} } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.message).toMatch(/providers|unrecognized/i);
    }
  });

  it("rejects non-positive ctx threshold", () => {
    const r = validateModelsJson({
      ...VALID_DOGFOOD,
      ctx_thresholds: { amber: 0, red: 120000 },
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateModelsJson — soft warnings", () => {
  it("warns when amber >= red (inverted ctx thresholds)", () => {
    const r = validateModelsJson({
      ...VALID_DOGFOOD,
      ctx_thresholds: { amber: 130000, red: 120000 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.some((w) => w.code === "MODELS_JSON_CTX_THRESHOLDS_INVERTED")).toBe(true);
    }
  });
});

describe("agentTier helper", () => {
  it("returns the explicitly mapped tier", () => {
    const r = validateModelsJson(VALID_DOGFOOD);
    if (!r.ok) throw new Error("fixture broke");
    expect(agentTier(r.data, "implementation")).toBe("medium");
    expect(agentTier(r.data, "verification")).toBe("high");
  });

  it("falls back to 'medium' when the agent has no explicit mapping", () => {
    const r = validateModelsJson(VALID_DOGFOOD);
    if (!r.ok) throw new Error("fixture broke");
    // working_backwards is not in the dogfood agents map.
    expect(agentTier(r.data, "working_backwards")).toBe("medium");
  });

  it("falls back to 'medium' when the agents block is omitted", () => {
    const r = validateModelsJson({
      schema: "belmont.models.v1",
      tiers: VALID_DOGFOOD.tiers,
    });
    if (!r.ok) throw new Error("fixture broke");
    expect(agentTier(r.data, "implementation")).toBe("medium");
  });
});

describe("MODELS_JSON_SCHEMA (direct Zod usage)", () => {
  it("type-narrows tier provider/model as required strings", () => {
    const result = MODELS_JSON_SCHEMA.safeParse(VALID_DOGFOOD);
    expect(result.success).toBe(true);
    if (result.success) {
      // Compile-time presence — runtime sanity.
      expect(typeof result.data.tiers.high.provider).toBe("string");
      expect(typeof result.data.tiers.high.model).toBe("string");
    }
  });
});
