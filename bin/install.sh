#!/bin/bash
set -e

# Belmont install shim (Go-based)
#
# Usage:
#   ./bin/install.sh          Builds belmont and installs into current project
#   ./bin/install.sh --setup  Builds belmont into ~/.local/bin and records source path

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
    SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    [[ $SCRIPT_PATH != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
BELMONT_DIR="$(dirname "$SCRIPT_DIR")"

if ! command -v go >/dev/null 2>&1; then
    echo "Error: Go not found. Install Go to continue."
    exit 1
fi

BIN_DIR="$HOME/.local/bin"
BELMONT_BIN="$BIN_DIR/belmont"

write_config() {
    local config_dir="$HOME/.config/belmont"
    mkdir -p "$config_dir"
    cat > "$config_dir/config.json" << EOFCONF
{
  "source": "$BELMONT_DIR"
}
EOFCONF
}

if [ "$1" = "--setup" ] || [ "$(cd "$(pwd)" && pwd)" = "$(cd "$BELMONT_DIR" && pwd)" ]; then
    echo "Belmont CLI Setup"
    echo "================="
    echo ""
    echo "Belmont directory: $BELMONT_DIR"
    echo ""

    mkdir -p "$BIN_DIR"
    echo "Building belmont..."
    (cd "$BELMONT_DIR" && go build -o "$BELMONT_BIN" ./cmd/belmont)
    echo "  + $BELMONT_BIN"

    write_config

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
    echo "  belmont install"
    echo ""
    exit 0
fi

mkdir -p "$BIN_DIR"
if [ ! -x "$BELMONT_BIN" ]; then
    echo "Building belmont..."
    (cd "$BELMONT_DIR" && go build -o "$BELMONT_BIN" ./cmd/belmont)
    echo "  + $BELMONT_BIN"
fi

"$BELMONT_BIN" install --source "$BELMONT_DIR"
