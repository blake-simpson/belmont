// `belmont init [project-dir]` — scaffold .belmont/ and run the boot
// doctor. Exits non-zero when the doctor reports zero reachable tiers
// (v2.3 §7.6 boot resilience contract; M3 is a stub — see
// D-003-pi-extension-shape.md).

import { resolve } from "node:path";
import {
  formatDoctorReport,
  runModelsDoctor,
  scaffoldBelmontDir,
} from "@belmont/harness";

export type CliResult = { exitCode: number };

export type InitOptions = {
  cwd: string;
  /** Where to write structured output (stdout). */
  out: (line: string) => void;
  /** Where to write errors / doctor failures (stderr). */
  err: (line: string) => void;
};

export async function cmdInit(projectDirArg: string | undefined, opts: InitOptions): Promise<CliResult> {
  const projectRoot = resolve(opts.cwd, projectDirArg ?? ".");
  const result = await scaffoldBelmontDir(projectRoot);

  if (!result.scaffolded) {
    opts.err(
      `belmont init: .belmont/ already exists at ${projectRoot}. Refusing to overwrite — delete or relocate it first.`,
    );
    return { exitCode: 1 };
  }

  opts.out(`Scaffolded .belmont/ at ${projectRoot}:`);
  for (const rel of result.created) opts.out(`  - ${rel}`);

  const doctor = await runModelsDoctor(projectRoot);
  opts.out("");
  opts.out(formatDoctorReport(doctor));
  if (doctor.hardFail) {
    opts.err("");
    opts.err(
      "belmont init: zero tiers reachable. Fix the recovery commands above, then re-run `belmont init` (or edit `.belmont/models.json` and re-run `/belmont:models doctor`).",
    );
    return { exitCode: 2 };
  }
  return { exitCode: 0 };
}
