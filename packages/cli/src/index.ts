// @belmont/cli — the `belmont` launcher.
//
// Imports `@belmont/harness` only — never `@earendil-works/pi-coding-agent`
// directly. The harness exposes `launchPi(argv)` (the SOLE programmatic
// entry to pi) plus the scaffolder + boot doctor that the `init`
// subcommand needs.

export { run, runWith, type CliResult } from "./run.js";
export { cmdInit } from "./init.js";
export { cmdValidate } from "./validate.js";

export const PACKAGE_NAME = "@belmont/cli";
