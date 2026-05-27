import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseModelsArgs, registerModelsCommand } from "../src/commands/models.js";

async function setupProject(modelsJson?: object): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "belmont-models-test-"));
  await mkdir(join(root, ".belmont"), { recursive: true });
  if (modelsJson) {
    await writeFile(
      join(root, ".belmont", "models.json"),
      JSON.stringify(modelsJson),
    );
  }
  return {
    root,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

const DOGFOOD = {
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

describe("parseModelsArgs", () => {
  it("parses empty args as empty sub", () => {
    expect(parseModelsArgs("")).toEqual({ sub: "", positional: [], tierFlags: [] });
  });

  it("parses 'doctor' subcommand", () => {
    const r = parseModelsArgs("doctor");
    expect(r.sub).toBe("doctor");
    expect(r.milestone).toBeUndefined();
  });

  it("parses --milestone flag (space-separated and =)", () => {
    expect(parseModelsArgs("doctor --milestone M3").milestone).toBe("M3");
    expect(parseModelsArgs("doctor --milestone=M3").milestone).toBe("M3");
  });

  it("parses --tier flag values", () => {
    const r = parseModelsArgs("doctor --tier implementation=high --tier verification=low");
    expect(r.tierFlags).toEqual(["implementation=high", "verification=low"]);
  });

  it("parses 'resolve <agent>'", () => {
    const r = parseModelsArgs("resolve implementation");
    expect(r.sub).toBe("resolve");
    expect(r.positional).toEqual(["implementation"]);
  });

  it("treats unknown leading token as help", () => {
    expect(parseModelsArgs("--what").sub).toBe("help");
    expect(parseModelsArgs("help").sub).toBe("help");
    expect(parseModelsArgs("--help").sub).toBe("help");
  });
});

describe("/belmont:models registration", () => {
  it("registers a single belmont:models command", () => {
    const calls: any[] = [];
    const pi = {
      registerCommand: (name: string, options: any) => calls.push({ name, options }),
    };
    registerModelsCommand(pi as any);
    expect(calls.length).toBe(1);
    expect(calls[0].name).toBe("belmont:models");
    expect(calls[0].options.handler).toBeInstanceOf(Function);
  });

  it("argument-completes the three subcommands by prefix", () => {
    const calls: any[] = [];
    const pi = {
      registerCommand: (name: string, options: any) => calls.push({ name, options }),
    };
    registerModelsCommand(pi as any);
    const opts = calls[0].options;
    expect(opts.getArgumentCompletions("d")).toEqual([{ value: "doctor", label: "doctor" }]);
    expect(opts.getArgumentCompletions("re")).toEqual([{ value: "resolve", label: "resolve" }]);
    expect(opts.getArgumentCompletions("o")).toEqual([{ value: "overlays", label: "overlays" }]);
  });
});

describe("/belmont:models handler routing", () => {
  let handler: any;
  beforeEach(() => {
    const calls: any[] = [];
    const pi = {
      registerCommand: (name: string, options: any) => calls.push({ name, options }),
    };
    registerModelsCommand(pi as any);
    handler = calls[0].options.handler;
  });

  it("doctor subcommand notifies with a formatted report", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("doctor", ctx);
      expect(notifies.length).toBe(1);
      const [text, level] = notifies[0]!;
      expect(text).toContain("[belmont:models doctor]");
      expect(level).toBe("info");
    } finally {
      await cleanup();
    }
  });

  it("resolve <agent> prints the resolved tier", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("resolve implementation", ctx);
      const text = notifies[0]?.[0] ?? "";
      expect(text).toContain("resolve implementation");
      expect(text).toContain("provider: anthropic");
      expect(text).toContain("model:    claude-sonnet-4-6");
      expect(text).toContain("source:   agent-default");
    } finally {
      await cleanup();
    }
  });

  it("resolve <agent> with --milestone applies overlay (source: overlay)", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS

### M2: Overlay test
<!-- belmont:models implementation=high -->
- [ ] P0-1 t
`,
      );
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("resolve implementation --milestone M2", ctx);
      const text = notifies[0]?.[0] ?? "";
      expect(text).toContain("scope: M2");
      expect(text).toContain("tier:     high");
      expect(text).toContain("source:   overlay");
    } finally {
      await cleanup();
    }
  });

  it("resolve with --tier flag wins over overlay (source: cli)", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS

### M2: Overlay
<!-- belmont:models implementation=high -->
- [ ] P0-1 t
`,
      );
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("resolve implementation --milestone M2 --tier implementation=low", ctx);
      const text = notifies[0]?.[0] ?? "";
      expect(text).toContain("source:   cli");
      expect(text).toContain("tier:     low");
    } finally {
      await cleanup();
    }
  });

  it("resolve <unknown-agent> warns with valid agents listed", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("resolve nope", ctx);
      const [text, level] = notifies[0]!;
      expect(text).toContain("Unknown agent");
      expect(level).toBe("warning");
    } finally {
      await cleanup();
    }
  });

  it("overlays lists per-milestone overrides", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS

### M2: With overlay
<!-- belmont:models implementation=high verification=low -->
- [ ] P0-1 t

### M3: Without overlay
- [ ] P0-1 t
`,
      );
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("overlays", ctx);
      const text = notifies[0]?.[0] ?? "";
      expect(text).toContain("M2: implementation=high");
      expect(text).toContain("verification=low");
      expect(text).not.toContain("M3:");
    } finally {
      await cleanup();
    }
  });

  it("overlays says 'no overlays' when none present", async () => {
    const { root, cleanup } = await setupProject(DOGFOOD);
    try {
      await writeFile(
        join(root, ".belmont", "PROGRESS.md"),
        `# PROGRESS

### M2: No overlay
- [ ] P0-1 t
`,
      );
      const notifies: Array<[string, string | undefined]> = [];
      const ctx = {
        cwd: root,
        modelRegistry: undefined,
        ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
      };
      await handler("overlays", ctx);
      const text = notifies[0]?.[0] ?? "";
      expect(text).toContain("no per-milestone overlays");
    } finally {
      await cleanup();
    }
  });

  it("help / empty subcommand prints usage", async () => {
    const notifies: Array<[string, string | undefined]> = [];
    const ctx = {
      cwd: "/tmp",
      modelRegistry: undefined,
      ui: { notify: (text: string, level?: string) => notifies.push([text, level]) },
    };
    await handler("", ctx);
    expect(notifies[0]?.[0]).toContain("Usage:");
  });
});
