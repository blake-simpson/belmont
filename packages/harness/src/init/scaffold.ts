// Pure FS scaffolder for `.belmont/`. Shared between the CLI
// `belmont init` subcommand and the in-pi `/belmont:init` handler.
// Idempotent: refuses (without error) if `.belmont/` already exists,
// returning `{ scaffolded: false }` so callers can render a friendly
// message instead of clobbering existing state.

import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  belmontMdTemplate,
  gitignoreTemplate,
  modelsJsonTemplate,
  preferencesMdTemplate,
  progressMdTemplate,
} from "./templates.js";

const MEMORY_SUBDIRS = [
  "subsystems",
  "decisions",
  "constraints",
  "prds",
  "episodic",
  "steering",
] as const;

export type ScaffoldResult =
  | { scaffolded: true; root: string; created: readonly string[] }
  | { scaffolded: false; root: string; reason: "already-exists" };

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scaffoldBelmontDir(projectRoot: string): Promise<ScaffoldResult> {
  const belmontDir = join(projectRoot, ".belmont");
  if (await pathExists(belmontDir)) {
    return { scaffolded: false, root: projectRoot, reason: "already-exists" };
  }

  const projectName = basename(projectRoot);
  const isoDate = new Date().toISOString().slice(0, 10);

  await mkdir(belmontDir, { recursive: true });
  const memoryDir = join(belmontDir, "memory");
  await mkdir(memoryDir, { recursive: true });
  for (const sub of MEMORY_SUBDIRS) {
    await mkdir(join(memoryDir, sub), { recursive: true });
  }

  const files: Array<{ rel: string; contents: string }> = [
    { rel: "BELMONT.md", contents: belmontMdTemplate(projectName, isoDate) },
    { rel: "preferences.md", contents: preferencesMdTemplate(isoDate) },
    { rel: "PROGRESS.md", contents: progressMdTemplate() },
    { rel: "models.json", contents: modelsJsonTemplate() },
    { rel: ".gitignore", contents: gitignoreTemplate() },
  ];

  for (const { rel, contents } of files) {
    await writeFile(join(belmontDir, rel), contents, "utf8");
  }

  return {
    scaffolded: true,
    root: projectRoot,
    created: files.map((f) => `.belmont/${f.rel}`),
  };
}
