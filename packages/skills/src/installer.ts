// `belmont-skills install [--target <path>]` — standalone installer.
// Materializes the canonical SKILL.md sources (+ referenced files) into
// the target directory. Default target is ~/.agents/skills/belmont/.
// Idempotent via content-hash check (see compose.ts).
//
// Usage:
//   npx @belmont/skills install
//   npx @belmont/skills install --target /tmp/belmont-skills-out

import { homedir } from "node:os";
import { join } from "node:path";

import { bundledSourceDir, compose, type ComposeResult } from "./compose.js";

export type InstallOptions = {
  target?: string;
  source?: string;
};

export type InstallReport = ComposeResult & {
  target: string;
};

const DEFAULT_TARGET = join(homedir(), ".agents", "skills", "belmont");

export async function install(opts: InstallOptions = {}): Promise<InstallReport> {
  const target = opts.target ?? DEFAULT_TARGET;
  const source = opts.source ?? bundledSourceDir();
  const result = await compose({ source, target });
  return { ...result, target };
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
  }
  return { command, opts };
}

const HELP_TEXT = `belmont-skills — standalone installer for the 8 Belmont skills

Usage:
  belmont-skills install [--target <path>]

Options:
  --target <path>   Where to materialize skills (default: ~/.agents/skills/belmont/)
  --source <path>   Override the canonical-source root (rarely needed)
  -h, --help        Show this help

Reads the bundled SKILL.md sources, expands @include directives,
validates frontmatter, copies per-skill references, and writes only
files whose content actually changed.`;

export async function runCli(argv: readonly string[]): Promise<number> {
  const { command, opts } = parseArgv(argv);
  if (command === "help" || command === "unknown") {
    process.stdout.write(HELP_TEXT + "\n");
    return command === "help" ? 0 : 1;
  }
  const report = await install(opts);
  process.stdout.write(`belmont-skills install → ${report.target}\n`);
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
