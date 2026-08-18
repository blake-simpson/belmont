package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// listFeaturesWithOverrides is like listFeatures but reads live state from any
// active worktrees.
//
// Two shapes, because auto has two. `worktreeOverrides` maps slug → worktree
// feature dir for serial and multi-feature runs, where one worktree owns a whole
// feature. `perMilestoneLive` maps milestone ID → worktree feature dir for
// single-feature-parallel runs, where each milestone has its own worktree and
// master stays the baseline.
//
// The second is why this takes more than the one map. `loadAutoWorktrees`
// collapses a parallel run to ONE representative directory — the alphabetically
// first milestone's — so this listing rendered a single worktree's PROGRESS.md
// as the whole feature and every other in-flight milestone was invisible. Since
// the listing now prints a pointer to `belmont blockers`, which reads
// per-milestone correctly, the two could disagree mid-run. See issue #42.
func listFeaturesWithOverrides(featuresDir string, maxName int, worktreeOverrides map[string]string, liveFeature string, perMilestoneLive map[string]string) []featureSummary {
	entries, err := os.ReadDir(featuresDir)
	if err != nil {
		return nil
	}
	var features []featureSummary
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		slug := entry.Name()
		featurePath := filepath.Join(featuresDir, slug)
		// In single-feature-parallel mode the live feature keeps MASTER as its
		// baseline and is overlaid milestone by milestone below. Swapping in a
		// representative worktree here is what collapsed the view.
		parallelLive := perMilestoneLive != nil && slug == liveFeature
		if override, ok := worktreeOverrides[slug]; ok && !parallelLive {
			featurePath = override
		}
		prdPath := filepath.Join(featurePath, "PRD.md")
		archivePath := filepath.Join(featurePath, "ARCHIVE.md")

		name := slug
		if prdContent, err := os.ReadFile(prdPath); err == nil {
			extracted := extractFeatureName(string(prdContent))
			if extracted != "Unknown" {
				name = extracted
			}
		} else if archiveContent, err := os.ReadFile(archivePath); err == nil {
			// Archived feature: PRD.md is gone; recover the name from the
			// "# Archive: <name>" header written by /belmont:cleanup.
			if extracted := extractArchiveName(string(archiveContent)); extracted != "" {
				name = extracted
			}
		}

		// Read all state from PROGRESS.md
		var milestones []milestone
		var orphaned int
		// Milestones the overlay could not source from their worktree, so this
		// row's counts include master's stale copy of them. Listing mode is what
		// `status.md`'s fast path runs, so it is the half that reaches an agent —
		// every "this is not what it looks like" signal has to appear here too.
		var liveGaps []liveOverlayGap
		progressPath := filepath.Join(featurePath, "PROGRESS.md")
		if progressContent, err := os.ReadFile(progressPath); err == nil {
			milestones = parseMilestones(string(progressContent))
			orphaned = len(orphanedTaskLines(string(progressContent)))
		} else if featurePath != filepath.Join(featuresDir, slug) {
			// A worktree override we could not read. Before #55 this branch did
			// not exist: `milestones` stayed nil and the row rendered `0/0`, with
			// no fallback to master either — so there was not even a baseline
			// behind the number.
			//
			// `0/0` is the worst available rendering of "I could not read this".
			// It is indistinguishable from a feature with no tasks, and it reads
			// as FINISHED NOTHING rather than KNOW NOTHING — on the view
			// `status.md`'s fast path runs, which is the half an agent sees.
			//
			// So: master's copy as the baseline, exactly what the parallel path
			// does, and a gap recorded so no reader treats the counts as live.
			// The gap is the same type and the same `describe()` the two
			// `state.go` sites use; the milestone slot says "all milestones"
			// because an unreadable file means every one of them fell back, not
			// a named few. `Reason` names the worktree copy as the thing that
			// failed, matching those sites: `324a965` moved that prose out of
			// `describe()`'s format string and into each construction site, so a
			// bare `err.Error()` here would be the one gap of the three that
			// never says *which* file could not be read, and the only one
			// opening with a raw Go error where the others open with a sentence.
			if masterContent, mErr := os.ReadFile(filepath.Join(featuresDir, slug, "PROGRESS.md")); mErr == nil {
				milestones = parseMilestones(string(masterContent))
				orphaned = len(orphanedTaskLines(string(masterContent)))
			}
			liveGaps = append(liveGaps, liveOverlayGap{
				Milestone: "all milestones",
				Path:      featurePath,
				Kind:      gapUnreadable,
				Reason:    "its worktree's PROGRESS.md could not be read (" + err.Error() + ")",
			})
		}
		if parallelLive {
			// Each milestone from its own worktree, master for the rest —
			// the same overlay `belmont status --feature` and `belmont
			// blockers` already use, so all three agree during a run.
			// Appended, not assigned. Nothing can reach both this and the
			// unreadable-worktree gap above today — `parallelLive` keeps
			// `featurePath` at master, which is the branch that gap needs — but
			// that is two conditions thirty-odd lines apart holding a data-loss bug
			// shut, and the gap it would discard is the only record that a
			// feature's counts are not live.
			var gaps []liveOverlayGap
			milestones, gaps = overlayLiveMilestones(milestones, perMilestoneLive)
			liveGaps = append(liveGaps, gaps...)
			// Orphans cannot ride that overlay: a task line outside every
			// milestone belongs to no milestone ID to be overlaid by, and lives
			// in one specific document. Union across master and every live
			// worktree, the way validateFeature does — counting master's alone
			// made the listing disagree with `belmont validate` about the same
			// set of files, while pointing the user at it.
			msIDs := make([]string, 0, len(perMilestoneLive))
			for id := range perMilestoneLive {
				msIDs = append(msIDs, id)
			}
			sort.Strings(msIDs) // map order would vary the count between runs
			seenOrphan := map[string]bool{}
			if b, err := os.ReadFile(progressPath); err == nil {
				for _, l := range orphanedTaskLines(string(b)) {
					seenOrphan[l.ID+"\x00"+l.Name] = true
				}
			}
			for _, id := range msIDs {
				b, err := os.ReadFile(filepath.Join(perMilestoneLive[id], "PROGRESS.md"))
				if err != nil {
					continue
				}
				for _, l := range orphanedTaskLines(string(b)) {
					seenOrphan[l.ID+"\x00"+l.Name] = true
				}
			}
			orphaned = len(seenOrphan)
		}

		tasks := flattenTasks(milestones, maxName)
		tasksTotal := len(tasks)
		tasksDone := 0
		tasksVerified := 0
		tasksInProgress := 0
		tasksBlocked := 0
		tasksWithdrawn := 0
		for _, t := range tasks {
			switch t.Status {
			case taskDone:
				tasksDone++
			case taskVerified:
				tasksVerified++
			case taskInProgress:
				tasksInProgress++
			case taskBlocked:
				tasksBlocked++
			case taskWithdrawn:
				tasksWithdrawn++
			}
		}

		milestonesDone := 0
		for _, m := range milestones {
			if milestoneAllDone(m) {
				milestonesDone++
			}
		}

		featureNextMilestone := nextMilestone(milestones)
		featureNextTask := nextTask(tasks, milestones)
		featureNextBlocked := nextBlockedMilestone(milestones)
		featureNextTaskBlocked := nextTaskBlockedByDeps(tasks, milestones)

		status := computeOverallStatus(tasks)

		// Features archived via /belmont:cleanup have their planning files
		// replaced with a single ARCHIVE.md summary. Without this check the
		// missing PROGRESS.md would make them look like "Not Started" and they
		// would leak into `belmont auto --all`.
		if fileExists(filepath.Join(featurePath, "ARCHIVE.md")) {
			status = "Archived"
		}

		features = append(features, featureSummary{
			Slug:            slug,
			Name:            name,
			TasksDone:       tasksDone + tasksVerified,
			TasksVerified:   tasksVerified,
			TasksInProgress: tasksInProgress,
			TasksBlocked:    tasksBlocked,
			TasksTotal:      tasksTotal,
			TasksWithdrawn:  tasksWithdrawn,
			MilestonesDone:  milestonesDone,
			TasksOrphaned:   orphaned,
			MilestonesTotal: len(milestones),
			Milestones:      milestones,
			NextMilestone:   featureNextMilestone,
			NextTask:        featureNextTask,
			NextBlocked:     featureNextBlocked,
			NextTaskBlocked: featureNextTaskBlocked,
			Status:          status,
			LiveGaps:        liveGaps,
		})
	}
	return features
}

// syncMasterFeatureStatuses updates the ## Features table in master .belmont/PROGRESS.md
// to match computed feature-level statuses. This prevents stale master data from causing
// auto mode to skip features that still have pending work.
// New table format: | Feature | Slug | Priority | Dependencies | Status | Milestones | Tasks |
func syncMasterFeatureStatuses(root string, features []featureSummary) {
	progressPath := filepath.Join(root, ".belmont", "PROGRESS.md")
	content, err := os.ReadFile(progressPath)
	if err != nil {
		return
	}

	// Build lookup from computed features
	type computed struct {
		Status     string
		MsDone     int
		MsTotal    int
		TasksDone  int
		TasksTotal int
	}
	lookup := make(map[string]computed)
	for _, f := range features {
		lookup[f.Slug] = computed{
			Status:     f.Status,
			MsDone:     f.MilestonesDone,
			MsTotal:    f.MilestonesTotal,
			TasksDone:  f.TasksDone,
			TasksTotal: f.TasksTotal,
		}
	}

	lines := strings.Split(string(content), "\n")
	colIdx := parseMasterTableColumns(lines)
	inTable := false
	changed := false
	for i, line := range lines {
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
		statusCol := colIdx["Status"]
		msCol := colIdx["Milestones"]
		tasksCol := colIdx["Tasks"]

		if slugCol < 0 || len(cells) <= slugCol {
			continue
		}

		slug := strings.TrimSpace(cells[slugCol])
		if slug == "Slug" || strings.HasPrefix(slug, "-") || strings.HasPrefix(slug, ":") {
			continue
		}

		c, ok := lookup[slug]
		if !ok {
			continue
		}

		newStatus := c.Status
		newMs := fmt.Sprintf("%d/%d", c.MsDone, c.MsTotal)
		newTasks := fmt.Sprintf("%d/%d", c.TasksDone, c.TasksTotal)

		cellsChanged := false
		if statusCol >= 0 && statusCol < len(cells) && cells[statusCol] != newStatus {
			cells[statusCol] = newStatus
			cellsChanged = true
		}
		if msCol >= 0 && msCol < len(cells) && cells[msCol] != newMs {
			cells[msCol] = newMs
			cellsChanged = true
		}
		if tasksCol >= 0 && tasksCol < len(cells) && cells[tasksCol] != newTasks {
			cells[tasksCol] = newTasks
			cellsChanged = true
		}

		if cellsChanged {
			var parts []string
			for _, c := range cells {
				parts = append(parts, " "+c+" ")
			}
			lines[i] = "|" + strings.Join(parts, "|") + "|"
			changed = true
		}
	}

	if changed {
		os.WriteFile(progressPath, []byte(strings.Join(lines, "\n")), 0644)
	}
}

// handleStaleWorktree checks for a stale branch/worktree from a previous interrupted run.
// Returns resumed=true if the existing worktree should be reused (skip creation).
// Returns resumed=false if stale state was cleaned up (proceed with fresh creation).
func handleStaleWorktree(root, id, branch, wtPath string) (resumed bool, err error) {
	// Check if branch already exists
	checkCmd := exec.Command("git", "branch", "--list", branch)
	checkCmd.Dir = root
	out, err := checkCmd.Output()
	if err != nil || strings.TrimSpace(string(out)) == "" {
		return false, nil // no stale branch, proceed normally
	}

	// Stale branch exists — determine what to do
	_, wtDirErr := os.Stat(wtPath)
	wtExists := wtDirErr == nil

	if isTerminal(os.Stdin) {
		// Interactive: prompt the user
		status := "branch exists"
		if wtExists {
			status = "branch + worktree exist"
		}
		fmt.Fprintf(os.Stderr, "\n\033[33m⚠ Branch '%s' exists from a previous run (%s).\033[0m\n", branch, status)
		fmt.Fprintf(os.Stderr, "  [r] Resume from where it left off\n")
		fmt.Fprintf(os.Stderr, "  [s] Start fresh (delete branch and restart)\n")
		fmt.Fprintf(os.Stderr, "  [q] Quit\n")
		fmt.Fprintf(os.Stderr, "> ")

		reader := bufio.NewReader(os.Stdin)
		line, _ := reader.ReadString('\n')
		choice := strings.TrimSpace(strings.ToLower(line))

		switch choice {
		case "r", "resume":
			if wtExists {
				// Worktree still exists — reuse it directly
				fmt.Fprintf(os.Stderr, "  Resuming with existing worktree at %s\n", wtPath)
			} else {
				// Branch exists but worktree is gone — reattach
				fmt.Fprintf(os.Stderr, "  Reattaching worktree to existing branch %s\n", branch)
				wtDir := filepath.Dir(wtPath)
				if err := os.MkdirAll(wtDir, 0755); err != nil {
					return false, fmt.Errorf("create worktree dir: %w", err)
				}
				addCmd := exec.Command("git", "worktree", "add", wtPath, branch)
				addCmd.Dir = root
				if out, err := addCmd.CombinedOutput(); err != nil {
					return false, fmt.Errorf("git worktree add (resume): %w (%s)", err, strings.TrimSpace(string(out)))
				}
			}
			// Rebase the worktree onto current main so sibling features that
			// merged while this one was paused are picked up. Conflicts abort
			// and warn — never auto-resolve. See
			// knowledge/auto-mode/resume-rebase.md for the design.
			n, rebaseErr := rebaseWorktreeOnMain(root, wtPath)
			announceWorktreeRebase(id, n, rebaseErr)
			// Leave .belmont/ as-is in the worktree — it has committed state from the
			// previous run. Don't overwrite with stale copy from main repo.
			// If it's an old symlink from a previous version, replace with a fresh copy.
			dstBelmont := filepath.Join(wtPath, ".belmont")
			if fi, err := os.Lstat(dstBelmont); err == nil && fi.Mode()&os.ModeSymlink != 0 {
				// Old-style symlink — replace with copy-based approach
				os.RemoveAll(dstBelmont)
				copyBelmontStateToWorktree(root, wtPath, id)
				commitWorktreeFeatureState(wtPath, id)
			} else if err != nil {
				// .belmont/ missing entirely — copy it in
				copyBelmontStateToWorktree(root, wtPath, id)
				commitWorktreeFeatureState(wtPath, id)
			}
			return true, nil

		case "q", "quit":
			return false, fmt.Errorf("user chose to quit")

		default: // "s", "start", or anything else → start fresh
			fmt.Fprintf(os.Stderr, "  Cleaning up stale state for %s...\n", id)
		}
	} else {
		// Non-interactive: auto-restart
		fmt.Fprintf(os.Stderr, "  Cleaning up stale branch '%s' from previous run...\n", branch)
	}

	// Clean up stale state (restart path)
	if wtExists {
		removeWorktree(root, wtPath, id)
	}
	// Prune any orphaned worktree references
	pruneCmd := exec.Command("git", "worktree", "prune")
	pruneCmd.Dir = root
	pruneCmd.Run()
	// Delete the stale branch
	delCmd := exec.Command("git", "branch", "-D", branch)
	delCmd.Dir = root
	delCmd.Run()

	return false, nil
}

// buildMilestoneLoopStates derives per-milestone state from the loop history.
func buildMilestoneLoopStates(history []historyEntry, milestones []milestone) map[string]*milestoneLoopState {
	states := make(map[string]*milestoneLoopState)
	for _, m := range milestones {
		states[m.ID] = &milestoneLoopState{
			ID:   m.ID,
			Name: m.Name,
			Done: milestoneAllDone(m),
		}
	}

	var lastImplementedMS string
	for _, h := range history {
		switch h.Action.Type {
		case actionImplementMilestone:
			msID := h.Action.MilestoneID
			if msID != "" {
				if s, ok := states[msID]; ok && h.Result != nil && h.Result.Success {
					s.Implemented = true
					s.WorkType = h.WorkType
					s.FilesChanged = h.FilesChanged
					lastImplementedMS = msID
				}
			}
		case actionVerify:
			// Attribute verification to the most recently implemented milestone
			if lastImplementedMS != "" {
				if s, ok := states[lastImplementedMS]; ok {
					if h.Result != nil {
						if h.Result.Success {
							s.Verified = true
							s.VerifySucceeded++
						} else {
							s.VerifyFailed++
						}
					}
				}
			}
		case actionTriage:
			// Track triage rounds per milestone
			if lastImplementedMS != "" {
				if s, ok := states[lastImplementedMS]; ok {
					s.FwlupFixRounds++
				}
			}
		}
	}
	return states
}

// interactiveMilestoneSelect shows milestones and lets user pick a range.
func interactiveMilestoneSelect(milestones []milestone) (from, to string, err error) {
	if len(milestones) == 0 {
		return "", "", nil
	}

	fmt.Fprintf(os.Stderr, "\033[1mMilestones:\033[0m\n")
	firstUndone := ""
	for _, m := range milestones {
		marker := "[ ]"
		// Same order as milestoneStatusIcon and auto's dry-run: withdrawn first,
		// because an all-withdrawn milestone is milestoneAllDone and rendering
		// it [x] claims work that never happened.
		if milestoneAllWithdrawn(m) {
			marker = "[-]"
		} else if milestoneAllDone(m) {
			marker = "[x]"
		}
		if !milestoneAllDone(m) && firstUndone == "" {
			firstUndone = m.ID
		}
		depStr := ""
		if len(m.Deps) > 0 {
			depStr = fmt.Sprintf(" \033[2m(depends: %s)\033[0m", strings.Join(m.Deps, ", "))
		}
		fmt.Fprintf(os.Stderr, "  %s %s: %s%s\n", marker, m.ID, m.Name, depStr)
	}

	lastID := milestones[len(milestones)-1].ID
	defaultRange := ""
	if firstUndone != "" {
		defaultRange = fmt.Sprintf("%s → %s", firstUndone, lastID)
	}

	fmt.Fprintf(os.Stderr, "\n\033[2mDefault range: %s\033[0m\n", defaultRange)
	fmt.Fprintf(os.Stderr, "Press Enter to accept, 'q' to quit, or enter range (e.g. M2 M5): ")

	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		return "", "", fmt.Errorf("auto: no input")
	}
	input := strings.TrimSpace(scanner.Text())

	if input == "q" || input == "quit" || input == "exit" {
		return "", "", fmt.Errorf("auto: cancelled by user")
	}

	if input == "" {
		// Accept defaults
		return "", "", nil
	}

	// Parse custom range
	parts := strings.Fields(input)
	if len(parts) == 1 {
		return parts[0], parts[0], nil
	}
	if len(parts) == 2 {
		return parts[0], parts[1], nil
	}

	return "", "", fmt.Errorf("auto: invalid range %q — use 'M2 M5' format", input)
}

// computeWaves groups milestones into waves using Kahn's algorithm for topological sort.
// Milestones in the same wave have all deps satisfied by prior waves.
// Already-done milestones satisfy deps but don't execute.
func computeWaves(milestones []milestone) ([]wave, error) {
	if len(milestones) == 0 {
		return nil, nil
	}

	byID := milestonesByID(milestones)

	// Compute in-degree for each undone milestone. What counts as a live
	// dependency edge is depSatisfied's business — the next-work selectors
	// consult the same predicate, so the scheduler and the status views
	// cannot disagree about what is blocked (#59).
	inDegree := make(map[string]int)
	for _, m := range milestones {
		if milestoneAllDone(m) {
			continue
		}
		count := 0
		for _, dep := range m.Deps {
			if !depSatisfied(dep, byID) {
				count++
			}
		}
		inDegree[m.ID] = count
	}

	var waves []wave
	remaining := len(inDegree)
	waveIdx := 0

	for remaining > 0 {
		// Find all milestones with zero in-degree
		var ready []milestone
		for id, deg := range inDegree {
			if deg == 0 {
				ready = append(ready, byID[id])
			}
		}

		if len(ready) == 0 {
			// Cycle detected
			var cycleIDs []string
			for id := range inDegree {
				cycleIDs = append(cycleIDs, id)
			}
			sort.Strings(cycleIDs)
			return nil, fmt.Errorf("dependency cycle detected among milestones: %s", strings.Join(cycleIDs, ", "))
		}

		// Sort ready milestones by ID for deterministic ordering
		sort.Slice(ready, func(i, j int) bool {
			return parseMilestoneNum(ready[i].ID) < parseMilestoneNum(ready[j].ID)
		})

		waves = append(waves, wave{Index: waveIdx, Milestones: ready})
		waveIdx++

		// Remove completed milestones and update in-degrees
		for _, m := range ready {
			delete(inDegree, m.ID)
			remaining--
		}
		for id, deg := range inDegree {
			m := byID[id]
			newDeg := deg
			for _, dep := range m.Deps {
				for _, completed := range ready {
					if dep == completed.ID {
						newDeg--
					}
				}
			}
			inDegree[id] = newDeg
		}
	}

	return waves, nil
}

// resolveSingleFeature returns the feature slug a single-feature command
// should operate on: the one given, or the only one on disk.
//
// Shared by `belmont reverify` and `belmont repair` so the two cannot disagree
// about what "the feature" is when the flag is omitted. `cmd` names the caller
// in the error text, which is the only thing that varies.
//
// Refusing when more than one exists is deliberate — both commands write to
// PROGRESS.md, and picking one alphabetically would edit a file the user was
// not looking at.
func resolveSingleFeature(root, feature, cmd string) (string, error) {
	featuresDir := filepath.Join(root, ".belmont", "features")
	if feature != "" {
		if !dirExists(filepath.Join(featuresDir, feature)) {
			return "", fmt.Errorf("%s: feature %q not found at %s", cmd, feature, filepath.Join(featuresDir, feature))
		}
		return feature, nil
	}
	entries, err := os.ReadDir(featuresDir)
	if err != nil {
		return "", fmt.Errorf("%s: no features directory at %s", cmd, featuresDir)
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			dirs = append(dirs, e.Name())
		}
	}
	if len(dirs) == 0 {
		return "", fmt.Errorf("%s: no features found", cmd)
	}
	if len(dirs) > 1 {
		return "", fmt.Errorf("%s: multiple features found, use --feature to specify one: %s", cmd, strings.Join(dirs, ", "))
	}
	return dirs[0], nil
}
