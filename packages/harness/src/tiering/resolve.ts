// resolveTier — pure 4-layer priority resolution per v2.3 §9.2.
//
// Layer priority (highest → lowest):
//   1. CLI / command flag       (`/belmont:auto … --tier <agent>=<value>`)
//   2. Per-milestone overlay    (HTML comment in PROGRESS.md)
//   3. Per-agent default        (models.json#agents)
//   4. Tier base                (models.json#tiers)
//
// The function takes ALREADY-PARSED inputs (ModelsJson + OverlayTokens +
// the CLI override map). Callers that need to read PROGRESS.md or
// models.json from disk do that themselves and pass the parsed values
// in; the resolver stays pure (no FS, no fetch, no pi).
//
// The four-layer model is intentionally additive — each higher layer can
// override only the fields it provides, falling through to lower layers
// for whatever it leaves unset. E.g. a milestone overlay that names just
// `implementation=high+anthropic/claude-sonnet-4-6` keeps the tier-base
// thinking level and (absent baseURL) the tier-base baseURL.

import {
  agentTier,
  type AgentRole,
  type ModelsJson,
  type ModelsTier,
  type OverlayTokens,
  type OverlayValue,
  type ThinkingLevel,
  type TierName,
} from "@belmont/knowledge-schema";

export type ResolvedTierAuth = "subscription" | "local" | "api_key" | "none";
export type ResolvedTierSource =
  | "cli"
  | "overlay"
  | "agent-default"
  | "tier-base";

export type ResolvedTier = {
  /** The base tier slot the resolution snapped to ("high"/"medium"/"low"). */
  tier: TierName;
  provider: string;
  model: string;
  thinking?: ThinkingLevel;
  baseURL?: string;
  auth?: ResolvedTierAuth;
  /**
   * Which layer ended up providing the WINNING override.
   * - "tier-base": no overlay or CLI flag touched this agent; tier base used as-is.
   * - "agent-default": models.json#agents picked a tier different from the implicit "medium".
   * - "overlay": milestone overlay touched this agent.
   * - "cli": a CLI / command flag touched this agent (top priority).
   */
  source: ResolvedTierSource;
};

export type TierOverrideMap = Partial<Record<AgentRole, OverlayValue>>;

export type ResolveScope = {
  /** Pre-parsed milestone overlay (output of `parseMilestoneOverlay`). */
  milestoneOverlay?: OverlayTokens | null;
  /** CLI flag overrides (output of the cli-flag parser, same shape as overlay). */
  cliOverrides?: TierOverrideMap;
};

/**
 * Resolve the model assignment for a single agent role in a given scope.
 *
 * Cite for the field shape: v2.3 §9.2 ("Resolution — 4-layer priority"),
 * §9.3 (overlay token grammar), §9.6 (auth handling).
 */
export function resolveTier(
  modelsJson: ModelsJson,
  agent: AgentRole,
  scope: ResolveScope = {},
): ResolvedTier {
  const baseTier = agentTier(modelsJson, agent);
  const baseTierData = modelsJson.tiers[baseTier];

  // Layer 3 → 4: the agent-default vs the tier base is purely an
  // accounting question; the actual MODEL/PROVIDER comes from the tier
  // slot's settings. `source` reflects which layer explained the agent
  // landing on its tier.
  const tierBaseSource: ResolvedTierSource = modelsJson.agents?.[agent]
    ? "agent-default"
    : "tier-base";

  let resolved = applyOverride(baseTier, baseTierData, undefined, tierBaseSource);

  // Layer 2: per-milestone overlay.
  const overlayValue = scope.milestoneOverlay?.[agent];
  if (overlayValue) {
    const overlayTier = overlayValue.tier;
    const overlayTierData = modelsJson.tiers[overlayTier];
    resolved = applyOverride(overlayTier, overlayTierData, overlayValue, "overlay");
  }

  // Layer 1: CLI / command flag — highest priority, last applied.
  const cliValue = scope.cliOverrides?.[agent];
  if (cliValue) {
    const cliTier = cliValue.tier;
    const cliTierData = modelsJson.tiers[cliTier];
    resolved = applyOverride(cliTier, cliTierData, cliValue, "cli");
  }

  return resolved;
}

/**
 * Compose the resolved-tier shape for ONE layer, given the (always
 * present) base tier data and the (optional) overlay/CLI override that
 * fills in finer-grained fields.
 */
function applyOverride(
  tierName: TierName,
  tierData: ModelsTier,
  override: OverlayValue | undefined,
  source: ResolvedTierSource,
): ResolvedTier {
  const provider = override?.provider ?? tierData.provider;
  const model = override?.model ?? tierData.model;
  const thinking = override?.thinking ?? tierData.thinking;
  // baseURL: prefer override → tier-data → undefined. Subscription
  // providers don't pin a baseURL; locals do.
  const baseURL = override?.baseURL ?? tierData.baseURL;
  return {
    tier: tierName,
    provider,
    model,
    thinking,
    baseURL,
    auth: classifyAuth(tierData, baseURL),
    source,
  };
}

/**
 * Classify the auth mode for a resolved tier. The schema's optional
 * `auth` field wins when set; otherwise we infer from the baseURL
 * (localhost → local, anything else → subscription) to keep older
 * models.json shapes (no `auth` field) working.
 */
export function classifyAuth(
  tier: ModelsTier,
  resolvedBaseURL?: string,
): ResolvedTierAuth {
  if (tier.auth) return tier.auth;
  const url = resolvedBaseURL ?? tier.baseURL;
  if (url && isLocalBaseURL(url)) return "local";
  return "subscription";
}

const LOCAL_HOST_RE = /^(?:127(?:\.\d+){3}|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?$/i;

export function isLocalBaseURL(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return LOCAL_HOST_RE.test(url.host);
  } catch {
    return false;
  }
}
