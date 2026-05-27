// @belmont/cli — the `belmont` launcher.
//
// Imports `@belmont/harness` only — never `@earendil-works/pi-coding-agent`
// directly. The harness exposes `launchPi(argv)` (the SOLE programmatic
// entry to pi) plus the scaffolder + boot doctor + skills materializer
// the subcommands need.

export { run, runWith, rewriteScriptFlag, BELMONT_CLI_VERSION, type CliResult } from "./run.js";
export { cmdInit } from "./init.js";
export { cmdInstall } from "./install.js";
export { cmdUpdate, parseUpdateArgs, checkCleanWorkingTree } from "./update.js";
export { cmdValidate } from "./validate.js";

export const PACKAGE_NAME = "@belmont/cli";
