---
name: working-backwards
description: Run an Amazon-style Working Backwards (PR/FAQ) session. Use when the user mentions "PR/FAQ", "PRFAQ", "press release", "Working Backwards", or wants to define a product vision before detailed planning. First skill on a new project. Re-run only for major pivots.
---

# Belmont: Working Backwards

<!-- @include _shared/harness-optional.md -->

<!-- @include _shared/ask-user.md -->

You are running an interactive Working Backwards session. The output is
a one-page press release + 2–5 pages of FAQs + an appendix, written
into `.belmont/BELMONT.md > ## PR/FAQ`. The session also seeds the
Master PRD index in the same file with one `### <feature-name>` line
per feature mentioned in the appendix's product backlog.

This is **strategic planning only**. Do not implement anything. Do not
edit source code. Only write to `.belmont/BELMONT.md` (and, for the
Master PRD index, leave `### <feature-name>` placeholders pointing to
`memory/prds/prd-<topic>.md` that `/belmont:plan` will fill in later).

<!-- @include _shared/knowledge-discipline.md -->

## Update vs. create

Before starting, read `.belmont/BELMONT.md`'s `## PR/FAQ` section.

- **Section is empty or only contains placeholder copy** → CREATE: write
  the full PR/FAQ from scratch using `references/working-backwards-prfaq-template.md`.
- **Section has real content** → UPDATE: ask the user which sections to
  revise. Never replace the entire PR/FAQ. Preserve existing copy and
  refine only what the user names.

## Step 0 — Calibrate depth silently

Read the brief and consider which **Domains** below are in play and
which carry open questions. A PR/FAQ can range from a short internal
alignment doc to a company-level strategic document with extensive
internal FAQs. Depth is driven by ambiguity per domain, not a tier you
declare. Kick off `Explore` / `general-purpose` research sub-agents
whenever a **Research Trigger** below fires.

## Step 1 — Gather context

Ask the user iteratively (via `belmont_ask_user` — see "Asking the user"
above; one batch of structured questions) until you have concrete
answers for:

1. **Who is the customer?** Specific persona, not "users" — e.g.
   "parents of GCSE students in the UK" or "enterprise procurement
   managers".
2. **What is the single problem?** One problem per PR/FAQ. Split if
   the user names more than one.
3. **What is the proposed solution?** High-level only — no
   implementation detail.
4. **Launch date** — real or aspirational.
5. **The key customer benefit** — the one thing that matters most.
6. **Company / product name** — needed for the leader quote.

## Domains to cover

For a PR/FAQ session, the relevant domains are: customer, problem,
solution shape, customer benefit, competitive positioning, pricing,
trade-offs (with data), risks + mitigations, KPIs, supporting data,
leader-quote framing, customer-testimonial framing, launch + access,
regulatory / legal context.

## Research triggers

Spawn a research sub-agent when any of these appear: market sizing
(TAM/SAM/SOM), competitor messaging, pricing benchmarks, industry
survey data quantifying the customer problem, regulatory context (GDPR,
COPPA, HIPAA, age-gating), prior-art PR/FAQ examples, category
terminology customers actually use.

## Step 2 — Write the press release (1 page max)

If it spills past one page, the idea is not sharp enough — tighten,
do not extend. Read `references/working-backwards-prfaq-template.md`
for the 9-paragraph press-release structure and the rules:

- Customer language only — no internal jargon, no implementation.
- No weasel words ("nearly all", "huge improvement"). Replace with
  data ("7.6M customers", "+25 basis points", "200ms → 30ms").
- Under 30 words per sentence; "due to the fact that" → "because".
- Pass the "so what" test — would the customer actually care?
- Information hierarchy: assume the reader stops at any point; every
  sentence adds the next most important thing.
- The solution can't be magic — name a high-level mechanism.
- Make the reader empathize with the problem.

## Step 3 — Write the FAQs (2–5 pages)

Two sections, auto-numbered sequentially across both:

- **External (customer) FAQs** — what is this; how do I access it; what
  does it cost; what's different from alternatives.
- **Internal (stakeholder) FAQs** — trade-offs and why; data; risks +
  mitigations; competitive positioning; ROI; success metrics; options
  considered.

For internal trade-offs, present options in a table with pros / cons
columns and end with a one-clause "we recommend Option X because
<data>." Use customer voice externally and "we" internally.

## Step 4 — Write the appendix

Include as relevant: product backlog (P1/P2/P3/P4), KPIs (baseline,
target, measurement, timeframe), competitive analysis, supporting data.

Priority definitions:

- **P1** required for launch — will slip launch rather than ship without.
- **P2** expected for launch — will drop rather than slip launch.
- **P3** desired for launch — include if possible.
- **P4** out of scope — explicitly excluded from launch.

## Step 5 — Seed the Master PRD index

In `.belmont/BELMONT.md > ## Master PRD`, append one block per feature
in the product backlog:

```markdown
### prd-<topic>

Status: planned. Brief: <2–3 sentence summary from the backlog row>.
→ `memory/prds/prd-<topic>.md` (authored by `/belmont:plan`).
```

Do NOT create the `memory/prds/prd-<topic>.md` files here — that is
`/belmont:plan`'s job, per the knowledge discipline above. This step
only seeds the index pointers so the user can see the feature roster
in BELMONT.md from session 1.

## Step 6 — Quality checklist

Before presenting, verify (silently):

- [ ] Press release is one page or fewer.
- [ ] One clear problem, one customer persona.
- [ ] No weasel words; adjectives replaced with data.
- [ ] Sentences under 30 words.
- [ ] No implementation details in PR or external FAQs.
- [ ] FAQs auto-numbered sequentially.
- [ ] Internal trade-offs presented with pros / cons.
- [ ] Leader quote captures the single most important customer value.
- [ ] Customer testimonial is specific, believable, human.
- [ ] Master PRD index updated with one row per feature.

## Step 7 — Write + handoff

Write the complete PR/FAQ into `.belmont/BELMONT.md > ## PR/FAQ`,
replacing any placeholder text in that section. Update `updated_at` in
the frontmatter to today's date. Add one line under `## Revisions` (or
create the section at the document footer if absent):
`- YYYY-MM-DD — PR/FAQ <created|updated>: <one-sentence summary>.`

Then present a brief summary and prompt the user:

> Run `/belmont:plan <feature-slug>` to break one feature into milestones
> and tasks. (Codex: `/new` then `belmont:plan <feature-slug>`.)

## Common mistakes

1. Starting with the solution, not the customer.
2. Multiple problems in one PR/FAQ — split them.
3. Vague language: "improved experience" — quantify.
4. Internal jargon in customer-facing sections.
5. Missing trade-off analysis — every decision had alternatives.
6. Assertions without evidence — those are opinions.
7. Length: PR > 1 page = unclear thinking; total > 6 pages excluding
   appendix = too much.
8. Sensitive information (PII, security details, credentials) — never.

## Begin

Await the user's input describing what they want to build. When done,
write to `.belmont/BELMONT.md > ## PR/FAQ` and exit. Do NOT create
individual PRDs or implementation plans — that is `/belmont:plan`.
