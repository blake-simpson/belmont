package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// blockedListingCap is how many `[!]` tasks the multi-feature listing prints
// per feature before deferring to `belmont blockers`. See renderFeatureListing.
const blockedListingCap = 3

func runStatus(args []string) error {
	fsFlags := flag.NewFlagSet("status", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var root string
	var format string
	var maxName int
	var feature string
	var colorMode string
	var showArchived bool
	fsFlags.StringVar(&root, "root", ".", "project root")
	fsFlags.StringVar(&format, "format", "text", "text or json")
	fsFlags.IntVar(&maxName, "max-task-name", 55, "max task name length")
	fsFlags.StringVar(&feature, "feature", "", "feature slug")
	fsFlags.StringVar(&colorMode, "color", "auto", "auto, always, or never")
	fsFlags.BoolVar(&showArchived, "show-archived", false, "include archived features in the listing (text mode)")
	if handled, err := parseCommandFlags(fsFlags, args, "status"); err != nil || handled {
		return err
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}

	report, err := buildStatus(absRoot, maxName, feature)
	if err != nil {
		return err
	}

	switch strings.ToLower(format) {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "text":
		useColor, err := shouldColor(colorMode, os.Stdout)
		if err != nil {
			return fmt.Errorf("status: %w", err)
		}
		fmt.Print(renderStatus(report, useColor, showArchived))
		return nil
	default:
		return fmt.Errorf("status: unknown format %q", format)
	}
}

func buildStatus(root string, maxName int, feature string) (statusReport, error) {
	var report statusReport
	report.TaskCounts = map[string]int{
		"todo":        0,
		"in_progress": 0,
		"done":        0,
		"verified":    0,
		"blocked":     0,
		"total":       0,
	}

	// Detect monorepo workspaces. Honor explicit overrides in worktree.json
	// over auto-detection. Returns nil for single-package projects.
	if ws, primary, mType := resolveWorkspaces(root, loadWorktreeHooks(root)); mType != monorepoNone && len(ws) > 0 {
		entries := make([]monorepoWorkspace, 0, len(ws))
		for _, w := range ws {
			entries = append(entries, monorepoWorkspace{ID: w.ID, Path: w.Path})
		}
		report.Monorepo = &monorepoReport{
			Type:       string(mType),
			Primary:    primary,
			Workspaces: entries,
		}
	}

	// Check for PR_FAQ
	prfaqPath := filepath.Join(root, ".belmont", "PR_FAQ.md")
	report.PRFAQReady = fileHasRealContent(prfaqPath)

	// Determine base path based on feature mode
	featuresDir := filepath.Join(root, ".belmont", "features")

	// Load worktree overrides so we can read live state from active worktrees
	worktreeOverrides := loadAutoWorktrees(root)

	if feature != "" {
		// Specific feature requested
		featurePath := filepath.Join(featuresDir, feature)
		// If there's an active worktree for this feature (serial mode or
		// multi-feature mode), read state from there instead of the master
		// copy. In single-feature parallel mode we fall through to the
		// per-milestone merge below — master is still the baseline and we
		// overlay each milestone's live state from its own worktree.
		liveFeature, perMilestoneLive := loadAutoWorktreeStateByMilestone(root)
		if perMilestoneLive == nil {
			if override, ok := worktreeOverrides[feature]; ok {
				featurePath = override
			}
		}
		if !dirExists(featurePath) {
			return report, fmt.Errorf("status: feature %q not found in %s", feature, featuresDir)
		}

		prdPath := filepath.Join(featurePath, "PRD.md")
		progressPath := filepath.Join(featurePath, "PROGRESS.md")
		techPlanPath := filepath.Join(featurePath, "TECH_PLAN.md")

		prdContent, err := os.ReadFile(prdPath)
		if err != nil {
			return report, fmt.Errorf("status: missing %s", prdPath)
		}

		progressContent, err := os.ReadFile(progressPath)
		if err != nil {
			return report, fmt.Errorf("status: missing %s", progressPath)
		}

		report.Feature = extractFeatureName(string(prdContent))
		report.FeatureSlug = feature
		report.Milestones = parseMilestones(string(progressContent))
		report.Orphans = orphanedTaskLines(string(progressContent))

		// Single-feature parallel mode: overlay each active worktree's view
		// of its own milestone on top of master's baseline. Only the
		// worktree's owning milestone is overlaid; other milestones stay at
		// master's (possibly stale) state. Each overlaid milestone carries a
		// LiveFrom pointer so renderers can annotate it.
		if perMilestoneLive != nil && liveFeature == feature {
			report.Milestones, report.LiveGaps = overlayLiveMilestones(report.Milestones, perMilestoneLive)
		}

		report.Tasks = flattenTasks(report.Milestones, maxName)

		report.TaskCounts["total"] = len(report.Tasks)
		for _, t := range report.Tasks {
			switch t.Status {
			case taskDone:
				report.TaskCounts["done"]++
			case taskVerified:
				report.TaskCounts["verified"]++
			case taskBlocked:
				report.TaskCounts["blocked"]++
			case taskInProgress:
				report.TaskCounts["in_progress"]++
			case taskTodo:
				report.TaskCounts["todo"]++
			case taskWithdrawn:
				// Its own bucket: withdrawn is neither outstanding nor done,
				// and folding it into either would misreport the feature.
				report.TaskCounts["withdrawn"]++
			case taskUnknown:
				// Counted separately, never folded into todo. The whole point
				// of issue #27 is that an unreadable entry must not be given a
				// state it did not ask for.
				report.TaskCounts["unknown"]++
			}
		}

		report.LastCompleted = lastCompletedTask(report.Tasks)
		report.RecentDecisions = parseDecisions(string(progressContent), 3)
		report.NextMilestone = nextMilestone(report.Milestones)
		report.NextTask = nextTask(report.Tasks, report.Milestones)
		report.NextBlocked = nextBlockedMilestone(report.Milestones)
		report.TechPlanReady = techPlanReady(techPlanPath)
		report.OverallStatus = computeOverallStatus(report.Tasks)

		return report, nil
	}

	// Feature listing mode (default)
	listLiveFeature, listPerMilestoneLive := loadAutoWorktreeStateByMilestone(root)
	features := listFeaturesWithOverrides(featuresDir, maxName, worktreeOverrides, listLiveFeature, listPerMilestoneLive)
	if features == nil {
		features = []featureSummary{}
	}
	populateFeatureDeps(features, root)

	// Split archived features into their own slice so consumers (JSON + text
	// renderer) can treat them separately without re-filtering. Overall status
	// is still computed across the full set — archiving a finished feature
	// shouldn't regress the project status.
	active := make([]featureSummary, 0, len(features))
	var archived []featureSummary
	for _, f := range features {
		if f.Status == "Archived" {
			archived = append(archived, f)
		} else {
			active = append(active, f)
		}
	}
	report.Features = active
	report.ArchivedFeatures = archived
	report.Feature = extractProductName(filepath.Join(root, ".belmont", "PRD.md"))
	report.TechPlanReady = techPlanReady(filepath.Join(root, ".belmont", "TECH_PLAN.md"))

	if len(features) > 0 {
		report.OverallStatus = computeFeatureListStatus(features)
	} else {
		report.OverallStatus = "Not Started"
	}

	return report, nil
}

// readActiveAutoJSONOrNil is a shared helper for the readers above.
func readActiveAutoJSONOrNil(root string) *autoJSON {
	autoPath := filepath.Join(root, ".belmont", "auto.json")
	data, err := os.ReadFile(autoPath)
	if err != nil {
		return nil
	}
	var aj autoJSON
	if err := json.Unmarshal(data, &aj); err != nil || !aj.Active {
		return nil
	}
	return &aj
}

// diagnosticListCap bounds the per-task lines each diagnostic prints.
//
// The COUNT is always exact and always shown; only the enumeration is capped.
// `belmont status --feature` is the text an agent reads every loop iteration
// (#26 exists to shrink that payload), and these lists are O(tasks) on exactly
// the projects that triggered this PR — the reporting project had 85 orphans.
// Ten lines plus the total is enough to know the file is wrong and roughly
// where; `belmont validate` and `belmont repair` enumerate all of them.
const diagnosticListCap = 10

// writeDiagnosticLines prints "[marker] PROGRESS.md:<line> — <label>" per task,
// capped, with an honest tail. It never truncates silently: the dropped count
// is always stated, which is the same rule as everything else in this file.
func writeDiagnosticLines(sb *strings.Builder, tasks []task) {
	for i, t := range tasks {
		if i == diagnosticListCap {
			fmt.Fprintf(sb, "  … and %d more\n", len(tasks)-diagnosticListCap)
			return
		}
		label := t.ID
		if label == "" {
			label = t.Name
		}
		fmt.Fprintf(sb, "  [%s] PROGRESS.md:%d — %s\n", t.Marker, t.Line, label)
	}
}

func renderStatus(report statusReport, color bool, showArchived bool) string {
	// Feature listing mode (default when no --feature specified)
	if report.Features != nil {
		return renderFeatureListing(report, color, showArchived)
	}

	techPlan := "Not written (run /belmont:tech-plan to create)"
	if report.TechPlanReady {
		techPlan = "Ready"
	}

	taskLine := fmt.Sprintf("Tasks: %d verified, %d done, %d in progress, %d blocked, %d todo (of %d total)",
		report.TaskCounts["verified"],
		report.TaskCounts["done"],
		report.TaskCounts["in_progress"],
		report.TaskCounts["blocked"],
		report.TaskCounts["todo"],
		report.TaskCounts["total"],
	)
	// Only mentioned when non-zero: every project would otherwise carry a
	// permanent ", 0 withdrawn" for a state most features never use.
	if n := report.TaskCounts["withdrawn"]; n > 0 {
		taskLine += fmt.Sprintf("\n  %d withdrawn — deliberately dropped; see ## Decisions Log for why", n)
	}

	bold := func(s string) string {
		if color {
			return ansiBold + s + ansiReset
		}
		return s
	}

	var sb strings.Builder
	sb.WriteString(bold("Belmont Status") + "\n")
	sb.WriteString("==============\n\n")
	if report.Monorepo != nil {
		primaryLabel := ""
		if report.Monorepo.Primary != "" {
			primaryLabel = fmt.Sprintf(", primary=%s", report.Monorepo.Primary)
		}
		sb.WriteString(fmt.Sprintf("Monorepo: %s (%d workspaces%s)\n\n", report.Monorepo.Type, len(report.Monorepo.Workspaces), primaryLabel))
	}
	sb.WriteString(fmt.Sprintf("Feature: %s\n\n", report.Feature))
	sb.WriteString(fmt.Sprintf("Tech Plan: %s\n\n", techPlan))
	sb.WriteString(fmt.Sprintf("Status: %s\n\n", colorStatus(report.OverallStatus, color)))
	sb.WriteString(taskLine)
	sb.WriteString("\n\n")

	if len(report.Tasks) > 0 {
		for _, t := range report.Tasks {
			sb.WriteString(fmt.Sprintf("  %s %s: %s\n", taskStatusIcon(t.Status, color), t.ID, t.Name))
		}
	}
	sb.WriteString("\n")

	sb.WriteString("Milestones:\n")
	if len(report.Milestones) == 0 {
		sb.WriteString("  (none)\n")
	} else {
		anyLive := false
		for _, m := range report.Milestones {
			icon := milestoneStatusIcon(m, color)
			line := fmt.Sprintf("  %s %s: %s", icon, m.ID, m.Name)
			if m.LiveFrom != "" {
				anyLive = true
				if color {
					line += " \033[2m(live from worktree)\033[0m"
				} else {
					line += " (live from worktree)"
				}
			}
			sb.WriteString(line + "\n")
		}
		if anyLive {
			if color {
				sb.WriteString("  \033[2m⟳ live-tagged milestones reflect the worktree's in-flight state (not yet merged to master)\033[0m\n")
			} else {
				sb.WriteString("  live-tagged milestones reflect the worktree's in-flight state (not yet merged to master)\n")
			}
		}
	}
	sb.WriteString("\n")

	// A milestone shown from master's copy while its own worktree could not be
	// read is state the reader cannot place, and the rule is the same one
	// orphans and unknown markers follow: surface it, never drop it. Printed
	// with the milestone list it qualifies, because that list is what it makes
	// less true. See issue #48.
	if len(report.LiveGaps) > 0 {
		sb.WriteString(fmt.Sprintf("%s%d milestone(s) are shown from master's copy, not from their own worktrees:%s\n",
			warnPrefix(color), len(report.LiveGaps), warnSuffix(color)))
		for _, g := range report.LiveGaps {
			sb.WriteString("  " + g.describe() + "\n")
		}
		// Deliberately NOT "run belmont recover": the path above is the thing to
		// look at, and `recover` answers a different question.
		//
		// It is no longer a TRAP, though, which is what this comment used to say.
		// `recover` now reads auto.json, marks a live wave's worktrees IN FLIGHT
		// in `--list`, and refuses the mutating actions on them without --force.
		// See issue #52.
		sb.WriteString("  A run still in flight can also be a copy caught mid-write — re-run this before treating the worktree as broken.\n\n")
	}

	// Unrecognised markers are surfaced loudly and before anything else that
	// might be wrong because of them. Silence here is the whole of issue #27.
	if unknown := unknownMarkerTasks(report.Milestones); len(unknown) > 0 {
		sb.WriteString(fmt.Sprintf("%sUnrecognised task markers (%d) — excluded from counts, never scheduled:%s\n",
			warnPrefix(color), len(unknown), warnSuffix(color)))
		writeDiagnosticLines(&sb, unknown)
		sb.WriteString("  Expected one of [ ] [>] [x] [v] [!] [-] (letters are case-insensitive). Deliberately dropped work is [-] withdrawn, with the reason in ## Decisions Log.\n")
		sb.WriteString("\n")
	}

	// Task lines outside any milestone are invisible to every count above, so
	// the numbers just printed are wrong by exactly this many. Say so before
	// anything that might be wrong because of it. See issue #31.
	if len(report.Orphans) > 0 {
		sb.WriteString(fmt.Sprintf("%s%d task line(s) outside any milestone — not counted, never scheduled:%s\n",
			warnPrefix(color), len(report.Orphans), warnSuffix(color)))
		writeDiagnosticLines(&sb, report.Orphans)
		sb.WriteString("  A `## ` heading at column zero ends the milestones region. Move these under their `### M<n>:` heading, or indent the heading above them.\n\n")
	}

	// A feature reading "Complete" with unverified tasks is the terminal state
	// of a dropped `[v]` flip: verification ran, the report said so, and the
	// write never happened. Every stop condition in the product treats done as
	// finished, so without this line the run ends reporting success. Naming
	// `belmont reverify` matters — it is the only recovery for this state, and
	// naming it here is what makes it discoverable. See issue #30.
	if report.OverallStatus == "Complete" {
		if dnv := doneNotVerifiedTasks(report.Milestones); len(dnv) > 0 {
			sb.WriteString(fmt.Sprintf("%s%d task(s) implemented but never verified — this feature reads Complete, not Verified:%s\n",
				warnPrefix(color), len(dnv), warnSuffix(color)))
			for i, t := range dnv {
				if i == diagnosticListCap {
					sb.WriteString(fmt.Sprintf("  … and %d more\n", len(dnv)-diagnosticListCap))
					break
				}
				label := t.ID
				if label == "" {
					label = t.Name
				}
				sb.WriteString(fmt.Sprintf("  [x] %s\n", label))
			}
			sb.WriteString(fmt.Sprintf("  Verification may have run without recording its result. Recover with: belmont reverify --feature %s\n",
				nonEmpty(report.FeatureSlug, "<slug>")))
			sb.WriteString("\n")
		}
	}

	blocked := blockedTaskNames(report.Milestones)
	if len(blocked) > 0 {
		sb.WriteString("Blocked Tasks:\n")
		for _, b := range blocked {
			sb.WriteString(fmt.Sprintf("  - %s\n", b))
		}
		sb.WriteString(fmt.Sprintf("  Each needs a person, not an agent. Read them together with their\n"+
			"  detail: belmont blockers --feature %s\n", nonEmpty(report.FeatureSlug, "<slug>")))
		sb.WriteString("\n")
	}

	sb.WriteString("Next Milestone:\n")
	switch {
	case report.NextMilestone != nil:
		sb.WriteString(fmt.Sprintf("  - %s - %s\n", report.NextMilestone.ID, report.NextMilestone.Name))
	case report.NextBlocked != nil:
		// Never "None" while undone work remains: loop-recipe.md's stop
		// condition treats "Next Milestone: None" as the feature being
		// finished, so a dependency-blocked file must render distinctly.
		b := report.NextBlocked
		sb.WriteString(fmt.Sprintf("  - (waiting on dependencies) %s depends on %s\n",
			b.Milestone.ID, strings.Join(b.UnmetDeps, ", ")))
	default:
		sb.WriteString("  - None\n")
	}
	sb.WriteString("Next Individual Task:\n")
	switch {
	case report.NextTask != nil:
		sb.WriteString(fmt.Sprintf("  - %s - %s\n", report.NextTask.ID, report.NextTask.Name))
	case report.NextBlocked != nil:
		sb.WriteString("  - (waiting on dependencies — see Next Milestone above)\n")
	default:
		sb.WriteString("  - None\n")
	}
	sb.WriteString("\n")

	sb.WriteString("Recent Activity:\n")
	sb.WriteString("---\n")
	if report.LastCompleted == nil {
		sb.WriteString("Last completed: None\n")
	} else {
		sb.WriteString(fmt.Sprintf("Last completed: %s - %s\n", report.LastCompleted.ID, report.LastCompleted.Name))
	}
	sb.WriteString("Recent decisions:\n")
	if len(report.RecentDecisions) == 0 {
		sb.WriteString("  - None\n")
	} else {
		for _, d := range report.RecentDecisions {
			sb.WriteString(fmt.Sprintf("  - %s\n", d))
		}
	}
	sb.WriteString(statusLegend(color))
	return sb.String()
}

func renderFeatureListing(report statusReport, color bool, showArchived bool) string {
	prfaq := "Not written (run /belmont:working-backwards)"
	if report.PRFAQReady {
		prfaq = "Written"
	}
	techPlan := "Not written"
	if report.TechPlanReady {
		techPlan = "Ready"
	}

	bold := func(s string) string {
		if color {
			return ansiBold + s + ansiReset
		}
		return s
	}

	var sb strings.Builder
	sb.WriteString(bold("Belmont Status") + "\n")
	sb.WriteString("==============\n\n")
	if report.Monorepo != nil {
		primaryLabel := ""
		if report.Monorepo.Primary != "" {
			primaryLabel = fmt.Sprintf(", primary=%s", report.Monorepo.Primary)
		}
		sb.WriteString(fmt.Sprintf("Monorepo: %s (%d workspaces%s)\n\n", report.Monorepo.Type, len(report.Monorepo.Workspaces), primaryLabel))
	}
	sb.WriteString(fmt.Sprintf("Product: %s\n\n", report.Feature))
	sb.WriteString(fmt.Sprintf("PR/FAQ: %s\n", prfaq))
	sb.WriteString(fmt.Sprintf("Master Tech Plan: %s\n\n", techPlan))
	sb.WriteString(fmt.Sprintf("Status: %s\n\n", colorStatus(report.OverallStatus, color)))

	// report.Features is already archived-free (split in buildStatus).
	// Archived features are rendered separately as a compact block below the
	// active listing so their "0/0" noise doesn't clutter active work.
	listing := report.Features

	if len(listing) == 0 && len(report.ArchivedFeatures) == 0 {
		sb.WriteString("Features:\n")
		sb.WriteString("  (none — run /belmont:product-plan to create your first feature)\n")
	} else if len(listing) == 0 {
		sb.WriteString("Features:\n")
		sb.WriteString("  (no active features — all archived)\n\n")
	} else {
		for _, f := range listing {
			icon := featureStatusIcon(f.Status, color)
			sb.WriteString(fmt.Sprintf("%s %s (%s)\n", icon, f.Name, f.Slug))
			sb.WriteString(fmt.Sprintf("  Tasks: %d/%d done", f.TasksDone, f.TasksTotal))
			if f.TasksVerified > 0 {
				sb.WriteString(fmt.Sprintf(" (%d verified)", f.TasksVerified))
			}
			// Withdrawn work is inside that denominator and is never going to
			// move, so a reader doing the obvious subtraction is wrong by
			// exactly this many. Detail mode says so; listing mode is the half
			// an agent actually reads.
			if f.TasksWithdrawn > 0 {
				sb.WriteString(fmt.Sprintf(", %d withdrawn", f.TasksWithdrawn))
			}
			if f.MilestonesTotal > 0 {
				sb.WriteString(fmt.Sprintf("  |  Milestones: %d/%d done", f.MilestonesDone, f.MilestonesTotal))
			}
			sb.WriteString("\n")

			// Listing mode is what `status.md`'s fast path actually runs (no
			// --feature), so it is the half that reaches an interactive agent —
			// every "this file is not what it looks like" signal has to appear
			// here too, not just in the detail view. Issues #27, #30, #31.
			if unknown := unknownMarkerTasks(f.Milestones); len(unknown) > 0 {
				sb.WriteString(fmt.Sprintf("%s  ⚠ %d unrecognised task marker(s) — excluded from counts, never scheduled; run: belmont status --feature %s%s\n",
					warnPrefix(color), len(unknown), f.Slug, warnSuffix(color)))
			}
			// A milestone the overlay could not source from its worktree makes
			// this row's counts partly master's fork-point copy. Same contract as
			// the two warnings around it: say it here, not only in the detail
			// view. See issue #48.
			if len(f.LiveGaps) > 0 {
				ids := make([]string, 0, len(f.LiveGaps))
				for _, g := range f.LiveGaps {
					ids = append(ids, g.Milestone)
				}
				sb.WriteString(fmt.Sprintf("%s  ⚠ %s shown from master's copy, not its worktree — the counts above may be stale; run: belmont status --feature %s%s\n",
					warnPrefix(color), strings.Join(ids, ", "), f.Slug, warnSuffix(color)))
			}
			if f.TasksOrphaned > 0 {
				sb.WriteString(fmt.Sprintf("%s  ⚠ %d task line(s) outside any milestone — not counted, never scheduled; run: belmont status --feature %s%s\n",
					warnPrefix(color), f.TasksOrphaned, f.Slug, warnSuffix(color)))
			}
			// Withdrawn tasks are in TasksTotal but were never implemented, so
			// they must not be counted as implementations awaiting
			// verification. TasksDone is done-or-verified, so subtracting the
			// verified ones leaves exactly the `[x]` count the detail view
			// reports through doneNotVerifiedTasks — the two views have to
			// agree, and `TasksTotal - TasksVerified` made them disagree the
			// moment a feature held a `[-]`.
			if f.Status == "Complete" && f.TasksDone > f.TasksVerified {
				sb.WriteString(fmt.Sprintf("%s  ⚠ %d task(s) implemented but never verified — belmont reverify --feature %s%s\n",
					warnPrefix(color), f.TasksDone-f.TasksVerified, f.Slug, warnSuffix(color)))
			}

			// Show milestone listing
			if len(f.Milestones) > 0 {
				for _, m := range f.Milestones {
					isNext := f.NextMilestone != nil && m.ID == f.NextMilestone.ID
					mIcon := milestoneStatusIcon(m, color)
					if milestoneNotStarted(m) && isNext {
						if color {
							mIcon = ansiYellow + "[>]" + ansiReset
						} else {
							mIcon = "[>]"
						}
					}
					sb.WriteString(fmt.Sprintf("    %s %s: %s\n", mIcon, m.ID, m.Name))
				}
			}

			// Show next task if feature is in progress
			if f.NextTask != nil && f.Status == "In Progress" {
				sb.WriteString(fmt.Sprintf("  Next: %s — %s\n", f.NextTask.ID, f.NextTask.Name))
			} else if f.NextBlocked != nil && f.Status == "In Progress" {
				sb.WriteString(fmt.Sprintf("  Next: waiting on dependencies — %s depends on %s\n",
					f.NextBlocked.Milestone.ID, strings.Join(f.NextBlocked.UnmetDeps, ", ")))
			}

			// Show blocked tasks if any.
			//
			// Capped at blockedListingCap in the listing view only. A feature
			// can bank up dozens of `[!]` tasks over a long run, and every one
			// of them carries a full sentence of explanation — the listing is
			// the whole-project overview, and printing them all buried every
			// other feature under one feature's decision queue. Nothing is
			// hidden: the count and the exact command to read them all print
			// on the next line. The --feature detail view is unchanged, and
			// still lists every one.
			if f.TasksBlocked > 0 {
				blockedNames := blockedTaskNames(f.Milestones)
				sb.WriteString("  Blocked:\n")
				shown := blockedNames
				if len(shown) > blockedListingCap {
					shown = shown[:blockedListingCap]
				}
				for _, b := range shown {
					sb.WriteString(fmt.Sprintf("    - %s\n", b))
				}
				if len(blockedNames) > len(shown) {
					sb.WriteString(fmt.Sprintf("    …and %d more — belmont blockers --feature %s\n",
						len(blockedNames)-len(shown), f.Slug))
				}
			}

			sb.WriteString("\n")
		}
	}

	if showArchived && len(report.ArchivedFeatures) > 0 {
		var block strings.Builder
		block.WriteString(fmt.Sprintf("Archived (%d):\n", len(report.ArchivedFeatures)))
		for _, f := range report.ArchivedFeatures {
			if f.Name != "" && f.Name != f.Slug {
				block.WriteString(fmt.Sprintf("  - %s — %s\n", f.Slug, f.Name))
			} else {
				block.WriteString(fmt.Sprintf("  - %s\n", f.Slug))
			}
		}
		out := block.String()
		if color {
			out = ansiDim + out + ansiReset
		}
		sb.WriteString(out)
		sb.WriteString("\n")
	}

	sb.WriteString("Use --feature <slug> for detailed task-level status.\n")
	sb.WriteString(statusLegend(color))
	return sb.String()
}

func printLoopState(report statusReport, hasFwlup bool) {
	done := report.TaskCounts["done"] + report.TaskCounts["verified"]
	total := report.TaskCounts["total"]
	msDone := countDoneMilestones(report.Milestones)
	msTotal := len(report.Milestones)

	// Progress bar
	barWidth := 20
	filled := 0
	if total > 0 {
		filled = (done * barWidth) / total
	}
	bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)
	fmt.Fprintf(os.Stderr, "  [%s] %d/%d tasks, %d/%d milestones", bar, done, total, msDone, msTotal)

	if hasFwlup {
		fmt.Fprintf(os.Stderr, " \033[33m(FWLUP)\033[0m")
	}
	blockedCount := blockedTaskCount(report.Milestones)
	if blockedCount > 0 {
		fmt.Fprintf(os.Stderr, " \033[31m(%d blocked)\033[0m", blockedCount)
	}
	fmt.Fprintln(os.Stderr)
}

func describeMilestone(action *loopAction, report statusReport) string {
	if action.MilestoneID != "" {
		for _, m := range report.Milestones {
			if m.ID == action.MilestoneID {
				return m.ID + ": " + m.Name
			}
		}
	}
	if action.Type == actionVerify || action.Type == actionImplementNext {
		if report.NextMilestone != nil {
			return report.NextMilestone.ID + ": " + report.NextMilestone.Name
		}
	}
	return ""
}
