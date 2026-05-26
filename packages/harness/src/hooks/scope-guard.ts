// hooks/scope-guard.ts — `turn_start` snapshot + `turn_end` diff/revert
// of the `.belmont/` tree.
//
// Authored from earendil-works' shipped extension example
//   packages/coding-agent/examples/extensions/permission-gate.ts (34 LOC,
//   `pi.on("tool_call", …) → ctx.ui.confirm(...)` flow).
// Lineage cited per D-001-omp-evaluation §Decision item 5 and the M5
// "Implementation hint" in v2.3 §17.
//
// M5 always-illegal baseline (the conservative policy locked at session
// scope-policy confirmation):
//
//   diff entry under .belmont/
//   ├── path inside memory/steering/                    → REVERT
//   ├── unclassified path (classifyTarget returns null) → REVERT
//   ├── classified path, deleted, kind != episodic      → REVERT (restore)
//   └── otherwise (mutation through knowledge-guard)    → ALLOW
//   diff entry outside .belmont/                        → ALLOW (project code)
//
// Phase-aware milestone scoping ("marker flips inside M2 only", "new
// subsystems only in verify phase") depends on M8's auto-loop active
// task context and is deferred to M8.
//
// Every revert writes one episodic event under
// `.belmont/memory/episodic/<today>-scope-revert.md` and emits a
// `ctx.ui.notify(..., "warning")` when a UI is attached.

import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { classifyTarget } from "@belmont/knowledge-schema";
import { mkdir } from "node:fs/promises";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "../pi/sdk.js";
import { appendOrCreateEpisode } from "../state/episodic.js";

const STEERING_FRAGMENT = "/.belmont/memory/steering/";

export type FileSnapshot = {
  /** Absolute path on disk. */
  absPath: string;
  /** Forward-slash project-relative path. */
  relPath: string;
  /** SHA-1 of the file content at snapshot time. */
  sha1: string;
  /** File content at snapshot time. `null` when the file did not exist. */
  content: string | null;
};

export type CwdSnapshot = {
  cwd: string;
  files: Map<string, FileSnapshot>;
};

export type RevertReason =
  | "steering_zone"
  | "unclassified_path"
  | "knowledge_deletion";

export type RevertAction = {
  relPath: string;
  reason: RevertReason;
  /** What restoration did: "restored" (write old content), "deleted" (file was new). */
  outcome: "restored" | "deleted";
};

// Per-cwd snapshot map; survives across turns inside one pi process.
// Cleared explicitly via `clearScopeSnapshot()` (test hook only).
const snapshots: Map<string, CwdSnapshot> = new Map();

export function registerScopeGuard(pi: ExtensionAPI): void {
  pi.on("turn_start", async (_event, ctx) => {
    const snap = await snapshotBelmont(ctx.cwd);
    snapshots.set(ctx.cwd, snap);
  });

  pi.on("turn_end", async (_event, ctx) => {
    const before = snapshots.get(ctx.cwd);
    if (!before) return;
    const after = await snapshotBelmont(ctx.cwd);
    const reverts = await diffAndRevert(before, after);
    snapshots.set(ctx.cwd, await snapshotBelmont(ctx.cwd));
    if (reverts.length === 0) return;
    notify(ctx, reverts);
    await logEpisodic(ctx.cwd, reverts);
  });
}

export function clearScopeSnapshot(cwd?: string): void {
  if (cwd === undefined) {
    snapshots.clear();
    return;
  }
  snapshots.delete(cwd);
}

// ============================================================================
// Snapshot + diff
// ============================================================================

export async function snapshotBelmont(cwd: string): Promise<CwdSnapshot> {
  const root = join(cwd, ".belmont");
  const files = new Map<string, FileSnapshot>();
  const exists = await isDir(root);
  if (!exists) {
    return { cwd, files };
  }
  for await (const absPath of walk(root)) {
    const content = await safeReadFile(absPath);
    const relPath = relative(cwd, absPath).split(sep).join("/");
    files.set(absPath, {
      absPath,
      relPath,
      sha1: sha1(content ?? ""),
      content,
    });
  }
  return { cwd, files };
}

export async function diffAndRevert(
  before: CwdSnapshot,
  after: CwdSnapshot,
): Promise<RevertAction[]> {
  const reverts: RevertAction[] = [];

  // Deletions + mutations to files that existed in `before`.
  for (const [absPath, prev] of before.files.entries()) {
    const next = after.files.get(absPath);
    if (next === undefined) {
      // File deleted. Restore unless it was a legitimate episodic GC.
      const target = classifyTarget(prev.relPath);
      if (target?.kind === "episodic") continue;
      await restoreFile(absPath, prev.content);
      reverts.push({
        relPath: prev.relPath,
        reason: "knowledge_deletion",
        outcome: "restored",
      });
      continue;
    }
    if (next.sha1 === prev.sha1) continue; // unchanged
    // Mutated. knowledge-guard already gated this content; allow.
    // (Unclassified mutations to existing files are caught by the
    //  "created" path next loop since pi's write tool always re-writes
    //  the whole file; for "edit" the file was classified to be there
    //  already, which is fine.)
  }

  // Creations (in `after` but not `before`) or content-mutations whose
  // result is now in an out-of-scope kind.
  for (const [absPath, next] of after.files.entries()) {
    const prev = before.files.get(absPath);
    const isNew = prev === undefined;
    if (!isNew && next.sha1 === prev.sha1) continue;

    const normPath = next.absPath.split(sep).join("/");
    if (normPath.includes(STEERING_FRAGMENT)) {
      // Steering zone — restore or delete.
      if (isNew) {
        await unlinkSafe(absPath);
        reverts.push({
          relPath: next.relPath,
          reason: "steering_zone",
          outcome: "deleted",
        });
      } else {
        await restoreFile(absPath, prev.content);
        reverts.push({
          relPath: next.relPath,
          reason: "steering_zone",
          outcome: "restored",
        });
      }
      continue;
    }

    const target = classifyTarget(next.relPath);
    if (target === null) {
      // Unclassified path inside .belmont/. ALWAYS revert.
      if (isNew) {
        await unlinkSafe(absPath);
        reverts.push({
          relPath: next.relPath,
          reason: "unclassified_path",
          outcome: "deleted",
        });
      } else {
        await restoreFile(absPath, prev.content);
        reverts.push({
          relPath: next.relPath,
          reason: "unclassified_path",
          outcome: "restored",
        });
      }
    }
    // else: classified + mutated/created → already gated by knowledge-guard. Allow.
  }

  return reverts;
}

// ============================================================================
// Notification + episodic log
// ============================================================================

function notify(
  ctx: { hasUI?: boolean; ui?: ExtensionContext["ui"] },
  reverts: RevertAction[],
): void {
  if (!ctx.hasUI || !ctx.ui) return;
  const head = `Belmont reverted ${reverts.length} out-of-scope state change${reverts.length === 1 ? "" : "s"}:`;
  const lines = reverts
    .map((r) => `  - ${r.relPath} (${r.reason}, ${r.outcome})`)
    .join("\n");
  ctx.ui.notify(`${head}\n${lines}`, "warning");
}

async function logEpisodic(
  cwd: string,
  reverts: RevertAction[],
): Promise<void> {
  for (const r of reverts) {
    await appendOrCreateEpisode({
      cwd,
      slug: "scope-revert",
      kind: "scope_revert",
      content: `${r.relPath} — ${r.reason} (${r.outcome})`,
    });
  }
}

// ============================================================================
// FS helpers
// ============================================================================

async function* walk(dir: string): AsyncIterable<string> {
  let entries: { name: string; isDir: boolean }[];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    entries = items.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch (err: unknown) {
    if (isEnoent(err)) return;
    throw err;
  }
  for (const { name, isDir: isd } of entries) {
    const full = join(dir, name);
    if (isd) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function safeReadFile(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

async function restoreFile(
  absPath: string,
  content: string | null,
): Promise<void> {
  if (content === null) {
    await unlinkSafe(absPath);
    return;
  }
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function unlinkSafe(absPath: string): Promise<void> {
  try {
    await unlink(absPath);
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }
}

async function isDir(absPath: string): Promise<boolean> {
  try {
    const s = await stat(absPath);
    return s.isDirectory();
  } catch (err: unknown) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
