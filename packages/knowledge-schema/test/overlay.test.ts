import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseMilestoneOverlay,
  parseOverlayString,
} from "../src/overlay.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

async function load(name: string): Promise<string> {
  return await readFile(join(FIXTURES, name), "utf8");
}

describe("parseOverlayString — token forms", () => {
  it("parses bare-tier token (no override)", () => {
    const r = parseOverlayString("implementation=high", "M1");
    expect(r.warnings).toEqual([]);
    expect(r.overlay?.implementation).toEqual({ tier: "high" });
  });

  it("parses provider/model override", () => {
    const r = parseOverlayString(
      "implementation=high+anthropic/claude-sonnet-4-6",
      "M1",
    );
    expect(r.warnings).toEqual([]);
    expect(r.overlay?.implementation).toEqual({
      tier: "high",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
  });

  it("parses provider/model + thinking level", () => {
    const r = parseOverlayString(
      "implementation=high+anthropic/claude-sonnet-4-6:high",
      "M1",
    );
    expect(r.warnings).toEqual([]);
    expect(r.overlay?.implementation).toEqual({
      tier: "high",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      thinking: "high",
    });
  });

  it("parses baseURL override with colon-in-model (qwen3:8b disambiguation)", () => {
    const r = parseOverlayString(
      "implementation=medium+ollama/qwen3:8b@http://localhost:11434/v1",
      "M4",
    );
    expect(r.warnings).toEqual([]);
    expect(r.overlay?.implementation).toEqual({
      tier: "medium",
      provider: "ollama",
      model: "qwen3:8b",
      baseURL: "http://localhost:11434/v1",
    });
  });

  it("parses thinking AND baseURL AND colon-in-model together", () => {
    const r = parseOverlayString(
      "implementation=low+ollama/qwen3:8b:low@http://localhost:11434/v1",
      "M5",
    );
    expect(r.warnings).toEqual([]);
    expect(r.overlay?.implementation).toEqual({
      tier: "low",
      provider: "ollama",
      model: "qwen3:8b",
      thinking: "low",
      baseURL: "http://localhost:11434/v1",
    });
  });

  it("parses multiple tokens whitespace-separated", () => {
    const r = parseOverlayString(
      "implementation=high+anthropic/claude-sonnet-4-6 verification=medium",
      "M3",
    );
    expect(r.warnings).toEqual([]);
    expect(r.overlay?.implementation?.model).toBe("claude-sonnet-4-6");
    expect(r.overlay?.verification?.tier).toBe("medium");
  });

  it("rejects an unknown agent with the deterministic rejection text", () => {
    const r = parseOverlayString("frontend=high", "M3");
    const err = r.warnings.find((w) => w.code === "OVERLAY_UNKNOWN_AGENT");
    expect(err).toBeDefined();
    expect(err?.message).toContain('unknown agent "frontend"');
    expect(err?.message).toContain("working_backwards");
    expect(r.overlay).toBeNull();
  });

  it("rejects an unknown tier", () => {
    const r = parseOverlayString("implementation=ultra", "M1");
    const err = r.warnings.find((w) => w.code === "OVERLAY_UNKNOWN_TIER");
    expect(err).toBeDefined();
    expect(r.overlay).toBeNull();
  });

  it("rejects a malformed token (no equals)", () => {
    const r = parseOverlayString("garbage", "M1");
    expect(r.warnings.some((w) => w.code === "OVERLAY_MALFORMED_TOKEN")).toBe(true);
  });

  it("rejects an override missing the provider/model slash", () => {
    const r = parseOverlayString("implementation=high+anthropic", "M1");
    expect(r.warnings.some((w) => w.code === "OVERLAY_MALFORMED_OVERRIDE")).toBe(true);
  });

  it("rejects an override with empty provider or model", () => {
    const r = parseOverlayString("implementation=high+/claude", "M1");
    expect(r.warnings.some((w) => w.code === "OVERLAY_MALFORMED_OVERRIDE")).toBe(true);
  });

  it("returns null overlay for an empty input", () => {
    const r = parseOverlayString("", "M1");
    expect(r.overlay).toBeNull();
    expect(r.warnings).toEqual([]);
  });
});

describe("parseMilestoneOverlay — fixture-driven", () => {
  it("extracts the overlay from a PROGRESS.md milestone block", async () => {
    const md = await load("v1-overlay.md");
    const r = parseMilestoneOverlay(md, "M3");
    expect(r.overlay?.implementation).toEqual({
      tier: "high",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(r.overlay?.verification?.tier).toBe("high");
  });

  it("returns null when the milestone has no overlay comment", () => {
    const md = "# PROGRESS\n\n### M1: No overlay\n- [ ] P0-1 task\n";
    const r = parseMilestoneOverlay(md, "M1");
    expect(r.overlay).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("returns null when the milestone id is not found", () => {
    const md = "# PROGRESS\n\n### M1: x\n- [ ] P0-1 task\n";
    const r = parseMilestoneOverlay(md, "M99");
    expect(r.overlay).toBeNull();
  });

  it("walks the v1-overlay-complex fixture and parses all 5 milestones' overlays", async () => {
    const md = await load("v1-overlay-complex.md");
    expect(parseMilestoneOverlay(md, "M1").overlay?.implementation).toEqual({
      tier: "high",
    });
    expect(parseMilestoneOverlay(md, "M2").overlay?.implementation?.model).toBe(
      "claude-sonnet-4-6",
    );
    expect(parseMilestoneOverlay(md, "M3").overlay?.implementation?.thinking).toBe(
      "high",
    );
    const m4 = parseMilestoneOverlay(md, "M4").overlay?.implementation;
    expect(m4?.model).toBe("qwen3:8b");
    expect(m4?.baseURL).toBe("http://localhost:11434/v1");
    const m5 = parseMilestoneOverlay(md, "M5").overlay?.implementation;
    expect(m5?.thinking).toBe("low");
    expect(m5?.model).toBe("qwen3:8b");
    expect(m5?.baseURL).toBe("http://localhost:11434/v1");
  });
});
