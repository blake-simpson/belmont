**Asking the user.** When this skill needs a clarifying or decision
answer, don't bury the question in prose for the user to type a reply
to. Surface it as a real prompt:

1. **Inside the Belmont harness** the `belmont_ask_user` tool is
   available — call it. Prefer `questions: [{ question, context,
   options: [{ label, description }] }]` when context or option details
   help the user decide; use legacy `question` + `choices` for simple
   one-offs. Choice prompts include a "write my own answer" path by
   default (`allowCustomAnswer: false` only when arbitrary text is
   invalid). The tool returns the user's answer; batched calls return a
   JSON answers object. Batch related questions into as few calls as you
   can.
2. **Standalone** (vanilla Claude Code, Codex CLI, Cursor, or plain pi
   without the harness) the tool is absent. Use the host's own question
   UI if it has one (e.g. Claude Code's AskUserQuestion); otherwise ask
   in plain prose and proceed on the user's reply.

Probe once: if `belmont_ask_user` errors because no UI is attached
(auto/print/RPC mode), fall back to asking directly in your response.
Prefer offering concrete options over open-ended questions wherever the
answer space is small and known, but include enough `context` for the
user to understand the trade-off without rereading the transcript.
