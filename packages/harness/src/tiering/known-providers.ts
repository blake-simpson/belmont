// Belmont's built-in provider templates for the M7 multi-model tiering.
//
// The §9.1 models.json schema is LOCKED (risk #6) and has no top-level
// `providers` block, so Belmont can't ask the user to declare provider
// metadata directly. Instead, when a tier names a provider that pi's
// ModelRegistry doesn't already know about, the harness reaches into
// this small dict and constructs a `pi.registerProvider(name, config)`
// call from the template + the tier's `baseURL`/`model` fields.
//
// Belmont ships templates for the four providers v2.3 §17 M7 P0 names
// explicitly: `codex`, `kimi`, `openai-compatible`, plus `ollama` (the
// canonical local example). Pi already handles `anthropic`, `openai`,
// `openai-responses`, etc. as built-ins — those flow through
// modelRegistry.find() and never reach the registration code path.
//
// Adding a new template here is a pure-additive change; downstream
// resolveTier() doesn't know or care which providers are templated.
//
// pi-mono upstream references (per D-001-omp-evaluation):
//   - examples/extensions/custom-provider-anthropic/index.ts
//     (full ProviderConfig shape, including OAuth)
//   - examples/extensions/custom-provider-gitlab-duo/index.ts
//     (multi-API provider with a custom streamSimple)
//
// The Belmont M7 templates DO NOT supply `streamSimple` or `oauth`
// callbacks — they describe API-key providers that route through pi's
// built-in streamers (anthropic-messages / openai-responses / openai-
// chat-completions). Providers that need OAuth or a custom stream
// implementation are expected to ship their own pi extension; Belmont
// only registers what it can do generically.

import type { Api, ProviderConfig } from "../pi/sdk.js";

export type KnownProviderTemplate = {
  /** Display name for the provider (shown in /model picker). */
  displayName: string;
  /** Pi API identifier — anthropic-messages / openai-responses / openai-chat-completions / etc. */
  api: Api;
  /**
   * Either an environment variable name (resolved via pi's AuthStorage
   * fallback resolver) or `undefined` when the provider's auth is
   * supplied by pi itself (subscription via /login).
   */
  apiKeyEnv?: string;
  /**
   * Default baseURL for the provider. Tiers may override this via the
   * `baseURL` field (the canonical pattern for local Ollama endpoints).
   * `undefined` means "the tier MUST supply a baseURL or registration
   * fails."
   */
  defaultBaseURL?: string;
  /**
   * Default per-model meta when registering a model from this template.
   * Belmont fills in `id`/`name` from the tier; everything below is the
   * template's contribution.
   */
  defaultModelMeta: {
    reasoning: boolean;
    input: ("text" | "image")[];
    contextWindow: number;
    maxTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
  };
};

export const KNOWN_PROVIDER_TEMPLATES: Record<string, KnownProviderTemplate> = {
  "openai-compatible": {
    displayName: "OpenAI-compatible endpoint",
    api: "openai-chat-completions",
    apiKeyEnv: "OPENAI_COMPATIBLE_API_KEY",
    defaultBaseURL: undefined, // tier MUST supply baseURL
    defaultModelMeta: {
      reasoning: false,
      input: ["text"],
      contextWindow: 32768,
      maxTokens: 8192,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  },
  ollama: {
    displayName: "Ollama (local)",
    api: "openai-chat-completions",
    apiKeyEnv: "OLLAMA_API_KEY",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    defaultModelMeta: {
      reasoning: false,
      input: ["text"],
      contextWindow: 32768,
      maxTokens: 8192,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  },
  codex: {
    displayName: "Codex (OpenAI)",
    api: "openai-responses",
    apiKeyEnv: "CODEX_API_KEY",
    defaultBaseURL: "https://api.openai.com/v1",
    defaultModelMeta: {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 128000,
      maxTokens: 16384,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  },
  kimi: {
    displayName: "Kimi (Moonshot)",
    api: "openai-chat-completions",
    apiKeyEnv: "KIMI_API_KEY",
    defaultBaseURL: "https://api.moonshot.cn/v1",
    defaultModelMeta: {
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 8192,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  },
};

/**
 * Build the `ProviderConfig` Belmont passes to `pi.registerProvider`
 * for a single tier whose provider is in `KNOWN_PROVIDER_TEMPLATES`.
 *
 * Returns `null` when registration is impossible (e.g. openai-compatible
 * with no `baseURL` on either side). Callers surface that via the doctor
 * so the user sees WHY a provider can't be wired.
 */
export function buildProviderConfigFromTemplate(
  template: KnownProviderTemplate,
  tier: { provider: string; model: string; baseURL?: string },
): ProviderConfig | null {
  const baseUrl = tier.baseURL ?? template.defaultBaseURL;
  if (!baseUrl) return null;
  return {
    name: template.displayName,
    baseUrl,
    apiKey: template.apiKeyEnv,
    api: template.api,
    models: [
      {
        id: tier.model,
        name: tier.model,
        reasoning: template.defaultModelMeta.reasoning,
        input: template.defaultModelMeta.input,
        cost: template.defaultModelMeta.cost,
        contextWindow: template.defaultModelMeta.contextWindow,
        maxTokens: template.defaultModelMeta.maxTokens,
      },
    ],
  };
}
