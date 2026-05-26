# @juicesharp/rpiv-ask-user-question — DEFERRED (P1)

**Pin.** None for v1.0. Re-probe in v1.1 if a structural feature gap
appears in Belmont's own `belmont_ask_user` tool slot.

**Repository.** https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question
(v1.13.0 latest; @juicesharp scope).

## Deciding criterion (§17 M0 P1)

This package targets the `rpiv` pi-fork lineage. Belmont v1.0 is locked
to `@earendil-works/pi-coding-agent` (§2 locked constraint; D-001 §Gate
(a)). Adopting an rpiv-shaped tool would either:

(a) require maintaining two pi-API shims in `@belmont/harness/src/pi/`,
breaking the B5 trust boundary's single-importer invariant, OR

(b) require the rpiv package to be rewritten against the earendil
extension API surface — outside Belmont's maintenance scope.

The §5.2 design slot for `belmont_ask_user` is Belmont-owned and ships
in M5 (registered alongside `belmont_transition`). The v1.0 tool
implements: structured choices, cancellation via AbortSignal,
non-interactive fallback via `BELMONT_NON_INTERACTIVE=1` + STDIN-piped
JSON.

## Re-evaluation triggers

- A v1.1+ feature surfaces that needs a UX pattern Belmont's
  `belmont_ask_user` doesn't provide AND rpiv (or a fork) ports to the
  earendil extension API.
- The rpiv lineage publishes an earendil-compatible build.

## Probe authored — full evaluation deferred

The probe script in this directory authors the runtime surface
inspection but the verdict criterion above is structural (fork lineage
incompatibility), so a live run is unnecessary for the v1.0 decision.
