// `belmont update` — the §13.3 self-update subcommand (simplified).
//
// v1.0 ships the simple form: refuse-on-dirty + shell out to
//   `npm install -g @belmont/cli@latest`
// The full §13.3 stub (vendored binary, atomic replace, preSeedRtk,
// re-exec self) is deferred to v1.1 — it requires the bun-compile
// distribution that's also deferred per §2 locked constraint. NPM is
// the v1.0 distribution channel; npm is also the v1.0 update path.
//
// Pi version is implicitly bumped: @belmont/cli@latest pulls
// @belmont/harness@1.x which exact-pins @earendil-works/pi-coding-agent.
// Per D-12, Belmont owns pi's version; users never `pi upgrade`
// directly.
//
// Flags:
//   --allow-dirty   Skip the clean-working-tree check (escape hatch).
//   --dry-run       Print the install command without executing.

import { spawn, spawnSync } from "node:child_process";

export type CliResult = { exitCode: number };

export type UpdateOptions = {
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Rest of argv after the `update` token (e.g. ["--dry-run"]). */
  args?: readonly string[];
  /** Injectable for tests. */
  spawnFn?: typeof spawn;
  /** Injectable for tests. */
  spawnSyncFn?: typeof spawnSync;
};

export type ParsedUpdateArgs = {
  allowDirty: boolean;
  dryRun: boolean;
  tag: string;
};

export function parseUpdateArgs(argv: readonly string[]): ParsedUpdateArgs {
  const out: ParsedUpdateArgs = { allowDirty: false, dryRun: false, tag: "latest" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--allow-dirty") out.allowDirty = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--tag" && i + 1 < argv.length) out.tag = argv[++i]!;
    else if (a.startsWith("--tag=")) out.tag = a.slice("--tag=".length);
  }
  return out;
}

/**
 * Quick git working-tree check. Returns:
 *   - { clean: true } when `git status --porcelain` returns no output.
 *   - { clean: false, reason } when output is non-empty or git isn't a tree.
 *
 * `belmont update` runs in the user's *project* repo (not Belmont's own
 * source tree). The check is a courtesy — npm install -g writes to the
 * global node_modules, not the project tree — but it prevents the
 * confusing UX where users blame the update for un-staged work that's
 * still in their working dir.
 */
export function checkCleanWorkingTree(
  cwd: string,
  spawnSyncFn: typeof spawnSync = spawnSync,
): { clean: true } | { clean: false; reason: string } {
  const probe = spawnSyncFn("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
  if (probe.status === null || probe.status !== 0) {
    return { clean: true }; // not a git repo (or git missing) — skip the check.
  }
  const trimmed = probe.stdout.trim();
  if (trimmed.length === 0) return { clean: true };
  const sample = trimmed.split("\n").slice(0, 3).join("\n");
  return { clean: false, reason: sample };
}

export async function cmdUpdate(opts: UpdateOptions): Promise<CliResult> {
  const args = parseUpdateArgs(opts.args ?? []);
  const spawnFn = opts.spawnFn ?? spawn;
  const spawnSyncFn = opts.spawnSyncFn ?? spawnSync;

  const cleanCheck = checkCleanWorkingTree(opts.cwd, spawnSyncFn);
  if (!cleanCheck.clean && !args.allowDirty) {
    opts.err("belmont update: refusing to run with a dirty working tree.");
    opts.err("Sample of changed files:");
    for (const line of cleanCheck.reason.split("\n")) opts.err(`  ${line}`);
    opts.err("Commit/stash, or pass --allow-dirty to override.");
    return { exitCode: 2 };
  }

  const spec = `@belmont/cli@${args.tag}`;
  const cmd = `npm install -g ${spec}`;
  opts.out(`belmont update: ${cmd}`);

  if (args.dryRun) {
    opts.out("(dry-run; not executing)");
    return { exitCode: 0 };
  }

  return new Promise<CliResult>((resolve) => {
    const child = spawnFn("npm", ["install", "-g", spec], {
      cwd: opts.cwd,
      stdio: "inherit",
    });
    child.on("error", (err: Error) => {
      opts.err(`belmont update: failed to spawn npm — ${err.message}`);
      resolve({ exitCode: 127 });
    });
    child.on("exit", (code: number | null) => {
      if (code === 0) {
        opts.out("");
        opts.out("belmont update: done. Re-run `belmont --version` to confirm.");
        resolve({ exitCode: 0 });
      } else {
        resolve({ exitCode: code ?? 1 });
      }
    });
  });
}
