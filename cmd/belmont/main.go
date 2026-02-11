package main

import (
	"bufio"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	Version   = "dev"
	CommitSHA = "unknown"
	BuildDate = "unknown"
)

type taskStatus string

const (
	taskComplete   taskStatus = "complete"
	taskBlocked    taskStatus = "blocked"
	taskInProgress taskStatus = "in_progress"
	taskPending    taskStatus = "pending"
)

type task struct {
	ID     string
	Name   string
	Status taskStatus
}

type milestone struct {
	ID   string
	Name string
	Done bool
}

type statusReport struct {
	Feature         string
	TechPlanReady   bool
	OverallStatus   string
	TaskCounts      map[string]int
	Tasks           []task
	Milestones      []milestone
	Blockers        []string
	NextMilestone   *milestone
	NextTask        *task
	LastCompleted   *task
	RecentDecisions []string
}

type cacheIndex struct {
	Root        string      `json:"root"`
	GeneratedAt time.Time   `json:"generated_at"`
	Files       []cacheFile `json:"files"`
}

type cacheFile struct {
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"mod_time"`
	IsDir   bool      `json:"is_dir"`
}

type findResult struct {
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
}

type searchResult struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Text string `json:"text"`
}

type config struct {
	Source string `json:"source"`
}

func main() {
	// Clean up old binary on Windows after self-update
	if runtime.GOOS == "windows" {
		if exe, err := os.Executable(); err == nil {
			old := exe + ".old"
			if _, err := os.Stat(old); err == nil {
				os.Remove(old)
			}
		}
	}

	if len(os.Args) < 2 {
		printUsage(os.Stderr)
		os.Exit(1)
	}

	switch os.Args[1] {
	case "status":
		must(runStatus(os.Args[2:]))
	case "tree":
		must(runTree(os.Args[2:]))
	case "find":
		must(runFind(os.Args[2:]))
	case "search":
		must(runSearch(os.Args[2:]))
	case "install":
		must(runInstall(os.Args[2:]))
	case "update":
		must(runUpdate(os.Args[2:]))
	case "version":
		fmt.Printf("belmont %s (%s, %s)\n", Version, CommitSHA, BuildDate)
	case "help", "-h", "--help":
		printUsage(os.Stdout)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", os.Args[1])
		printUsage(os.Stderr)
		os.Exit(1)
	}
}

func printUsage(w io.Writer) {
	fmt.Fprintln(w, "Belmont Helper")
	fmt.Fprintln(w, "==============")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintln(w, "  belmont install [--source PATH] [--project PATH] [--tools all|none|claude,codex,...]")
	fmt.Fprintln(w, "  belmont update [--check] [--force]")
	fmt.Fprintln(w, "  belmont status [--root PATH] [--format text|json]")
	fmt.Fprintln(w, "  belmont tree [--root PATH] [--max-depth N] [--max-entries N] [--format text|json]")
	fmt.Fprintln(w, "  belmont find --name QUERY [--root PATH] [--regex] [--type file|dir|any] [--limit N] [--format text|json]")
	fmt.Fprintln(w, "  belmont search --pattern REGEX [--root PATH] [--limit N] [--format text|json]")
	fmt.Fprintln(w, "  belmont version")
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}

func runStatus(args []string) error {
	fsFlags := flag.NewFlagSet("status", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var root string
	var format string
	var maxName int
	fsFlags.StringVar(&root, "root", ".", "project root")
	fsFlags.StringVar(&format, "format", "text", "text or json")
	fsFlags.IntVar(&maxName, "max-task-name", 55, "max task name length")
	if err := fsFlags.Parse(args); err != nil {
		return fmt.Errorf("status: %w", err)
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}

	report, err := buildStatus(absRoot, maxName)
	if err != nil {
		return err
	}

	switch strings.ToLower(format) {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "text":
		fmt.Print(renderStatus(report))
		return nil
	default:
		return fmt.Errorf("status: unknown format %q", format)
	}
}

func buildStatus(root string, maxName int) (statusReport, error) {
	var report statusReport
	report.TaskCounts = map[string]int{
		"done":        0,
		"in_progress": 0,
		"blocked":     0,
		"pending":     0,
		"total":       0,
	}

	prdPath := filepath.Join(root, ".belmont", "PRD.md")
	progressPath := filepath.Join(root, ".belmont", "PROGRESS.md")
	techPlanPath := filepath.Join(root, ".belmont", "TECH_PLAN.md")

	prdContent, err := os.ReadFile(prdPath)
	if err != nil {
		return report, fmt.Errorf("status: missing %s", prdPath)
	}

	progressContent, err := os.ReadFile(progressPath)
	if err != nil {
		return report, fmt.Errorf("status: missing %s", progressPath)
	}

	report.Feature = extractFeatureName(string(prdContent))
	report.Tasks = parseTasks(string(prdContent), maxName)

	assignTaskStatuses(report.Tasks)
	report.TaskCounts["total"] = len(report.Tasks)
	for _, t := range report.Tasks {
		switch t.Status {
		case taskComplete:
			report.TaskCounts["done"]++
		case taskBlocked:
			report.TaskCounts["blocked"]++
		case taskInProgress:
			report.TaskCounts["in_progress"]++
		case taskPending:
			report.TaskCounts["pending"]++
		}
	}

	report.LastCompleted = lastCompletedTask(report.Tasks)

	report.Milestones = parseMilestones(string(progressContent))
	report.Blockers = parseBlockers(string(progressContent))
	report.RecentDecisions = parseDecisions(string(progressContent), 3)

	report.NextMilestone = nextMilestone(report.Milestones)
	report.NextTask = nextTask(report.Tasks)

	report.TechPlanReady = techPlanReady(techPlanPath)

	report.OverallStatus = computeOverallStatus(string(progressContent), report.Tasks)

	return report, nil
}

func extractFeatureName(prd string) string {
	re := regexp.MustCompile(`(?m)^#\s*PRD:\s*(.+)$`)
	match := re.FindStringSubmatch(prd)
	if len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return "Unknown"
}

func parseTasks(prd string, maxName int) []task {
	re := regexp.MustCompile(`(?m)^###\s+(P\d+-\d+):\s*(.+)$`)
	matches := re.FindAllStringSubmatch(prd, -1)
	tasks := make([]task, 0, len(matches))
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		id := strings.TrimSpace(match[1])
		raw := strings.TrimSpace(match[2])
		status := detectTaskStatus(raw)
		cleaned := normalizeTaskName(raw)
		if maxName > 0 && len([]rune(cleaned)) > maxName {
			cleaned = string([]rune(cleaned)[:maxName-1]) + "…"
		}
		tasks = append(tasks, task{ID: id, Name: cleaned, Status: status})
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

func normalizeTaskName(name string) string {
	cleaned := name
	cleaned = strings.ReplaceAll(cleaned, "✅", "")
	cleaned = strings.ReplaceAll(cleaned, "🚫", "")
	cleaned = strings.ReplaceAll(cleaned, "🔄", "")
	cleaned = strings.ReplaceAll(cleaned, "⬜", "")

	cleaned = regexp.MustCompile(`(?i)\[done\]`).ReplaceAllString(cleaned, "")
	cleaned = regexp.MustCompile(`(?i)blocked`).ReplaceAllString(cleaned, "")
	cleaned = regexp.MustCompile(`(?i)follow-?up`).ReplaceAllString(cleaned, "")

	return strings.TrimSpace(cleaned)
}

func assignTaskStatuses(tasks []task) {
	inProgressAssigned := false
	for i := range tasks {
		status := tasks[i].Status
		if status == taskPending && !inProgressAssigned {
			status = taskInProgress
			inProgressAssigned = true
		}
		tasks[i].Status = status
	}
}

func detectTaskStatus(name string) taskStatus {
	if strings.Contains(name, "✅") || regexp.MustCompile(`(?i)\[done\]`).MatchString(name) {
		return taskComplete
	}
	if strings.Contains(name, "🚫") || regexp.MustCompile(`(?i)blocked`).MatchString(name) {
		return taskBlocked
	}
	return taskPending
}

func parseTaskOrder(id string) (int, int) {
	re := regexp.MustCompile(`^P(\d+)-(\d+)$`)
	match := re.FindStringSubmatch(id)
	if len(match) != 3 {
		return 99, 99
	}
	return atoiDefault(match[1], 99), atoiDefault(match[2], 99)
}

func lastCompletedTask(tasks []task) *task {
	var last *task
	for i := range tasks {
		if tasks[i].Status == taskComplete {
			t := tasks[i]
			last = &t
		}
	}
	return last
}

func parseMilestones(progress string) []milestone {
	re := regexp.MustCompile(`(?m)^###\s+([✅⬜🔄🚫])?\s*M(\d+):\s*(.+)$`)
	matches := re.FindAllStringSubmatch(progress, -1)
	milestones := make([]milestone, 0, len(matches))
	for _, match := range matches {
		if len(match) < 4 {
			continue
		}
		marker := strings.TrimSpace(match[1])
		id := "M" + strings.TrimSpace(match[2])
		name := strings.TrimSpace(match[3])
		done := marker == "✅"
		milestones = append(milestones, milestone{ID: id, Name: name, Done: done})
	}
	return milestones
}

func nextMilestone(milestones []milestone) *milestone {
	for _, m := range milestones {
		if !m.Done {
			mm := m
			return &mm
		}
	}
	return nil
}

func nextTask(tasks []task) *task {
	for _, t := range tasks {
		if t.Status == taskInProgress || t.Status == taskPending {
			tt := t
			return &tt
		}
	}
	return nil
}

func parseBlockers(progress string) []string {
	return parseSectionLines(progress, "## Blockers")
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
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "## ") {
			break
		}
		if trimmed == "" {
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

func computeOverallStatus(progress string, tasks []task) string {
	statusLine := parseStatusLine(progress)
	if strings.Contains(strings.ToLower(statusLine), "blocked") {
		if strings.TrimSpace(statusLine) != "" {
			return statusLine
		}
		return "🔴 BLOCKED"
	}

	if len(tasks) == 0 {
		return "🔴 Not Started"
	}

	allDoneOrBlocked := true
	anyDone := false
	anyInProgress := false

	for _, t := range tasks {
		if t.Status == taskComplete {
			anyDone = true
		}
		if t.Status == taskInProgress {
			anyInProgress = true
		}
		if t.Status != taskComplete && t.Status != taskBlocked {
			allDoneOrBlocked = false
		}
	}

	if allDoneOrBlocked {
		return "✅ Complete"
	}
	if anyDone || anyInProgress {
		return "🟡 In Progress"
	}
	return "🔴 Not Started"
}

func parseStatusLine(progress string) string {
	re := regexp.MustCompile(`(?m)^##\s*Status:\s*(.+)$`)
	match := re.FindStringSubmatch(progress)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func renderStatus(report statusReport) string {
	techPlan := "⚠ Not written (run /belmont:tech-plan to create)"
	if report.TechPlanReady {
		techPlan = "✅ Ready"
	}

	taskLine := fmt.Sprintf("Tasks: %d done, %d in progress, %d blocked, %d pending (of %d total)",
		report.TaskCounts["done"],
		report.TaskCounts["in_progress"],
		report.TaskCounts["blocked"],
		report.TaskCounts["pending"],
		report.TaskCounts["total"],
	)

	var sb strings.Builder
	sb.WriteString("Belmont Status\n")
	sb.WriteString("==============\n\n")
	sb.WriteString(fmt.Sprintf("Feature: %s\n\n", report.Feature))
	sb.WriteString(fmt.Sprintf("Tech Plan: %s\n\n", techPlan))
	sb.WriteString(fmt.Sprintf("Status: %s\n\n", report.OverallStatus))
	sb.WriteString(taskLine)
	sb.WriteString("\n\n")

	if len(report.Tasks) > 0 {
		for _, t := range report.Tasks {
			sb.WriteString(fmt.Sprintf("  %s %s: %s\n", taskStatusIcon(t.Status), t.ID, t.Name))
		}
	}
	sb.WriteString("\n")

	sb.WriteString("Milestones:\n")
	if len(report.Milestones) == 0 {
		sb.WriteString("  (none)\n")
	} else {
		for _, m := range report.Milestones {
			icon := "⬜"
			if m.Done {
				icon = "✅"
			}
			sb.WriteString(fmt.Sprintf("  %s %s: %s\n", icon, m.ID, m.Name))
		}
	}
	sb.WriteString("\n")

	sb.WriteString("Active Blockers:\n")
	if len(report.Blockers) == 0 {
		sb.WriteString("  - None\n")
	} else {
		for _, b := range report.Blockers {
			sb.WriteString(fmt.Sprintf("  - %s\n", b))
		}
	}
	sb.WriteString("\n")

	sb.WriteString("Next Milestone:\n")
	if report.NextMilestone == nil {
		sb.WriteString("  - None\n")
	} else {
		sb.WriteString(fmt.Sprintf("  - %s - %s\n", report.NextMilestone.ID, report.NextMilestone.Name))
	}
	sb.WriteString("Next Individual Task:\n")
	if report.NextTask == nil {
		sb.WriteString("  - None\n")
	} else {
		sb.WriteString(fmt.Sprintf("  - %s - %s\n", report.NextTask.ID, report.NextTask.Name))
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
	return sb.String()
}

func taskStatusIcon(status taskStatus) string {
	switch status {
	case taskComplete:
		return "✅"
	case taskBlocked:
		return "🚫"
	case taskInProgress:
		return "🔄"
	default:
		return "⬜"
	}
}

func runTree(args []string) error {
	fsFlags := flag.NewFlagSet("tree", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var root string
	var maxDepth int
	var maxEntries int
	var format string
	var cacheTTL time.Duration
	fsFlags.StringVar(&root, "root", ".", "project root")
	fsFlags.IntVar(&maxDepth, "max-depth", 2, "max depth")
	fsFlags.IntVar(&maxEntries, "max-entries", 200, "max entries")
	fsFlags.StringVar(&format, "format", "text", "text or json")
	fsFlags.DurationVar(&cacheTTL, "cache-ttl", 5*time.Second, "cache ttl")
	if err := fsFlags.Parse(args); err != nil {
		return fmt.Errorf("tree: %w", err)
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}

	entries, err := listEntries(absRoot, maxDepth, maxEntries, cacheTTL)
	if err != nil {
		return err
	}

	switch strings.ToLower(format) {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(entries)
	case "text":
		for _, entry := range entries {
			indent := strings.Repeat("  ", entry.Depth)
			name := filepath.Base(entry.Path)
			if entry.IsDir {
				fmt.Printf("%s%s/\n", indent, name)
			} else {
				fmt.Printf("%s%s\n", indent, name)
			}
		}
		return nil
	default:
		return fmt.Errorf("tree: unknown format %q", format)
	}
}

func runFind(args []string) error {
	fsFlags := flag.NewFlagSet("find", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var root string
	var name string
	var useRegex bool
	var matchType string
	var limit int
	var format string
	var ignoreCase bool
	var cacheTTL time.Duration

	fsFlags.StringVar(&root, "root", ".", "project root")
	fsFlags.StringVar(&name, "name", "", "name query")
	fsFlags.BoolVar(&useRegex, "regex", false, "treat name as regex")
	fsFlags.StringVar(&matchType, "type", "file", "file, dir, or any")
	fsFlags.IntVar(&limit, "limit", 200, "max results")
	fsFlags.StringVar(&format, "format", "text", "text or json")
	fsFlags.BoolVar(&ignoreCase, "ignore-case", false, "case insensitive")
	fsFlags.DurationVar(&cacheTTL, "cache-ttl", 5*time.Second, "cache ttl")

	if err := fsFlags.Parse(args); err != nil {
		return fmt.Errorf("find: %w", err)
	}

	if name == "" {
		return errors.New("find: --name is required")
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}

	matcher, err := buildMatcher(name, useRegex, ignoreCase)
	if err != nil {
		return err
	}

	entries, err := listEntries(absRoot, -1, limit, cacheTTL)
	if err != nil {
		return err
	}

	matchType = strings.ToLower(matchType)
	results := make([]findResult, 0)
	for _, entry := range entries {
		if limit > 0 && len(results) >= limit {
			break
		}
		if matchType == "file" && entry.IsDir {
			continue
		}
		if matchType == "dir" && !entry.IsDir {
			continue
		}
		rel := entry.Path
		namePart := filepath.Base(rel)
		if matcher(namePart) {
			results = append(results, findResult{Path: rel, IsDir: entry.IsDir})
		}
	}

	switch strings.ToLower(format) {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(results)
	case "text":
		for _, res := range results {
			fmt.Println(res.Path)
		}
		return nil
	default:
		return fmt.Errorf("find: unknown format %q", format)
	}
}

func runSearch(args []string) error {
	fsFlags := flag.NewFlagSet("search", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var root string
	var pattern string
	var limit int
	var format string
	var ignoreCase bool
	fsFlags.StringVar(&root, "root", ".", "project root")
	fsFlags.StringVar(&pattern, "pattern", "", "regex pattern")
	fsFlags.IntVar(&limit, "limit", 200, "max results")
	fsFlags.StringVar(&format, "format", "text", "text or json")
	fsFlags.BoolVar(&ignoreCase, "ignore-case", false, "case insensitive")

	if err := fsFlags.Parse(args); err != nil {
		return fmt.Errorf("search: %w", err)
	}

	if pattern == "" {
		return errors.New("search: --pattern is required")
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}

	if ignoreCase {
		pattern = "(?i)" + pattern
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Errorf("search: invalid pattern: %w", err)
	}

	results := make([]searchResult, 0)
	err = filepath.WalkDir(absRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == absRoot {
			return nil
		}
		if shouldSkip(path, d) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if limit > 0 && len(results) >= limit {
			return io.EOF
		}

		rel, err := filepath.Rel(absRoot, path)
		if err != nil {
			return err
		}

		matches, err := searchFile(path, rel, re, limit-len(results))
		if err != nil {
			return err
		}
		results = append(results, matches...)
		return nil
	})

	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}

	switch strings.ToLower(format) {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(results)
	case "text":
		for _, res := range results {
			fmt.Printf("%s:%d:%s\n", res.Path, res.Line, res.Text)
		}
		return nil
	default:
		return fmt.Errorf("search: unknown format %q", format)
	}
}

type toolConfig struct {
	Name  string
	Label string
}

var toolConfigs = []toolConfig{
	{Name: "claude", Label: "Claude Code (.claude/)"},
	{Name: "codex", Label: "Codex (.codex/)"},
	{Name: "cursor", Label: "Cursor (.cursor/)"},
	{Name: "windsurf", Label: "Windsurf (.windsurf/)"},
	{Name: "gemini", Label: "Gemini (.gemini/)"},
	{Name: "copilot", Label: "GitHub Copilot (.github/)"},
}

func runInstall(args []string) error {
	fsFlags := flag.NewFlagSet("install", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var source string
	var project string
	var toolsFlag string
	var noPrompt bool
	fsFlags.StringVar(&source, "source", "", "belmont source directory")
	fsFlags.StringVar(&project, "project", ".", "project directory")
	fsFlags.StringVar(&toolsFlag, "tools", "", "all|none|comma list")
	fsFlags.BoolVar(&noPrompt, "no-prompt", false, "disable interactive prompts")
	if err := fsFlags.Parse(args); err != nil {
		return fmt.Errorf("install: %w", err)
	}

	projectRoot, err := filepath.Abs(project)
	if err != nil {
		return err
	}

	// Determine mode: embedded (release binary) vs source (developer)
	useEmbedded := (source == "" && os.Getenv("BELMONT_SOURCE") == "") && hasEmbeddedFiles

	fmt.Println("Belmont Project Setup")
	fmt.Println("=====================")
	fmt.Println("")
	fmt.Printf("Project: %s\n", projectRoot)
	fmt.Println("")

	selectedTools, err := resolveTools(projectRoot, toolsFlag, noPrompt)
	if err != nil {
		return err
	}

	if useEmbedded {
		fmt.Println("Installing agents to .agents/belmont/...")
		if err := syncEmbeddedDir(embeddedAgents, "agents/belmont", filepath.Join(projectRoot, ".agents", "belmont")); err != nil {
			return err
		}
		fmt.Println("")

		fmt.Println("Installing skills to .agents/skills/belmont/...")
		if err := syncEmbeddedDir(embeddedSkills, "skills/belmont", filepath.Join(projectRoot, ".agents", "skills", "belmont")); err != nil {
			return err
		}
		fmt.Println("")
	} else {
		sourceRoot, err := resolveSourceRoot(source)
		if err != nil {
			return err
		}

		agentsSource := filepath.Join(sourceRoot, "agents", "belmont")
		skillsSource := filepath.Join(sourceRoot, "skills", "belmont")

		if !dirExists(agentsSource) || !dirExists(skillsSource) {
			return fmt.Errorf("install: source missing agents/ or skills/ in %s", sourceRoot)
		}

		fmt.Println("Installing agents to .agents/belmont/...")
		if err := syncMarkdownDir(agentsSource, filepath.Join(projectRoot, ".agents", "belmont")); err != nil {
			return err
		}
		fmt.Println("")

		fmt.Println("Installing skills to .agents/skills/belmont/...")
		if err := syncMarkdownDir(skillsSource, filepath.Join(projectRoot, ".agents", "skills", "belmont")); err != nil {
			return err
		}
		fmt.Println("")
	}

	if containsTool(selectedTools, "codex") {
		fmt.Println("Updating AGENTS.md for Codex skill routing...")
		if changed, err := ensureCodexAgentsGuidance(projectRoot); err != nil {
			return err
		} else if changed {
			fmt.Println("  + AGENTS.md Belmont Codex skill routing section")
		} else {
			fmt.Println("  = AGENTS.md Belmont Codex skill routing section (unchanged)")
		}
		if removed, err := removeLegacyCodexSkillsIndex(projectRoot); err != nil {
			return err
		} else if removed {
			fmt.Println("  - SKILLS.md (removed legacy Belmont Codex index)")
		}
		fmt.Println("")
	}

	for _, tool := range selectedTools {
		if err := setupTool(projectRoot, tool); err != nil {
			return err
		}
		fmt.Println("")
	}

	if len(selectedTools) == 0 {
		fmt.Println("Skipped tool linking.")
		fmt.Println("Skills are in .agents/skills/belmont/ -- reference them from your tool.")
		fmt.Println("")
	}

	if err := ensureStateFiles(projectRoot); err != nil {
		return err
	}

	if err := maybeUpdateGitignore(projectRoot, noPrompt); err != nil {
		return err
	}

	fmt.Println("")
	fmt.Println("Belmont installed!")
	fmt.Println("")
	fmt.Println("Agents:  .agents/belmont/")
	fmt.Println("Skills:  .agents/skills/belmont/")
	fmt.Println("State:   .belmont/")
	if fileExists(filepath.Join(projectRoot, ".belmont", "bin", "belmont")) || fileExists(filepath.Join(projectRoot, ".belmont", "bin", "belmont.exe")) {
		fmt.Println("Helper:  .belmont/bin/belmont")
	}

	if len(selectedTools) > 0 {
		fmt.Println("")
		fmt.Println("Tool integrations:")
		for _, tool := range selectedTools {
			switch tool {
			case "claude":
				fmt.Println("  Claude Code  .claude/agents/belmont -> ../../.agents/belmont")
				fmt.Println("              .claude/commands/belmont (copied from .agents/skills/belmont)")
				fmt.Println("    Use: /belmont:product-plan, /belmont:tech-plan, /belmont:implement, /belmont:next, /belmont:verify, /belmont:status")
			case "codex":
				fmt.Println("  Codex        .codex/belmont (copied from .agents/skills/belmont)")
				fmt.Println("    Use: AGENTS.md includes Belmont skill routing for belmont:<skill> prompts")
			case "cursor":
				fmt.Println("  Cursor       .cursor/rules/belmont/*.mdc -> .agents/skills/belmont/*.md")
				fmt.Println("    Use: Reference belmont rules in Composer/Agent, or toggle in Settings > Rules")
			case "windsurf":
				fmt.Println("  Windsurf     .windsurf/rules/belmont -> .agents/skills/belmont")
				fmt.Println("    Use: Reference belmont rules in Cascade")
			case "gemini":
				fmt.Println("  Gemini       .gemini/rules/belmont -> .agents/skills/belmont")
				fmt.Println("    Use: Reference belmont rules in Gemini")
			case "copilot":
				fmt.Println("  Copilot      .github/belmont -> .agents/skills/belmont")
				fmt.Println("    Use: Reference belmont files in Copilot Chat")
			}
		}
	}

	fmt.Println("")
	fmt.Println("Workflow:")
	fmt.Println("  1. Plan       - Create PRD interactively")
	fmt.Println("  2. Tech Plan  - Create technical implementation plan")
	fmt.Println("  3. Implement  - Implement next milestone (full pipeline)")
	fmt.Println("  4. Next       - Implement next single task (lightweight)")
	fmt.Println("  5. Verify     - Run verification and code review")
	fmt.Println("  6. Status     - View progress")
	fmt.Println("  7. Reset      - Reset state and start fresh")
	fmt.Println("")

	return nil
}

func searchFile(path, rel string, re *regexp.Regexp, limit int) ([]searchResult, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	if isBinary(file) {
		return nil, nil
	}

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 512*1024)
	var results []searchResult
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		if limit > 0 && len(results) >= limit {
			break
		}
		line := scanner.Text()
		if re.MatchString(line) {
			results = append(results, searchResult{Path: rel, Line: lineNo, Text: line})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

func isBinary(file *os.File) bool {
	buf := make([]byte, 8000)
	n, _ := file.Read(buf)
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return true
	}
	for i := 0; i < n; i++ {
		if buf[i] == 0 {
			return true
		}
	}
	return false
}

type listEntry struct {
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Depth int    `json:"depth"`
}

func listEntries(root string, maxDepth int, maxEntries int, cacheTTL time.Duration) ([]listEntry, error) {
	useCache := cacheTTL > 0
	cachePath := filepath.Join(root, ".belmont", "cache", "index.json")

	if useCache {
		if entries, ok := loadCachedEntries(cachePath, root, cacheTTL); ok {
			return filterEntries(entries, maxDepth, maxEntries), nil
		}
	}

	entries := make([]listEntry, 0)
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		if shouldSkip(path, d) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		depth := depthOf(rel)
		if maxDepth >= 0 && depth > maxDepth {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		entries = append(entries, listEntry{Path: rel, IsDir: d.IsDir(), Depth: depth})
		if maxEntries > 0 && len(entries) >= maxEntries {
			return io.EOF
		}
		return nil
	})

	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}

	if useCache {
		_ = saveCache(cachePath, root, entries)
	}

	return entries, nil
}

func saveCache(path, root string, entries []listEntry) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	cache := cacheIndex{Root: root, GeneratedAt: time.Now(), Files: make([]cacheFile, 0, len(entries))}
	for _, entry := range entries {
		cache.Files = append(cache.Files, cacheFile{Path: entry.Path, IsDir: entry.IsDir})
	}

	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	enc := json.NewEncoder(file)
	enc.SetIndent("", "  ")
	return enc.Encode(cache)
}

func loadCachedEntries(path, root string, ttl time.Duration) ([]listEntry, bool) {
	file, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer file.Close()

	var cache cacheIndex
	dec := json.NewDecoder(file)
	if err := dec.Decode(&cache); err != nil {
		return nil, false
	}

	if cache.Root != root {
		return nil, false
	}
	if time.Since(cache.GeneratedAt) > ttl {
		return nil, false
	}

	entries := make([]listEntry, 0, len(cache.Files))
	for _, file := range cache.Files {
		entries = append(entries, listEntry{Path: file.Path, IsDir: file.IsDir, Depth: depthOf(file.Path)})
	}
	return entries, true
}

func filterEntries(entries []listEntry, maxDepth int, maxEntries int) []listEntry {
	filtered := make([]listEntry, 0, len(entries))
	for _, entry := range entries {
		if maxDepth >= 0 && entry.Depth > maxDepth {
			continue
		}
		filtered = append(filtered, entry)
		if maxEntries > 0 && len(filtered) >= maxEntries {
			break
		}
	}
	return filtered
}

func depthOf(rel string) int {
	if rel == "." || rel == "" {
		return 0
	}
	sep := string(os.PathSeparator)
	return strings.Count(rel, sep)
}

func buildMatcher(pattern string, regex bool, ignoreCase bool) (func(string) bool, error) {
	if regex {
		if ignoreCase {
			pattern = "(?i)" + pattern
		}
		re, err := regexp.Compile(pattern)
		if err != nil {
			return nil, err
		}
		return re.MatchString, nil
	}

	if ignoreCase {
		lower := strings.ToLower(pattern)
		return func(s string) bool { return strings.Contains(strings.ToLower(s), lower) }, nil
	}
	return func(s string) bool { return strings.Contains(s, pattern) }, nil
}

func shouldSkip(path string, d fs.DirEntry) bool {
	name := d.Name()
	if d.IsDir() {
		switch name {
		case ".git", ".belmont", "node_modules", "dist", "build", "out", ".next", ".turbo", ".cache", "vendor", "coverage", ".idea", ".vscode", "target", "tmp", "temp", "__pycache__":
			return true
		}
		return false
	}

	switch name {
	case ".DS_Store", "Thumbs.db":
		return true
	}
	return false
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}

func resolveSourceRoot(source string) (string, error) {
	if source != "" {
		abs, err := filepath.Abs(source)
		if err != nil {
			return "", err
		}
		return abs, nil
	}

	if env := strings.TrimSpace(os.Getenv("BELMONT_SOURCE")); env != "" {
		abs, err := filepath.Abs(env)
		if err != nil {
			return "", err
		}
		return abs, nil
	}

	if cfgSource, ok := loadConfigSource(); ok {
		abs, err := filepath.Abs(cfgSource)
		if err != nil {
			return "", err
		}
		return abs, nil
	}

	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exePath)
	for i := 0; i < 6; i++ {
		skills := filepath.Join(dir, "skills", "belmont")
		agents := filepath.Join(dir, "agents", "belmont")
		if dirExists(skills) && dirExists(agents) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", errors.New("install: unable to locate belmont source; pass --source PATH")
}

func loadConfigSource() (string, bool) {
	paths := configPaths()
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var cfg config
		if err := json.Unmarshal(data, &cfg); err != nil {
			continue
		}
		if strings.TrimSpace(cfg.Source) != "" {
			return cfg.Source, true
		}
	}
	return "", false
}

func configPaths() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	paths := []string{
		filepath.Join(home, ".config", "belmont", "config.json"),
		filepath.Join(home, ".belmont", "config.json"),
	}
	return paths
}

func resolveTools(projectRoot, toolsFlag string, noPrompt bool) ([]string, error) {
	detected := detectTools(projectRoot)

	if toolsFlag != "" {
		switch strings.ToLower(toolsFlag) {
		case "all":
			if len(detected) > 0 {
				return detected, nil
			}
			return allToolNames(), nil
		case "none":
			return nil, nil
		default:
			parts := strings.Split(toolsFlag, ",")
			var selected []string
			for _, p := range parts {
				name := strings.TrimSpace(strings.ToLower(p))
				if name == "" {
					continue
				}
				if !isKnownTool(name) {
					return nil, fmt.Errorf("install: unknown tool %q", name)
				}
				selected = append(selected, name)
			}
			return selected, nil
		}
	}

	if noPrompt {
		if len(detected) > 0 {
			return detected, nil
		}
		return nil, nil
	}

	reader := bufio.NewReader(os.Stdin)

	if len(detected) > 0 {
		fmt.Println("Detected AI tools:")
		for i, tool := range detected {
			fmt.Printf("  [%d] %s\n", i+1, toolLabel(tool))
		}
		fmt.Println("")
		fmt.Println("Install skills for:")
		fmt.Println("  [a] All detected tools")
		for i, tool := range detected {
			fmt.Printf("  [%d] %s only\n", i+1, toolLabel(tool))
		}
		fmt.Println("  [s] Skip (install agents only)")
		fmt.Println("")
		fmt.Print("Choice [a]: ")
		choice, _ := reader.ReadString('\n')
		choice = strings.TrimSpace(choice)
		fmt.Println("")

		if choice == "" || strings.EqualFold(choice, "a") {
			return detected, nil
		}
		if strings.EqualFold(choice, "s") {
			return nil, nil
		}
		if idx, err := strconv.Atoi(choice); err == nil {
			if idx >= 1 && idx <= len(detected) {
				return []string{detected[idx-1]}, nil
			}
		}
		return detected, nil
	}

	fmt.Println("No AI tool directories detected.")
	fmt.Println("")
	fmt.Println("Which tool are you using?")
	for i, tool := range toolConfigs {
		fmt.Printf("  [%d] %s\n", i+1, tool.Label)
	}
	fmt.Println("  [s] Skip (install agents only - reference files manually)")
	fmt.Println("")
	fmt.Print("Choice: ")
	choice, _ := reader.ReadString('\n')
	choice = strings.TrimSpace(choice)
	fmt.Println("")

	if strings.EqualFold(choice, "s") {
		return nil, nil
	}
	if idx, err := strconv.Atoi(choice); err == nil {
		if idx >= 1 && idx <= len(toolConfigs) {
			return []string{toolConfigs[idx-1].Name}, nil
		}
	}

	fmt.Println("Invalid choice. Installing agents only.")
	return nil, nil
}

func detectTools(projectRoot string) []string {
	var detected []string
	if dirExists(filepath.Join(projectRoot, ".claude")) {
		detected = append(detected, "claude")
	}
	if dirExists(filepath.Join(projectRoot, ".codex")) {
		detected = append(detected, "codex")
	}
	if dirExists(filepath.Join(projectRoot, ".cursor")) {
		detected = append(detected, "cursor")
	}
	if dirExists(filepath.Join(projectRoot, ".windsurf")) {
		detected = append(detected, "windsurf")
	}
	if dirExists(filepath.Join(projectRoot, ".gemini")) {
		detected = append(detected, "gemini")
	}
	if dirExists(filepath.Join(projectRoot, ".github")) {
		detected = append(detected, "copilot")
	}
	return detected
}

func allToolNames() []string {
	names := make([]string, 0, len(toolConfigs))
	for _, tool := range toolConfigs {
		names = append(names, tool.Name)
	}
	return names
}

func isKnownTool(name string) bool {
	for _, tool := range toolConfigs {
		if tool.Name == name {
			return true
		}
	}
	return false
}

func toolLabel(name string) string {
	for _, tool := range toolConfigs {
		if tool.Name == name {
			return tool.Label
		}
	}
	return name
}

func syncMarkdownDir(sourceDir, targetDir string) error {
	if err := ensureDir(targetDir); err != nil {
		return err
	}

	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}

	sourceNames := make(map[string]struct{})
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		if entry.Name() == "SKILL.md" {
			continue
		}
		sourceNames[entry.Name()] = struct{}{}
		src := filepath.Join(sourceDir, entry.Name())
		dest := filepath.Join(targetDir, entry.Name())
		if fileExists(dest) {
			same, err := filesEqual(src, dest)
			if err != nil {
				return err
			}
			if same {
				fmt.Printf("  = %s (unchanged)\n", entry.Name())
				continue
			}
			fmt.Printf("  ~ %s (updated)\n", entry.Name())
		} else {
			fmt.Printf("  + %s\n", entry.Name())
		}
		if err := copyFile(src, dest); err != nil {
			return err
		}
	}

	targetEntries, err := os.ReadDir(targetDir)
	if err != nil {
		return err
	}
	for _, entry := range targetEntries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		if _, ok := sourceNames[entry.Name()]; !ok {
			fmt.Printf("  - %s (removed, no longer in source)\n", entry.Name())
			if err := os.Remove(filepath.Join(targetDir, entry.Name())); err != nil {
				return err
			}
		}
	}

	return nil
}

func setupTool(projectRoot, tool string) error {
	switch tool {
	case "claude":
		fmt.Println("Linking Claude Code...")
		skillsTarget := filepath.Join(projectRoot, ".agents", "skills", "belmont")
		agentsTarget := filepath.Join(projectRoot, ".agents", "belmont")
		linkAgents := filepath.Join(projectRoot, ".claude", "agents", "belmont")
		if err := ensureSymlink(linkAgents, agentsTarget, true); err != nil {
			return err
		}
		claudeCommandsDir := filepath.Join(projectRoot, ".claude", "commands", "belmont")
		if err := syncMarkdownDir(skillsTarget, claudeCommandsDir); err != nil {
			return err
		}
		claudeSkillsDir := filepath.Join(projectRoot, ".claude", "skills", "belmont")
		if dirExists(claudeSkillsDir) {
			fmt.Println("  - .claude/skills/belmont (deprecated, removing)")
			if err := os.RemoveAll(claudeSkillsDir); err != nil {
				return err
			}
		}
	case "codex":
		fmt.Println("Linking Codex...")
		skillsTarget := filepath.Join(projectRoot, ".agents", "skills", "belmont")
		codexDir := filepath.Join(projectRoot, ".codex", "belmont")
		if err := syncMarkdownDir(skillsTarget, codexDir); err != nil {
			return err
		}
	case "windsurf":
		fmt.Println("Linking Windsurf...")
		target := filepath.Join(projectRoot, ".agents", "skills", "belmont")
		link := filepath.Join(projectRoot, ".windsurf", "rules", "belmont")
		if err := ensureSymlink(link, target, true); err != nil {
			return err
		}
	case "gemini":
		fmt.Println("Linking Gemini...")
		target := filepath.Join(projectRoot, ".agents", "skills", "belmont")
		link := filepath.Join(projectRoot, ".gemini", "rules", "belmont")
		if err := ensureSymlink(link, target, true); err != nil {
			return err
		}
	case "copilot":
		fmt.Println("Linking GitHub Copilot...")
		target := filepath.Join(projectRoot, ".agents", "skills", "belmont")
		link := filepath.Join(projectRoot, ".github", "belmont")
		if err := ensureSymlink(link, target, true); err != nil {
			return err
		}
	case "cursor":
		fmt.Println("Linking Cursor...")
		cursorDir := filepath.Join(projectRoot, ".cursor", "rules", "belmont")
		if err := linkPerFileDir(filepath.Join(projectRoot, ".agents", "skills", "belmont"), cursorDir, ".md", ".mdc"); err != nil {
			return err
		}
	}
	return nil
}

func ensureSymlink(linkPath, target string, isDir bool) error {
	if err := os.MkdirAll(filepath.Dir(linkPath), 0o755); err != nil {
		return err
	}
	if existing, err := os.Lstat(linkPath); err == nil {
		if existing.Mode()&os.ModeSymlink != 0 {
			current, err := os.Readlink(linkPath)
			if err == nil && current == target {
				fmt.Printf("  = %s (symlink ok)\n", linkPath)
				return nil
			}
		}
		if existing.IsDir() {
			fmt.Printf("  ~ %s (replacing old directory with symlink)\n", linkPath)
			if err := os.RemoveAll(linkPath); err != nil {
				return err
			}
		} else {
			fmt.Printf("  ~ %s (replacing existing file with symlink)\n", linkPath)
			if err := os.Remove(linkPath); err != nil {
				return err
			}
		}
	}

	if err := os.Symlink(target, linkPath); err != nil {
		fmt.Printf("  ! symlink failed for %s (copying instead)\n", linkPath)
		if isDir {
			return copyDir(target, linkPath)
		}
		return copyFile(target, linkPath)
	}
	fmt.Printf("  + %s -> %s\n", linkPath, target)
	return nil
}

func linkPerFileDir(sourceDir, targetDir, sourceExt, targetExt string) error {
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}
	sourceEntries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}
	sourceNames := make(map[string]struct{})
	for _, entry := range sourceEntries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), sourceExt) {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), sourceExt)
		sourceNames[name] = struct{}{}
		target := filepath.Join(sourceDir, entry.Name())
		link := filepath.Join(targetDir, name+targetExt)
		if err := ensureSymlink(link, target, false); err != nil {
			return err
		}
	}

	targetEntries, err := os.ReadDir(targetDir)
	if err != nil {
		return err
	}
	for _, entry := range targetEntries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), targetExt) {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), targetExt)
		if _, ok := sourceNames[name]; !ok {
			fmt.Printf("  - %s%s (removed, no longer in source)\n", name, targetExt)
			if err := os.Remove(filepath.Join(targetDir, entry.Name())); err != nil {
				return err
			}
		}
	}

	return nil
}

func ensureStateFiles(projectRoot string) error {
	stateDir := filepath.Join(projectRoot, ".belmont")
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return err
	}

	prdPath := filepath.Join(stateDir, "PRD.md")
	if !fileExists(prdPath) {
		if err := os.WriteFile(prdPath, []byte("Run the /belmont:product-plan skill to create a plan for your feature.\n"), 0o644); err != nil {
			return err
		}
		fmt.Println("  + .belmont/PRD.md")
	} else {
		fmt.Println("  Exists: .belmont/PRD.md (keeping)")
	}

	progressPath := filepath.Join(stateDir, "PROGRESS.md")
	if !fileExists(progressPath) {
		content := `# Progress: [Feature Name]

## Status: 🔴 Not Started

## PRD Reference
.belmont/PRD.md

## Milestones

### ⬜ M1: [Milestone Name]
- [ ] Task 1
- [ ] Task 2

## Session History
| Session | Date/Time           | Context Used | Milestones Completed |
|---------|------|--------------|---------------------|

## Decisions Log
[Numbered list of key decisions with rationale]

## Blockers
[Any blocking issues]
`
		if err := os.WriteFile(progressPath, []byte(content), 0o644); err != nil {
			return err
		}
		fmt.Println("  + .belmont/PROGRESS.md")
	} else {
		fmt.Println("  Exists: .belmont/PROGRESS.md (keeping)")
	}
	return nil
}

const codexAgentsGuidanceStart = "<!-- belmont:codex-skill-routing:start -->"
const codexAgentsGuidanceEnd = "<!-- belmont:codex-skill-routing:end -->"

func ensureCodexAgentsGuidance(projectRoot string) (bool, error) {
	path := filepath.Join(projectRoot, "AGENTS.md")
	current := ""
	if fileExists(path) {
		data, err := os.ReadFile(path)
		if err != nil {
			return false, err
		}
		current = string(data)
	}

	section := codexAgentsGuidanceSection()
	updated, changed := upsertMarkedSection(current, codexAgentsGuidanceStart, codexAgentsGuidanceEnd, section)
	if !changed {
		return false, nil
	}

	if strings.TrimSpace(updated) == "" {
		updated = "# AGENTS\n\n" + strings.TrimSpace(section) + "\n"
	}
	return true, os.WriteFile(path, []byte(updated), 0o644)
}

func codexAgentsGuidanceSection() string {
	lines := []string{
		codexAgentsGuidanceStart,
		"## Belmont Skill Routing (Codex)",
		"",
		"- Belmont skills are local markdown files in `.agents/skills/belmont/` (and mirrored in `.codex/belmont/`).",
		"- If the user says `belmont:<skill>` or \"Use the belmont:<skill> skill\", treat it as a skill reference, not a shell command.",
		"- Load `.agents/skills/belmont/<skill>.md` first (fallback to `.codex/belmont/<skill>.md`) and follow that workflow.",
		"- Known Belmont skills: `product-plan`, `tech-plan`, `implement`, `next`, `verify`, `status`, `reset`.",
		"- If a requested skill file is missing, list available files in those directories and continue with the closest matching Belmont skill.",
		codexAgentsGuidanceEnd,
	}
	return strings.Join(lines, "\n")
}

func upsertMarkedSection(content, startMarker, endMarker, section string) (string, bool) {
	newSection := strings.TrimSpace(section)
	if strings.TrimSpace(content) == "" {
		return newSection + "\n", true
	}

	start := strings.Index(content, startMarker)
	end := strings.Index(content, endMarker)
	if start >= 0 && end > start {
		end += len(endMarker)
		currentSection := strings.TrimSpace(content[start:end])
		if currentSection == newSection {
			return content, false
		}
		replacement := newSection
		if !strings.HasSuffix(replacement, "\n") {
			replacement += "\n"
		}
		updated := content[:start] + replacement + content[end:]
		return updated, updated != content
	}

	trimmed := strings.TrimRight(content, "\n")
	return trimmed + "\n\n" + newSection + "\n", true
}

func removeLegacyCodexSkillsIndex(projectRoot string) (bool, error) {
	path := filepath.Join(projectRoot, "SKILLS.md")
	if !fileExists(path) {
		return false, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	content := string(data)
	if !strings.Contains(content, "name: belmont-skills-index") {
		return false, nil
	}
	if err := os.Remove(path); err != nil {
		return false, err
	}
	return true, nil
}

func maybeUpdateGitignore(projectRoot string, noPrompt bool) error {
	path := filepath.Join(projectRoot, ".gitignore")
	if fileExists(path) {
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if gitignoreHasBelmont(string(data)) {
			fmt.Println(".belmont is already in .gitignore")
			return nil
		}
		if noPrompt {
			return nil
		}
		if !promptYes("Add .belmont to .gitignore? [Y/n] ") {
			return nil
		}
		f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		defer f.Close()
		if _, err := f.WriteString("\n# Belmont local state\n.belmont/\n"); err != nil {
			return err
		}
		fmt.Println("Added .belmont/ to .gitignore")
		return nil
	}

	if noPrompt {
		return nil
	}
	if !promptYes("Create .gitignore with .belmont entry? [Y/n] ") {
		return nil
	}
	if err := os.WriteFile(path, []byte("# Belmont local state\n.belmont/\n"), 0o644); err != nil {
		return err
	}
	fmt.Println("Created .gitignore with .belmont/ entry")
	return nil
}

func gitignoreHasBelmont(content string) bool {
	re := regexp.MustCompile(`(?m)^\s*\.belmont/?(\s|$)`)
	return re.MatchString(content)
}

func promptYes(message string) bool {
	reader := bufio.NewReader(os.Stdin)
	fmt.Print(message)
	answer, _ := reader.ReadString('\n')
	answer = strings.TrimSpace(answer)
	return answer == "" || strings.EqualFold(answer, "y") || strings.EqualFold(answer, "yes")
}

func filesEqual(a, b string) (bool, error) {
	ab, err := os.ReadFile(a)
	if err != nil {
		return false, err
	}
	bb, err := os.ReadFile(b)
	if err != nil {
		return false, err
	}
	return string(ab) == string(bb), nil
}

func copyFile(src, dest string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if info, err := os.Lstat(dest); err == nil && info.Mode()&os.ModeSymlink != 0 {
		if err := os.Remove(dest); err != nil {
			return err
		}
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dest, data, 0o644)
}

func ensureDir(path string) error {
	if info, err := os.Lstat(path); err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			if err := os.RemoveAll(path); err != nil {
				return err
			}
		}
	}
	return os.MkdirAll(path, 0o755)
}

func copyDir(src, dest string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		destPath := filepath.Join(dest, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, destPath); err != nil {
				return err
			}
		}
	}
	return nil
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func containsTool(tools []string, name string) bool {
	for _, tool := range tools {
		if tool == name {
			return true
		}
	}
	return false
}

// syncEmbeddedDir mirrors syncMarkdownDir but reads from an embed.FS.
func syncEmbeddedDir(embedFS embed.FS, root string, targetDir string) error {
	if err := ensureDir(targetDir); err != nil {
		return err
	}

	entries, err := fs.ReadDir(embedFS, root)
	if err != nil {
		return err
	}

	sourceNames := make(map[string]struct{})
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		if entry.Name() == "SKILL.md" {
			continue
		}
		sourceNames[entry.Name()] = struct{}{}
		data, err := fs.ReadFile(embedFS, root+"/"+entry.Name())
		if err != nil {
			return err
		}
		dest := filepath.Join(targetDir, entry.Name())
		if fileExists(dest) {
			existing, err := os.ReadFile(dest)
			if err != nil {
				return err
			}
			if string(existing) == string(data) {
				fmt.Printf("  = %s (unchanged)\n", entry.Name())
				continue
			}
			fmt.Printf("  ~ %s (updated)\n", entry.Name())
		} else {
			fmt.Printf("  + %s\n", entry.Name())
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(dest, data, 0o644); err != nil {
			return err
		}
	}

	// Clean stale files
	targetEntries, err := os.ReadDir(targetDir)
	if err != nil {
		return err
	}
	for _, entry := range targetEntries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		if _, ok := sourceNames[entry.Name()]; !ok {
			fmt.Printf("  - %s (removed, no longer in source)\n", entry.Name())
			if err := os.Remove(filepath.Join(targetDir, entry.Name())); err != nil {
				return err
			}
		}
	}

	return nil
}

// --- Update command ---

type githubRelease struct {
	TagName string        `json:"tag_name"`
	Body    string        `json:"body"`
	Assets  []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func runUpdate(args []string) error {
	fsFlags := flag.NewFlagSet("update", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var check bool
	var force bool
	fsFlags.BoolVar(&check, "check", false, "check for updates without installing")
	fsFlags.BoolVar(&force, "force", false, "force update even if same version")
	if err := fsFlags.Parse(args); err != nil {
		return fmt.Errorf("update: %w", err)
	}

	if Version == "dev" {
		return errors.New("update: development build detected — use git pull && scripts/build.sh to update")
	}

	release, err := fetchLatestRelease()
	if err != nil {
		return fmt.Errorf("update: %w", err)
	}

	if !force && !isNewer(release.TagName, "v"+Version) {
		fmt.Printf("Already up to date (v%s)\n", Version)
		return nil
	}

	if check {
		fmt.Printf("Update available: v%s → %s\n", Version, release.TagName)
		if release.Body != "" {
			fmt.Println("\nRelease notes:")
			fmt.Println(release.Body)
		}
		return nil
	}

	assetName := fmt.Sprintf("belmont-%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		assetName += ".exe"
	}

	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return fmt.Errorf("update: no binary found for %s/%s in release %s", runtime.GOOS, runtime.GOARCH, release.TagName)
	}

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("update: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("update: %w", err)
	}

	if err := checkWriteAccess(filepath.Dir(exePath)); err != nil {
		return fmt.Errorf("update: cannot write to %s — try running with sudo or reinstall to ~/.local/bin", filepath.Dir(exePath))
	}

	fmt.Printf("Downloading %s...\n", assetName)
	tmpPath := exePath + ".tmp"
	if err := downloadFile(downloadURL, tmpPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("update: download failed: %w", err)
	}

	if err := os.Chmod(tmpPath, 0o755); err != nil {
		os.Remove(tmpPath)
		return err
	}

	// Replace self — on Windows, rename current to .old first
	if runtime.GOOS == "windows" {
		oldPath := exePath + ".old"
		os.Remove(oldPath)
		if err := os.Rename(exePath, oldPath); err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("update: %w", err)
		}
	}
	if err := os.Rename(tmpPath, exePath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("update: %w", err)
	}

	fmt.Printf("\nUpdated: v%s → %s\n", Version, release.TagName)
	if release.Body != "" {
		fmt.Println("\nRelease notes:")
		fmt.Println(release.Body)
	}

	// Auto-install if .belmont/ exists in cwd
	if dirExists(filepath.Join(".", ".belmont")) {
		fmt.Println("\nRe-installing skills and agents...")
		cmd := exec.Command(exePath, "install", "--no-prompt", "--tools", "all")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Auto-install failed: %v\nRun 'belmont install' manually.\n", err)
		}
	} else {
		fmt.Println("\nTo update skills in a project: cd ~/your-project && belmont install")
	}

	return nil
}

func fetchLatestRelease() (*githubRelease, error) {
	url := "https://api.github.com/repos/blake-simpson/belmont/releases/latest"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "token "+token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach GitHub (are you offline?): %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 403 || resp.StatusCode == 429 {
		return nil, fmt.Errorf("GitHub API rate limited — set GITHUB_TOKEN env var to authenticate")
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &release, nil
}

func downloadFile(url, dest string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "token "+token)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func checkWriteAccess(dir string) error {
	tmp := filepath.Join(dir, ".belmont-update-check")
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	f.Close()
	os.Remove(tmp)
	return nil
}

func parseSemver(v string) (int, int, int, bool) {
	v = strings.TrimPrefix(v, "v")
	parts := strings.SplitN(v, ".", 3)
	if len(parts) != 3 {
		return 0, 0, 0, false
	}
	major, err1 := strconv.Atoi(parts[0])
	minor, err2 := strconv.Atoi(parts[1])
	patch, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return 0, 0, 0, false
	}
	return major, minor, patch, true
}

func isNewer(remote, local string) bool {
	rMaj, rMin, rPat, ok1 := parseSemver(remote)
	lMaj, lMin, lPat, ok2 := parseSemver(local)
	if !ok1 || !ok2 {
		return true
	}
	if rMaj != lMaj {
		return rMaj > lMaj
	}
	if rMin != lMin {
		return rMin > lMin
	}
	return rPat > lPat
}
