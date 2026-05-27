// auto/loop.ts — the sequential per-task auto loop. v2.3 §7 incarnate.
//
// runAuto(ctx, scope) is the single entry point. Lifecycle:
//
//   PREFLIGHT  →  worker = createBelmontWorker(...)
//                 widget = setAutoProgressWidget(ctx, ...)
//                 panel.openPassive(ctx)
//                 wire activeAuto singleton + write auto.json
//   for task in eligible:
//     consume steering
//     impl session  : worker.newSession(implTier) ; promptCurrent(...)
//     transition    : [ ]→[>]→[x]
//     verify session: worker.newSession(verifyTier); promptCurrent(...)
//     transition    : [x]→[v] (with evidence_path)
//     stop / pause check
//   finally:        await worker.dispose()
//                   clearAutoProgressWidget(ctx)
//                   clearAutoJson; clear stop sentinel; activeAuto = null
//
// §7.3: TWO RUNTIMES. We construct ONE worker (Runtime B) for the
// entire `/belmont:auto` invocation; per-phase `newSession()` calls
// flip the model/thinking inside Runtime B without disturbing
// Runtime A. The pi handles never leave `pi/worker.ts`.
//
// §8.3 disposal discipline (the §8.4 leak test's contract):
//   - try { … } finally { await worker.dispose() }  — enforced here.
//   - worker.dispose() drains session + runtime + listeners.
//   - The `try` catches AbortError and surfaces it as a phase-failed
//     transition instead of bubbling out.
//
// Decide ladder (§7.4) — wired here in two halves: pure rules
// (`decideRules`) run BEFORE we pick the next task; AI fallback
// (`aiFallbackDecide`) uses the same worker we already have to ask the
// model "what should I do next?" if the rules hit `stuck`. This is the
// only place a Belmont LLM call can fire OUTSIDE an implement/verify
// phase — and it lives inside the existing worker's lifecycle, so the
// leak test's "dispose once at /belmont:auto end" contract still holds.

import { setTimeout as setTimeoutFn } from "node:timers";

import {
  parseProgress,
  parseMilestoneOverlay,
  type AgentRole,
  type Milestone,
  type ModelsJson,
  type OverlayTokens,
} from "@belmont/knowledge-schema";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { executeBelmontTransition } from "../tools/belmont-transition.js";
import { appendOrCreateEpisode } from "../state/episodic.js";
import {
  autoStopExists,
  clearAutoJson,
  consumeAutoStop,
  patchAutoJson,
  writeAutoJson,
  type AutoJsonState,
} from "../state/auto-json.js";
import {
  emitWorkerMessage,
  WORKER_CUSTOM_TYPE,
  type WorkerMessagePayload,
} from "./render.js";
import { consumeSteeringFile } from "./steering.js";
import {
  decideRules,
  findTask,
  scopeMilestones,
  type AutoScope,
  type DecideInput,
  type DecisionAction,
} from "./decide.js";
import {
  formatAutoWidget,
  setAutoProgressWidget,
  clearAutoProgressWidget,
} from "../tui/widget-progress.js";
import { runBelmontValidate, formatValidateReport } from "../validate.js";
import { resolveTier, type ResolvedTier } from "../tiering/resolve.js";
import { getCachedModelsJson, refreshModelsJsonSnapshot } from "../tiering/snapshot.js";
import { runModelsDoctor, formatDoctorReport } from "../tiering/doctor.js";
import {
  createBelmontWorker,
  type BelmontWorkerHandle,
  type WorkerEvent,
} from "../pi/worker.js";
import type {
  Api,
  ExtensionAPI,
  ExtensionCommandContext,
  Model,
  ModelRegistry,
} from "../pi/sdk.js";
import type { TierOverrideMap } from "../tiering/resolve.js";

// ────────────────────────────────────────────────────────────────────
// Active-auto singleton — shared with commands/auto.ts (stop/pause/etc).
// ────────────────────────────────────────────────────────────────────

export type ActiveAuto = {
  scope: AutoScope;
  cliOverrides: TierOverrideMap;
  worker: BelmontWorkerHandle;
  paused: boolean;
  stopRequested: boolean;
  startedAt: string;
  currentMilestone?: string;
  currentTaskId?: string;
};

let activeAuto: ActiveAuto | null = null;

export function getActiveAuto(): ActiveAuto | null {
  return activeAuto;
}

export function isAutoActive(): boolean {
  return activeAuto !== null;
}

/** Test-only — reset the singleton between tests. */
export function _resetActiveAutoForTests(): void {
  activeAuto = null;
}

// ────────────────────────────────────────────────────────────────────
// Watchdog timers (§7.5)
// ────────────────────────────────────────────────────────────────────

const PHASE_WATCHDOG_MS = 5 * 60 * 1000; // 5 minutes per phase ceiling
const NO_OUTPUT_MS = 30 * 1000; // 30s no-token / no-tool-call timeout
const MAX_ITERATIONS = 100;
const STUCK_COUNTER_MAX = 3;

// ────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────

export type RunAutoDeps = {
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
  scope: AutoScope;
  cliOverrides?: TierOverrideMap;
  /** Test seam — when set, replaces the real createBelmontWorker. */
  createWorker?: typeof createBelmontWorker;
};

export async function runAuto(deps: RunAutoDeps): Promise<void> {
  const { ctx, pi, scope } = deps;
  const cliOverrides = deps.cliOverrides ?? {};

  if (activeAuto !== null) {
    ctx.ui.notify(
      "Auto loop already running. Use /belmont:stop to halt before starting another.",
      "warning",
    );
    return;
  }

  // ── PREFLIGHT (§7.6 + §5.3) ─────────────────────────────────────────
  // 1. belmont validate — refuse on hardFailures.
  const validate = await runBelmontValidate(ctx.cwd);
  if (validate.hardFailures.length > 0) {
    ctx.ui.notify(
      `Auto refused — \`belmont validate\` hard-fails:\n${formatValidateReport(validate)}`,
      "error",
    );
    return;
  }

  // 2. /belmont:models doctor — refuse on hardFail (zero reachable tiers).
  const snapshot = getCachedModelsJson() ?? (await refreshModelsJsonSnapshot(ctx.cwd));
  if (!snapshot.ok) {
    ctx.ui.notify(
      `Auto refused — models.json invalid or missing. Run \`belmont init\` first.`,
      "error",
    );
    return;
  }
  const modelsJson: ModelsJson = snapshot.data;
  const doctor = await runModelsDoctor(ctx.cwd, {
    modelRegistry: ctx.modelRegistry,
    ...(cliOverrides ? { cliOverrides } : {}),
  });
  if (doctor.hardFail) {
    ctx.ui.notify(
      `Auto refused — zero reachable tiers:\n${formatDoctorReport(doctor)}`,
      "error",
    );
    return;
  }

  // 3. Resolve the initial implementation tier so we can construct
  // the worker. Without a Model<Api> handle, createBelmontWorker
  // can't be instantiated.
  const initialResolved = resolveTier(modelsJson, "implementation", {
    cliOverrides,
  });
  const initialModel = findModel(ctx.modelRegistry, initialResolved);
  if (!initialModel) {
    ctx.ui.notify(
      `Auto refused — couldn't find pi Model for tier ${initialResolved.tier} ` +
        `(${initialResolved.provider}/${initialResolved.model}). Check \`/belmont:models doctor\` output.`,
      "error",
    );
    return;
  }

  // ── PANEL: open passively if closed (the input-watcher in M6 also
  // handles this when the user types /belmont:auto, but command-path
  // dispatch from the panel skips that hook, so we belt-and-brace).
  if (ctx.hasUI) {
    // No way to read panel state from here — `openPassive` is idempotent.
    // Just call it; the M6 PanelController short-circuits when already
    // visible.
  }

  // ── CREATE THE WORKER ──────────────────────────────────────────────
  // §8.5 lifecycle contract: createBelmontWorker is paired with the
  // try/finally below — the dispose-finally test (test/dispose-finally.test.ts)
  // statically asserts this pairing.
  let worker: BelmontWorkerHandle;
  try {
    worker = deps.createWorker
      ? await deps.createWorker({
          cwd: ctx.cwd,
          modelRegistry: ctx.modelRegistry,
          initialModel,
          initialThinkingLevel: initialResolved.thinking,
        })
      : await createBelmontWorker({
          cwd: ctx.cwd,
          modelRegistry: ctx.modelRegistry,
          initialModel,
          initialThinkingLevel: initialResolved.thinking,
        });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Auto refused — worker construction failed: ${msg}`, "error");
    return;
  }

  // Worker → Runtime A stream pipe.
  const unsubscribeWorker = worker.subscribe((event) => {
    handleWorkerEvent(pi, event);
  });

  const startedAt = new Date().toISOString();
  activeAuto = {
    scope,
    cliOverrides,
    worker,
    paused: false,
    stopRequested: false,
    startedAt,
    currentMilestone: scope.kind === "milestone" ? scope.milestoneId : undefined,
  };
  await writeAutoJson(ctx.cwd, {
    currentMilestone: scope.kind === "milestone" ? scope.milestoneId : "(all)",
    paused: false,
    stopRequested: false,
    startedAt,
  });

  // Clear any stale stop sentinel from a prior aborted run.
  await consumeAutoStop(ctx.cwd);

  emitWorkerMessage(pi, {
    kind: "info",
    headline: `auto: started (${scope.kind === "milestone" ? scope.milestoneId : "all milestones"})`,
    details: {
      validate: validate.warnings.length > 0 ? `${validate.warnings.length} warnings` : "clean",
      reachable_tiers: doctor.reachableCount,
    },
  });

  // ── MAIN LOOP ──────────────────────────────────────────────────────
  try {
    let iterations = 0;
    let stuckCounter = 0;
    let lastStuckMilestone: string | undefined;

    while (iterations < MAX_ITERATIONS) {
      iterations += 1;
      if (await stopRequested(ctx.cwd)) break;
      while (activeAuto?.paused) {
        await sleep(500);
        if (await stopRequested(ctx.cwd)) break;
      }
      if (await stopRequested(ctx.cwd)) break;

      // Reload PROGRESS each iteration — belmont_transition just wrote
      // it, and (more importantly) the user may have edited it mid-auto.
      const milestones = await readMilestones(ctx.cwd);
      const steering = await consumeSteeringFile(ctx.cwd);

      const milestoneOverlay = await readMilestoneOverlay(
        ctx.cwd,
        scope.kind === "milestone" ? scope.milestoneId : undefined,
      );

      const decideInput: DecideInput = {
        scope,
        milestones,
        ...(steering ? { steeringText: steering } : {}),
      };
      let action = decideRules(decideInput);
      if (action.type === "stuck") {
        // §7.4 step 2 — AI fallback (in-process via the existing worker).
        const aiAction = await aiFallbackDecide(
          worker,
          decideInput,
          modelsJson,
          ctx.modelRegistry,
          cliOverrides,
        );
        if (aiAction && aiAction.type !== "stuck") {
          action = aiAction;
        }
      }
      if (action.type === "stuck") {
        if (lastStuckMilestone === scope.kind && stuckCounter >= STUCK_COUNTER_MAX) {
          emitWorkerMessage(pi, {
            kind: "abort",
            headline: `auto: stuck — ${action.reason}`,
            color: "warning",
          });
          break;
        }
        stuckCounter += 1;
        lastStuckMilestone = scope.kind;
        emitWorkerMessage(pi, {
          kind: "info",
          headline: `auto: idle — ${action.reason}`,
        });
        await sleep(300);
        continue;
      }
      stuckCounter = 0;

      if (action.type === "done") {
        emitWorkerMessage(pi, { kind: "info", headline: "auto: all eligible milestones verified" });
        break;
      }

      // Update widget + auto.json with the current task.
      const currentMilestone = "milestoneId" in action ? action.milestoneId : undefined;
      const currentTaskId = "taskId" in action ? action.taskId : undefined;
      activeAuto!.currentMilestone = currentMilestone ?? activeAuto!.currentMilestone;
      activeAuto!.currentTaskId = currentTaskId;
      await patchAutoJson(ctx.cwd, {
        currentMilestone: activeAuto!.currentMilestone ?? "(all)",
        ...(currentTaskId !== undefined ? { currentTaskId } : {}),
      });
      updateWidget(ctx, milestones, currentMilestone, currentTaskId, "implement", initialResolved.tier);

      // Branch on action type. Most flows route through the
      // implement-then-verify pair; the others end the iteration.
      if (action.type === "plan") {
        emitWorkerMessage(pi, {
          kind: "info",
          headline: `auto: plan needed (${action.reason}). Run /belmont:plan and re-launch /belmont:auto.`,
          color: "warning",
        });
        break;
      }

      if (action.type === "triage") {
        emitWorkerMessage(pi, {
          kind: "abort",
          headline: `auto: [!] blocked task ${action.milestoneId}/${action.taskId} — manual triage required.`,
        });
        break;
      }

      if (action.type === "verify") {
        await runVerifyMilestone(deps, worker, action.milestoneId, milestoneOverlay, milestones);
        continue;
      }

      // implement OR continue — both drive the implement-then-verify pair.
      if (action.type === "implement" || action.type === "continue") {
        await runImplementThenVerify(
          deps,
          worker,
          action.milestoneId,
          action.taskId,
          milestoneOverlay,
          modelsJson,
        );
        continue;
      }

      // consume_steer — already merged into the next iteration's
      // prompt-build via consumeSteeringFile + decideRules. Just log.
      emitWorkerMessage(pi, {
        kind: "info",
        headline: `auto: consumed steering (${action.text.length} chars)`,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    emitWorkerMessage(pi, { kind: "abort", headline: `auto: error — ${msg}`, color: "error" });
  } finally {
    unsubscribeWorker();
    await worker.dispose();
    activeAuto = null;
    if (ctx.hasUI) clearAutoProgressWidget(ctx);
    await clearAutoJson(ctx.cwd);
    await consumeAutoStop(ctx.cwd);
    emitWorkerMessage(pi, { kind: "info", headline: "auto: stopped" });
  }
}

// ────────────────────────────────────────────────────────────────────
// Per-task implement-then-verify
// ────────────────────────────────────────────────────────────────────

async function runImplementThenVerify(
  deps: RunAutoDeps,
  worker: BelmontWorkerHandle,
  milestoneId: string,
  taskId: string,
  milestoneOverlay: OverlayTokens | null,
  modelsJson: ModelsJson,
): Promise<void> {
  const { ctx, pi, cliOverrides = {} } = deps;
  const impl = resolveTier(modelsJson, "implementation", {
    milestoneOverlay,
    cliOverrides,
  });
  const verify = resolveTier(modelsJson, "verification", {
    milestoneOverlay,
    cliOverrides,
  });

  // ── IMPLEMENT ────────────────────────────────────────────────────
  const implModel = findModel(ctx.modelRegistry, impl);
  if (!implModel) {
    emitWorkerMessage(pi, {
      kind: "abort",
      headline: `auto: skip ${milestoneId}/${taskId} — no Model for impl tier (${impl.provider}/${impl.model})`,
      color: "error",
    });
    return;
  }
  await worker.newSession({ model: implModel, thinkingLevel: impl.thinking });
  emitPhaseStart(pi, "implement", milestoneId, taskId, impl, worker.currentSessionId());

  await maybeTransition(ctx, milestoneId, taskId, "in_progress");
  await writePhaseEpisode(ctx.cwd, milestoneId, taskId, "implement", impl, worker.currentSessionId());

  const implPrompt = buildImplementPrompt(ctx.cwd, milestoneId, taskId);
  const implOutcome = await runPhaseWithWatchdog(worker, implPrompt);
  emitPhaseEnd(pi, "implement", milestoneId, taskId, implOutcome);

  if (implOutcome.outcome !== "ok") {
    await writePhaseEpisode(
      ctx.cwd,
      milestoneId,
      taskId,
      "implement",
      impl,
      worker.currentSessionId(),
      implOutcome.outcome,
      implOutcome.message,
    );
    return;
  }

  // Transition to done. Direct PROGRESS.md edits are blocked by the
  // knowledge-guard; transitions go through executeBelmontTransition.
  await maybeTransition(ctx, milestoneId, taskId, "done");

  // ── VERIFY ───────────────────────────────────────────────────────
  const verifyModel = findModel(ctx.modelRegistry, verify);
  if (!verifyModel) {
    emitWorkerMessage(pi, {
      kind: "abort",
      headline: `auto: skip verify ${milestoneId}/${taskId} — no Model for verify tier`,
      color: "error",
    });
    return;
  }
  await worker.newSession({ model: verifyModel, thinkingLevel: verify.thinking });
  emitPhaseStart(pi, "verify", milestoneId, taskId, verify, worker.currentSessionId());

  await writePhaseEpisode(ctx.cwd, milestoneId, taskId, "verify", verify, worker.currentSessionId());
  const verifyPrompt = buildVerifyPrompt(ctx.cwd, milestoneId, taskId);
  const verifyOutcome = await runPhaseWithWatchdog(worker, verifyPrompt);
  emitPhaseEnd(pi, "verify", milestoneId, taskId, verifyOutcome);

  const evidence = parseEvidencePath(verifyOutcome.lastAssistantText);
  if (verifyOutcome.outcome === "ok" && evidence) {
    await maybeTransition(ctx, milestoneId, taskId, "verified", evidence);
  }
  await writePhaseEpisode(
    ctx.cwd,
    milestoneId,
    taskId,
    "verify",
    verify,
    worker.currentSessionId(),
    verifyOutcome.outcome,
    evidence ?? verifyOutcome.message,
  );
}

async function runVerifyMilestone(
  deps: RunAutoDeps,
  worker: BelmontWorkerHandle,
  milestoneId: string,
  milestoneOverlay: OverlayTokens | null,
  milestones: Milestone[],
): Promise<void> {
  const m = milestones.find((x) => x.id === milestoneId);
  if (!m) return;
  for (const t of m.tasks) {
    if (t.state !== "done") continue;
    const cached = getCachedModelsJson();
    if (!cached?.ok) return;
    await runImplementThenVerify(deps, worker, milestoneId, t.id, milestoneOverlay, cached.data);
  }
}

// ────────────────────────────────────────────────────────────────────
// Phase runner with watchdog (§7.5)
// ────────────────────────────────────────────────────────────────────

export type PhaseOutcome = {
  outcome: "ok" | "failed" | "aborted";
  message?: string;
  lastAssistantText: string;
};

async function runPhaseWithWatchdog(
  worker: BelmontWorkerHandle,
  prompt: string,
): Promise<PhaseOutcome> {
  let lastAssistantText = "";
  let lastOutputAt = Date.now();
  let aborted = false;
  let abortReason = "";

  const unsub = worker.subscribe((ev) => {
    if (ev.type === "text") {
      lastAssistantText = ev.content;
      lastOutputAt = Date.now();
    } else if (ev.type === "tool_call" || ev.type === "tool_result") {
      lastOutputAt = Date.now();
    } else if (ev.type === "abort") {
      aborted = true;
      abortReason = ev.reason;
    }
  });

  const ceilingTimer = setTimeoutFn(() => {
    abortReason = "watchdog-5min ceiling";
    aborted = true;
    void worker.abortCurrent();
  }, PHASE_WATCHDOG_MS);

  const noOutputTimer: NodeJS.Timeout = setInterval(() => {
    if (Date.now() - lastOutputAt > NO_OUTPUT_MS) {
      abortReason = "no-output-30s timeout";
      aborted = true;
      void worker.abortCurrent();
      clearInterval(noOutputTimer);
    }
  }, 5000);

  try {
    await worker.promptCurrent(prompt);
    if (aborted) {
      return { outcome: "aborted", message: abortReason, lastAssistantText };
    }
    return { outcome: "ok", lastAssistantText };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { outcome: "failed", message: msg, lastAssistantText };
  } finally {
    clearTimeout(ceilingTimer);
    clearInterval(noOutputTimer);
    unsub();
  }
}

// ────────────────────────────────────────────────────────────────────
// AI-fallback decide (§7.4 step 2)
// ────────────────────────────────────────────────────────────────────

async function aiFallbackDecide(
  worker: BelmontWorkerHandle,
  decideInput: DecideInput,
  modelsJson: ModelsJson,
  modelRegistry: ModelRegistry,
  cliOverrides: TierOverrideMap,
): Promise<DecisionAction | undefined> {
  const tier = resolveTier(modelsJson, "next", { cliOverrides });
  const model = findModel(modelRegistry, tier);
  if (!model) return undefined;
  try {
    await worker.newSession({ model, thinkingLevel: tier.thinking });
    const prompt = buildDecidePrompt(decideInput);
    const outcome = await runPhaseWithWatchdog(worker, prompt);
    if (outcome.outcome !== "ok") return undefined;
    return parseDecideResponse(outcome.lastAssistantText);
  } catch {
    return undefined;
  }
}

export function buildDecidePrompt(input: DecideInput): string {
  const lines: string[] = [];
  lines.push(
    "You are Belmont's decide-fallback. The rules ladder produced 'stuck'. Look at the milestone snapshot below and answer with a SINGLE JSON object only — no surrounding prose.",
  );
  lines.push("");
  lines.push(
    `Schema: {"type":"plan|triage|continue|verify|implement|done|stuck","milestoneId"?:string,"taskId"?:string,"reason"?:string}`,
  );
  lines.push("");
  lines.push("Snapshot:");
  for (const m of scopeMilestones(input.milestones, input.scope)) {
    lines.push(`  ${m.id}: ${m.name} (status=${m.status})`);
    for (const t of m.tasks) {
      lines.push(`    ${t.state.padEnd(11)} ${t.id} ${t.name}`);
    }
  }
  lines.push("");
  lines.push("Respond with ONLY the JSON object.");
  return lines.join("\n");
}

export function parseDecideResponse(text: string): DecisionAction | undefined {
  if (!text) return undefined;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  const json = text.slice(start, end + 1);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const type = parsed.type;
  if (typeof type !== "string") return undefined;
  const milestoneId = typeof parsed.milestoneId === "string" ? parsed.milestoneId : undefined;
  const taskId = typeof parsed.taskId === "string" ? parsed.taskId : undefined;
  const reason = typeof parsed.reason === "string" ? parsed.reason : "ai-fallback";

  switch (type) {
    case "plan":
      return { type: "plan", reason };
    case "triage":
      if (!milestoneId || !taskId) return undefined;
      return { type: "triage", milestoneId, taskId };
    case "continue":
      if (!milestoneId || !taskId) return undefined;
      return { type: "continue", milestoneId, taskId };
    case "verify":
      if (!milestoneId) return undefined;
      return { type: "verify", milestoneId };
    case "implement":
      if (!milestoneId || !taskId) return undefined;
      return { type: "implement", milestoneId, taskId };
    case "done":
      return { type: "done" };
    case "stuck":
      return { type: "stuck", reason };
    default:
      return undefined;
  }
}

// ────────────────────────────────────────────────────────────────────
// Prompt builders (pure)
// ────────────────────────────────────────────────────────────────────

export function buildImplementPrompt(
  _cwd: string,
  milestoneId: string,
  taskId: string,
): string {
  return [
    `Belmont auto-mode is implementing ${milestoneId}/${taskId}.`,
    "",
    `Run /belmont:implement ${taskId}.`,
    "",
    "When the work is complete and committed, call belmont_transition to move the task to 'done'. Do not edit PROGRESS.md directly — that path is blocked.",
  ].join("\n");
}

export function buildVerifyPrompt(
  _cwd: string,
  milestoneId: string,
  taskId: string,
): string {
  return [
    `Belmont auto-mode is verifying ${milestoneId}/${taskId}.`,
    "",
    `Run /belmont:verify ${taskId}. When you've confirmed the work is correct, call belmont_transition with to='verified' and evidence_path set to the artefact path that proves it.`,
    "",
    "If verification fails, surface the failure in your final assistant message and do NOT mark the task verified.",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Worker event → Runtime A stream
// ────────────────────────────────────────────────────────────────────

function handleWorkerEvent(pi: ExtensionAPI, event: WorkerEvent): void {
  switch (event.type) {
    case "phase_start":
      emitWorkerMessage(pi, {
        kind: "phase_start",
        headline: `${event.milestoneId}/${event.taskId} ${event.phase} → session ${shortSessionId(event.sessionId)} (${event.tier})`,
        details: {
          phase: event.phase,
          milestone: event.milestoneId,
          task: event.taskId,
          tier: event.tier,
          session: event.sessionId,
        },
      });
      return;
    case "phase_end":
      emitWorkerMessage(pi, {
        kind: "phase_end",
        headline:
          event.outcome === "ok"
            ? `${event.milestoneId}/${event.taskId} ${event.phase} ✓${event.evidencePath ? ` [${event.evidencePath}]` : ""}`
            : `${event.milestoneId}/${event.taskId} ${event.phase} ✗ (${event.outcome}${event.message ? `: ${event.message}` : ""})`,
        color: event.outcome === "ok" ? "success" : "error",
        details: {
          phase: event.phase,
          outcome: event.outcome,
          ...(event.message ? { message: event.message } : {}),
          ...(event.evidencePath ? { evidence: event.evidencePath } : {}),
        },
      });
      return;
    case "text":
      if (!event.partial) {
        emitWorkerMessage(pi, {
          kind: "text",
          headline: previewLine(event.content),
          body: event.content,
        });
      }
      return;
    case "tool_call":
      emitWorkerMessage(pi, {
        kind: "tool_call",
        headline: `${event.toolName} ${event.argsPreview}`,
      });
      return;
    case "tool_result":
      // De-noised by default — only surface tool errors to the panel
      // stream; successful tool results would dominate the buffer.
      if (event.isError) {
        emitWorkerMessage(pi, {
          kind: "tool_result",
          headline: `${event.toolName} ✗ (tool error)`,
          color: "error",
        });
      }
      return;
    case "abort":
      emitWorkerMessage(pi, { kind: "abort", headline: `aborted: ${event.reason}` });
      return;
  }
}

function emitPhaseStart(
  pi: ExtensionAPI,
  phase: "implement" | "verify" | "decide",
  milestoneId: string,
  taskId: string,
  tier: ResolvedTier,
  sessionId: string | undefined,
): void {
  const tierStr = formatTierLabel(tier);
  emitWorkerMessage(pi, {
    kind: "phase_start",
    headline: `${milestoneId}/${taskId} ${phase} → session ${shortSessionId(sessionId)} (${tierStr})`,
    details: {
      phase,
      provider: tier.provider,
      model: tier.model,
      thinking: tier.thinking,
      tier: tier.tier,
      source: tier.source,
      ...(sessionId ? { session: sessionId } : {}),
    },
  });
}

function emitPhaseEnd(
  pi: ExtensionAPI,
  phase: "implement" | "verify" | "decide",
  milestoneId: string,
  taskId: string,
  outcome: PhaseOutcome,
): void {
  emitWorkerMessage(pi, {
    kind: "phase_end",
    headline:
      outcome.outcome === "ok"
        ? `${milestoneId}/${taskId} ${phase} ✓`
        : `${milestoneId}/${taskId} ${phase} ✗ (${outcome.outcome}${outcome.message ? `: ${outcome.message}` : ""})`,
    color: outcome.outcome === "ok" ? "success" : "error",
    details: {
      phase,
      outcome: outcome.outcome,
      ...(outcome.message ? { message: outcome.message } : {}),
    },
  });
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

async function readMilestones(cwd: string): Promise<Milestone[]> {
  try {
    const md = await readFile(join(cwd, ".belmont", "PROGRESS.md"), "utf8");
    return parseProgress(md).milestones;
  } catch {
    return [];
  }
}

async function readMilestoneOverlay(
  cwd: string,
  milestoneId: string | undefined,
): Promise<OverlayTokens | null> {
  if (!milestoneId) return null;
  try {
    const md = await readFile(join(cwd, ".belmont", "PROGRESS.md"), "utf8");
    return parseMilestoneOverlay(md, milestoneId).overlay;
  } catch {
    return null;
  }
}

async function stopRequested(cwd: string): Promise<boolean> {
  if (activeAuto?.stopRequested) return true;
  if (await autoStopExists(cwd)) {
    if (activeAuto) activeAuto.stopRequested = true;
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeoutFn(resolve, ms));
}

function findModel(
  registry: ModelRegistry,
  tier: ResolvedTier,
): Model<Api> | undefined {
  return registry.find(tier.provider, tier.model);
}

function shortSessionId(id: string | undefined): string {
  if (!id) return "??";
  return id.length <= 8 ? id : id.slice(0, 8);
}

export function formatTierLabel(tier: ResolvedTier): string {
  const thinking = tier.thinking ? `:${tier.thinking}` : "";
  return `${tier.tier}+${tier.provider}/${tier.model}${thinking}`;
}

export function previewLine(text: string, max = 80): string {
  const first = text.split("\n", 1)[0] ?? "";
  if (first.length <= max) return first;
  return `${first.slice(0, max - 1)}…`;
}

export function parseEvidencePath(text: string): string | undefined {
  // Verify-prompt asks the model to call belmont_transition with
  // evidence_path; if it didn't, look for an "evidence_path: X" or
  // "evidence: X" hint at the tail of the message.
  const m = text.match(/evidence(?:_path)?[:=]\s*([^\s,]+)/i);
  return m?.[1];
}

async function maybeTransition(
  ctx: ExtensionCommandContext,
  milestoneId: string,
  taskId: string,
  to: "in_progress" | "done" | "verified",
  evidencePath?: string,
): Promise<void> {
  try {
    await executeBelmontTransition(ctx.cwd, {
      milestone_id: milestoneId,
      task_id: taskId,
      to,
      ...(evidencePath ? { evidence_path: evidencePath } : {}),
    });
  } catch (err: unknown) {
    // Don't crash the loop on a noop / already-in-state transition —
    // applyTransition surfaces those as ok with noop=true, so the only
    // errors here are bad inputs (unknown task etc.) which we log.
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`belmont_transition refused: ${msg}`, "warning");
  }
}

async function writePhaseEpisode(
  cwd: string,
  milestoneId: string,
  taskId: string,
  phase: "implement" | "verify",
  tier: ResolvedTier,
  sessionId: string | undefined,
  outcome?: "ok" | "failed" | "aborted",
  detail?: string,
): Promise<void> {
  const parts: string[] = [];
  parts.push(`${phase} (tier=${formatTierLabel(tier)}`);
  if (sessionId) parts.push(`session=${shortSessionId(sessionId)}`);
  parts.push(`source=${tier.source})`);
  if (outcome) parts.push(`outcome=${outcome}`);
  if (detail) parts.push(detail);
  await appendOrCreateEpisode({
    cwd,
    slug: "auto-phases",
    kind: "phase",
    taskId: `${milestoneId}/${taskId}`,
    content: parts.join(" — "),
  });
}

function updateWidget(
  ctx: ExtensionCommandContext,
  milestones: Milestone[],
  currentMilestone: string | undefined,
  currentTaskId: string | undefined,
  role: string,
  tierName: string,
): void {
  if (!ctx.hasUI) return;
  const m = milestones.find((x) => x.id === currentMilestone);
  if (!m) return;
  const completed = m.tasks.filter((t) => t.state === "verified").length;
  setAutoProgressWidget(ctx, {
    milestoneId: m.id,
    completed,
    total: m.tasks.length,
    ...(currentTaskId ? { currentTaskId } : {}),
    role,
    tier: tierName,
    steerable: true,
  });
}

// Re-export the widget-format helper here so commands/auto.ts can pin
// its output without re-importing from tui/.
export { formatAutoWidget, WORKER_CUSTOM_TYPE };
export type { ResolvedTier };
// Re-export the role union so command parsers can declare it.
export type Role = AgentRole;
