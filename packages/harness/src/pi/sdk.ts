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
// M8 (now) extends the surface with the `createAgentSessionRuntime`
// lifecycle hooks used by the auto worker (Runtime B). Specifically:
//
//   - `createAgentSessionRuntime` + `createAgentSessionServices` +
//     `createAgentSessionFromServices` + `getAgentDir` (function VALUE
//     re-exports) — assembled inside `pi/worker.ts` into the
//     `BelmontWorkerHandle` API surface that the auto loop consumes.
//   - `SessionManager`, `AgentSessionRuntime`, `AgentSession` (class
//     value+type re-exports) — needed for `SessionManager.inMemory()`
//     factory + AgentSessionRuntime typing on the handle internals.
//   - Type re-exports: `AgentSessionEvent`, `AgentSessionEventListener`,
//     `CreateAgentSessionRuntimeFactory`, `CreateAgentSessionRuntimeResult`,
//     `AgentSessionServices`, `AgentSessionRuntimeDiagnostic`, plus the
//     `Model` shape from pi-ai used to resolve a tier into a session.
//
// pi-mono upstream example references (per D-001-omp-evaluation):
//   - examples/sdk/13-session-runtime.ts (CreateAgentSessionRuntimeFactory pattern)
//   - examples/sdk/12-full-control.ts (createAgentSession + dispose discipline)
//   - examples/extensions/subagent/ (in-process worker pattern)
//   - examples/extensions/message-renderer.ts (custom message renderer surface)
//   - examples/extensions/handoff.ts (session subscribe + unsubscribe pattern)
//   - examples/extensions/auto-commit-on-exit.ts (session_shutdown discipline)
//
// The §8.2 hard boundary stays intact: `createBelmontWorker` (in
// `pi/worker.ts`) is the only file that constructs an
// `AgentSessionRuntime` — every other harness file consumes the worker
// via the opaque `BelmontWorkerHandle`.
//
// M9 (now) extends the surface for RTK + token reduction + thinking-
// collapse + compaction observation:
//
//   - `createLocalBashOperations` (function VALUE re-export) — wrapped
//     by hooks/rtk-bash.ts to rewrite user-typed shell commands through
//     `rtk` while preserving pi's local-shell execution semantics.
//   - Type re-exports: `BashOperations`, `BashSpawnContext`,
//     `BashSpawnHook`, `BashToolOptions` — consumed by the user_bash
//     hook's BashOperations wrapper.
//   - Type re-exports: `UserBashEvent`, `UserBashEventResult` — the
//     pi.on("user_bash", …) event surface RTK rides on. `user_bash` only
//     fires on USER-typed `!`/`!!` shell commands in the REPL; LLM-
//     spawned bash tool calls go through `tool_call` / `tool_execution_*`
//     and are NOT intercepted by RTK (correct per §11.1 scoping).
//   - Type re-exports: `ContextEvent`, `ContextEventResult` — the
//     messages-array rewrite slot reserved by D-003 for messages
//     pruning. M9 is the first registration (thinking-collapse). v1.1
//     adds lean-ctx composition.
//   - Type re-exports: `SessionBeforeCompactEvent`,
//     `SessionBeforeCompactResult`, `CompactionPreparation`,
//     `SessionEntry` — for the M9 observer that writes an episodic
//     entry before pi compacts the transcript (returns undefined so
//     pi's default compaction proceeds).
//   - Type re-exports: `AgentMessage`, `AssistantMessage`,
//     `ThinkingContent`, `TextContent`, `ImageContent`, `ToolCall` —
//     consumed by the thinking-collapse context hook to walk the
//     messages array and rewrite assistant thinking blocks.
//
// pi-mono upstream example references (per D-001-omp-evaluation):
//   - examples/extensions/bash-spawn-hook.ts (createBashTool + spawnHook
//     pattern — informed the RTK wrapper's BashOperations approach)
//   - examples/extensions/hidden-thinking-label.ts (the existing pi
//     label API; M9's thinking-collapse rewrites the messages array
//     instead because §6.4 specifies content collapse, not label change)
//   - examples/extensions/custom-compaction.ts (session_before_compact
//     event shape + CompactionPreparation; M9 observes, does NOT
//     override pi's compaction)

import {
  VERSION as PI_VERSION,
  createLocalBashOperations as piCreateLocalBashOperations,
  isToolCallEventType as piIsToolCallEventType,
} from "@earendil-works/pi-coding-agent";

export const piPackage = "@earendil-works/pi-coding-agent";
export const piVersion = PI_VERSION;

export const isToolCallEventType = piIsToolCallEventType;

// M9 value re-export — the local-shell BashOperations factory.
// hooks/rtk-bash.ts wraps the result with an `onData` interceptor that
// parses `rtk gain: …` trailers, and rewrites the first arg from the
// user's raw command to `rtk <command>` before delegating.
export const createLocalBashOperations = piCreateLocalBashOperations;

// pi-coding-agent class re-export. `Theme` is a class so the same
// identifier carries both the value (constructor) and the type
// (instance), which is what sibling code needs when typing factory
// callbacks like `(tui, theme: Theme, kb, done) => …`.
export { Theme } from "@earendil-works/pi-coding-agent";

// M8 value re-exports — the runtime + lifecycle entrypoints the worker
// in pi/worker.ts builds against. `SessionManager`, `AgentSessionRuntime`,
// and `AgentSession` ride as value+type pairs (classes), so callers can
// both `instanceof` and `new`.
export {
  AgentSession,
  AgentSessionRuntime,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

// pi-tui class re-exports. As above — each is both a value and an
// instance type, so siblings can do `private tui: TUI` for instance
// typing as well as `new Container()` for construction.
export {
  Box,
  Container,
  CURSOR_MARKER,
  isFocusable,
  KeybindingsManager,
  Text,
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
  AgentSessionConfig,
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionRuntimeDiagnostic,
  AgentSessionServices,
  AgentToolResult,
  AgentToolUpdateCallback,
  ApiKeyCredential,
  AuthCredential,
  AuthStatus,
  AuthStorage,
  BashOperations,
  BashSpawnContext,
  BashSpawnHook,
  BashToolOptions,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextEvent,
  ContextUsage,
  CreateAgentSessionFromServicesOptions,
  CreateAgentSessionResult,
  CreateAgentSessionRuntimeFactory,
  CreateAgentSessionRuntimeResult,
  CreateAgentSessionServicesOptions,
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
  SessionBeforeCompactEvent,
  SessionEntry,
  SessionShutdownEvent,
  SessionStartEvent,
  TerminalInputHandler,
  ToolCallEvent,
  ToolCallEventResult,
  ToolDefinition,
  TurnEndEvent,
  TurnStartEvent,
  UserBashEvent,
  UserBashEventResult,
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
//
// M9 (now) adds the message-content type surface needed by the
// thinking-collapse context hook: `AssistantMessage`, `UserMessage`,
// `ToolResultMessage`, `Message`, `ThinkingContent`, `TextContent`,
// `ImageContent`, `ToolCall`. These are the pi-ai message vocabulary
// that flows through `ContextEvent.messages` (typed as `AgentMessage[]`
// upstream, which is a superset of `Message` admitting user-defined
// custom messages via the `CustomAgentMessages` declaration-merge slot).
// `AgentMessage` itself is declared locally below — pi-coding-agent does
// not re-export it from its top-level surface (it lives in pi-agent-core,
// which Belmont does not depend on directly).
export type {
  Api,
  AssistantMessage,
  ImageContent,
  Message,
  Model,
  OAuthCredentials,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
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

import type {
  ContextEvent as PiContextEvent,
  SessionBeforeCompactEvent as PiSessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

// ─── M9 declared-locally type surface ─────────────────────────────────
//
// `AgentMessage` upstream is `Message | CustomAgentMessages[keyof
// CustomAgentMessages]` (per pi-agent-core/dist/types.d.ts L271). pi-
// coding-agent declaration-merges `bashExecution: BashExecutionMessage`
// into that interface (see pi-coding-agent/core/messages.d.ts L52-55),
// so a context handler that walks `event.messages` MUST handle the
// BashExecutionMessage variant too — not just `Message`. pi-coding-
// agent does not re-export `AgentMessage` at its top level and we don't
// depend on pi-agent-core directly, so we derive the alias from the
// public `ContextEvent.messages` array element. That auto-widens
// whenever pi (or any future Belmont-declared) custom message type is
// added, without churning call sites.
export type AgentMessage = PiContextEvent["messages"][number];

// `ContextEventResult` upstream lives in core/extensions/types.ts but is
// NOT re-exported at the top level (the public on() overload binds it
// implicitly so handler authors never need to import it directly).
// Belmont's hooks/thinking-collapse.ts returns this shape explicitly to
// make the messages-rewrite intent obvious; declared locally to keep
// the wrapper self-contained.
export interface ContextEventResult {
  messages?: AgentMessage[];
}

// `CompactionPreparation` is reachable via index access on the event,
// hoisted here for readability in hooks/session-before-compact.ts.
export type CompactionPreparation = PiSessionBeforeCompactEvent["preparation"];

// Re-export the context-event message-array type for handlers that need
// to declare a typed local variable.
export type ContextEventMessages = PiContextEvent["messages"];
// ──────────────────────────────────────────────────────────────────────
