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
	// The contract on the explainer: it is set only when NO task is offerable.
	// Without this, dropping its nextTask guard emits next_task_blocked
	// alongside next_task in JSON, contradicting the types.go comment.
	if b := nextTaskBlockedByDeps(flattenTasks(ms, 0), ms); b != nil {
		t.Errorf("nextTaskBlockedByDeps = %+v, want nil while P2-1 is offerable", b)
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
	if !strings.Contains(out, "(waiting on dependencies — see Next Milestone above)") {
		t.Errorf("task line does not carry the see-above pointer:\n%s", out)
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

// The fail-safe direction of nextTask's milestone lookup: a task whose
// MilestoneID matches no milestone stays offerable. Hiding work over a lookup
// failure is the unsafe direction, and nothing else pins it — both production
// callers happen to derive tasks and milestones from the same slice.
func TestNextTaskUnknownMilestoneStaysOfferable(t *testing.T) {
	ms := parseMilestones("### M1: Done\n- [x] P1-1: a\n")
	tasks := []task{{ID: "X-1", Name: "orphan-built", Status: taskTodo, MilestoneID: "M99"}}
	nt := nextTask(tasks, ms)
	if nt == nil || nt.ID != "X-1" {
		t.Fatalf("next task = %v, want X-1 — a failed milestone lookup must not hide work", nt)
	}
}

// The scheduler half of "one predicate": computeWaves must order an
// unmet-dep milestone after its dependencies in the PLAIN suite, not only
// behind the eval build tag — inverting the in-degree count survived
// `go test ./cmd/belmont` before this test existed.
func TestComputeWavesOrdersUnmetDepAfterItsDependencies(t *testing.T) {
	ms := parseMilestones(depBlockedFirstProgress)
	waves, err := computeWaves(ms)
	if err != nil {
		t.Fatal(err)
	}
	if len(waves) != 2 {
		t.Fatalf("waves = %d, want 2", len(waves))
	}
	first := make(map[string]bool)
	for _, m := range waves[0].Milestones {
		first[m.ID] = true
	}
	if !first["M21"] || !first["M22"] || first["M16"] {
		t.Errorf("wave 0 = %v, want M21+M22 without M16", waves[0].Milestones)
	}
	if len(waves[1].Milestones) != 1 || waves[1].Milestones[0].ID != "M16" {
		t.Errorf("wave 1 = %v, want [M16]", waves[1].Milestones)
	}
}

// The next MILESTONE is offerable (its only live work is a [!]) while every
// workable TASK is dependency-suppressed. The task line must not read a bare
// "None" — that is indistinguishable from nothing-left — and the unmet dep's
// status word must say "blocked", not "in progress", for a [!]-gated
// milestone: blocked-vs-in-progress is a classification agents act on.
const offerableMilestoneBlockedTaskProgress = `# Progress

## Milestones

### M1: Human gate

- [v] P1-0: Draft shipped
- [!] P1-1: Approve the rollout
  Needs sign-off from the platform owner.

### M2: Downstream (depends: M1)

- [ ] P2-1: Build on the approval
`

func TestTaskLineNamesDepBlockWhenMilestoneOfferable(t *testing.T) {
	report, _ := buildFeature(t, offerableMilestoneBlockedTaskProgress)

	if report.NextMilestone == nil || report.NextMilestone.ID != "M1" {
		t.Fatalf("NextMilestone = %v, want M1 — fixture no longer reproduces the shape", report.NextMilestone)
	}
	if report.NextBlocked != nil {
		t.Fatalf("NextBlocked = %+v, want nil while M1 is offerable", report.NextBlocked)
	}
	if report.NextTaskBlocked == nil || report.NextTaskBlocked.Milestone.ID != "M2" {
		t.Fatalf("NextTaskBlocked = %+v, want M2", report.NextTaskBlocked)
	}

	out := renderStatus(report, false, false)
	if strings.Contains(out, "Next Individual Task:\n  - None") {
		t.Errorf("task line says bare None while P2-1 waits on M1:\n%s", out)
	}
	if !strings.Contains(out, "(waiting on dependencies) next candidate sits in M2 — depends on M1 (status: blocked)") {
		t.Errorf("task line does not name the dependency (or words a [!]-gated milestone as something other than blocked):\n%s", out)
	}
}

func TestListingTaskLineNamesDepBlock(t *testing.T) {
	root := writeReverifyFixture(t, offerableMilestoneBlockedTaskProgress)
	report, err := buildStatus(root, 55, "")
	if err != nil {
		t.Fatal(err)
	}
	f := report.Features[0]
	if f.Status != "In Progress" {
		t.Fatalf("fixture status = %q, want In Progress", f.Status)
	}
	out := renderFeatureListing(report, false, false)
	if !strings.Contains(out, "Next: waiting on dependencies — M2 depends on M1 (status: blocked)") {
		t.Errorf("listing does not name the task-level dependency block:\n%s", out)
	}
}

// An in-progress task counts as workable for the explainer too: a [>] task
// dep-suppressed in the offerable-milestone shape must still set
// NextTaskBlocked, or the task line regresses to a bare "None" for exactly
// the tasks someone already started.
func TestNextTaskBlockedByDepsCountsInProgress(t *testing.T) {
	ms := parseMilestones(`### M1: Gate
- [v] P1-0: shipped
- [!] P1-1: approve

### M2: Downstream (depends: M1)
- [>] P2-1: started already
`)
	b := nextTaskBlockedByDeps(flattenTasks(ms, 0), ms)
	if b == nil || b.Milestone.ID != "M2" {
		t.Fatalf("nextTaskBlockedByDeps = %+v, want M2 — a [>] task is workable", b)
	}
}

// When the two blocked explainers disagree — the first undone milestone and
// the first workable task's milestone are different — the listing prefers the
// milestone-level one, matching the detail view's precedence.
const cycleTwoExplainersProgress = `# Progress

## Milestones

### M1: Gate (depends: M2)

- [v] P1-0: shipped
- [!] P1-1: approve

### M2: Downstream (depends: M1)

- [ ] P2-1: pending work
`

func TestListingPrefersMilestoneLevelBlockOverTaskLevel(t *testing.T) {
	root := writeReverifyFixture(t, cycleTwoExplainersProgress)
	report, err := buildStatus(root, 55, "")
	if err != nil {
		t.Fatal(err)
	}
	f := report.Features[0]
	if f.Status != "In Progress" {
		t.Fatalf("fixture status = %q, want In Progress", f.Status)
	}
	if f.NextBlocked == nil || f.NextBlocked.Milestone.ID != "M1" {
		t.Fatalf("NextBlocked = %+v, want M1 — fixture no longer produces two explainers", f.NextBlocked)
	}
	if f.NextTaskBlocked == nil || f.NextTaskBlocked.Milestone.ID != "M2" {
		t.Fatalf("NextTaskBlocked = %+v, want M2", f.NextTaskBlocked)
	}
	out := renderFeatureListing(report, false, false)
	if !strings.Contains(out, "Next: waiting on dependencies — M1 depends on M2 (status: pending)") {
		t.Errorf("listing does not lead with the milestone-level block:\n%s", out)
	}
}

// The listing's Next line is gated on In Progress: a Not Started feature —
// even a dependency-blocked one — gets no Next line at all.
func TestListingNotStartedFeatureGetsNoNextLine(t *testing.T) {
	root := writeReverifyFixture(t, `# Progress

## Milestones

### M1: First (depends: M2)

- [ ] P1-1: a

### M2: Second (depends: M1)

- [ ] P2-1: b
`)
	report, err := buildStatus(root, 55, "")
	if err != nil {
		t.Fatal(err)
	}
	if got := report.Features[0].Status; got != "Not Started" {
		t.Fatalf("fixture status = %q, want Not Started", got)
	}
	out := renderFeatureListing(report, false, false)
	if strings.Contains(out, "Next:") {
		t.Errorf("listing prints a Next line for a Not Started feature:\n%s", out)
	}
}
