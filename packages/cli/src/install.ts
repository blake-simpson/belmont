// `belmont install [project-dir]` — the §13.2 install subcommand.
//
// Order of operations (per v2.3 §13.2):
//   1. Materialize the 8 canonical SKILL.md sources into
//      ~/.agents/skills/belmont/  (D-009 cross-harness discovery target;
//      copy not symlink, content-hashed).
//   2. Seed the .belmont/ state dir at the project root if missing.
//      Existing trees are left alone (idempotent — `belmont install`
//      re-run on an already-initialised repo only re-syncs skills).
//   3. RTK preflight: probe `which rtk`; warn-and-continue if missing
//      (D-3 tiered strictness — install never hard-fails on missing rtk).
//   4. Models doctor: run only when .belmont/models.json already exists.
//      Fresh inits don't run the doctor here — `belmont init` does that
//      itself per §7.6.
//
// No symlinks. Copies only. Content-hashed (skills/compose.ts handles
// the "skip if bytes match" path). Idempotent: a second `belmont
// install` on a clean tree should produce zero file writes.

import { resolve } from "node:path";
import {
  formatDoctorReport,
  materializeBelmontSkills,
  pathExists,
  runModelsDoctor,
  runRtkPreflight,
  scaffoldBelmontDir,
} from "@belmont/harness";

export type CliResult = { exitCode: number };

export type InstallOptions = {
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
};

export async function cmdInstall(
  projectDirArg: string | undefined,
  opts: InstallOptions,
): Promise<CliResult> {
  const projectRoot = resolve(opts.cwd, projectDirArg ?? ".");

  // 1. Skills materialization → ~/.agents/skills/belmont/ (D-009).
  const skillsReport = await materializeBelmontSkills();
  opts.out(`belmont install → ${skillsReport.target}`);
  let wrote = 0;
  let matched = 0;
  for (const entry of skillsReport.entries) {
    if (entry.written) wrote += 1;
    else matched += 1;
  }
  opts.out(
    `  skills: ${wrote} written, ${matched} unchanged (${skillsReport.entries.length} total)`,
  );
  if (skillsReport.errors.length > 0) {
    for (const e of skillsReport.errors) {
      opts.err(`  [${e.code}] ${e.slug}: ${e.message}`);
    }
    return { exitCode: 1 };
  }

  // 2. Seed .belmont/ (no-op when already initialised).
  const scaffolded = await scaffoldBelmontDir(projectRoot);
  if (scaffolded.scaffolded) {
    opts.out("");
    opts.out(`Scaffolded .belmont/ at ${projectRoot}:`);
    for (const rel of scaffolded.created) opts.out(`  - ${rel}`);
  } else {
    opts.out("");
    opts.out(`belmont install: .belmont/ already exists at ${projectRoot} — leaving in place.`);
  }

  // 3. RTK preflight — warn-and-continue per D-3 tiered strictness.
  const rtk = runRtkPreflight();
  opts.out("");
  opts.out(rtk.message);

  // 4. Models doctor — only when models.json exists. Fresh inits already
  //    ran the doctor in `belmont init`; re-running here for fresh dirs
  //    would double-fire the boot-doctor surface.
  const modelsPath = `${projectRoot}/.belmont/models.json`;
  if (await pathExists(modelsPath)) {
    const doctor = await runModelsDoctor(projectRoot);
    opts.out("");
    opts.out(formatDoctorReport(doctor));
    if (doctor.hardFail) {
      opts.err("");
      opts.err(
        "belmont install: zero tiers reachable. Fix the recovery commands above, then re-run `belmont install` (or edit `.belmont/models.json` and re-run `/belmont:models doctor`).",
      );
      return { exitCode: 2 };
    }
  }

  return { exitCode: 0 };
}
