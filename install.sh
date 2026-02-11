#!/bin/sh
set -e

# Belmont installer — downloads the latest release binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/blake-simpson/belmont/main/install.sh | sh
#
# Environment variables:
#   BELMONT_INSTALL_DIR  Override install directory (default: ~/.local/bin)

REPO="blake-simpson/belmont"
INSTALL_DIR="${BELMONT_INSTALL_DIR:-$HOME/.local/bin}"

detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux)  OS="linux" ;;
        Darwin) OS="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
        *)
            echo "Error: unsupported OS: $OS"
            exit 1
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)  ARCH="amd64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)
            echo "Error: unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
}

fetch_latest_tag() {
    if command -v curl >/dev/null 2>&1; then
        TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
    elif command -v wget >/dev/null 2>&1; then
        TAG=$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
    else
        echo "Error: curl or wget required"
        exit 1
    fi

    if [ -z "$TAG" ]; then
        echo "Error: could not determine latest release"
        exit 1
    fi
}

download_binary() {
    ASSET="belmont-${OS}-${ARCH}"
    if [ "$OS" = "windows" ]; then
        ASSET="${ASSET}.exe"
    fi

    URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
    DEST="${INSTALL_DIR}/belmont"
    if [ "$OS" = "windows" ]; then
        DEST="${DEST}.exe"
    fi

    echo "Downloading belmont ${TAG} for ${OS}/${ARCH}..."

    mkdir -p "$INSTALL_DIR"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$URL" -o "$DEST"
    else
        wget -qO "$DEST" "$URL"
    fi

    chmod +x "$DEST"
    echo "  + $DEST"
}

check_path() {
    case ":$PATH:" in
        *":$INSTALL_DIR:"*) ;;
        *)
            echo ""
            echo "Note: $INSTALL_DIR is not in your PATH."
            echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
            echo ""
            echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
            ;;
    esac
}

main() {
    echo "Belmont Installer"
    echo "================="
    echo ""

    detect_platform
    fetch_latest_tag
    download_binary
    check_path

    echo ""
    echo "Installed belmont ${TAG}!"
    echo ""
    echo "Next steps:"
    echo "  cd ~/your-project"
    echo "  belmont install"
    echo ""
    echo "To update later: belmont update"
}

main
