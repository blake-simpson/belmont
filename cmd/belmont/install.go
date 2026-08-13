package main

import (
	"embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

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

	skillsTarget := filepath.Join(projectRoot, ".agents", "skills", "belmont")

	// One decision, made before either sync path runs and reused by both plus
	// the off-surface Claude command collection: which conditional skills
	// belong on this project's shared surface. Reads the *current* install
	// state, so a machine that can't detect Codex doesn't prune a `loop/` a
	// Codex teammate committed. See resolveSharedSurfaceSkills.
	sharedSurface := resolveSharedSurfaceSkills(skillsTarget, selectedTools)

	// Off-surface Claude command content (name -> SKILL.md), written as real
	// `.claude/commands/belmont/<skill>.md` files when a conditional skill is
	// kept off the shared `.agents/skills/` surface for this install.
	var offSurfaceClaudeCmds map[string]string

	if useEmbedded {
		fmt.Println("Installing agents to .agents/belmont/...")
		if err := syncEmbeddedDir(embeddedAgents, "agents/belmont", filepath.Join(projectRoot, ".agents", "belmont")); err != nil {
			return err
		}
		fmt.Println("")

		fmt.Println("Installing skills to .agents/skills/belmont/...")
		// Phase 2: skills are folder layout (<name>/SKILL.md) only. The
		// agentskills.io standard, auto-discovered by every supported CLI.
		if err := syncEmbeddedSkillsFolderDir(embeddedSkills, "skills/belmont", skillsTarget, sharedSurface); err != nil {
			return err
		}
		offSurfaceClaudeCmds = collectOffSurfaceClaudeCommandsEmbedded(embeddedSkills, "skills/belmont", sharedSurface)
		fmt.Println("")
	} else {
		sourceRoot, err := resolveSourceRoot(source)
		if err != nil {
			return err
		}

		agentsSource := filepath.Join(sourceRoot, "agents", "belmont")
		skillsSource := filepath.Join(sourceRoot, "skills", "belmont")

		if !dirExists(agentsSource) {
			return fmt.Errorf("install: source missing agents/ at %s", sourceRoot)
		}

		// Source mode: ensure the generated skill folders exist before reading
		// them. Auto-runs `scripts/generate-skills.sh` if any source file is
		// newer than its generated counterpart (or no generated content
		// exists yet).
		if err := ensureSkillsGenerated(sourceRoot); err != nil {
			return err
		}
		if !dirExists(skillsSource) {
			return fmt.Errorf("install: source missing skills/ at %s", sourceRoot)
		}

		fmt.Println("Installing agents to .agents/belmont/...")
		if err := syncMarkdownDir(agentsSource, filepath.Join(projectRoot, ".agents", "belmont")); err != nil {
			return err
		}
		fmt.Println("")

		fmt.Println("Installing skills to .agents/skills/belmont/...")
		if err := syncSkillsFolderDir(skillsSource, skillsTarget, sharedSurface); err != nil {
			return err
		}
		offSurfaceClaudeCmds = collectOffSurfaceClaudeCommandsSource(skillsSource, sharedSurface)
		fmt.Println("")
	}

	// Phase 2: AGENTS.md / GEMINI.md routing sections are no longer written —
	// every supported CLI auto-discovers `.agents/skills/<name>/SKILL.md` per
	// agentskills.io. Legacy install dirs from earlier Belmont versions are
	// removed in one consolidated pass.
	if err := runLegacyCleanup(projectRoot); err != nil {
		return err
	}

	for _, tool := range selectedTools {
		if err := setupTool(projectRoot, tool, offSurfaceClaudeCmds); err != nil {
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
				fmt.Println("               .claude/commands/belmont/<skill>.md -> ../../../.agents/skills/belmont/<skill>/SKILL.md (per-skill)")
				fmt.Println("               .claude/commands/belmont/loop.md (real file when loop is kept off .agents/skills/)")
				fmt.Println("    Use: /belmont:working-backwards, /belmont:product-plan, /belmont:tech-plan, /belmont:implement, /belmont:next, /belmont:verify, /belmont:loop, /belmont:debug, /belmont:debug-auto, /belmont:debug-manual, /belmont:status")
			case "codex":
				fmt.Println("  Codex        .agents/skills/belmont/<name>/SKILL.md (auto-discovered)")
				fmt.Println("    Use: $belmont or prompt belmont:<skill> — loop delegates to /goal")
			case "cursor":
				fmt.Println("  Cursor       .agents/skills/belmont/<name>/SKILL.md (auto-discovered)")
				fmt.Println("    Use: prompt belmont:<skill> — Cursor loads via Agent Skills")
			case "windsurf":
				fmt.Println("  Windsurf     .agents/skills/belmont/<name>/SKILL.md (auto-discovered)")
				fmt.Println("    Use: reference belmont skills in Cascade — auto-loaded by SKILL.md description")
			case "gemini":
				fmt.Println("  Gemini       .agents/skills/belmont/<name>/SKILL.md (auto-discovered)")
				fmt.Println("    Use: prompt belmont:<skill> — Gemini surfaces via /skills")
			case "copilot":
				fmt.Println("  Copilot      .agents/skills/belmont/<name>/SKILL.md (auto-discovered)")
				fmt.Println("    Use: prompt belmont:<skill> — Copilot loads from .agents/skills/")
			case "opencode":
				fmt.Println("  opencode     .agents/skills/belmont/<name>/SKILL.md (auto-discovered)")
				fmt.Println("               .opencode/command/belmont/<skill>.md (generated per-skill slash commands)")
				fmt.Println("    Use: /belmont/working-backwards, /belmont/product-plan, /belmont/tech-plan, /belmont/implement, /belmont/next, /belmont/verify, /belmont/debug, /belmont/debug-auto, /belmont/debug-manual, /belmont/status")
				fmt.Println("    (or prompt belmont:<skill> — opencode also loads skills via its skill tool)")
			}
		}
	}

	fmt.Println("")
	fmt.Println("Workflow:")
	fmt.Println("  0. PR/FAQ     - Define product vision (Working Backwards)")
	fmt.Println("  1. Plan       - Create PRD interactively")
	fmt.Println("  2. Tech Plan  - Create technical implementation plan")
	fmt.Println("  3. Implement  - Implement next milestone (full pipeline)")
	fmt.Println("  4. Next       - Implement next single task (lightweight)")
	fmt.Println("  5. Verify     - Run verification and code review")
	fmt.Println("  6. Status     - View progress")
	fmt.Println("  7. Reset      - Reset state and start fresh")
	fmt.Println("  8. Cleanup    - Archive completed features, reduce token bloat")
	fmt.Println("")

	// Hint about worktree auto-install if project has a lockfile but no worktree config
	worktreeJSON := filepath.Join(projectRoot, ".belmont", "worktree.json")
	if _, err := os.Stat(worktreeJSON); os.IsNotExist(err) {
		lockfiles := []string{"pnpm-lock.yaml", "bun.lockb", "bun.lock", "yarn.lock", "package-lock.json", "Gemfile.lock", "requirements.txt", "Cargo.lock"}
		for _, lf := range lockfiles {
			if _, err := os.Stat(filepath.Join(projectRoot, lf)); err == nil {
				fmt.Printf("Note: Worktree dependencies will be auto-installed (%s detected).\n", lf)
				fmt.Println("      Create .belmont/worktree.json to customize setup hooks, teardown, or env vars.")
				fmt.Println("")
				break
			}
		}
	}

	return nil
}

// syncSkillsFolderDir syncs the agentskills.io folder layout from source to
// target. Walks `<sourceDir>/<name>/SKILL.md` entries and copies each skill
// folder (SKILL.md plus its references/ subdir if present) into the target.
// Skips directories whose name starts with `_` (partials/templates) and the
// top-level `references/` dir (that's the flat-layout home, copied separately
// by syncMarkdownDir).
//
// Stale skill folders (present in target but not in source) are removed.
// Flat .md files at the target's top level are left alone — Phase 2's parallel
// output keeps them around during transition; step 2.7 drops them.
//
// `sharedSurface` is the per-conditional-skill decision from
// resolveSharedSurfaceSkills — it already accounts for what is installed in
// targetDir, so a skill published by an earlier install is refreshed here
// rather than pruned by a machine whose tool detection can't see it.
func syncSkillsFolderDir(sourceDir, targetDir string, sharedSurface map[string]bool) error {
	if err := ensureDir(targetDir); err != nil {
		return err
	}
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}

	sourceFolders := make(map[string]struct{})
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") || entry.Name() == "references" {
			continue
		}
		// Conditional skills are exposed on the shared `.agents/skills/`
		// surface only when this project publishes them (a selected tool that
		// can run them, or a copy an earlier install already put there).
		// Skipping here (without recording in sourceFolders) also lets the
		// stale-prune below remove a copy this project no longer publishes.
		if !skillVisibleOnSharedSurface(entry.Name(), sharedSurface) {
			continue
		}
		skillSrc := filepath.Join(sourceDir, entry.Name(), "SKILL.md")
		if !fileExists(skillSrc) {
			continue
		}
		sourceFolders[entry.Name()] = struct{}{}

		skillDest := filepath.Join(targetDir, entry.Name(), "SKILL.md")
		if err := os.MkdirAll(filepath.Dir(skillDest), 0o755); err != nil {
			return err
		}
		if fileExists(skillDest) {
			same, err := filesEqual(skillSrc, skillDest)
			if err != nil {
				return err
			}
			if same {
				fmt.Printf("  = %s/SKILL.md (unchanged)\n", entry.Name())
			} else {
				fmt.Printf("  ~ %s/SKILL.md (updated)\n", entry.Name())
			}
		} else {
			fmt.Printf("  + %s/SKILL.md\n", entry.Name())
		}
		if err := copyFile(skillSrc, skillDest); err != nil {
			return err
		}

		// Per-skill references/ subdir (if present).
		refsSrc := filepath.Join(sourceDir, entry.Name(), "references")
		refsDest := filepath.Join(targetDir, entry.Name(), "references")
		if dirExists(refsSrc) {
			if err := syncReferencesDir(refsSrc, refsDest); err != nil {
				return err
			}
		} else if dirExists(refsDest) {
			if err := os.RemoveAll(refsDest); err != nil {
				return err
			}
		}
	}

	// Remove stale skill folders (present in target but not in source).
	targetEntries, err := os.ReadDir(targetDir)
	if err != nil {
		return err
	}
	for _, entry := range targetEntries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") || entry.Name() == "references" {
			continue
		}
		// Only consider directories that look like skill folders (have a
		// SKILL.md). Otherwise we might delete user-created subdirs we don't
		// own.
		skillCheck := filepath.Join(targetDir, entry.Name(), "SKILL.md")
		if !fileExists(skillCheck) {
			continue
		}
		if _, ok := sourceFolders[entry.Name()]; !ok {
			fmt.Printf("  - %s/ (skill removed, no longer in source)\n", entry.Name())
			if err := os.RemoveAll(filepath.Join(targetDir, entry.Name())); err != nil {
				return err
			}
		}
	}

	return nil
}

// syncEmbeddedSkillsFolderDir is the embed.FS counterpart of syncSkillsFolderDir.
func syncEmbeddedSkillsFolderDir(embedFS embed.FS, root string, targetDir string, sharedSurface map[string]bool) error {
	if err := ensureDir(targetDir); err != nil {
		return err
	}
	entries, err := fs.ReadDir(embedFS, root)
	if err != nil {
		return err
	}

	sourceFolders := make(map[string]struct{})
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") || entry.Name() == "references" {
			continue
		}
		// Conditional skills are not exposed on the shared `.agents/skills/`
		// surface unless this project publishes them (see
		// resolveSharedSurfaceSkills). Skipping here also lets the stale-prune
		// below remove a copy this project no longer publishes.
		if !skillVisibleOnSharedSurface(entry.Name(), sharedSurface) {
			continue
		}
		skillPath := root + "/" + entry.Name() + "/SKILL.md"
		data, err := fs.ReadFile(embedFS, skillPath)
		if err != nil {
			continue // not a skill folder — skip
		}
		sourceFolders[entry.Name()] = struct{}{}

		skillDest := filepath.Join(targetDir, entry.Name(), "SKILL.md")
		if err := os.MkdirAll(filepath.Dir(skillDest), 0o755); err != nil {
			return err
		}
		if fileExists(skillDest) {
			existing, err := os.ReadFile(skillDest)
			if err != nil {
				return err
			}
			if string(existing) == string(data) {
				fmt.Printf("  = %s/SKILL.md (unchanged)\n", entry.Name())
			} else {
				fmt.Printf("  ~ %s/SKILL.md (updated)\n", entry.Name())
			}
		} else {
			fmt.Printf("  + %s/SKILL.md\n", entry.Name())
		}
		if err := os.WriteFile(skillDest, data, 0o644); err != nil {
			return err
		}

		// Per-skill references/ subdir.
		refsRoot := root + "/" + entry.Name() + "/references"
		refsEntries, refsErr := fs.ReadDir(embedFS, refsRoot)
		refsDest := filepath.Join(targetDir, entry.Name(), "references")
		if refsErr == nil {
			if err := os.MkdirAll(refsDest, 0o755); err != nil {
				return err
			}
			refSeen := make(map[string]struct{})
			for _, ref := range refsEntries {
				if ref.IsDir() || !strings.HasSuffix(ref.Name(), ".md") {
					continue
				}
				refSeen[ref.Name()] = struct{}{}
				refData, err := fs.ReadFile(embedFS, refsRoot+"/"+ref.Name())
				if err != nil {
					return err
				}
				if err := os.WriteFile(filepath.Join(refsDest, ref.Name()), refData, 0o644); err != nil {
					return err
				}
			}
			// Remove stale references in target.
			if existing, err := os.ReadDir(refsDest); err == nil {
				for _, e := range existing {
					if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
						continue
					}
					if _, ok := refSeen[e.Name()]; !ok {
						os.Remove(filepath.Join(refsDest, e.Name()))
					}
				}
			}
		} else if dirExists(refsDest) {
			if err := os.RemoveAll(refsDest); err != nil {
				return err
			}
		}
	}

	// Remove stale skill folders.
	targetEntries, err := os.ReadDir(targetDir)
	if err != nil {
		return err
	}
	for _, entry := range targetEntries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") || entry.Name() == "references" {
			continue
		}
		skillCheck := filepath.Join(targetDir, entry.Name(), "SKILL.md")
		if !fileExists(skillCheck) {
			continue
		}
		if _, ok := sourceFolders[entry.Name()]; !ok {
			fmt.Printf("  - %s/ (skill removed, no longer in source)\n", entry.Name())
			if err := os.RemoveAll(filepath.Join(targetDir, entry.Name())); err != nil {
				return err
			}
		}
	}

	return nil
}

func setupTool(projectRoot, tool string, offSurfaceClaudeCmds map[string]string) error {
	switch tool {
	case "claude":
		fmt.Println("Linking Claude Code...")
		skillsTarget := filepath.Join(projectRoot, ".agents", "skills", "belmont")
		agentsTarget := filepath.Join(projectRoot, ".agents", "belmont")
		linkAgents := filepath.Join(projectRoot, ".claude", "agents", "belmont")
		if err := ensureSymlink(linkAgents, agentsTarget, true); err != nil {
			return err
		}
		// Claude Code 2.1.x scans for slash commands at `.claude/commands/<name>.md`.
		// A subfolder under `.claude/commands/` becomes a namespace prefix — i.e.
		// `.claude/commands/belmont/implement.md` registers as `/belmont:implement`.
		// (Skill discovery at `.claude/skills/` is single-level, and project-local
		// plugins at `.claude/plugins/<name>/` are NOT auto-loaded by Claude Code
		// — they require `--plugin-dir` or marketplace `/plugin install`. So the
		// commands-directory pattern is the only zero-friction way to expose
		// Belmont as `/belmont:<skill>` slash commands.)
		//
		// Per-skill symlinks point each command file at the canonical
		// `.agents/skills/belmont/<skill>/SKILL.md`. The skill body's
		// `references/<file>.md` paths still resolve correctly because Claude
		// reads through the symlink and the references/ subdir lives next to
		// the resolved SKILL.md.
		if err := linkClaudeCommands(projectRoot, skillsTarget, offSurfaceClaudeCmds); err != nil {
			return err
		}
	case "codex":
		// Skill content: auto-discovered via .agents/skills/ (Codex 0.126+
		// scans `.agents/skills/<skill>/SKILL.md`). No symlink needed.
		//
		// Codex's TUI `/` menu is built-ins only and not extensible — the
		// old `~/.codex/prompts` custom-prompt feature that could add slash
		// entries was deprecated and removed upstream. The grouped
		// autocomplete UX lives behind `$` mentions instead: the popup
		// fuzzy-matches each skill's `interface.display_name` from
		// `agents/openai.yaml` next to its SKILL.md. Writing
		// `display_name: "belmont:<skill>"` per skill makes typing
		// `$belmont` list every Belmont skill with its description — the
		// Codex equivalent of Claude Code's `/belmont:` namespace.
		fmt.Println("Linking Codex...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (no symlink needed)")
		if err := writeCodexSkillInterfaces(filepath.Join(projectRoot, ".agents", "skills", "belmont")); err != nil {
			return err
		}
	case "windsurf":
		fmt.Println("Linking Windsurf...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (no symlink needed)")
	case "gemini":
		fmt.Println("Linking Gemini...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (no symlink needed)")
	case "copilot":
		fmt.Println("Linking GitHub Copilot...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (no symlink needed)")
	case "cursor":
		fmt.Println("Linking Cursor...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (no symlink needed)")
	case "pi":
		fmt.Println("Linking Pi...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (no symlink needed)")
	case "opencode":
		// opencode scans `.agents/skills/**/SKILL.md` recursively (symlinks
		// followed, skill name taken from frontmatter), so the canonical
		// install at `.agents/skills/belmont/<skill>/SKILL.md` is discovered
		// with no per-tool wiring. Skills surface via opencode's native
		// `skill` tool and the <available_skills> system-prompt block —
		// but ONLY to the model. The TUI's `/` autocomplete lists commands,
		// not skills, so without command files `/belmont…` shows
		// "No matching items".
		//
		// opencode loads commands from `.opencode/command/**/*.md` (the
		// glob accepts `commands/` too). The name is the relative path
		// minus `.md`, so `.opencode/command/belmont/next.md` registers as
		// `/belmont/next` (slash namespace — opencode has no colon form).
		// These are generated wrapper files, NOT SKILL.md symlinks — see
		// linkOpencodeCommands for why symlinks register under the wrong
		// name there.
		fmt.Println("Linking opencode...")
		fmt.Println("  = .agents/skills/belmont auto-discovered (skill tool)")
		if err := linkOpencodeCommands(projectRoot, filepath.Join(projectRoot, ".agents", "skills", "belmont")); err != nil {
			return err
		}
	}
	return nil
}

// syncSkillCommands materializes one tool-native slash command per skill at
// `<commandsRelDir>/<skill>.md` via the write callback (symlink for Claude
// Code, generated wrapper file for opencode).
//
// `tool` is the tool this palette belongs to. Conditional skills the tool
// cannot run (`skillRunnableByTool`) are skipped even when they are present on
// the shared surface because a co-selected tool put them there — otherwise a
// `--tools codex,opencode` install would hand opencode a `/belmont/loop`
// command it has no primitive to fulfil.
//
// `extra` holds commands for skills that are NOT present in `skillsTarget`
// because they were conditionally kept off the shared `.agents/skills/`
// surface for this install: each is written as a real file with the given
// content. Pass nil when there are none. extras are folded into the `wanted`
// set so the prune pass below doesn't delete them.
//
// Stale .md entries inside the commands dir (left over from removed or
// renamed skills, or from a skill this tool may no longer run) are pruned so
// the slash-command surface always matches the current skill set.
func syncSkillCommands(projectRoot, skillsTarget, commandsRelDir, tool string, write func(cmdPath, skillFile, skill string) error, extra map[string]string) error {
	commandsDir := filepath.Join(projectRoot, commandsRelDir)
	if err := os.MkdirAll(commandsDir, 0o755); err != nil {
		return fmt.Errorf("create commands dir: %w", err)
	}

	entries, err := os.ReadDir(skillsTarget)
	if err != nil {
		return fmt.Errorf("read skills dir %s: %w", skillsTarget, err)
	}

	wanted := map[string]bool{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		// Skip generation scaffolding dirs (shouldn't be at this level after
		// install but defensive).
		if strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
			continue
		}
		// A conditional skill this tool cannot run never gets a command here,
		// even when it is on the shared surface for a co-selected tool.
		if !skillRunnableByTool(name, tool) {
			continue
		}
		skillFile := filepath.Join(skillsTarget, name, "SKILL.md")
		if _, err := os.Stat(skillFile); err != nil {
			continue
		}
		cmdPath := filepath.Join(commandsDir, name+".md")
		if err := write(cmdPath, skillFile, name); err != nil {
			return err
		}
		wanted[name+".md"] = true
	}

	// Off-surface skills: write their command file as a real file from the
	// supplied content. A pre-existing symlink at the path (e.g. from an older
	// install where the skill lived under `.agents/skills/`) is removed first
	// so we don't write through it.
	for name, content := range extra {
		// The extras map is the one route that bypasses the walk above, so it
		// takes the same runnability check. Unreachable today (only Claude is
		// handed extras, and it can run everything in
		// offSurfaceClaudeCommandSkills) — the guard is here so the filter is
		// total rather than true-by-coincidence.
		if !skillRunnableByTool(name, tool) {
			continue
		}
		cmdPath := filepath.Join(commandsDir, name+".md")
		wanted[name+".md"] = true
		if st, err := os.Lstat(cmdPath); err == nil {
			if st.Mode()&os.ModeSymlink != 0 {
				fmt.Printf("  ~ %s (replacing symlink with command file)\n", filepath.Join(commandsRelDir, name+".md"))
				if err := os.Remove(cmdPath); err != nil {
					return err
				}
			} else if existing, err := os.ReadFile(cmdPath); err == nil && string(existing) == content {
				fmt.Printf("  = %s (command ok)\n", filepath.Join(commandsRelDir, name+".md"))
				continue
			}
		}
		if err := os.WriteFile(cmdPath, []byte(content), 0o644); err != nil {
			return err
		}
		fmt.Printf("  + %s (off-surface command)\n", filepath.Join(commandsRelDir, name+".md"))
	}

	// Prune stale .md entries that no longer match a skill.
	existing, err := os.ReadDir(commandsDir)
	if err == nil {
		for _, e := range existing {
			if e.IsDir() {
				continue
			}
			n := e.Name()
			if !strings.HasSuffix(n, ".md") || wanted[n] {
				continue
			}
			stale := filepath.Join(commandsDir, n)
			if err := os.Remove(stale); err == nil {
				fmt.Printf("  - %s (stale slash command, removed)\n", filepath.Join(commandsRelDir, n))
			}
		}
	}

	return nil
}

// runLegacyCleanup removes install artifacts left by older Belmont versions
// that are no longer needed in Phase 2. Idempotent and safe to run on every
// install — paths that don't exist are skipped silently. Strips the
// AGENTS.md / GEMINI.md `belmont:skill-routing` sections (and the older
// `belmont:codex-skill-routing` variant).
func runLegacyCleanup(projectRoot string) error {
	// Directories Belmont used to write into but no longer does. Removing
	// these is safe because they were always Belmont-managed (mirroring or
	// symlinked content from `.agents/skills/belmont/` or `.agents/belmont/`).
	// `.claude/commands/belmont` is intentionally NOT in this list — it's the
	// active install path again (re-restored 2026-05-07 after the Phase-2
	// `.claude/skills/belmont` and short-lived `.claude/plugins/belmont`
	// experiments turned out to be invisible to Claude Code 2.1.x). The two
	// failed attempts are still cleaned up below so upgrading users don't
	// carry dead symlinks.
	legacyDirs := []string{
		".claude/skills/belmont",  // Phase-2 nested-namespace symlink — never discovered by Claude Code 2.1.x
		".claude/plugins/belmont", // brief Phase-2.5 project-local-plugin attempt — also not auto-loaded by Claude Code 2.1.x (requires --plugin-dir or marketplace install)
		".codex/belmont",
		".cursor/rules/belmont",
		".windsurf/rules/belmont",
		".gemini/rules/belmont",
		".copilot/belmont",
	}
	announced := false
	announce := func() {
		if !announced {
			fmt.Println("Cleaning up legacy Belmont paths...")
			announced = true
		}
	}
	for _, rel := range legacyDirs {
		path := filepath.Join(projectRoot, rel)
		if _, err := os.Lstat(path); err == nil {
			if err := os.RemoveAll(path); err != nil {
				return fmt.Errorf("cleanup %s: %w", rel, err)
			}
			announce()
			fmt.Printf("  - %s (legacy, removed)\n", rel)
		}
	}

	// Stale flat skill files at .agents/skills/belmont/*.md from pre-Phase-2
	// installs. New folder layout coexists; flat files become orphans.
	skillsDir := filepath.Join(projectRoot, ".agents", "skills", "belmont")
	if entries, err := os.ReadDir(skillsDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			if err := os.Remove(filepath.Join(skillsDir, entry.Name())); err == nil {
				announce()
				fmt.Printf("  - .agents/skills/belmont/%s (legacy flat skill, removed)\n", entry.Name())
			}
		}
		// Stale top-level `references/` dir from pre-Phase-2 (per-skill
		// references now live inside each skill folder).
		topRefs := filepath.Join(skillsDir, "references")
		if dirExists(topRefs) {
			if err := os.RemoveAll(topRefs); err == nil {
				announce()
				fmt.Println("  - .agents/skills/belmont/references/ (legacy top-level refs, removed)")
			}
		}
	}

	// AGENTS.md / GEMINI.md routing sections.
	for _, file := range []string{"AGENTS.md", "GEMINI.md"} {
		path := filepath.Join(projectRoot, file)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		original := string(data)
		updated := original
		modified := false
		if stripped, removed := removeMarkedSection(updated, belmontAgentsSectionStart, belmontAgentsSectionEnd); removed {
			updated = stripped
			modified = true
		}
		if stripped, removed := removeMarkedSection(updated, codexAgentsGuidanceStart, codexAgentsGuidanceEnd); removed {
			updated = stripped
			modified = true
		}
		if !modified {
			continue
		}
		// If the file is now empty (or just whitespace), delete it — it was
		// purely Belmont's content. Otherwise rewrite with the section gone.
		if strings.TrimSpace(updated) == "" {
			if err := os.Remove(path); err == nil {
				announce()
				fmt.Printf("  - %s (file held only Belmont section, removed)\n", file)
			}
		} else {
			if err := os.WriteFile(path, []byte(strings.TrimRight(updated, "\n")+"\n"), 0o644); err != nil {
				return fmt.Errorf("cleanup %s: %w", file, err)
			}
			announce()
			fmt.Printf("  - %s Belmont skill-routing section (legacy, removed)\n", file)
		}
	}

	if announced {
		fmt.Println("")
	}
	return nil
}

func runUpdate(args []string) error {
	fsFlags := flag.NewFlagSet("update", flag.ContinueOnError)
	fsFlags.SetOutput(io.Discard)
	var check bool
	var force bool
	var noCommit bool
	fsFlags.BoolVar(&check, "check", false, "check for updates without installing")
	fsFlags.BoolVar(&force, "force", false, "force update even if same version")
	fsFlags.BoolVar(&noCommit, "no-commit", false, "do not auto-commit Belmont-managed files after install")
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
		} else if noCommit {
			fmt.Println("\nSkipping auto-commit (--no-commit).")
			fmt.Println("To commit manually: git add .agents .claude/agents/belmont .claude/commands/belmont .opencode/command/belmont .cursor/rules/belmont .windsurf/rules/belmont AGENTS.md GEMINI.md && git commit -m \"Update Belmont to " + release.TagName + "\"")
		} else {
			if err := commitBelmontUpdate(".", release.TagName); err != nil {
				fmt.Fprintln(os.Stderr, err.Error())
			}
		}
	} else {
		fmt.Println("\nTo update skills in a project: cd ~/your-project && belmont install")
	}

	return nil
}

// commitBelmontUpdate stages and commits only Belmont-managed files after a
// successful self-update + auto-install. Unrelated user changes are left
// untouched. No-ops gracefully when the directory isn't a git repo or when
// nothing under the allow-list changed.
func commitBelmontUpdate(root, version string) error {
	// Skip silently if not in a git working tree.
	checkCmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	checkCmd.Dir = root
	out, err := checkCmd.Output()
	if err != nil || strings.TrimSpace(string(out)) != "true" {
		fmt.Println("\nSkipping auto-commit (not a git repository).")
		return nil
	}

	// Build the pathspec list. A path qualifies if it (a) exists on disk
	// (so changes/additions get staged) OR (b) is tracked by git but missing
	// (so a deletion gets staged — e.g. when this update removed a legacy
	// `.gemini/rules/belmont/` symlink that was previously committed).
	// `git add` errors on pathspecs that match neither, so we filter ahead of
	// time.
	trackedSet := make(map[string]struct{})
	{
		lsArgs := append([]string{"-C", root, "ls-files", "--"}, belmontManagedPaths...)
		lsOut, _ := exec.Command("git", lsArgs...).Output()
		for _, line := range strings.Split(strings.TrimSpace(string(lsOut)), "\n") {
			if line != "" {
				trackedSet[line] = struct{}{}
			}
		}
	}
	pathHasTrackedFiles := func(p string) bool {
		for tracked := range trackedSet {
			if tracked == p || strings.HasPrefix(tracked, p+"/") {
				return true
			}
		}
		return false
	}

	var existingPaths []string
	for _, p := range belmontManagedPaths {
		full := filepath.Join(root, p)
		onDisk := false
		if _, err := os.Lstat(full); err == nil {
			onDisk = true
		}
		if onDisk || pathHasTrackedFiles(p) {
			existingPaths = append(existingPaths, p)
		}
	}
	if len(existingPaths) == 0 {
		fmt.Println("\nNo Belmont-managed paths to commit.")
		return nil
	}

	// Stage only Belmont-managed paths. `-A` ensures deletions are picked up
	// (covers the case where this update removed a legacy directory).
	addArgs := append([]string{"add", "-A", "--"}, existingPaths...)
	addCmd := exec.Command("git", addArgs...)
	addCmd.Dir = root
	addCmd.Stderr = os.Stderr
	if err := addCmd.Run(); err != nil {
		return fmt.Errorf("auto-commit: git add failed: %w", err)
	}

	// Detect no-op: if nothing under the allow-list is staged, skip commit.
	diffArgs := append([]string{"diff", "--cached", "--quiet", "--"}, existingPaths...)
	diffCmd := exec.Command("git", diffArgs...)
	diffCmd.Dir = root
	if err := diffCmd.Run(); err == nil {
		fmt.Println("\nBelmont files already committed (no changes to commit).")
		return nil
	}

	// Commit with hooks enabled (no --no-verify). If a pre-commit hook fails,
	// leave the staged files in place — the user's hook may have auto-fixed
	// content that they'll want to keep before re-committing.
	//
	// Pathspec on `git commit` is critical: without it, `git commit` would
	// also sweep in any unrelated changes the user had previously staged.
	msg := fmt.Sprintf("Update Belmont to %s", version)
	commitArgs := append([]string{"commit", "-m", msg, "--"}, existingPaths...)
	commitCmd := exec.Command("git", commitArgs...)
	commitCmd.Dir = root
	commitCmd.Stdout = os.Stdout
	commitCmd.Stderr = os.Stderr
	if err := commitCmd.Run(); err != nil {
		var sb strings.Builder
		sb.WriteString("\n" + ansiYellow + "Auto-commit failed (likely a pre-commit hook)." + ansiReset + "\n")
		sb.WriteString("Belmont files are staged. Fix the issue and run:\n")
		sb.WriteString(fmt.Sprintf("  git commit -m %q\n", msg))
		sb.WriteString("Or skip auto-commit next time with: belmont update --no-commit")
		return errors.New(sb.String())
	}

	fmt.Printf("\n%s✓%s Committed Belmont update (%s)\n", ansiGreen, ansiReset, msg)
	return nil
}
