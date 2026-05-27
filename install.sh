#!/usr/bin/env bash
# Belmont curl-pipe-sh installer (§13.1 secondary channel).
#
# Usage:
#   curl -sSL https://belmont.dev/install | bash
#
# What it does:
#   1. Verifies Node 22+ is on PATH (Belmont's `engines.node`).
#   2. Verifies `npm` is on PATH (the actual installer).
#   3. Runs `npm install -g @belmont/cli` and surfaces the result.
#   4. Probes for PATH issues (the typical "global bin not on PATH"
#      case on macOS / homebrew Node setups) and prints a hint when
#      `belmont` is not callable after install.
#
# This script never installs Node itself — that's a deliberate scope
# choice. The "Node missing" path always exits non-zero with a clear
# message pointing the user at https://nodejs.org so they can choose
# their own package manager (brew, nvm, fnm, …).

set -euo pipefail

BELMONT_PKG="${BELMONT_PKG:-@belmont/cli}"
BELMONT_VERSION_TAG="${BELMONT_VERSION_TAG:-latest}"
REQUIRED_NODE_MAJOR=22

step() { printf "\n=> %s\n" "$1"; }
note() { printf "   %s\n" "$1"; }
fail() { printf "\n[belmont-install] ERROR: %s\n" "$1" >&2; exit 1; }

step "Belmont installer (@belmont/cli@${BELMONT_VERSION_TAG})"

# 1. Node check.
if ! command -v node >/dev/null 2>&1; then
  fail "Node ${REQUIRED_NODE_MAJOR}+ not found on PATH.
Install Node from https://nodejs.org (or use brew/nvm/fnm) and re-run:
   curl -sSL https://belmont.dev/install | bash"
fi

NODE_VERSION="$(node --version 2>/dev/null || true)"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -E 's/^v?([0-9]+).*/\1/')"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  fail "Found node ${NODE_VERSION}; Belmont requires Node ${REQUIRED_NODE_MAJOR}+.
Upgrade Node (https://nodejs.org) and re-run the installer."
fi
note "node ${NODE_VERSION}"

# 2. npm check.
if ! command -v npm >/dev/null 2>&1; then
  fail "npm not found on PATH. It usually ships with Node; ensure your
Node install includes npm, then re-run the installer."
fi
note "npm $(npm --version 2>/dev/null || echo 'unknown')"

# 3. Install.
step "Running: npm install -g ${BELMONT_PKG}@${BELMONT_VERSION_TAG}"
if ! npm install -g "${BELMONT_PKG}@${BELMONT_VERSION_TAG}"; then
  fail "npm install -g ${BELMONT_PKG}@${BELMONT_VERSION_TAG} failed.
If the failure mentions EACCES / permissions, see:
   https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
Otherwise rerun with verbose output:
   npm install -g --verbose ${BELMONT_PKG}@${BELMONT_VERSION_TAG}"
fi

# 4. Smoke + PATH hint.
step "Smoke: belmont --version"
if command -v belmont >/dev/null 2>&1; then
  belmont --version
  note "Belmont is on PATH. Try: belmont init"
  exit 0
fi

# The global bin is installed but not on PATH. Resolve npm's global bin
# and print a single, copy-pasteable PATH-fix hint.
NPM_BIN="$(npm bin -g 2>/dev/null || npm config get prefix 2>/dev/null | sed 's:/*$::')"
if [ -n "$NPM_BIN" ] && [ -d "$NPM_BIN/bin" ]; then
  NPM_BIN="$NPM_BIN/bin"
fi
SHELL_RC="${HOME}/.zshrc"
case "${SHELL:-}" in
  */bash) SHELL_RC="${HOME}/.bashrc" ;;
  */zsh)  SHELL_RC="${HOME}/.zshrc" ;;
  */fish) SHELL_RC="${HOME}/.config/fish/config.fish" ;;
esac

cat <<EOF

[belmont-install] Installed, but \`belmont\` is not on PATH.

Add npm's global bin to your shell:
  echo 'export PATH="${NPM_BIN:-\$(npm bin -g)}:\$PATH"' >> "${SHELL_RC}"
  source "${SHELL_RC}"

Then:
  belmont --version

EOF
exit 0
