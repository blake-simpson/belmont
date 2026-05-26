/**
 * spike/rpiv-ask-user-question — P1 probe.
 *
 * @juicesharp/rpiv-ask-user-question is a structured ask-user-question
 * tool from the `rpiv` pi-fork lineage (not earendil-works). v1.0 has
 * Belmont's own `belmont_ask_user` tool slot at §5.2; this package is
 * surveyed for cross-pollination, not adoption.
 *
 * Criteria (§17 M0 P1): structured choices, cancellation,
 * non-interactive fallback.
 */
const m = (await import("@juicesharp/rpiv-ask-user-question").catch((e) => ({
  __error: e,
}))) as any;
if (m.__error) {
  console.log("[FAIL] @juicesharp/rpiv-ask-user-question not installed; run `pnpm add @juicesharp/rpiv-ask-user-question@1.13.0`.");
  process.exit(2);
}
console.log("[1] exports:", Object.keys(m).sort());

// Inspect for the three P1 criteria.
const surface = JSON.stringify(m, (_k, v) =>
  typeof v === "function" ? `[function ${v.name || "<anon>"}]` : v,
);
const features = {
  choices: /options|choices|multiSelect/i.test(surface),
  cancellation: /AbortSignal|cancel|signal/i.test(surface),
  non_interactive_fallback: /BELMONT_NON_INTERACTIVE|TTY|isTTY|fallback/i.test(surface),
};
console.log("[2] feature surface (best-effort regex):", features);

console.log("\nVerdict: DEFERRED — fork-lineage check + ecosystem-compat required.");
console.log("→ See VERDICT.md");
