#!/bin/bash
set -e

# Build belmont with embedded skills/agents and version injection.
#
# Usage:
#   ./scripts/build.sh              Build for current platform (version: dev)
#   ./scripts/build.sh 0.2.0        Build with version 0.2.0
#   GOOS=linux GOARCH=amd64 ./scripts/build.sh 0.2.0   Cross-compile

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

VERSION="${1:-dev}"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

TARGET_GOOS="${GOOS:-$(go env GOOS)}"
TARGET_GOARCH="${GOARCH:-$(go env GOARCH)}"

OUT_DIR="$ROOT/dist"
OUT_NAME="belmont-${TARGET_GOOS}-${TARGET_GOARCH}"
if [ "$TARGET_GOOS" = "windows" ]; then
    OUT_NAME="${OUT_NAME}.exe"
fi

echo "Building belmont ${VERSION} (${TARGET_GOOS}/${TARGET_GOARCH})..."

# Copy skills and agents into cmd/belmont/ for go:embed
cp -r "$ROOT/skills" "$ROOT/cmd/belmont/skills"
cp -r "$ROOT/agents" "$ROOT/cmd/belmont/agents"

cleanup() {
    rm -rf "$ROOT/cmd/belmont/skills" "$ROOT/cmd/belmont/agents"
}
trap cleanup EXIT

LDFLAGS="-s -w"
LDFLAGS="$LDFLAGS -X main.Version=${VERSION}"
LDFLAGS="$LDFLAGS -X main.CommitSHA=${COMMIT}"
LDFLAGS="$LDFLAGS -X main.BuildDate=${BUILD_DATE}"

mkdir -p "$OUT_DIR"

GOOS="$TARGET_GOOS" GOARCH="$TARGET_GOARCH" go build \
    -tags embed \
    -ldflags "$LDFLAGS" \
    -o "$OUT_DIR/$OUT_NAME" \
    ./cmd/belmont

echo "  + $OUT_DIR/$OUT_NAME"
echo ""
echo "Done."
