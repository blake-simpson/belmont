// packages/harness/src/pi/launch.ts
//
// The pi CLI launcher. `@belmont/cli` calls `launchPi(argv)` to start
// the pi REPL (or print/RPC modes) with the Belmont harness extension
// preloaded as a factory. The CLI itself never imports pi directly —
// the dependency-cruiser rule `no-pi-outside-harness-pi-subdir` and
// the static pi-boundary test both forbid it. This is the SOLE
// programmatic entry to pi.
//
// pi's `main(argv, { extensionFactories })` accepts factory functions
// directly, so there is no need to materialize the harness as a file
// on disk and pass `--extension=<path>`; the in-process factory keeps
// the v1.0 distribution single-tarball-friendly.

import { main as piMain } from "@earendil-works/pi-coding-agent";
import { belmontExtension } from "../extension.js";

export async function launchPi(argv: readonly string[]): Promise<void> {
  await piMain([...argv], { extensionFactories: [belmontExtension] });
}
