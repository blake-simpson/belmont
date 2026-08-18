package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// A withdrawn task is resolved, so it neither counts as done nor stops the
// milestone reading done. A milestone whose tasks were ALL withdrawn has
// nothing outstanding either — treating it as unfinished would stall the loop
// on work somebody deliberately cancelled.
func milestoneAllDone(m milestone) bool {
	if len(m.Tasks) == 0 {
		return false
	}
	for _, t := range m.Tasks {
		if t.Status == taskWithdrawn {
			continue
		}
		if t.Status != taskDone && t.Status != taskVerified {
			return false
		}
	}
	return true
}

// milestoneAllVerified requires at least one LIVE task, for the same reason
// the empty-milestone guard exists: verified is the strongest claim Belmont
// makes and it must not be true vacuously. A milestone whose every task was
// withdrawn has had nothing built and nothing verified, and skipping the
// withdrawn ones without counting the survivors made it report `[v]` — while
// computeOverallStatus called the same data "Complete". Nothing outstanding is
// milestoneAllDone's business; this is a claim about verification.
func milestoneAllVerified(m milestone) bool {
	live := 0
	for _, t := range m.Tasks {
		if t.Status == taskWithdrawn {
			continue
		}
		live++
		if t.Status != taskVerified {
			return false
		}
	}
	return live > 0
}

// milestoneAllWithdrawn reports a milestone with tasks, every one of them
// withdrawn. It is resolved rather than done: nothing is outstanding, and
// nothing was built either.
func milestoneAllWithdrawn(m milestone) bool {
	if len(m.Tasks) == 0 {
		return false
	}
	for _, t := range m.Tasks {
		if t.Status != taskWithdrawn {
			return false
		}
	}
	return true
}

func milestoneHasBlockers(m milestone) bool {
	for _, t := range m.Tasks {
		if t.Status == taskBlocked {
			return true
		}
	}
	return false
}

// "Not started" means every task still to do is todo. All-withdrawn is not
// "not started" — nothing is going to start — so it needs at least one live
// task to qualify.
func milestoneNotStarted(m milestone) bool {
	live := 0
	for _, t := range m.Tasks {
		if t.Status == taskWithdrawn {
			continue
		}
		live++
		if t.Status != taskTodo {
			return false
		}
	}
	return live > 0
}

// parseMasterDeps reads the master PROGRESS.md and extracts feature slug → dependency slugs mapping
// from the ## Features table. Handles "None", empty, and comma-separated slugs.
// New table format: | Feature | Slug | Priority | Dependencies | Status | Milestones | Tasks |
func parseMasterDeps(root string) (deps map[string][]string, priorities map[string]string) {
	deps = make(map[string][]string)
	priorities = make(map[string]string)

	progressPath := filepath.Join(root, ".belmont", "PROGRESS.md")
	content, err := os.ReadFile(progressPath)
	if err != nil {
		return
	}

	lines := strings.Split(string(content), "\n")
	colIdx := parseMasterTableColumns(lines)
	inTable := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "## Features") {
			inTable = true
			continue
		}

		if inTable && strings.HasPrefix(trimmed, "## ") {
			break
		}

		if !inTable || !strings.HasPrefix(trimmed, "|") {
			continue
		}

		cells := splitTableCells(trimmed)
		slugCol := colIdx["Slug"]
		prioCol := colIdx["Priority"]
		depCol := colIdx["Dependencies"]

		if slugCol < 0 || len(cells) <= slugCol {
			continue
		}

		slug := strings.TrimSpace(cells[slugCol])
		if slug == "Slug" || strings.HasPrefix(slug, "-") || strings.HasPrefix(slug, ":") {
			continue
		}

		if prioCol >= 0 && prioCol < len(cells) {
			priorities[slug] = strings.TrimSpace(cells[prioCol])
		}

		if depCol < 0 || depCol >= len(cells) {
			continue
		}
		depStr := strings.TrimSpace(cells[depCol])
		if depStr == "" || strings.EqualFold(depStr, "None") || depStr == "-" {
			continue
		}

		var depSlugs []string
		for _, d := range strings.Split(depStr, ",") {
			d = strings.TrimSpace(d)
			if d != "" {
				depSlugs = append(depSlugs, d)
			}
		}
		if len(depSlugs) > 0 {
			deps[slug] = depSlugs
		}
	}
	return
}

// flattenTasks extracts all tasks from parsed milestones, sorted by task ID.
func flattenTasks(milestones []milestone, maxName int) []task {
	var tasks []task
	for _, m := range milestones {
		for _, t := range m.Tasks {
			name := t.Name
			if maxName > 0 && len([]rune(name)) > maxName {
				name = string([]rune(name)[:maxName-1]) + "…"
			}
			tasks = append(tasks, task{ID: t.ID, Name: name, Status: t.Status, MilestoneID: t.MilestoneID, Marker: t.Marker, Line: t.Line})
		}
	}

	sort.Slice(tasks, func(i, j int) bool {
		pi, ni := parseTaskOrder(tasks[i].ID)
		pj, nj := parseTaskOrder(tasks[j].ID)
		if pi != pj {
			return pi < pj
		}
		return ni < nj
	})

	return tasks
}

// canonicalMarker maps a raw checkbox marker to its task state. It is the
// SINGLE source of truth for what a marker means — every reader that needs to
// interpret one must route through it rather than comparing raw bytes.
//
// The second return value reports whether the marker was recognised. An
// unrecognised marker yields (taskUnknown, false): Belmont does not guess a
// state for a checkbox it cannot read. See issue #27.
//
// The letter markers are case-insensitive: `[x]`/`[X]` and `[v]`/`[V]` are the
// same state. One rule, easy to state and easy for an agent to remember.
//
// `[V]` was rejected for a while, and the reason was real at the time: the
// commit-evidence guard compared raw marker bytes, so a `[V]` flip counted as
// verified everywhere while being invisible to `runEvidenceCheck` — a silent
// bypass of knowledge/auto-mode/verify-evidence.md. That objection died when
// every reader was routed through this function. Keeping the asymmetry after
// the fix bought nothing and cost real confusion: `[X]` worked, `[V]` errored,
// and nobody could remember which. If a state is reachable by a shift key it
// has to parse.
//
// The one thing that still matters: a marker's meaning may only be read
// through here. Two raw comparisons survived the original conversion
// (`preState == "v"` in findEvidenceMissingFlips was the last), and each was a
// live trap — with `[V]` accepted, an already-verified task read as a fresh
// flip and the guard reverted it for lacking a commit.
//
// If you add a state here, every caller of canonicalMarker picks it up. That
// is the point: the previous design spread marker literals across four files
// that disagreed with each other.
func canonicalMarker(marker string) (taskStatus, bool) {
	switch marker {
	case " ":
		return taskTodo, true
	case ">":
		return taskInProgress, true
	case "x", "X":
		return taskDone, true
	case "v", "V":
		return taskVerified, true
	case "-":
		return taskWithdrawn, true
	case "!":
		return taskBlocked, true
	default:
		return taskUnknown, false
	}
}

// taskStatePriority orders task states by how advanced they are. Used wherever
// two versions of the same task must be reconciled — merge-conflict resolution
// and the post-merge worktree state sync.
//
// Blocked is deliberately below todo: `[!]` is a human signal that something
// needs attention, so it must never be silently overwritten by a "more
// advanced" state from the other side. Callers special-case it.
var taskStatePriority = map[taskStatus]int{
	taskTodo:       0,
	taskInProgress: 1,
	taskDone:       2,
	taskVerified:   3,
	taskBlocked:    -1,
	taskWithdrawn:  -2,
}

// markerRank returns how advanced a raw marker is, and whether it was
// recognised. Unrecognised markers report (0, false) — callers must treat that
// as "cannot compare", NOT as "equal to todo". Ranking an unreadable marker
// alongside real states is what let `[X]` lose to `[>]` and let unrecognised
// markers be silently overwritten at merge time. See issue #27.
func markerRank(marker string) (int, bool) {
	st, ok := canonicalMarker(marker)
	if !ok {
		return 0, false
	}
	p, known := taskStatePriority[st]
	return p, known
}

// markerIsVerified reports whether a raw marker means "verified". Used by the
// evidence guard, which works on raw markers read out of PROGRESS.md rather
// than on parsed tasks.
func markerIsVerified(marker string) bool {
	st, ok := canonicalMarker(marker)
	return ok && st == taskVerified
}

// markersDiffer reports whether two raw markers mean different things.
//
// Not `a != b`. Once the letter markers became case-insensitive, a bare byte
// comparison saw `[v]` → `[V]` as a state change: the scope guard read it as an
// out-of-scope flip, reverted a line the agent had not meaningfully edited,
// amended that into its commit and injected a steering correction for a flip
// that never happened. The same trap as everywhere else in this file — a reader
// that classifies markers with its own rule instead of canonicalMarker's.
//
// Two markers Belmont cannot read fall back to a byte comparison: they both
// parse to taskUnknown, and calling `[?]` → `[@]` "the same" would let an
// unreadable marker be swapped for a different unreadable marker unnoticed.
func markersDiffer(a, b string) bool {
	sa, oka := canonicalMarker(a)
	sb, okb := canonicalMarker(b)
	if !oka || !okb {
		return a != b
	}
	return sa != sb
}

// isSectionBreak reports whether a line ends the milestones region.
//
// A section break is a level-2 ATX heading **at column zero**. Indentation is
// load-bearing and must not be trimmed away: a `##` indented under a list item
// is that item's continuation body in Markdown, not a heading. Trimming first
// meant a task whose write-up quoted a heading silently ended task collection
// for the rest of the file — on the reporting project, 85 of 541 tasks became
// invisible, including outstanding `[ ]` and `[!]` work, with no warning and
// `belmont validate` exiting 0. See issue #31.
//
// `###` and deeper are never section breaks: `### M1:` is a milestone header
// and `#### …` inside a milestone is ordinary prose.
//
// Every reader that needs to know where the milestones region ends must route
// through this. Five call sites used to inline the trimmed check and all five
// were wrong the same way.
func isSectionBreak(line string) bool {
	if !strings.HasPrefix(line, "##") {
		return false
	}
	rest := line[2:]
	if rest == "" {
		return true // a bare `##`
	}
	if strings.HasPrefix(rest, "#") {
		return false // ### or deeper
	}
	return rest[0] == ' ' || rest[0] == '\t'
}

// taskIDRe is the single definition of what a task ID looks like — the leading
// `<ID>:` token on a task line. Every reader that needs a task's IDENTITY must
// route through parseTaskID; see the note there about the one reader that
// deliberately does not.
//
// Two alternatives, and the order matters:
//
//   - `P\d+-…` is the shape Belmont's own templates emit and the shape every
//     reader accepted before. It is first and unchanged, so nothing that parsed
//     yesterday parses differently today.
//   - a hyphenated identifier ending in a number covers the IDs people actually
//     write by hand — `FWLUP-SWEEP-1` from a cross-cutting audit is the case
//     from issue #34, where repair reported `(no task ID)` for a line the
//     runtime guards were happily treating as a task, and so never looked the
//     task up in the commit log.
//
// Two things keep the second alternative out of prose, and both are needed:
//
//   - a trailing `-\d+`. `Note: something` has no hyphen, `Fix the login: it
//     breaks` has a space before the colon, and `re-run: the suite` does not end
//     in a number.
//   - an UPPERCASE first letter. Without it the shape also matches ordinary
//     technology tokens — `utf-8`, `sha-256`, `base-64` — and that is not
//     harmless: such a token would become a task ID, and a commit merely
//     mentioning it would then be evidence, letting the mechanical tier
//     auto-write `[x]` for work nobody did. Hand-written task IDs are shouty
//     because they are identifiers (`FWLUP-SWEEP-1`, `AUTH-1234`, `E2E-4`);
//     lowercase hyphen-number tokens are overwhelmingly nouns. A lowercase
//     hand-written ID simply keeps today's behaviour of not being recognised.
//
// taskIDShape is shared with `commitNamedTaskIDs`, which validates the tokens it
// harvests out of commit messages against it. Those two MUST agree: when the
// file side recognised an ID the commit side could not, every `[v]` carrying a
// hand-written ID was reported by the audit as unproven while a commit named it
// verbatim.
// The two halves are named because the merge readers need them apart. Their
// concatenation is byte-identical to what taskIDShape has always been, so
// parseTaskID and commitNamedTaskIDs are unaffected.
const (
	// Unambiguous: `P1-M2-3` cannot be prose.
	taskIDShapeOrdinal = `P\d+-[\w][\w-]*`
	// Ambiguous without a delimiter: `OAuth-2 migration` and `SHA-256 rollout`
	// both begin with a token of this shape and are not task IDs.
	taskIDShapeHandWritten = `[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*-\d+`
)

const taskIDShape = taskIDShapeOrdinal + `|` + taskIDShapeHandWritten

// mergeTaskLine reports the marker and task ID a merge reader should key a line
// on — one definition, shared by mergeProgressState and resolveProgressConflict.
//
// The `:` delimiter is required for the hand-written form and NOT for `P<n>-`,
// and that asymmetry is the whole point. Requiring it for both looked tidier and
// silently changed behaviour: `- [!] P1-M1-1 rotate the creds` (no colon, a
// perfectly ordinary hand-edit) stopped being reconciled, so master's `[!]` was
// overwritten by the worktree's `[x]` with no warning at all. Losing a blocker
// that way looks exactly like the question was answered — the failure this whole
// area exists to prevent. The delimiter only ever earned its place against the
// hand-written alternative, which is the one that can match prose.
//
// This is deliberately one token wider than parseTaskID, which requires `<ID>:`
// for both forms. Wider is the fail-safe direction here: the cost of matching a
// colon-less `P<n>-` line is that two sides' markers are reconciled by an ID that
// cannot be anything else, and the cost of not matching it is silent state loss.
func mergeTaskLine(line string) (marker, id string, ok bool) {
	m := mergeTaskLineRe.FindStringSubmatch(line)
	if m == nil {
		return "", "", false
	}
	if m[2] != "" {
		return m[1], m[2], true
	}
	return m[1], m[3], true
}

// anyTaskBullet reports whether a line is a task checkbox bullet, WITHOUT
// requiring a parseable task ID. `mergeTaskLine` deliberately demands an ID,
// because it answers "which task is this line about" — but the carry anchor
// asks a different question, "where does this milestone's task list end", and
// a hand-written `- [x] Parse the header` bounds that list whether or not
// anything can name it. Using the ID-bearing test for both put a carried task
// ABOVE every existing task in a milestone whose tasks happened to be ID-less,
// because the anchor fell through to the milestone header.
var anyTaskBulletRe = regexp.MustCompile(`^\s*-\s+\[.\]\s`)

func anyTaskBullet(line string) bool { return anyTaskBulletRe.MatchString(line) }

// isFenceDelimiter reports whether the line opens or closes a fenced code block.
// Markdown allows ``` and ~~~, with an optional info string after the opener.
//
// Anything inside a fence is a sample, not structure. PROGRESS.md milestones
// routinely carry one showing how to write a follow-up — a checkbox bullet that
// `anyTaskBullet` matches and that no reader should treat as a task. Without
// this the carry anchored on it and was spliced INSIDE the fence.
func isFenceDelimiter(line string) bool {
	t := strings.TrimSpace(line)
	return strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~")
}

var mergeTaskLineRe = regexp.MustCompile(
	`^\s*-\s+\[(.)\]\s+(?:(` + taskIDShapeOrdinal + `)|(` + taskIDShapeHandWritten + `):)`)

var taskIDRe = regexp.MustCompile(`^(` + taskIDShape + `):\s*(.+)$`)

// taskIDShapeRe matches a bare token that is shaped like a task ID, with no
// surrounding line context.
var taskIDShapeRe = regexp.MustCompile(`^(?:` + taskIDShape + `)$`)

// parseTaskID splits a task line's text into its ID and the remaining name.
// Returns ok=false when the text carries no ID, in which case the whole text is
// the name.
//
// One reader is deliberately NOT converted: `parseProgressSnapshot` and
// `revertEvidenceMissing` in guards.go match a wider `(\S+?):`. That is not an
// oversight and not a missed conversion — see the comment at those call sites.
// They are answering "what token identifies this line inside its milestone
// block", where matching too little drops the line from flip tracking and
// matching too little lets an out-of-scope edit through unseen.
func parseTaskID(text string) (id, name string, ok bool) {
	m := taskIDRe.FindStringSubmatch(text)
	if len(m) < 3 {
		return "", text, false
	}
	return m[1], strings.TrimSpace(m[2]), true
}

// orphanedTaskLines returns task-shaped lines that sit outside any milestone —
// before the first `### M<n>:` header, or after a `## ` section break closed
// the region. They are counted by nothing, rendered nowhere, and never
// scheduled.
//
// This exists because silently dropping them is the same failure as issue #27:
// information lost without telling anyone. A legitimate PROGRESS.md does have
// content after the milestones region (`## Session History`, `## Decisions
// Log`), so a task line there is not automatically a mistake — but it is
// always worth saying out loud. See issue #31.
func orphanedTaskLines(progress string) []task {
	taskRe := regexp.MustCompile(`^\s*-\s+\[(.)\]\s+(.+)$`)

	var out []task
	inMilestone := false
	for i, line := range strings.Split(progress, "\n") {
		if msHeaderRe.MatchString(line) {
			inMilestone = true
			continue
		}
		if isSectionBreak(line) {
			inMilestone = false
			continue
		}
		if inMilestone {
			continue
		}
		m := taskRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		text := strings.TrimSpace(m[2])
		t := task{Name: text, Marker: m[1], Line: i + 1}
		if id, name, ok := parseTaskID(text); ok {
			t.ID = id
			t.Name = name
		}
		if st, ok := canonicalMarker(m[1]); ok {
			t.Status = st
		} else {
			t.Status = taskUnknown
		}
		out = append(out, t)
	}
	return out
}

// msHeaderRe matches a milestone header. Shared so orphan detection and
// parseMilestones cannot disagree about what starts a milestone.
var msHeaderRe = regexp.MustCompile(`^###\s+M(\d+):\s*(.+)$`)

func parseMilestones(progress string) []milestone {
	// Match milestone headers: ### M1: Name
	msRe := regexp.MustCompile(`(?m)^###\s+M(\d+):\s*(.+)$`)
	depsRe := regexp.MustCompile(`\(depends:\s*(M[\d]+(?:\s*,\s*M[\d]+)*)\)\s*$`)
	// Match task checkboxes: - [ ] P0-1: Task Name, - [x] ..., - [>] ..., - [v] ..., - [!] ...
	taskRe := regexp.MustCompile(`(?m)^\s*-\s+\[(.)\]\s+(.+)$`)

	lines := strings.Split(progress, "\n")
	var milestones []milestone
	var currentMS *milestone

	for lineIdx, line := range lines {
		// Check for milestone header
		if msMatch := msRe.FindStringSubmatch(line); len(msMatch) >= 3 {
			// Save previous milestone
			if currentMS != nil {
				milestones = append(milestones, *currentMS)
			}

			id := "M" + strings.TrimSpace(msMatch[1])
			name := strings.TrimSpace(msMatch[2])

			// Extract dependency annotations from name
			var deps []string
			if depsMatch := depsRe.FindStringSubmatch(name); len(depsMatch) >= 2 {
				name = strings.TrimSpace(depsRe.ReplaceAllString(name, ""))
				for _, d := range strings.Split(depsMatch[1], ",") {
					deps = append(deps, strings.TrimSpace(d))
				}
			}

			currentMS = &milestone{ID: id, Name: name, Deps: deps}
			continue
		}

		// Check for next section (## header) — stops current milestone.
		// Column-zero only: see isSectionBreak / issue #31.
		if isSectionBreak(line) {
			if currentMS != nil {
				milestones = append(milestones, *currentMS)
				currentMS = nil
			}
			continue
		}

		// Parse task checkboxes under current milestone
		if currentMS != nil {
			if taskMatch := taskRe.FindStringSubmatch(line); len(taskMatch) >= 3 {
				marker := taskMatch[1]
				taskText := strings.TrimSpace(taskMatch[2])

				status, _ := canonicalMarker(marker)

				// Extract task ID if present (e.g., "P0-1: Task Name")
				taskID, taskName, _ := parseTaskID(taskText)

				currentMS.Tasks = append(currentMS.Tasks, task{
					ID:          taskID,
					Name:        taskName,
					Status:      status,
					MilestoneID: currentMS.ID,
					Marker:      marker,
					Line:        lineIdx + 1,
				})
			}
		}
	}

	// Don't forget the last milestone
	if currentMS != nil {
		milestones = append(milestones, *currentMS)
	}

	return milestones
}

// liveOverlayGap records a milestone whose live worktree view could not be
// used, so master's copy stands in for it. Reported rather than swallowed:
// anything unplaceable is surfaced, never dropped, and an unreadable worktree is
// unplaceable state.
type liveOverlayGap struct {
	Milestone string `json:"milestone"`
	Path      string `json:"path"`
	// Kind distinguishes the two fallbacks, and the difference is not cosmetic:
	// under gapUnreadable nothing in that worktree's document was seen by
	// anything, while under gapMilestoneAbsent the file was read fine — so a
	// reader that says "a violation in that worktree does not appear here" is
	// telling the truth about the first and not about the second.
	Kind   string `json:"kind"`
	Reason string `json:"reason"`
}

const (
	// The worktree's PROGRESS.md could not be read at all.
	gapUnreadable = "unreadable"
	// It was read and parsed, but holds no block for this milestone.
	gapMilestoneAbsent = "milestone_absent"
)

// describe renders one line naming what could not be used and what is standing
// in for it. Every renderer says the same thing about the same condition.
//
// The path is not repeated here: Reason already carries it, because an
// os.ReadFile error names the file it failed on and the absent-milestone case
// says so explicitly. Path stays a separate field for the JSON consumer.
func (g liveOverlayGap) describe() string {
	return fmt.Sprintf("%s — %s; master's copy is shown instead, which during a run is the fork-point baseline",
		g.Milestone, g.Reason)
}

// overlayLiveMilestones returns `base` with each milestone whose ID matches an
// entry in `perMilestoneLive` replaced by that worktree's current view of the
// milestone. Milestones with no active worktree are returned unchanged.
// Overlaid milestones carry a LiveFrom pointer so renderers can annotate them.
//
// The second return names every milestone that fell back to master, and is not
// optional for a caller to ignore. Both fallbacks below used to be silent, and
// the "shouldn't happen" one was a fair bet while this governed DISPLAY only.
// Since #42 routed `belmont validate` through this overlay and #44 routed
// `belmont auto`'s startup gate through `validateFeature`, the fallback decides
// whether a GATE passes: a worktree whose PROGRESS.md is missing or unreadable
// made validate print "✓ No milestone-structure violations found" and let auto
// start, a green covering less than the user believes in the one place a false
// green starts a run. It is reachable without anything exotic — a half-cleaned
// worktree, a failed merge that left the directory behind, a `.belmont/` copy
// interrupted mid-write. See issue #48.
func overlayLiveMilestones(base []milestone, perMilestoneLive map[string]string) ([]milestone, []liveOverlayGap) {
	out := make([]milestone, 0, len(base))
	var gaps []liveOverlayGap
	for _, m := range base {
		live, ok := perMilestoneLive[m.ID]
		if !ok {
			out = append(out, m)
			continue
		}
		wtProgressPath := filepath.Join(live, "PROGRESS.md")
		data, err := os.ReadFile(wtProgressPath)
		if err != nil {
			// Worktree lost its PROGRESS.md — fall back to master, and say so.
			out = append(out, m)
			gaps = append(gaps, liveOverlayGap{
				Milestone: m.ID,
				Path:      wtProgressPath,
				Kind:      gapUnreadable,
				Reason:    "its worktree's PROGRESS.md could not be read (" + err.Error() + ")",
			})
			continue
		}
		wtMilestones := parseMilestones(string(data))
		var replaced bool
		for _, wm := range wtMilestones {
			if wm.ID == m.ID {
				wm.LiveFrom = live
				out = append(out, wm)
				replaced = true
				break
			}
		}
		if !replaced {
			// The worktree's file parses but holds no such milestone — keep
			// master's, and report it for the same reason.
			out = append(out, m)
			gaps = append(gaps, liveOverlayGap{
				Milestone: m.ID,
				Path:      wtProgressPath,
				Kind:      gapMilestoneAbsent,
				Reason:    "its worktree's PROGRESS.md (" + wtProgressPath + ") parses but holds no ### " + m.ID + ": block",
			})
		}
	}
	return out, gaps
}

func parseTaskOrder(id string) (int, int) {
	re := regexp.MustCompile(`^P(\d+)-(\d+)`)
	match := re.FindStringSubmatch(id)
	if len(match) != 3 {
		return 99, 99
	}
	return atoiDefault(match[1], 99), atoiDefault(match[2], 99)
}

func lastCompletedTask(tasks []task) *task {
	var last *task
	for i := range tasks {
		if tasks[i].Status == taskDone || tasks[i].Status == taskVerified {
			t := tasks[i]
			last = &t
		}
	}
	return last
}

// milestonesByID indexes milestones for dependency lookups.
func milestonesByID(milestones []milestone) map[string]milestone {
	byID := make(map[string]milestone, len(milestones))
	for _, m := range milestones {
		byID[m.ID] = m
	}
	return byID
}

// depSatisfied is THE definition of a satisfied `(depends: …)` reference,
// shared by computeWaves' in-degree count and the next-work selectors below.
// A dependency is satisfied when the referenced milestone is all-done —
// done-not-verified already unblocks its dependents in wave scheduling — or
// when it does not exist, because a dangling reference cannot block and
// computeWaves has always ignored one. Two answers to this question is the
// #27/#31 shape: the scheduler and the status views disagreeing about what
// is blocked. See issue #59.
func depSatisfied(dep string, byID map[string]milestone) bool {
	dm, ok := byID[dep]
	return !ok || milestoneAllDone(dm)
}

func milestoneDepsMet(m milestone, byID map[string]milestone) bool {
	for _, dep := range m.Deps {
		if !depSatisfied(dep, byID) {
			return false
		}
	}
	return true
}

// milestoneStatusWord names a milestone's computed state for one-line
// displays: auto's dry-run listing and the dependency annotations below.
// Checked in the same order as milestoneStatusIcon, all five branches:
// withdrawn before done, because an all-withdrawn milestone satisfies
// milestoneAllDone and calling it done claims work that never happened; and
// blockers before in-progress, because blocked-vs-in-progress is a
// classification agents act on — a dependency annotation calling a
// [!]-gated milestone "in progress" invites working at it.
func milestoneStatusWord(m milestone) string {
	switch {
	case milestoneAllWithdrawn(m):
		return "withdrawn"
	case milestoneAllVerified(m):
		return "verified"
	case milestoneAllDone(m):
		return "done"
	case milestoneHasBlockers(m):
		return "blocked"
	case !milestoneNotStarted(m):
		return "in progress"
	default:
		return "pending"
	}
}

// nextMilestone returns the first milestone, in document order, that is not
// all-done AND whose every `(depends: …)` is satisfied. Dependencies were
// simply never part of this condition (#59): the annotation was parsed,
// rendered, and then not consulted by anything that recommends work — so on
// a feature whose first pending milestone declared unmet deps, both status
// views named the one milestone that must run last.
//
// Returns nil when nothing is offerable. That is NOT the same as "nothing is
// left": when undone milestones remain but every one is dependency-blocked,
// nextBlockedMilestone reports which and why — and the render layer must
// print that, never "None", because loop-recipe.md's stop condition treats
// "Next Milestone: None" as the feature being finished.
func nextMilestone(milestones []milestone) *milestone {
	byID := milestonesByID(milestones)
	for _, m := range milestones {
		if milestoneAllDone(m) {
			continue
		}
		if !milestoneDepsMet(m, byID) {
			continue
		}
		mm := m
		return &mm
	}
	return nil
}

// blockedNext explains a nil nextMilestone that does not mean "done": the
// first undone milestone in document order, with each unmet dependency
// rendered "M21 (status: pending)" — the same shape scanReadiness uses for
// feature-level dependencies.
type blockedNext struct {
	Milestone milestone `json:"milestone"`
	UnmetDeps []string  `json:"unmet_deps"`
}

// nextBlockedMilestone returns non-nil exactly when undone work remains and
// none of it is offerable — every undone milestone has an unmet dependency.
// In practice that is a dependency cycle or a forward reference, both of
// which computeWaves refuses at auto startup; the status views still have to
// say something truthful about the file.
func nextBlockedMilestone(milestones []milestone) *blockedNext {
	if nextMilestone(milestones) != nil {
		return nil
	}
	byID := milestonesByID(milestones)
	for _, m := range milestones {
		if milestoneAllDone(m) {
			continue
		}
		return blockedNextFor(m, byID)
	}
	return nil
}

// blockedNextFor describes m through its unmet dependencies.
func blockedNextFor(m milestone, byID map[string]milestone) *blockedNext {
	var unmet []string
	for _, dep := range m.Deps {
		if !depSatisfied(dep, byID) {
			status := "missing"
			if dm, ok := byID[dep]; ok {
				status = milestoneStatusWord(dm)
			}
			unmet = append(unmet, fmt.Sprintf("%s (status: %s)", dep, status))
		}
	}
	return &blockedNext{Milestone: m, UnmetDeps: unmet}
}

// nextTaskBlockedByDeps explains a nil nextTask that does not mean "no work
// left": the first workable task skipped only because its milestone's
// dependencies are unmet, described through that milestone. This is the
// task-line counterpart of nextBlockedMilestone, for the shape where the
// next MILESTONE is offerable (say, holding only a [!]) while every workable
// TASK sits behind a dependency — without it the task line reads a bare
// "None", indistinguishable from nothing-left. nil when a task is offerable
// or when nothing workable exists at all.
func nextTaskBlockedByDeps(tasks []task, milestones []milestone) *blockedNext {
	if nextTask(tasks, milestones) != nil {
		return nil
	}
	byID := milestonesByID(milestones)
	for _, t := range tasks {
		if t.Status != taskInProgress && t.Status != taskTodo {
			continue
		}
		m, ok := byID[t.MilestoneID]
		if !ok || milestoneDepsMet(m, byID) {
			continue
		}
		return blockedNextFor(m, byID)
	}
	return nil
}

// nextTask returns the first task available to work on.
//
// The condition is a POSITIVE match on the two workable states, and that is
// load-bearing: it is what keeps taskUnknown out. Issue #27 was an entry whose
// marker Belmont could not read being handed to an agent as the next thing to
// build — withdrawn work, and one feature cancelled by a product decision.
//
// Do not rewrite this as a negative ("anything not done or verified"). That
// reads as equivalent and silently re-admits taskUnknown, plus any state added
// later. TestUnknownMarkerIsNeverScheduled fails if you do.
func nextTask(tasks []task, milestones []milestone) *task {
	byID := milestonesByID(milestones)
	for _, t := range tasks {
		if t.Status == taskInProgress || t.Status == taskTodo {
			// Same eligibility rule as nextMilestone: never offer work from a
			// milestone whose dependencies are unmet. A task whose milestone
			// is not in the set stays offerable — hiding work over a lookup
			// failure would be the unsafe direction.
			if m, ok := byID[t.MilestoneID]; ok && !milestoneDepsMet(m, byID) {
				continue
			}
			tt := t
			return &tt
		}
	}
	return nil
}

// unknownMarkerTasks returns every task whose checkbox marker Belmont could not
// recognise, across all milestones, in document order.
func unknownMarkerTasks(milestones []milestone) []task {
	var out []task
	for _, m := range milestones {
		for _, t := range m.Tasks {
			if t.Status == taskUnknown {
				out = append(out, t)
			}
		}
	}
	return out
}

// doneNotVerifiedTasks returns every task sitting at `[x]` — implemented but
// never verified — across all milestones, in document order.
//
// This is the mirror of unknownMarkerTasks, and it exists for the same reason:
// a state that looks like success but is not. `computeOverallStatus` returns
// "Complete" when every task is `[x]` OR `[v]`, and every stop condition in the
// product keys off that — loop.md's "no pending milestones", decideLoopActionSmart's
// actionComplete rules, computeWaves skipping milestoneAllDone milestones. So a
// verify pass that never wrote its `[v]` flips terminates the run reporting
// success, and nothing repairs it: nextTask positively matches only
// todo/in-progress, and the guards are subtractive — no Go code anywhere
// promotes a task to verified. See issue #30.
func doneNotVerifiedTasks(milestones []milestone) []task {
	var out []task
	for _, m := range milestones {
		for _, t := range m.Tasks {
			if t.Status == taskDone {
				out = append(out, t)
			}
		}
	}
	return out
}

// blockedTaskCount returns the number of tasks with [!] status across all milestones.
func blockedTaskCount(milestones []milestone) int {
	count := 0
	for _, m := range milestones {
		for _, t := range m.Tasks {
			if t.Status == taskBlocked {
				count++
			}
		}
	}
	return count
}

// blockedTaskNames returns descriptions of blocked tasks for display.
func blockedTaskNames(milestones []milestone) []string {
	var names []string
	for _, m := range milestones {
		for _, t := range m.Tasks {
			if t.Status == taskBlocked {
				label := t.Name
				if t.ID != "" {
					label = t.ID + ": " + t.Name
				}
				names = append(names, label)
			}
		}
	}
	return names
}

func parseDecisions(progress string, limit int) []string {
	lines := parseSectionLines(progress, "## Decisions Log")
	if len(lines) <= limit {
		return lines
	}
	return lines[len(lines)-limit:]
}

func parseSectionLines(doc, header string) []string {
	re := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(header) + `\s*$`)
	loc := re.FindStringIndex(doc)
	if loc == nil {
		return nil
	}
	rest := doc[loc[1]:]
	lines := strings.Split(rest, "\n")
	var results []string
	for _, line := range lines[1:] {
		// isSectionBreak, not a trimmed prefix test. This is the reader behind
		// `belmont status`'s Decisions Log, and it was the last place still
		// answering "where does this section end?" with its own rule: an
		// indented `##` quoted inside a decision entry truncated the log, and a
		// bare `##` or `##` + tab did not end it at all. See issue #31.
		//
		// A milestone header ends it too, and for the same reason
		// `appendDecisionLogEntry` stops there: `### M<n>:` is deliberately not
		// a section break, so a `## Decisions Log` sitting ABOVE the milestones
		// swallowed the entire milestones region and `belmont status` listed
		// task lines as decisions. Reader and writer agree on one boundary.
		if isSectionBreak(line) || msHeaderRe.MatchString(line) {
			break
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		// A heading inside the section is structure, not an entry. Before the
		// boundary moved to isSectionBreak an indented `##` ended the section
		// outright; now it stays, and listing it as a decision would just move
		// the noise from one place to another.
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		if strings.Contains(strings.ToLower(trimmed), "none") {
			continue
		}
		trimmed = strings.TrimPrefix(trimmed, "-")
		trimmed = strings.TrimPrefix(trimmed, "*")
		trimmed = strings.TrimSpace(trimmed)
		if trimmed != "" {
			results = append(results, trimmed)
		}
	}
	return results
}

func techPlanReady(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(content)) != ""
}

// fileHasRealContent checks if a file exists and has content beyond template/placeholder text.
func fileHasRealContent(path string) bool {
	content, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	trimmed := strings.TrimSpace(string(content))
	if trimmed == "" {
		return false
	}
	// Check for known template/placeholder texts
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "run /belmont:") || strings.HasPrefix(lower, "run the /belmont:") {
		return false
	}
	return true
}

func computeOverallStatus(tasks []task) string {
	if len(tasks) == 0 {
		return "Not Started"
	}

	allVerified := true
	allDone := true
	anyProgress := false
	allBlocked := true
	live := 0

	for _, t := range tasks {
		// Withdrawn work is resolved: it must not drag the feature out of a
		// terminal state, and it must not prop one up either.
		if t.Status == taskWithdrawn {
			continue
		}
		live++
		if t.Status != taskVerified {
			allVerified = false
		}
		if t.Status != taskDone && t.Status != taskVerified {
			allDone = false
		}
		if t.Status == taskDone || t.Status == taskVerified || t.Status == taskInProgress {
			anyProgress = true
		}
		if t.Status != taskBlocked {
			allBlocked = false
		}
	}
	if live == 0 {
		return "Complete" // every task withdrawn — nothing outstanding
	}

	if allVerified {
		return "Verified"
	}
	if allDone {
		return "Complete"
	}
	if allBlocked {
		return "BLOCKED"
	}
	if anyProgress {
		return "In Progress"
	}
	return "Not Started"
}

// isFeatureTerminal reports whether a feature is done — either all tasks
// implemented ("Complete"), all tasks verified ("Verified"), or archived via
// /belmont:cleanup ("Archived"). Terminal features are skipped by `auto --all`
// and treated as dep-satisfying (but non-executing) in wave planning.
func isFeatureTerminal(status string) bool {
	switch status {
	case "Complete", "Verified", "Archived":
		return true
	}
	return false
}

func milestonesInRange(milestones []milestone, from, to string) []milestone {
	if from == "" && to == "" {
		return milestones
	}

	fromNum := parseMilestoneNum(from)
	toNum := parseMilestoneNum(to)

	var result []milestone
	for _, m := range milestones {
		num := parseMilestoneNum(m.ID)
		if num < 0 {
			continue
		}
		if fromNum >= 0 && num < fromNum {
			continue
		}
		if toNum >= 0 && num > toNum {
			continue
		}
		result = append(result, m)
	}
	return result
}

func parseMilestoneNum(id string) int {
	if id == "" {
		return -1
	}
	re := regexp.MustCompile(`(?i)M(\d+)`)
	match := re.FindStringSubmatch(id)
	if len(match) < 2 {
		return -1
	}
	n, err := strconv.Atoi(match[1])
	if err != nil {
		return -1
	}
	return n
}

// skipMilestoneInProgress marks a milestone's outstanding `[ ]` and `[>]` tasks
// as done in PROGRESS.md. It returns the number of `[!]` tasks it deliberately
// left alone, so the caller can say that the milestone is not actually finished.
//
// `[!]` is NOT swept. It means the work is waiting on a person, and rewriting it
// to `[x]` both destroys the question and records no reason — `[x]` is treated as
// finished by every stop condition (#30), so the milestone would read done with
// the user's decision silently discarded. Skipping a milestone is a statement
// about work an agent chose not to do; it is not an answer to a question that was
// asked of somebody else. See issue #40.
//
// This is currently belt-and-braces: `checkHardGuardrails` pauses the run while
// any `[!]` exists, and `actionSkipMilestone` is only ever emitted by the AI
// decision path downstream of that guardrail, so no live path reaches here with a
// blocker present. It is written this way because that guardrail is exactly what
// issue #41 proposes to narrow.
func skipMilestoneInProgress(root, feature, milestoneID string) (int, error) {
	progressPath := filepath.Join(root, ".belmont", "features", feature, "PROGRESS.md")
	content, err := os.ReadFile(progressPath)
	if err != nil {
		return 0, fmt.Errorf("read PROGRESS.md: %w", err)
	}

	lines := strings.Split(string(content), "\n")
	msRe := regexp.MustCompile(`(?i)^###\s+(?:[✅⬜🔄🚫]\s*)?M(\d+):`)
	taskRe := regexp.MustCompile(`^(\s*-\s+)\[[ >]\](\s+.*)$`)
	// Counted, not rewritten. canonicalMarker so `[!]` is recognised by the one
	// definition of what a marker means, rather than a fourth raw-byte compare.
	anyTaskRe := regexp.MustCompile(`^\s*-\s+\[(.)\]\s`)

	inTarget := false
	changed := false
	blockersLeft := 0
	for i, line := range lines {
		if m := msRe.FindStringSubmatch(line); len(m) >= 2 {
			inTarget = ("M" + m[1]) == milestoneID
			continue
		}
		if isSectionBreak(line) {
			inTarget = false
			continue
		}
		if inTarget {
			if taskMatch := taskRe.FindStringSubmatch(line); len(taskMatch) >= 3 {
				lines[i] = taskMatch[1] + "[x]" + taskMatch[2]
				changed = true
				continue
			}
			if m := anyTaskRe.FindStringSubmatch(line); m != nil {
				if st, ok := canonicalMarker(m[1]); ok && st == taskBlocked {
					blockersLeft++
				}
			}
		}
	}

	if !changed {
		if blockersLeft > 0 {
			return blockersLeft, fmt.Errorf("milestone %s has only blocked tasks — nothing to skip; they are waiting on a person", milestoneID)
		}
		return 0, fmt.Errorf("milestone %s not found or already done", milestoneID)
	}

	return blockersLeft, os.WriteFile(progressPath, []byte(strings.Join(lines, "\n")), 0644)
}

func detectFwlupTasks(root, feature string, report statusReport) bool {
	fwlupRe := regexp.MustCompile(`(?i)FWLUP`)
	// Check if any todo/in_progress tasks have FWLUP in their ID or name
	for _, t := range report.Tasks {
		if t.Status == taskTodo || t.Status == taskInProgress {
			if fwlupRe.MatchString(t.ID) || fwlupRe.MatchString(t.Name) {
				return true
			}
		}
	}
	return false
}

// detectFwlupTasksForMilestone checks for pending FWLUP tasks scoped to a specific milestone.
func detectFwlupTasksForMilestone(root, feature string, report statusReport, milestoneID string) bool {
	if milestoneID == "" {
		return false
	}
	fwlupRe := regexp.MustCompile(`(?i)FWLUP`)
	for _, t := range report.Tasks {
		if t.Status == taskTodo || t.Status == taskInProgress {
			if fwlupRe.MatchString(t.ID) || fwlupRe.MatchString(t.Name) {
				// Position first — the parser sets MilestoneID from the task's
				// actual place in the file, so it is right whenever the two
				// agree. The ID is the fallback for a task whose position and
				// ID disagree, and it routes through taskIDNamedMilestone
				// because that is the definition `belmont validate` reports
				// against and `belmont repair` moves toward. A third answer
				// here meant a `P<n>-FWLUP-M<k>-…` task was attributed to no
				// milestone by this reader while the lint attributed it to
				// M<k>; see issue #39.
				named, _ := taskIDNamedMilestone(t.ID)
				if t.MilestoneID == milestoneID || named == milestoneID {
					return true
				}
			}
		}
	}
	return false
}

// pendingTasksInRange checks for incomplete tasks under milestones
// that fall within the from/to range in the feature's PROGRESS.md.
// When from and to are both empty, falls back to checking all milestones.
func pendingTasksInRange(root, feature, from, to string) bool {
	progressPath := filepath.Join(root, ".belmont", "features", feature, "PROGRESS.md")
	data, err := os.ReadFile(progressPath)
	if err != nil {
		return false
	}

	fromNum := parseMilestoneNum(from)
	toNum := parseMilestoneNum(to)

	lines := strings.Split(string(data), "\n")
	msRe := regexp.MustCompile(`(?i)^###\s+(?:[✅⬜🔄🚫]\s*)?M(\d+):`)
	// Match any incomplete task: [ ], [>], [!]
	taskRe := regexp.MustCompile(`^\s*-\s+\[[ >!]\]`)

	// Starts false even with no range: "all milestones" still means milestones.
	// A bullet in the preamble, before the first `### M<n>:`, is outside the
	// region exactly as one past a `## ` break is — orphanedTaskLines reports
	// both — and counting it as outstanding work blocked actionComplete on a
	// finished feature. fwlupTasksInRange has always started false; this is the
	// same rule at the region's leading edge.
	inRange := false
	for _, line := range lines {
		if m := msRe.FindStringSubmatch(line); len(m) >= 2 {
			num, _ := strconv.Atoi(m[1])
			inRange = (fromNum < 0 || num >= fromNum) && (toNum < 0 || num <= toNum)
			continue
		}
		// Past a column-zero `## ` there is no milestone, so nothing is in
		// range: a `- [ ]` bullet in a retro or session log is not pending work.
		// Without this the loop reported outstanding tasks for a finished
		// feature and `decideLoopActionSmart` never reached actionComplete.
		if isSectionBreak(line) {
			inRange = false
			continue
		}
		if inRange && taskRe.MatchString(line) {
			return true
		}
	}
	return false
}

// fwlupTasksInRange checks for unchecked FWLUP tasks under milestones within the from/to range.
// When from and to are both empty, falls back to the global detectFwlupTasks.
func fwlupTasksInRange(root, feature string, report statusReport, from, to string) bool {
	if from == "" && to == "" {
		return detectFwlupTasks(root, feature, report)
	}

	progressPath := filepath.Join(root, ".belmont", "features", feature, "PROGRESS.md")
	data, err := os.ReadFile(progressPath)
	if err != nil {
		return false
	}

	fromNum := parseMilestoneNum(from)
	toNum := parseMilestoneNum(to)

	lines := strings.Split(string(data), "\n")
	msRe := regexp.MustCompile(`(?i)^###\s+(?:[✅⬜🔄🚫]\s*)?M(\d+):`)
	// Match any incomplete task with FWLUP in the text
	fwlupTaskRe := regexp.MustCompile(`(?i)^\s*-\s+\[[ >!]\].*FWLUP`)

	inRange := false
	for _, line := range lines {
		if m := msRe.FindStringSubmatch(line); len(m) >= 2 {
			num, _ := strconv.Atoi(m[1])
			inRange = (fromNum < 0 || num >= fromNum) && (toNum < 0 || num <= toNum)
			continue
		}
		if isSectionBreak(line) {
			inRange = false
			continue
		}
		if inRange && fwlupTaskRe.MatchString(line) {
			return true
		}
	}
	return false
}
