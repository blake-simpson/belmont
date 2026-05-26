// `belmont validate` — preflight CLI subcommand.
//
// Thin wrapper around `runBelmontValidate` from `@belmont/harness`.
// Renders the report; exit code 2 on any hard-failure, 0 otherwise
// (warnings are printed but do not block — same shape as the M3 boot
// doctor's 0/1/2 for M11 release flow consistency).
//
// The M8 auto-loop preflight will import `runBelmontValidate` directly
// from `@belmont/harness` so the two entry points share the same walker.

import { resolve } from "node:path";
import { formatValidateReport, runBelmontValidate } from "@belmont/harness";

export type CliResult = { exitCode: number };

export type ValidateOptions = {
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
};

export async function cmdValidate(
  projectDirArg: string | undefined,
  opts: ValidateOptions,
): Promise<CliResult> {
  const projectRoot = resolve(opts.cwd, projectDirArg ?? ".");
  const report = await runBelmontValidate(projectRoot);
  const formatted = formatValidateReport(report);
  if (report.hardFailures.length > 0) {
    opts.err(formatted);
    return { exitCode: 2 };
  }
  opts.out(formatted);
  return { exitCode: 0 };
}
