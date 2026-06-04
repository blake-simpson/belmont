// belmont_ask_user — small wrapper around ctx.ui.{select,input,confirm}.
// Lets sub-agents surface a question to the human via the harness's UI
// without escaping the LLM ↔ tool loop.
//
// Disposition:
//   - choices array provided → ctx.ui.select (drop-down)
//   - choices omitted, free_text=true → ctx.ui.input (text prompt)
//   - no UI available (hasUI === false; e.g. print mode) → throw with a
//     deterministic message so the calling agent knows to ask the user
//     directly via its own response.

import { Type, type Static } from "typebox";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "../pi/sdk.js";

const ASK_USER_SCHEMA = Type.Object({
  question: Type.String({
    description: "The question to surface to the user.",
    minLength: 1,
    maxLength: 500,
  }),
  choices: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description:
        "Optional list of mutually-exclusive choices. When present, the user picks one from a dialog. When omitted, a free-text input dialog is shown.",
      minItems: 2,
      maxItems: 8,
    }),
  ),
  placeholder: Type.Optional(
    Type.String({
      description:
        "Optional placeholder shown in the free-text dialog. Ignored when `choices` is present.",
      maxLength: 200,
    }),
  ),
});

export type BelmontAskUserInput = Static<typeof ASK_USER_SCHEMA>;

export type BelmontAskUserDetails = {
  mode: "select" | "input";
  cancelled: boolean;
};

export function buildBelmontAskUserTool(): ToolDefinition<
  typeof ASK_USER_SCHEMA,
  BelmontAskUserDetails
> {
  return {
    name: "belmont_ask_user",
    label: "Belmont ask user",
    description:
      "Pause and ask the human a question via the harness UI. Pass `choices` for a select dialog or omit them for a free-text input dialog. Fails when no UI is attached (print/RPC mode) — in that case ask the user directly in your response instead.",
    promptSnippet:
      "Surface a clarifying or decision question to the human through the harness UI. Pass `choices` for a pick-list dialog, or omit them for a free-text prompt; returns the user's answer.",
    promptGuidelines: [
      "When a skill needs a clarifying or decision answer from the user, call belmont_ask_user instead of writing the question into your text reply — it renders a real selectable dialog.",
      "Pass `choices` (2–8 mutually-exclusive options) for a pick-list; omit `choices` for an open-ended free-text question, optionally with a `placeholder`.",
      "If the call fails because no UI is attached (auto/print/RPC mode), fall back to asking the question directly in your response.",
    ],
    parameters: ASK_USER_SCHEMA,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await executeBelmontAskUser(ctx, params);
    },
  };
}

export async function executeBelmontAskUser(
  ctx: ExtensionContext,
  params: BelmontAskUserInput,
): Promise<AgentToolResult<BelmontAskUserDetails>> {
  if (!ctx.hasUI) {
    throw new Error(
      "belmont_ask_user: no UI attached (print/RPC mode). Ask the user directly in your response instead.",
    );
  }

  if (params.choices && params.choices.length > 0) {
    const answer = await ctx.ui.select(params.question, params.choices);
    if (answer === undefined) {
      return {
        content: [{ type: "text", text: "User cancelled the prompt." }],
        details: { mode: "select", cancelled: true },
      };
    }
    return {
      content: [{ type: "text", text: answer }],
      details: { mode: "select", cancelled: false },
    };
  }

  const answer = await ctx.ui.input(params.question, params.placeholder);
  if (answer === undefined) {
    return {
      content: [{ type: "text", text: "User cancelled the prompt." }],
      details: { mode: "input", cancelled: true },
    };
  }
  return {
    content: [{ type: "text", text: answer }],
    details: { mode: "input", cancelled: false },
  };
}

export function registerBelmontAskUserTool(pi: ExtensionAPI): void {
  pi.registerTool(buildBelmontAskUserTool());
}
