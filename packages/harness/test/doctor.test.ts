import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatDoctorReport,
  runModelsDoctor,
} from "../src/tiering/doctor.js";

const ANTHROPIC_MODELS_JSON = {
  schema: "belmont.models.v1",
  tiers: {
    high: { provider: "anthropic", model: "claude-opus-4-7", thinking: "high" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6", thinking: "medium" },
    low: { provider: "anthropic", model: "claude-haiku-4-5", thinking: "low" },
  },
  agents: {
    implementation: "medium",
    verification: "high",
  },
};

const MIXED_MODELS_JSON = {
  schema: "belmont.models.v1",
  tiers: {
    high: { provider: "codex", model: "gpt-5.5", auth: "subscription" },
    medium: { provider: "kimi", model: "kimi-k2", auth: "subscription" },
    low: {
      provider: "ollama",
      model: "qwen3-coder",
      baseURL: "http://127.0.0.1:11434/v1",
      auth: "local",
    },
  },
};

async function setupProject(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "belmont-doctor-test-"));
  await mkdir(join(root, ".belmont"), { recursive: true });
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

function makeRegistry(
  authStatuses: Record<string, { configured: boolean; source?: string }>,
): any {
  return {
    authStorage: {
      hasAuth: (p: string) => authStatuses[p]?.configured ?? false,
      getAuthStatus: (p: string) => authStatuses[p] ?? { configured: false },
    },
    find: () => undefined,
  };
}

describe("runModelsDoctor — missing models.json", () => {
  it("returns hardFail when .belmont/models.json doesn't exist", async () => {
    const { root, cleanup } = await setupProject();
    try {
      const r = await runModelsDoctor(root);
      expect(r.modelsJsonExists).toBe(false);
      expect(r.hardFail).toBe(true);
      expect(formatDoctorReport(r)).toContain("models.json not found");
    } finally {
      await cleanup();
    }
  });
});

describe("runModelsDoctor — invalid models.json", () => {
  it("surfaces validation errors and hardFails", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify({ schema: "belmont.models.v1", tiers: {} }),
      );
      const r = await runModelsDoctor(root);
      expect(r.modelsJsonExists).toBe(true);
      expect(r.modelsJsonErrors.length).toBeGreaterThan(0);
      expect(r.hardFail).toBe(true);
      const report = formatDoctorReport(r);
      expect(report).toContain("invalid");
    } finally {
      await cleanup();
    }
  });
});

describe("runModelsDoctor — stub path (no modelRegistry)", () => {
  it("marks subscription tiers reachable and tags STUB", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      const r = await runModelsDoctor(root);
      expect(r.modelsJsonExists).toBe(true);
      expect(r.hardFail).toBe(false);
      expect(r.results.every((t) => t.reachable)).toBe(true);
      expect(r.results.every((t) => t.stub)).toBe(true);
      expect(formatDoctorReport(r)).toContain("[STUB]");
    } finally {
      await cleanup();
    }
  });
});

describe("runModelsDoctor — live modelRegistry path", () => {
  it("marks subscription tiers reachable when credentials are on disk", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      const registry = makeRegistry({ anthropic: { configured: true, source: "stored" } });
      const r = await runModelsDoctor(root, { modelRegistry: registry });
      expect(r.hardFail).toBe(false);
      expect(r.results.every((t) => t.reachable && !t.stub)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("hard-fails when zero subscription tiers have credentials", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      const registry = makeRegistry({ anthropic: { configured: false } });
      const r = await runModelsDoctor(root, { modelRegistry: registry });
      expect(r.hardFail).toBe(true);
      expect(r.reachableCount).toBe(0);
      const report = formatDoctorReport(r);
      expect(report).toContain("HARD FAIL");
      expect(report).toContain("pi /login anthropic");
    } finally {
      await cleanup();
    }
  });
});

describe("runModelsDoctor — local probe", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks local tier reachable when HTTP probe returns 2xx", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200 });
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(MIXED_MODELS_JSON),
      );
      const registry = makeRegistry({
        codex: { configured: true },
        kimi: { configured: true },
      });
      const r = await runModelsDoctor(root, { modelRegistry: registry });
      const local = r.results.find((t) => t.name === "low")!;
      expect(local.reachable).toBe(true);
      expect(local.auth).toBe("local");
    } finally {
      await cleanup();
    }
  });

  it("marks local tier NOT reachable on connection refused with curl recovery", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(MIXED_MODELS_JSON),
      );
      const registry = makeRegistry({
        codex: { configured: true },
        kimi: { configured: true },
      });
      const r = await runModelsDoctor(root, { modelRegistry: registry });
      const local = r.results.find((t) => t.name === "low")!;
      expect(local.reachable).toBe(false);
      expect(local.recovery).toBe("curl http://127.0.0.1:11434/v1/models");
      // Subscription tiers still reachable → no hard fail.
      expect(r.hardFail).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

describe("runModelsDoctor — per-agent resolution + overlay", () => {
  it("includes per-agent resolution dump for all 11 agents", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      const r = await runModelsDoctor(root);
      expect(r.agentResolutions.length).toBe(11);
      const impl = r.agentResolutions.find((a) => a.agent === "implementation")!;
      expect(impl.resolved.tier).toBe("medium");
      expect(impl.resolved.source).toBe("agent-default");
    } finally {
      await cleanup();
    }
  });

  it("applies per-milestone overlay when --milestone is set", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS

### M2: Test overlay
<!-- belmont:models implementation=high+anthropic/claude-sonnet-4-6 -->
- [ ] P0-1 Test override
`,
      );
      const r = await runModelsDoctor(root, { milestoneId: "M2" });
      const impl = r.agentResolutions.find((a) => a.agent === "implementation")!;
      expect(impl.resolved.tier).toBe("high");
      expect(impl.resolved.provider).toBe("anthropic");
      expect(impl.resolved.model).toBe("claude-sonnet-4-6");
      expect(impl.resolved.source).toBe("overlay");
    } finally {
      await cleanup();
    }
  });

  it("surfaces overlay parse warnings", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS

### M3: Bad overlay
<!-- belmont:models frontend=high -->
- [ ] P0-1 Bad
`,
      );
      const r = await runModelsDoctor(root, { milestoneId: "M3" });
      expect(r.overlayWarnings.length).toBeGreaterThan(0);
      expect(r.overlayWarnings[0]?.message).toMatch(/unknown agent/);
    } finally {
      await cleanup();
    }
  });
});

describe("runModelsDoctor — CLI override (Layer 1)", () => {
  it("CLI override wins over agent-default", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      const r = await runModelsDoctor(root, {
        cliOverrides: { implementation: { tier: "high" } },
      });
      const impl = r.agentResolutions.find((a) => a.agent === "implementation")!;
      expect(impl.resolved.tier).toBe("high");
      expect(impl.resolved.source).toBe("cli");
    } finally {
      await cleanup();
    }
  });
});

describe("formatDoctorReport", () => {
  it("renders the §9.4 result line with reachable count", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      const r = await runModelsDoctor(root);
      const report = formatDoctorReport(r);
      expect(report).toContain("3 of 3 tiers reachable");
    } finally {
      await cleanup();
    }
  });

  it("appends scope tag in agent resolution heading when milestoneId set", async () => {
    const { root, cleanup } = await setupProject();
    try {
      await writeFile(
        join(root, ".belmont", "models.json"),
        JSON.stringify(ANTHROPIC_MODELS_JSON),
      );
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS
### M2: Test
- [ ] P0-1 t
`,
      );
      const r = await runModelsDoctor(root, { milestoneId: "M2" });
      const report = formatDoctorReport(r);
      expect(report).toContain("scope: M2");
    } finally {
      await cleanup();
    }
  });
});
