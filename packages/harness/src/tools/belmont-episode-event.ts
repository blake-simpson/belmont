// belmont_episode_event — small wrapper around the FS append helper in
// state/episodic.ts. M5 lands the registration so M8's auto loop has a
// clean way to log phase transitions and decide-ladder outcomes; the
// helper itself is shared with the scope-guard revert path.

import { Type, type Static } from "typebox";
import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from "../pi/sdk.js";
import {
  appendOrCreateEpisode,
  type EpisodeKind,
} from "../state/episodic.js";

const EPISODE_EVENT_SCHEMA = Type.Object({
  slug: Type.String({
    description:
      "Date-suffix slug for the file, e.g. 'm5-state-machine' → .belmont/memory/episodic/<today>-m5-state-machine.md. Lowercase letters, digits, and hyphens.",
    pattern: "^[a-z0-9][a-z0-9-]*$",
  }),
  kind: Type.Union(
    [
      Type.Literal("transition"),
      Type.Literal("scope_revert"),
      Type.Literal("phase"),
      Type.Literal("note"),
    ],
    {
      description:
        "Event kind tag. Surfaces in the bullet prefix; lets later readers filter the events list.",
    },
  ),
  content: Type.String({
    description: "One-line bullet content (no leading '- ').",
    minLength: 1,
    maxLength: 500,
  }),
  task_id: Type.Optional(
    Type.String({
      description:
        "Optional task identifier (e.g. 'P0-3'). Surfaces in the bullet tag as [<kind>/<task_id>].",
    }),
  ),
});

export type BelmontEpisodeEventInput = Static<typeof EPISODE_EVENT_SCHEMA>;

export type BelmontEpisodeEventDetails = {
  relativePath: string;
  created: boolean;
};

export function buildBelmontEpisodeEventTool(): ToolDefinition<
  typeof EPISODE_EVENT_SCHEMA,
  BelmontEpisodeEventDetails
> {
  return {
    name: "belmont_episode_event",
    label: "Belmont episode event",
    description:
      "Append (or create) an episodic event under .belmont/memory/episodic/<today>-<slug>.md. Use to log phase transitions, decide-ladder outcomes, or noteworthy observations. The harness writes here automatically for transitions and scope reverts.",
    parameters: EPISODE_EVENT_SCHEMA,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await executeBelmontEpisodeEvent(ctx.cwd, params);
    },
  };
}

export async function executeBelmontEpisodeEvent(
  cwd: string,
  params: BelmontEpisodeEventInput,
): Promise<AgentToolResult<BelmontEpisodeEventDetails>> {
  const result = await appendOrCreateEpisode({
    cwd,
    slug: params.slug,
    kind: params.kind as EpisodeKind,
    content: params.content,
    ...(params.task_id !== undefined ? { taskId: params.task_id } : {}),
  });

  const verb = result.created ? "wrote" : "appended to";
  return {
    content: [
      { type: "text", text: `${verb} ${result.relativePath}` },
    ],
    details: result,
  };
}

export function registerBelmontEpisodeEventTool(pi: ExtensionAPI): void {
  pi.registerTool(buildBelmontEpisodeEventTool());
}
