#!/bin/bash
set -e

# belmont install script
#
# Usage:
#   ./bin/install.sh          First-time setup (creates belmont-install command)
#   belmont-install            Install belmont into current project
#
# Agent-agnostic: works with Claude Code, Codex, Cursor, Windsurf, Gemini, and others.
# Agents and skills are installed to .agents/ (shared across tools).
# Each AI tool gets a symlink from its native directory into .agents/skills/.

# Resolve script location (follow symlinks)
SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
    SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    [[ $SCRIPT_PATH != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
BELMONT_DIR="$(dirname "$SCRIPT_DIR")"

# ============================================================
# Detect mode: global setup vs per-project install
# ============================================================

if [ "$(cd "$(pwd)" && pwd)" = "$(cd "$BELMONT_DIR" && pwd)" ] || [ "$1" = "--setup" ]; then
    # ========================================
    # GLOBAL SETUP MODE
    # ========================================
    echo "Belmont CLI Setup"
    echo "================="
    echo ""
    echo "Belmont directory: $BELMONT_DIR"
    echo ""

    BIN_DIR="$HOME/.local/bin"

    if [ ! -d "$BIN_DIR" ]; then
        echo "Creating $BIN_DIR..."
        mkdir -p "$BIN_DIR"
    fi

    LINK_PATH="$BIN_DIR/belmont-install"
    if [ -L "$LINK_PATH" ]; then
        echo "Updating: belmont-install"
        rm "$LINK_PATH"
    elif [ -e "$LINK_PATH" ]; then
        echo "Warning: $LINK_PATH exists and is not a symlink, skipping"
        exit 1
    else
        echo "Creating: belmont-install"
    fi

    ln -s "$BELMONT_DIR/bin/install.sh" "$LINK_PATH"

    echo ""
    echo "Setup complete!"

    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo ""
        echo "Note: $BIN_DIR is not in your PATH."
        echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
        echo ""
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi

    echo ""
    echo "Next steps:"
    echo "  cd ~/your-project"
    echo "  belmont-install"
    echo ""
    exit 0
fi

# ========================================
# PER-PROJECT INSTALL MODE
# ========================================

echo "Belmont Project Setup"
echo "====================="
echo ""
echo "Project: $(pwd)"
echo ""

# Verify belmont source exists
if [ ! -d "$BELMONT_DIR/skills" ] || [ ! -d "$BELMONT_DIR/agents" ]; then
    echo "Error: Cannot find belmont source files at $BELMONT_DIR"
    echo "Expected directories: skills/ and agents/"
    exit 1
fi

# --- Detect AI tools ---
DETECTED=()
DETECTED_LABELS=()

if [ -d ".claude" ]; then
    DETECTED+=("claude")
    DETECTED_LABELS+=("Claude Code (.claude/)")
fi
if [ -d ".codex" ]; then
    DETECTED+=("codex")
    DETECTED_LABELS+=("Codex (.codex/)")
fi
if [ -d ".cursor" ]; then
    DETECTED+=("cursor")
    DETECTED_LABELS+=("Cursor (.cursor/)")
fi
if [ -d ".windsurf" ]; then
    DETECTED+=("windsurf")
    DETECTED_LABELS+=("Windsurf (.windsurf/)")
fi
if [ -d ".gemini" ]; then
    DETECTED+=("gemini")
    DETECTED_LABELS+=("Gemini (.gemini/)")
fi
# Codex / Copilot
if [ -d ".github" ]; then
    DETECTED+=("copilot")
    DETECTED_LABELS+=("GitHub Copilot (.github/)")
fi

SELECTED_TOOLS=()

if [ ${#DETECTED[@]} -gt 0 ]; then
    echo "Detected AI tools:"
    for i in "${!DETECTED[@]}"; do
        echo "  [$((i+1))] ${DETECTED_LABELS[$i]}"
    done
    echo ""
    echo "Install skills for:"
    echo "  [a] All detected tools"
    for i in "${!DETECTED[@]}"; do
        echo "  [$((i+1))] ${DETECTED_LABELS[$i]} only"
    done
    echo "  [s] Skip (install agents only)"
    echo ""
    read -p "Choice [a]: " -r TOOL_CHOICE
    echo ""

    if [[ "$TOOL_CHOICE" =~ ^[Ss]$ ]]; then
        SELECTED_TOOLS=()
    elif [[ "$TOOL_CHOICE" =~ ^[0-9]+$ ]] && [ "$TOOL_CHOICE" -ge 1 ] && [ "$TOOL_CHOICE" -le ${#DETECTED[@]} ]; then
        SELECTED_TOOLS=("${DETECTED[$((TOOL_CHOICE-1))]}")
    else
        # Default: all detected
        SELECTED_TOOLS=("${DETECTED[@]}")
    fi
else
    echo "No AI tool directories detected."
    echo ""
    echo "Which tool are you using?"
    echo "  [1] Claude Code"
    echo "  [2] Codex"
    echo "  [3] Cursor"
    echo "  [4] Windsurf"
    echo "  [5] Gemini"
    echo "  [6] GitHub Copilot"
    echo "  [s] Skip (install agents only - reference files manually)"
    echo ""
    read -p "Choice: " -r TOOL_CHOICE
    echo ""

    case "$TOOL_CHOICE" in
        1) SELECTED_TOOLS=("claude") ;;
        2) SELECTED_TOOLS=("codex") ;;
        3) SELECTED_TOOLS=("cursor") ;;
        4) SELECTED_TOOLS=("windsurf") ;;
        5) SELECTED_TOOLS=("gemini") ;;
        6) SELECTED_TOOLS=("copilot") ;;
        [Ss]) SELECTED_TOOLS=() ;;
        *)
            echo "Invalid choice. Installing agents only."
            SELECTED_TOOLS=()
            ;;
    esac
fi

# ============================================================
# Helpers
# ============================================================

# Sync a source directory to a target directory.
# Copies new/changed files, removes files no longer in source (handles renames).
sync_directory() {
    local source_dir="$1"
    local target_dir="$2"

    mkdir -p "$target_dir"

    # Collect source file basenames
    local -a source_files=()
    for src in "$source_dir"/*.md; do
        [ -f "$src" ] || continue
        source_files+=("$(basename "$src")")
    done

    # Copy new/updated files
    for filename in "${source_files[@]}"; do
        local src="$source_dir/$filename"
        local dest="$target_dir/$filename"
        if [ -f "$dest" ]; then
            if cmp -s "$src" "$dest"; then
                echo "  = $filename (unchanged)"
            else
                echo "  ~ $filename (updated)"
                cp "$src" "$dest"
            fi
        else
            echo "  + $filename"
            cp "$src" "$dest"
        fi
    done

    # Remove stale files (handles renames/deletions from source)
    for existing in "$target_dir"/*.md; do
        [ -f "$existing" ] || continue
        local name
        name="$(basename "$existing")"
        local found=false
        for sf in "${source_files[@]}"; do
            [ "$sf" = "$name" ] && found=true && break
        done
        if ! $found; then
            echo "  - $name (removed, no longer in source)"
            rm "$existing"
        fi
    done
}

# Ensure a symlink exists and points to the correct target.
# If a real directory exists (from a previous non-symlink install), replaces it.
ensure_symlink() {
    local link_path="$1"
    local target="$2"

    mkdir -p "$(dirname "$link_path")"

    if [ -L "$link_path" ]; then
        local current
        current="$(readlink "$link_path")"
        if [ "$current" = "$target" ]; then
            echo "  = $link_path (symlink ok)"
            return 0
        else
            echo "  ~ $link_path (updating symlink)"
            rm "$link_path"
        fi
    elif [ -d "$link_path" ]; then
        echo "  ~ $link_path (replacing old directory with symlink)"
        rm -rf "$link_path"
    elif [ -e "$link_path" ]; then
        echo "  ! $link_path exists and is not a symlink or directory, skipping"
        return 1
    fi

    ln -s "$target" "$link_path"
    echo "  + $link_path -> $target"
    return 0
}

# Set up tool integration via symlinks from the tool's native directory
# into .agents/skills/belmont/.
setup_tool() {
    local tool="$1"

    case "$tool" in
        claude)
            echo "Linking Claude Code..."
            mkdir -p ".claude/agents"
            mkdir -p ".claude/agents/belmont"
            ensure_symlink ".claude/agents/belmont" "../../.agents/skills/belmont"
            ;;
        codex)
            echo "Linking Codex..."
            mkdir -p ".codex"
            ensure_symlink ".codex/belmont" "../.agents/skills/belmont"
            ;;
        cursor)
            echo "Linking Cursor..."
            # Cursor requires .mdc extension -- create per-file symlinks
            local cursor_dir=".cursor/rules/belmont"
            mkdir -p "$cursor_dir"

            local -a source_names=()
            for src in ".agents/skills/belmont"/*.md; do
                [ -f "$src" ] || continue
                local bn
                bn="$(basename "$src" .md)"
                source_names+=("$bn")
                ensure_symlink "$cursor_dir/${bn}.mdc" "../../../.agents/skills/belmont/${bn}.md"
            done

            # Remove stale cursor symlinks (handles renames)
            for existing in "$cursor_dir"/*.mdc; do
                [ -e "$existing" ] || [ -L "$existing" ] || continue
                local ebn
                ebn="$(basename "$existing" .mdc)"
                local found=false
                for sn in "${source_names[@]}"; do
                    [ "$sn" = "$ebn" ] && found=true && break
                done
                if ! $found; then
                    echo "  - ${ebn}.mdc (removed, no longer in source)"
                    rm "$existing"
                fi
            done
            ;;
        windsurf)
            echo "Linking Windsurf..."
            mkdir -p ".windsurf/rules"
            ensure_symlink ".windsurf/rules/belmont" "../../.agents/skills/belmont"
            ;;
        gemini)
            echo "Linking Gemini..."
            mkdir -p ".gemini/rules"
            ensure_symlink ".gemini/rules/belmont" "../../.agents/skills/belmont"
            ;;
        copilot)
            echo "Linking GitHub Copilot..."
            mkdir -p ".github"
            ensure_symlink ".github/belmont" "../.agents/skills/belmont"
            ;;
    esac
}

# ============================================================
# Install
# ============================================================

# --- Step 1: Install agents to .agents/belmont/ ---
echo "Installing agents to .agents/belmont/..."
sync_directory "$BELMONT_DIR/agents/belmont" ".agents/belmont"
echo ""

# --- Step 2: Install skills to canonical location ---
echo "Installing skills to .agents/skills/belmont/..."
sync_directory "$BELMONT_DIR/skills/belmont" ".agents/skills/belmont"
echo ""

# --- Step 3: Set up tool integrations (symlinks) ---
for tool in "${SELECTED_TOOLS[@]}"; do
    setup_tool "$tool"
    echo ""
done

if [ ${#SELECTED_TOOLS[@]} -eq 0 ]; then
    echo "Skipped tool linking."
    echo "Skills are in .agents/skills/belmont/ -- reference them from your tool."
    echo ""
fi

# --- Step 4: Create .belmont state directory ---
BELMONT_STATE=".belmont"

if [ ! -d "$BELMONT_STATE" ]; then
    echo "Creating $BELMONT_STATE/ directory..."
    mkdir -p "$BELMONT_STATE"
fi

if [ ! -f "$BELMONT_STATE/PRD.md" ]; then
    cat > "$BELMONT_STATE/PRD.md" << 'PRDEOF'
Run the /belmont:product-plan skill to create a plan for your feature.
PRDEOF
    echo "  + $BELMONT_STATE/PRD.md"
else
    echo "  Exists: $BELMONT_STATE/PRD.md (keeping)"
fi

if [ ! -f "$BELMONT_STATE/PROGRESS.md" ]; then
    cat > "$BELMONT_STATE/PROGRESS.md" << 'PROGRESSEOF'
# Progress: [Feature Name]

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
PROGRESSEOF
    echo "  + $BELMONT_STATE/PROGRESS.md"
else
    echo "  Exists: $BELMONT_STATE/PROGRESS.md (keeping)"
fi

# --- Step 5: Handle .gitignore ---
echo ""
GITIGNORE=".gitignore"

BELMONT_IN_GITIGNORE=false
if [ -f "$GITIGNORE" ] && grep -qE "^\s*\.belmont/?(\s|$)" "$GITIGNORE" 2>/dev/null; then
    BELMONT_IN_GITIGNORE=true
fi

if $BELMONT_IN_GITIGNORE; then
    echo ".belmont is already in .gitignore"
elif [ -f "$GITIGNORE" ]; then
    read -p "Add .belmont to .gitignore? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "" >> "$GITIGNORE"
        echo "# Belmont local state" >> "$GITIGNORE"
        echo ".belmont/" >> "$GITIGNORE"
        echo "Added .belmont/ to .gitignore"
    fi
else
    read -p "Create .gitignore with .belmont entry? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "# Belmont local state" > "$GITIGNORE"
        echo ".belmont/" >> "$GITIGNORE"
        echo "Created .gitignore with .belmont/ entry"
    fi
fi

# --- Summary ---
echo ""
echo "Belmont installed!"
echo ""
echo "Agents:  .agents/belmont/"
echo "Skills:  .agents/skills/belmont/"
echo "State:   .belmont/"

if [ ${#SELECTED_TOOLS[@]} -gt 0 ]; then
    echo ""
    echo "Tool integrations (symlinks):"
    for tool in "${SELECTED_TOOLS[@]}"; do
        case "$tool" in
            claude)
                echo "  Claude Code  .claude/commands/belmont -> .agents/skills/belmont"
                echo "    Use: /belmont:product-plan, /belmont:tech-plan, /belmont:implement, /belmont:next, /belmont:verify, /belmont:status"
                ;;
            codex)
                echo "  Codex        .codex/belmont -> .agents/skills/belmont"
                echo "    Use: Reference belmont files in Codex"
                ;;
            cursor)
                echo "  Cursor       .cursor/rules/belmont/*.mdc -> .agents/skills/belmont/*.md"
                echo "    Use: Reference belmont rules in Composer/Agent, or toggle in Settings > Rules"
                ;;
            windsurf)
                echo "  Windsurf     .windsurf/rules/belmont -> .agents/skills/belmont"
                echo "    Use: Reference belmont rules in Cascade"
                ;;
            gemini)
                echo "  Gemini       .gemini/rules/belmont -> .agents/skills/belmont"
                echo "    Use: Reference belmont rules in Gemini"
                ;;
            copilot)
                echo "  Copilot      .github/belmont -> .agents/skills/belmont"
                echo "    Use: Reference belmont files in Copilot Chat"
                ;;
        esac
    done
fi

echo ""
echo "Workflow:"
echo "  1. Plan       - Create PRD interactively"
echo "  2. Tech Plan  - Create technical implementation plan"
echo "  3. Implement  - Implement next milestone (full pipeline)"
echo "  4. Next       - Implement next single task (lightweight)"
echo "  5. Verify     - Run verification and code review"
echo "  6. Status     - View progress"
echo "  7. Reset      - Reset state and start fresh"
echo ""
