// packages/harness/src/pi/sdk.ts
//
// This is the ONE file in the entire monorepo allowed to import
// `@earendil-works/pi-coding-agent` AND `@earendil-works/pi-tui`. The B5
// anti-corruption layer in action: every other module reaches pi (the
// coding agent SDK + the underlying TUI primitives) through the wrappers
// and re-exports below.
//
// Enforced by:
//   - .dependency-cruiser.cjs rules `no-pi-outside-harness-pi-subdir`
//     and `no-pi-tui-outside-harness-pi-subdir` (path-based, block
//     all packages/harness/src/!(pi)/** files)
//   - test/pi-boundary.test.ts (static AST scan over the workspace —
//     regex catches the raw specifiers including in `import type`
//     lines, so re-export via this file is the ONLY way for siblings
//     to see pi types)
//
// At M3 the wrapper surface expanded to cover what the harness extension
// needs: type re-exports for ExtensionAPI / handler events / command
// context, and the `launchPi(argv)` wrapper that hands the harness
// factory to `pi.main()`.
//
// M5 added the tool + tool_call/turn_start/turn_end shapes the
// tools/* and hooks/* siblings depend on, plus the first non-type
// re-export (`isToolCallEventType`) used to narrow `ToolCallEvent`
// to `WriteToolCallEvent`/`EditToolCallEvent` for hooks.
//
// M6 (now) extends the surface for the TUI panel + status bar +
// shortcuts work. New pi-coding-agent re-exports cover the ctx.ui
// surface (`ExtensionUIContext`, `ExtensionWidgetOptions`,
// `WidgetPlacement`, `ContextUsage`), the M6 event shapes
// (`ModelSelectEvent`, `ThinkingLevelSelectEvent`,
// `SessionShutdownEvent`, `InputEvent`/`InputEventResult`), the
// `ExtensionShortcut` shape, and `MessageRenderer`/
// `MessageRenderOptions` for the M8 worker stream. The `Theme` class
// is re-exported so component factories (`ctx.ui.setWidget`,
// `ctx.ui.custom`) can type their second arg.
//
// pi-tui types/values flow through this file too: `Component`,
// `Container`, `OverlayHandle`, `OverlayOptions`, `OverlayAnchor`,
// `KeybindingsManager`, `TUI`, `KeyId`, `Focusable`, plus the
// width-utility helpers (`visibleWidth`, `truncateToWidth`) used by
// the panel renderer.
//
// M7 (now) extends the surface for multi-model tiering. New
// pi-coding-agent re-exports cover provider registration
// (`ProviderConfig`, `ProviderModelConfig`), the live `ModelRegistry`
// class (consumed as a TYPE from `ctx.modelRegistry`), and the auth
// surface needed for §9.5 reachability checks (`AuthStorage`,
// `AuthStatus`, `AuthCredential`). The `Api`, `Model`, and
// `OAuthCredentials` re-exports come from `@earendil-works/pi-ai`
// (pi-coding-agent's underlying SDK) — that package is a new direct
// dep added at M7. Pi-ai is widened into the pi-boundary lint via
// `.dependency-cruiser.cjs` (mirror of the M6 pi-tui widening).
//
// pi-mono upstream example references (per D-001-omp-evaluation):
//   - examples/extensions/custom-provider-anthropic/index.ts
//   - examples/extensions/custom-provider-gitlab-duo/index.ts
//   - examples/extensions/model-status.ts
//
// M8 will add `createAgentSessionRuntime` lifecycle wrappers for the
// auto worker.

import {
  VERSION as PI_VERSION,
  isToolCallEventType as piIsToolCallEventType,
} from "@earendil-works/pi-coding-agent";

export const piPackage = "@earendil-works/pi-coding-agent";
export const piVersion = PI_VERSION;

export const isToolCallEventType = piIsToolCallEventType;

// pi-coding-agent class re-export. `Theme` is a class so the same
// identifier carries both the value (constructor) and the type
// (instance), which is what sibling code needs when typing factory
// callbacks like `(tui, theme: Theme, kb, done) => …`.
export { Theme } from "@earendil-works/pi-coding-agent";

// pi-tui class re-exports. As above — each is both a value and an
// instance type, so siblings can do `private tui: TUI` for instance
// typing as well as `new Container()` for construction.
export {
  Container,
  CURSOR_MARKER,
  isFocusable,
  KeybindingsManager,
  TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

// pi-coding-agent type re-exports. Sibling modules (extension.ts,
// commands/*, hooks/*, tools/*, tui/*) consume pi types via
// `import type { … } from "./pi/sdk.js"`.
//
// Note: `ModelSelectEvent` and `ThinkingLevelSelectEvent` are *not*
// surfaced — pi 0.75.5 does not re-export them from the top-level
// `index.d.ts`, only from `./core/extensions/types.ts`. Siblings
// don't need the event-shape types because `pi.on("model_select", h)`
// already binds the handler's event arg via the `ExtensionAPI`
// overload signatures. If a future caller needs to destructure
// `event.model.id` outside an `on()` callback, add a local interface
// or surface the types via a sub-path import behind this wrapper.
export type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ApiKeyCredential,
  AuthCredential,
  AuthStatus,
  AuthStorage,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextUsage,
  EditToolCallEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionFactory,
  ExtensionShortcut,
  ExtensionUIContext,
  ExtensionUIDialogOptions,
  ExtensionWidgetOptions,
  InputEvent,
  InputEventResult,
  InputSource,
  MessageRenderer,
  MessageRenderOptions,
  ModelRegistry,
  OAuthCredential,
  ProviderConfig,
  ProviderModelConfig,
  SessionShutdownEvent,
  SessionStartEvent,
  TerminalInputHandler,
  ToolCallEvent,
  ToolCallEventResult,
  ToolDefinition,
  TurnEndEvent,
  TurnStartEvent,
  WidgetPlacement,
  WorkingIndicatorOptions,
  WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";

// pi-ai type re-exports — the underlying AI SDK pi-coding-agent builds on.
// Belmont's M7 provider-registration + reachability code consumes Model<Api>
// and Api directly, and OAuthCredentials shows up wherever the
// pi-coding-agent OAuth surface refers to it. Imported here only so the
// rest of the harness reaches these via `./pi/sdk.js` (pi-boundary lint
// is widened to include pi-ai at M7).
export type {
  Api,
  Model,
  OAuthCredentials,
} from "@earendil-works/pi-ai";

// pi-tui type-only re-exports (the interfaces, not the classes —
// classes are exported above as value+type pairs).
export type {
  Component,
  EditorTheme,
  Focusable,
  KeyId,
  OverlayAnchor,
  OverlayHandle,
  OverlayMargin,
  OverlayOptions,
  SizeValue,
} from "@earendil-works/pi-tui";
