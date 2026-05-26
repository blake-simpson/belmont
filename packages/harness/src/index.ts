// @belmont/harness — the sole importer of @earendil-works/pi-coding-agent.
// Importing `pi` from anywhere in this package OUTSIDE `src/pi/` is rejected
// by dependency-cruiser (`no-pi-outside-harness-pi-subdir`) — see
// .dependency-cruiser.cjs. The test seal is `test/pi-boundary.test.ts`.

export { piVersion, piPackage } from "./pi/sdk.js";

export const PACKAGE_NAME = "@belmont/harness";

export type PlaceholderM3plus = {
  message: "M1 stub — extension entry, hooks, tools, TUI, auto loop, MCP bridge land across M3–M10";
};
