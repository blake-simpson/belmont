import { describe, expect, it } from "vitest";

import { parseMcpJson } from "../src/mcp-json.js";

describe("parseMcpJson — stdio transport", () => {
  it("parses a minimal stdio server with defaults", () => {
    const json = JSON.stringify({
      mcpServers: {
        playwright: { command: "npx", args: ["@modelcontextprotocol/server-playwright"] },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.data.servers.playwright).toEqual({
      type: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-playwright"],
      env: {},
      auto: false,
      lifecycle: "lazy",
    });
  });

  it("preserves env + cwd + auto + lifecycle on stdio", () => {
    const json = JSON.stringify({
      mcpServers: {
        github: {
          command: "/usr/local/bin/gh-mcp",
          args: ["serve"],
          env: { TOKEN: "${GH_TOKEN}", DEBUG: "1" },
          cwd: "/tmp/gh",
          auto: true,
          lifecycle: "eager",
        },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.servers.github).toMatchObject({
      type: "stdio",
      command: "/usr/local/bin/gh-mcp",
      args: ["serve"],
      env: { TOKEN: "${GH_TOKEN}", DEBUG: "1" },
      cwd: "/tmp/gh",
      auto: true,
      lifecycle: "eager",
    });
  });

  it("warns on auto=true + lifecycle=lazy combination (§12.3 invariant)", () => {
    const json = JSON.stringify({
      mcpServers: {
        slow: { command: "sleep", args: ["5"], auto: true },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.code).toBe("MCP_AUTO_LAZY");
    expect(r.warnings[0]!.message).toContain("'slow'");
  });

  it("no warning when auto=true + lifecycle=eager", () => {
    const json = JSON.stringify({
      mcpServers: {
        good: { command: "npx", args: ["server"], auto: true, lifecycle: "eager" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
  });

  it("no warning when auto=false + lifecycle=lazy (default)", () => {
    const json = JSON.stringify({
      mcpServers: {
        good: { command: "npx", args: ["server"] },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
  });
});

describe("parseMcpJson — http transport", () => {
  it("parses a minimal http server with defaults", () => {
    const json = JSON.stringify({
      mcpServers: {
        api: { url: "https://mcp.example.com/api" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.servers.api).toEqual({
      type: "http",
      url: "https://mcp.example.com/api",
      headers: {},
      auto: false,
      lifecycle: "lazy",
    });
  });

  it("preserves headers + auth + bearerToken", () => {
    const json = JSON.stringify({
      mcpServers: {
        github: {
          url: "https://mcp.github.example/api",
          headers: { Authorization: "Bearer ${GITHUB_MCP_TOKEN}" },
          auth: "bearer",
          bearerToken: "${GITHUB_MCP_TOKEN}",
          auto: true,
          lifecycle: "eager",
        },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.servers.github).toMatchObject({
      type: "http",
      url: "https://mcp.github.example/api",
      headers: { Authorization: "Bearer ${GITHUB_MCP_TOKEN}" },
      auth: "bearer",
      bearerToken: "${GITHUB_MCP_TOKEN}",
      auto: true,
      lifecycle: "eager",
    });
  });

  it("warns when both bearerToken and bearerTokenEnv are set", () => {
    const json = JSON.stringify({
      mcpServers: {
        api: {
          url: "https://x.example.com",
          auth: "bearer",
          bearerToken: "fallback",
          bearerTokenEnv: "API_TOKEN",
        },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.code)).toContain("MCP_HTTP_BEARER_AMBIGUOUS");
  });

  it("warns when auth=bearer but no token source supplied", () => {
    const json = JSON.stringify({
      mcpServers: {
        api: { url: "https://x.example.com", auth: "bearer" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.code)).toContain("MCP_HTTP_BEARER_MISSING");
  });
});

describe("parseMcpJson — strict validation", () => {
  it("rejects ambiguous transport (both command AND url)", () => {
    const json = JSON.stringify({
      mcpServers: {
        broken: { command: "npx", url: "https://x.example.com" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_SERVER_AMBIGUOUS_TRANSPORT");
  });

  it("rejects missing transport (neither command nor url)", () => {
    const json = JSON.stringify({
      mcpServers: {
        empty: { auto: true },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_SERVER_NO_TRANSPORT");
  });

  it("rejects explicit unknown transport type", () => {
    const json = JSON.stringify({
      mcpServers: {
        wat: { type: "websocket", url: "wss://x.example.com" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_SERVER_TYPE_UNKNOWN");
  });

  it("rejects type mismatch (type='stdio' but url field present)", () => {
    const json = JSON.stringify({
      mcpServers: {
        weird: { type: "stdio", url: "https://x.example.com" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_SERVER_TYPE_MISMATCH");
  });

  it("rejects invalid server name", () => {
    const json = JSON.stringify({
      mcpServers: {
        "has spaces": { command: "x" },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_SERVER_NAME_INVALID");
  });

  it("rejects malformed root shape", () => {
    const r = parseMcpJson(JSON.stringify({ servers: { x: {} } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_JSON_SHAPE");
  });

  it("rejects invalid JSON", () => {
    const r = parseMcpJson("{ this is not json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics[0]!.code).toBe("MCP_JSON_PARSE_ERROR");
  });

  it("warns on unknown server-level fields (forward-compat)", () => {
    const json = JSON.stringify({
      mcpServers: {
        api: {
          command: "npx",
          oauth: { clientId: "x" }, // v1.1 surface
          directTools: true,         // v1.1 surface
        },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain("MCP_SERVER_UNKNOWN_FIELD");
    expect(r.warnings.filter((w) => w.code === "MCP_SERVER_UNKNOWN_FIELD")).toHaveLength(2);
  });

  it("accepts an empty mcpServers map", () => {
    const r = parseMcpJson(JSON.stringify({ mcpServers: {} }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.servers).toEqual({});
  });
});

describe("parseMcpJson — example from v2.3 §12.2", () => {
  it("round-trips the documented example", () => {
    const json = JSON.stringify({
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["@modelcontextprotocol/server-playwright"],
          auto: false,
        },
        github: {
          type: "http",
          url: "https://mcp.github.example/api",
          headers: { Authorization: "Bearer ${GITHUB_MCP_TOKEN}" },
          auto: true,
          lifecycle: "eager",
        },
      },
    });
    const r = parseMcpJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.servers.playwright!.type).toBe("stdio");
    expect(r.data.servers.github!.type).toBe("http");
    expect(r.data.servers.playwright!.auto).toBe(false);
    expect(r.data.servers.github!.auto).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
