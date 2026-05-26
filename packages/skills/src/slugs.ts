// The canonical 8 Belmont skills (v2.3 §10.1). The order is the
// canonical install/render order; do not reorder casually — it is
// the order surfaced in `belmont-skills install` output and in the
// compatibility-matrix doc.

export const SKILLS = [
  "working-backwards",
  "plan",
  "next",
  "implement",
  "verify",
  "status",
  "prototype",
  "debug",
] as const;

export type Slug = (typeof SKILLS)[number];
