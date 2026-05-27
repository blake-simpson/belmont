// @belmont/harness/src/mcp/* — public surface.

export type {
  McpClient,
  McpToolDescriptor,
  McpToolResult,
} from "./transport.js";
export { createMcpClient } from "./transport.js";

export {
  registerMcpServers,
  buildToolDefinition,
  getMcpJsonMtime,
  type McpClientFactory,
  type McpRegistryDeps,
  type RegistrationOutcome,
  type RegistrationResult,
} from "./adapter.js";

export {
  applyAutoModeFilter,
  isAutoMode,
  autoModeExcluded,
} from "./blast-radius.js";

export {
  readToolsCache,
  writeToolsCache,
  clearToolsCache,
  toolsCachePath,
  sha1,
  serverConfigHash,
  type CachedTool,
  type CachedServerEntry,
  type ToolsCache,
} from "./cache.js";

export {
  recordMcpInvocation,
  recordMcpServersForAutoRun,
  type McpInvocationOutcome,
  type RecordMcpInvocationInput,
  type McpServerDescriptor,
} from "./audit.js";

export { interpolate, interpolateRecord, expandTilde } from "./interpolate.js";
