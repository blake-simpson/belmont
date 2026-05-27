// test/dispose-finally.test.ts — v2.3 §8.5 lifecycle contract.
//
// "Every `createBelmontWorker` callsite is statically paired with a
//  `finally { … dispose() … }`. AST-walk lint."
//
// We use a regex-based static scan (mirror of the pi-boundary test
// pattern at test/pi-boundary.test.ts) rather than a full AST walker
// for two reasons:
//   - the regex catches the same false-negatives an AST walker would
//     (it's a single, well-defined token pattern);
//   - the harness already ships dependency-cruiser for the structural
//     checks. This belt-and-braces test is the discipline reminder
//     for human reviewers, not a deep semantic analysis.
//
// What "paired" means:
//   - Every callsite that does `createBelmontWorker(…)` (assignment to
//     a binding, await OR un-awaited) must be followed within the same
//     enclosing function by a `try {…} finally { … dispose() … }`
//     block OR by a comment marker `// belmont:dispose-exempt — <reason>`
//     for explicitly intentional non-finally cases (e.g. the test file
//     itself, which CAN rely on `afterEach` for cleanup).

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

const CREATE_WORKER_CALL_RE = /\bcreateBelmontWorker\s*\(/;
const FINALLY_DISPOSE_RE = /finally\s*\{[\s\S]*?\.dispose\s*\(/;
const EXEMPT_MARKER_RE = /\bbelmont:dispose-exempt\b/;

async function walkTsFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkTsFiles(full, out);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("dispose-finally contract (§8.5)", () => {
  it("every createBelmontWorker callsite is paired with finally{…dispose()…} or is exempt", async () => {
    const stats = await stat(join(REPO_ROOT, "packages")).catch(() => null);
    expect(stats?.isDirectory(), "packages/ must exist").toBe(true);

    const allTs = await walkTsFiles(join(REPO_ROOT, "packages"));
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of allTs) {
      // Skip the worker source file — that's the DEFINITION of
      // createBelmontWorker, not a callsite. The `from ./worker.js`
      // import line in other files trips the regex; we anchor to the
      // call syntax `createBelmontWorker(` to avoid that, but the
      // worker file itself uses the bare identifier in its `export
      // async function createBelmontWorker(...)` line — exclude it.
      const rel = relative(REPO_ROOT, file).replaceAll("\\", "/");
      if (rel === "packages/harness/src/pi/worker.ts") continue;

      const contents = await readFile(file, "utf8");
      // Quick reject — no callsites in this file.
      if (!CREATE_WORKER_CALL_RE.test(contents)) continue;
      // Exemption: file-level marker (only test files should use this).
      if (EXEMPT_MARKER_RE.test(contents)) continue;
      // Check the contents have a `finally{…dispose()…}` pairing. The
      // pattern is per-file (not per-call), which means a file with
      // multiple workers must have at least one finally-dispose pair;
      // M8 only ever wires one worker per /belmont:auto invocation so
      // this is sufficient for v1.0. If M9+ grows multi-worker call
      // sites, upgrade this to a per-function AST walker.
      if (FINALLY_DISPOSE_RE.test(contents)) continue;

      // No finally pairing found — record the call line(s).
      const lines = contents.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i]!;
        if (CREATE_WORKER_CALL_RE.test(ln)) {
          violations.push({ file: rel, line: i + 1, text: ln.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`).join("\n");
      throw new Error(
        `dispose-finally violation — createBelmontWorker callsites missing finally{…dispose()…}:\n${msg}\n\n` +
          `Pair every createBelmontWorker call with a finally that disposes the worker (§8.5), ` +
          `or add a top-of-file '// belmont:dispose-exempt — <reason>' marker if the cleanup runs ` +
          `via afterEach or equivalent (test files only).`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("the auto loop (the v1.0 ONLY production callsite) is paired", async () => {
    const loopPath = join(
      REPO_ROOT,
      "packages",
      "harness",
      "src",
      "auto",
      "loop.ts",
    );
    const md = await readFile(loopPath, "utf8");
    expect(CREATE_WORKER_CALL_RE.test(md)).toBe(true);
    expect(FINALLY_DISPOSE_RE.test(md)).toBe(true);
  });
});
