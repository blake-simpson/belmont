import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  computeMilestoneStatus,
  parseProgress,
  replaceMarkerAtLine,
  serializeProgress,
  KNOWN_MARKERS,
  STATE_TO_MARKER,
} from "../src/progress.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

async function load(name: string): Promise<string> {
  return await readFile(join(FIXTURES, name), "utf8");
}

describe("parseProgress — fixtures", () => {
  it("parses the empty fixture as zero milestones", async () => {
    const md = await load("v1-empty.md");
    const { milestones, warnings } = parseProgress(md);
    expect(milestones).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("parses the v1 vanilla fixture (3 milestones, mixed states)", async () => {
    const md = await load("v1-vanilla.md");
    const { milestones } = parseProgress(md);
    expect(milestones).toHaveLength(3);
    const ids = milestones.map((m) => m.id);
    expect(ids).toEqual(["M0", "M1", "M2"]);
    expect(milestones[0]?.status).toBe("done");
    expect(milestones[1]?.status).toBe("done");
    expect(milestones[2]?.status).toBe("not_started");
  });

  it("parses all 5 markers with correct state mapping", async () => {
    const md = await load("v1-all-markers.md");
    const { milestones } = parseProgress(md);
    const ms = milestones[0];
    expect(ms).toBeDefined();
    expect(ms?.tasks.map((t) => t.state)).toEqual([
      "todo",
      "in_progress",
      "done",
      "verified",
      "blocked",
    ]);
    expect(ms?.tasks.map((t) => t.marker)).toEqual([" ", ">", "x", "v", "!"]);
  });

  it("computes milestone status as blocked when any task is [!]", async () => {
    const md = await load("v1-all-markers.md");
    const { milestones } = parseProgress(md);
    expect(milestones[0]?.status).toBe("blocked");
  });

  it("computes verified status only when ALL tasks are [v]", () => {
    const { milestones } = parseProgress(
      "# PROGRESS\n\n### M1: All verified\n- [v] P0-1 a\n- [v] P0-2 b\n",
    );
    expect(milestones[0]?.status).toBe("verified");
  });

  it("computes done status when mix of [x] and [v]", () => {
    const { milestones } = parseProgress(
      "# PROGRESS\n\n### M1: Done\n- [x] P0-1 a\n- [v] P0-2 b\n",
    );
    expect(milestones[0]?.status).toBe("done");
  });

  it("computes not_started when ALL tasks are [ ]", () => {
    const { milestones } = parseProgress(
      "# PROGRESS\n\n### M1: New\n- [ ] P0-1 a\n- [ ] P0-2 b\n",
    );
    expect(milestones[0]?.status).toBe("not_started");
  });

  it("computes in_progress when mixed states without blockers", () => {
    const { milestones } = parseProgress(
      "# PROGRESS\n\n### M1: Mixed\n- [ ] P0-1 a\n- [x] P0-2 b\n",
    );
    expect(milestones[0]?.status).toBe("in_progress");
  });

  it("parses legacy v0.10.7 vanilla template with deps annotations + colon-form task IDs", async () => {
    const md = await load("legacy-v0.10.7-vanilla.md");
    const { milestones } = parseProgress(md);
    expect(milestones).toHaveLength(4);
    expect(milestones[0]?.id).toBe("M1");
    expect(milestones[0]?.deps).toEqual([]);
    expect(milestones[1]?.deps).toEqual(["M1"]);
    expect(milestones[3]?.deps).toEqual(["M2", "M3"]);
    // The level-2 `## Session History` heading must close the M4 block, so
    // legacy `## Decisions Log` content doesn't pollute it.
    const m4 = milestones[3];
    expect(m4?.tasks).toHaveLength(1);
    expect(m4?.tasks[0]?.id).toBe("P1-1");
  });

  it("parses legacy emoji-prefixed headers and emits warnings (does not strip silently)", async () => {
    const md = await load("legacy-v0.10.7-emoji-header.md");
    const { milestones, warnings } = parseProgress(md);
    expect(milestones).toHaveLength(4);
    expect(milestones.every((m) => m.hadEmojiPrefix)).toBe(true);
    expect(warnings.filter((w) => w.code === "PROGRESS_EMOJI_HEADER")).toHaveLength(4);
  });

  it("parses HTML-comment milestone overlays as raw strings", async () => {
    const md = await load("v1-overlay.md");
    const { milestones } = parseProgress(md);
    expect(milestones[0]?.overlay).toBe(
      "implementation=high+anthropic/claude-sonnet-4-6 verification=high",
    );
    expect(milestones[0]?.overlayLineIndex).not.toBeNull();
    expect(milestones[1]?.overlay).toBe(
      "implementation=high design=high+anthropic/claude-opus-4-7",
    );
  });

  it("parses task IDs in both colon-form (legacy) and space-form (v1.0)", () => {
    const md = "# PROGRESS\n\n### M1: Both\n- [ ] P0-1: legacy colon form\n- [ ] P0-2 v1 space form\n";
    const { milestones } = parseProgress(md);
    expect(milestones[0]?.tasks[0]?.id).toBe("P0-1");
    expect(milestones[0]?.tasks[0]?.name).toBe("legacy colon form");
    expect(milestones[0]?.tasks[1]?.id).toBe("P0-2");
    expect(milestones[0]?.tasks[1]?.name).toBe("v1 space form");
  });

  it("emits warnings for unknown markers and falls back to todo", async () => {
    const md = await load("v1-malformed.md");
    const { milestones, warnings } = parseProgress(md);
    expect(warnings.some((w) => w.code === "PROGRESS_UNKNOWN_MARKER")).toBe(true);
    const m1Tasks = milestones[0]?.tasks ?? [];
    const unknown = m1Tasks.find((t) => t.marker === "?");
    expect(unknown?.state).toBe("todo");
  });

  it("handles stray paragraphs between tasks without losing milestone scope", async () => {
    const md = await load("v1-malformed.md");
    const { milestones } = parseProgress(md);
    const m1 = milestones[0];
    const verifiedAfter = m1?.tasks.find((t) => t.id === "P0-3");
    expect(verifiedAfter?.state).toBe("verified");
  });

  it("preserves source bytes for round-trip (replaceMarkerAtLine touches only the marker char)", async () => {
    const md = await load("v1-vanilla.md");
    const { milestones } = parseProgress(md);
    const target = milestones[2]?.tasks[0];
    expect(target).toBeDefined();
    expect(target?.marker).toBe(" ");
    const rewritten = replaceMarkerAtLine(md, target!.lineIndex, "x");
    expect(rewritten).not.toBeNull();
    // Length must match — single-char replacement, never length-changing.
    expect(rewritten!.length).toBe(md.length);
    // Only one character should differ.
    let differing = 0;
    for (let i = 0; i < md.length; i++) {
      if (md[i] !== rewritten![i]) differing++;
    }
    expect(differing).toBe(1);
  });

  it("returns null when replaceMarkerAtLine targets a non-task line", () => {
    const md = "# PROGRESS\n\n### M1: Empty\n";
    expect(replaceMarkerAtLine(md, 0, "x")).toBeNull();
    expect(replaceMarkerAtLine(md, 99, "x")).toBeNull();
  });

  it("computeMilestoneStatus on an empty task list returns not_started", () => {
    expect(computeMilestoneStatus([])).toBe("not_started");
  });

  it("serializeProgress is the identity on the source string", () => {
    const md = "# PROGRESS\n\n### M1: x\n- [ ] P0-1 t\n";
    const parsed = parseProgress(md);
    expect(serializeProgress(parsed)).toBe(md);
  });

  it("exposes KNOWN_MARKERS and STATE_TO_MARKER covering all 5 states", () => {
    expect(KNOWN_MARKERS.sort()).toEqual([" ", "!", ">", "v", "x"].sort());
    expect(STATE_TO_MARKER.todo).toBe(" ");
    expect(STATE_TO_MARKER.in_progress).toBe(">");
    expect(STATE_TO_MARKER.done).toBe("x");
    expect(STATE_TO_MARKER.verified).toBe("v");
    expect(STATE_TO_MARKER.blocked).toBe("!");
  });

  it("level-2 heading INSIDE a milestone block closes that milestone", () => {
    const md = [
      "# PROGRESS",
      "",
      "### M1: First",
      "- [ ] P0-1 task one",
      "",
      "## Session History",
      "",
      "### M2: Should still parse after level-2 boundary",
      "- [ ] P0-1 task two",
      "",
    ].join("\n");
    const { milestones } = parseProgress(md);
    expect(milestones.map((m) => m.id)).toEqual(["M1", "M2"]);
    expect(milestones[0]?.tasks).toHaveLength(1);
    expect(milestones[1]?.tasks).toHaveLength(1);
  });
});
