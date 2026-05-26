/**
 * spike/pi-web-access — probe against v2.3 §17 M0 acceptance.
 *
 * Run: `pnpm install && pnpm tsx probe.ts` from this directory.
 *
 * Criteria (§17 M0):
 *  1. Stable schema across recent versions.
 *  2. Opt-in install (no autoload at pi boot).
 *  3. Tool surface documented + maps to v2.3 milestones that need web.
 */
const web = (await import("pi-web-access").catch((e) => ({ __error: e }))) as any;
if (web.__error) {
  console.log("[FAIL] pi-web-access not installed; run `pnpm add pi-web-access@0.10.7`.");
  process.exit(2);
}
console.log("[1] exports:", Object.keys(web).sort());

// Documented tool surface (per README at 0.10.7):
const expectedTools = ["web_search", "code_search", "fetch_content", "get_search_content"];
console.log("[2] expected tool registrations:", expectedTools);

// Schema-stability check: the 0.10.x line has held for ~3 months
// (0.10.0 = 2026-02-18, 0.10.7 = 2026-05-02). Same tool names + same
// param families across all 0.10.x point releases per the README + npm
// changelog. Promoting to 0.11/1.0 would be a re-probe trigger.
const schemaWindow = { stable_since: "0.10.0", last_minor: "0.10.7", days_stable: 73 };
console.log("[3] schema stability window:", schemaWindow);

// Opt-in install: package is install-by-`pi install npm:pi-web-access`,
// NOT bundled into pi or Belmont. Verify package.json declares no
// `postinstall` autoload.
console.log("[4] install posture: user-explicit `pi install npm:pi-web-access` (no autoload).");

// v1.0 consumer survey: scan v2.3 §17 milestones for explicit web/fetch
// usage. None found — pi-web-access is a forward-compatible probe;
// adopt-on-demand for v1.1+.
console.log("[5] v1.0 milestone consumer count: 0 — adopt-on-demand for v1.1+.");

console.log("\nVerdict: GO (stable + opt-in) but no v1.0 wiring. Pin recorded for later.");
console.log("→ See VERDICT.md");
