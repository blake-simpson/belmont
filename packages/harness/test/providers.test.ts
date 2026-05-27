import { describe, expect, it, vi } from "vitest";

import type { ModelsJson } from "@belmont/knowledge-schema";

import { registerConfiguredProviders } from "../src/tiering/providers.js";

type Call = { name: string; config: unknown };

function makePi(): { calls: Call[]; pi: any } {
  const calls: Call[] = [];
  const pi = {
    registerProvider: (name: string, config: unknown) => {
      calls.push({ name, config });
    },
  };
  return { calls, pi };
}

function makeRegistry(known: Array<[string, string]> = []): any {
  const set = new Set(known.map(([p, m]) => `${p} ${m}`));
  return {
    find: (provider: string, model: string) =>
      set.has(`${provider} ${model}`) ? { provider, id: model } : undefined,
  };
}

const ALL_ANTHROPIC: ModelsJson = {
  schema: "belmont.models.v1",
  tiers: {
    high: { provider: "anthropic", model: "claude-opus-4-7", thinking: "high" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6", thinking: "medium" },
    low: { provider: "anthropic", model: "claude-haiku-4-5", thinking: "low" },
  },
};

const PLAN_EXAMPLE: ModelsJson = {
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
};

describe("registerConfiguredProviders — built-in passthrough", () => {
  it("registers nothing when pi already knows every tier's provider/model", () => {
    const { calls, pi } = makePi();
    const registry = makeRegistry([
      ["anthropic", "claude-opus-4-7"],
      ["anthropic", "claude-sonnet-4-6"],
      ["anthropic", "claude-haiku-4-5"],
    ]);
    const result = registerConfiguredProviders(pi, ALL_ANTHROPIC, registry);
    expect(calls).toEqual([]);
    expect(result.alreadyKnown).toEqual([
      "anthropic",
      "anthropic",
      "anthropic",
    ]);
    expect(result.registered).toEqual([]);
  });
});

describe("registerConfiguredProviders — KNOWN_PROVIDER_TEMPLATES path", () => {
  it("registers codex, kimi, and openai-compatible from the plan example", () => {
    const { calls, pi } = makePi();
    const result = registerConfiguredProviders(pi, PLAN_EXAMPLE, makeRegistry());
    expect(result.registered).toEqual([
      "codex",
      "kimi",
      "openai-compatible",
    ]);

    const codex = calls.find((c) => c.name === "codex")!;
    expect(codex.config).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      api: "openai-responses",
      apiKey: "CODEX_API_KEY",
      models: [{ id: "gpt-5.5" }],
    });

    const local = calls.find((c) => c.name === "openai-compatible")!;
    expect(local.config).toMatchObject({
      baseUrl: "http://127.0.0.1:11434/v1",
      api: "openai-chat-completions",
      models: [{ id: "qwen3-coder" }],
    });
  });

  it("respects tier baseURL overriding template default", () => {
    const { calls, pi } = makePi();
    const customCodex: ModelsJson = {
      schema: "belmont.models.v1",
      tiers: {
        high: {
          provider: "codex",
          model: "gpt-5.5",
          baseURL: "https://proxy.internal/v1",
          auth: "subscription",
        },
        medium: PLAN_EXAMPLE.tiers.medium,
        low: PLAN_EXAMPLE.tiers.low,
      },
    };
    registerConfiguredProviders(pi, customCodex, makeRegistry());
    const codex = calls.find((c) => c.name === "codex")!;
    expect((codex.config as { baseUrl: string }).baseUrl).toBe("https://proxy.internal/v1");
  });
});

describe("registerConfiguredProviders — deduplication", () => {
  it("deduplicates by (provider, model) tuple", () => {
    const { calls, pi } = makePi();
    const duplicated: ModelsJson = {
      schema: "belmont.models.v1",
      tiers: {
        high: { provider: "codex", model: "gpt-5.5" },
        medium: { provider: "codex", model: "gpt-5.5" }, // same as high
        low: { provider: "codex", model: "gpt-5-mini" }, // different model
      },
    };
    registerConfiguredProviders(pi, duplicated, makeRegistry());
    expect(calls.length).toBe(2);
    const modelIds = calls.map((c) => (c.config as { models?: { id: string }[] }).models?.[0]?.id);
    expect(modelIds).toEqual(["gpt-5.5", "gpt-5-mini"]);
  });
});

describe("registerConfiguredProviders — unknown providers", () => {
  it("collects unknowns rather than throwing", () => {
    const { calls, pi } = makePi();
    const exotic: ModelsJson = {
      schema: "belmont.models.v1",
      tiers: {
        high: { provider: "mystery-ai", model: "v1" },
        medium: PLAN_EXAMPLE.tiers.medium,
        low: PLAN_EXAMPLE.tiers.low,
      },
    };
    const result = registerConfiguredProviders(pi, exotic, makeRegistry());
    expect(result.unknown).toEqual([{ provider: "mystery-ai", model: "v1" }]);
    expect(calls.find((c) => c.name === "mystery-ai")).toBeUndefined();
  });
});

describe("registerConfiguredProviders — template-needs-baseURL errors", () => {
  it("emits diagnostic when openai-compatible has no baseURL", () => {
    const { calls, pi } = makePi();
    const broken: ModelsJson = {
      schema: "belmont.models.v1",
      tiers: {
        high: { provider: "openai-compatible", model: "x" },
        medium: { provider: "kimi", model: "kimi-k2" },
        low: { provider: "codex", model: "gpt-5-mini" },
      },
    };
    const result = registerConfiguredProviders(pi, broken, makeRegistry());
    expect(result.errors[0]?.code).toBe("PROVIDER_TEMPLATE_NEEDS_BASEURL");
    expect(calls.find((c) => c.name === "openai-compatible")).toBeUndefined();
  });
});

describe("registerConfiguredProviders — registry probe skips when pi knows it", () => {
  it("skips registration when pi.modelRegistry.find returns a model", () => {
    const { calls, pi } = makePi();
    const registry = makeRegistry([["codex", "gpt-5.5"]]);
    const result = registerConfiguredProviders(pi, PLAN_EXAMPLE, registry);
    // codex already known → skip
    expect(result.alreadyKnown).toContain("codex");
    expect(calls.find((c) => c.name === "codex")).toBeUndefined();
    // kimi & openai-compatible still register normally
    expect(result.registered).toContain("kimi");
    expect(result.registered).toContain("openai-compatible");
  });
});
