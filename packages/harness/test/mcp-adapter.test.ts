// Adapter end-to-end with a fake McpClient. The fake exposes the full
// surface the adapter uses; production swaps in `createMcpClient` from
// transport.ts (which wraps `@modelcontextprotocol/sdk`). The fake
// keeps these tests fast (no subprocess) and deterministic.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerMcpServers } from "../src/mcp/adapter.js";
import {
  readToolsCache,
  toolsCachePath,
} from "../src/mcp/cache.js";
import type {
  McpClient,
  McpClientFactory,
  McpToolDescriptor,
} from "../src/mcp/index.js";
import type { ToolDefinition } from "../src/pi/sdk.js";

// ───── Test-level fake McpClient ─────────────────────────────────────

type FakeClientState = {
  serverName: string;
  connectCalls: number;
  closeCalls: number;
  tools: McpToolDescriptor[];
  /** Tool name → handler. Throws → tool error. */
  handlers: Record<string, (args: Record<string, unknown>) => unknown>;
};

const fakeStates = new Map<string, FakeClientState>();

function buildFakeFactory(
  registrations: Record<string, McpToolDescriptor[]>,
  failConnectFor: string[] = [],
): McpClientFactory {
  return (server, _env) => {
    // We tag each client by the `command` (stdio) or `url` (http) — both
    // surfaces have a distinguishing string we can key on for tests.
    const key = server.type === "stdio" ? server.command : server.url;
    const tools = registrations[key] ?? [];
    const state: FakeClientState = {
      serverName: key,
      connectCalls: 0,
      closeCalls: 0,
      tools,
      handlers: {},
    };
    fakeStates.set(key, state);
    const client: McpClient = {
      async connect() {
        state.connectCalls += 1;
        if (failConnectFor.includes(key)) {
          throw new Error(`fake: connect failed for ${key}`);
        }
      },
      async listTools() {
        return state.tools;
      },
      async callTool(name, args) {
        const h = state.handlers[name];
        if (!h) return { ok: false, error: `unknown tool ${name}` };
        try {
          const r = h(args);
          return { ok: true, content: JSON.stringify(r) };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      async close() {
        state.closeCalls += 1;
      },
    };
    return { client, missingEnv: [] };
  };
}

// ───── Mock pi ──────────────────────────────────────────────────────

type FakePi = {
  registerTool: (def: ToolDefinition) => void;
  registered: ToolDefinition[];
};

function fakePi(): FakePi {
  const registered: ToolDefinition[] = [];
  return {
    registered,
    registerTool: (def) => {
      registered.push(def);
    },
  };
}

// ───── Test scaffold ─────────────────────────────────────────────────

let CWD = "";

beforeEach(async () => {
  CWD = await mkdtemp(join(tmpdir(), "belmont-mcp-adapter-"));
  fakeStates.clear();
  // Clear BELMONT_AUTO_MODE between tests so each can opt in.
  delete process.env.BELMONT_AUTO_MODE;
});
afterEach(async () => {
  await rm(CWD, { recursive: true, force: true });
  delete process.env.BELMONT_AUTO_MODE;
});

async function writeMcpJson(body: object): Promise<void> {
  await mkdir(join(CWD, ".belmont"), { recursive: true });
  await writeFile(join(CWD, ".belmont", "mcp.json"), JSON.stringify(body, null, 2), "utf8");
}

// ───── Tests ─────────────────────────────────────────────────────────

describe("registerMcpServers — discovery + registration", () => {
  it("registers tools as mcp__<server>__<tool> (§17 done-when)", async () => {
    await writeMcpJson({
      mcpServers: {
        playwright: { command: "playwright-mcp", args: [] },
      },
    });
    const pi = fakePi();
    const factory = buildFakeFactory({
      "playwright-mcp": [{ name: "screenshot", description: "Take a screenshot", inputSchema: {} }],
    });
    const outcome = await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, {
      createClient: factory,
    });
    expect(outcome.toolCount).toBe(1);
    expect(pi.registered.map((t) => t.name)).toEqual(["mcp__playwright__screenshot"]);
  });

  it("returns 'no-op' (empty results, 0 tools) when .belmont/mcp.json is absent", async () => {
    const pi = fakePi();
    const out = await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, {
      createClient: buildFakeFactory({}),
    });
    expect(out.toolCount).toBe(0);
    expect(out.results).toEqual({});
    expect(pi.registered).toEqual([]);
  });

  it("graceful-degrades when a server's connect fails (§17 done-when)", async () => {
    await writeMcpJson({
      mcpServers: {
        good: { command: "good-bin", args: [] },
        broken: { command: "broken-bin", args: [] },
      },
    });
    const pi = fakePi();
    const factory = buildFakeFactory(
      {
        "good-bin": [{ name: "ok", description: "ok", inputSchema: {} }],
        "broken-bin": [{ name: "x", description: "x", inputSchema: {} }],
      },
      ["broken-bin"],
    );
    const out = await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, {
      createClient: factory,
    });
    expect(out.results.good).toMatchObject({ kind: "registered" });
    expect(out.results.broken).toMatchObject({ kind: "failed" });
    expect(pi.registered.map((t) => t.name)).toEqual(["mcp__good__ok"]);
  });
});

describe("registerMcpServers — blast-radius gate (§12.3)", () => {
  it("under auto mode, drops every server without auto:true (NOT just warns)", async () => {
    await writeMcpJson({
      mcpServers: {
        safe: { command: "safe-bin", args: [], auto: true, lifecycle: "eager" },
        risky: { command: "risky-bin", args: [] }, // auto defaults to false
      },
    });
    const pi = fakePi();
    const factory = buildFakeFactory({
      "safe-bin": [{ name: "go", description: "go", inputSchema: {} }],
      "risky-bin": [{ name: "boom", description: "boom", inputSchema: {} }],
    });
    const out = await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, {
      createClient: factory,
      isAutoMode: () => true,
    });
    expect(out.results.safe).toMatchObject({ kind: "registered" });
    expect(out.results.risky).toMatchObject({ kind: "skipped-no-auto" });
    // The reachability assertion: the risky tool is LITERALLY not
    // registered with pi. The LLM cannot call it under auto mode.
    expect(pi.registered.map((t) => t.name)).toEqual(["mcp__safe__go"]);
    // And the risky-bin fake client was never connected to either.
    expect(fakeStates.get("risky-bin")).toBeUndefined();
  });

  it("in interactive mode, every configured server is reachable", async () => {
    await writeMcpJson({
      mcpServers: {
        safe: { command: "safe-bin", args: [], auto: true },
        risky: { command: "risky-bin", args: [] },
      },
    });
    const pi = fakePi();
    const factory = buildFakeFactory({
      "safe-bin": [{ name: "go", description: "go", inputSchema: {} }],
      "risky-bin": [{ name: "boom", description: "boom", inputSchema: {} }],
    });
    const out = await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, {
      createClient: factory,
      isAutoMode: () => false,
    });
    expect(out.toolCount).toBe(2);
    expect(out.results.safe).toMatchObject({ kind: "registered" });
    expect(out.results.risky).toMatchObject({ kind: "registered" });
  });
});

describe("registerMcpServers — cache (§12.4)", () => {
  it("writes a fresh cache on first registration", async () => {
    await writeMcpJson({
      mcpServers: {
        s: { command: "s-bin", args: [] },
      },
    });
    const factory = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: {} }],
    });
    const pi = fakePi();
    await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factory });
    const cache = await readToolsCache(CWD);
    expect(cache?.entries.s?.tools.map((t) => t.name)).toEqual(["t1"]);
  });

  it("reuses cache on second run with unchanged mcp.json", async () => {
    await writeMcpJson({
      mcpServers: {
        s: { command: "s-bin", args: [] },
      },
    });
    const factory = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: {} }],
    });
    const pi1 = fakePi();
    await registerMcpServers(pi1 as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factory });
    expect(fakeStates.get("s-bin")?.connectCalls).toBe(1);

    // Second run with a fresh factory (so connectCalls reset).
    fakeStates.clear();
    const factory2 = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: {} }],
    });
    const pi2 = fakePi();
    const out = await registerMcpServers(pi2 as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factory2 });
    expect(out.results.s).toMatchObject({ kind: "registered", fromCache: true });
    expect(fakeStates.get("s-bin")?.connectCalls).toBe(0);
  });

  it("re-probes after mcp.json content changes (sourceSha1 mismatch)", async () => {
    await writeMcpJson({ mcpServers: { s: { command: "s-bin", args: [] } } });
    const factoryA = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: {} }],
    });
    const pi1 = fakePi();
    await registerMcpServers(pi1 as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factoryA });

    // Change mcp.json (add `auto:true`).
    await writeMcpJson({ mcpServers: { s: { command: "s-bin", args: [], auto: true } } });
    fakeStates.clear();
    const factoryB = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: {} }, { name: "t2", description: "t2", inputSchema: {} }],
    });
    const pi2 = fakePi();
    const out = await registerMcpServers(pi2 as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factoryB });
    expect(out.results.s).toMatchObject({ kind: "registered", fromCache: false });
    expect(fakeStates.get("s-bin")?.connectCalls).toBe(1);
    const cache = await readToolsCache(CWD);
    expect(cache?.entries.s?.tools.map((t) => t.name)).toEqual(["t1", "t2"]);
  });
});

describe("registerMcpServers — mcp.json parse error", () => {
  it("surfaces a structured failure when mcp.json is invalid", async () => {
    await mkdir(join(CWD, ".belmont"), { recursive: true });
    await writeFile(join(CWD, ".belmont", "mcp.json"), "{ not json", "utf8");
    const pi = fakePi();
    const out = await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, {
      createClient: buildFakeFactory({}),
    });
    expect(out.toolCount).toBe(0);
    expect(out.results["(mcp.json)"]).toMatchObject({ kind: "failed" });
  });
});

describe("registered tool — audit log", () => {
  it("invocation records to today's mcp-tools episodic on success", async () => {
    await writeMcpJson({ mcpServers: { s: { command: "s-bin", args: [] } } });
    const factory = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: { type: "object", properties: {} } }],
    });
    const pi = fakePi();
    await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factory });

    // Wire a handler into the fake.
    fakeStates.get("s-bin")!.handlers["t1"] = () => ({ result: "ok" });

    const tool = pi.registered[0]!;
    await tool.execute("call-1", {} as never, undefined, undefined, { cwd: CWD } as Parameters<typeof tool.execute>[4]);

    const today = new Date().toISOString().slice(0, 10);
    const body = await readFile(
      join(CWD, ".belmont", "memory", "episodic", `${today}-mcp-tools.md`),
      "utf8",
    );
    expect(body).toContain("s/t1");
    expect(body).toContain("outcome=ok");
  });

  it("invocation records error outcome AND surfaces error to the LLM", async () => {
    await writeMcpJson({ mcpServers: { s: { command: "s-bin", args: [] } } });
    const factory = buildFakeFactory({
      "s-bin": [{ name: "t1", description: "t1", inputSchema: { type: "object", properties: {} } }],
    });
    const pi = fakePi();
    await registerMcpServers(pi as unknown as Parameters<typeof registerMcpServers>[0], CWD, { createClient: factory });

    fakeStates.get("s-bin")!.handlers["t1"] = () => {
      throw new Error("boom");
    };

    const tool = pi.registered[0]!;
    await expect(
      tool.execute("call-1", {} as never, undefined, undefined, { cwd: CWD } as Parameters<typeof tool.execute>[4]),
    ).rejects.toThrow(/boom/);

    const today = new Date().toISOString().slice(0, 10);
    const body = await readFile(
      join(CWD, ".belmont", "memory", "episodic", `${today}-mcp-tools.md`),
      "utf8",
    );
    expect(body).toContain("outcome=error");
    expect(body).toContain("boom");
  });
});
