// packages/harness/src/pi/sdk.ts
//
// This is the ONE file in the entire monorepo allowed to import
// `@earendil-works/pi-coding-agent`. The B5 anti-corruption layer in
// action: every other module reaches pi through the wrappers exported
// from here.
//
// Enforced by:
//   - .dependency-cruiser.cjs rule `no-pi-outside-harness-pi-subdir`
//     (path-based, blocks all packages/harness/src/!(pi)/** files)
//   - test/pi-boundary.test.ts (static AST scan over the workspace)
//
// At M1 the wrapper surface is intentionally minimal: just a re-export
// of pi's VERSION constant so we can prove the boundary holds
// end-to-end. M3 expands this with the extension entrypoint, M5 with
// `belmont_transition` tool registration, M8 with
// `createAgentSessionRuntime` lifecycle wrappers.

import { VERSION as PI_VERSION } from "@earendil-works/pi-coding-agent";

export const piPackage = "@earendil-works/pi-coding-agent";
export const piVersion = PI_VERSION;
