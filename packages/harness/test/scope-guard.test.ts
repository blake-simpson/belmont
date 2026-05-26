// scope-guard hook — verifies the snapshot/diff/revert algorithm.
// Tests target the pure exports (snapshotBelmont + diffAndRevert) so
// each scenario can be expressed as: seed FS → snapshot → mutate FS →
// diff+revert → assert reverts list + final FS state.

import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diffAndRevert,
  snapshotBelmont,
} from "../src/hooks/scope-guard.js";

let TMP = "";

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "belmont-scope-guard-test-"));
  await mkdir(join(TMP, ".belmont", "memory", "decisions"), { recursive: true });
  await mkdir(join(TMP, ".belmont", "memory", "episodic"), { recursive: true });
});
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

describe("snapshotBelmont", () => {
  it("returns empty Map when .belmont/ does not exist", async () => {
    const blank = await mkdtemp(join(tmpdir(), "scope-guard-empty-"));
    try {
      const snap = await snapshotBelmont(blank);
      expect(snap.files.size).toBe(0);
    } finally {
      await rm(blank, { recursive: true, force: true });
    }
  });

  it("walks .belmont/ recursively and SHA-1s each file", async () => {
    await writeFile(join(TMP, ".belmont", "PROGRESS.md"), "x", "utf8");
    await writeFile(
      join(TMP, ".belmont", "memory", "decisions", "D-001-foo.md"),
      "y",
      "utf8",
    );
    const snap = await snapshotBelmont(TMP);
    expect(snap.files.size).toBe(2);
    for (const f of snap.files.values()) {
      expect(f.sha1).toMatch(/^[0-9a-f]{40}$/);
      expect(f.content).not.toBeNull();
    }
  });
});

describe("diffAndRevert", () => {
  it("reverts a new file at an unclassified .belmont/ path", async () => {
    const before = await snapshotBelmont(TMP);
    // Agent writes to an unclassified path.
    await writeFile(join(TMP, ".belmont", "scratch.md"), "scratch", "utf8");
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(1);
    expect(reverts[0]?.reason).toBe("unclassified_path");
    expect(reverts[0]?.outcome).toBe("deleted");
    expect(await fileExists(join(TMP, ".belmont", "scratch.md"))).toBe(false);
  });

  it("reverts content mutations to unclassified paths (restore prior content)", async () => {
    // Seed an unclassified file BEFORE the snapshot — pretend it existed
    // pre-turn (e.g. user-managed misc file inside .belmont/).
    const scratchPath = join(TMP, ".belmont", "user-notes.md");
    await writeFile(scratchPath, "original", "utf8");
    const before = await snapshotBelmont(TMP);
    await writeFile(scratchPath, "tampered", "utf8");
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(1);
    expect(reverts[0]?.reason).toBe("unclassified_path");
    expect(reverts[0]?.outcome).toBe("restored");
    expect(await readFile(scratchPath, "utf8")).toBe("original");
  });

  it("reverts steering/ writes (new file)", async () => {
    await mkdir(join(TMP, ".belmont", "memory", "steering"), { recursive: true });
    const before = await snapshotBelmont(TMP);
    await writeFile(
      join(TMP, ".belmont", "memory", "steering", "steering.md"),
      "use-this",
      "utf8",
    );
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts.find((r) => r.reason === "steering_zone")).toBeDefined();
    expect(
      await fileExists(
        join(TMP, ".belmont", "memory", "steering", "steering.md"),
      ),
    ).toBe(false);
  });

  it("reverts deletion of an ADR (restore from snapshot)", async () => {
    const adrPath = join(
      TMP,
      ".belmont",
      "memory",
      "decisions",
      "D-001-foo.md",
    );
    await writeFile(adrPath, "original adr", "utf8");
    const before = await snapshotBelmont(TMP);
    await unlink(adrPath);
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(1);
    expect(reverts[0]?.reason).toBe("knowledge_deletion");
    expect(reverts[0]?.outcome).toBe("restored");
    expect(await readFile(adrPath, "utf8")).toBe("original adr");
  });

  it("ALLOWS deletion of episodic files (intentional GC)", async () => {
    const epPath = join(
      TMP,
      ".belmont",
      "memory",
      "episodic",
      "2026-05-26-old.md",
    );
    await writeFile(epPath, "stale", "utf8");
    const before = await snapshotBelmont(TMP);
    await unlink(epPath);
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(0);
    expect(await fileExists(epPath)).toBe(false);
  });

  it("ALLOWS classified-knowledge mutations (knowledge-guard already gated content)", async () => {
    const adrPath = join(
      TMP,
      ".belmont",
      "memory",
      "decisions",
      "D-001-foo.md",
    );
    await writeFile(adrPath, "v1", "utf8");
    const before = await snapshotBelmont(TMP);
    await writeFile(adrPath, "v2", "utf8");
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(0);
    expect(await readFile(adrPath, "utf8")).toBe("v2");
  });

  it("ALLOWS PROGRESS.md mutations (knowledge-guard blocks raw writes; transition tool writes directly)", async () => {
    const progressPath = join(TMP, ".belmont", "PROGRESS.md");
    await writeFile(progressPath, "v1", "utf8");
    const before = await snapshotBelmont(TMP);
    // The transition tool writes the file directly via fs.writeFile —
    // pi's tool_call hook does not fire on harness-internal writes.
    await writeFile(progressPath, "v2", "utf8");
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(0);
    expect(await readFile(progressPath, "utf8")).toBe("v2");
  });

  it("ignores writes outside .belmont/ (snapshot scope is .belmont/ only)", async () => {
    await writeFile(join(TMP, ".belmont", "PROGRESS.md"), "x", "utf8");
    const before = await snapshotBelmont(TMP);
    // Mutate something outside .belmont/.
    await writeFile(join(TMP, "src.ts"), "code", "utf8");
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(0);
    expect(await readFile(join(TMP, "src.ts"), "utf8")).toBe("code");
  });

  it("creates a scope-revert episodic file with one bullet per revert when invoked through the registered hook", async () => {
    // Direct test of the helper used by the hook: it logs through
    // appendOrCreateEpisode. We exercise the FS side-effect via the
    // public registerScopeGuard flow indirectly by simulating: run
    // diffAndRevert (which restores) then manually append the events
    // through the same helper the hook would use. The hook itself is
    // exercised in extension-level smoke tests.
    const before = await snapshotBelmont(TMP);
    await writeFile(join(TMP, ".belmont", "scratch.md"), "x", "utf8");
    const after = await snapshotBelmont(TMP);
    const reverts = await diffAndRevert(before, after);
    expect(reverts).toHaveLength(1);
    // Mirror the hook's log step.
    const { appendOrCreateEpisode } = await import(
      "../src/state/episodic.js"
    );
    for (const r of reverts) {
      await appendOrCreateEpisode({
        cwd: TMP,
        slug: "scope-revert",
        kind: "scope_revert",
        content: `${r.relPath} — ${r.reason} (${r.outcome})`,
      });
    }
    const epDir = join(TMP, ".belmont", "memory", "episodic");
    const epFiles = await readdir(epDir);
    expect(epFiles).toHaveLength(1);
    expect(epFiles[0]).toMatch(/-scope-revert\.md$/);
    const body = await readFile(join(epDir, epFiles[0] ?? ""), "utf8");
    expect(body).toContain("[scope_revert] .belmont/scratch.md");
  });
});
