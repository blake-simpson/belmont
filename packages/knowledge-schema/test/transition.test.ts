import { describe, expect, it } from "vitest";

import { parseProgress } from "../src/progress.js";
import { applyTransition } from "../src/transition.js";

function fixtureMd(): string {
  return [
    "# PROGRESS",
    "",
    "### M1: Bootstrap",
    "- [ ] P0-1 Set up",
    "- [>] P0-2 In progress",
    "",
    "### M2: Schema",
    "- [x] P0-1 Done not yet verified",
    "- [!] P0-2 Blocked",
    "",
  ].join("\n");
}

describe("applyTransition — happy paths", () => {
  it("flips [ ] → [>] and returns previous=todo, next=in_progress", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "in_progress",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previous).toBe("todo");
    expect(r.next).toBe("in_progress");
    expect(r.noop).toBe(false);
    // The rewritten markdown should parse with P0-1 now in_progress.
    const after = parseProgress(r.markdown);
    const task = after.milestones[0]?.tasks.find((t) => t.id === "P0-1");
    expect(task?.state).toBe("in_progress");
  });

  it("flips [x] → [v] when evidence_path is provided", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M2",
      task_id: "P0-1",
      to: "verified",
      evidence_path: "src/foo.ts",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previous).toBe("done");
    expect(r.next).toBe("verified");
  });

  it("flips [>] → [x] (in_progress → done)", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P0-2",
      to: "done",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previous).toBe("in_progress");
    expect(r.next).toBe("done");
  });

  it("flips [!] → [>] (blocked → in_progress)", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M2",
      task_id: "P0-2",
      to: "in_progress",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previous).toBe("blocked");
    expect(r.next).toBe("in_progress");
  });

  it("is a no-op when target state matches current state", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P0-2",
      to: "in_progress",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.noop).toBe(true);
    expect(r.markdown).toBe(md);
  });

  it("preserves every byte except the single marker char", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "done",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown.length).toBe(md.length);
    let differing = 0;
    for (let i = 0; i < md.length; i++) {
      if (md[i] !== r.markdown[i]) differing++;
    }
    expect(differing).toBe(1);
  });
});

describe("applyTransition — error paths", () => {
  it("rejects to=verified without evidence_path (EVIDENCE_REQUIRED)", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M2",
      task_id: "P0-1",
      to: "verified",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("EVIDENCE_REQUIRED");
    expect(r.message).toBe("evidence_path is required for [v]");
  });

  it("rejects an unknown milestone id", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M99",
      task_id: "P0-1",
      to: "in_progress",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("UNKNOWN_MILESTONE");
  });

  it("rejects an unknown task id", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P99-99",
      to: "in_progress",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("UNKNOWN_TASK");
  });

  it("rejects an invalid target state value", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P0-1",
      // @ts-expect-error — intentional misuse for runtime guard.
      to: "bogus",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_STATE");
  });

  it("can transition to blocked", () => {
    const md = fixtureMd();
    const r = applyTransition(md, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "blocked",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next).toBe("blocked");
  });

  it("supports back-transitions ([v] → [x])", () => {
    const md = fixtureMd().replace("- [x] P0-1 Done", "- [v] P0-1 Done");
    const r = applyTransition(md, {
      milestone_id: "M2",
      task_id: "P0-1",
      to: "done",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previous).toBe("verified");
    expect(r.next).toBe("done");
  });
});
