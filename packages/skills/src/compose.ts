// Composer — materialize canonical SKILL.md sources into a target dir.
// Pure FS + string. The ONE directive is
// `<!-- @include _shared/<file>.md -->`; partials are inlined verbatim.
// Frontmatter is parsed (re-using @belmont/knowledge-schema) so we can
// assert that `name: <slug>` matches the directory basename. Writes are
// content-hashed for idempotence.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@belmont/knowledge-schema";

import { SKILLS, type Slug } from "./slugs.js";

const INCLUDE_RE = /^<!-- @include _shared\/([a-z0-9-]+\.md) -->\s*$/;
const REFERENCE_RE = /references\/([a-z0-9-]+\.md)\b/g;

export type ComposeOptions = {
  /** Absolute path to packages/skills/src/ (the canonical-source root). */
  source: string;
  /** Absolute path to the target directory (one subdir per slug). */
  target: string;
  /** Optional namespace prefix prepended to the materialized directory
   *  name AND to the frontmatter `name:` field. Used by the cross-harness
   *  install path to avoid colliding with vanilla skill names (e.g. a
   *  third-party `~/.agents/skills/prototype/` next to ours).
   *
   *  When set to `"belmont-"`, slug `plan` materializes to
   *  `<target>/belmont-plan/SKILL.md` with frontmatter `name: belmont-plan`.
   *  When unset (default), behaviour is unchanged from M4. The
   *  canonical sources keep their bare slug names in
   *  `packages/skills/src/<slug>/`. */
  namespacePrefix?: string;
};

export type ComposeEntry = {
  slug: Slug;
  /** Absolute path to <target>/<slug>/SKILL.md. */
  path: string;
  /** false when the existing target file already matched (idempotent skip). */
  written: boolean;
  /** Per-skill references copied into <target>/<slug>/references/. */
  references: string[];
};

export type ComposeError = {
  slug: Slug;
  code: "FRONTMATTER_INVALID" | "NAME_MISMATCH" | "PARTIAL_MISSING";
  message: string;
};

export type ComposeResult = {
  entries: ComposeEntry[];
  errors: ComposeError[];
};

async function readPartial(source: string, partial: string): Promise<string> {
  return await readFile(join(source, "_shared", partial), "utf8");
}

async function expandIncludes(source: string, body: string, slug: Slug, errors: ComposeError[]): Promise<string> {
  const lines = body.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const m = INCLUDE_RE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    try {
      const partialBody = await readPartial(source, m[1]!);
      out.push(partialBody.replace(/\n$/, ""));
    } catch {
      errors.push({ slug, code: "PARTIAL_MISSING", message: `_shared/${m[1]} not found` });
      out.push(line);
    }
  }
  return out.join("\n");
}

function findReferences(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(REFERENCE_RE)) found.add(m[1]!);
  return [...found].sort();
}

async function writeIfChanged(path: string, content: string): Promise<boolean> {
  const hash = createHash("sha256").update(content).digest("hex");
  try {
    const existing = await readFile(path, "utf8");
    if (createHash("sha256").update(existing).digest("hex") === hash) return false;
  } catch {
    // file missing; fall through to write
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

export async function composeSkill(slug: Slug, options: ComposeOptions): Promise<{ entry: ComposeEntry; errors: ComposeError[] }> {
  const errors: ComposeError[] = [];
  const prefix = options.namespacePrefix ?? "";
  const targetSlugName = `${prefix}${slug}`;
  const canonicalPath = join(options.source, slug, "SKILL.md");
  const canonical = await readFile(canonicalPath, "utf8");
  const { frontmatter, body, warnings } = parseFrontmatter(canonical);
  if (warnings.some((w) => w.severity === "error") || frontmatter === null) {
    errors.push({ slug, code: "FRONTMATTER_INVALID", message: `SKILL.md frontmatter missing or unparseable for ${slug}` });
  } else if (frontmatter.name !== slug) {
    errors.push({ slug, code: "NAME_MISMATCH", message: `frontmatter name=${String(frontmatter.name)} ≠ directory basename ${slug}` });
  }
  const expanded = await expandIncludes(options.source, body, slug, errors);
  const fmYaml = canonical.slice(0, canonical.length - body.length);
  const rewrittenFm = prefix === "" ? fmYaml : rewriteFrontmatterName(fmYaml, slug, targetSlugName);
  const materialized = rewrittenFm + expanded;
  const targetSkill = join(options.target, targetSlugName, "SKILL.md");
  const written = await writeIfChanged(targetSkill, materialized);
  const refs = findReferences(materialized);
  for (const ref of refs) {
    const refSrc = join(options.source, "references", ref);
    const refDst = join(options.target, targetSlugName, "references", ref);
    const refBody = await readFile(refSrc, "utf8");
    await writeIfChanged(refDst, refBody);
  }
  return { entry: { slug, path: targetSkill, written, references: refs }, errors };
}

/** Surgically rewrite a `name: <slug>` line inside a YAML frontmatter
 *  block so cross-harness installs can publish slugs as
 *  `belmont-<slug>` without forking the canonical sources. The block
 *  is bounded by `---` fences; we replace only the first matching
 *  `name:` line inside that block.
 *
 *  Belt + braces: if the line isn't found (custom frontmatter shape),
 *  the original string flows through unchanged — the NAME_MISMATCH
 *  guard upstream will have already complained when the canonical
 *  source's `name:` value didn't equal the slug. */
function rewriteFrontmatterName(fmYaml: string, fromName: string, toName: string): string {
  // ^name: <fromName>\s*$ within the frontmatter region (multi-line).
  const escaped = fromName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s*name:\\s*)${escaped}(\\s*)$`, "m");
  return fmYaml.replace(re, `$1${toName}$2`);
}

export async function compose(options: ComposeOptions): Promise<ComposeResult> {
  const entries: ComposeEntry[] = [];
  const errors: ComposeError[] = [];
  for (const slug of SKILLS) {
    const { entry, errors: e } = await composeSkill(slug, options);
    entries.push(entry);
    errors.push(...e);
  }
  return { entries, errors };
}

/**
 * Resolve the canonical source root of @belmont/skills as bundled in the
 * package. Always resolves relative to THIS module's URL — call from the
 * harness, the installer, anywhere; the answer is always the skills'
 * own `src/` directory, regardless of where the caller lives.
 */
export function bundledSourceDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const leaf = basename(here);
  if (leaf === "dist" || leaf === "src") return join(dirname(here), "src");
  return here;
}

/** @deprecated use bundledSourceDir(). Kept for one release for downstream callers. */
export function resolveBundledSource(_moduleFileUrl: string): string {
  return bundledSourceDir();
}

/** Materialize one canonical SKILL.md to a string (for in-process callers like the harness). */
export async function materializeSkill(slug: Slug, source: string): Promise<string> {
  const errors: ComposeError[] = [];
  const canonicalPath = join(source, slug, "SKILL.md");
  const canonical = await readFile(canonicalPath, "utf8");
  const { body } = parseFrontmatter(canonical);
  const expanded = await expandIncludes(source, body, slug, errors);
  const fmYaml = canonical.slice(0, canonical.length - body.length);
  return fmYaml + expanded;
}

// Side-effect free helper for tests.
export async function listShared(source: string): Promise<string[]> {
  const dir = join(source, "_shared");
  const entries = await readdir(dir);
  return entries.filter((n) => n.endsWith(".md")).sort();
}
