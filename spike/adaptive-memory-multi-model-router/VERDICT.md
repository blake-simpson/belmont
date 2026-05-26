# adaptive-memory-multi-model-router — NO-GO (P1)

**Pin.** None. v2.3 §17 M0 explicitly predicted this outcome
("expected NO-GO (overlaps with our 3-tier)") — this verdict confirms
the prediction with the concrete deciding criterion.

**Repository.** https://www.npmjs.com/package/adaptive-memory-multi-model-router
(v2.12.4 latest).

## Deciding criterion

v2.3 §9 (multi-model routing) locks a **3-tier named-slot** design
(high / medium / low) with 4-layer resolution (CLI flag > milestone
HTML-comment overlay > project `models.json` > tier base). The
ontology is **task-difficulty** — the user names which tier each agent
should target, and the resolver picks a concrete model.

`adaptive-memory-multi-model-router` is **adaptive** — it routes based
on running statistics of past prompts (memory + cost + latency
feedback). That is a fundamentally different ontology from
Belmont's deterministic named-slot design. Adopting it would either:

(a) replace §9's 3-tier model with adaptive routing (a v2.3 §2 locked
constraint change, requires a new ADR + major-version bump), OR

(b) layer adaptive routing on top of the 3-tier (compositional, but
defeats the purpose of named slots — the user can no longer predict
which model runs).

Neither is acceptable for v1.0.

## What v1.0 keeps from §9

- `models.json` with named tier slots (high/medium/low).
- Per-milestone HTML-comment overlay grammar (§5.1 example).
- 4-layer resolver in `@belmont/harness/src/tiering/resolve.ts`.
- `/belmont:models doctor` for reachability + cost estimation.

## Re-evaluation triggers

- v2.0+ explicitly decides to change Belmont's model-routing ontology
  from named-slot to adaptive. That's a major-version-bump-level
  decision, gated by a new ADR.
