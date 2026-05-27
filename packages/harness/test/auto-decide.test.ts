// auto/decide.ts — rules ladder (v2.3 §7.4 step 1).

import { parseProgress } from "@belmont/knowledge-schema";
import { describe, expect, it } from "vitest";

import {
  decideNextAction,
  decideRules,
  eligibleTasksInOrder,
  findTask,
  isValidDecision,
  markerLabel,
} from "../src/auto/decide.js";

const SAMPLE_FRESH = `# PROGRESS

### M1: Foo

- [ ] P0-1 First task
- [ ] P0-2 Second task
`;

const SAMPLE_INFLIGHT = `# PROGRESS

### M1: Foo

- [x] P0-1 Done task
- [>] P0-2 In flight
- [ ] P0-3 Pending
`;

const SAMPLE_ALL_DONE = `# PROGRESS

### M1: Foo

- [x] P0-1 Done
- [x] P0-2 Done
`;

const SAMPLE_VERIFIED = `# PROGRESS

### M1: Foo

- [v] P0-1 Verified
- [v] P0-2 Verified
`;

const SAMPLE_BLOCKED = `# PROGRESS

### M1: Foo

- [!] P0-1 Blocked!
- [ ] P0-2 Pending
`;

const SAMPLE_MULTI = `# PROGRESS

### M1: Done

- [v] P0-1 Verified

### M2: Mixed

- [x] P0-1 Done
- [ ] P0-2 Pending
`;

describe("decideRules", () => {
  it("consumes steering before anything else", () => {
    const milestones = parseProgress(SAMPLE_FRESH).milestones;
    const action = decideRules({
      scope: { kind: "milestone", milestoneId: "M1" },
      milestones,
      steeringText: "use the existing model",
    });
    expect(action).toEqual({ type: "consume_steer", text: "use the existing model" });
  });

  it("picks 'plan' when scope has no milestones", () => {
    const action = decideRules({
      scope: { kind: "milestone", milestoneId: "M99" },
      milestones: parseProgress(SAMPLE_FRESH).milestones,
    });
    expect(action.type).toBe("plan");
  });

  it("picks 'done' when every task in scope is verified", () => {
    const milestones = parseProgress(SAMPLE_VERIFIED).milestones;
    const action = decideRules({ scope: { kind: "milestone", milestoneId: "M1" }, milestones });
    expect(action).toEqual({ type: "done" });
  });

  it("picks 'triage' when a [!] blocked task exists", () => {
    const milestones = parseProgress(SAMPLE_BLOCKED).milestones;
    const action = decideRules({ scope: { kind: "milestone", milestoneId: "M1" }, milestones });
    expect(action).toEqual({ type: "triage", milestoneId: "M1", taskId: "P0-1" });
  });

  it("picks 'continue' when a [>] in-flight task exists", () => {
    const milestones = parseProgress(SAMPLE_INFLIGHT).milestones;
    const action = decideRules({ scope: { kind: "milestone", milestoneId: "M1" }, milestones });
    expect(action).toEqual({ type: "continue", milestoneId: "M1", taskId: "P0-2" });
  });

  it("picks 'verify' when all tasks are [x] but not yet verified", () => {
    const milestones = parseProgress(SAMPLE_ALL_DONE).milestones;
    const action = decideRules({ scope: { kind: "milestone", milestoneId: "M1" }, milestones });
    expect(action).toEqual({ type: "verify", milestoneId: "M1" });
  });

  it("picks 'implement' on the first [ ] in source order", () => {
    const milestones = parseProgress(SAMPLE_FRESH).milestones;
    const action = decideRules({ scope: { kind: "milestone", milestoneId: "M1" }, milestones });
    expect(action).toEqual({ type: "implement", milestoneId: "M1", taskId: "P0-1" });
  });

  it("skips already-verified milestones in scope:all mode", () => {
    const milestones = parseProgress(SAMPLE_MULTI).milestones;
    const action = decideRules({ scope: { kind: "all" }, milestones });
    // M2 has a done + pending — verify wins for the pending eventually,
    // but FIRST: M2 has both done and pending, no all-x-not-v match,
    // so implement on M2/P0-2.
    expect(action).toEqual({ type: "implement", milestoneId: "M2", taskId: "P0-2" });
  });
});

describe("decideNextAction (AI fallback wrapper)", () => {
  it("returns the rules result when not stuck", async () => {
    const milestones = parseProgress(SAMPLE_FRESH).milestones;
    const action = await decideNextAction({
      scope: { kind: "milestone", milestoneId: "M1" },
      milestones,
    });
    expect(action.type).toBe("implement");
  });

  it("invokes aiFallback ONLY when rules return 'stuck'", async () => {
    let callCount = 0;
    const fallback = async (): Promise<undefined> => {
      callCount += 1;
      return undefined;
    };
    const milestones = parseProgress(SAMPLE_FRESH).milestones;
    await decideNextAction(
      { scope: { kind: "milestone", milestoneId: "M1" }, milestones },
      fallback,
    );
    expect(callCount).toBe(0);
  });

  it("returns the AI fallback's decision when rules are stuck", async () => {
    // Empty-tasks milestone in scope → rules hit 'stuck'.
    const milestones = parseProgress("# PROGRESS\n\n### M9: Empty\n").milestones;
    const fallback = async () => ({ type: "implement" as const, milestoneId: "M9", taskId: "P0-1" });
    const action = await decideNextAction(
      { scope: { kind: "milestone", milestoneId: "M9" }, milestones },
      fallback,
    );
    expect(action).toEqual({ type: "implement", milestoneId: "M9", taskId: "P0-1" });
  });

  it("falls back to rules-stuck when AI fallback returns an invalid decision", async () => {
    const milestones = parseProgress("# PROGRESS\n\n### M9: Empty\n").milestones;
    const fallback = async () =>
      ({ type: "implement", milestoneId: "", taskId: "P0-1" }) as unknown as
        Awaited<ReturnType<NonNullable<Parameters<typeof decideNextAction>[1]>>>;
    const action = await decideNextAction(
      { scope: { kind: "milestone", milestoneId: "M9" }, milestones },
      fallback,
    );
    expect(action.type).toBe("stuck");
  });
});

describe("helpers", () => {
  it("eligibleTasksInOrder lists non-verified tasks in declaration order", () => {
    const milestones = parseProgress(SAMPLE_INFLIGHT).milestones;
    const tasks = eligibleTasksInOrder(milestones, { kind: "milestone", milestoneId: "M1" });
    expect(tasks.map((t) => t.id)).toEqual(["P0-1", "P0-2", "P0-3"]);
  });

  it("findTask returns the matched task or undefined", () => {
    const milestones = parseProgress(SAMPLE_INFLIGHT).milestones;
    expect(findTask(milestones, "M1", "P0-2")?.state).toBe("in_progress");
    expect(findTask(milestones, "M1", "P9-9")).toBeUndefined();
  });

  it("markerLabel maps task states to the M2 markers", () => {
    expect(markerLabel("todo")).toBe("[ ]");
    expect(markerLabel("in_progress")).toBe("[>]");
    expect(markerLabel("done")).toBe("[x]");
    expect(markerLabel("verified")).toBe("[v]");
    expect(markerLabel("blocked")).toBe("[!]");
  });

  it("isValidDecision rejects malformed AI fallback responses", () => {
    expect(isValidDecision({ type: "implement", milestoneId: "", taskId: "P0-1" })).toBe(false);
    expect(isValidDecision({ type: "verify", milestoneId: "" })).toBe(false);
    expect(isValidDecision({ type: "done" })).toBe(true);
    expect(isValidDecision({ type: "plan", reason: "x" })).toBe(true);
  });
});
