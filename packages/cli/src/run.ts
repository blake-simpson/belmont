// Subcommand router for `belmont`. Belmont reserves a small set of
// explicit subcommands (init, validate, version) and passes everything
// else through to pi via `launchPi`. M3 covered init + version; M5
// adds `validate`. M11 adds `update`.

import { launchPi } from "@belmont/harness";
import { cmdInit, type CliResult } from "./init.js";
import { cmdValidate } from "./validate.js";
import { PACKAGE_NAME } from "./index.js";

// Re-export the CliResult shape so callers can stay in this module.
export type { CliResult } from "./init.js";

const VERSION_FLAGS = new Set(["version", "--version", "-v"]);
const HELP_FLAGS = new Set(["--help", "-h"]);

export type RunDeps = {
  argv: readonly string[];
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Launches pi with the harness extension. Injectable for tests. */
  launch?: (args: readonly string[]) => Promise<void>;
};

function printHelp(out: (line: string) => void): void {
  out("Usage: belmont [subcommand] [args...]");
  out("");
  out("Subcommands:");
  out("  init [project-dir]      Scaffold .belmont/ and run the boot doctor (M3).");
  out("  validate [project-dir]  Walk .belmont/ and report hard-failures + warnings (M5).");
  out("  version                 Print Belmont's CLI version (alias: --version, -v).");
  out("  --help, -h              Show this help.");
  out("");
  out("With no subcommand, `belmont` execs pi with the @belmont/harness extension preloaded.");
  out("Any unknown leading token is forwarded to pi unchanged.");
}

export async function runWith(deps: RunDeps): Promise<CliResult> {
  const { argv, cwd, out, err } = deps;
  const first = argv[0];

  if (first !== undefined && HELP_FLAGS.has(first)) {
    printHelp(out);
    return { exitCode: 0 };
  }

  if (first !== undefined && VERSION_FLAGS.has(first)) {
    // Static version string — replaced at publish-time by `npm version`
    // or the M11 release flow. M3 ships the M3-scaffold marker so the
    // smoke can confirm it ran the M3 build.
    out(`${PACKAGE_NAME} 0.0.0 (M3 scaffold)`);
    return { exitCode: 0 };
  }

  if (first === "init") {
    return cmdInit(argv[1], { cwd, out, err });
  }

  if (first === "validate") {
    return cmdValidate(argv[1], { cwd, out, err });
  }

  // Passthrough to pi. Allowed leading tokens that are NOT belmont
  // subcommands (e.g. a project-dir path, or pi's own flags) are
  // forwarded verbatim.
  const launch = deps.launch ?? launchPi;
  await launch(argv);
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
