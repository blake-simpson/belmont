---
schema: belmont.adr.v1
id: D-003-pi-extension-shape
topic: harness
status: accepted
updated_at: 2026-05-26
supersedes: null
---

# D-003: Pi extension shape and the before_agent_start system-prompt hook

## Why this matters

Plan v2.3 §3.3 / §17 M3 P0-5 prescribes two distinct hooks for wiring
BELMONT.md + preferences.md into pi's system prompt:

> Wire BELMONT.md + preferences.md into pi's system prompt via
> `before_agent_start` (auto path) and `context` (interactive path).

Pi 0.75.5's `ExtensionAPI` does not match that framing. M3 is the first
milestone where the harness actually wires hooks, so the deviation
needs a recorded decision rather than a silent re-interpretation.

## Decision

1. **Single hook for system-prompt wiring.** The harness registers
   exactly ONE `before_agent_start` handler that appends a `## Belmont
   context` block (containing the cached BELMONT.md + preferences.md
   bodies) to `event.systemPrompt`. This fires for both the interactive
   REPL agent (Runtime A) and any auto-mode worker agents (Runtime B,
   landing M8). No second hook is needed; `before_agent_start` is path-
   agnostic in pi 0.75.5.
2. **The `context` hook is reserved for messages-array pruning.** That
   is the v2.2-era "interactive context hook" — but its actual role in
   pi 0.75.5 is the lean-ctx slot (M9 P0-2), not system-prompt wiring.
   M3 leaves it unregistered.
3. **Extension factory shape.** Belmont exports a single default
   factory `(pi: ExtensionAPI) => void` from
   `packages/harness/src/extension.ts`. It is handed to pi via
   `pi.main(argv, { extensionFactories: [belmontExtension] })` from
   `packages/harness/src/pi/launch.ts`. No `--extension=<path>` CLI
   flag is used; the in-process factory keeps `belmont` distributable
   as a single npm package without filesystem materialisation.
4. **Type re-exports through `pi/sdk.ts`.** Every pi type the rest of
   the harness needs (`ExtensionAPI`, `ExtensionContext`,
   `ExtensionCommandContext`, `BeforeAgentStartEvent`,
   `BeforeAgentStartEventResult`, `SessionStartEvent`, `ExtensionFactory`)
   is re-exported from `packages/harness/src/pi/sdk.ts`. Sibling files
   import via `./pi/sdk.js` only — they never reach
   `@earendil-works/pi-coding-agent` directly, even for types. This
   keeps the static pi-boundary regex (which does not distinguish
   `import type` from value imports) green.

## Rationale

- **`before_agent_start` is the canonical system-prompt mutation
  hook** in pi 0.75.5 (`BeforeAgentStartEventResult.systemPrompt` is
  the only documented return shape that actually patches the prompt).
  The examples that ship with pi — `claude-rules.ts`,
  `prompt-customizer.ts`, `system-prompt-header.ts` — all use it for
  both interactive and headless paths.
- **The `context` event** fires per LLM call with the active messages
  array; returning `{ messages }` rewrites it. That is the right place
  for `pi-lean-ctx` integration but the wrong place for static text
  injection. Calling it from the interactive path would either double
  up (alongside `before_agent_start`) or replace working pi-side
  prompting with something custom, neither of which is desired.
- **Plan §3.3's two-hook framing was inherited from a v2.2-era
  exploration** before the v2.3 author confirmed pi's actual API. The
  spike at M0 (D-001) verified the ExtensionAPI surface but did not
  unwind §3.3's wording; M3 is the natural place to record the
  deviation.
- **Single default-export factory** matches every shipped pi extension
  example. A multi-factory approach would force `@belmont/cli` to
  decide a factory composition order outside the harness — an
  unnecessary degree of freedom for a single-product harness.

## Don't re-do

- **Registering a `context` handler to inject BELMONT.md**. The hook
  fires per LLM call; doing so would re-inject the text on every
  message instead of once per agent start, blowing the cost budget and
  duplicating content already loaded by `before_agent_start`.
- **Materialising the harness as a `.ts` extension file on disk** and
  shelling out `pi --extension=<path>`. The in-process factory works
  identically and removes a packaging concern.
- **Reaching directly into `@earendil-works/pi-coding-agent` for
  types** from any harness file outside `src/pi/`. The static
  pi-boundary regex catches it; route through `src/pi/sdk.ts`'s
  re-exports.

## Consequences

- Plan v2.3 §3.3 / §17 M3 P0-5 stays as historical reference; this
  ADR is the current source of truth for the system-prompt wiring.
- M9 (lean-ctx) is the first milestone that registers a `context`
  handler. It does not interact with the system-prompt block this hook
  appends.
- `packages/harness/src/pi/sdk.ts` is now the canonical home for
  every pi type the rest of the harness consumes — when M5/M8 add
  more types (tool definitions, runtime handles), they extend this
  file's re-export list rather than importing pi directly.

## Revisions

- 2026-05-26 — Accepted during M3 (harness shell + boot doctor).
