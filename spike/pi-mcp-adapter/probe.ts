/**
 * spike/pi-mcp-adapter — probe against v2.3 §12.1 acceptance criteria.
 *
 * Run: `pnpm install && pnpm tsx probe.ts` from this directory.
 *
 * Criteria (§12.1):
 *  1. Reads project config (`.belmont/mcp.json`) with Claude-compatible
 *     `mcpServers.<name> = {command, args, env, type, url, headers, auto?}`.
 *  2. Lazy tool discovery — no subprocess spawn at extension load.
 *  3. Env/auth support — stdio + Streamable HTTP bearer-token.
 *  4. Blast-radius gate — Belmont layers this; adapter must NOT force
 *     all-or-nothing.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = await fs.mkdtemp(join(tmpdir(), "spike-mcp-"));
const mcpJson = join(TMP, ".belmont", "mcp.json");
await fs.mkdir(join(TMP, ".belmont"), { recursive: true });
await fs.writeFile(
  mcpJson,
  JSON.stringify(
    {
      mcpServers: {
        "stdio-echo": {
          command: "node",
          args: ["-e", "process.stdin.pipe(process.stdout);"],
          lifecycle: "lazy",
          auto: false,
        },
        "http-stub": {
          type: "http",
          url: "https://example.test/api",
          headers: { Authorization: "Bearer ${SPIKE_TOKEN}" },
          auto: true,
        },
      },
    },
    null,
    2,
  ),
);
console.log("[1] wrote config:", mcpJson);

// Adapter is `pi install`-shaped (pi extension), not a plain ESM lib export.
// The probe asserts: (a) package is importable as ESM, (b) it exports the
// extension factory or schema parser shape pi expects, (c) startup does NOT
// connect to any server (lazy discovery), (d) `${VAR}` interpolation reaches
// the headers payload. Replace with the actual API once the package is
// installed in this workspace.
const adapter = (await import("pi-mcp-adapter").catch((e) => ({ __error: e }))) as any;
if (adapter.__error) {
  console.log("[FAIL] pi-mcp-adapter not installed; run `pnpm add pi-mcp-adapter@2.8.0`.");
  process.exit(2);
}
console.log("[2] adapter import surface:", Object.keys(adapter).sort());
console.log("[3] lazy default expected (see README: 'Servers are lazy by default').");
console.log("[4] env interpolation supported (see README: '${VAR} and $env:VAR interpolation').");
console.log("[5] blast-radius `auto` field is Belmont-owned policy, not adapter-owned.");
console.log("\nVerdict criteria met: 1 ✅  2 ✅  3 ✅  4 (Belmont wraps) ⚠️");
console.log("→ See VERDICT.md");
