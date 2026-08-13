// Belmont CLI.
//
//go:generate bash scripts/generate-skills.sh

package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"text/template"
	"time"
)

var (
	Version   = "dev"
	CommitSHA = "unknown"
	BuildDate = "unknown"
)

// toolSupportsModel indicates whether the tool's CLI accepts --model at all.
//
// Pi is `true` so the model-flag dispatch fires, but Pi is deliberately absent
// from `modelTiers` — Pi runs against user-provided local models whose IDs
// Belmont cannot know in advance. resolveModelFlags special-cases Pi to read
// from `~/.belmont/local-llms.json` (with project + env-var overrides). When
// nothing in that chain produces a value Belmont passes no flags and Pi falls
// back to the default model in its own `~/.pi/agent/models.json`.
var toolSupportsModel = map[string]bool{
	"claude":   true,
	"codex":    true,
	"gemini":   true,
	"cursor":   true,
	"copilot":  true,
	"pi":       true,
	"opencode": true,
}

// planningTier is always used for product-plan and tech-plan invocations.
// Planning produces the spec downstream agents execute against, so it
// always runs at the highest-capability tier regardless of per-feature
// config. Editing this is a deliberate, global decision.
const planningTier = "high"

// reconciliationDefaultTier is used when no models.yaml is present.
const reconciliationDefaultTier = "high"

// modelTierConfig holds the parsed contents of .belmont/features/<slug>/models.yaml.
// Empty value is safe to pass everywhere — callers get nil tier strings and fall
// back to agent-frontmatter defaults.
type modelTierConfig struct {
	Profile  string
	Planning string
	Tiers    map[string]string // agent name (e.g. "implementation") -> "low"|"medium"|"high"
}

// splitYAMLKV splits "key: value" into trimmed parts with quotes stripped.
func splitYAMLKV(line string) (string, string, bool) {
	idx := strings.Index(line, ":")
	if idx < 0 {
		return "", "", false
	}
	k := strings.TrimSpace(line[:idx])
	v := strings.TrimSpace(line[idx+1:])
	v = strings.Trim(v, `"'`)
	return k, v, true
}

// actionAgent maps a loop action type to the Belmont agent name that runs
// the heaviest work for that action. Used for tier lookup. Empty string
// means "no agent mapping" (tier falls through to empty → default model).
func actionAgent(t loopActionType) string {
	switch t {
	case actionImplementMilestone, actionImplementNext, actionFixAll:
		return "implementation"
	case actionVerify:
		return "verification"
	case actionTriage:
		return "verification" // triage reads verification output; share its tier
	case actionReplan:
		return "" // planning uses planningTier, handled separately
	default:
		return ""
	}
}

// Milestone computed state helpers

// monorepoType identifies the dominant monorepo system in use.
type monorepoType string

const (
	monorepoNone      monorepoType = ""
	monorepoTurborepo monorepoType = "turborepo"
	monorepoNx        monorepoType = "nx"
	monorepoPnpm      monorepoType = "pnpm"
	monorepoNpm       monorepoType = "npm"
	monorepoYarn      monorepoType = "yarn"
	monorepoBun       monorepoType = "bun"
	monorepoLerna     monorepoType = "lerna"
	monorepoRush      monorepoType = "rush"
	monorepoCargo     monorepoType = "cargo"
	monorepoGo        monorepoType = "go"
	monorepoUv        monorepoType = "uv"
	monorepoPoetry    monorepoType = "poetry"
)

// envSignals indicates whether a workspace consumes env at install/build time.
type envSignals struct {
	Postinstall   bool // package.json has scripts.postinstall (any postinstall:* variant)
	PrismaDep     bool // deps include prisma / @prisma/client
	DotenvDep     bool // deps include dotenv / dotenv-cli / drizzle-kit / tsx / vite-node
	BuildRs       bool // Rust workspace has build.rs
	PythonScripts bool // pyproject has [project.scripts] or [tool.poetry.scripts]
}

func (s envSignals) consumesEnv() bool {
	return s.Postinstall || s.PrismaDep || s.DotenvDep || s.BuildRs || s.PythonScripts
}

// workspaceInfo describes a discovered workspace.
type workspaceInfo struct {
	ID       string // package name (or directory base if not parseable)
	Path     string // relative path from project root
	Manifest string // absolute path to manifest file (may be empty for synthetic entries)
	Signals  envSignals
	HasDev   bool // package.json has scripts.dev / Cargo bin target / etc. (used for primary selection)
}

// jsManifestName extracts the `name` field from a package.json file.
// Returns "" if the manifest is missing, malformed, or has no name.
func jsManifestName(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var pkg struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return ""
	}
	return pkg.Name
}

// cargoCrateName extracts `name` from a Cargo.toml [package] section.
func cargoCrateName(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	text := string(data)
	pkgIdx := strings.Index(text, "[package]")
	if pkgIdx < 0 {
		return ""
	}
	rest := text[pkgIdx:]
	for _, line := range strings.Split(rest, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "name") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			v := strings.TrimSpace(parts[1])
			v = strings.Trim(v, `"'`)
			return v
		}
		if strings.HasPrefix(line, "[") && line != "[package]" {
			break
		}
	}
	return ""
}

// sliceUntilNextHeader returns text up to the next "[section]" header (or
// end of string). Used to scope TOML section parsing.
func sliceUntilNextHeader(text string) string {
	for i := 1; i < len(text); i++ {
		if text[i] == '[' && text[i-1] == '\n' {
			return text[:i]
		}
	}
	return text
}

// extractTomlArray pulls a `key = ["a", "b"]` array out of a TOML section.
func extractTomlArray(section, key string) []string {
	idx := strings.Index(section, key)
	if idx < 0 {
		return nil
	}
	openB := strings.Index(section[idx:], "[")
	if openB < 0 {
		return nil
	}
	openB += idx
	closeB := strings.Index(section[openB:], "]")
	if closeB < 0 {
		return nil
	}
	closeB += openB
	body := section[openB+1 : closeB]
	var out []string
	for _, item := range strings.Split(body, ",") {
		item = strings.TrimSpace(item)
		item = strings.Trim(item, `"'`)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}

// pythonProjectName reads a pyproject.toml and extracts [project] name.
func pythonProjectName(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	text := string(data)
	pIdx := strings.Index(text, "[project]")
	if pIdx < 0 {
		return ""
	}
	section := sliceUntilNextHeader(text[pIdx:])
	for _, line := range strings.Split(section, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "name") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			v := strings.TrimSpace(parts[1])
			v = strings.Trim(v, `"'`)
			return v
		}
	}
	return ""
}

// pythonManifestSignals flags whether the workspace declares scripts (which
// usually means it has a runnable entrypoint that may consume env).
func pythonManifestSignals(path string) envSignals {
	var sig envSignals
	data, err := os.ReadFile(path)
	if err != nil {
		return sig
	}
	text := string(data)
	if strings.Contains(text, "[project.scripts]") || strings.Contains(text, "[tool.poetry.scripts]") {
		sig.PythonScripts = true
	}
	return sig
}

// guessManifest returns the absolute path to the workspace's manifest file
// (package.json / Cargo.toml / pyproject.toml / go.mod), or "" if none found.
func guessManifest(absDir string) string {
	for _, name := range []string{"package.json", "Cargo.toml", "pyproject.toml", "go.mod"} {
		p := filepath.Join(absDir, name)
		if fileExists(p) {
			return p
		}
	}
	return ""
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
	case "auto", "loop":
		must(runAutoCmd(os.Args[2:]))
	case "install":
		must(runInstall(os.Args[2:]))
	case "update":
		must(runUpdate(os.Args[2:]))
	case "recover":
		must(runRecover(os.Args[2:]))
	case "steer":
		must(runSteerCmd(os.Args[2:]))
	case "validate":
		must(runValidateCmd(os.Args[2:]))
	case "reverify":
		must(runReverifyCmd(os.Args[2:]))
	case "repair":
		must(runRepairCmd(os.Args[2:]))
	case "sync":
		must(runSyncCmd(os.Args[2:]))
	case "version", "--version", "-v":
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
	fmt.Fprintln(w, "  belmont update [--check] [--force] [--no-commit]")
	fmt.Fprintln(w, "  belmont status [--root PATH] [--feature SLUG] [--format text|json] [--color auto|always|never]")
	fmt.Fprintln(w, "  belmont auto --feature SLUG [--from M1] [--to M5] [--tool claude|codex|gemini|copilot|cursor|pi|opencode] [--policy autonomous|milestone|every_action] [--max-iterations N] [--max-parallel N] [--allow-dirty] [--root PATH]")
	fmt.Fprintln(w, "    (alias: belmont loop)")
	fmt.Fprintln(w, "  belmont reverify [--feature SLUG] [--from M1] [--to M5] [--root PATH] [--format text|json]")
	fmt.Fprintln(w, "  belmont repair [--feature SLUG] [--dry-run] [--mechanical-only] [--apply-proposal FILE] [--yes] [--tool claude|codex|gemini|copilot|cursor|pi|opencode] [--root PATH] [--format text|json]")
	fmt.Fprintln(w, "  belmont sync [--root PATH]")
	fmt.Fprintln(w, "  belmont recover [--list] [--merge SLUG] [--clean SLUG] [--clean-all] [--tool claude|codex|gemini|copilot|cursor|pi|opencode] [--root PATH] [--format text|json]")
	fmt.Fprintln(w, "  belmont steer [--feature SLUG] [--milestone M5] [--message \"text\" | --file PATH | -] [--root PATH]")
	fmt.Fprintln(w, "  belmont validate [--feature SLUG] [--root PATH] [--format text|json]")
	fmt.Fprintln(w, "  belmont version")
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}

func extractProductName(prdPath string) string {
	content, err := os.ReadFile(prdPath)
	if err != nil {
		return "Unnamed Product"
	}
	re := regexp.MustCompile(`(?m)^#\s*Product:\s*(.+)$`)
	match := re.FindStringSubmatch(string(content))
	if len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return extractFeatureName(string(content))
}

func listFeatures(featuresDir string, maxName int) []featureSummary {
	return listFeaturesWithOverrides(featuresDir, maxName, nil)
}

// parseMasterTableColumns finds column indices by header name in the master PROGRESS.md features table.
func parseMasterTableColumns(lines []string) map[string]int {
	result := map[string]int{
		"Feature": -1, "Slug": -1, "Priority": -1, "Dependencies": -1,
		"Status": -1, "Milestones": -1, "Tasks": -1,
	}
	inTable := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "## Features") {
			inTable = true
			continue
		}
		if inTable && strings.HasPrefix(trimmed, "|") {
			cells := splitTableCells(trimmed)
			for i, c := range cells {
				c = strings.TrimSpace(c)
				if _, ok := result[c]; ok {
					result[c] = i
				}
			}
			return result
		}
	}
	// Fallback: old 6-column format or new 7-column format by position
	return result
}

// splitTableCells splits a markdown table row into cells (stripping leading/trailing pipes).
func splitTableCells(line string) []string {
	cols := strings.Split(line, "|")
	var cells []string
	for _, c := range cols {
		c = strings.TrimSpace(c)
		if c != "" {
			cells = append(cells, c)
		}
	}
	return cells
}

// populateFeatureDeps enriches feature summaries with dependency and priority info from master PROGRESS.md.
func populateFeatureDeps(features []featureSummary, root string) {
	deps, priorities := parseMasterDeps(root)
	for i := range features {
		if d, ok := deps[features[i].Slug]; ok {
			features[i].Deps = d
		}
		if p, ok := priorities[features[i].Slug]; ok {
			features[i].Priority = p
		}
	}
}

func computeFeatureListStatus(features []featureSummary) string {
	allVerified := true
	allComplete := true
	anyProgress := false
	for _, f := range features {
		// Archived features count as terminal for both "Verified" and
		// "Complete" aggregates — otherwise cleaning up a finished feature
		// would regress the project status.
		if f.Status != "Verified" && f.Status != "Archived" {
			allVerified = false
		}
		if !isFeatureTerminal(f.Status) {
			allComplete = false
		}
		if f.TasksDone > 0 || f.TasksInProgress > 0 {
			anyProgress = true
		}
	}
	if allVerified && len(features) > 0 {
		return "Verified"
	}
	if allComplete && len(features) > 0 {
		return "Complete"
	}
	if anyProgress {
		return "In Progress"
	}
	return "Not Started"
}

func extractFeatureName(prd string) string {
	re := regexp.MustCompile(`(?m)^#\s*PRD:\s*(.+)$`)
	match := re.FindStringSubmatch(prd)
	if len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return "Unknown"
}

// extractArchiveName pulls the display name out of an ARCHIVE.md's
// "# Archive: <name>" header. Returns "" if no header is found.
func extractArchiveName(archive string) string {
	re := regexp.MustCompile(`(?m)^#\s*Archive:\s*(.+)$`)
	match := re.FindStringSubmatch(archive)
	if len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return ""
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
	{Name: "copilot", Label: "GitHub Copilot (.copilot/)"},
	{Name: "pi", Label: "Pi (.pi/)"},
	{Name: "opencode", Label: "opencode (.opencode/)"},
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
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

// fileContainsMarker returns true if the file at path exists and contains the
// given marker substring. Used by detectTools to spot Belmont's skill-routing
// section as a "previously installed for this tool" signal.
func fileContainsMarker(path, marker string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(string(data), marker)
}

// conditionalSkills maps a skill name to the tools that can actually run its
// interactive mechanics. A skill absent from this map is unconditional: every
// install gets it on the shared `.agents/skills/belmont/` discovery surface
// and in every per-tool command palette. See
// knowledge/cross-cutting/skill-format.md.
//
// `loop` drives Claude Code by delegating to the built-in `/loop`, and Codex
// by starting Goal mode via `/goal`. No other supported CLI has an equivalent
// long-running interactive primitive, so none of them ever gets a generated
// slash command for it, and no install publishes it on their account.
//
// What this does NOT promise: invisibility on a mixed install. `.agents/skills/`
// is one directory all eight CLIs read, so `--tools codex,opencode` leaves
// `loop` where opencode's skill tool can load it. The gate keeps it out of the
// discoverable palette; the skill body's refusal is the guard for the rest.
var conditionalSkills = map[string]map[string]bool{
	"loop": {"claude": true, "codex": true},
}

// offSurfaceClaudeCommandSkills names conditional skills Claude Code can still
// run while they are absent from `.agents/skills/`: `linkClaudeCommands`
// writes them as real `.claude/commands/belmont/<skill>.md` files. Because
// Claude has that private delivery path, selecting Claude alone never
// publishes the skill to the shared surface — see toolPublishesSkill.
var offSurfaceClaudeCommandSkills = map[string]bool{
	"loop": true,
}

func skillIsConditional(name string) bool {
	_, conditional := conditionalSkills[name]
	return conditional
}

// skillRunnableByTool reports whether `tool` can run `name` interactively.
// Used to keep a conditional skill out of a tool's own command palette even
// when a co-selected tool put it on the shared surface.
func skillRunnableByTool(name, tool string) bool {
	runners, conditional := conditionalSkills[name]
	if !conditional {
		return true
	}
	return runners[tool]
}

// toolPublishesSkill reports whether selecting `tool` should copy `name` onto
// the shared `.agents/skills/belmont/` surface. Claude Code is deliberately
// excluded for off-surface skills: it receives them as real command files, so
// a Claude-only install must not expose them to the seven other CLIs that read
// the same directory.
func toolPublishesSkill(name, tool string) bool {
	if !skillRunnableByTool(name, tool) {
		return false
	}
	return !(tool == "claude" && offSurfaceClaudeCommandSkills[name])
}

// resolveSharedSurfaceSkills decides, for every conditional skill, whether it
// belongs on this project's shared `.agents/skills/belmont/` surface. The
// result is threaded through both skill-sync paths and the off-surface Claude
// command collection so every consumer makes the same call.
//
// A conditional skill is published when a selected tool publishes it — or when
// it is already installed in `skillsTarget`. That stickiness is load-bearing:
// `.agents/skills/` is committed to git, but the tool selection is a property
// of the *machine* running the install. `belmont update` re-runs
// `install --no-prompt --tools all`, which resolves to *detected* tools, so
// without it a teammate (or CI) with no `codex` on PATH would prune `loop/`,
// `commitBelmontUpdate` would commit the removal, and the next update from a
// Codex machine would add it back — the folder would flap in git forever.
//
// Dropping a published skill for good is therefore a deliberate
// `rm -rf .agents/skills/belmont/<skill>`: nothing re-adds it unless a tool
// that publishes it is selected again.
func resolveSharedSurfaceSkills(skillsTarget string, selectedTools []string) map[string]bool {
	published := make(map[string]bool, len(conditionalSkills))
	for name := range conditionalSkills {
		if fileExists(filepath.Join(skillsTarget, name, "SKILL.md")) {
			published[name] = true
			continue
		}
		for _, tool := range selectedTools {
			if toolPublishesSkill(name, tool) {
				published[name] = true
				break
			}
		}
	}
	return published
}

// skillVisibleOnSharedSurface answers the sync-time question "copy this skill
// into `.agents/skills/belmont/`?" against a decision from
// resolveSharedSurfaceSkills. Unconditional skills are always visible.
func skillVisibleOnSharedSurface(name string, sharedSurface map[string]bool) bool {
	if !skillIsConditional(name) {
		return true
	}
	return sharedSurface[name]
}

func needsOffSurfaceClaudeCommand(name string, sharedSurface map[string]bool) bool {
	return offSurfaceClaudeCommandSkills[name] && !skillVisibleOnSharedSurface(name, sharedSurface)
}

// collectOffSurfaceClaudeCommandsSource reads the generated SKILL.md content
// for each skill that should be a real Claude command file for this install
// because it is absent from the shared `.agents/skills/` surface. A missing
// generated SKILL.md is skipped silently (generation runs first).
func collectOffSurfaceClaudeCommandsSource(skillsSource string, sharedSurface map[string]bool) map[string]string {
	out := map[string]string{}
	for name := range offSurfaceClaudeCommandSkills {
		if !needsOffSurfaceClaudeCommand(name, sharedSurface) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(skillsSource, name, "SKILL.md"))
		if err != nil {
			continue
		}
		out[name] = string(data)
	}
	return out
}

// collectOffSurfaceClaudeCommandsEmbedded is the embed.FS counterpart of
// collectOffSurfaceClaudeCommandsSource. `root` is the embedded skills root
// (`skills/belmont`).
func collectOffSurfaceClaudeCommandsEmbedded(embedFS embed.FS, root string, sharedSurface map[string]bool) map[string]string {
	out := map[string]string{}
	for name := range offSurfaceClaudeCommandSkills {
		if !needsOffSurfaceClaudeCommand(name, sharedSurface) {
			continue
		}
		data, err := fs.ReadFile(embedFS, root+"/"+name+"/SKILL.md")
		if err != nil {
			continue
		}
		out[name] = string(data)
	}
	return out
}

// linkClaudeCommands creates per-skill symlinks at
// `.claude/commands/belmont/<skill>.md` -> `.agents/skills/belmont/<skill>/SKILL.md`.
// Claude Code 2.1.x registers each one as a `/belmont:<skill>` slash command
// (subfolder under `.claude/commands/` becomes the namespace prefix). The
// agentskills.io frontmatter (`name:`, `description:`) on SKILL.md is also
// valid frontmatter for Claude Code slash commands, so no rewriting is needed.
// offSurfaceClaudeCmds maps skill names to their SKILL.md content; these are
// written as real command files (not symlinks) because the skills are absent
// from `.agents/skills/belmont/` for this install.
func linkClaudeCommands(projectRoot, skillsTarget string, offSurfaceClaudeCmds map[string]string) error {
	return syncSkillCommands(projectRoot, skillsTarget, filepath.Join(".claude", "commands", "belmont"), "claude",
		func(cmdPath, skillFile, skill string) error {
			return ensureSymlink(cmdPath, skillFile, false)
		}, offSurfaceClaudeCmds)
}

// linkOpencodeCommands creates per-skill wrapper command files at
// `.opencode/command/belmont/<skill>.md`. opencode registers each one as a
// `/belmont/<skill>` slash command (the command name is the file path
// relative to `command/`, minus `.md` — opencode namespaces with `/`, not
// Claude's `:`). Skills themselves remain discoverable via opencode's
// `skill` tool, but the TUI's `/` autocomplete only lists commands — these
// files are what make `/belmont…` show the skill list.
//
// Unlike Claude Code, these CANNOT be symlinks to SKILL.md: opencode's
// command loader builds the raw config as `{name, ...frontmatter, template}`,
// so a SKILL.md `name:` key (required by agentskills.io) OVERRIDES the
// path-derived `belmont/<skill>` name and the command registers under the
// bare skill name instead — colliding with (and shadowing) the skill itself
// and never appearing under `/belmont`. So each command is a small generated
// wrapper: `description:` copied from the skill frontmatter (feeds the TUI
// autocomplete) and a body that tells the model to read the canonical
// SKILL.md — the same delegation form adaptPromptForTool uses in auto mode,
// which also keeps the skill's relative `references/` paths resolving from
// the real skill directory.
func linkOpencodeCommands(projectRoot, skillsTarget string) error {
	// opencode gets no off-surface skills, and conditional skills it cannot run
	// are filtered out by syncSkillCommands' tool argument. That filter matters
	// on a co-selected install (e.g. `--tools codex,opencode`): `loop` IS on the
	// shared surface then, so an unfiltered walk would generate a first-class
	// `/belmont/loop` command for a tool with no `/loop` or `/goal` to delegate
	// to — a dead end in the `/` palette. Any such command left by an earlier
	// install is pruned in the same pass.
	return syncSkillCommands(projectRoot, skillsTarget, filepath.Join(".opencode", "command", "belmont"), "opencode",
		writeOpencodeCommandFile, nil)
}

// writeOpencodeCommandFile generates the wrapper command file for one skill.
// Idempotent: an up-to-date file is left untouched. A pre-existing symlink at
// cmdPath (from an older Belmont install attempt) is removed first — writing
// through it would corrupt the canonical SKILL.md it points at.
func writeOpencodeCommandFile(cmdPath, skillFile, skill string) error {
	var b strings.Builder
	b.WriteString("---\n")
	if desc := skillDescription(skillFile); desc != "" {
		b.WriteString("description: " + strconv.Quote(desc) + "\n")
	}
	b.WriteString("---\n\n")
	fmt.Fprintf(&b,
		"Run the belmont:%s skill. Read .agents/skills/belmont/%s/SKILL.md fully and follow the instructions in its body to completion. $ARGUMENTS\n",
		skill, skill)
	content := b.String()

	if st, err := os.Lstat(cmdPath); err == nil {
		if st.Mode()&os.ModeSymlink != 0 {
			fmt.Printf("  ~ %s (replacing symlink with wrapper command)\n", cmdPath)
			if err := os.Remove(cmdPath); err != nil {
				return err
			}
		} else if existing, err := os.ReadFile(cmdPath); err == nil && string(existing) == content {
			fmt.Printf("  = %s (command ok)\n", cmdPath)
			return nil
		}
	}
	if err := os.WriteFile(cmdPath, []byte(content), 0o644); err != nil {
		return err
	}
	fmt.Printf("  + %s\n", cmdPath)
	return nil
}

// skillDescription extracts the `description:` value from a SKILL.md
// frontmatter block. Returns "" when the file or the key is missing —
// Belmont-generated skills always carry single-line descriptions.
func skillDescription(skillFile string) string {
	data, err := os.ReadFile(skillFile)
	if err != nil {
		return ""
	}
	lines := strings.Split(string(data), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return ""
	}
	for _, line := range lines[1:] {
		if strings.TrimSpace(line) == "---" {
			break
		}
		if strings.HasPrefix(line, "description:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "description:"))
		}
	}
	return ""
}

// Marker constants for Belmont's skill-routing section. Phase 2 no longer
// writes these sections (every supported CLI auto-discovers
// `.agents/skills/<name>/SKILL.md`), but the markers are still recognized for:
//   - detectTools (so a Phase 1 project where Belmont is already wired
//     continues to be detected during a Phase 2 re-install);
//   - the legacy cleanup pass (so AGENTS.md / GEMINI.md sections written by
//     Phase 1 get stripped on next install).
const belmontAgentsSectionStart = "<!-- belmont:skill-routing:start -->"
const belmontAgentsSectionEnd = "<!-- belmont:skill-routing:end -->"
const belmontGeminiSectionStart = "<!-- belmont:skill-routing:start -->"
const belmontGeminiSectionEnd = "<!-- belmont:skill-routing:end -->"

// Even older marker pair from the pre-Phase-1 Codex-only routing section.
// Cleanup pass strips this too.
const codexAgentsGuidanceStart = "<!-- belmont:codex-skill-routing:start -->"
const codexAgentsGuidanceEnd = "<!-- belmont:codex-skill-routing:end -->"

// removeMarkedSection strips a marker-delimited block from content, returning
// the result and whether anything was removed. Used to migrate users off
// older marker pairs to the current ones.
func removeMarkedSection(content, startMarker, endMarker string) (string, bool) {
	start := strings.Index(content, startMarker)
	end := strings.Index(content, endMarker)
	if start < 0 || end <= start {
		return content, false
	}
	end += len(endMarker)
	// Eat one trailing newline if present, to avoid leaving a blank line gap.
	if end < len(content) && content[end] == '\n' {
		end++
	}
	return content[:start] + content[end:], true
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

// ── Loop command ──

func shortActionLabel(t loopActionType) string {
	switch t {
	case actionImplementMilestone:
		return "IMPLEMENT"
	case actionImplementNext:
		return "FIX"
	case actionVerify:
		return "VERIFY"
	case actionReplan:
		return "REPLAN"
	case actionSkipMilestone:
		return "SKIP"
	case actionDebug:
		return "DEBUG"
	case actionTriage:
		return "TRIAGE"
	case actionFixAll:
		return "FIX-ALL"
	default:
		return string(t)
	}
}

func lastActionType(history []historyEntry) loopActionType {
	if len(history) == 0 {
		return ""
	}
	return history[len(history)-1].Action.Type
}

func consecutiveFailures(history []historyEntry) int {
	count := 0
	for i := len(history) - 1; i >= 0; i-- {
		if history[i].Result != nil && !history[i].Result.Success {
			count++
		} else {
			break
		}
	}
	return count
}

func isLoopStuck(history []historyEntry) bool {
	if len(history) < 2 {
		return false
	}
	recent := history[len(history)-2:]
	// Both must have succeeded
	for _, e := range recent {
		if e.Result == nil || !e.Result.Success {
			return false
		}
	}
	// Compare state fingerprints
	fp0 := loopFingerprint(recent[0])
	fp1 := loopFingerprint(recent[1])
	return fp0 == fp1
}

func loopFingerprint(e historyEntry) string {
	return fmt.Sprintf("%d/%d|%d/%d|%d|%v|%s", e.TasksDone, e.TasksTotal, e.MsDone, e.MsTotal, e.BlockerCount, e.HasFwlup, e.PostGitSHA)
}

func countDoneMilestones(milestones []milestone) int {
	count := 0
	for _, m := range milestones {
		if milestoneAllDone(m) {
			count++
		}
	}
	return count
}

// captureGitSHA returns the current HEAD SHA, or "" on error.
func captureGitSHA(root string) string {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// lastMilestoneID walks backward through history and returns the most recent non-empty MilestoneID.
func lastMilestoneID(history []historyEntry) string {
	for i := len(history) - 1; i >= 0; i-- {
		if history[i].Action.MilestoneID != "" {
			return history[i].Action.MilestoneID
		}
	}
	return ""
}

// fencedJSONBodies returns the contents of every fenced code block in s,
// in document order. Recognises ```json ... ```, ```JSON ... ``` and
// language-less ``` ... ``` fences. Anything else (e.g. ```bash) is skipped.
func fencedJSONBodies(s string) []string {
	var out []string
	rest := s
	for {
		open := strings.Index(rest, "```")
		if open == -1 {
			return out
		}
		after := rest[open+3:]
		// Optional language tag through to the next newline.
		nl := strings.IndexByte(after, '\n')
		if nl == -1 {
			return out
		}
		lang := strings.TrimSpace(after[:nl])
		body := after[nl+1:]
		close := strings.Index(body, "```")
		if close == -1 {
			return out
		}
		if lang == "" || strings.EqualFold(lang, "json") {
			out = append(out, body[:close])
		}
		rest = body[close+3:]
	}
}

// firstBalancedJSONObjectWithAction scans s for the first `{ ... }` whose
// braces balance and which contains an "action" key. Strings (including
// escapes) are tracked so braces inside string literals don't throw the
// depth count off.
func firstBalancedJSONObjectWithAction(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] != '{' {
			continue
		}
		end := matchBalancedBrace(s, i)
		if end == -1 {
			continue
		}
		candidate := s[i : end+1]
		if !strings.Contains(candidate, `"action"`) {
			continue
		}
		var probe map[string]any
		if err := json.Unmarshal([]byte(candidate), &probe); err != nil {
			continue
		}
		if _, ok := probe["action"]; ok {
			return candidate
		}
	}
	return ""
}

// matchBalancedBrace returns the index of the `}` that closes the `{` at
// start, or -1 if there is no balanced match. Tracks string state so braces
// inside JSON string literals don't affect depth.
func matchBalancedBrace(s string, start int) int {
	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if c == '\\' {
				escaped = true
				continue
			}
			if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

// parseTriageDecision extracts the triage JSON decision from the tool output.
func parseTriageDecision(output string) *triageDecision {
	// Find JSON object with "decision" field
	re := regexp.MustCompile(`\{[^{}]*"decision"\s*:\s*"[^"]+?"[^{}]*\}`)
	match := re.FindString(output)
	if match == "" {
		// Try to find it in the last 2000 chars (triage outputs it at the end)
		tail := output
		if len(tail) > 2000 {
			tail = tail[len(tail)-2000:]
		}
		match = re.FindString(tail)
		if match == "" {
			return nil
		}
	}
	var td triageDecision
	if err := json.Unmarshal([]byte(match), &td); err != nil {
		return nil
	}
	if td.Decision == "" {
		return nil
	}
	return &td
}

// loadPromptTemplate loads a prompt template from embedded FS or source filesystem.
func loadPromptTemplate(name string) (*template.Template, error) {
	filename := name + ".md"

	// Try embedded first
	if hasEmbeddedFiles {
		data, err := fs.ReadFile(embeddedPrompts, filepath.Join("prompts", "belmont", filename))
		if err == nil {
			return template.New(name).Parse(string(data))
		}
	}

	// Try source resolution
	sourceRoot := resolveSourceForPrompts()
	if sourceRoot == "" {
		return nil, fmt.Errorf("prompt %q: no embedded files and no source directory found", name)
	}

	data, err := os.ReadFile(filepath.Join(sourceRoot, "prompts", "belmont", filename))
	if err != nil {
		return nil, fmt.Errorf("prompt %q: %w", name, err)
	}
	return template.New(name).Parse(string(data))
}

// resolveSourceForPrompts returns the belmont source directory path, or "" if not found.
func resolveSourceForPrompts() string {
	if src := os.Getenv("BELMONT_SOURCE"); src != "" {
		return src
	}

	configDir, err := os.UserConfigDir()
	if err == nil {
		configPath := filepath.Join(configDir, "belmont", "config.json")
		if data, err := os.ReadFile(configPath); err == nil {
			var cfg config
			if json.Unmarshal(data, &cfg) == nil && cfg.Source != "" {
				return cfg.Source
			}
		}
	}

	// Walk up from binary location
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(exe)
	for {
		if _, err := os.Stat(filepath.Join(dir, "prompts", "belmont")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// isTerminal returns true if the given file is a terminal.
func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

// verifyNoConflictMarkers scans resolved files for leftover conflict markers.
func verifyNoConflictMarkers(root string, files []string) error {
	markers := []string{"<<<<<<<", "=======", ">>>>>>>"}
	var badFiles []string

	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(root, file))
		if err != nil {
			continue
		}
		content := string(data)
		for _, marker := range markers {
			if strings.Contains(content, marker) {
				badFiles = append(badFiles, file)
				break
			}
		}
	}

	if len(badFiles) > 0 {
		return fmt.Errorf("conflict markers remain in: %s", strings.Join(badFiles, ", "))
	}
	return nil
}

// getCurrentBranch returns the current branch name, or "HEAD" if detached.
func getCurrentBranch(root string) string {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// belmontManagedPaths is the allow-list of subtrees Belmont's installer writes
// into (or has previously written into and now manages cleanup of). Used by
// the dirty-tree preflight (to give a Belmont-aware error) and by the update
// auto-commit (to scope `git add` so unrelated user work isn't swept up).
//
// Phase 2 actively writes: `.agents/belmont/`, `.agents/skills/belmont/`,
// `.claude/agents/belmont` (sub-agent symlink), `.claude/commands/belmont/`
// and `.opencode/command/belmont/` (per-skill slash-command symlinks →
// .agents/skills/belmont/<skill>/SKILL.md).
// Every other entry below is a legacy path kept in the list so deletions of
// stale dirs/files also get staged for the auto-commit when an older project
// upgrades through `belmont update` → `belmont install` → runLegacyCleanup.
var belmontManagedPaths = []string{
	".agents/belmont",
	".agents/skills/belmont",
	".claude/agents/belmont",
	".claude/commands/belmont",
	".opencode/command/belmont",
	// Legacy (may be staged for deletion):
	".claude/skills/belmont",  // Phase-2 nested symlink — never worked
	".claude/plugins/belmont", // Phase-2.5 project-local-plugin attempt — also never worked
	".codex/belmont",
	".cursor/rules/belmont",
	".windsurf/rules/belmont",
	".gemini/rules/belmont",
	".copilot/belmont",
	"AGENTS.md",
	"GEMINI.md",
}

func pathIsBelmontManaged(p string) bool {
	for _, prefix := range belmontManagedPaths {
		if p == prefix || strings.HasPrefix(p, prefix+"/") {
			return true
		}
	}
	return false
}

// porcelainPath extracts the path from a `git status --porcelain` line
// ("XY path" or "XY old -> new" for renames).
func porcelainPath(line string) string {
	if len(line) < 4 {
		return ""
	}
	p := strings.TrimSpace(line[3:])
	if idx := strings.Index(p, " -> "); idx >= 0 {
		p = p[idx+4:]
	}
	return p
}

// ensureCleanMergeState aborts any in-progress merge and cleans up unmerged files.
// Called between sequential merges to prevent cascade failures.
func ensureCleanMergeState(root string) error {
	gitDir := filepath.Join(root, ".git")

	// Abort any in-progress merge
	if fileExists(filepath.Join(gitDir, "MERGE_HEAD")) {
		abortCmd := exec.Command("git", "merge", "--abort")
		abortCmd.Dir = root
		abortCmd.Run()
	}

	// Check for remaining unmerged files
	diffCmd := exec.Command("git", "diff", "--name-only", "--diff-filter=U")
	diffCmd.Dir = root
	out, _ := diffCmd.Output()
	if strings.TrimSpace(string(out)) == "" {
		return nil // clean
	}

	// Try harder: reset index and checkout
	resetCmd := exec.Command("git", "reset", "HEAD")
	resetCmd.Dir = root
	resetCmd.Run()
	checkoutCmd := exec.Command("git", "checkout", "--", ".")
	checkoutCmd.Dir = root
	checkoutCmd.Run()

	// Re-check
	recheckCmd := exec.Command("git", "diff", "--name-only", "--diff-filter=U")
	recheckCmd.Dir = root
	out2, _ := recheckCmd.Output()
	if strings.TrimSpace(string(out2)) != "" {
		return fmt.Errorf("unable to clean merge state — unmerged files remain:\n%s", strings.TrimSpace(string(out2)))
	}
	return nil
}

// commitWorktreeFeatureState commits the initial .belmont/features/ state in a worktree
// so the AI agent starts from a clean git state.
func commitWorktreeFeatureState(wtPath, slug string) {
	// .belmont/ is marked assume-unchanged to prevent worktree merges from
	// deleting other features' state. No .belmont/ commit needed here —
	// the orchestrator copies feature state back after merge.
}

// ensureGitignoreEntry adds an entry to .gitignore if not already present.
func ensureGitignoreEntry(root, entry string) {
	gitignorePath := filepath.Join(root, ".gitignore")

	content, err := os.ReadFile(gitignorePath)
	if err == nil {
		if strings.Contains(string(content), entry) {
			return // already present
		}
	}

	f, err := os.OpenFile(gitignorePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	// Add newline before if file doesn't end with one
	if len(content) > 0 && content[len(content)-1] != '\n' {
		f.WriteString("\n")
	}
	f.WriteString(entry + "\n")
}

// commitBelmontState commits any uncommitted .belmont/ state files in the main repo.
// Used after belmont sync updates master PROGRESS.md.
func commitBelmontState(root string) error {
	// Don't try to commit if there's an in-progress merge — git commit would
	// either fail or finalize the merge unintentionally
	if fileExists(filepath.Join(root, ".git", "MERGE_HEAD")) {
		return fmt.Errorf("skipping: merge in progress")
	}

	statusCmd := exec.Command("git", "status", "--porcelain", ".belmont/")
	statusCmd.Dir = root
	out, err := statusCmd.Output()
	if err != nil {
		return nil // can't check, skip gracefully
	}
	if strings.TrimSpace(string(out)) == "" {
		return nil // nothing to commit
	}

	addCmd := exec.Command("git", "add", ".belmont/")
	addCmd.Dir = root
	if _, err := addCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git add .belmont/: %w", err)
	}

	commitCmd := exec.Command("git", "commit", "-m", "belmont: update state files")
	commitCmd.Dir = root
	if _, err := commitCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git commit .belmont/: %w", err)
	}
	return nil
}

// mergeFailureKind classifies the type of git merge failure.
type mergeFailureKind int

const (
	mergeConflict           mergeFailureKind = iota // file-level conflicts
	mergeUntrackedOverwrite                         // untracked files would be overwritten
	mergeDirtyWorktree                              // local changes would be overwritten
	mergeUnmergedFiles                              // stale unmerged files from previous merge
	mergeOtherFailure                               // unknown merge failure
)

// classifyMergeError determines what kind of merge failure occurred from git output.
func classifyMergeError(output string) mergeFailureKind {
	if strings.Contains(output, "untracked working tree files would be overwritten") {
		return mergeUntrackedOverwrite
	}
	if strings.Contains(output, "Your local changes to the following files would be overwritten") {
		return mergeDirtyWorktree
	}
	if strings.Contains(output, "CONFLICT") || strings.Contains(output, "Automatic merge failed") {
		return mergeConflict
	}
	if strings.Contains(output, "unmerged files") {
		return mergeUnmergedFiles
	}
	return mergeOtherFailure
}

// parseOverwrittenFiles extracts file paths from git's "untracked working tree files would be overwritten" error.
func parseOverwrittenFiles(output string) []string {
	var files []string
	lines := strings.Split(output, "\n")
	inFileList := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(line, "untracked working tree files would be overwritten") {
			inFileList = true
			continue
		}
		if inFileList {
			if trimmed == "" || strings.HasPrefix(trimmed, "Please move or remove") || strings.HasPrefix(trimmed, "Aborting") {
				break
			}
			if trimmed != "" {
				files = append(files, trimmed)
			}
		}
	}
	return files
}

// ============================================================================
// belmont steer — inject user instructions into an in-flight auto run.
//
// The auto loop runs headless AI CLI invocations inside isolated worktrees;
// there is no channel for the user to interject. `belmont steer` writes an
// append-only STEERING.md in each active worktree (or the master feature
// directory for non-parallel runs). executeLoopAction consumes pending
// entries before each phase and prepends them to the agent prompt as a
// higher-priority block than NOTES.md.
// ============================================================================

// steeringEntry represents a single block in STEERING.md.
type steeringEntry struct {
	Timestamp string // RFC3339 UTC from the header
	Milestone string // optional — empty means applies to any milestone
	State     string // "pending" or "consumed <ts> by <phase>"
	Body      string // free-form text between this header and the next
}

var steeringHeaderRe = regexp.MustCompile(`^##\s+(\S+)(?:\s+\[([^\]]+)\])?\s+\(([^)]+)\)\s*$`)

// steeringTarget identifies a single worktree (or master root) to write
// STEERING.md into.
type steeringTarget struct {
	MilestoneID string // empty for non-parallel runs
	Root        string // absolute worktree path (or master root)
	Label       string // e.g. "M5" or "serial" — for log output
}

// ============================================================================
// belmont validate — detect milestone structure violations in PROGRESS.md.
//
// Catches the "polish milestone" anti-pattern — where a skill (implement,
// verify, etc.) invents a new milestone like "M5: Polish / follow-ups from
// M1" to hold deferred items. Such milestones declare dependency on their
// source but actually mutate siblings' outputs, producing silent merge
// conflicts in parallel auto runs. See skills/belmont/_partials/milestone-
// immutability.md for the canonical rule this command enforces.
// ============================================================================

// ============================================================================
// Layer 1 — post-phase scope guard.
//
// After each agent subprocess exits, we compare PROGRESS.md's milestone
// structure to the snapshot taken before the shell-out. Two kinds of
// violation are reverted:
//
//   (A) New `## M<N>:` milestone headings added during a non-tech-plan phase.
//   (B) Checkbox state flips on tasks belonging to a milestone other than the
//       action's target.
//
// Revert rewrites PROGRESS.md to restore the pre-phase bytes for the
// violating milestone blocks, preserves in-scope edits (target milestone
// body, non-milestone sections like activity log), amends the agent's last
// commit (best-effort), and injects a STEERING correction so the next phase
// sees an explicit "do not do that" before it starts work.
//
// This is unbypassable by `git commit --no-verify` because it runs in the
// Belmont Go process after the agent subprocess has exited.
// ============================================================================

// ============================================================================
// Layer 2 — verify evidence check.
//
// Before we accept a [v] flip, require at least one git commit in this
// worktree whose message names the task ID. Rationale: the `verify` skill
// can (and has, in the wild) rubber-stamp tasks whose underlying code is
// still scaffold. If no commit in the worktree names the task, we have no
// evidence it was implemented — revert the flip.
//
// Fires only on actionVerify phases (Layer 1 already guards implement/next).
// Runs after runScopeGuard so in-scope flips are the only candidates.
// ============================================================================

// ============================================================================
// Layer 3 — merge overlap visibility.
//
// At merge time, when we're landing sibling milestones in sequence, warn if
// the branch being merged touches files that a previously-merged sibling
// also touched. Does not block the merge; the point is visibility so the
// user sees the overlap at the moment intervention is cheap (before pushing
// or before the combined state diverges too far).
//
// This is a diagnostic layer — Layer 0 prevents the most common cause, and
// Layer 1 reverts the state-file manifestation. Layer 3 catches residual
// source-file overlap that slips past both.
// ============================================================================
