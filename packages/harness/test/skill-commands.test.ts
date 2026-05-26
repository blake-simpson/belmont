// Skill-command dispatcher — covers the harness side of v2.3 §10.4.
// We stand up a minimal ExtensionAPI stub that captures registerCommand
// + sendUserMessage calls, run the registrar, and exercise each
// command handler.

import { describe, expect, it, beforeEach } from "vitest";
import { _resetSkillCache, registerSkillCommands } from "../src/commands/skills.js";

type RegisteredHandler = (args: string, ctx: unknown) => Promise<void> | void;
type Sent = { content: string; options?: unknown };

function fakePi(): {
  pi: any;
  commands: Map<string, { description: string; handler: RegisteredHandler }>;
  sent: Sent[];
} {
  const commands = new Map<string, { description: string; handler: RegisteredHandler }>();
  const sent: Sent[] = [];
  const pi = {
    registerCommand(name: string, spec: { description: string; handler: RegisteredHandler }) {
      commands.set(name, spec);
    },
    sendUserMessage(content: string, options?: unknown) {
      sent.push({ content, options });
    },
  };
  return { pi, commands, sent };
}

beforeEach(() => _resetSkillCache());

describe("registerSkillCommands", () => {
  it("registers exactly the 7 LLM-dispatched skill commands (status uses the deterministic renderer)", () => {
    const { pi, commands } = fakePi();
    registerSkillCommands(pi);
    const names = [...commands.keys()].sort();
    expect(names).toEqual(
      [
        "belmont:debug",
        "belmont:implement",
        "belmont:next",
        "belmont:plan",
        "belmont:prototype",
        "belmont:verify",
        "belmont:working-backwards",
      ].sort(),
    );
    expect(commands.has("belmont:status"), "status must NOT be wired here").toBe(false);
  });

  it("each handler dispatches the materialized SKILL.md body via sendUserMessage", async () => {
    const { pi, commands, sent } = fakePi();
    registerSkillCommands(pi);
    const next = commands.get("belmont:next");
    expect(next).toBeDefined();
    await next!.handler("", {});
    expect(sent).toHaveLength(1);
    expect(sent[0]!.content).toMatch(/^---\nname: next\n/);
    expect(sent[0]!.content).toContain("# Belmont: Next");
    expect(sent[0]!.content).not.toMatch(/<!-- @include /);
  });

  it("appends '## Invocation arguments' when the user passes args", async () => {
    const { pi, commands, sent } = fakePi();
    registerSkillCommands(pi);
    const implement = commands.get("belmont:implement");
    await implement!.handler("P0-1 ", {});
    expect(sent[0]!.content).toMatch(/\n## Invocation arguments\n\nP0-1\n$/);
  });

  it("omits the invocation block when args is whitespace", async () => {
    const { pi, commands, sent } = fakePi();
    registerSkillCommands(pi);
    const debug = commands.get("belmont:debug");
    await debug!.handler("   ", {});
    expect(sent[0]!.content).not.toContain("## Invocation arguments");
  });

  it("caches per-slug materialization across two invocations of the same command", async () => {
    const { pi, commands, sent } = fakePi();
    registerSkillCommands(pi);
    const verify = commands.get("belmont:verify");
    await verify!.handler("", {});
    await verify!.handler("", {});
    expect(sent).toHaveLength(2);
    expect(sent[0]!.content).toBe(sent[1]!.content);
  });
});
