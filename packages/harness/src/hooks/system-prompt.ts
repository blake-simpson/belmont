// before_agent_start hook — appends Belmont's living knowledge to pi's
// system prompt so the agent reads BELMONT.md (entry point) and
// preferences.md every turn. Pi 0.75.5's `context` event handles
// messages-array pruning (the M9 lean-ctx slot) — system-prompt wiring
// belongs strictly here, for both interactive and auto-mode agents.
// See D-003-pi-extension-shape.md for the deviation from v2.3 §3.3's
// "before_agent_start (auto) + context (interactive)" framing.

import type { BeforeAgentStartEvent, BeforeAgentStartEventResult } from "../pi/sdk.js";
import { getSnapshot, refreshSnapshot } from "../state/snapshot.js";

export async function appendBelmontContext(
  event: BeforeAgentStartEvent,
  cwd: string,
): Promise<BeforeAgentStartEventResult | undefined> {
  let snapshot = getSnapshot(cwd);
  if (!snapshot) {
    snapshot = await refreshSnapshot(cwd);
  }
  if (!snapshot.hasBelmontDir) return undefined;

  const sections: string[] = [];
  if (snapshot.belmontMd) {
    sections.push("### .belmont/BELMONT.md", snapshot.belmontMd.trimEnd());
  }
  if (snapshot.preferencesMd) {
    sections.push("### .belmont/preferences.md", snapshot.preferencesMd.trimEnd());
  }
  if (sections.length === 0) return undefined;

  const block = [
    "",
    "## Belmont context",
    "",
    "The project ships a `.belmont/` directory with living knowledge.",
    "Read these files first; consult `.belmont/memory/{subsystems,decisions,constraints,prds}/`",
    "and `.belmont/PROGRESS.md` for the rest. Never edit `.belmont/PROGRESS.md` directly",
    "(the `belmont_transition` tool, landing in M5, is the only mutation path).",
    "",
    sections.join("\n\n"),
  ].join("\n");

  return { systemPrompt: event.systemPrompt + block };
}
