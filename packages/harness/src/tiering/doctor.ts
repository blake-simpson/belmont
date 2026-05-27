// runModelsDoctor — v2.3 §9.4 + §9.5 boot resilience.
//
// M7 promotes this from the M3 stub into the real per-tier reachability
// check, with optional per-milestone overlay surfacing for the
// `/belmont:models doctor --milestone M3` flag.
//
// Reachability classification:
//   - LOCAL tier (auth=local OR localhost baseURL): HTTP GET
//     `${baseURL}/models` with 1.5s timeout. The current behaviour from
//     the M3 stub — preserved verbatim, just generalised to the new
//     return shape.
//   - SUBSCRIPTION / API-KEY tier (everything else): check
//     `modelRegistry.authStorage.hasAuth(provider)`. Sync. No network
//     call (per the §9.6 design: cached OAuth + env vars are the boot
//     contract; live network errors surface at first agent call).
//   - When modelRegistry is undefined (CLI path, no live pi context),
//     subscription tiers are STUBBED (M3 behaviour). The new check only
//     activates inside the harness, which is where M7 cares about it.
//
// §9.5 hard-fail contract: zero reachable tiers → result.hardFail = true.
// Callers (belmont init, /belmont:auto preflight) decide what to do.
//
// pi-mono upstream reference (per D-001-omp-evaluation):
//   - examples/extensions/model-status.ts (model_select hook pattern)

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type AgentRole,
  AGENT_ROLES,
  type Diagnostic,
  type ModelsJson,
  parseMilestoneOverlay,
} from "@belmont/knowledge-schema";

import type { AuthStorage, ModelRegistry } from "../pi/sdk.js";
import { loadModelsJson } from "./models-json.js";
import {
  classifyAuth,
  isLocalBaseURL,
  resolveTier,
  type ResolvedTier,
  type ResolvedTierAuth,
  type TierOverrideMap,
} from "./resolve.js";

export type TierReachability = {
  /** Tier slot ("high"/"medium"/"low"). */
  name: string;
  provider: string;
  model: string;
  baseURL?: string;
  auth: ResolvedTierAuth;
  /** Whether this tier is usable right now. */
  reachable: boolean;
  /** True when the result came from a stub path (no live pi context). */
  stub: boolean;
  /** Human-readable "what happened" line. */
  message: string;
  /** Shell command the user can run to fix this tier (when not reachable). */
  recovery?: string;
};

export type AgentResolution = {
  agent: AgentRole;
  resolved: ResolvedTier;
};

export type DoctorOptions = {
  /**
   * Live ModelRegistry from `ctx.modelRegistry` (inside pi). When
   * absent, subscription tiers are stubbed.
   */
  modelRegistry?: ModelRegistry;
  /**
   * If set, parse the corresponding milestone's HTML-comment overlay
   * from PROGRESS.md and use it in the per-agent resolution.
   */
  milestoneId?: string;
  /** Optional CLI override map (Layer 1 — see §9.2). */
  cliOverrides?: TierOverrideMap;
};

export type DoctorResult = {
  modelsJsonPath: string;
  modelsJsonExists: boolean;
  /** Validation errors when the file exists but failed Zod parse. */
  modelsJsonErrors: Diagnostic[];
  results: TierReachability[];
  /** Per-agent resolution. Only populated when modelsJson loaded successfully. */
  agentResolutions: AgentResolution[];
  /** Per-tier counts. */
  reachableCount: number;
  /** True when zero tiers are reachable — boot/auto must hard-fail. */
  hardFail: boolean;
  /** Milestone the overlay was read against, if any. */
  milestoneId?: string;
  /** Overlay parse warnings (unknown agent in token, etc.), if any. */
  overlayWarnings: Diagnostic[];
};

const LOCAL_PROBE_TIMEOUT_MS = 1500;

export async function runModelsDoctor(
  projectRoot: string,
  opts: DoctorOptions = {},
): Promise<DoctorResult> {
  const load = await loadModelsJson(projectRoot);
  if (!load.ok) {
    return {
      modelsJsonPath: load.path,
      modelsJsonExists: !load.missing,
      modelsJsonErrors: load.errors,
      results: [],
      agentResolutions: [],
      reachableCount: 0,
      hardFail: true,
      milestoneId: opts.milestoneId,
      overlayWarnings: [],
    };
  }

  const modelsJson = load.data;

  // ── Per-tier reachability ───────────────────────────────────────────
  const tierResults: TierReachability[] = [];
  for (const [name, tier] of Object.entries(modelsJson.tiers)) {
    const auth = classifyAuth(tier);
    if (auth === "local") {
      const baseURL = tier.baseURL ?? "";
      const probe = baseURL
        ? await probeLocalEndpoint(baseURL)
        : { ok: false, detail: "no baseURL configured" };
      tierResults.push({
        name,
        provider: tier.provider,
        model: tier.model,
        baseURL: tier.baseURL,
        auth,
        reachable: probe.ok,
        stub: false,
        message: probe.ok
          ? `${tier.provider}/${tier.model} @ ${tier.baseURL} — reachable (${probe.detail})`
          : `${tier.provider}/${tier.model} @ ${tier.baseURL ?? "<no baseURL>"} — NOT REACHABLE (${probe.detail})`,
        recovery: probe.ok || !tier.baseURL ? undefined : `curl ${tier.baseURL.replace(/\/+$/, "")}/models`,
      });
      continue;
    }

    // Subscription / api_key / none — check AuthStorage when available.
    if (opts.modelRegistry) {
      const authStorage = opts.modelRegistry.authStorage;
      const status = authStorage.getAuthStatus(tier.provider);
      const reachable = status.configured;
      tierResults.push({
        name,
        provider: tier.provider,
        model: tier.model,
        baseURL: tier.baseURL,
        auth,
        reachable,
        stub: false,
        message: reachable
          ? `${tier.provider}/${tier.model} — credentials configured (${status.source ?? "stored"})`
          : `${tier.provider}/${tier.model} — NO CREDENTIALS`,
        recovery: reachable
          ? undefined
          : suggestSubscriptionRecovery(tier.provider, authStorage),
      });
      continue;
    }

    // Fallback: M3 stub behaviour — we don't have a ModelRegistry, so
    // assume reachable and tag stub=true. Callers (CLI without pi) see
    // the stub note in formatDoctorReport().
    tierResults.push({
      name,
      provider: tier.provider,
      model: tier.model,
      baseURL: tier.baseURL,
      auth,
      reachable: true,
      stub: true,
      message: `${tier.provider}/${tier.model} — assumed reachable [STUB: live auth check requires modelRegistry]`,
    });
  }

  // ── Per-milestone overlay (Layer 2) ────────────────────────────────
  let milestoneOverlay = null;
  const overlayWarnings: Diagnostic[] = [];
  if (opts.milestoneId) {
    try {
      const progressMd = await readFile(
        join(projectRoot, ".belmont", "PROGRESS.md"),
        "utf8",
      );
      const parsed = parseMilestoneOverlay(progressMd, opts.milestoneId);
      milestoneOverlay = parsed.overlay;
      overlayWarnings.push(...parsed.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      overlayWarnings.push({
        code: "DOCTOR_PROGRESS_READ_ERROR",
        severity: "warning",
        message: `Could not read .belmont/PROGRESS.md for overlay lookup: ${msg}`,
      });
    }
  }

  // ── Per-agent resolution dump ──────────────────────────────────────
  const agentResolutions: AgentResolution[] = AGENT_ROLES.map((agent) => ({
    agent,
    resolved: resolveTier(modelsJson, agent, {
      milestoneOverlay,
      cliOverrides: opts.cliOverrides,
    }),
  }));

  const reachableCount = tierResults.filter((r) => r.reachable).length;
  return {
    modelsJsonPath: load.path,
    modelsJsonExists: true,
    modelsJsonErrors: [],
    results: tierResults,
    agentResolutions,
    reachableCount,
    hardFail: reachableCount === 0,
    milestoneId: opts.milestoneId,
    overlayWarnings,
  };
}

async function probeLocalEndpoint(
  baseURL: string,
  timeoutMs = LOCAL_PROBE_TIMEOUT_MS,
): Promise<{ ok: boolean; detail: string }> {
  const url = baseURL.replace(/\/+$/, "") + "/models";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg };
  } finally {
    clearTimeout(timer);
  }
}

function suggestSubscriptionRecovery(
  provider: string,
  _authStorage: AuthStorage,
): string {
  // Could distinguish OAuth providers (`pi /login <provider>`) from
  // API-key providers (`set <ENV>`), but pi 0.75.5's getAuthStatus
  // doesn't return enough to disambiguate without a private accessor.
  // Print the catch-all guidance: try the login first, fall back to env.
  return `pi /login ${provider}  (or set the provider's API-key env var)`;
}

// ─────────────────────────────────────────────────────────────────────
// Formatter (used by /belmont:models doctor + belmont init).
// ─────────────────────────────────────────────────────────────────────

export function formatDoctorReport(doctor: DoctorResult): string {
  const lines: string[] = ["[belmont:models doctor]"];
  if (!doctor.modelsJsonExists) {
    lines.push(`  models.json not found at ${doctor.modelsJsonPath}`);
    lines.push("  Run `belmont init` to scaffold .belmont/.");
    return lines.join("\n");
  }
  if (doctor.modelsJsonErrors.length > 0) {
    lines.push(`  models.json @ ${doctor.modelsJsonPath} is invalid:`);
    for (const e of doctor.modelsJsonErrors) {
      lines.push(`    - ${e.message}`);
    }
    return lines.join("\n");
  }

  // ── Tier section ─────────────────────────────────────────────────
  for (const r of doctor.results) {
    const marker = r.reachable ? "✓" : "✗";
    const stubTag = r.stub ? " [STUB]" : "";
    lines.push(`  ${marker} ${r.name.padEnd(8)} ${r.message}${stubTag}`);
    if (r.recovery) {
      lines.push(`             recovery: ${r.recovery}`);
    }
  }

  // ── Agent resolution section ────────────────────────────────────
  if (doctor.agentResolutions.length > 0) {
    lines.push("");
    const scopeTag = doctor.milestoneId ? ` (scope: ${doctor.milestoneId})` : "";
    lines.push(`  agent → tier${scopeTag}:`);
    for (const { agent, resolved } of doctor.agentResolutions) {
      const tierR = doctor.results.find((r) => r.name === resolved.tier);
      const reachMark = tierR?.reachable ? "✓" : "✗";
      const providerStr = `${resolved.provider}/${resolved.model}`;
      const thinking = resolved.thinking ? `:${resolved.thinking}` : "";
      lines.push(
        `    ${reachMark} ${agent.padEnd(18)} → ${resolved.tier.padEnd(6)} (${providerStr}${thinking})  [${resolved.source}]`,
      );
    }
  }

  // ── Overlay warnings ──────────────────────────────────────────────
  if (doctor.overlayWarnings.length > 0) {
    lines.push("");
    lines.push("  overlay warnings:");
    for (const w of doctor.overlayWarnings) {
      lines.push(`    - ${w.message}`);
    }
  }

  // ── Result line ──────────────────────────────────────────────────
  const total = doctor.results.length;
  lines.push("");
  lines.push(
    `  Result: ${doctor.reachableCount} of ${total} tier${total === 1 ? "" : "s"} reachable.`,
  );
  if (doctor.hardFail) {
    lines.push("  ✗ HARD FAIL: at least one tier must be reachable for belmont init / auto to succeed.");
  } else if (doctor.reachableCount < total) {
    lines.push("  ⚠ Some tiers unreachable; agents pinned to those tiers will fail-fast at first call.");
  }
  return lines.join("\n");
}

// Re-export the local helper that has tests pinned against it (the M3
// version lived in this file).
export { isLocalBaseURL };
