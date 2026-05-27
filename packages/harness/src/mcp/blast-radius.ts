// v2.3 §12.3 blast-radius gate — the load-bearing safety invariant
// for unattended `belmont auto`.
//
// Contract: when the auto loop is running, ONLY servers with
// `auto: true` may register tools. The rest are UNREACHABLE — not
// just "warned about." There is no --force escape hatch in v1.0 by
// design: auto mode is unattended; the user is asleep; a server with
// `auto:false` MUST NOT execute.
//
// Signal: `process.env.BELMONT_AUTO_MODE === "1"`. auto/loop.ts sets
// the var at runAuto start and unsets it in the finally block. The
// extension's session_start handler (which is what calls registerMcp-
// Servers) reads the var from process.env at registration time — so
// when /belmont:auto fires the auto loop, then triggers a session
// refresh (Alt+R / new session etc.), the second session_start sees
// the var set and filters accordingly.
//
// Symmetric in reverse: when auto ends, /belmont:mcp refresh OR a
// manual REPL refresh restores the full server set.
//
// `isAutoMode` is injected so the function stays pure for tests.

import type { McpConfig } from "@belmont/knowledge-schema";

/**
 * Drop every server missing `auto:true` when running under auto mode.
 *
 * Identity transform when `isAutoMode === false` — the interactive
 * REPL sees every configured server (the user is at the keyboard).
 *
 * The returned config is a structurally fresh object; the input is
 * never mutated.
 */
export function applyAutoModeFilter(
  config: McpConfig,
  isAutoMode: boolean,
): McpConfig {
  if (!isAutoMode) {
    return { servers: { ...config.servers } };
  }
  const filtered: typeof config.servers = {};
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.auto === true) {
      filtered[name] = server;
    }
  }
  return { servers: filtered };
}

/** Read the auto-mode signal from process.env. The single source of
 *  truth — auto/loop.ts mutates this var (set at start, unset in
 *  finally). Other modules MUST NOT set/unset it. */
export function isAutoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BELMONT_AUTO_MODE === "1";
}

/** Compute the "unreachable in auto mode" set — used by the
 *  `/belmont:mcp doctor` command + the auto-loop preflight, both of
 *  which want to show the user which servers were excluded. */
export function autoModeExcluded(config: McpConfig): string[] {
  const excluded: string[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (server.auto !== true) excluded.push(name);
  }
  return excluded.sort();
}
