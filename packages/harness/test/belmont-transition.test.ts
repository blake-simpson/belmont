// belmont_transition tool — verifies that the tool reads PROGRESS.md,
// flips the marker via the M2 applyTransition state machine, writes the
// result back, appends an episodic event, and surfaces the structured
// details payload.

import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeBelmontTransition } from "../src/tools/belmont-transition.js";

let TMP = "";

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "belmont-transition-test-"));
  await mkdir(join(TMP, ".belmont"), { recursive: true });
});

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function seedProgress(content: string): Promise<void> {
  await writeFile(join(TMP, ".belmont", "PROGRESS.md"), content, "utf8");
}

describe("executeBelmontTransition", () => {
  it("flips [ ] → [>] and writes the file back", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [ ] P0-1 Build the thing",
        "",
      ].join("\n"),
    );
    const result = await executeBelmontTransition(TMP, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "in_progress",
    });
    expect(result.details.previous).toBe("todo");
    expect(result.details.next).toBe("in_progress");
    expect(result.details.noop).toBe(false);
    expect(result.content[0]).toMatchObject({ type: "text" });
    const after = await readFile(join(TMP, ".belmont", "PROGRESS.md"), "utf8");
    expect(after).toContain("- [>] P0-1");
  });

  it("requires evidence_path on [v] transitions", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [x] P0-1 Build",
        "",
      ].join("\n"),
    );
    await expect(
      executeBelmontTransition(TMP, {
        milestone_id: "M1",
        task_id: "P0-1",
        to: "verified",
      }),
    ).rejects.toThrow(/EVIDENCE_REQUIRED/);
  });

  it("accepts [v] when evidence_path is provided", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [x] P0-1 Build",
        "",
      ].join("\n"),
    );
    const result = await executeBelmontTransition(TMP, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "verified",
      evidence_path: "src/foo.ts",
    });
    expect(result.details.next).toBe("verified");
    const after = await readFile(join(TMP, ".belmont", "PROGRESS.md"), "utf8");
    expect(after).toContain("- [v] P0-1");
  });

  it("rejects unknown milestone", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [ ] P0-1 Build",
        "",
      ].join("\n"),
    );
    await expect(
      executeBelmontTransition(TMP, {
        milestone_id: "M99",
        task_id: "P0-1",
        to: "done",
      }),
    ).rejects.toThrow(/UNKNOWN_MILESTONE/);
  });

  it("is a no-op when the marker is already at the target state", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [>] P0-1 Build",
        "",
      ].join("\n"),
    );
    const result = await executeBelmontTransition(TMP, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "in_progress",
    });
    expect(result.details.noop).toBe(true);
    expect(result.details.previous).toBe("in_progress");
    expect(result.details.next).toBe("in_progress");
  });

  it("writes an episodic event under .belmont/memory/episodic/<today>-progress-transitions.md", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [ ] P0-1 Build",
        "",
      ].join("\n"),
    );
    const result = await executeBelmontTransition(TMP, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "in_progress",
      note: "kicking off",
    });
    expect(result.details.episodicPath).toMatch(
      /\.belmont\/memory\/episodic\/\d{4}-\d{2}-\d{2}-progress-transitions\.md/,
    );
    const ep = await readFile(
      join(TMP, result.details.episodicPath),
      "utf8",
    );
    expect(ep).toContain("schema: belmont.episode.v1");
    expect(ep).toContain("[transition/M1/P0-1] todo → in_progress");
    expect(ep).toContain("kicking off");
  });

  it("returns a hex SHA-1 of the written content", async () => {
    await seedProgress(
      [
        "# PROGRESS",
        "",
        "### M1: Bootstrap",
        "",
        "- [ ] P0-1 Build",
        "",
      ].join("\n"),
    );
    const result = await executeBelmontTransition(TMP, {
      milestone_id: "M1",
      task_id: "P0-1",
      to: "in_progress",
    });
    expect(result.details.contentSha1).toMatch(/^[0-9a-f]{40}$/);
  });

  it("throws ENOENT-flavoured message when PROGRESS.md is missing", async () => {
    await expect(
      executeBelmontTransition(TMP, {
        milestone_id: "M1",
        task_id: "P0-1",
        to: "done",
      }),
    ).rejects.toThrow(/PROGRESS\.md not found/);
  });
});
