package main

import (
	"strings"
	"testing"
)

// Issue #59's live shape: the first pending milestone in document order
// declares dependencies on two milestones that have not started. It is the
// last milestone that should run, and it was the one both status views named.
const depBlockedFirstProgress = `# Progress

## Milestones

### M16: Run the gating fixture (depends: M21, M22)

- [ ] P1-1: run the fixture

### M21: Contract carve

- [ ] P2-1: build the carve

### M22: Grader rework

- [ ] P3-1: build the grader
`

func TestNextMilestoneSkipsUnmetDeps(t *testing.T) {
	ms := parseMilestones(depBlockedFirstProgress)
	nm := nextMilestone(ms)
	if nm == nil {
		t.Fatal("no next milestone offered — M21 and M22 are workable")
	}
	if nm.ID != "M21" {
		t.Errorf("next milestone = %s, want M21 — M16's (depends: M21, M22) is unmet", nm.ID)
	}
}

func TestNextTaskSkipsDependencyBlockedMilestone(t *testing.T) {
	ms := parseMilestones(depBlockedFirstProgress)
	nt := nextTask(flattenTasks(ms, 0), ms)
	if nt == nil {
		t.Fatal("no next task offered — M21 and M22 hold workable tasks")
	}
	if nt.MilestoneID == "M16" {
		t.Errorf("next task %s belongs to M16, whose dependencies are unmet", nt.ID)
	}
	if nt.ID != "P2-1" {
		t.Errorf("next task = %s, want P2-1 (first workable task in an eligible milestone)", nt.ID)
	}
}

// A dependency is satisfied by done-not-verified — the same rule computeWaves
// has always used for wave scheduling. The two must not diverge (#59).
func TestNextMilestoneDepSatisfiedByDoneNotVerified(t *testing.T) {
	ms := parseMilestones(`### M2: Dependent (depends: M1)
- [ ] P2-1: b

### M1: Dep
- [x] P1-1: a
`)
	nm := nextMilestone(ms)
	if nm == nil || nm.ID != "M2" {
		t.Fatalf("next milestone = %v, want M2 — its dep M1 is all-done", nm)
	}
}

// computeWaves ignores a dependency naming no milestone; the selectors must
// too, or a typo'd (depends:) hides work from status that auto happily runs.
func TestNextMilestoneDanglingDepDoesNotBlock(t *testing.T) {
	ms := parseMilestones(`### M1: Work (depends: M99)
- [ ] P1-1: a
`)
	if nm := nextMilestone(ms); nm == nil || nm.ID != "M1" {
		t.Fatalf("next milestone = %v, want M1 — a dangling dep cannot block", nm)
	}
	if b := nextBlockedMilestone(ms); b != nil {
		t.Errorf("nextBlockedMilestone = %+v, want nil — nothing is blocked", b)
	}
}

func TestNextBlockedMilestoneNilWhenWorkIsOfferable(t *testing.T) {
	ms := parseMilestones(depBlockedFirstProgress)
	if b := nextBlockedMilestone(ms); b != nil {
		t.Errorf("nextBlockedMilestone = %+v, want nil while M21 is offerable", b)
	}
}

func TestNextBlockedMilestoneNilWhenComplete(t *testing.T) {
	ms := parseMilestones(`### M1: Done
- [v] P1-1: a
`)
	if b := nextBlockedMilestone(ms); b != nil {
		t.Errorf("nextBlockedMilestone = %+v, want nil on a finished feature", b)
	}
}

// Every undone milestone dependency-blocked (here, a cycle). nextMilestone is
// nil, but the render must NOT say "None": loop-recipe.md's stop condition
// treats "Next Milestone: None" plus no unverified warning as the feature
// being finished, so "None" here would make an interactive loop report
// COMPLETE over two pending tasks.
const depCycleProgress = `# Progress

## Milestones

### M1: First (depends: M2)

- [>] P1-1: a

### M2: Second (depends: M1)

- [ ] P2-1: b
`

func TestStatusNamesBlockingDependencyInsteadOfNone(t *testing.T) {
	report, _ := buildFeature(t, depCycleProgress)

	if report.NextMilestone != nil {
		t.Fatalf("NextMilestone = %v, want nil — every undone milestone is dep-blocked", report.NextMilestone)
	}
	if report.NextBlocked == nil {
		t.Fatal("NextBlocked is nil while undone dep-blocked work remains")
	}
	if report.NextBlocked.Milestone.ID != "M1" {
		t.Errorf("blocked milestone = %s, want M1 (first undone in document order)", report.NextBlocked.Milestone.ID)
	}

	out := renderStatus(report, false, false)
	if strings.Contains(out, "Next Milestone:\n  - None") {
		t.Errorf("detail view says None while two tasks are pending:\n%s", out)
	}
	if !strings.Contains(out, "(waiting on dependencies) M1 depends on M2 (status: pending)") {
		t.Errorf("detail view does not name the blocking dependency in the scanReadiness shape:\n%s", out)
	}
	if strings.Contains(out, "Next Individual Task:\n  - None") {
		t.Errorf("task line says None while dep-blocked work remains:\n%s", out)
	}
}

func TestListingNamesBlockingDependency(t *testing.T) {
	root := writeReverifyFixture(t, depCycleProgress)
	report, err := buildStatus(root, 55, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Features) != 1 {
		t.Fatalf("features = %d, want 1", len(report.Features))
	}
	f := report.Features[0]
	if f.Status != "In Progress" {
		t.Fatalf("fixture status = %q, want In Progress — the Next line is gated on it", f.Status)
	}
	if f.NextBlocked == nil {
		t.Fatal("listing summary carries no NextBlocked")
	}
	out := renderFeatureListing(report, false, false)
	if !strings.Contains(out, "Next: waiting on dependencies — M1 depends on M2 (status: pending)") {
		t.Errorf("listing does not name the blocking dependency:\n%s", out)
	}
}
