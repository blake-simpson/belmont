import { describe, expect, it } from "vitest";

import type { ModelsJson, OverlayTokens } from "@belmont/knowledge-schema";

import {
  classifyAuth,
  isLocalBaseURL,
  resolveTier,
  type TierOverrideMap,
} from "../src/tiering/resolve.js";

const DOGFOOD: ModelsJson = {
  schema: "belmont.models.v1",
  tiers: {
    high: { provider: "anthropic", model: "claude-opus-4-7", thinking: "high" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6", thinking: "medium" },
    low: { provider: "anthropic", model: "claude-haiku-4-5", thinking: "low" },
  },
  agents: {
    implementation: "medium",
    verification: "high",
    code_review: "medium",
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
  agents: {
    implementation: "high",
    verification: "medium",
  },
};

describe("resolveTier — Layer 4 (tier base)", () => {
  it("resolves to tier-base when agent is unmapped", () => {
    const r = resolveTier(DOGFOOD, "working_backwards");
    expect(r).toMatchObject({
      tier: "medium",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      thinking: "medium",
      source: "tier-base",
    });
  });
});

describe("resolveTier — Layer 3 (agents map)", () => {
  it("snaps to the mapped tier and reports agent-default source", () => {
    const r = resolveTier(DOGFOOD, "implementation");
    expect(r).toMatchObject({
      tier: "medium",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      thinking: "medium",
      source: "agent-default",
    });
  });

  it("respects high-tier agent mapping", () => {
    const r = resolveTier(DOGFOOD, "verification");
    expect(r.tier).toBe("high");
    expect(r.model).toBe("claude-opus-4-7");
    expect(r.source).toBe("agent-default");
  });
});

describe("resolveTier — Layer 2 (milestone overlay)", () => {
  it("overlay overrides tier slot only", () => {
    const overlay: OverlayTokens = { implementation: { tier: "high" } };
    const r = resolveTier(DOGFOOD, "implementation", { milestoneOverlay: overlay });
    expect(r).toMatchObject({
      tier: "high",
      provider: "anthropic",
      model: "claude-opus-4-7",
      thinking: "high",
      source: "overlay",
    });
  });

  it("overlay overrides provider+model (additive on tier slot)", () => {
    const overlay: OverlayTokens = {
      implementation: { tier: "high", provider: "anthropic", model: "claude-sonnet-4-6" },
    };
    const r = resolveTier(DOGFOOD, "implementation", { milestoneOverlay: overlay });
    expect(r).toMatchObject({
      tier: "high",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      thinking: "high", // falls through to tier-base thinking
      source: "overlay",
    });
  });

  it("overlay overrides thinking level", () => {
    const overlay: OverlayTokens = {
      implementation: {
        tier: "high",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        thinking: "high",
      },
    };
    const r = resolveTier(DOGFOOD, "implementation", { milestoneOverlay: overlay });
    expect(r.thinking).toBe("high");
  });

  it("overlay carries baseURL for openai-compatible localhost endpoints", () => {
    const overlay: OverlayTokens = {
      implementation: {
        tier: "low",
        provider: "ollama",
        model: "qwen3:8b",
        baseURL: "http://localhost:11434/v1",
      },
    };
    const r = resolveTier(DOGFOOD, "implementation", { milestoneOverlay: overlay });
    expect(r.baseURL).toBe("http://localhost:11434/v1");
    expect(r.provider).toBe("ollama");
    expect(r.model).toBe("qwen3:8b");
    expect(r.auth).toBe("local"); // inferred from baseURL
  });

  it("agents map without overlay leaves source = agent-default", () => {
    const r = resolveTier(DOGFOOD, "implementation");
    expect(r.source).toBe("agent-default");
  });
});

describe("resolveTier — Layer 1 (CLI flag)", () => {
  it("CLI override wins over milestone overlay", () => {
    const overlay: OverlayTokens = {
      implementation: { tier: "high", provider: "anthropic", model: "claude-sonnet-4-6" },
    };
    const cli: TierOverrideMap = {
      implementation: { tier: "high", provider: "anthropic", model: "claude-opus-4-7" },
    };
    const r = resolveTier(DOGFOOD, "implementation", {
      milestoneOverlay: overlay,
      cliOverrides: cli,
    });
    expect(r.model).toBe("claude-opus-4-7");
    expect(r.source).toBe("cli");
  });

  it("CLI override wins when no overlay is present", () => {
    const cli: TierOverrideMap = { verification: { tier: "low" } };
    const r = resolveTier(DOGFOOD, "verification", { cliOverrides: cli });
    expect(r.tier).toBe("low");
    expect(r.model).toBe("claude-haiku-4-5");
    expect(r.source).toBe("cli");
  });
});

describe("resolveTier — auth classification", () => {
  it("local tier (auth=local) reports local", () => {
    const r = resolveTier(PLAN_EXAMPLE, "next");
    expect(r.tier).toBe("medium");
    expect(r.auth).toBe("subscription"); // medium tier is kimi/subscription
  });

  it("explicit auth wins when set", () => {
    const r = resolveTier(PLAN_EXAMPLE, "status"); // unmapped → medium → kimi (subscription)
    expect(r.auth).toBe("subscription");
  });

  it("falls back to local when baseURL is localhost and no auth set", () => {
    const r = resolveTier(
      {
        schema: "belmont.models.v1",
        tiers: {
          high: { provider: "ollama", model: "x", baseURL: "http://127.0.0.1:11434/v1" },
          medium: { provider: "ollama", model: "x", baseURL: "http://127.0.0.1:11434/v1" },
          low: { provider: "ollama", model: "x", baseURL: "http://127.0.0.1:11434/v1" },
        },
      },
      "implementation",
    );
    expect(r.auth).toBe("local");
  });

  it("classifyAuth helper picks subscription for remote baseURL", () => {
    expect(classifyAuth({ provider: "x", model: "y", baseURL: "https://api.example.com" })).toBe("subscription");
    expect(classifyAuth({ provider: "x", model: "y", baseURL: "http://localhost:8080" })).toBe("local");
    expect(classifyAuth({ provider: "x", model: "y" })).toBe("subscription");
    expect(classifyAuth({ provider: "x", model: "y", auth: "api_key" })).toBe("api_key");
  });
});

describe("isLocalBaseURL", () => {
  it.each([
    ["http://127.0.0.1:11434/v1", true],
    ["http://localhost:8080", true],
    ["http://0.0.0.0:11434", true],
    ["https://api.anthropic.com", false],
    ["http://192.168.1.50:11434", false],
    ["not a url", false],
  ])("classifies %s as local=%s", (url, expected) => {
    expect(isLocalBaseURL(url)).toBe(expected);
  });
});
