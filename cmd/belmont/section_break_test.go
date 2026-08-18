package main

import (
	"strings"
	"testing"
)

// Issue #31: a `## ` heading anywhere in the milestones region silently ended
// task collection for the rest of the file — including one indented inside a
// task's own continuation body, because every reader trimmed the line before
// testing the prefix. On the reporting project that hid 85 of 541 tasks,
// including outstanding [ ] and [!] work, with `belmont validate` exiting 0.

// The issue's exact reproduction.
const quotedHeadingProgress = `# Progress: Demo

## Milestones

### M1: Everything here is real work
- [x] T-1: done, and visible
- [x] T-2: done, and its write-up quotes a heading

  ## Ruling 2026-08-02 — a heading quoted inside the task body

  The two spaces above make this part of T-2's body, not a new section.

- [ ] T-3: TODO — never rendered, never counted, never offered
- [!] T-4: BLOCKED — also invisible
`

func TestIndentedHeadingDoesNotEndMilestone(t *testing.T) {
	ms := parseMilestones(quotedHeadingProgress)
	if len(ms) != 1 {
		t.Fatalf("milestones = %d, want 1", len(ms))
	}
	if got := len(ms[0].Tasks); got != 4 {
		t.Fatalf("tasks = %d, want 4 — a heading indented inside a task body ended collection:\n%+v", got, ms[0].Tasks)
	}
	tasks := flattenTasks(ms, 0)
	if s := computeOverallStatus(tasks); s == "Complete" {
		t.Error(`status reads "Complete" while a [ ] and a [!] sit in the file`)
	}
	if !milestoneHasBlockers(ms[0]) {
		t.Error("the [!] blocker is invisible")
	}
	if nextTask(tasks, ms) == nil {
		t.Error("the [ ] task is never offered as next work")
	}
}

// isSectionBreak is the single definition. Five readers used to inline a
// trimmed check and all five were wrong the same way.
func TestIsSectionBreak(t *testing.T) {
	breaks := []string{"## Milestones", "## Session History", "##", "##\tTabbed"}
	for _, s := range breaks {
		if !isSectionBreak(s) {
			t.Errorf("isSectionBreak(%q) = false, want true", s)
		}
	}
	notBreaks := []string{
		"  ## Indented under a list item", // the #31 case
		"\t## Tab-indented",
		"### M1: Milestone header",
		"#### Deeper heading",
		"###",
		"#Heading",
		"# Title",
		"##Nospace",
		"- [x] T-1: a task",
		"",
		"Some prose mentioning ## in the middle",
	}
	for _, s := range notBreaks {
		if isSectionBreak(s) {
			t.Errorf("isSectionBreak(%q) = true, want false", s)
		}
	}
}

// A column-zero `## ` legitimately ends the region — that part must not change,
// or `## Session History` would be swallowed into the last milestone.
func TestColumnZeroHeadingStillEndsMilestone(t *testing.T) {
	// The post-break content must be TASK-SHAPED. With a markdown table here
	// the assertions held whether or not the break was honoured, so this test
	// passed even against an isSectionBreak that never broke — vacuous for the
	// regression it names.
	body := `# Progress: Demo

## Milestones

### M1: Work
- [x] P1-M1-1: a

## Session History

- [x] P1-M1-1: a (logged again in the history)
`
	ms := parseMilestones(body)
	if len(ms) != 1 {
		t.Fatalf("milestones = %d, want 1", len(ms))
	}
	if got := len(ms[0].Tasks); got != 1 {
		t.Fatalf("tasks in M1 = %d, want 1 — a column-zero `## ` must end the region, so the history line is not M1's", got)
	}
	orphans := orphanedTaskLines(body)
	if len(orphans) != 1 {
		t.Fatalf("orphans = %d, want 1 — the history line belongs to no milestone", len(orphans))
	}
}

// Tasks stranded past a real section break are invisible to every count, so
// they must be reported rather than silently dropped.
func TestOrphanedTasksAreReported(t *testing.T) {
	body := `# Progress: Demo

## Milestones

### M1: Work
- [x] P1-M1-1: a

## Session History

- [ ] P1-M9-1: stranded outside every milestone
- [!] P1-M9-2: also stranded
`
	orphans := orphanedTaskLines(body)
	if len(orphans) != 2 {
		t.Fatalf("orphanedTaskLines = %d, want 2: %+v", len(orphans), orphans)
	}
	if orphans[0].ID != "P1-M9-1" || orphans[0].Line != 10 {
		t.Errorf("first orphan = %s at line %d, want P1-M9-1 at 10", orphans[0].ID, orphans[0].Line)
	}
	if orphans[0].Status != taskTodo || orphans[1].Status != taskBlocked {
		t.Errorf("orphan statuses = %v, %v — want todo, blocked", orphans[0].Status, orphans[1].Status)
	}

	v := detectOrphanViolations("demo", body)
	if len(v) != 2 {
		t.Fatalf("detectOrphanViolations = %d, want 2", len(v))
	}
	if v[0].Rule != "task_outside_milestone" || !strings.Contains(v[0].Message, "PROGRESS.md:10") {
		t.Errorf("violation should name the rule and the line: %+v", v[0])
	}

	// The rendered report must not print an empty [] bracket for a violation
	// that legitimately has neither milestone nor task ID.
	var sb strings.Builder
	renderValidationReport(&sb, []validationViolation{{Feature: "demo", Rule: "task_outside_milestone", Message: "m"}})
	if strings.Contains(sb.String(), "[]") {
		t.Errorf("empty bracket rendered:\n%s", sb.String())
	}
}

// A clean file must produce no orphan violations, or the rule fires everywhere
// and gets ignored.
func TestNoOrphansOnCleanFile(t *testing.T) {
	clean := `# Progress: Demo

## Milestones

### M1: Work
- [x] P1-M1-1: a
- [v] P1-M1-2: b

## Session History

| Session | Date |
|---------|------|
| 1       | now  |

## Decisions Log

1. Chose X over Y.
`
	if got := orphanedTaskLines(clean); len(got) != 0 {
		t.Errorf("false positives on a clean file: %+v", got)
	}
}

// The scope-guard snapshot reads the region independently. If it disagrees with
// parseMilestones about where a milestone ends, the guard reverts the wrong
// lines.
func TestSnapshotAgreesWithParserOnIndentedHeading(t *testing.T) {
	snap := parseProgressSnapshot("P", `### M1: Work
- [x] P1-M1-1: a

  ## A heading quoted in the body

- [ ] P1-M1-2: b
`)
	if len(snap.Blocks) != 1 {
		t.Fatalf("blocks = %d, want 1", len(snap.Blocks))
	}
	if len(snap.Blocks[0].TaskStates) != 2 {
		t.Errorf("snapshot sees %d tasks, parser sees 2 — the guard would revert the wrong lines: %v",
			len(snap.Blocks[0].TaskStates), snap.Blocks[0].TaskStates)
	}
}

// …and the rebuilder must agree with the snapshot, for the same reason. The
// snapshot decides where pre's block ENDS; the rebuilder decides which post
// lines that block REPLACES. When only one of them was converted to
// isSectionBreak the two ran off different boundaries, and the mismatch is not
// a lost revert but active corruption: the pre block is emitted whole, then
// post's leftover tail is re-emitted verbatim below it.
const scopeSeamPre = `# Progress: Demo

### M1: Target
- [ ] P1-M1-1: alpha

### M2: Out of scope
- [ ] P1-M2-1: beta

  ## A heading quoted in beta's body

- [ ] P1-M2-2: gamma

## Session History
- row one
`

func TestRebuildAgreesWithSnapshotOnBlockBoundary(t *testing.T) {
	// The agent flipped an out-of-scope task while the action targeted M1.
	post := strings.Replace(scopeSeamPre, "- [ ] P1-M2-2: gamma", "- [x] P1-M2-2: gamma", 1)

	pre := parseProgressSnapshot("P", scopeSeamPre)
	got, err := rebuildAfterScopeGuard(pre, parseProgressSnapshot("P", post), "M1")
	if err != nil {
		t.Fatal(err)
	}

	// M1 is untouched and M2 reverts to pre, so the whole file must equal pre.
	if got != scopeSeamPre {
		t.Errorf("rebuild did not restore pre exactly.\n--- got ---\n%s\n--- want ---\n%s", got, scopeSeamPre)
	}
	for _, s := range []string{"P1-M2-2: gamma", "A heading quoted in beta's body"} {
		if n := strings.Count(got, s); n != 1 {
			t.Errorf("%q appears %d times, want 1 — post's tail was re-emitted below the pre block", s, n)
		}
	}
	if strings.Contains(got, "- [x] P1-M2-2") {
		t.Error("the out-of-scope flip survived the revert that the guard reported as applied")
	}
	// Idempotent: reverting an already-clean file changes nothing.
	again, err := rebuildAfterScopeGuard(pre, parseProgressSnapshot("P", got), "M1")
	if err != nil {
		t.Fatal(err)
	}
	if again != got {
		t.Error("rebuild is not idempotent — re-applying it grows the duplicates")
	}
}

func TestRebuildRemovesNewMilestoneWholeBlock(t *testing.T) {
	pre := `### M1: Target
- [ ] P1-M1-1: alpha

## Session History
`
	post := `### M1: Target
- [x] P1-M1-1: alpha

### M9: Milestone the agent invented
- [ ] P1-M9-1: smuggled

  ## rationale quoted from the spec

- [ ] P1-M9-2: also smuggled

## Session History
`
	got, err := rebuildAfterScopeGuard(parseProgressSnapshot("P", pre), parseProgressSnapshot("P", post), "M1")
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{"P1-M9-1", "P1-M9-2", "rationale quoted from the spec"} {
		if strings.Contains(got, s) {
			t.Errorf("%q survived removal of the invented milestone M9:\n%s", s, got)
		}
	}
	// Every assertion above is negative, so an empty document satisfies all of
	// them — `rebuildAfterScopeGuard` returning "" passed this test. Assert
	// positively that the target milestone and its in-scope flip survived.
	if !strings.Contains(got, "- [x] P1-M1-1: alpha") {
		t.Fatalf("the in-scope flip was destroyed along with M9:\n%s", got)
	}
	// The fragment used to land headerless under M1 and be adopted by it.
	snap := parseProgressSnapshot("P", got)
	idx, ok := snap.ByID["M1"]
	if !ok {
		t.Fatalf("M1 was removed by the rebuild:\n%s", got)
	}
	if n := len(snap.Blocks[idx].TaskStates); n != 1 {
		t.Errorf("M1 holds %d tasks after the rebuild, want 1 — M9's tail leaked into the target milestone: %v",
			n, snap.Blocks[idx].TaskStates)
	}
}

// The disagreement also runs the other way: isSectionBreak accepts `##` + TAB
// and a bare `##`, which the trimmed `"## "` test did not. There the block scan
// ran PAST the real region end and the replacement deleted everything after it.
func TestRebuildKeepsContentAfterTabbedSectionHeading(t *testing.T) {
	pre := "### M1: Target\n- [ ] P1-M1-1: alpha\n\n### M2: Out of scope\n- [ ] P1-M2-1: beta\n\n##\tSession History\n- row one\n- row two\n"
	post := strings.Replace(pre, "- [ ] P1-M2-1: beta", "- [x] P1-M2-1: beta", 1)

	got, err := rebuildAfterScopeGuard(parseProgressSnapshot("P", pre), parseProgressSnapshot("P", post), "M1")
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{"##\tSession History", "- row one", "- row two"} {
		if !strings.Contains(got, s) {
			t.Errorf("%q was deleted by an out-of-scope replacement:\n%s", s, got)
		}
	}
	// All three strings above are present in `post` verbatim, so returning
	// post.Raw unchanged passed this test. The revert itself has to be asserted.
	if !strings.Contains(got, "- [ ] P1-M2-1: beta") {
		t.Errorf("the out-of-scope flip was not reverted:\n%s", got)
	}
}
