// packages/harness/src/pi/sdk.ts
//
// This is the ONE file in the entire monorepo allowed to import
// `@earendil-works/pi-coding-agent`. The B5 anti-corruption layer in
// action: every other module reaches pi through the wrappers and the
// type re-exports below.
//
// Enforced by:
//   - .dependency-cruiser.cjs rule `no-pi-outside-harness-pi-subdir`
//     (path-based, blocks all packages/harness/src/!(pi)/** files)
//   - test/pi-boundary.test.ts (static AST scan over the workspace —
//     regex catches the raw `from "@earendil-works/pi-coding-agent"`
//     specifier including in `import type` lines, so re-export via this
//     file is the ONLY way for siblings to see pi types)
//
// At M3 the wrapper surface expanded to cover what the harness extension
// needs: type re-exports for ExtensionAPI / handler events / command
// context, and the `launchPi(argv)` wrapper that hands the harness
// factory to `pi.main()`.
//
// M5 extends the type re-exports with the tool + tool_call/turn_start/
// turn_end shapes that the new tools/* and hooks/* siblings depend on,
// per D-003 §Decision item 4. The `isToolCallEventType` value re-export
// is the first non-type re-export through this file — sibling hooks use
// it to narrow `ToolCallEvent` to `WriteToolCallEvent`/`EditToolCallEvent`
// so the `event.input.{path,content,edits}` fields are typed.
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

// Type re-exports. Sibling modules (extension.ts, commands/*, hooks/*,
// tools/*) consume pi types via `import type { … } from "./pi/sdk.js"`.
export type {
  AgentToolResult,
  AgentToolUpdateCallback,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  EditToolCallEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionFactory,
  SessionStartEvent,
  ToolCallEvent,
  ToolCallEventResult,
  ToolDefinition,
  TurnEndEvent,
  TurnStartEvent,
  WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
