// @belmont/harness — the sole importer of @earendil-works/pi-coding-agent.
// Importing `pi` from anywhere in this package OUTSIDE `src/pi/` is rejected
// by dependency-cruiser (`no-pi-outside-harness-pi-subdir`) — see
// .dependency-cruiser.cjs. The test seal is `test/pi-boundary.test.ts`.

export { piPackage, piVersion } from "./pi/sdk.js";
export { launchPi } from "./pi/launch.js";

export const PACKAGE_NAME = "@belmont/harness";

// CLI-facing surface (used by @belmont/cli's `init` + `validate` subcommands).
export { scaffoldBelmontDir, type ScaffoldResult } from "./init/scaffold.js";
export {
  runModelsDoctor,
  formatDoctorReport,
  type DoctorResult,
  type TierReachability,
} from "./tiering/doctor.js";
// ModelsJson + ModelsTier come from @belmont/knowledge-schema at M7
// (moved out of the harness when the Zod schema landed in §17 M7 P0).
export type { ModelsJson, ModelsTier } from "@belmont/knowledge-schema";
export { renderStatus } from "./commands/status.js";
export {
  runBelmontValidate,
  formatValidateReport,
  extractPrdIndex,
  type ValidateReport,
} from "./validate.js";
