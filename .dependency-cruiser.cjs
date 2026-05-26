// @ts-check
/**
 * Belmont monorepo dependency boundary rules (v2.3 §3.2).
 *
 * Strict direction:
 *   @belmont/cli → @belmont/harness → @belmont/skills → @belmont/knowledge-schema
 *
 * AND: `@earendil-works/pi-coding-agent` may ONLY be imported from
 * `packages/harness/src/pi/*.ts` (B5 anti-corruption layer).
 *
 * Run: `pnpm dep-check` (wired into `pnpm build` + `pnpm test`).
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-knowledge-schema-deps",
      severity: "error",
      comment:
        "@belmont/knowledge-schema is pure: must not depend on any sibling Belmont package.",
      from: { path: "^packages/knowledge-schema/" },
      to: {
        path: "^packages/(skills|harness|cli)/",
      },
    },
    {
      name: "no-skills-up-deps",
      severity: "error",
      comment: "@belmont/skills may depend only on @belmont/knowledge-schema.",
      from: { path: "^packages/skills/" },
      to: { path: "^packages/(harness|cli)/" },
    },
    {
      name: "no-harness-up-deps",
      severity: "error",
      comment: "@belmont/harness may depend on knowledge-schema + skills only.",
      from: { path: "^packages/harness/" },
      to: { path: "^packages/cli/" },
    },
    {
      name: "no-pi-outside-harness",
      severity: "error",
      comment:
        "B5 trust boundary: @earendil-works/pi-coding-agent may ONLY be imported from packages/harness/src/pi/*.ts.",
      from: {
        path: "^packages/(knowledge-schema|skills|cli)/",
      },
      to: {
        path: "node_modules/@earendil-works/pi-coding-agent",
      },
    },
    {
      name: "no-pi-outside-harness-pi-subdir",
      severity: "error",
      comment:
        "B5 trust boundary: even inside @belmont/harness, only files under src/pi/ may import the pi SDK.",
      from: {
        path: "^packages/harness/src/(?!pi/)",
      },
      to: {
        path: "node_modules/@earendil-works/pi-coding-agent",
      },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "Imports that can't resolve indicate a missing dep, a typo, OR a forbidden cross-boundary import. Belmont's monorepo uses workspace `workspace:*` deps + the pi boundary; an unresolvable import is always a bug.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-pi-by-package-name",
      severity: "error",
      comment:
        "Belt-and-braces: catch `@earendil-works/pi-coding-agent` imports by the package name string (matches even when the package is not in the importer's node_modules, which would otherwise leave the boundary unguarded by the path-based rules above).",
      from: {
        path: "^packages/(knowledge-schema|skills|cli)/",
      },
      to: {
        dependencyTypes: ["npm", "npm-no-pkg", "npm-unknown", "unknown"],
        path: "^@earendil-works/pi-coding-agent",
      },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    includeOnly: "^(packages|apps)/",
    exclude: { path: "(node_modules|dist|\\.d\\.ts$|/test/|\\.test\\.ts$)" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
