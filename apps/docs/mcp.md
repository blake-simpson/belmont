# MCP (Model Context Protocol)

Covers §12 of the master plan. Belmont's MCP layer is an in-house port
(per M10 episodic) — `pi-mcp-adapter` is deferred to v1.1 because of
the peer pi-ai/pi-tui `^0.74.0` constraint and the architectural
mismatch (peer pi-extension vs embeddable library; duplicate `/mcp`
slash command UI; no insertion seam for the blast-radius gate).

## `.belmont/mcp.json` — config

```jsonc
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "bearerTokenEnv": "GITHUB_MCP_TOKEN",
      "auto": true,
      "lifecycle": "lazy"
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "lifecycle": "eager"
      // auto: false implied
    },
    "filesystem": {
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-server-filesystem", "/tmp/mcp-fs-root"],
      "auto": true
    }
  }
}
```

Fields (parser is strict on transport + name; everything else is
either a documented field or surfaces as a forward-compat warning):

| Field | Type | Notes |
|---|---|---|
| `type` | `"stdio"` \| `"http"` | Required. Anything else hard-errors. |
| `command` (stdio) | string | Required when `type === "stdio"`. |
| `args` (stdio) | `string[]` | Optional. `${VAR}` / `$env:VAR` / `~/` expansion. |
| `cwd` (stdio) | string | Optional. |
| `env` (stdio) | `Record<string,string>` | Optional. Same interpolation. |
| `url` (http) | string | Required when `type === "http"`. |
| `headers` (http) | `Record<string,string>` | Optional. Same interpolation. |
| `auth` (http) | `"bearer"` | Optional. |
| `bearerToken` (http) | string | Plain-text token; usually you want `bearerTokenEnv` instead. |
| `bearerTokenEnv` (http) | string | Env-var name. `bearerTokenEnv` wins over `bearerToken` if both set. |
| `auto` | boolean | Default `false`. When `false`, the server is REFUSED in auto mode. See blast-radius below. |
| `lifecycle` | `"lazy"` \| `"eager"` | Default `"lazy"`. Eager = connect at session_start. Lazy = connect on first tool call. |

Hard parser errors:

- Both `command` and `url` set (transport ambiguity).
- Neither `command` nor `url` set (missing transport).
- Unknown `type`.
- Server name fails the regex `[A-Za-z][A-Za-z0-9_-]*`.

Soft warnings (parse continues):

- `auto: true` paired with `lifecycle: "lazy"` — the §12.3 invariant
  (the auto loop's first `decide` may fire before the lazy server
  connects).
- Both `bearerToken` and `bearerTokenEnv` set (the env-var wins).
- `auth: "bearer"` with no token source.
- Unknown server-level fields (forward-compat for v1.1: `directTools`,
  `excludeTools`, `exposeResources`).

## §12.3 blast-radius gate

The single hard safety primitive of the MCP layer.

**Under auto mode** (`BELMONT_AUTO_MODE === "1"`, set by the auto
loop), the adapter DROPS every MCP server missing `auto: true`. Not
"warns and continues" — drops. The `McpClient` for the filtered
server is never even constructed; its tools never enter the agent's
tool registry; the agent has no way to call them.

The reasoning: an auto loop running unattended cannot be trusted to
make case-by-case judgment calls about which side-effect tools are
safe (filesystem writes, GitHub PRs, network requests with credentials).
Servers opt INTO auto mode explicitly via `auto: true`; everything
else is interactive-only.

**No `--force` escape hatch.** Per the user prompt that drove M10:
"v1.0 is strict: auto mode + non-auto:true server = the server's
tools don't exist as far as the worker is concerned." If you need a
write-capable MCP server in an auto run, add `auto: true` to its
config block and live with it.

The dogfooded reachability test
(`packages/harness/test/mcp-adapter.test.ts`'s "drops every server
without auto:true (NOT just warns)") asserts the fake `McpClient` for
a filtered server is NEVER constructed — i.e. the gate runs BEFORE
the client factory, not as a runtime check inside the tool's
`execute()` block.

## `auto.json#mcp` audit spine

When `runAuto` records each task, it patches `.belmont/auto.json#mcp`
with the resolved (post-blast-radius) server list. Outside auto mode
the patch is a no-op (interactive REPL path).

Each entry:

```jsonc
{
  "server": "github",
  "transport": "http",
  "auto": true,
  "lifecycle": "lazy",
  "tools": ["mcp__github__list_pull_requests", "mcp__github__create_pull_request", "..."]
}
```

## §12.4 cache + audit

Tool discovery is cached at `.belmont/mcp-tools-cache.json` (gitignored).

Invalidation sources:

1. `sourceSha1(.belmont/mcp.json)` differs from the cached value
   (the file itself changed).
2. Per-entry `configHash` differs (post-`${VAR}` resolution changed
   — e.g. you rotated `GITHUB_MCP_TOKEN`).
3. Explicit `/belmont:mcp refresh`.

Cache schema is versioned (`schema_version: 1`); readers ignore any
higher version (forward-compat skip).

Every tool invocation appends one line to today's
`<date>-mcp-tools.md` episodic (kind `phase`, slug `mcp-tools`):

```
- 18:34:12Z  github/list_pull_requests  auto=yes  outcome=ok  duration=132ms
- 18:34:14Z  playwright/click  auto=no  outcome=refused-not-auto
```

Outcomes: `ok | error | refused-not-auto`. Long error messages
truncate to 120 chars.

## `/belmont:mcp` slash command

```
> /belmont:mcp doctor      # default; READ-ONLY
> /belmont:mcp refresh     # clears cache + re-probes every server
```

Doctor output:

```
Mode: interactive
Servers:
  github       http   auto=yes  lifecycle=lazy   tools=17 (cached, fresh)
  playwright   stdio  auto=no   lifecycle=eager  tools=11 (cached, stale 4h)
  filesystem   stdio  auto=yes  lifecycle=lazy   tools=4  (no cache)
Warnings:
  - playwright + lifecycle=eager AND auto=false — eager startup OK, but auto runs will refuse.
```

Under auto mode, the doctor explicitly highlights excluded servers:

```
Mode: auto (BELMONT_AUTO_MODE=1)
Excluded: playwright (no auto:true)
```

## Tool naming convention

Every registered MCP tool follows `mcp__<server>__<tool>`:

- `mcp__github__list_pull_requests`
- `mcp__filesystem__read_file`

This is the v2.3 §17 M10 done-when contract: direct per-tool
registration, NOT the umbrella `mcp({search, tool, args})` proxy
from Mario's MCP-as-CLI essay. The proxy pattern is a v1.1 affordance
once direct registration is stable.

## What v1.1 will add (deferred from M10)

- OAuth (authorization_code, client_credentials, dynamic clients).
- StreamableHTTP → SSE fallback when the server doesn't advertise SHTTP.
- `directTools: true | string[]` (umbrella vs subset).
- `excludeTools` filter.
- `exposeResources` (MCP resources surfaced as tools).
- User-global `~/.belmont/mcp.json` merge.
- `mcp({search, tool, args})` proxy tool (per Mario's essay).
- `keep-alive` lifecycle with health checks.

## Read next

- [auto-mode.md](./auto-mode.md) — how `BELMONT_AUTO_MODE` is set
  in the auto loop's `try/finally`.
- [troubleshooting.md](./troubleshooting.md) — MCP "refused in auto"
  + cache invalidation troubleshooting.
