// test/leak.test.ts — v2.3 §8.4 M8 ship-gate: 10-iteration leak test.
//
// The §8.4 contract:
//   "after.runtimes === before.runtimes &&
//    after.sessions === before.sessions &&
//    after.listeners === before.listeners"
//
// Introspection-path decision (the ultrathink call for M8):
//
//   Path (a) — introspect pi 0.75.5's internal resource counters.
//              VERIFIED ABSENT. The d.ts files at
//              node_modules/@earendil-works/pi-coding-agent/dist/core/
//              {agent-session-runtime,agent-session,session-manager}.d.ts
//              expose ONLY public getters (`session`, `services`,
//              `diagnostics`) + public methods (`newSession`, `switchSession`,
//              `dispose`, etc.). There is NO `_internal.activeResources`
//              accessor. Path (a) cannot be used in v1.0.
//
//   Path (b) — snapshot the Node process's active-handle / active-request
//              counts BEFORE the 10-iter loop and AFTER `dispose()` × 10.
//              Process-level handles + requests cover:
//                - leaked sockets (HTTP keep-alives the worker forgot)
//                - leaked timers (watchdog or no-output intervals)
//                - leaked child processes (pi tool execution)
//                - leaked file handles (session JSONL not closed)
//              This is the §8.4 "polls the Node.js process tree" fallback
//              the plan explicitly anticipated.
//
// We pick path (b) and document the gap by also unit-testing the
// Belmont wrapper's INTERNAL bookkeeping (listener Set drained,
// session unsubscriber cleared) — that's the part of the §8.4 contract
// pi 0.75.5's API permits us to verify directly. Future pi releases
// that expose `_internal` counters could swap path (b) for path (a)
// without changing the assertion surface.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBelmontWorker,
  type BelmontWorkerHandle,
  type WorkerEvent,
} from "../src/pi/worker.js";
import type { Api, Model, ModelRegistry } from "../src/pi/sdk.js";

// ────────────────────────────────────────────────────────────────────
// Mock pi runtime — the WRAPPER-LEVEL leak surface.
//
// We stub pi/sdk.ts via vi.mock so createBelmontWorker reaches a fake
// `createAgentSessionRuntime` we control. This lets us assert the
// EXACT bookkeeping invariants from §8.3:
//   - unsubscribers drained on newSession and on dispose
//   - dispose tolerates already-disposed state
//   - sessionUnsubscribe is cleared on dispose
//   - listener Set is cleared on dispose
//
// The "10 iterations leave no leaks" assertion in this file is the
// COUNT of stub objects created vs disposed — leakage in the wrapper
// would show up as session/runtime stubs that never received dispose().
// ────────────────────────────────────────────────────────────────────

type StubCounts = {
  runtimesCreated: number;
  runtimesDisposed: number;
  sessionsCreated: number;
  sessionsDisposed: number;
  subscribersInstalled: number;
  subscribersUnsubscribed: number;
};

const counts: StubCounts = {
  runtimesCreated: 0,
  runtimesDisposed: 0,
  sessionsCreated: 0,
  sessionsDisposed: 0,
  subscribersInstalled: 0,
  subscribersUnsubscribed: 0,
};

function makeStubSession(): { session: unknown; assertDisposed: () => boolean } {
  counts.sessionsCreated += 1;
  const subscribers = new Set<(event: unknown) => void>();
  const localState = { disposed: false, aborted: false };
  const session = {
    sessionId: `sess-${counts.sessionsCreated}`,
    subscribe(listener: (event: unknown) => void) {
      counts.subscribersInstalled += 1;
      subscribers.add(listener);
      return () => {
        if (subscribers.delete(listener)) {
          counts.subscribersUnsubscribed += 1;
        }
      };
    },
    async prompt(_text: string) {
      // emit a synthetic agent_end to mimic real session loop.
      for (const sub of subscribers) {
        sub({ type: "message_start" });
        sub({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "ok" },
        });
        sub({ type: "message_end" });
      }
    },
    async abort() {
      localState.aborted = true;
    },
    async dispose() {
      // pi semantics: dispose() removes listeners + disconnects from agent.
      counts.sessionsDisposed += 1;
      localState.disposed = true;
      subscribers.clear();
    },
  };
  return { session, assertDisposed: () => localState.disposed };
}

function makeStubRuntime(): unknown {
  counts.runtimesCreated += 1;
  let currentSession = makeStubSession();
  const localState = { disposed: false };
  return {
    get session() {
      return currentSession.session;
    },
    get cwd() {
      return "/tmp/fake";
    },
    get diagnostics() {
      return [];
    },
    get services() {
      return {};
    },
    async newSession() {
      // pi semantics: dispose old session then create new.
      const old = currentSession;
      currentSession = makeStubSession();
      // Note: pi's runtime.newSession internally disposes the prior
      // session BEFORE the new one binds. We mirror that here.
      await (old.session as { dispose: () => Promise<void> }).dispose();
      return { cancelled: false };
    },
    async dispose() {
      counts.runtimesDisposed += 1;
      localState.disposed = true;
      await (currentSession.session as { dispose: () => Promise<void> }).dispose();
    },
    setRebindSession() {
      /* noop */
    },
    setBeforeSessionInvalidate() {
      /* noop */
    },
  };
}

vi.mock("../src/pi/sdk.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/pi/sdk.js")>();
  return {
    ...actual,
    createAgentSessionRuntime: async (
      _factory: unknown,
      _opts: unknown,
    ): Promise<unknown> => makeStubRuntime(),
    createAgentSessionServices: async () => ({
      cwd: "/tmp",
      agentDir: "/tmp/agent",
      authStorage: {},
      settingsManager: {},
      modelRegistry: {},
      resourceLoader: {},
      diagnostics: [],
    }),
    createAgentSessionFromServices: async () => ({ session: {} }),
    getAgentDir: () => "/tmp/agent",
    SessionManager: {
      inMemory: () => ({}),
    },
  };
});

const fakeModel = { id: "fake", provider: "fake" } as unknown as Model<Api>;
const fakeRegistry = {
  find: () => fakeModel,
  authStorage: {},
} as unknown as ModelRegistry;

beforeEach(() => {
  counts.runtimesCreated = 0;
  counts.runtimesDisposed = 0;
  counts.sessionsCreated = 0;
  counts.sessionsDisposed = 0;
  counts.subscribersInstalled = 0;
  counts.subscribersUnsubscribed = 0;
});

afterEach(() => {
  // Nothing global to reset — counts are per-test.
});

describe("BelmontWorker — §8.4 10-iteration leak contract (wrapper level)", () => {
  it("createBelmontWorker + dispose balances runtimes 1:1", async () => {
    const worker = await createBelmontWorker({
      cwd: "/tmp",
      modelRegistry: fakeRegistry,
      initialModel: fakeModel,
    });
    expect(counts.runtimesCreated).toBe(1);
    expect(counts.runtimesDisposed).toBe(0);
    await worker.dispose();
    expect(counts.runtimesDisposed).toBe(1);
  });

  it("newSession() disposes the prior session before binding the new one", async () => {
    const worker = await createBelmontWorker({
      cwd: "/tmp",
      modelRegistry: fakeRegistry,
      initialModel: fakeModel,
    });
    try {
      await worker.newSession({ model: fakeModel });
      await worker.newSession({ model: fakeModel });
      // 1 initial + 2 newSession = 3 sessions; 2 disposed (the 2 prior
      // sessions when newSession ran); 1 still-active (the latest).
      expect(counts.sessionsCreated).toBe(3);
      expect(counts.sessionsDisposed).toBe(2);
    } finally {
      await worker.dispose();
    }
    // dispose drains the active session.
    expect(counts.sessionsDisposed).toBe(3);
  });

  it("10 iterations of {newSession + promptCurrent + new worker dispose} leak nothing", async () => {
    const before = snapshotProcessHandles();
    for (let i = 0; i < 10; i++) {
      const worker = await createBelmontWorker({
        cwd: "/tmp",
        modelRegistry: fakeRegistry,
        initialModel: fakeModel,
      });
      try {
        await worker.newSession({ model: fakeModel });
        await worker.promptCurrent("hello");
        await worker.newSession({ model: fakeModel });
        await worker.promptCurrent("verify");
      } finally {
        await worker.dispose();
      }
    }

    // ── §8.4 invariant: balanced lifecycle counts. ────────────────────
    expect(counts.runtimesCreated).toBe(10);
    expect(counts.runtimesDisposed).toBe(10);
    // 10 workers × 3 sessions each (1 initial + 2 newSession) = 30
    expect(counts.sessionsCreated).toBe(30);
    expect(counts.sessionsDisposed).toBe(30);

    // ── §8.4 invariant: all Belmont-side subscribers drained. ─────────
    // Each session gets ONE Belmont-side subscriber (the worker's
    // session.subscribe callback). 30 sessions → 30 installs → 30
    // unsubscribes.
    expect(counts.subscribersInstalled).toBe(30);
    expect(counts.subscribersUnsubscribed).toBe(30);

    // ── Path (b): process-level handles must not grow. ────────────────
    // We allow ±2 slack: vitest spawns its own timers between tests
    // and process._getActiveHandles is best-effort across Node versions.
    const after = snapshotProcessHandles();
    expect(after.handles).toBeLessThanOrEqual(before.handles + 2);
    expect(after.requests).toBeLessThanOrEqual(before.requests + 2);
  });

  it("dispose() is idempotent — second call is a noop", async () => {
    const worker = await createBelmontWorker({
      cwd: "/tmp",
      modelRegistry: fakeRegistry,
      initialModel: fakeModel,
    });
    await worker.dispose();
    await worker.dispose();
    expect(counts.runtimesDisposed).toBe(1);
  });

  it("subscribe() returns an unsubscriber that drops the listener", async () => {
    const worker = await createBelmontWorker({
      cwd: "/tmp",
      modelRegistry: fakeRegistry,
      initialModel: fakeModel,
    });
    try {
      const seen: WorkerEvent[] = [];
      const unsub = worker.subscribe((e) => seen.push(e));
      await worker.promptCurrent("hello");
      const beforeCount = seen.length;
      unsub();
      await worker.promptCurrent("again");
      // After unsub: no new events delivered to the listener.
      expect(seen.length).toBe(beforeCount);
    } finally {
      await worker.dispose();
    }
  });

  it("promptCurrent after dispose throws (no zombie work)", async () => {
    const worker = await createBelmontWorker({
      cwd: "/tmp",
      modelRegistry: fakeRegistry,
      initialModel: fakeModel,
    });
    await worker.dispose();
    await expect(worker.promptCurrent("hello")).rejects.toThrow(/disposed/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────────

function snapshotProcessHandles(): { handles: number; requests: number } {
  const proc = process as unknown as {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
  };
  return {
    handles: proc._getActiveHandles?.()?.length ?? 0,
    requests: proc._getActiveRequests?.()?.length ?? 0,
  };
}

// Export for visibility in other tests; not part of the public API.
export { snapshotProcessHandles };

// Reference the imported BelmontWorkerHandle type so unused-import lint
// stays green even when the test runner inlines types.
export type _BelmontWorkerHandleType = BelmontWorkerHandle;
