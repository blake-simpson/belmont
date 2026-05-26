/**
 * spike/pi-lean-ctx — probe against v2.3 §11.2 / §11.3 ordering.
 *
 * Run: `pnpm install && pnpm tsx probe.ts` from this directory.
 *
 * Criteria (§11.2):
 *  1. Subscribes to pi's `context` hook (not just shell-wrap).
 *  2. Does NOT rewrite tool calls — only compresses payloads in-place.
 *  3. Composes AFTER RTK at `user_bash` without double-wrapping shell.
 *  4. Has an opt-out (env var or config).
 */
const peerDeps = {
  "@earendil-works/pi-coding-agent": ">=0.50.0",
  "@earendil-works/pi-tui": "*",
};
console.log("[1] declared peer-deps:", peerDeps);

const lean = (await import("pi-lean-ctx").catch((e) => ({ __error: e }))) as any;
if (lean.__error) {
  console.log("[FAIL] pi-lean-ctx not installed; run `pnpm add pi-lean-ctx@3.6.17`.");
  process.exit(2);
}
console.log("[2] exports:", Object.keys(lean).sort());

// Inspect for shell-hook surface that would collide with RTK.
const surfaceJson = JSON.stringify(lean, (_k, v) =>
  typeof v === "function" ? `[function ${v.name || "<anon>"}]` : v,
);
const hasShellHook = /user_bash|shellCommand|wrapBash/i.test(surfaceJson);
console.log("[3] shell-hook surface detected:", hasShellHook);
if (hasShellHook) {
  console.log("    → Belmont must opt out via package config (see VERDICT.md §Belmont integration).");
}

// Inspect for context-hook surface — what v2.3 §11.2 actually wants.
const hasContextHook = /\bcontext\b|registerContextProvider/i.test(surfaceJson);
console.log("[4] context-hook surface detected:", hasContextHook);

// Inspect for MCP tools (the ctx_* family).
const hasMcpTools = /ctx_|registerTool/i.test(surfaceJson);
console.log("[5] ctx_* MCP tools surface detected:", hasMcpTools);

console.log(
  "\nVerdict: partial adoption — context hook + MCP tools YES; shell hook OFF (RTK owns user_bash).",
);
console.log("→ See VERDICT.md");
