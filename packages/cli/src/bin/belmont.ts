#!/usr/bin/env node
// `belmont` launcher entrypoint. M1 stub.
// M3 wires: project-root resolution + `pi --extension=@belmont/harness <project>`
// + subcommand router (init/update/status/validate).

import { PACKAGE_NAME, HARNESS_PACKAGE } from "../index.js";

function main(argv: readonly string[]): number {
  const command = argv[0] ?? "version";
  switch (command) {
    case "version":
    case "--version":
    case "-v":
      console.log(`${PACKAGE_NAME} 0.0.0 (M1 scaffold; harness=${HARNESS_PACKAGE})`);
      return 0;
    default:
      console.error(`belmont: '${command}' is not implemented yet (M1 scaffold).`);
      console.error("Available: version. M3 adds: init, update, status, validate.");
      return 2;
  }
}

process.exit(main(process.argv.slice(2)));
