# Supported Tools

Belmont skills install as agentskills.io-format folders at `.agents/skills/belmont/<skill>/SKILL.md`. All eight supported AI CLIs auto-discover this path natively — the install does **zero per-tool wiring** for skill *discovery*. Three tools additionally get per-skill autocomplete wiring so Belmont shows up grouped in their pickers: Claude Code discovers slash commands at `.claude/commands/<name>.md` (subfolders become `:`-namespace prefixes → `/belmont:<skill>`; Belmont symlinks each at the canonical SKILL.md), opencode discovers them at `.opencode/command/<name>.md` (subfolders become `/`-namespace prefixes → `/belmont/<skill>`; Belmont generates small wrapper commands that delegate to the canonical SKILL.md — see the opencode section for why these can't be symlinks), and Codex gets per-skill UI metadata at `<skill>/agents/openai.yaml` (`interface.display_name: "belmont:<skill>"`) so typing `$belmont` in the composer lists every skill — see the Codex section for why its `/` menu can't be extended.

| Tool               | Wiring                                                               | How to use                                              |
|--------------------|----------------------------------------------------------------------|---------------------------------------------------------|
| **Claude Code**    | `.claude/agents/belmont` symlink + `.claude/commands/belmont/<skill>.md` per-skill symlinks → `.agents/skills/belmont/<skill>/SKILL.md` | `/belmont:product-plan`, `/belmont:implement`, etc.     |
| **Codex**          | `.agents/skills/belmont/<skill>/agents/openai.yaml` generated per skill (`interface.display_name: "belmont:<skill>"`) — skill content auto-discovered via `.agents/skills/` (Codex 0.126+) | Type `$belmont` → all skills in the `$`-mention popup; also `/skills` or prompt `belmont:<skill>` |
| **Cursor**         | none — `.agents/skills/` auto-discovered (Cursor Skills system)      | Prompt `belmont:<skill>` — auto-loaded by description   |
| **Windsurf**       | none — `.agents/skills/` auto-discovered (Cascade v1.13.6+)          | Prompt `belmont:<skill>` — auto-loaded by description   |
| **Gemini**         | none — `.agents/skills/` is the documented alias for `.gemini/skills/` | Prompt `belmont:<skill>` — surfaces via `/skills`       |
| **GitHub Copilot** | none — `.agents/skills/` auto-discovered                              | Prompt `belmont:<skill>` — surfaces via Copilot CLI     |
| **Pi** ([pi.dev](https://pi.dev)) | none — `.agents/skills/` auto-discovered (agentskills.io)             | Prompt `belmont:<skill>` — Pi loads SKILL.md by description |
| **opencode** ([opencode.ai](https://opencode.ai)) | `.opencode/command/belmont/<skill>.md` generated per-skill wrapper commands delegating to `.agents/skills/belmont/<skill>/SKILL.md` (skills also auto-discovered via `.agents/skills/`) | `/belmont/product-plan`, `/belmont/implement`, etc. (or prompt `belmont:<skill>` — the `skill` tool) |
| **Any other tool** | none                                                                  | Point your tool at `.agents/skills/belmont/<skill>/SKILL.md` |

Each `<skill>/SKILL.md` carries `name:` + `description:` YAML frontmatter (required by agentskills.io) plus a `references/` subdir with the progressive-disclosure files that skill body references.

Belmont detects which tools to install for via three signals:
- conventional project dirs (`.claude/`, `.codex/`, `.cursor/`, `.pi/`, `.opencode/`, …) already present;
- tool binaries on PATH (`claude`, `codex`, `cursor-agent`, `gemini`, `copilot`, `pi`, `opencode`);
- a Belmont skill-routing section in `AGENTS.md` / `GEMINI.md` (signals a previous install), or a root `opencode.json` / `opencode.jsonc` (opencode's `.opencode/` dir is optional).

## Headless invocation

Belmont's `auto` loop shells out to each tool's CLI in headless mode. The flag combinations are kept current with each tool's docs:

| Tool          | Binary           | Invocation                                                                                                              |
|---------------|------------------|-------------------------------------------------------------------------------------------------------------------------|
| Claude Code   | `claude`         | `claude -p "<prompt>" --permission-mode bypassPermissions --allowedTools "Bash,Read,Write,Edit,..." --output-format stream-json --verbose` |
| Codex         | `codex`          | `codex exec "<prompt>" --dangerously-bypass-approvals-and-sandbox --json -C <root>`                                     |
| Cursor        | `cursor-agent`   | `cursor-agent -p --force --output-format json "<prompt>"` (prompt is the trailing positional)                           |
| Gemini        | `gemini`         | `gemini -p "<prompt>" --approval-mode yolo --output-format json` (`--yolo` is deprecated)                               |
| GitHub Copilot| `copilot`        | `copilot -p "<prompt>" --yolo`                                                                                          |
| Pi            | `pi`             | `pi -p [--provider <p> --model <m>] "<prompt>"` — provider/model resolved from `~/.belmont/local-llms.json`; YOLO is Pi's default so no auto-approve flag is needed |
| opencode      | `opencode`       | `opencode run --dangerously-skip-permissions [--model <provider/model>] "<prompt>"` — plain-text output (no `--format json`: that emits an escaped event stream the decision extractor can't read); `deny` rules in `opencode.json` still win over the skip flag |

Cursor's CLI is installed as both `cursor-agent` (legacy) and `agent` (current canonical name) — Belmont targets `cursor-agent` for stability, since the unambiguous name is less likely to collide with other tools that might expose a generic `agent` binary.

## Per-tool usage

### Claude Code

Skills become native slash commands:

```
/belmont:working-backwards  Define product vision (PR/FAQ)
/belmont:product-plan       Interactive PRD creation
/belmont:tech-plan          Technical implementation plan
/belmont:implement          Implement next milestone (full pipeline)
/belmont:next               Implement next single task (lightweight)
/belmont:verify             Run verification and code review
/belmont:loop <feature>     Drive one feature to completion (implement→verify→next→status) via /loop
/belmont:debug              Debug router (choose auto or manual)
/belmont:debug-auto         Auto debug loop (agent-verified)
/belmont:debug-manual       Manual debug loop (user-verified, faster)
/belmont:status             View progress
/belmont:review-plans       Review document alignment and detect drift
/belmont:repair             Repair a PROGRESS.md whose task states no longer parse
/belmont:cleanup            Archive completed features, reduce token bloat
/belmont:reset              Reset state and start fresh
```

### Codex / Cursor / Windsurf / Gemini / GitHub Copilot / Pi / opencode

All seven auto-discover `.agents/skills/belmont/<skill>/SKILL.md`. Open the tool in your project directory and prompt with a skill reference like `belmont:implement` — the CLI's Skills system surfaces and activates the skill via its `description:` frontmatter.

> The `loop` skill is conditional: Claude Code gets `/belmont:loop`, and Codex installs `$belmont:loop` so it can hand off to Goal mode via `/goal`. Cursor, Windsurf, Gemini, GitHub Copilot, Pi, and opencode do not have an equivalent interactive loop primitive, so Belmont keeps `loop` off their default shared skill surface. Use `belmont auto` (headless) for the equivalent end-to-end drive there.

For Codex specifically, typing `$belmont` lists every Belmont skill in the composer's mention popup (see its section below); the `/skills` slash command also lists discovered skills. For Gemini, `/skills` does the same. For Cursor, you can also browse them via the Skills panel in the IDE. For opencode, every discovered skill is listed in the model's `<available_skills>` block and loaded on demand via the native `skill` tool — and opencode additionally gets first-class slash commands (`/belmont/<skill>`); see its section below.

### Codex

Codex (0.126+) discovers Belmont's skills with zero wiring — its skill loader scans `.agents/skills/` from the working directory up to the repo root (plus `~/.agents/skills/`), reading each `<skill>/SKILL.md`. Skills activate implicitly via `description:` matching, explicitly via the `/skills` picker, or via `$`-mentions in the composer.

**Why there's no `/belmont` slash command:** Codex's TUI `/` menu lists built-in commands only and is not extensible — the old `~/.codex/prompts` custom-prompt feature (which could add entries) was deprecated in favor of skills and then removed upstream. The grouped-autocomplete experience lives behind `$` instead: typing `$` opens a fuzzy-filtered mention popup over all discovered skills, showing each skill's display name and description.

Belmont therefore writes per-skill UI metadata at `.agents/skills/belmont/<skill>/agents/openai.yaml`:

```yaml
interface:
  display_name: "belmont:<skill>"
```

Codex's mention popup prefers `interface.display_name` over the frontmatter `name:` and fuzzy-matches your filter against it — the shared `belmont:` prefix is what groups the skills. Typing `$belmont` lists the full set:

```
› $belmont

  belmont:next        Implement just the next single pending task…
  belmont:status      Show current status of belmont tasks…
  belmont:verify      Run verification and code review…
  …
```

Selecting one inserts `$<skill>` (the canonical frontmatter name) and the skill loads when you submit. Two details to know: display names longer than 21 characters are visually truncated in the popup (`belmont:working-backwards` → `belmont:working-back…`) but still match the full filter text, and per agentskills.io the `agents/` subdir is product-specific config — every other supported CLI ignores it, so the canonical skill folders stay single-source.

When Codex is selected during install, `loop` is included in `.agents/skills/belmont/` and appears as `belmont:loop` in the `$`-mention popup. It preflights the feature and then starts `/goal` with the Belmont implement → verify → next → status recipe. Codex's `/` menu is still built-ins only; `$belmont:loop` is the supported entrypoint.

Because `.agents/skills/` is shared by every installed CLI, a mixed install (say `--tools codex,opencode`) puts `loop` where the other tools can see it. Belmont still keeps it out of their slash-command palettes — opencode gets no `/belmont/loop` — so the only entrypoints Belmont offers you are Claude Code's `/belmont:loop` and Codex's `$belmont:loop`. It isn't invisible: opencode's skill tool reads the same directory and can still load the file. The skill body refuses outside Claude Code and Codex, which is the guard for that case. And once the folder is installed, a later install or `belmont update` from a machine without Codex leaves it alone instead of deleting it (see [directory-structure.md](directory-structure.md)).

The metadata files are (re)generated by `belmont install` / `belmont update` whenever Codex is a selected tool, and are pruned automatically with their skill folder when a skill is removed.

**Planning skills and structured questions**: Belmont's planning skills (`$belmont:product-plan` and `$belmont:tech-plan`) rely on Codex's structured question UI so users can answer keyboard-navigable pick-lists. In Codex, run planning skills through plan mode:

```text
/plan $belmont:product-plan <brief>
/plan $belmont:tech-plan <feature or brief>
```

If those skills are invoked in a Codex turn where the structured question tool is unavailable, they should stop and ask the user to restart with `/plan ...` rather than approximating the picker with Markdown.

**Model tiers**: Codex model IDs are single model slugs. Belmont's built-in tier mapping is optimized for the default quality/speed/token balance: `low` uses `gpt-5.4-mini` with low reasoning effort, `medium` uses `gpt-5.4` with medium reasoning effort, and `high` uses `gpt-5.5` with high reasoning effort. Override any tier in `~/.belmont/local-llms.json` (or per-project `.belmont/local-llms.json`):

```json
{
  "codex": {
    "tiers": {
      "low":    { "model": "gpt-5.4-mini", "reasoning_effort": "low" },
      "medium": { "model": "gpt-5.4", "reasoning_effort": "medium" },
      "high":   { "model": "gpt-5.5", "reasoning_effort": "high" }
    }
  }
}
```

Per-shot env-var overrides: `BELMONT_CODEX_MODEL_<TIER>` / `BELMONT_CODEX_MODEL`, `BELMONT_CODEX_REASONING_EFFORT_<TIER>` / `BELMONT_CODEX_REASONING_EFFORT`, and optionally `BELMONT_CODEX_SERVICE_TIER_<TIER>` / `BELMONT_CODEX_SERVICE_TIER` (for example `fast`). This is useful when OpenAI ships a newer Codex-available model before Belmont updates its built-in registry, or when you want a cheaper/faster tier mapping for a specific repository.

### Pi (local-LLM workflow)

Pi ([pi.dev](https://pi.dev)) is uniquely well-suited to driving Belmont with locally-hosted models — its YOLO-by-default tool execution and OpenAI-compatible provider configuration mean it can run Belmont's auto loop offline against LM Studio, Ollama, vLLM, llama.cpp's server, etc.

**Pi-side configuration** (`~/.pi/agent/models.json`) — declare each runtime as a provider:

```json
{
  "providers": {
    "lm-studio": {
      "baseUrl": "http://localhost:1234/v1",
      "api": "openai-completions",
      "apiKey": "lm-studio",
      "compat": { "supportsDeveloperRole": false },
      "models": [
        { "id": "qwen/qwen3.6-35b-a3b" }
      ]
    }
  }
}
```

For Ollama swap `baseUrl` to `http://localhost:11434/v1`. The `apiKey` is required by Pi but ignored by local servers. `supportsDeveloperRole: false` is required for any backend that doesn't expose OpenAI's `developer` role (most local servers don't).

**Belmont-side tier mapping** (`~/.belmont/local-llms.json`) — map Belmont's `low`/`medium`/`high` tiers to Pi's providers + models:

```json
{
  "pi": {
    "tiers": {
      "low":    { "provider": "lm-studio", "model": "qwen/qwen3.6-35b-a3b" },
      "medium": { "provider": "lm-studio", "model": "qwen/qwen3.6-35b-a3b" },
      "high":   { "provider": "lm-studio", "model": "qwen/qwen3.6-35b-a3b" }
    }
  }
}
```

Mix and match — point `high` at a stronger model (e.g. DeepSeek-Coder via Ollama) and keep `low`/`medium` on a fast Qwen for code edits. Per-project overrides go in `<project>/.belmont/local-llms.json`. Per-shot env-var overrides: `BELMONT_PI_PROVIDER_<TIER>` / `BELMONT_PI_MODEL_<TIER>` (or single-value `BELMONT_PI_PROVIDER` / `BELMONT_PI_MODEL` applied to every tier).

If neither file nor env var is present, Belmont passes no `--model` flag and Pi falls back to whatever default `~/.pi/agent/models.json` defines — Belmont stays out of Pi's way.

**Tool-calling caveat for local Qwen:** Qwen2.5-Coder on LM Studio has [broken tool calling](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/825) — the model emits a non-hermes `<tools>` tag format that LM Studio's OpenAI-compat layer doesn't parse, and `tool_calls` arrives empty. Belmont's auto loop is 100% tool-call-driven, so file edits and bash silently fail. **Use Qwen3-Coder (or newer)** which uses the standard hermes format. Different runtimes (Ollama, vLLM) parse Qwen2.5-Coder correctly; the issue is specifically the LM Studio + Qwen2.5 combination.

### opencode

opencode ([opencode.ai](https://opencode.ai)) discovers Belmont's skills with zero wiring — its skill scanner walks `.agents/skills/**/SKILL.md` recursively (symlinks followed), so the canonical install at `.agents/skills/belmont/<skill>/SKILL.md` is picked up as-is. Skill identity comes from the SKILL.md `name:`/`description:` frontmatter; opencode injects the list into the system prompt and the agent activates a skill through its native `skill` tool. opencode also reads `AGENTS.md` natively, so Belmont's repo guidance applies without extra config.

Skills, however, are only visible to the *model* — opencode's TUI `/` autocomplete lists **commands**, not skills, so on their own the skills never show up when you type `/belmont`. Belmont therefore also installs per-skill slash commands at `.opencode/command/belmont/<skill>.md`. opencode names a command by its path relative to `command/` (minus `.md`), so these register as `/belmont/implement`, `/belmont/status`, etc. — typing `/belmont` lists them all, mirroring Claude Code's `/belmont:<skill>` experience (opencode namespaces with `/` rather than `:`).

Unlike the Claude Code wiring, these are **generated wrapper files, not symlinks to SKILL.md**. opencode merges a command file's frontmatter *over* the path-derived name, so the `name:` key that agentskills.io requires in every SKILL.md would override `belmont/<skill>` and register the command under the bare skill name (e.g. `implement`) — shadowing the skill and never appearing under `/belmont`. Each wrapper instead carries only the skill's `description:` (for the autocomplete) and a one-line body delegating to the canonical `.agents/skills/belmont/<skill>/SKILL.md`, which also keeps the skill's relative `references/` paths resolving from the real skill directory. Wrappers are regenerated on every `belmont install`/`update`.

**Interactive mode**: open `opencode` in your project and type `/belmont` to pick a command (e.g. `/belmont/implement`), or prompt `belmont:implement` / describe the task — description-matching via the `skill` tool works too.

**Auto mode**: `belmont auto --tool opencode`. Belmont shells out to `opencode run --dangerously-skip-permissions`, which auto-approves everything *not explicitly denied* in your `opencode.json` `permission` block — `deny` rules still win, so you can keep guardrails (e.g. `"bash": {"rm -rf *": "deny"}`) while running unattended.

**Model tiers**: opencode model IDs are `provider/model` tokens. Belmont's built-in tier mapping assumes the Anthropic provider (`anthropic/claude-haiku-4-5` / `anthropic/claude-sonnet-4-6` / `anthropic/claude-opus-4-8`). If you run another provider (opencode zen, OpenAI, a local model through LM Studio, …), override per tier in `~/.belmont/local-llms.json` (or per-project `.belmont/local-llms.json`):

```json
{
  "opencode": {
    "tiers": {
      "low":    { "model": "opencode/grok-code" },
      "medium": { "model": "opencode/gpt-5.1-codex" },
      "high":   { "model": "opencode/gpt-5.1-codex" }
    }
  }
}
```

The `model` field takes a full `provider/model` ID; alternatively split it across `provider` + `model` (Pi-schema symmetry) and Belmont joins them with `/`. Per-shot env-var overrides: `BELMONT_OPENCODE_MODEL_<TIER>` (per tier) or `BELMONT_OPENCODE_MODEL` (all tiers). When no tier applies (no `models.yaml` for the feature), Belmont passes no `--model` flag and opencode uses the default model from its own config.

### Generic / Other Tools

If your tool isn't auto-detected, the skill files are still plain markdown. Point your tool at:

- **Skills**: `.agents/skills/belmont/<skill>/SKILL.md` plus the `<skill>/references/` subdir
- **Agents**: `.agents/belmont/codebase-agent.md`, `implementation-agent.md`, etc.
- **State**: `.belmont/PR_FAQ.md`, `.belmont/PRD.md`, `.belmont/PROGRESS.md`, `.belmont/TECH_PLAN.md`, `.belmont/features/`

You can paste the skill content directly into a chat or configure your tool to load it as system context.

## Migration from older Belmont versions

If you've upgraded from a Belmont version that wrote into `.codex/belmont/`, `.cursor/rules/belmont/`, `.windsurf/rules/belmont/`, `.gemini/rules/belmont/`, `.copilot/belmont/`, `.claude/skills/belmont` (the 0.10.x nested-namespace symlink that Claude Code 2.1.x silently ignored), `.claude/plugins/belmont` (a brief 0.10.4-dev attempt that also wasn't auto-discovered), or maintained a `belmont:skill-routing` section in `AGENTS.md` / `GEMINI.md`, the next `belmont install` (or `belmont update`) automatically removes those legacy paths. The cleanup is idempotent — safe to re-run.
