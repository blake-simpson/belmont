# pi-antigravity-rotator — DEFERRED to v1.1 (P2)

**Pin.** None for v1.0. Re-probe in v1.1 if the feature surface lands
in scope.

**Repository.** https://www.npmjs.com/package/pi-antigravity-rotator
(v2.1.2 latest).

## Deciding criterion (§17 M0 P2)

v2.3 §17 M0 explicitly slots this as a P2 deferred to v1.1. No v1.0
milestone (M1–M11) lists antigravity-rotation as a dependency. The
package's feature surface — model rotation against rate-limit /
provider-health signals — overlaps non-trivially with Belmont's locked
named-tier design (§9) and the model-doctor reachability check (§9.5).

## Why deferred (not NO-GO)

If a v1.1+ milestone surfaces sustained rate-limit pain on a specific
tier (e.g. Claude Opus throttling during long auto runs), an adapter
that rotates within a tier (e.g. low → Claude Haiku 4.5 → local Qwen)
without violating the named-slot ontology could be a valuable
composition. v1.0 doesn't need it yet, but the design space is open.

## Re-evaluation triggers

- A v1.1+ milestone documents recurring rate-limit incidents during
  `belmont auto` runs.
- The package extends its README to describe tier-scoped rotation
  (rotate within `low`, not across tiers) — current README emphasizes
  cross-tier rotation, which is incompatible with §9.
