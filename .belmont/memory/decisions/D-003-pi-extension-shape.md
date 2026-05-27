---
schema: belmont.adr.v1
id: D-003-pi-extension-shape
topic: harness
status: accepted
updated_at: 2026-05-27
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
   `packages/harness/src/extension.ts`. A sibling
   `packages/harness/src/belmont.ts` re-exports the factory so the
   compiled output produces `dist/belmont.js` — pi loads this file via
   `--extension <abs-path>` (resolved through `import.meta.url` at
   launch time). See "Loading shape revision (2026-05-27, M11 §18)"
   below for why M11 swapped off the `extensionFactories` in-process
   path.
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

## Loading shape revision (2026-05-27, M11 §18)

The original M3 decision was to use `pi.main(argv, { extensionFactories:
[belmontExtension] })` — the in-process factory path. The §18
ship-gate dogfood surfaced a cosmetic issue: pi-coding-agent 0.75.5's
`resource-loader.js` hard-codes the extensionPath for factories as
`<inline:${index + 1}>` (see `dist/core/resource-loader.js:607`). That
string flows into:

1. The `[Extensions]` startup banner (Blake's report shows `<inline:1>`).
2. Every shortcut-conflict diagnostic (`Extension shortcut '...' from
   <inline:1>...`).
3. Provider-registration error messages.
4. Pi's interactive-mode `formatExtensionDisplayPath` rendering.

The 5th parameter of `loadExtensionFromFactory(factory, cwd, eventBus,
runtime, extensionPath = "<inline>")` accepts a custom name, but the
public `pi.main()` surface does not expose it.

**Decision update**: switch to `pi --extension <abs-path>` loading.
The launcher resolves an absolute path to a sibling re-export file
(`packages/harness/src/belmont.ts` → `dist/belmont.js`) via
`import.meta.url` and prepends `--extension <path>` to pi's argv.
Pi loads the file via jiti, reads `default` as the factory, and sets
`extension.path` to the resolved file path — so the banner shows
`belmont.js` (the basename — see `agent-session.js:1666`'s
`basename(extensionPath)` rendering) instead of `<inline:1>`.

This change does NOT violate the "single-tarball-friendly" constraint
the original M3 decision called out: `belmont.js` ships INSIDE the
`@belmont/harness` tarball, alongside `dist/extension.js` it
re-exports. There is no separate FS materialisation step; resolving
via `import.meta.url` works identically in dev (running from
`packages/harness/dist/...`) and in the installed case (running from
`node_modules/@belmont/harness/dist/...`).

The factory's PUBLIC surface is unchanged: `belmontExtension` in
`extension.ts` is still the function pi calls; `belmont.ts` is a thin
re-export whose only job is to give pi a friendly file path to display.

## Don't re-do

- **Registering a `context` handler to inject BELMONT.md**. The hook
  fires per LLM call; doing so would re-inject the text on every
  message instead of once per agent start, blowing the cost budget and
  duplicating content already loaded by `before_agent_start`.
- **Reverting to `pi.main({ extensionFactories })`** — pi 0.75.5
  hard-codes the inline path; the cosmetic `<inline:N>` is unavoidable
  in that mode. The §18 dogfood proved this is loud enough to warrant
  the file-extension shape. Don't undo it without an upstream pi PR
  exposing a custom name on the public `extensionFactories` surface.
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
- 2026-05-27 — Amended during M11 §18 fix pass: switched the loading
  shape from `extensionFactories` (in-process; pi displays
  `<inline:1>`) to `--extension <abs-path>` pointing at a
  `belmont.js` re-export sibling (pi displays the file basename).
