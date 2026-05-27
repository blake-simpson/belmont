// packages/harness/src/pi/worker.ts
//
// Runtime B — the auto-mode worker. ONE of two files in the entire
// monorepo (alongside pi/sdk.ts) allowed to construct an
// `AgentSessionRuntime` / `AgentSession` from pi. The §8.2 hard API
// boundary contract:
//
//   "Only `@belmont/harness/src/pi/sdk.ts` may hold or expose
//    `pi.AgentSessionRuntime` / `pi.Session` / `pi.MessageRenderer`
//    objects. Any callsite outside `harness/src/pi/` must work through
//    wrapper functions that take primitives (strings, configs) in and
//    return primitives out — never escape the handles."
//
// The opaque `BelmontWorkerHandle` exposes exactly three operations
// (`newSession`, `promptCurrent`, `dispose`) plus the worker-event
// pipe (`subscribe`) that delivers Belmont-shaped events — not raw pi
// events — to the auto loop's renderer hook.
//
// Disposal discipline (§8.3) — every invariant baked in:
//   1. Each `createBelmontWorker` MUST be paired with `dispose()` in
//      `finally`. Enforced by `test/dispose-finally.test.ts` (M8 P0).
//   2. Every event subscription MUST register its unsubscriber for
//      batch teardown on `dispose`.
//   3. `dispose()` MUST tolerate already-disposed state
//      (`.catch(() => {})` on inner disposes).
//   4. A timed-out `prompt` MUST call `session.abort()`; the worker's
//      subscribe loop drops pending tool results and resolves on
//      `agent_end`.
//
// pi-mono upstream example references (cite per D-001-omp-evaluation):
//   - examples/sdk/13-session-runtime.ts (CreateAgentSessionRuntimeFactory
//     + runtime.newSession + bindSession unsubscribe pattern)
//   - examples/sdk/12-full-control.ts (createAgentSession + dispose discipline)
//   - examples/extensions/subagent/agents.ts (in-process worker pattern
//     — Belmont diverges: we use createAgentSessionRuntime in-process
//     rather than spawning child pi processes, because §7.3 mandates
//     two-runtime in-process and §3.2 forbids worktree IPC)
//   - examples/extensions/handoff.ts (subscribe → unsubscribe rebind)
//   - examples/extensions/auto-commit-on-exit.ts (clean-shutdown pattern
//     for the in-flight session at dispose time)

import type { Api, Model } from "@earendil-works/pi-ai";

import {
  type AgentSession,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type AgentSessionServices,
  type CreateAgentSessionRuntimeFactory,
  type CreateAgentSessionRuntimeResult,
  type ModelRegistry,
  type ToolDefinition,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
} from "./sdk.js";

// ────────────────────────────────────────────────────────────────────
// Belmont-shaped event surface — what flows OUT of the worker.
// ────────────────────────────────────────────────────────────────────
//
// Runtime A's renderer / loop consumes these — NOT raw pi events. This
// keeps the §8.2 boundary clean: callsites outside pi/ never see
// `AgentSessionEvent`, `AgentMessage`, etc.

export type WorkerEvent =
  | {
      type: "phase_start";
      phase: "implement" | "verify" | "decide";
      milestoneId: string;
      taskId: string;
      tier: string;
      sessionId: string;
    }
  | {
      type: "phase_end";
      phase: "implement" | "verify" | "decide";
      milestoneId: string;
      taskId: string;
      outcome: "ok" | "failed" | "aborted";
      message?: string;
      evidencePath?: string;
    }
  | {
      type: "text";
      /** Accumulated text for this assistant message (full content, not delta). */
      content: string;
      /** Whether the assistant message is still being streamed. */
      partial: boolean;
    }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      argsPreview: string;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName: string;
      isError: boolean;
    }
  | {
      type: "abort";
      reason: string;
    };

export type WorkerEventListener = (event: WorkerEvent) => void;

// ────────────────────────────────────────────────────────────────────
// Opaque handle exposed to the auto loop.
// ────────────────────────────────────────────────────────────────────

export type NewWorkerSessionOpts = {
  model: Model<Api>;
  thinkingLevel?: "off" | "low" | "medium" | "high";
};

export type BelmontWorkerHandle = {
  /** Replace the current sub-session with a fresh one for `model + thinking`. */
  newSession(opts: NewWorkerSessionOpts): Promise<void>;
  /** Send a prompt to the current session and resolve when the agent run ends. */
  promptCurrent(text: string, opts?: { abortSignal?: AbortSignal }): Promise<void>;
  /** Abort whatever the current session is doing (idempotent). */
  abortCurrent(): Promise<void>;
  /** Subscribe to Belmont-shaped events; returns an unsubscriber. */
  subscribe(listener: WorkerEventListener): () => void;
  /** Current pi sessionId (for episodic + auto.json bookkeeping). */
  currentSessionId(): string | undefined;
  /** Tear down session + runtime + all subscriptions. Idempotent. */
  dispose(): Promise<void>;
  /** Diagnostics surfaced during runtime creation (auth, settings, etc.). */
  diagnostics(): readonly AgentSessionRuntimeDiagnostic[];
};

// ────────────────────────────────────────────────────────────────────
// Worker construction.
// ────────────────────────────────────────────────────────────────────

export type CreateBelmontWorkerOpts = {
  cwd: string;
  /** Live ModelRegistry from Runtime A (reuses auth storage + custom providers). */
  modelRegistry: ModelRegistry;
  /** Initial model to bind. Subsequent `newSession()` calls replace it. */
  initialModel: Model<Api>;
  /** Optional initial thinking level (default "off"). */
  initialThinkingLevel?: "off" | "low" | "medium" | "high";
  /** Optional override for agentDir; defaults to `getAgentDir()`. */
  agentDir?: string;
  /** Custom tools to install (e.g. belmont_transition for the worker). */
  customTools?: ToolDefinition[];
};

/**
 * Build a fresh worker runtime. Each call gets its own `SessionManager`
 * (in-memory, scoped to `cwd`) so multiple workers cannot leak state
 * into each other; M8 only ever spawns ONE worker per `/belmont:auto`
 * invocation (sequential, see §7.3), but the discipline keeps the
 * leak test green.
 *
 * Caller contract (§8.3 bullet 1) — pair with `dispose()` in `finally`:
 *
 *     const worker = await createBelmontWorker({ … });
 *     try { … } finally { await worker.dispose(); }
 */
export async function createBelmontWorker(
  opts: CreateBelmontWorkerOpts,
): Promise<BelmontWorkerHandle> {
  // Lazy-import SessionManager.inMemory only when we actually build a
  // worker so the leak-test "construct N workers, dispose, count" path
  // doesn't keep an unused SessionManager hanging on module state.
  const { SessionManager } = await import("./sdk.js");

  const sessionManager = SessionManager.inMemory(opts.cwd);

  // The factory closes over { modelRegistry, agentDir, customTools } so
  // every `runtime.newSession()` (M8 fresh sub-session per phase) reuses
  // the same auth + tool surface and only model/thinking flip.
  const factory: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager: sm,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir: opts.agentDir ?? getAgentDir(),
      modelRegistry: opts.modelRegistry,
    });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager: sm,
      sessionStartEvent,
      model: currentModel as Model<Api> | undefined,
      thinkingLevel: currentThinking,
      ...(opts.customTools ? { customTools: opts.customTools } : {}),
    });
    return {
      ...created,
      services,
      diagnostics: services.diagnostics,
    } satisfies CreateAgentSessionRuntimeResult;
  };

  let currentModel: Model<Api> | undefined = opts.initialModel;
  let currentThinking: "off" | "low" | "medium" | "high" = opts.initialThinkingLevel ?? "off";

  const runtime: AgentSessionRuntime = await createAgentSessionRuntime(factory, {
    cwd: opts.cwd,
    agentDir: opts.agentDir ?? getAgentDir(),
    sessionManager,
  });

  // ── Subscription wiring ───────────────────────────────────────────
  //
  // `unsubscribers` tracks BOTH session-event listeners and the loop's
  // own renderer hooks. Every `newSession()` + `dispose()` drains it
  // wholesale — §8.3 invariant 2.
  const listeners = new Set<WorkerEventListener>();
  let sessionUnsubscribe: (() => void) | undefined;
  let disposed = false;

  // Per-message accumulators — pi emits text in fine-grained deltas;
  // we batch by message_id so the renderer can flush a single
  // text event per assistant message rather than 1000 partials. The
  // user opted INTO streaming (every text_delta proxied; v1.0 chooses
  // per-message granularity to avoid back-pressure on Runtime A).
  let currentMessageText = "";
  let currentMessageId = "";

  const unsubscribeCurrent = (): void => {
    if (sessionUnsubscribe) {
      try {
        sessionUnsubscribe();
      } catch {
        /* swallow */
      }
      sessionUnsubscribe = undefined;
    }
    currentMessageText = "";
    currentMessageId = "";
  };

  const subscribeCurrent = (): void => {
    const session: AgentSession = runtime.session;
    sessionUnsubscribe = session.subscribe((event) => {
      handleSessionEvent(event, emit);
    });
  };

  subscribeCurrent();

  // ── Pure event translation (pi → Belmont) ─────────────────────────
  function handleSessionEvent(
    event: unknown,
    emitFn: (e: WorkerEvent) => void,
  ): void {
    // Minimal duck-typed routing — keeps the worker compile-stable even
    // if pi widens the AgentSessionEvent union in a minor release.
    if (!event || typeof event !== "object" || !("type" in event)) return;
    const t = (event as { type: string }).type;

    if (t === "message_start") {
      currentMessageText = "";
      // We don't currently carry message_id externally — pi may not
      // expose a stable per-message id on the event, so we treat
      // message_start as "reset accumulator".
      currentMessageId = String(Date.now()) + Math.random().toString(36).slice(2);
      return;
    }

    if (t === "message_update") {
      const e = event as {
        assistantMessageEvent?: { type?: string; delta?: string };
      };
      const ame = e.assistantMessageEvent;
      if (ame?.type === "text_delta" && typeof ame.delta === "string") {
        currentMessageText += ame.delta;
        emitFn({ type: "text", content: currentMessageText, partial: true });
      }
      return;
    }

    if (t === "message_end") {
      if (currentMessageText.length > 0) {
        emitFn({ type: "text", content: currentMessageText, partial: false });
      }
      currentMessageText = "";
      currentMessageId = "";
      return;
    }

    if (t === "tool_execution_start") {
      const e = event as {
        toolCallId?: string;
        toolName?: string;
        args?: unknown;
      };
      emitFn({
        type: "tool_call",
        toolCallId: String(e.toolCallId ?? ""),
        toolName: String(e.toolName ?? "(unknown)"),
        argsPreview: previewArgs(e.args),
      });
      return;
    }

    if (t === "tool_execution_end") {
      const e = event as {
        toolCallId?: string;
        toolName?: string;
        isError?: boolean;
      };
      emitFn({
        type: "tool_result",
        toolCallId: String(e.toolCallId ?? ""),
        toolName: String(e.toolName ?? "(unknown)"),
        isError: Boolean(e.isError),
      });
      return;
    }
  }

  function emit(event: WorkerEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors — the auto loop's renderer hook
        // must never crash the worker subscribe pipe.
      }
    }
  }

  // ── Handle methods ────────────────────────────────────────────────
  const handle: BelmontWorkerHandle = {
    async newSession(o: NewWorkerSessionOpts) {
      if (disposed) {
        throw new Error("BelmontWorker is disposed; create a new one to continue.");
      }
      // §8.3 invariant 2: unsubscribe BEFORE the runtime disposes the
      // old session internally. The 1:1 install/unsubscribe count is
      // what the §8.4 leak test asserts.
      unsubscribeCurrent();
      currentModel = o.model;
      currentThinking = o.thinkingLevel ?? "off";
      const result = await runtime.newSession();
      if (result.cancelled) {
        throw new Error("Worker newSession was cancelled by a session_before_switch handler.");
      }
      subscribeCurrent();
    },

    async promptCurrent(text: string, _opts?: { abortSignal?: AbortSignal }) {
      if (disposed) {
        throw new Error("BelmontWorker is disposed.");
      }
      // pi 0.75.5's session.prompt() resolves on agent_end; we don't
      // need to await a custom AbortSignal here because the watchdog
      // composes with the worker via `abortCurrent()` (see below).
      await runtime.session.prompt(text);
    },

    async abortCurrent() {
      if (disposed) return;
      try {
        await runtime.session.abort();
        emit({ type: "abort", reason: "worker.abortCurrent()" });
      } catch {
        // Already-aborted / no in-flight prompt → noop.
      }
    },

    subscribe(listener: WorkerEventListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    currentSessionId() {
      try {
        return runtime.session.sessionId;
      } catch {
        return undefined;
      }
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      // §8.3 invariant 3: dispose tolerates already-disposed state.
      unsubscribeCurrent();
      listeners.clear();
      // The runtime's dispose() drains the active session AND its
      // services (auth storage handles, settings manager, etc.).
      await runtime.dispose().catch(() => {});
    },

    diagnostics() {
      return runtime.diagnostics;
    },
  };

  return handle;
}

// ────────────────────────────────────────────────────────────────────
// Helpers (pure, exported for tests).
// ────────────────────────────────────────────────────────────────────

/**
 * Render a one-line preview of a tool call's args. Keeps the worker
 * stream RTK-friendly (no nested JSON in the renderer's collapsed
 * row); the `expanded` view in the renderer can re-fetch full args
 * from session state if a future M8.1 iteration needs them.
 */
export function previewArgs(args: unknown, max = 60): string {
  if (args === undefined || args === null) return "";
  let s: string;
  try {
    s = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    s = String(args);
  }
  // Collapse internal whitespace so the preview fits one cell column.
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export type { AgentSessionServices };
