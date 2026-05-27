// Subcommand router for `belmont`. Belmont reserves a small set of
// explicit subcommands (init, install, update, validate, version) and
// passes everything else through to pi via `launchPi`. M3 covered init
// + version; M5 added `validate`. M11 adds `install`, `update`, and the
// top-level `--script` flag (sugar for pi's `--print`).

import { launchPi } from "@belmont/harness";
import { cmdInit, type CliResult } from "./init.js";
import { cmdInstall } from "./install.js";
import { cmdUpdate } from "./update.js";
import { cmdValidate } from "./validate.js";
import { PACKAGE_NAME } from "./index.js";

// Re-export the CliResult shape so callers can stay in this module.
export type { CliResult } from "./init.js";

const VERSION_FLAGS = new Set(["version", "--version", "-v"]);
const HELP_FLAGS = new Set(["--help", "-h"]);

// Static version literal kept in lock-step with package.json#version.
// Bumped at each release boundary; the M11 ship gate (§18 step 2)
// greps for the exact string `belmont 1.0.0`.
export const BELMONT_CLI_VERSION = "1.0.0";

export type RunDeps = {
  argv: readonly string[];
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Launches pi with the harness extension. Injectable for tests. */
  launch?: (args: readonly string[]) => Promise<void>;
};

function printHelp(out: (line: string) => void): void {
  out("Usage: belmont [subcommand|--flag] [args...]");
  out("");
  out("Subcommands:");
  out("  init [project-dir]      Scaffold .belmont/ and run the boot doctor.");
  out("  install [project-dir]   Materialize skills, seed .belmont/, RTK preflight, models doctor.");
  out("  update                  Self-update to the latest @belmont/cli via npm.");
  out("  validate [project-dir]  Walk .belmont/ and report hard-failures + warnings.");
  out("  version                 Print Belmont's CLI version (alias: --version, -v).");
  out("  --help, -h              Show this help.");
  out("");
  out("Top-level flags:");
  out("  --script \"<text>\"       Send <text> as a single scripted prompt to pi (non-interactive).");
  out("                          Sugar for pi's `--print` mode. Lifts §18 step 4 + 6 + 8.");
  out("");
  out("With no subcommand, `belmont` execs pi with the @belmont/harness extension preloaded.");
  out("Any unknown leading token is forwarded to pi unchanged.");
}

/**
 * Translate Belmont-flavoured `--script "<text>"` (or `--script=<text>`)
 * into pi's native `--print "<text>"`. Returns the rewritten argv plus
 * a flag indicating whether the rewrite happened (for tests + the
 * scripted-mode banner).
 *
 * The §18 author-smoke uses `belmont --script "/belmont:..."` in steps
 * 4, 6, and 8 to drive the harness non-interactively. Pi already
 * supports `--print|-p <message>` (see pi 0.75.5 cli/args.js); we just
 * rename the flag so the smoke matches the v2.3 plan's wording.
 *
 * Only the FIRST `--script` is rewritten; subsequent occurrences flow
 * through unchanged to pi (which will likely complain — that's the
 * desired failure mode, not a silent swallow).
 */
export function rewriteScriptFlag(argv: readonly string[]): {
  argv: string[];
  rewrote: boolean;
  message?: string;
} {
  const out: string[] = [];
  let rewrote = false;
  let message: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!rewrote && a === "--script") {
      const next = argv[i + 1];
      if (next === undefined) {
        // No value — let pi's arg parser surface the error; pass through.
        out.push(a);
        continue;
      }
      out.push("--print", next);
      message = next;
      rewrote = true;
      i += 1;
      continue;
    }
    if (!rewrote && a.startsWith("--script=")) {
      const value = a.slice("--script=".length);
      out.push("--print", value);
      message = value;
      rewrote = true;
      continue;
    }
    out.push(a);
  }
  return { argv: out, rewrote, message };
}

export async function runWith(deps: RunDeps): Promise<CliResult> {
  const { argv, cwd, out, err } = deps;
  const first = argv[0];

  if (first !== undefined && HELP_FLAGS.has(first)) {
    printHelp(out);
    return { exitCode: 0 };
  }

  if (first !== undefined && VERSION_FLAGS.has(first)) {
    out(`belmont ${BELMONT_CLI_VERSION}`);
    return { exitCode: 0 };
  }

  if (first === "init") {
    return cmdInit(argv[1], { cwd, out, err });
  }

  if (first === "install") {
    return cmdInstall(argv[1], { cwd, out, err });
  }

  if (first === "update") {
    return cmdUpdate({ cwd, out, err, args: argv.slice(1) });
  }

  if (first === "validate") {
    return cmdValidate(argv[1], { cwd, out, err });
  }

  // Passthrough to pi. `--script "<text>"` is rewritten to pi's
  // native `--print "<text>"` so the §18 smoke script reads cleanly.
  const { argv: forwarded } = rewriteScriptFlag(argv);
  const launch = deps.launch ?? launchPi;
  await launch(forwarded);
  return { exitCode: 0 };
}

export async function run(argv: readonly string[]): Promise<CliResult> {
  return runWith({
    argv,
    cwd: process.cwd(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
