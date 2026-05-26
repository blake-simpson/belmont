import { describe, expect, it } from "vitest";

import {
  parseFrontmatter,
  validateFrontmatter,
} from "../src/frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses a well-formed YAML frontmatter block", () => {
    const md = "---\nschema: belmont.stack.v1\nupdated_at: 2026-05-26\n---\n\n# Body\n";
    const r = parseFrontmatter(md);
    expect(r.frontmatter).toEqual({
      schema: "belmont.stack.v1",
      updated_at: "2026-05-26",
    });
    expect(r.body.trim()).toBe("# Body");
    expect(r.warnings).toEqual([]);
  });

  it("returns null frontmatter when the file has no opening fence", () => {
    const md = "# No frontmatter\n\nBody content.\n";
    const r = parseFrontmatter(md);
    expect(r.frontmatter).toBeNull();
    expect(r.body).toBe(md);
    expect(r.warnings).toEqual([]);
  });

  it("emits FRONTMATTER_UNCLOSED when there is no closing fence", () => {
    const md = "---\nschema: belmont.stack.v1\nupdated_at: 2026-05-26\n";
    const r = parseFrontmatter(md);
    expect(r.frontmatter).toBeNull();
    expect(r.warnings[0]?.code).toBe("FRONTMATTER_UNCLOSED");
  });

  it("emits FRONTMATTER_YAML_ERROR when the YAML is invalid", () => {
    const md = "---\n:: invalid yaml ::\n---\n\n# Body\n";
    const r = parseFrontmatter(md);
    expect(r.warnings[0]?.code).toBe("FRONTMATTER_YAML_ERROR");
  });

  it("emits FRONTMATTER_NOT_OBJECT when the YAML parses to a non-object", () => {
    const md = "---\n- just\n- a\n- list\n---\n\n# Body\n";
    const r = parseFrontmatter(md);
    expect(r.warnings[0]?.code).toBe("FRONTMATTER_NOT_OBJECT");
  });
});

describe("validateFrontmatter — per kind", () => {
  it("accepts a valid entrypoint frontmatter", () => {
    const d = validateFrontmatter(
      { schema: "belmont.entrypoint.v1", updated_at: "2026-05-26" },
      "belmont-md",
    );
    expect(d).toEqual([]);
  });

  it("accepts a valid preferences frontmatter", () => {
    const d = validateFrontmatter(
      { schema: "belmont.preferences.v1", updated_at: "2026-05-26" },
      "preferences",
    );
    expect(d).toEqual([]);
  });

  it("accepts a valid ADR frontmatter with all fields", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.adr.v1",
        id: "D-002-episodic-filename-grammar",
        topic: "knowledge-model",
        status: "accepted",
        updated_at: "2026-05-26",
        supersedes: null,
      },
      "adr",
    );
    expect(d).toEqual([]);
  });

  it("rejects an ADR with a status outside the enum", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.adr.v1",
        id: "D-001",
        topic: "x",
        status: "tentative",
        updated_at: "2026-05-26",
      },
      "adr",
    );
    expect(d).toHaveLength(1);
    expect(d[0]?.code).toBe("FRONTMATTER_INVALID");
  });

  it("rejects an ADR missing a required field (topic)", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.adr.v1",
        id: "D-001",
        status: "accepted",
        updated_at: "2026-05-26",
      },
      "adr",
    );
    expect(d.length).toBeGreaterThan(0);
  });

  it("accepts a valid PRD frontmatter", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.prd.v1",
        id: "prd-auth",
        topic: "auth",
        status: "active",
        updated_at: "2026-05-26",
      },
      "prd",
    );
    expect(d).toEqual([]);
  });

  it("accepts a valid subsystem frontmatter", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.subsystem.v1",
        id: "subsystem-auth",
        updated_at: "2026-05-26",
      },
      "subsystem",
    );
    expect(d).toEqual([]);
  });

  it("accepts the v1.0 canonical episode schema (note: not 'episodic')", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.episode.v1",
        date: "2026-05-26",
        phase: "M2",
      },
      "episodic",
    );
    expect(d).toEqual([]);
  });

  it("rejects a frontmatter using the wrong schema literal", () => {
    const d = validateFrontmatter(
      {
        schema: "belmont.episodic.v1",
        date: "2026-05-26",
      },
      "episodic",
    );
    expect(d.length).toBeGreaterThan(0);
  });

  it("accepts a valid stack singleton frontmatter", () => {
    const d = validateFrontmatter(
      { schema: "belmont.stack.v1", updated_at: "2026-05-26" },
      "stack",
    );
    expect(d).toEqual([]);
  });

  it("emits FRONTMATTER_MISSING when frontmatter is null for a kind that requires it", () => {
    const d = validateFrontmatter(null, "adr");
    expect(d[0]?.code).toBe("FRONTMATTER_MISSING");
  });

  it("returns no diagnostics for an unknown / unhandled kind (e.g. models-json)", () => {
    const d = validateFrontmatter({ anything: true }, "models-json");
    expect(d).toEqual([]);
  });

  it("formats a zod issue with no path (top-level type mismatch)", () => {
    // Pass an array: zod fails at the root with no path field.
    const d = validateFrontmatter([], "preferences");
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]?.code).toBe("FRONTMATTER_MISSING");
  });

  it("formats a zod issue with a path (nested field error)", () => {
    const d = validateFrontmatter(
      { schema: "belmont.adr.v1", id: "", topic: "x", status: "accepted", updated_at: "2026-05-26" },
      "adr",
    );
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]?.message).toMatch(/id:/);
  });
});
