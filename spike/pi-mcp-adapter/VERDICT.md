# pi-mcp-adapter — GO (conditional wrapper)

**Pin.** `pi-mcp-adapter@2.8.0` (published 2026-05-25, 33 versions, by
nicobailon; deps include `@earendil-works/pi-ai@^0.74`,
`@modelcontextprotocol/sdk@^1.25.1`, TypeBox, Zod peer).

**Repository.** https://github.com/nicobailon/pi-mcp-adapter

## Deciding criterion (§12.1, four acceptance gates)

| Gate | Status | Evidence |
|---|---|---|
| 1. Reads `.belmont/mcp.json` with Claude-compatible `mcpServers.*` schema | ✅ | Adapter supports `.mcp.json` (project), `~/.config/mcp/mcp.json` (user-global), plus pi-owned override layer at `~/.pi/agent/mcp.json` and `.pi/mcp.json`. Field set is a strict superset of v2.3 §12.2: `command/args/env/cwd/url/headers/auth/oauth.*/bearerToken/lifecycle/idleTimeout/exposeResources/directTools/excludeTools/debug`. `${VAR}` + `$env:VAR` interpolation on every string field. |
| 2. Lazy tool discovery — no subprocess at extension load | ✅ | `lifecycle: "lazy"` is the default. README: "Servers are **lazy by default** — they won't connect until you actually call one of their tools. The adapter caches tool metadata so search and describe work without live connections." Matches v2.3 §12.4 cache invariant. |
| 3. Env/auth support — stdio + Streamable HTTP bearer-token | ✅ | stdio transport via `command/args/env/cwd`. HTTP transport via `url + headers + auth: "bearer"|"oauth"`. OAuth has authorization_code + client_credentials grants, dynamic + pre-registered clients, configurable redirect URI. |
| 4. Blast-radius gate (`"auto": true` opt-in for unattended auto mode) | ⚠️ Belmont-owned | The adapter has no `auto` field native to its schema. v2.3 §12.3's gate is a Belmont policy that lives in `@belmont/harness/src/mcp/`: at extension load, Belmont reads the same `.belmont/mcp.json` it hands to the adapter, and registers a rejection wrapper (`mcp__<server>`) for any server without `"auto": true` when `BELMONT_AUTO_MODE=1`. The adapter's `directTools` + `excludeTools` fields are the implementation seam — Belmont passes a filtered server set in auto mode. |

## Why GO (not PORT)

The legacy `src/mcp/` v0.10.x port would re-derive ~80% of what
pi-mcp-adapter already ships: lazy lifecycle, cache, env interpolation,
HTTP + stdio transports, OAuth, idle-timeout disconnect, tool-prefix
resolution, `directTools` mode, `excludeTools` filtering. The remaining
20% — the `auto: true` gate — is policy that belongs in
`@belmont/harness/src/mcp/blast-radius.ts` regardless of base choice.
PORT would also re-derive the `mcp({ search, tool, args })` proxy tool
pattern that Mario's MCP-as-CLI essay motivates.

## Implementation seams for M10

- `@belmont/harness/src/mcp/index.ts` — registers the adapter via pi's
  extension API; passes the project's `.belmont/mcp.json` through.
- `@belmont/harness/src/mcp/blast-radius.ts` — reads the same JSON,
  computes the auto-allowed-set, and when `BELMONT_AUTO_MODE=1` filters
  servers either via the adapter's `directTools: false` (umbrella-only
  mode) or by registering pre-emption tools `mcp__<server>` that return
  a structured "not opted into auto" error. Locked decision (D-NNN at
  M10): use the pre-emption wrapper, not the filtered set — preserves
  the interactive/auto symmetry of the underlying server list.
- `@belmont/harness/src/mcp/audit.ts` — writes
  `.belmont/auto.json#mcp: [{name, type, auto}, ...]` per §12.4.

## Risks

- `directTools` flag could leak high-blast-radius tools into auto mode
  if user mis-configures. Belmont's blast-radius wrapper inspects
  `directTools` explicitly and refuses to register tools from servers
  not opted into auto, regardless of `directTools: true`.
- OAuth dynamic-client registration is interactive (browser callback).
  Belmont auto mode must short-circuit OAuth servers (per the same
  blast-radius wrapper) rather than hang waiting for a browser prompt.

## Re-evaluation triggers

- pi-mcp-adapter major-version bump (currently 2.x).
- `@modelcontextprotocol/sdk` major bump (currently 1.25.1; adopt
  alongside the adapter's own bump).
- pi base SDK major bump (currently `@earendil-works/pi-ai@^0.74`,
  exact pi peer).
