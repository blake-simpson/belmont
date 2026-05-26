// belmont_episode_event tool — verifies create-on-first-write and
// append-on-second-write behavior plus the shared episodic helper's
// bullet idempotence.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeBelmontEpisodeEvent } from "../src/tools/belmont-episode-event.js";
import {
  appendBulletUnderEvents,
  appendOrCreateEpisode,
} from "../src/state/episodic.js";

let TMP = "";

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "belmont-episode-test-"));
});
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("executeBelmontEpisodeEvent", () => {
  it("creates the episodic file on first write with v1 frontmatter + Events section", async () => {
    const result = await executeBelmontEpisodeEvent(TMP, {
      slug: "m5-test",
      kind: "phase",
      content: "kicked off M5",
    });
    expect(result.details.created).toBe(true);
    expect(result.details.relativePath).toMatch(
      /\.belmont\/memory\/episodic\/\d{4}-\d{2}-\d{2}-m5-test\.md/,
    );
    const body = await readFile(
      join(TMP, result.details.relativePath),
      "utf8",
    );
    expect(body).toMatch(/^---\nschema: belmont\.episode\.v1\ndate: \d{4}-\d{2}-\d{2}\n---/);
    expect(body).toContain("## Events");
    expect(body).toContain("- [phase] kicked off M5");
  });

  it("appends on second write without rewriting the frontmatter", async () => {
    await executeBelmontEpisodeEvent(TMP, {
      slug: "m5-test",
      kind: "phase",
      content: "first",
    });
    const second = await executeBelmontEpisodeEvent(TMP, {
      slug: "m5-test",
      kind: "phase",
      content: "second",
    });
    expect(second.details.created).toBe(false);
    const body = await readFile(
      join(TMP, second.details.relativePath),
      "utf8",
    );
    // Single frontmatter block.
    const fmCount = (body.match(/^---$/gm) ?? []).length;
    expect(fmCount).toBe(2);
    expect(body).toContain("- [phase] first");
    expect(body).toContain("- [phase] second");
  });

  it("tags task_id when provided", async () => {
    const r = await executeBelmontEpisodeEvent(TMP, {
      slug: "m5-test",
      kind: "transition",
      content: "todo → in_progress",
      task_id: "P0-1",
    });
    const body = await readFile(join(TMP, r.details.relativePath), "utf8");
    expect(body).toContain("- [transition/P0-1] todo → in_progress");
  });

  it("rejects invalid slugs at the helper layer", async () => {
    await expect(
      appendOrCreateEpisode({
        cwd: TMP,
        slug: "Bad Slug",
        kind: "note",
        content: "hi",
      }),
    ).rejects.toThrow(/Invalid episodic slug/);
  });
});

describe("appendBulletUnderEvents", () => {
  it("appends under existing Events section", () => {
    const md = [
      "---",
      "schema: belmont.episode.v1",
      "date: 2026-05-26",
      "---",
      "",
      "# 2026-05-26 — m5",
      "",
      "## Events",
      "",
      "- [phase] first",
      "",
    ].join("\n");
    const next = appendBulletUnderEvents(md, "- [phase] second");
    expect(next).toContain("- [phase] first");
    expect(next).toContain("- [phase] second");
  });

  it("creates the Events section when absent", () => {
    const md = [
      "---",
      "schema: belmont.episode.v1",
      "---",
      "",
      "# Day",
    ].join("\n");
    const next = appendBulletUnderEvents(md, "- [note] hi");
    expect(next).toContain("\n## Events\n");
    expect(next).toContain("- [note] hi");
  });

  it("is idempotent when the bullet already exists", () => {
    const md = [
      "## Events",
      "",
      "- [note] one",
      "",
    ].join("\n");
    expect(appendBulletUnderEvents(md, "- [note] one")).toBe(md);
  });
});
