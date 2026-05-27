// test/pi-boundary.test.ts
//
// Static-AST guard for v2.3 §2 locked constraint #2:
// "Only `@belmont/harness/src/pi/*.ts` may import
// `@earendil-works/pi-coding-agent`." M6 widened the boundary to also
// cover `@earendil-works/pi-tui` — the TUI primitives layer pi-coding-
// agent itself sits on. M7 widens it again to cover
// `@earendil-works/pi-ai` — the underlying AI SDK pi-coding-agent
// builds on (source of `Api`, `Model`, `OAuthCredentials`). All three
// packages flow through pi/sdk.ts so the harness has a single
// anti-corruption surface to swap if the upstream package ever splits
// or renames.
//
// This is a belt + braces seal: `.dependency-cruiser.cjs` enforces the
// same rules at build time (via `pnpm dep-check`), and this test
// re-verifies independently by walking the package source trees.

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

// Matches any of:
//   import X from "@earendil-works/pi-coding-agent"
//   import "@earendil-works/pi-coding-agent"
//   import * as pi from '@earendil-works/pi-coding-agent'
//   import { X } from "@earendil-works/pi-coding-agent/hooks"
//   require("@earendil-works/pi-coding-agent")
//   const pi = await import("@earendil-works/pi-coding-agent")
// Requires whitespace between the keyword and the quote (which real
// ESM/CJS imports always have); ignores prose mentions that aren't
// quoted package specifiers. The capture group on the package name lets
// the single regex catch pi-coding-agent + pi-tui + pi-ai (M7).
const PI_IMPORT_RE =
  /(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)["']@earendil-works\/(pi-coding-agent|pi-tui|pi-ai)(?:\/[^"']*)?["']/m;

const ALLOWED_PREFIX = "packages/harness/src/pi/";

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

describe("pi-boundary (B5 trust boundary)", () => {
  it("rejects @earendil-works/pi-coding-agent + pi-tui + pi-ai imports outside packages/harness/src/pi/", async () => {
    const stats = await stat(join(REPO_ROOT, "packages")).catch(() => null);
    expect(stats?.isDirectory(), "packages/ must exist").toBe(true);

    const allTs = await walkTsFiles(join(REPO_ROOT, "packages"));
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of allTs) {
      const rel = relative(REPO_ROOT, file).replaceAll("\\", "/");
      if (rel.startsWith(ALLOWED_PREFIX)) continue;
      const contents = await readFile(file, "utf8");
      const lines = contents.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i]!;
        if (PI_IMPORT_RE.test(ln)) {
          violations.push({ file: rel, line: i + 1, text: ln.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.text}`)
        .join("\n");
      throw new Error(
        `pi-boundary violation — pi imports outside ${ALLOWED_PREFIX}:\n${msg}\n\n` +
          `Only files under '${ALLOWED_PREFIX}' may import '@earendil-works/pi-coding-agent', '@earendil-works/pi-tui', or '@earendil-works/pi-ai'. ` +
          `If you need pi functionality elsewhere, route it through a wrapper exported from packages/harness/src/pi/sdk.ts.`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("confirms the harness/pi/ allowlist DOES exercise the pi imports (sanity)", async () => {
    const sdk = await readFile(join(REPO_ROOT, "packages/harness/src/pi/sdk.ts"), "utf8");
    expect(sdk).toMatch(/@earendil-works\/pi-coding-agent/);
    expect(sdk).toMatch(/@earendil-works\/pi-tui/);
    expect(sdk).toMatch(/@earendil-works\/pi-ai/);
  });
});
