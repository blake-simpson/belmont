import { describe, expect, it } from "vitest";

import { generateSuggestion } from "../src/suggest.js";

describe("generateSuggestion", () => {
  it("returns undefined for an unknown diagnostic code", () => {
    const r = generateSuggestion(
      { code: "UNKNOWN", severity: "error", message: "x" },
      { after: "" },
    );
    expect(r).toBeUndefined();
  });

  it("returns a section-aware hint for PREFERENCES_TOO_LONG when bullets exist", () => {
    const after = [
      "# Preferences",
      "",
      "## Testing",
      "- a",
      "- b",
      "- c",
      "",
      "## Style",
      "- one",
    ].join("\n");
    const r = generateSuggestion(
      { code: "PREFERENCES_TOO_LONG", severity: "error", message: "x" },
      { after },
    );
    expect(r).toBeDefined();
    expect(r).toContain("Section");
    expect(r).toContain("Testing");
  });

  it("falls back to a generic hint when no bullets exist", () => {
    const r = generateSuggestion(
      { code: "PREFERENCES_TOO_LONG", severity: "error", message: "x" },
      { after: "# Preferences\n\nplain prose only" },
    );
    expect(r).toContain("Trim");
  });

  it("returns a section-aware hint for BELMONT_MD_TOO_LONG", () => {
    const after = [
      "# BELMONT",
      "",
      "## Identity",
      "small",
      "",
      "## Master PRD",
      ...Array.from({ length: 30 }, (_, i) => `line ${i}`),
      "",
      "## Memory map",
      "tiny",
    ].join("\n");
    const r = generateSuggestion(
      { code: "BELMONT_MD_TOO_LONG", severity: "error", message: "x" },
      { after },
    );
    expect(r).toContain("Master PRD");
  });

  it("returns a fixed hint for REVISIONS_MISSING_SECTION", () => {
    const r = generateSuggestion(
      { code: "REVISIONS_MISSING_SECTION", severity: "error", message: "x" },
      { after: "" },
    );
    expect(r).toContain("## Revisions");
  });

  it("returns a fixed hint for REVISIONS_NO_NEW_BULLET", () => {
    const r = generateSuggestion(
      { code: "REVISIONS_NO_NEW_BULLET", severity: "error", message: "x" },
      { after: "" },
    );
    expect(r).toContain("Append");
  });

  it("returns a fixed hint for FILENAME_TIMESTAMP_PREFIX", () => {
    const r = generateSuggestion(
      { code: "FILENAME_TIMESTAMP_PREFIX", severity: "error", message: "x" },
      { after: "" },
    );
    expect(r).toContain("topic-prefixed");
  });

  it("returns a fixed hint for EPISODIC_FILENAME_INVALID", () => {
    const r = generateSuggestion(
      { code: "EPISODIC_FILENAME_INVALID", severity: "error", message: "x" },
      { after: "" },
    );
    expect(r).toContain("YYYY-MM-DD");
  });

  it("returns a fixed hint for PROGRESS_DIRECT_WRITE", () => {
    const r = generateSuggestion(
      { code: "PROGRESS_DIRECT_WRITE", severity: "error", message: "x" },
      { after: "" },
    );
    expect(r).toContain("belmont_transition");
  });

  it("returns the bullets fallback when largest section has 0 or 1 bullets", () => {
    const after = [
      "## Section A",
      "- only one",
      "",
      "## Section B",
      "",
    ].join("\n");
    const r = generateSuggestion(
      { code: "PREFERENCES_TOO_LONG", severity: "error", message: "x" },
      { after },
    );
    expect(r).toContain("Trim");
    // Fallback path lacks the "Section ... has N bullets" line-range hint.
    expect(r).not.toContain("Section");
  });
});
