// Module-local snapshot of the always-loaded knowledge files. Refreshed
// on session_start (and after `/belmont:init` scaffolds), consumed by
// the `before_agent_start` system-prompt hook so we do not re-read disk
// on every agent start. Files that don't exist resolve to `undefined`,
// not an error — projects without `.belmont/` use a vanilla pi prompt.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type BelmontSnapshot = {
  cwd: string;
  belmontMd: string | undefined;
  preferencesMd: string | undefined;
  hasBelmontDir: boolean;
};

const cache = new Map<string, BelmontSnapshot>();

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw err;
  }
}

export async function refreshSnapshot(cwd: string): Promise<BelmontSnapshot> {
  const belmontMd = await readIfExists(join(cwd, ".belmont", "BELMONT.md"));
  const preferencesMd = await readIfExists(join(cwd, ".belmont", "preferences.md"));
  const snapshot: BelmontSnapshot = {
    cwd,
    belmontMd,
    preferencesMd,
    hasBelmontDir: belmontMd !== undefined || preferencesMd !== undefined,
  };
  cache.set(cwd, snapshot);
  return snapshot;
}

export function getSnapshot(cwd: string): BelmontSnapshot | undefined {
  return cache.get(cwd);
}

export function clearSnapshot(cwd: string): void {
  cache.delete(cwd);
}
