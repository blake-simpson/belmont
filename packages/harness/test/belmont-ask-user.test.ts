import { describe, expect, it } from "vitest";
import { executeBelmontAskUser } from "../src/tools/belmont-ask-user.js";
import type { Component, ExtensionContext } from "../src/pi/sdk.js";

type DialogScript = (component: Component) => void;

const passthroughTheme = {
  fg: (_name: string, text: string) => text,
  bg: (_name: string, text: string) => text,
  bold: (text: string) => text,
};

function makeCtx(options: {
  hasUI?: boolean;
  script?: DialogScript;
}): ExtensionContext & { renders: string[][] } {
  const renders: string[][] = [];
  const ctx = {
    hasUI: options.hasUI ?? true,
    renders,
    ui: {
      custom: async <T>(factory: (tui: unknown, theme: typeof passthroughTheme, keybindings: unknown, done: (value: T) => void) => Component): Promise<T | undefined> => {
        let result: T | undefined;
        const tui = { requestRender: () => undefined };
        const component = factory(tui, passthroughTheme, {}, (value) => {
          result = value;
        });
        renders.push(component.render(90));
        options.script?.(component);
        return result;
      },
    },
  };
  return ctx as unknown as ExtensionContext & { renders: string[][] };
}

describe("belmont_ask_user", () => {
  it("renders a custom contextual dialog with Other built in", async () => {
    const ctx = makeCtx({ script: (component) => component.handleInput?.("\r") });

    const result = await executeBelmontAskUser(ctx, {
      question: "Which path?",
      context: "The dependency-free path is safer, but the package has richer UI.",
      choices: ["Keep wrapper", "Adopt package"],
    });

    expect(ctx.renders[0]?.join("\n")).toContain("The dependency-free path is safer");
    expect(ctx.renders[0]?.join("\n")).toContain("Other...");
    expect(result.details).toMatchObject({
      mode: "dialog",
      cancelled: false,
      answers: { "Which path?": "Keep wrapper" },
    });
  });

  it("supports AskUserQuestion-style batched options with descriptions and review", async () => {
    const ctx = makeCtx({
      script: (component) => {
        component.handleInput?.("\r");
        component.handleInput?.("\r");
        component.handleInput?.("\r");
      },
    });

    const result = await executeBelmontAskUser(ctx, {
      questions: [
        {
          question: "Which HTTP client should we use?",
          header: "HTTP",
          options: [
            { label: "fetch (Recommended)", description: "Built-in." },
            { label: "axios", description: "Interceptor support." },
          ],
        },
        {
          question: "Which resilience feature matters most?",
          header: "Resilience",
          options: [
            { label: "Retry", description: "Retry transient failures." },
            { label: "Timeout", description: "Bound requests." },
          ],
          allowCustomAnswer: false,
        },
      ],
    });

    expect(ctx.renders[0]?.join("\n")).toContain("Built-in.");
    expect(result.details).toEqual({
      mode: "dialog",
      cancelled: false,
      answers: {
        "Which HTTP client should we use?": "fetch (Recommended)",
        "Which resilience feature matters most?": "Retry",
      },
    });
  });

  it("throws a deterministic fallback error when no UI is attached", async () => {
    const ctx = makeCtx({ hasUI: false });

    await expect(executeBelmontAskUser(ctx, { question: "What now?" })).rejects.toThrow(
      "no UI attached",
    );
  });
});
