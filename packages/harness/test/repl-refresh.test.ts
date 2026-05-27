import { describe, expect, it, vi } from "vitest";

import { registerReplRefreshCommand } from "../src/commands/repl-refresh.js";

function makeCommandHarness() {
  const commands: Record<string, { description: string; handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const pi = {
    registerCommand: vi.fn((name: string, opts: { description: string; handler: (args: string, ctx: unknown) => Promise<void> }) => {
      commands[name] = opts;
    }),
  };
  return { pi, commands };
}

describe("registerReplRefreshCommand", () => {
  it("registers /belmont:repl-refresh", () => {
    const { pi } = makeCommandHarness();
    registerReplRefreshCommand(pi as unknown as Parameters<typeof registerReplRefreshCommand>[0]);
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "belmont:repl-refresh",
      expect.objectContaining({ description: expect.any(String), handler: expect.any(Function) }),
    );
  });

  it("invokes ctx.newSession() and notifies on success", async () => {
    const { pi, commands } = makeCommandHarness();
    registerReplRefreshCommand(pi as unknown as Parameters<typeof registerReplRefreshCommand>[0]);
    const newSession = vi.fn().mockResolvedValue({ cancelled: false });
    const notify = vi.fn();
    await commands["belmont:repl-refresh"]!.handler("", { newSession, ui: { notify } });
    expect(newSession).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("REPL refreshed.", "info");
  });

  it("notifies warning when newSession returns { cancelled: true }", async () => {
    const { pi, commands } = makeCommandHarness();
    registerReplRefreshCommand(pi as unknown as Parameters<typeof registerReplRefreshCommand>[0]);
    const newSession = vi.fn().mockResolvedValue({ cancelled: true });
    const notify = vi.fn();
    await commands["belmont:repl-refresh"]!.handler("", { newSession, ui: { notify } });
    expect(notify).toHaveBeenCalledWith("REPL refresh cancelled.", "warning");
  });
});
