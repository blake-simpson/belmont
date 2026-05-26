// Shared episodic-event helper used by both `belmont_episode_event`
// (tools/belmont-episode-event.ts) and the scope-guard revert logging
// path (hooks/scope-guard.ts).
//
// Episodic files live under `.belmont/memory/episodic/` with the D-002
// date-only grammar: `YYYY-MM-DD-<slug>.md`. The slug discriminates
// sub-day events — no HH-mm-ss segment.
//
// First write of the day for a given slug creates the file with the
// canonical `belmont.episode.v1` frontmatter. Subsequent writes append
// a bullet under the `## Events` heading (created if absent). This
// matches the M2 EPISODE_SCHEMA + D-002 grammar exactly.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type EpisodeKind = "transition" | "scope_revert" | "phase" | "note";

export type AppendEpisodeInput = {
  cwd: string;
  /** Slug after the date prefix, e.g. `m5-state-machine`. Must match `[a-z0-9][a-z0-9-]*`. */
  slug: string;
  kind: EpisodeKind;
  /** One-line bullet content (no leading `- `). */
  content: string;
  /** Optional task ID (`P0-3`) — surfaces under a `task_id:` tag in the bullet. */
  taskId?: string;
  /** Injectable for tests; defaults to UTC `YYYY-MM-DD`. */
  todayIso?: string;
};

export type AppendEpisodeResult = {
  relativePath: string;
  created: boolean;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function appendOrCreateEpisode(
  input: AppendEpisodeInput,
): Promise<AppendEpisodeResult> {
  if (!SLUG_RE.test(input.slug)) {
    throw new Error(
      `Invalid episodic slug '${input.slug}'. Must match ${SLUG_RE.source}.`,
    );
  }
  const today = input.todayIso ?? todayUtcIso();
  const filename = `${today}-${input.slug}.md`;
  const relativePath = `.belmont/memory/episodic/${filename}`;
  const absPath = join(input.cwd, ".belmont", "memory", "episodic", filename);

  let existing: string | null = null;
  try {
    existing = await readFile(absPath, "utf8");
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }

  const bullet = formatBullet(input.kind, input.content, input.taskId);

  if (existing === null) {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, scaffoldFile(today, input.slug, bullet), "utf8");
    return { relativePath, created: true };
  }

  const next = appendBulletUnderEvents(existing, bullet);
  if (next !== existing) {
    await writeFile(absPath, next, "utf8");
  }
  return { relativePath, created: false };
}

function todayUtcIso(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString().padStart(4, "0");
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = now.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function formatBullet(
  kind: EpisodeKind,
  content: string,
  taskId: string | undefined,
): string {
  const tag = taskId ? `[${kind}/${taskId}]` : `[${kind}]`;
  return `- ${tag} ${content.trim()}`;
}

function scaffoldFile(date: string, slug: string, firstBullet: string): string {
  const heading = slugToHeading(slug);
  return [
    "---",
    "schema: belmont.episode.v1",
    `date: ${date}`,
    "---",
    "",
    `# ${date} — ${heading}`,
    "",
    "## Events",
    "",
    firstBullet,
    "",
  ].join("\n");
}

function slugToHeading(slug: string): string {
  return slug
    .split("-")
    .filter((p) => p.length > 0)
    .map((p) => (/^m\d+$/.test(p) ? p.toUpperCase() : p))
    .join(" ");
}

export function appendBulletUnderEvents(md: string, bullet: string): string {
  const lines = md.split("\n");
  const eventsIdx = lines.findIndex((l) => /^##\s+Events\s*$/i.test(l));
  if (eventsIdx === -1) {
    // No Events section yet — append one after the body.
    const trimmed = stripTrailingBlank(lines);
    return [...trimmed, "", "## Events", "", bullet, ""].join("\n");
  }
  // Find the end of the Events section (next H2 or EOF).
  let endIdx = lines.length;
  for (let i = eventsIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] as string)) {
      endIdx = i;
      break;
    }
  }
  // Skip back over trailing blanks inside the section.
  let insertAt = endIdx;
  while (insertAt > eventsIdx + 1 && (lines[insertAt - 1] ?? "").trim() === "") {
    insertAt -= 1;
  }
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  // Idempotence: if the bullet already exists in the section, no-op.
  for (let i = eventsIdx + 1; i < insertAt; i++) {
    if ((lines[i] ?? "").trim() === bullet.trim()) return md;
  }
  return [...before, bullet, ...after].join("\n");
}

function stripTrailingBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && (out[out.length - 1] ?? "").trim() === "") {
    out.pop();
  }
  return out;
}
