// §12.3 blast-radius gate — pure-function tests.

import { describe, expect, it } from "vitest";

import {
  applyAutoModeFilter,
  autoModeExcluded,
  isAutoMode,
} from "../src/mcp/blast-radius.js";
import type { McpConfig } from "@belmont/knowledge-schema";

function config(...entries: Array<[string, boolean]>): McpConfig {
  const servers: McpConfig["servers"] = {};
  for (const [name, auto] of entries) {
    servers[name] = {
      type: "stdio",
      command: `${name}-bin`,
      args: [],
      env: {},
      auto,
      lifecycle: "lazy",
    };
  }
  return { servers };
}

describe("applyAutoModeFilter", () => {
  it("identity transform when not in auto mode", () => {
    const c = config(["a", false], ["b", true]);
    const out = applyAutoModeFilter(c, false);
    expect(Object.keys(out.servers).sort()).toEqual(["a", "b"]);
  });

  it("drops every server without auto:true when in auto mode", () => {
    const c = config(["safe", true], ["dangerous", false], ["also-dangerous", false]);
    const out = applyAutoModeFilter(c, true);
    expect(Object.keys(out.servers)).toEqual(["safe"]);
  });

  it("returns an empty server set when no auto:true server exists", () => {
    const c = config(["x", false], ["y", false]);
    const out = applyAutoModeFilter(c, true);
    expect(out.servers).toEqual({});
  });

  it("does not mutate the input config", () => {
    const c = config(["a", false], ["b", true]);
    const before = Object.keys(c.servers).sort();
    applyAutoModeFilter(c, true);
    expect(Object.keys(c.servers).sort()).toEqual(before);
  });

  it("reachability assertion — non-auto server tools are UNREACHABLE under auto mode", () => {
    // §12.3 invariant: NOT JUST "warned about." Filtered === gone.
    const c = config(["safe", true], ["unsafe", false]);
    const out = applyAutoModeFilter(c, true);
    expect(out.servers["unsafe"]).toBeUndefined();
    // The auto-mode caller would registerTool() over `out.servers` —
    // a missing key here means the tool literally cannot be called.
    // No --force escape hatch in v1.0.
  });
});

describe("autoModeExcluded", () => {
  it("returns the sorted list of servers that would be filtered", () => {
    const c = config(["safe", true], ["c-dangerous", false], ["a-dangerous", false]);
    expect(autoModeExcluded(c)).toEqual(["a-dangerous", "c-dangerous"]);
  });

  it("returns empty when every server has auto:true", () => {
    const c = config(["a", true], ["b", true]);
    expect(autoModeExcluded(c)).toEqual([]);
  });
});

describe("isAutoMode", () => {
  it("returns true when BELMONT_AUTO_MODE=1", () => {
    expect(isAutoMode({ BELMONT_AUTO_MODE: "1" })).toBe(true);
  });

  it("returns false when env var is absent", () => {
    expect(isAutoMode({})).toBe(false);
  });

  it("returns false on any non-'1' value (only exact '1' enables)", () => {
    expect(isAutoMode({ BELMONT_AUTO_MODE: "0" })).toBe(false);
    expect(isAutoMode({ BELMONT_AUTO_MODE: "true" })).toBe(false);
    expect(isAutoMode({ BELMONT_AUTO_MODE: "" })).toBe(false);
  });
});
