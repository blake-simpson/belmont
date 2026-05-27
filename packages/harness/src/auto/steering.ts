// auto/steering.ts — `/belmont:steer` consume-before-invoke contract.
//
// v2.3 §7.2 (verbatim):
//   "/belmont:steer <text> → writes .belmont/memory/steering/steering.md
//    (replace, not append). The auto loop reads + deletes the file at
//    the top of each iteration; prepends the text to the next sub-
//    session's prompt-build."
//
// D-008 backs the consume-and-prepend grammar: steering is NEVER spliced
// mid-turn into an in-flight pi session — it's a "next iteration"
// signal. The replace-vs-append semantic means the user can re-issue
// `/belmont:steer "no, do it differently"` and the second message
// supersedes the first if the loop hasn't yet picked it up.
//
// The scope-guard at `hooks/scope-guard.ts` also watches the steering
// zone (`STEERING_FRAGMENT = "/.belmont/memory/steering/"`), but ONLY
// reverts unauthorised writes that come from inside an agent turn. The
// `/belmont:steer` command — and this consume helper — are explicitly
// outside that revert path (they run from the command handler / the
// auto loop's top-of-iteration hook, both of which sit outside the
// `turn_start/turn_end` envelope the scope guard polices).

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STEERING_REL_PATH = ".belmont/memory/steering/steering.md";

export function steeringFilePath(cwd: string): string {
  return join(cwd, STEERING_REL_PATH);
}

/**
 * Read + delete the steering file. Returns the trimmed steering text
 * when present, or `undefined` when no steering is pending.
 *
 * The unlink runs UNCONDITIONALLY when the read succeeds — even if the
 * body is whitespace-only — so a partially-typed `/belmont:steer` that
 * was overwritten by an empty replacement doesn't leak into the next
 * iteration.
 */
export async function consumeSteeringFile(cwd: string): Promise<string | undefined> {
  const path = steeringFilePath(cwd);
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
  try {
    await unlink(path);
  } catch (err: unknown) {
    // The file was racy-deleted between read + unlink — accept it.
    if (!isEnoent(err)) throw err;
  }
  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Write (REPLACE — never append) the steering file. Used by the
 * `/belmont:steer <text>` command handler.
 */
export async function writeSteeringFile(cwd: string, text: string): Promise<void> {
  const path = steeringFilePath(cwd);
  await mkdir(dirname(path), { recursive: true });
  // Trailing newline keeps editors honest; the trim happens on read.
  await writeFile(path, `${text.trim()}\n`, "utf8");
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
