// `${VAR}` / `$env:VAR` interpolation.

import { describe, expect, it } from "vitest";

import { expandTilde, interpolate, interpolateRecord } from "../src/mcp/interpolate.js";

describe("interpolate", () => {
  it("expands ${VAR} using the provided env", () => {
    expect(interpolate("hello ${WHO}", { WHO: "world" })).toEqual({ value: "hello world", missing: [] });
  });

  it("expands $env:VAR (pi-mcp-adapter / PowerShell style)", () => {
    expect(interpolate("Token=$env:TOKEN", { TOKEN: "abc" })).toEqual({
      value: "Token=abc",
      missing: [],
    });
  });

  it("returns empty string for missing vars and reports them", () => {
    const r = interpolate("a${MISSING}b", {});
    expect(r.value).toBe("ab");
    expect(r.missing).toEqual(["MISSING"]);
  });

  it("dedups missing var names", () => {
    const r = interpolate("${X}${X}${X}", {});
    expect(r.missing).toEqual(["X"]);
  });

  it("collects multiple missing vars in encounter order", () => {
    const r = interpolate("${A}-${B}-${A}-${C}", {});
    expect(r.missing).toEqual(["A", "B", "C"]);
  });

  it("returns the literal when no var syntax is present", () => {
    expect(interpolate("just a string", {})).toEqual({ value: "just a string", missing: [] });
  });

  it("does not match malformed `${...}` (incomplete var name)", () => {
    expect(interpolate("${1notvalid}", { "1notvalid": "x" })).toEqual({
      value: "${1notvalid}",
      missing: [],
    });
  });
});

describe("interpolateRecord", () => {
  it("expands every value", () => {
    const out = interpolateRecord({ A: "${X}", B: "literal" }, { X: "expanded" });
    expect(out.record).toEqual({ A: "expanded", B: "literal" });
    expect(out.missing).toEqual([]);
  });

  it("collects missing vars across all values", () => {
    const out = interpolateRecord({ A: "${X}", B: "${Y}" }, {});
    expect(out.missing.sort()).toEqual(["X", "Y"]);
  });
});

describe("expandTilde", () => {
  it("expands bare ~ to HOME", () => {
    expect(expandTilde("~", "/Users/blake")).toBe("/Users/blake");
  });

  it("expands ~/foo to HOME/foo", () => {
    expect(expandTilde("~/code", "/Users/blake")).toBe("/Users/blake/code");
  });

  it("leaves non-tilde paths alone", () => {
    expect(expandTilde("/abs/path", "/Users/blake")).toBe("/abs/path");
    expect(expandTilde("relative", "/Users/blake")).toBe("relative");
  });

  it("returns input unchanged when HOME is empty/unset", () => {
    expect(expandTilde("~/foo", "")).toBe("~/foo");
  });
});
