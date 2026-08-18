package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// jsonString encodes a Go string as a JSON string literal, quotes included.
//
// NOT `fmt.Sprintf("%q")`, which produces a **Go** string literal. The two agree
// on the easy cases — a quote, a backslash, a tab — and diverge on exactly the
// input that reaches this file: `%q` emits `\xNN` for a control byte or invalid
// UTF-8, and JSON has no `\x` escape, so the document fails to parse. A task
// name pasted out of coloured terminal output carries ESC, and follow-up labels
// are `t.ID` falling back to `t.Name`, i.e. free text a human wrote.
//
// The "build JSON manually to avoid importing encoding/json just for this"
// rationale below predates this package importing encoding/json in ten other
// files; the import is free now, and hand-rolled escaping was never correct.
func jsonString(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		// json.Marshal only fails on unencodable types, never on a string:
		// invalid UTF-8 is replaced with U+FFFD rather than erroring.
		return `""`
	}
	return string(b)
}

// resetVerifiedTasks rewrites verified task markers back to `[x]` within the
// milestones named in resetIDs, so the verification agent picks them up again.
// Returns the new content and whether anything changed.
//
// Extracted from runReverifyCmd so it can be tested directly. The marker is
// captured and classified via canonicalMarker rather than matched as a literal
// `\[v\]`: resetIDs is built from PARSED task states, so a rewriter that
// recognises fewer spellings than the parser silently no-ops — the milestone
// is selected for reset and then nothing is reset, and `belmont reverify`
// reports "nothing to re-verify" on a file full of verified tasks.
func resetVerifiedTasks(content string, resetIDs map[string]bool) (string, bool) {
	msHeaderRe := regexp.MustCompile(`^###\s+(?:[✅⬜🔄🚫]\s*)?M(\d+):\s*`)
	taskRe := regexp.MustCompile(`^(\s*-\s+)\[(.)\](\s+.*)$`)

	lines := strings.Split(content, "\n")
	currentMSID := ""
	changed := false
	for i, line := range lines {
		if hm := msHeaderRe.FindStringSubmatch(line); len(hm) >= 2 {
			currentMSID = "M" + hm[1]
		} else if isSectionBreak(line) {
			// This is a WRITER that attributes lines to a milestone, so it needs
			// the same region boundary every reader uses. Without it currentMSID
			// survived past a column-zero `## `, and `belmont reverify` rewrote
			// `[v]`-shaped lines under `## Session History` — historical log
			// entries silently mutated. See isSectionBreak and issue #31.
			currentMSID = ""
		}
		if !resetIDs[currentMSID] {
			continue
		}
		if vm := taskRe.FindStringSubmatch(line); len(vm) >= 4 && markerIsVerified(vm[2]) {
			lines[i] = vm[1] + "[x]" + vm[3]
			changed = true
		}
	}
	return strings.Join(lines, "\n"), changed
}

// resetMilestoneBeforeVerify rewrites one milestone's verified markers back to
// `[x]` and reports how many it changed.
//
// Two properties matter, and both are about bounding damage rather than about
// the rewrite itself.
//
// **Scoped to one milestone, called immediately before that milestone is
// dispatched.** The reset is destructive and runs before anything justifies it:
// nothing here restores a `[v]`, there is no backup and no signal handler, and
// the caller's failure branch records the error and moves on. Doing it for the
// whole range up front meant a run killed seconds in — Ctrl-C, a laptop
// sleeping, an agent hitting a rate limit — left every milestone downgraded and
// none re-verified, a diff that reads exactly like a regression. No Go code ever
// promotes a `[v]` (see knowledge/cross-cutting/verified-flip-recording.md), so
// each mark destroyed costs another verification agent run to earn back.
//
// **Re-read from disk on every call, never from a startup snapshot.** The
// verification agent commits its own edits to PROGRESS.md between milestones, so
// by the second iteration the content read at startup is stale; writing M2's
// reset from it would revert whatever M1's agent just recorded. That is the
// idempotency question issue #49 flagged as worth settling first, and this is
// the answer: the function owns the read, so there is no stale copy to get
// wrong.
func resetMilestoneBeforeVerify(progressPath, milestoneID string) (int, error) {
	content, err := os.ReadFile(progressPath)
	if err != nil {
		return 0, fmt.Errorf("reverify: cannot read %s: %w", progressPath, err)
	}
	newContent, changed := resetVerifiedTasks(string(content), map[string]bool{milestoneID: true})
	if !changed {
		return 0, nil
	}
	// Counted through parseMilestones rather than by diffing lines, so the count
	// reported to the user comes from the same reader that decides what a marker
	// means. Counting the rewrite's own line changes instead would add one more
	// place answering "what is a `[v]`", which is the shape of #27 and #31.
	n := 0
	for _, m := range parseMilestones(string(content)) {
		if m.ID != milestoneID {
			continue
		}
		for _, t := range m.Tasks {
			if t.Status == taskVerified {
				n++
			}
		}
	}
	if err := os.WriteFile(progressPath, []byte(newContent), 0644); err != nil {
		return 0, fmt.Errorf("reverify: failed to reset verified tasks in %s: %w", milestoneID, err)
	}
	return n, nil
}

// runReverifyCmd handles the "belmont reverify" command.
// Walks through completed milestones and runs verification on each sequentially.
// Reports which milestones passed and which had follow-up tasks created.
func runReverifyCmd(args []string) error {
	fs := flag.NewFlagSet("reverify", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	var root, feature, from, to, format, tool string
	fs.StringVar(&root, "root", ".", "project root")
	fs.StringVar(&feature, "feature", "", "feature slug")
	fs.StringVar(&from, "from", "", "start milestone (e.g. M3)")
	fs.StringVar(&to, "to", "", "end milestone (e.g. M10)")
	fs.StringVar(&format, "format", "text", "output format (text|json)")
	fs.StringVar(&tool, "tool", "", "CLI tool (claude|codex|gemini|copilot|cursor|pi|opencode)")
	if handled, err := parseCommandFlags(fs, args, "reverify"); err != nil || handled {
		return err
	}
	root, _ = filepath.Abs(root)

	// Auto-detect tool if not specified
	if tool == "" {
		tool = detectTool()
		if tool == "" {
			return fmt.Errorf("reverify: no supported AI tool CLI found on PATH\n\nSupported tools: claude, codex, gemini, copilot, cursor, pi, opencode\nInstall one or use --tool to specify")
		}
	}

	// Resolve feature — auto-detect if only one exists
	featuresDir := filepath.Join(root, ".belmont", "features")
	feature, err := resolveSingleFeature(root, feature, "reverify")
	if err != nil {
		return err
	}

	progressPath := filepath.Join(featuresDir, feature, "PROGRESS.md")
	progressContent, err := os.ReadFile(progressPath)
	if err != nil {
		return fmt.Errorf("reverify: cannot read %s: %w", progressPath, err)
	}

	milestones := parseMilestones(string(progressContent))
	inRange := milestonesInRange(milestones, from, to)

	// Milestones this command can act on: `[x]` is done-not-verified and gets
	// verified as-is; `[v]` is re-verified, which means resetting it to `[x]`
	// first so the agent picks it up.
	//
	// Selected BEFORE any reset, and deliberately so. The reset used to run for
	// the whole range up front purely to make `[v]` milestones visible to this
	// filter — which meant a run interrupted during M1 had already destroyed
	// M7's verified marks having verified nothing. Reading both states here
	// removes the reason for the bulk write; each milestone is reset
	// immediately before it is dispatched instead. See issue #49.
	var targets []milestone
	for _, m := range inRange {
		for _, t := range m.Tasks {
			if t.Status == taskDone || t.Status == taskVerified {
				targets = append(targets, m)
				break
			}
		}
	}

	if len(targets) == 0 {
		if format == "json" {
			// Same keys as the non-empty document below, so a consumer reads
			// one schema whether or not anything was dispatched.
			fmt.Printf("{\"feature\":%s,\"processed\":0,\"passed\":0,\"total_fwlups\":0,\"results\":[]}\n", jsonString(feature))
		} else {
			fmt.Fprintln(os.Stderr, "No milestones with unverified tasks to re-verify in the specified range.")
		}
		return nil
	}

	// Print header
	ids := make([]string, len(targets))
	for i, m := range targets {
		ids[i] = m.ID
	}
	msWord := "milestones"
	if len(targets) == 1 {
		msWord = "milestone"
	}
	fmt.Fprintf(os.Stderr, "\033[1mBelmont Reverify\033[0m — %s (%d %s)\n", feature, len(targets), msWord)
	fmt.Fprintf(os.Stderr, "Tool: %s | Milestones: %s\n\n", tool, strings.Join(ids, ", "))

	// Walk milestones sequentially, running verification on each
	type msResult struct {
		ID       string   `json:"id"`
		Name     string   `json:"name"`
		Passed   bool     `json:"passed"`
		Fwlups   []string `json:"fwlups,omitempty"`
		Duration float64  `json:"duration_s"`
		Error    string   `json:"error,omitempty"`
	}
	results := make([]msResult, 0, len(targets))

	// Load per-feature model tiers once; reverify maps to the verification agent tier.
	tiers, _ := parseModelTiers(filepath.Join(featuresDir, feature, "models.yaml"))
	verifyModelFlags := resolveModelFlags(tool, tiers.Tiers["verification"], root)

	// Refused BEFORE the loop, not inside it. `tool` does not vary per milestone,
	// so an unsupported one fails identically on every iteration — but the
	// in-loop `return` discarded the whole report to say so, and since the reset
	// failure above became record-and-continue that report can already hold
	// results by the time iteration 2 runs. `detectTool` can return `windsurf`,
	// which `toolHeadlessArgs` has no case for, so this is reachable with no
	// `--tool` flag at all.
	if toolHeadlessArgs(tool, "probe", root, verifyModelFlags, true) == nil {
		return fmt.Errorf("reverify: unsupported tool: %s", tool)
	}

	for i, m := range targets {
		fmt.Fprintf(os.Stderr, "━━ [%d/%d] VERIFY ━━ %s › %s: %s ━━\n", i+1, len(targets), feature, m.ID, m.Name)

		// Reset THIS milestone's verified tasks, and only now, so an interrupted
		// or failing run has downgraded at most the milestone in flight.
		//
		// A reset failure is recorded and skipped, not returned. Returning here
		// threw away the whole report: a run over M1..M3 that failed to reset M3
		// printed nothing at all about M1 and M2, which had already been
		// verified by then and whose results are the reason the user ran it. The
		// agent-failure branch below already records-and-continues; this is the
		// same shape.
		//
		// It does change the exit code: a reset failure used to make `belmont
		// reverify` exit non-zero and discard the whole report, and now it
		// exits 0 like every other per-milestone failure, because this function
		// returns nil once it reaches the summary. That is the existing
		// convention rather than a new one — an agent that fails outright is
		// already reported and not returned — and the signal is the summary,
		// where the milestone prints as `✗ … — error: …`, is absent from the
		// `n/n passed` count, and carries a non-null `error` in `--format json`.
		if n, err := resetMilestoneBeforeVerify(progressPath, m.ID); err != nil {
			fmt.Fprintf(os.Stderr, "\n\033[31m  ✗ %s could not be reset for re-verification: %s — skipped\033[0m\n\n", m.ID, err)
			results = append(results, msResult{
				ID:     m.ID,
				Name:   m.Name,
				Passed: false,
				Error:  fmt.Sprintf("reset before verification failed: %s", err),
			})
			continue
		} else if n > 0 {
			fmt.Fprintf(os.Stderr, "   resetting %d verified task(s) in %s before re-verification\n", n, m.ID)
		}

		// Build milestone-scoped verify prompt
		prompt := fmt.Sprintf("/belmont:verify --feature %s", feature)
		prompt += fmt.Sprintf("\n\nMILESTONE-SCOPED VERIFICATION: Only verify tasks marked [x] (done) in milestone %s. Do NOT verify tasks from other milestones. Focus on: (1) the tasks in %s meet their acceptance criteria, (2) build passes, (3) tests pass.\n\nOn success: mark verified tasks as [v] in PROGRESS.md.\nOn failure: add new [ ] follow-up tasks to milestone %s and leave originals as [x].\n\nCRITICAL: Do NOT modify tasks in any other milestone.", m.ID, m.ID, m.ID)
		prompt = adaptPromptForTool(prompt, tool)

		// Build and run the tool command
		args := toolHeadlessArgs(tool, prompt, root, verifyModelFlags, true)
		if args == nil {
			// Unreachable: the same call is made once before the loop, so an
			// unsupported tool has already been refused with nothing to discard.
			// Kept as a guard rather than deleted, because `toolHeadlessArgs`
			// takes the prompt and a future variant could in principle reject one.
			return fmt.Errorf("reverify: unsupported tool: %s", tool)
		}
		cmd := exec.Command(toolBinary(tool), args...)
		cmd.Dir = root

		prefix := fmt.Sprintf("\033[36m[%s][%s]\033[0m: ", feature, m.ID)
		var tw *tailWriter
		if tool == "claude" {
			tw = newTailWriter(os.Stderr, 1500, "")
			cmd.Stdout = &claudeStreamWriter{tw: tw, prefix: prefix}
			cmd.Stderr = tw
		} else {
			tw = newTailWriter(os.Stderr, 1500, prefix)
			cmd.Stdout = tw
			cmd.Stderr = tw
		}

		start := time.Now()
		runErr := cmd.Run()
		duration := time.Since(start)

		res := msResult{
			ID:       m.ID,
			Name:     m.Name,
			Duration: duration.Seconds(),
		}

		if runErr != nil {
			res.Passed = false
			res.Error = runErr.Error()
			fmt.Fprintf(os.Stderr, "\n\033[31m  ✗ %s failed (%.1fs): %s\033[0m\n\n", m.ID, res.Duration, runErr)
		} else {
			fmt.Fprintf(os.Stderr, "\n\033[32m  ✓ %s (%.1fs)\033[0m\n", m.ID, res.Duration)

			// Re-read status to detect verification results
			report, statusErr := buildStatus(root, 55, feature)
			if statusErr == nil {
				// Check for new incomplete tasks (follow-ups) in this milestone
				var followups []string
				for _, t := range report.Tasks {
					if (t.Status == taskTodo || t.Status == taskInProgress) &&
						t.MilestoneID == m.ID {
						label := t.ID
						if label == "" {
							label = t.Name
						}
						followups = append(followups, label)
					}
				}
				// Also check if any [x] tasks remain (verification didn't pass them)
				hasUnverified := false
				for _, t := range report.Tasks {
					if t.Status == taskDone && t.MilestoneID == m.ID {
						hasUnverified = true
						break
					}
				}
				res.Fwlups = followups
				res.Passed = len(followups) == 0 && !hasUnverified
			} else {
				res.Passed = true // assume passed if we can't check
			}

			if len(res.Fwlups) > 0 {
				fmt.Fprintf(os.Stderr, "  \033[33m  %d follow-up(s): %s\033[0m\n\n", len(res.Fwlups), strings.Join(res.Fwlups, ", "))
			} else {
				fmt.Fprintln(os.Stderr)
			}
		}

		results = append(results, res)
	}

	// Print summary
	passed := 0
	var allFwlups []string
	for _, r := range results {
		if r.Passed {
			passed++
		}
		allFwlups = append(allFwlups, r.Fwlups...)
	}

	if format == "json" {
		// Build JSON manually to avoid importing encoding/json just for this
		// "processed", not "verified": len(results) counts milestones the loop
		// attempted — failures included — and the only number this command could
		// honestly call verified is `passed`, which is already emitted. See #61.
		fmt.Printf(`{"feature":%s,"processed":%d,"passed":%d,"total_fwlups":%d,"results":[`, jsonString(feature), len(results), passed, len(allFwlups))
		for i, r := range results {
			if i > 0 {
				fmt.Print(",")
			}
			// Escaped per element through `jsonString`, like every other string
			// in this block. Hand-concatenating quotes around the joined slice
			// emitted invalid JSON the moment a label held a `"` or a `\`, and
			// the `%q` that replaced it was still wrong for a control byte —
			// these labels are not ID-shaped by construction: the label is
			// `t.ID` falling back to `t.Name`, so any free-text task name a
			// human wrote in PROGRESS.md reaches this writer verbatim.
			fwlupsJSON := "[]"
			if len(r.Fwlups) > 0 {
				quoted := make([]string, len(r.Fwlups))
				for i, f := range r.Fwlups {
					quoted[i] = jsonString(f)
				}
				fwlupsJSON = "[" + strings.Join(quoted, ",") + "]"
			}
			errJSON := "null"
			if r.Error != "" {
				errJSON = jsonString(r.Error)
			}
			fmt.Printf(`{"id":%s,"name":%s,"passed":%t,"fwlups":%s,"duration_s":%.1f,"error":%s}`,
				jsonString(r.ID), jsonString(r.Name), r.Passed, fwlupsJSON, r.Duration, errJSON)
		}
		fmt.Println("]}")
	} else {
		fmt.Fprintln(os.Stderr, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Fprintf(os.Stderr, "\033[1mReverify Summary\033[0m — %s\n\n", feature)
		for _, r := range results {
			if r.Error != "" {
				fmt.Fprintf(os.Stderr, "  \033[31m✗\033[0m %s: %s — error: %s\n", r.ID, r.Name, r.Error)
			} else if !r.Passed {
				fmt.Fprintf(os.Stderr, "  \033[33m⚠\033[0m %s: %s — %d follow-up(s): %s\n", r.ID, r.Name, len(r.Fwlups), strings.Join(r.Fwlups, ", "))
			} else {
				fmt.Fprintf(os.Stderr, "  \033[32m✓\033[0m %s: %s\n", r.ID, r.Name)
			}
		}
		fmt.Fprintf(os.Stderr, "\n  %d/%d passed", passed, len(results))
		if len(allFwlups) > 0 {
			fmt.Fprintf(os.Stderr, ", %d follow-up task(s) created", len(allFwlups))
		}
		fmt.Fprintln(os.Stderr)

		if len(allFwlups) > 0 {
			fmt.Fprintf(os.Stderr, "\nTo fix follow-ups: belmont auto --feature %s\n", feature)
		}
	}

	return nil
}
