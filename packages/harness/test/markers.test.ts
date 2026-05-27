import { describe, expect, it } from "vitest";

import { colorMarker, markerColorFor, noopColorer, plainMarker } from "../src/tui/markers.js";

describe("markers", () => {
  it("plain markers are the byte-faithful 3-char strings", () => {
    expect(plainMarker("todo")).toBe("[ ]");
    expect(plainMarker("in_progress")).toBe("[>]");
    expect(plainMarker("done")).toBe("[x]");
    expect(plainMarker("verified")).toBe("[v]");
    expect(plainMarker("blocked")).toBe("[!]");
  });

  it("colour mapping matches the §17 M6 lock", () => {
    expect(markerColorFor("verified")).toBe("success"); // green
    expect(markerColorFor("in_progress")).toBe("warning"); // yellow
    expect(markerColorFor("blocked")).toBe("error"); // red
    expect(markerColorFor("todo")).toBe("dim"); // grey
    expect(markerColorFor("done")).toBe("text"); // white / default
  });

  it("colorMarker routes through the supplied theme's fg() with the right colour", () => {
    const calls: Array<[string, string]> = [];
    const colorer = {
      fg: (c: string, t: string) => {
        calls.push([c, t]);
        return `<${c}>${t}</${c}>`;
      },
    };

    expect(colorMarker(colorer, "verified")).toBe("<success>[v]</success>");
    expect(colorMarker(colorer, "in_progress")).toBe("<warning>[>]</warning>");
    expect(colorMarker(colorer, "blocked")).toBe("<error>[!]</error>");
    expect(colorMarker(colorer, "todo")).toBe("<dim>[ ]</dim>");
    expect(colorMarker(colorer, "done")).toBe("<text>[x]</text>");
    expect(calls).toHaveLength(5);
  });

  it("noopColorer passes text through unchanged (no-ANSI fallback)", () => {
    expect(colorMarker(noopColorer, "verified")).toBe("[v]");
    expect(colorMarker(noopColorer, "todo")).toBe("[ ]");
    expect(colorMarker(noopColorer, "done")).toBe("[x]");
  });
});
