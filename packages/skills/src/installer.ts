// `belmont-skills install [--target <path>]` — standalone installer.
// Materializes the canonical SKILL.md sources (+ referenced files) into
// the target directory. Default target is ~/.agents/skills/ with the
// `belmont-` namespace prefix on each materialized dir, yielding
// `~/.agents/skills/belmont-{working-backwards,plan,...}/SKILL.md`.
// Idempotent via content-hash check (see compose.ts).
//
// Usage:
//   npx @belmont/skills install
//   npx @belmont/skills install --target /tmp/belmont-skills-out
//   npx @belmont/skills install --no-prefix   # opt-out of the belmont-* prefix
//
// **Namespace history (M11 §18 fix).** The original M4 default was
// `~/.agents/skills/belmont/<slug>/` — but pi auto-discovers every
// SKILL.md under `~/.agents/skills/` (recursive sweep) and registers
// each by its frontmatter `name:` value, which is the bare slug. That
// collides with vanilla `~/.agents/skills/<slug>/` of the same name
// (e.g. a third-party `prototype/` next to ours). The new layout
// publishes as `belmont-<slug>` — flat directory, prefixed name. The
// canonical sources keep their bare slug names; the prefix is applied
// at compose time via `namespacePrefix`.

import { homedir } from "node:os";
import { join } from "node:path";

import { bundledSourceDir, compose, type ComposeResult } from "./compose.js";

export type InstallOptions = {
  target?: string;
  source?: string;
  /** Namespace prefix on materialized dir names + frontmatter `name`.
   *  Default `"belmont-"`. Pass `""` (or `--no-prefix`) to publish bare
   *  slug names (the M4 behaviour; rarely what you want — included for
   *  test fixtures and the harness in-process path). */
  namespacePrefix?: string;
};

export type InstallReport = ComposeResult & {
  target: string;
  namespacePrefix: string;
};

const DEFAULT_TARGET_FLAT = (): string => join(homedir(), ".agents", "skills");
const DEFAULT_PREFIX = "belmont-";

export async function install(opts: InstallOptions = {}): Promise<InstallReport> {
  const target = opts.target ?? DEFAULT_TARGET_FLAT();
  const source = opts.source ?? bundledSourceDir();
  const namespacePrefix = opts.namespacePrefix ?? DEFAULT_PREFIX;
  const result = await compose({ source, target, namespacePrefix });
  return { ...result, target, namespacePrefix };
}

export function parseArgv(argv: readonly string[]): { command: "install" | "help" | "unknown"; opts: InstallOptions } {
  const opts: InstallOptions = {};
  let command: "install" | "help" | "unknown" = "unknown";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "install") command = "install";
    else if (a === "--help" || a === "-h") command = "help";
    else if (a === "--target") opts.target = argv[++i];
    else if (a.startsWith("--target=")) opts.target = a.slice("--target=".length);
    else if (a === "--source") opts.source = argv[++i];
    else if (a.startsWith("--source=")) opts.source = a.slice("--source=".length);
    else if (a === "--no-prefix") opts.namespacePrefix = "";
    else if (a === "--prefix") opts.namespacePrefix = argv[++i];
    else if (a.startsWith("--prefix=")) opts.namespacePrefix = a.slice("--prefix=".length);
  }
  return { command, opts };
}

const HELP_TEXT = `belmont-skills — standalone installer for the 8 Belmont skills

Usage:
  belmont-skills install [--target <path>] [--prefix <prefix> | --no-prefix]

Options:
  --target <path>   Where to materialize skills (default: ~/.agents/skills/)
  --prefix <p>      Directory + frontmatter-name prefix (default: belmont-)
  --no-prefix       Materialize with bare slug names (compat with the M4 layout)
  --source <path>   Override the canonical-source root (rarely needed)
  -h, --help        Show this help

Default layout:
  ~/.agents/skills/belmont-working-backwards/SKILL.md
  ~/.agents/skills/belmont-plan/SKILL.md
  ~/.agents/skills/belmont-next/SKILL.md
  ... (8 skills total)

Reads the bundled SKILL.md sources, expands @include directives,
validates frontmatter, copies per-skill references, rewrites the
frontmatter \`name:\` to include the prefix, and writes only files
whose content actually changed.`;

export async function runCli(argv: readonly string[]): Promise<number> {
  const { command, opts } = parseArgv(argv);
  if (command === "help" || command === "unknown") {
    process.stdout.write(HELP_TEXT + "\n");
    return command === "help" ? 0 : 1;
  }
  const report = await install(opts);
  const prefixSuffix = report.namespacePrefix === "" ? "" : ` (prefix: ${report.namespacePrefix})`;
  process.stdout.write(`belmont-skills install → ${report.target}${prefixSuffix}\n`);
  for (const e of report.entries) {
    const tag = e.written ? "wrote " : "match ";
    const refs = e.references.length === 0 ? "" : ` (+${e.references.length} ref${e.references.length === 1 ? "" : "s"})`;
    process.stdout.write(`  ${tag} ${e.slug}${refs}\n`);
  }
  if (report.errors.length > 0) {
    process.stderr.write(`\nerrors:\n`);
    for (const err of report.errors) process.stderr.write(`  [${err.code}] ${err.slug}: ${err.message}\n`);
    return 1;
  }
  return 0;
}
