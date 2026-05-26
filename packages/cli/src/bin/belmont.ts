#!/usr/bin/env node
// `belmont` launcher entrypoint. Subcommand routing lives in run.ts so
// the bin file stays small and the routing logic stays unit-testable.

import { run } from "../run.js";

const result = await run(process.argv.slice(2));
process.exit(result.exitCode);
