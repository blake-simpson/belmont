// knowledge-guard hook — verifies the tool_call gate blocks the right
// things (PROGRESS direct writes, BELMONT.md ≤400 cap, preferences.md
// ≤60 cap, steering/ zone) and lets project code through.
//
// The rejection envelope is asserted as parsed JSON so changes to the
// formatting don't silently break clients that consume it.

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { knowledgeGuardForEvent } from "../src/hooks/knowledge-guard.js";

let TMP = "";

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "belmont-knowledge-guard-test-"));
  await mkdir(join(TMP, ".belmont", "memory", "decisions"), { recursive: true });
});
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

const ctx = (cwd: string) => ({ cwd, hasUI: false });

// Helper: build a synthetic write/edit tool_call event matching pi's
// ToolCallEvent discriminator shape.
function writeEvent(path: string, content: string) {
  return {
    type: "tool_call" as const,
    toolCallId: "tc-1",
    toolName: "write" as const,
    input: { path, content },
  };
}

function editEvent(
  path: string,
  edits: Array<{ oldText: string; newText: string }>,
) {
  return {
    type: "tool_call" as const,
    toolCallId: "tc-1",
    toolName: "edit" as const,
    input: { path, edits },
  };
}

describe("knowledgeGuardForEvent", () => {
  it("blocks direct writes to .belmont/PROGRESS.md", async () => {
    const event = writeEvent(".belmont/PROGRESS.md", "# PROGRESS\n\nhi\n");
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
    const env = JSON.parse(result?.reason ?? "{}");
    expect(env.message).toMatch(
      /Direct writes to .belmont\/PROGRESS\.md are not allowed/,
    );
    expect(env.suggestion).toMatch(/belmont_transition/);
  });

  it("blocks direct edits to .belmont/PROGRESS.md", async () => {
    await writeFile(
      join(TMP, ".belmont", "PROGRESS.md"),
      "# PROGRESS\n\n### M1: Test\n\n- [ ] P0-1 Build\n",
      "utf8",
    );
    const event = editEvent(".belmont/PROGRESS.md", [
      { oldText: "[ ] P0-1", newText: "[x] P0-1" },
    ]);
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
    const env = JSON.parse(result?.reason ?? "{}");
    expect(env.message).toMatch(/PROGRESS\.md/);
  });

  it("blocks writes inside .belmont/memory/steering/ as a harness-only zone", async () => {
    const event = writeEvent(
      ".belmont/memory/steering/steering.md",
      "next-up",
    );
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
    const env = JSON.parse(result?.reason ?? "{}");
    expect(env.message).toMatch(/steering\//);
    expect(env.suggestion).toMatch(/\/belmont:steer/);
  });

  it("blocks BELMONT.md over the 400-line cap", async () => {
    const longContent = Array.from({ length: 410 }, (_, i) => `Line ${i + 1}`).join("\n");
    const event = writeEvent(".belmont/BELMONT.md", longContent);
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
    const env = JSON.parse(result?.reason ?? "{}");
    expect(env.message).toMatch(/BELMONT\.md exceeds 400 lines/);
    expect(env.suggestion).toBeDefined();
  });

  it("blocks preferences.md over the 60-line cap", async () => {
    const longContent = Array.from({ length: 70 }, (_, i) => `- rule ${i + 1}`).join("\n");
    const event = writeEvent(".belmont/preferences.md", longContent);
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
    const env = JSON.parse(result?.reason ?? "{}");
    expect(env.message).toMatch(/preferences\.md exceeds 60 lines/);
    expect(env.suggestion).toMatch(/Trim/);
  });

  it("allows project code writes (outside .belmont/)", async () => {
    const event = writeEvent("src/index.ts", "export const x = 1;");
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result).toBeUndefined();
  });

  it("allows valid ADR creation with Revisions footer", async () => {
    const content = [
      "---",
      "schema: belmont.adr.v1",
      "id: D-007-test",
      "topic: test",
      "status: accepted",
      "updated_at: 2026-05-26",
      "---",
      "",
      "# D-007: Test",
      "",
      "## Decision",
      "",
      "Do the thing.",
      "",
      "## Revisions",
      "",
      "- 2026-05-26 — Accepted.",
      "",
    ].join("\n");
    const event = writeEvent(
      ".belmont/memory/decisions/D-007-test.md",
      content,
    );
    // belmontMd context is not supplied; the new-file Memory map check is
    // therefore skipped — we only assert the Revisions footer + frontmatter
    // checks pass.
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result).toBeUndefined();
  });

  it("blocks ADR file edits that omit a new Revisions bullet", async () => {
    const before = [
      "---",
      "schema: belmont.adr.v1",
      "id: D-007-test",
      "topic: test",
      "status: accepted",
      "updated_at: 2026-05-26",
      "---",
      "",
      "# D-007: Test",
      "",
      "## Decision",
      "",
      "Original.",
      "",
      "## Revisions",
      "",
      "- 2026-05-26 — Accepted.",
      "",
    ].join("\n");
    await writeFile(
      join(TMP, ".belmont", "memory", "decisions", "D-007-test.md"),
      before,
      "utf8",
    );
    // Edit: change "Original." to "Updated." — no new Revisions bullet.
    const event = editEvent(
      ".belmont/memory/decisions/D-007-test.md",
      [{ oldText: "Original.", newText: "Updated." }],
    );
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
    const env = JSON.parse(result?.reason ?? "{}");
    expect(env.message).toMatch(/Revisions/);
  });

  it("returns undefined for non-write tools (e.g. bash)", async () => {
    const bashEvent = {
      type: "tool_call" as const,
      toolCallId: "tc-1",
      toolName: "bash" as const,
      input: { command: "ls" },
    };
    const result = await knowledgeGuardForEvent(bashEvent as never, ctx(TMP));
    expect(result).toBeUndefined();
  });

  it("does not surface a notify call when no UI is attached", async () => {
    // Smoke: ctx { hasUI: false, ui: undefined } — no throw.
    const event = writeEvent(".belmont/PROGRESS.md", "x");
    const result = await knowledgeGuardForEvent(event, ctx(TMP));
    expect(result?.block).toBe(true);
  });
});
