// packages/harness/src/pi/launch.ts
//
// The pi CLI launcher. `@belmont/cli` calls `launchPi(argv)` to start
// the pi REPL (or print/RPC modes) with the Belmont harness extension
// preloaded. The CLI itself never imports pi directly — the
// dependency-cruiser rule `no-pi-outside-harness-pi-subdir` and the
// static pi-boundary test both forbid it. This is the SOLE
// programmatic entry to pi.
//
// **Loading shape (M11 §18 fix; supersedes the M3 D-003 approach).**
// pi-coding-agent 0.75.5 supports two loading modes:
//   1. In-process factory via `pi.main({ extensionFactories: [fn] })`.
//      Convenient — no extra files — but pi hard-codes the extension
//      path to `<inline:${index + 1}>`. That cosmetic name surfaces in
//      the `[Extensions]` banner and every shortcut-conflict
//      diagnostic; Blake hit the noise during M11's §18 dogfood.
//   2. File-extension loading via `pi --extension <path>` (CLI arg
//      forwarded to pi's main; resolved through pi's `loadExtension`
//      jiti path). pi sets `extension.path` to the resolved file path,
//      so the banner shows a real basename.
//
// M11 switched to mode (2). The launcher resolves the path to the
// bundled `belmont.js` re-export sibling (`../belmont.js` relative to
// THIS module) and prepends `--extension <path>` to pi's argv.
//
// D-003 (M3) said "in-process factory keeps the v1.0 distribution
// single-tarball-friendly." The file-extension path is still
// single-tarball-friendly — `belmont.js` ships INSIDE the
// `@belmont/harness` tarball; resolving it via `import.meta.url`
// works in dev (running from `packages/harness/dist/...`) and in the
// installed case (running from `node_modules/@belmont/harness/dist/
// ...`) identically. D-003 is amended; the constraint stands.

import { fileURLToPath } from "node:url";
import { main as piMain } from "@earendil-works/pi-coding-agent";

/** Resolve the absolute filesystem path to the harness extension's
 *  `belmont.js` re-export. Lives next to this module in the dist tree
 *  (compiled from `packages/harness/src/belmont.ts`). Pi will load it
 *  via jiti and read `extension.path` as the friendly identifier
 *  shown in the `[Extensions]` banner. */
export function resolveBelmontExtensionPath(): string {
  return fileURLToPath(new URL("../belmont.js", import.meta.url));
}

export async function launchPi(argv: readonly string[]): Promise<void> {
  const extensionPath = resolveBelmontExtensionPath();
  await piMain(["--extension", extensionPath, ...argv]);
}
