// runModelsDoctor — the boot resilience contract from v2.3 §7.6 + §9.4.
// `belmont init` invokes this; auto mode (M8) will also gate on it.
//
// M3 status: STUB. Subscription tiers are assumed reachable (with a
// clear stub note in the per-tier result) because real AuthStorage
// checks land at M7. Local-endpoint tiers (`auth: "local"`) are probed
// for real via HTTP GET to `${baseURL}/models` with a short timeout —
// these are the only ones that can plausibly fail at init time today.
//
// M7 will replace the subscription branch with proper auth + provider
// `/models` reachability checks. The return shape stays stable so
// callers (init, auto-mode preflight, /belmont:models doctor command)
// do not need to change.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ModelsTier = {
  provider: string;
  model: string;
  thinking?: string;
  baseURL?: string;
  auth?: "subscription" | "local" | "none";
};

export type ModelsJson = {
  schema?: string;
  tiers?: Record<string, ModelsTier>;
  agents?: Record<string, string>;
  features?: Record<string, unknown>;
  ctx_thresholds?: Record<string, number>;
};

export type TierResult = {
  name: string;
  tier: ModelsTier;
  reachable: boolean;
  stub: boolean;
  message: string;
  recovery?: string;
};

export type DoctorResult = {
  modelsJsonPath: string;
  modelsJsonExists: boolean;
  results: TierResult[];
  reachableCount: number;
  hardFail: boolean;
};

const LOCAL_HOST_RE = /^(?:127(?:\.\d+){3}|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?$/i;

function isLocalBaseURL(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return LOCAL_HOST_RE.test(url.host);
  } catch {
    return false;
  }
}

async function probeLocalEndpoint(baseURL: string, timeoutMs = 1500): Promise<{ ok: boolean; detail: string }> {
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

async function readModelsJson(path: string): Promise<ModelsJson | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ModelsJson;
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw err;
  }
}

export async function runModelsDoctor(projectRoot: string): Promise<DoctorResult> {
  const modelsJsonPath = join(projectRoot, ".belmont", "models.json");
  const config = await readModelsJson(modelsJsonPath);
  if (!config) {
    return {
      modelsJsonPath,
      modelsJsonExists: false,
      results: [],
      reachableCount: 0,
      hardFail: true,
    };
  }

  const tiers = config.tiers ?? {};
  const results: TierResult[] = [];

  for (const [name, tier] of Object.entries(tiers)) {
    const looksLocal =
      tier.auth === "local" || (tier.baseURL !== undefined && isLocalBaseURL(tier.baseURL));
    if (looksLocal && tier.baseURL) {
      const probe = await probeLocalEndpoint(tier.baseURL);
      results.push({
        name,
        tier,
        reachable: probe.ok,
        stub: false,
        message: probe.ok
          ? `${tier.provider}/${tier.model} @ ${tier.baseURL} — reachable (${probe.detail})`
          : `${tier.provider}/${tier.model} @ ${tier.baseURL} — NOT REACHABLE (${probe.detail})`,
        recovery: probe.ok ? undefined : `curl ${tier.baseURL.replace(/\/+$/, "")}/models`,
      });
      continue;
    }

    // Subscription / unknown-auth: M3 stub assumes reachable. M7 wires
    // the real AuthStorage check and provider /models probe.
    results.push({
      name,
      tier,
      reachable: true,
      stub: true,
      message: `${tier.provider}/${tier.model} — assumed reachable [STUB: real auth check lands in M7]`,
    });
  }

  const reachableCount = results.filter((r) => r.reachable).length;
  return {
    modelsJsonPath,
    modelsJsonExists: true,
    results,
    reachableCount,
    hardFail: reachableCount === 0,
  };
}

export function formatDoctorReport(doctor: DoctorResult): string {
  const lines: string[] = ["[belmont:models doctor]"];
  if (!doctor.modelsJsonExists) {
    lines.push(`  models.json not found at ${doctor.modelsJsonPath}`);
    lines.push("  Run `belmont init` to scaffold .belmont/.");
    return lines.join("\n");
  }
  for (const r of doctor.results) {
    const marker = r.reachable ? "✓" : "✗";
    lines.push(`  ${marker} ${r.name.padEnd(8)} ${r.message}`);
    if (r.recovery) {
      lines.push(`             recovery: ${r.recovery}`);
    }
  }
  const total = doctor.results.length;
  lines.push("");
  lines.push(
    `  Result: ${doctor.reachableCount} of ${total} tier${total === 1 ? "" : "s"} reachable.`,
  );
  if (doctor.hardFail) {
    lines.push("  ✗ HARD FAIL: at least one tier must be reachable for belmont init to succeed.");
  }
  return lines.join("\n");
}
