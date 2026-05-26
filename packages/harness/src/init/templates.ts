// Fresh-project template bodies used by `belmont init` and the in-pi
// `/belmont:init` handler. The dogfooded `.belmont/` at the Belmont
// source repo's root is far richer (see §15) — these templates are the
// minimum viable scaffold for any consumer project.

export function belmontMdTemplate(projectName: string, isoDate: string): string {
  return `---
schema: belmont.entrypoint.v1
updated_at: ${isoDate}
---

# ${projectName}

## Identity

(One paragraph: what this project is and who it's for. Re-run
\`/belmont:working-backwards\` when this changes meaningfully.)

## PR/FAQ

### Future press release

(Working-backwards artifact. Filled in by \`/belmont:working-backwards\`.)

### FAQ

(Anticipated questions + answers.)

## Master PRD

(One \`### <feature>\` subsection per feature: status
\`planned | in-progress | shipped\` + 2–3 sentence brief. Detailed specs
live in \`memory/prds/prd-<topic>.md\`.)

## Glossary

(Project nouns. Agents must use these terms verbatim.)

## Memory map

| Topic | Kind | File | Read when |
|---|---|---|---|
| (filled in as PRDs / ADRs / subsystems / constraints land) | | | |
`;
}

export function preferencesMdTemplate(isoDate: string): string {
  return `---
schema: belmont.preferences.v1
updated_at: ${isoDate}
---

# Preferences

- (Project-wide rules for the agent. Keep ≤60 lines; lint warns at 55.)
`;
}

export function progressMdTemplate(): string {
  // Empty PROGRESS — milestones land via /belmont:plan in M4+.
  return `# PROGRESS\n`;
}

export function modelsJsonTemplate(): string {
  // Canonical 3-tier + 11-agent shape per v2.3 §9.1. Authored at M3 as
  // a starter for `belmont init`; the formal schema validation lands at
  // M7. Treat the per-tier provider/model choices as defaults the user
  // can edit before first auto run.
  const config = {
    schema: "belmont.models.v1",
    tiers: {
      high: {
        provider: "codex",
        model: "gpt-5.5",
        thinking: "high",
        auth: "subscription",
      },
      medium: {
        provider: "kimi",
        model: "kimi-k2",
        thinking: "medium",
        auth: "subscription",
      },
      low: {
        provider: "openai-compatible",
        model: "qwen3-coder",
        thinking: "low",
        baseURL: "http://127.0.0.1:11434/v1",
        auth: "local",
      },
    },
    agents: {
      working_backwards: "high",
      codebase: "high",
      design: "high",
      planning: "high",
      implementation: "high",
      verification: "medium",
      code_review: "high",
      reconciliation: "medium",
      status: "low",
      next: "low",
      debug: "high",
    },
    features: {
      web: false,
      lean_ctx: true,
    },
    ctx_thresholds: {
      amber: 80000,
      red: 120000,
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function gitignoreTemplate(): string {
  // .belmont/ entries that must NOT be committed (gitignored). The
  // root-of-project .gitignore should ALSO include these — but a
  // belmont-local .gitignore makes the policy self-evident.
  return `# Belmont local state — not committed.
auto.json
auto.stop
.cache/
mcp-tools-cache.json
memory/steering/
`;
}
