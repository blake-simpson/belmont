package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runGit is a test helper that runs git and returns stdout, failing the test
// on non-zero exit.
func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s in %s: %v\n%s", strings.Join(args, " "), dir, err, out)
	}
	return strings.TrimRight(string(out), "\n")
}

// setupRepo creates an empty git repo with an initial commit and the Belmont
// directory layout populated for the claude tool.
func setupRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGit(t, dir, "init", "-q")
	runGit(t, dir, "config", "user.email", "test@test.com")
	runGit(t, dir, "config", "user.name", "Test")
	runGit(t, dir, "config", "commit.gpgsign", "false")

	for _, p := range []string{
		".agents/belmont/codebase-agent.md",
		".agents/skills/belmont/implement.md",
		".claude/commands/belmont/implement.md",
		".opencode/command/belmont/implement.md",
	} {
		full := filepath.Join(dir, p)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("v1\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runGit(t, dir, "add", "-A")
	runGit(t, dir, "commit", "-q", "-m", "initial")
	return dir
}

func TestCommitBelmontUpdate_HappyPath(t *testing.T) {
	dir := setupRepo(t)

	// Simulate update rewriting Belmont files and the user having unrelated
	// staged work in progress.
	mustWrite(t, filepath.Join(dir, ".agents/belmont/codebase-agent.md"), "v2\n")
	mustWrite(t, filepath.Join(dir, ".agents/skills/belmont/implement.md"), "v2\n")
	mustWrite(t, filepath.Join(dir, ".opencode/command/belmont/implement.md"), "v2\n")
	mustWrite(t, filepath.Join(dir, "src/app.py"), "user code\n")
	runGit(t, dir, "add", "src/app.py")

	if err := commitBelmontUpdate(dir, "v0.99.0"); err != nil {
		t.Fatalf("commitBelmontUpdate: %v", err)
	}

	// The commit should contain ONLY Belmont files.
	files := runGit(t, dir, "diff", "--name-only", "HEAD~1", "HEAD")
	got := strings.Split(files, "\n")
	want := map[string]bool{
		".agents/belmont/codebase-agent.md":      true,
		".agents/skills/belmont/implement.md":    true,
		".opencode/command/belmont/implement.md": true,
	}
	for _, f := range got {
		if !want[f] {
			t.Errorf("unexpected file in commit: %s", f)
		}
		delete(want, f)
	}
	for f := range want {
		t.Errorf("missing file in commit: %s", f)
	}

	// The unrelated staged file should remain staged but uncommitted.
	status := runGit(t, dir, "status", "--porcelain")
	if !strings.Contains(status, "A  src/app.py") {
		t.Errorf("expected src/app.py to remain staged, got status:\n%s", status)
	}

	// Commit message format.
	msg := runGit(t, dir, "log", "-1", "--format=%s")
	if msg != "Update Belmont to v0.99.0" {
		t.Errorf("commit message = %q, want %q", msg, "Update Belmont to v0.99.0")
	}
}

func TestCommitBelmontUpdate_NoOpWhenUnchanged(t *testing.T) {
	dir := setupRepo(t)

	if err := commitBelmontUpdate(dir, "v0.99.0"); err != nil {
		t.Fatalf("commitBelmontUpdate: %v", err)
	}

	// No new commit should have been created.
	count := runGit(t, dir, "rev-list", "--count", "HEAD")
	if count != "1" {
		t.Errorf("commit count = %s, want 1 (no new commit)", count)
	}
}

func TestCommitBelmontUpdate_SkipsNonGitDir(t *testing.T) {
	dir := t.TempDir()
	// No git repo here.
	if err := commitBelmontUpdate(dir, "v0.99.0"); err != nil {
		t.Errorf("commitBelmontUpdate in non-git dir should return nil, got %v", err)
	}
}

func TestCommitBelmontUpdate_PreservesUnstagedUserWork(t *testing.T) {
	dir := setupRepo(t)

	// Simulate Belmont edits + user's unstaged change.
	mustWrite(t, filepath.Join(dir, ".agents/belmont/codebase-agent.md"), "v2\n")
	mustWrite(t, filepath.Join(dir, "src/notes.txt"), "user notes\n")

	if err := commitBelmontUpdate(dir, "v0.99.0"); err != nil {
		t.Fatalf("commitBelmontUpdate: %v", err)
	}

	// User's untracked file should remain untracked. Porcelain may report the
	// directory ("?? src/") rather than the file ("?? src/notes.txt"); accept
	// either, but verify the file is still on disk and not in the new commit.
	status := runGit(t, dir, "status", "--porcelain")
	if !strings.Contains(status, "?? src") {
		t.Errorf("expected src/notes.txt to remain untracked, got status:\n%s", status)
	}
	if _, err := os.Stat(filepath.Join(dir, "src/notes.txt")); err != nil {
		t.Errorf("expected src/notes.txt to still exist on disk, got: %v", err)
	}
	files := runGit(t, dir, "diff", "--name-only", "HEAD~1", "HEAD")
	if strings.Contains(files, "src/notes.txt") {
		t.Errorf("did not expect src/notes.txt in commit, got:\n%s", files)
	}
}

func TestRequireCleanWorkingTree_BlocksOnDirty(t *testing.T) {
	dir := setupRepo(t)
	mustWrite(t, filepath.Join(dir, ".agents/belmont/codebase-agent.md"), "dirty\n")

	err := requireCleanWorkingTree(dir)
	if err == nil {
		t.Fatal("expected error for dirty tree, got nil")
	}
	if !strings.Contains(err.Error(), "working tree is not clean") {
		t.Errorf("error missing expected header: %v", err)
	}
	if !strings.Contains(err.Error(), "Looks like a recent `belmont update`") {
		t.Errorf("expected Belmont-update-aware hint when belmont path is dirty, got:\n%s", err.Error())
	}
}

func TestRequireCleanWorkingTree_PassesWhenClean(t *testing.T) {
	dir := setupRepo(t)
	if err := requireCleanWorkingTree(dir); err != nil {
		t.Errorf("expected nil for clean tree, got: %v", err)
	}
}

func TestRequireCleanWorkingTree_GenericHintForNonBelmontDirty(t *testing.T) {
	dir := setupRepo(t)
	mustWrite(t, filepath.Join(dir, "src/app.py"), "user\n")

	err := requireCleanWorkingTree(dir)
	if err == nil {
		t.Fatal("expected error for dirty tree, got nil")
	}
	if strings.Contains(err.Error(), "Looks like a recent `belmont update`") {
		t.Errorf("did not expect belmont-update hint for non-belmont dirty file, got:\n%s", err.Error())
	}
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestCommitBelmontUpdate_StagesDeletionOfLegacyPath(t *testing.T) {
	dir := setupRepo(t)

	// Add a legacy `.gemini/rules/belmont/` dir to the initial commit so it's
	// tracked, then delete it (mimicking what runLegacyCleanup would do during
	// a Phase 1 → Phase 2 upgrade).
	mustWrite(t, filepath.Join(dir, ".gemini/rules/belmont/foo.md"), "legacy\n")
	runGit(t, dir, "add", ".gemini/rules/belmont/foo.md")
	runGit(t, dir, "commit", "-q", "-m", "add legacy")
	if err := os.RemoveAll(filepath.Join(dir, ".gemini/rules/belmont")); err != nil {
		t.Fatal(err)
	}

	if err := commitBelmontUpdate(dir, "v0.99.0"); err != nil {
		t.Fatalf("commitBelmontUpdate: %v", err)
	}

	// The deletion of the legacy file should be in the new commit.
	files := runGit(t, dir, "diff", "--name-only", "--diff-filter=D", "HEAD~1", "HEAD")
	if !strings.Contains(files, ".gemini/rules/belmont/foo.md") {
		t.Errorf("expected legacy file deletion in commit, got:\n%s", files)
	}
}

func TestRunLegacyCleanup_RemovesLegacyDirsAndAgentsSection(t *testing.T) {
	dir := setupRepo(t)

	// Plant several legacy artifacts that older Belmont versions would have
	// created.
	mustWrite(t, filepath.Join(dir, ".codex/belmont/old.md"), "legacy\n")
	mustWrite(t, filepath.Join(dir, ".cursor/rules/belmont/old.mdc"), "legacy\n")
	mustWrite(t, filepath.Join(dir, ".windsurf/rules/belmont/old.md"), "legacy\n")
	mustWrite(t, filepath.Join(dir, ".gemini/rules/belmont/old.md"), "legacy\n")
	mustWrite(t, filepath.Join(dir, ".copilot/belmont/old.md"), "legacy\n")
	mustWrite(t, filepath.Join(dir, ".agents/skills/belmont/implement.md"), "stale flat skill\n")
	mustWrite(t, filepath.Join(dir, ".agents/skills/belmont/references/old-ref.md"), "stale ref\n")
	// .claude/skills/belmont — installed by Belmont 0.10.x, never discovered
	// by Claude Code 2.1.x because its skill discovery is single-level only.
	// .claude/plugins/belmont — short-lived attempt that also failed
	// (Claude Code does not auto-load project-local plugins). Both must be
	// cleaned up so they don't sit dead in users' projects after upgrade.
	mustWrite(t, filepath.Join(dir, ".claude/skills/belmont/implement/SKILL.md"), "stale nested skill\n")
	mustWrite(t, filepath.Join(dir, ".claude/plugins/belmont/.claude-plugin/plugin.json"), `{"name":"belmont"}`)

	agentsContent := "# AGENTS\n\nUser stuff here.\n\n" +
		belmontAgentsSectionStart + "\n## Belmont section\nlegacy\n" + belmontAgentsSectionEnd + "\n\nMore user stuff.\n"
	mustWrite(t, filepath.Join(dir, "AGENTS.md"), agentsContent)
	mustWrite(t, filepath.Join(dir, "GEMINI.md"),
		belmontGeminiSectionStart+"\n@.agents/skills/belmont/implement.md\n"+belmontGeminiSectionEnd+"\n")

	if err := runLegacyCleanup(dir); err != nil {
		t.Fatalf("runLegacyCleanup: %v", err)
	}

	for _, removed := range []string{
		".codex/belmont", ".cursor/rules/belmont", ".windsurf/rules/belmont",
		".gemini/rules/belmont", ".copilot/belmont",
		".claude/skills/belmont",  // never discovered (single-level scan)
		".claude/plugins/belmont", // never auto-loaded (requires --plugin-dir or marketplace)
	} {
		if _, err := os.Stat(filepath.Join(dir, removed)); err == nil {
			t.Errorf("expected %s to be removed", removed)
		}
	}
	// Stale flat skill file under .agents/skills/belmont/ should be gone.
	if _, err := os.Stat(filepath.Join(dir, ".agents/skills/belmont/implement.md")); err == nil {
		t.Errorf("expected stale flat skill to be removed")
	}
	// Top-level references/ dir should be gone.
	if _, err := os.Stat(filepath.Join(dir, ".agents/skills/belmont/references")); err == nil {
		t.Errorf("expected stale top-level references/ to be removed")
	}

	// AGENTS.md preserves user content but loses the Belmont section.
	updated, err := os.ReadFile(filepath.Join(dir, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(updated), belmontAgentsSectionStart) {
		t.Errorf("AGENTS.md still contains Belmont marker: %s", updated)
	}
	if !strings.Contains(string(updated), "User stuff here.") || !strings.Contains(string(updated), "More user stuff.") {
		t.Errorf("AGENTS.md user content lost: %s", updated)
	}

	// GEMINI.md held only Belmont content, so the file should be deleted.
	if _, err := os.Stat(filepath.Join(dir, "GEMINI.md")); err == nil {
		t.Errorf("expected GEMINI.md (Belmont-only) to be deleted")
	}
}

func TestLinkClaudeCommands_SymlinksPerSkill(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "---\nname: implement\ndescription: x\n---\nbody\n")
	mustWrite(t, filepath.Join(skillsTarget, "verify/SKILL.md"), "---\nname: verify\ndescription: y\n---\nbody\n")
	// A directory without SKILL.md should be skipped (e.g. _src/ would be).
	if err := os.MkdirAll(filepath.Join(skillsTarget, "_src"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := linkClaudeCommands(dir, skillsTarget, nil); err != nil {
		t.Fatalf("linkClaudeCommands: %v", err)
	}

	// Per-skill symlinks at .claude/commands/belmont/<skill>.md must exist
	// and resolve to the source SKILL.md (so /belmont:<skill> registers in
	// Claude Code 2.1.x and the references/ subdir resolves through the
	// symlink target).
	for _, skill := range []string{"implement", "verify"} {
		linkPath := filepath.Join(dir, ".claude/commands/belmont", skill+".md")
		st, err := os.Lstat(linkPath)
		if err != nil {
			t.Fatalf("expected slash-command symlink for %s, got: %v", skill, err)
		}
		if st.Mode()&os.ModeSymlink == 0 {
			t.Errorf("%s should be a symlink, not a regular file", linkPath)
		}
		// Resolve and confirm target points at the SKILL.md.
		resolved, err := filepath.EvalSymlinks(linkPath)
		if err != nil {
			t.Errorf("resolving %s: %v", linkPath, err)
		}
		expected := filepath.Join(skillsTarget, skill, "SKILL.md")
		expectedAbs, _ := filepath.EvalSymlinks(expected)
		if resolved != expectedAbs && resolved != expected {
			t.Errorf("symlink resolves to %q, want %q", resolved, expected)
		}
	}

	// Skipping skills without SKILL.md (e.g. _src/) — no _src.md should exist.
	if _, err := os.Lstat(filepath.Join(dir, ".claude/commands/belmont/_src.md")); err == nil {
		t.Errorf("_src/ has no SKILL.md but a slash command was created anyway")
	}
}

func TestLinkClaudeCommands_PrunesStaleEntries(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "body\n")

	// Plant a stale .md from a previous install (e.g., a renamed/removed skill).
	mustWrite(t, filepath.Join(dir, ".claude/commands/belmont/old-skill.md"), "stale\n")

	if err := linkClaudeCommands(dir, skillsTarget, nil); err != nil {
		t.Fatalf("linkClaudeCommands: %v", err)
	}

	if _, err := os.Lstat(filepath.Join(dir, ".claude/commands/belmont/old-skill.md")); err == nil {
		t.Errorf("expected stale slash-command file to be pruned")
	}
	if _, err := os.Lstat(filepath.Join(dir, ".claude/commands/belmont/implement.md")); err != nil {
		t.Errorf("expected current slash-command symlink to exist: %v", err)
	}
}

func TestLinkClaudeCommands_WritesOffSurfaceSkillAsRealFile(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "---\nname: implement\ndescription: x\n---\nbody\n")

	loopContent := "---\nname: loop\ndescription: drive a feature\n---\nloop body\n"
	extra := map[string]string{"loop": loopContent}

	if err := linkClaudeCommands(dir, skillsTarget, extra); err != nil {
		t.Fatalf("linkClaudeCommands: %v", err)
	}

	// The shared skill is a symlink.
	implPath := filepath.Join(dir, ".claude/commands/belmont/implement.md")
	if st, err := os.Lstat(implPath); err != nil || st.Mode()&os.ModeSymlink == 0 {
		t.Errorf("implement.md should be a symlink, got %v / err %v", st.Mode(), err)
	}

	// The off-surface skill is a REAL file (not a symlink) with the supplied
	// content because it has no .agents/skills/belmont/loop/ target to point at.
	loopPath := filepath.Join(dir, ".claude/commands/belmont/loop.md")
	st, err := os.Lstat(loopPath)
	if err != nil {
		t.Fatalf("expected loop.md command file: %v", err)
	}
	if st.Mode()&os.ModeSymlink != 0 {
		t.Errorf("loop.md must be a real file, not a symlink")
	}
	got, err := os.ReadFile(loopPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != loopContent {
		t.Errorf("loop.md content = %q, want %q", got, loopContent)
	}

	// loop must NOT be synced into the shared .agents/skills/ surface (other
	// CLIs would discover it there). The test only planted implement/, so
	// confirm linkClaudeCommands didn't create a loop skill folder.
	if _, err := os.Stat(filepath.Join(skillsTarget, "loop", "SKILL.md")); err == nil {
		t.Errorf("loop must not appear under .agents/skills/belmont/")
	}

	// Re-running is idempotent and the off-surface file survives the prune.
	if err := linkClaudeCommands(dir, skillsTarget, extra); err != nil {
		t.Fatalf("second linkClaudeCommands: %v", err)
	}
	if _, err := os.Lstat(loopPath); err != nil {
		t.Errorf("loop.md should survive re-run prune: %v", err)
	}
}

func TestResolveSharedSurfaceSkills(t *testing.T) {
	cases := []struct {
		name     string
		tools    []string
		existing bool // loop/ already installed in the target
		want     bool
	}{
		{"cursor only, fresh", []string{"cursor"}, false, false},
		{"codex publishes", []string{"codex"}, false, true},
		// Claude runs loop, but off-surface as a real command file — selecting
		// it must not expose loop to the seven other CLIs reading the same dir.
		{"claude alone does not publish", []string{"claude"}, false, false},
		{"claude plus codex", []string{"claude", "codex"}, false, true},
		{"no tools, fresh", nil, false, false},
		// Stickiness: an installed copy is evidence a publishing tool was
		// selected at some point, on some machine. Without this, `belmont
		// update` (which resolves --tools all to *detected* tools) would prune
		// loop/ on a machine with no codex on PATH, commit the removal, and
		// flap it back on the next update from a Codex machine.
		{"cursor keeps an installed copy", []string{"cursor"}, true, true},
		{"no tools keeps an installed copy", nil, true, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			target := t.TempDir()
			if tc.existing {
				mustWrite(t, filepath.Join(target, "loop/SKILL.md"), "---\nname: loop\n---\nbody\n")
			}
			got := resolveSharedSurfaceSkills(target, tc.tools)
			if got["loop"] != tc.want {
				t.Errorf("resolveSharedSurfaceSkills(%v, existing=%v)[loop] = %v, want %v", tc.tools, tc.existing, got["loop"], tc.want)
			}
			// Unconditional skills are never gated.
			if !skillVisibleOnSharedSurface("implement", got) {
				t.Errorf("implement must always be visible on the shared surface")
			}
		})
	}
}

func TestSyncSkillsFolderDir_HidesLoopWithoutCodex(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	mustWrite(t, filepath.Join(src, "implement/SKILL.md"), "---\nname: implement\n---\nbody\n")
	mustWrite(t, filepath.Join(src, "loop/SKILL.md"), "---\nname: loop\n---\nbody\n")

	if err := syncSkillsFolderDir(src, dst, resolveSharedSurfaceSkills(dst, []string{"cursor"})); err != nil {
		t.Fatalf("syncSkillsFolderDir: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dst, "implement/SKILL.md")); err != nil {
		t.Errorf("implement should be synced: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "loop/SKILL.md")); err == nil {
		t.Errorf("loop must be skipped on a fresh install for tools that cannot run it")
	}
}

// A copy already on the shared surface survives an install from a machine that
// cannot detect a publishing tool — and is refreshed from source rather than
// left stale. This is the `belmont update` git-flap regression: update re-runs
// `install --no-prompt --tools all`, which resolves to *detected* tools.
func TestSyncSkillsFolderDir_KeepsInstalledLoopWithoutCodex(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	mustWrite(t, filepath.Join(src, "implement/SKILL.md"), "---\nname: implement\n---\nbody\n")
	mustWrite(t, filepath.Join(src, "loop/SKILL.md"), "---\nname: loop\n---\nnew body\n")
	// A Codex teammate committed this; this machine has no codex on PATH.
	mustWrite(t, filepath.Join(dst, "loop/SKILL.md"), "old body\n")

	if err := syncSkillsFolderDir(src, dst, resolveSharedSurfaceSkills(dst, []string{"cursor"})); err != nil {
		t.Fatalf("syncSkillsFolderDir: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "loop/SKILL.md"))
	if err != nil {
		t.Fatalf("installed loop copy must survive a non-publishing install: %v", err)
	}
	if string(got) != "---\nname: loop\n---\nnew body\n" {
		t.Errorf("installed loop copy should be refreshed from source, got %q", got)
	}
}

func TestSyncSkillsFolderDir_InstallsLoopForCodex(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	mustWrite(t, filepath.Join(src, "implement/SKILL.md"), "---\nname: implement\n---\nbody\n")
	mustWrite(t, filepath.Join(src, "loop/SKILL.md"), "---\nname: loop\n---\nbody\n")

	if err := syncSkillsFolderDir(src, dst, resolveSharedSurfaceSkills(dst, []string{"codex"})); err != nil {
		t.Fatalf("syncSkillsFolderDir: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dst, "implement/SKILL.md")); err != nil {
		t.Errorf("implement should be synced: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "loop/SKILL.md")); err != nil {
		t.Errorf("loop should be synced for Codex installs: %v", err)
	}
}

func TestLinkOpencodeCommands_GeneratesWrapperPerSkill(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "---\nname: implement\ndescription: Implement the next milestone\n---\nbody\n")
	mustWrite(t, filepath.Join(skillsTarget, "verify/SKILL.md"), "---\nname: verify\ndescription: Run verification\n---\nbody\n")

	if err := linkOpencodeCommands(dir, skillsTarget); err != nil {
		t.Fatalf("linkOpencodeCommands: %v", err)
	}

	// Per-skill wrapper files at .opencode/command/belmont/<skill>.md —
	// opencode registers each as a /belmont/<skill> slash command
	// (path-relative-to-command/ naming). They must be regular files, NOT
	// symlinks to SKILL.md: opencode builds command config as
	// {name, ...frontmatter, template}, so SKILL.md's `name:` key would
	// override the path-derived name and register the command as bare
	// "implement" instead of "belmont/implement".
	for _, skill := range []string{"implement", "verify"} {
		cmdPath := filepath.Join(dir, ".opencode/command/belmont", skill+".md")
		st, err := os.Lstat(cmdPath)
		if err != nil {
			t.Fatalf("expected wrapper command file for %s, got: %v", skill, err)
		}
		if st.Mode()&os.ModeSymlink != 0 {
			t.Errorf("%s must be a regular file, not a symlink (SKILL.md name: would override the command name)", cmdPath)
		}
		data, err := os.ReadFile(cmdPath)
		if err != nil {
			t.Fatalf("reading %s: %v", cmdPath, err)
		}
		content := string(data)
		if strings.Contains(content, "\nname:") || strings.HasPrefix(content, "name:") {
			t.Errorf("%s frontmatter must not carry a name: key:\n%s", cmdPath, content)
		}
		if !strings.Contains(content, "description: ") {
			t.Errorf("%s should carry the skill description:\n%s", cmdPath, content)
		}
		want := "Read .agents/skills/belmont/" + skill + "/SKILL.md fully"
		if !strings.Contains(content, want) {
			t.Errorf("%s body should delegate to the canonical SKILL.md (%q):\n%s", cmdPath, want, content)
		}
		if !strings.Contains(content, "$ARGUMENTS") {
			t.Errorf("%s body should pass through $ARGUMENTS:\n%s", cmdPath, content)
		}
	}

	// Idempotency: a second run must leave content unchanged.
	before, _ := os.ReadFile(filepath.Join(dir, ".opencode/command/belmont/implement.md"))
	if err := linkOpencodeCommands(dir, skillsTarget); err != nil {
		t.Fatalf("second linkOpencodeCommands: %v", err)
	}
	after, _ := os.ReadFile(filepath.Join(dir, ".opencode/command/belmont/implement.md"))
	if string(before) != string(after) {
		t.Errorf("wrapper content changed on idempotent re-run")
	}
}

// A `--tools codex,opencode` install puts loop on the shared surface, but
// opencode has no /loop or /goal to delegate to — so it must not get a
// first-class `/belmont/loop` command, and any stale one is pruned.
func TestLinkOpencodeCommands_SkipsSkillsOpencodeCannotRun(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "---\nname: implement\ndescription: x\n---\nbody\n")
	mustWrite(t, filepath.Join(skillsTarget, "loop/SKILL.md"), "---\nname: loop\ndescription: drive a feature\n---\nbody\n")
	// Stale command from an install made before the filter existed.
	mustWrite(t, filepath.Join(dir, ".opencode/command/belmont/loop.md"), "stale\n")

	if err := linkOpencodeCommands(dir, skillsTarget); err != nil {
		t.Fatalf("linkOpencodeCommands: %v", err)
	}

	if _, err := os.Lstat(filepath.Join(dir, ".opencode/command/belmont/loop.md")); err == nil {
		t.Errorf("opencode must not carry a /belmont/loop command — it cannot run loop")
	}
	if _, err := os.Lstat(filepath.Join(dir, ".opencode/command/belmont/implement.md")); err != nil {
		t.Errorf("runnable skills should still get a command: %v", err)
	}
}

// The mirror: Claude CAN run loop, so when a co-selected Codex install put it
// on the shared surface, Claude gets the normal symlink (no off-surface file).
func TestLinkClaudeCommands_LinksLoopWhenOnSharedSurface(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "loop/SKILL.md"), "---\nname: loop\ndescription: drive a feature\n---\nbody\n")

	if err := linkClaudeCommands(dir, skillsTarget, nil); err != nil {
		t.Fatalf("linkClaudeCommands: %v", err)
	}

	st, err := os.Lstat(filepath.Join(dir, ".claude/commands/belmont/loop.md"))
	if err != nil {
		t.Fatalf("expected /belmont:loop command: %v", err)
	}
	if st.Mode()&os.ModeSymlink == 0 {
		t.Errorf("loop.md should be a symlink when loop is on the shared surface")
	}
}

func TestLinkOpencodeCommands_ReplacesLegacySymlink(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	skillFile := filepath.Join(skillsTarget, "implement/SKILL.md")
	skillBody := "---\nname: implement\ndescription: x\n---\nbody\n"
	mustWrite(t, skillFile, skillBody)

	// Simulate an older install that symlinked SKILL.md directly.
	cmdPath := filepath.Join(dir, ".opencode/command/belmont/implement.md")
	if err := os.MkdirAll(filepath.Dir(cmdPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(skillFile, cmdPath); err != nil {
		t.Fatal(err)
	}

	if err := linkOpencodeCommands(dir, skillsTarget); err != nil {
		t.Fatalf("linkOpencodeCommands: %v", err)
	}

	st, err := os.Lstat(cmdPath)
	if err != nil {
		t.Fatalf("expected wrapper command file, got: %v", err)
	}
	if st.Mode()&os.ModeSymlink != 0 {
		t.Errorf("legacy symlink should have been replaced with a regular file")
	}
	// The canonical SKILL.md must NOT have been written through the symlink.
	data, err := os.ReadFile(skillFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != skillBody {
		t.Errorf("SKILL.md was corrupted by writing through the legacy symlink:\n%s", data)
	}
}

func TestLinkOpencodeCommands_PrunesStaleEntries(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "body\n")

	mustWrite(t, filepath.Join(dir, ".opencode/command/belmont/old-skill.md"), "stale\n")

	if err := linkOpencodeCommands(dir, skillsTarget); err != nil {
		t.Fatalf("linkOpencodeCommands: %v", err)
	}

	if _, err := os.Lstat(filepath.Join(dir, ".opencode/command/belmont/old-skill.md")); err == nil {
		t.Errorf("expected stale slash-command file to be pruned")
	}
	if _, err := os.Lstat(filepath.Join(dir, ".opencode/command/belmont/implement.md")); err != nil {
		t.Errorf("expected current slash-command symlink to exist: %v", err)
	}
}

func TestWriteCodexSkillInterfaces_GeneratesYamlPerSkill(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "---\nname: implement\ndescription: Implement the next milestone\n---\nbody\n")
	mustWrite(t, filepath.Join(skillsTarget, "verify/SKILL.md"), "---\nname: verify\ndescription: Run verification\n---\nbody\n")
	// Scaffolding dir and a non-skill dir must be skipped.
	mustWrite(t, filepath.Join(skillsTarget, "_src/implement.md"), "src\n")
	if err := os.MkdirAll(filepath.Join(skillsTarget, "not-a-skill"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := writeCodexSkillInterfaces(skillsTarget); err != nil {
		t.Fatalf("writeCodexSkillInterfaces: %v", err)
	}

	// Per-skill agents/openai.yaml with a belmont:-prefixed display_name —
	// Codex's $-mention popup fuzzy-matches interface.display_name, so the
	// shared prefix is what makes "$belmont" list every skill.
	for _, skill := range []string{"implement", "verify"} {
		yamlPath := filepath.Join(skillsTarget, skill, "agents/openai.yaml")
		data, err := os.ReadFile(yamlPath)
		if err != nil {
			t.Fatalf("expected openai.yaml for %s, got: %v", skill, err)
		}
		content := string(data)
		if !strings.Contains(content, "interface:") {
			t.Errorf("%s missing interface: block:\n%s", yamlPath, content)
		}
		want := "display_name: \"belmont:" + skill + "\""
		if !strings.Contains(content, want) {
			t.Errorf("%s should carry %q:\n%s", yamlPath, want, content)
		}
	}

	if _, err := os.Stat(filepath.Join(skillsTarget, "_src/agents/openai.yaml")); err == nil {
		t.Errorf("_src/ is scaffolding, not a skill — no openai.yaml should be written")
	}
	if _, err := os.Stat(filepath.Join(skillsTarget, "not-a-skill/agents/openai.yaml")); err == nil {
		t.Errorf("dir without SKILL.md must not get an openai.yaml")
	}

	// Idempotency: a second run must leave content unchanged.
	before, _ := os.ReadFile(filepath.Join(skillsTarget, "implement/agents/openai.yaml"))
	if err := writeCodexSkillInterfaces(skillsTarget); err != nil {
		t.Fatalf("second writeCodexSkillInterfaces: %v", err)
	}
	after, _ := os.ReadFile(filepath.Join(skillsTarget, "implement/agents/openai.yaml"))
	if string(before) != string(after) {
		t.Errorf("openai.yaml content changed on idempotent re-run")
	}
}

func TestWriteCodexSkillInterfaces_RewritesOutdatedContent(t *testing.T) {
	dir := t.TempDir()
	skillsTarget := filepath.Join(dir, ".agents/skills/belmont")
	mustWrite(t, filepath.Join(skillsTarget, "implement/SKILL.md"), "body\n")
	// Plant stale metadata from an older Belmont version (e.g. a different
	// display-name scheme).
	mustWrite(t, filepath.Join(skillsTarget, "implement/agents/openai.yaml"), "interface:\n  display_name: \"old-name\"\n")

	if err := writeCodexSkillInterfaces(skillsTarget); err != nil {
		t.Fatalf("writeCodexSkillInterfaces: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(skillsTarget, "implement/agents/openai.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "display_name: \"belmont:implement\"") {
		t.Errorf("outdated openai.yaml should be rewritten to the current scheme:\n%s", data)
	}
}

func TestDetectTools_PiMarkerDir(t *testing.T) {
	dir := t.TempDir()
	// Plant the .pi/ marker dir to simulate a project that's used Pi before.
	if err := os.MkdirAll(filepath.Join(dir, ".pi"), 0o755); err != nil {
		t.Fatal(err)
	}

	got := detectTools(dir)
	found := false
	for _, tool := range got {
		if tool == "pi" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected detectTools(%s) to include 'pi' due to .pi/ marker, got: %v", dir, got)
	}
}

func TestRunLegacyCleanup_Idempotent(t *testing.T) {
	dir := setupRepo(t)

	// First run on a fresh repo with nothing legacy to clean — should be a no-op.
	if err := runLegacyCleanup(dir); err != nil {
		t.Fatalf("runLegacyCleanup #1: %v", err)
	}
	if err := runLegacyCleanup(dir); err != nil {
		t.Fatalf("runLegacyCleanup #2: %v", err)
	}
}

func TestDetectTools_OpencodeMarkerDir(t *testing.T) {
	dir := t.TempDir()
	// Plant the .opencode/ marker dir to simulate a project that's used
	// opencode before.
	if err := os.MkdirAll(filepath.Join(dir, ".opencode"), 0o755); err != nil {
		t.Fatal(err)
	}

	got := detectTools(dir)
	found := false
	for _, tool := range got {
		if tool == "opencode" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected detectTools(%s) to include 'opencode' due to .opencode/ marker, got: %v", dir, got)
	}
}

func TestDetectTools_OpencodeJSONFallback(t *testing.T) {
	// opencode projects often carry only a root opencode.json(c) — the
	// .opencode/ directory is optional, so the config file alone must count
	// as a detection signal.
	for _, name := range []string{"opencode.json", "opencode.jsonc"} {
		dir := t.TempDir()
		mustWrite(t, filepath.Join(dir, name), "{}\n")

		got := detectTools(dir)
		found := false
		for _, tool := range got {
			if tool == "opencode" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected detectTools(%s) to include 'opencode' due to %s, got: %v", dir, name, got)
		}
	}
}
