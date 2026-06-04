**Asking the user.** When this skill needs a clarifying or decision
answer, don't bury the question in prose for the user to type a reply
to. Surface it as a real prompt:

1. **Inside the Belmont harness** the `belmont_ask_user` tool is
   available — call it. Pass `choices` (2–8 mutually-exclusive options)
   for a pick-list dialog, or omit `choices` for a free-text question
   (optionally with a `placeholder`). The tool returns the user's
   answer. Batch related questions into as few calls as you can.
2. **Standalone** (vanilla Claude Code, Codex CLI, Cursor, or plain pi
   without the harness) the tool is absent. Use the host's own question
   UI if it has one (e.g. Claude Code's AskUserQuestion); otherwise ask
   in plain prose and proceed on the user's reply.

Probe once: if `belmont_ask_user` errors because no UI is attached
(auto/print/RPC mode), fall back to asking directly in your response.
Prefer offering concrete options over open-ended questions wherever the
answer space is small and known.
