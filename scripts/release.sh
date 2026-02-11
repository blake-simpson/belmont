#!/bin/bash
set -e

# Prepare a belmont release: generate changelog, commit, and tag.
#
# Usage:
#   ./scripts/release.sh 0.2.0
#
# After running:
#   git push origin main --tags
#   (GitHub Actions will build binaries and create the release)

if [ -z "$1" ]; then
    echo "Usage: ./scripts/release.sh <version>"
    echo "Example: ./scripts/release.sh 0.2.0"
    exit 1
fi

VERSION="$1"
TAG="v${VERSION}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: uncommitted changes detected. Commit or stash before releasing."
    exit 1
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Error: tag $TAG already exists."
    exit 1
fi

# Find the previous tag
PREV_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"

echo "Preparing release ${TAG}..."
echo ""

# Generate changelog entry
CHANGELOG_FILE="$ROOT/CHANGELOG.md"
ENTRY="## ${TAG}\n\n"
ENTRY+="**Released:** $(date -u +%Y-%m-%d)\n\n"

if [ -n "$PREV_TAG" ]; then
    ENTRY+="### Changes since ${PREV_TAG}\n\n"
    COMMITS=$(git log "${PREV_TAG}..HEAD" --pretty=format:"- %s" --no-merges)
else
    ENTRY+="### Changes\n\n"
    COMMITS=$(git log --pretty=format:"- %s" --no-merges)
fi

ENTRY+="${COMMITS}\n"

# Prepend to CHANGELOG.md
if [ -f "$CHANGELOG_FILE" ]; then
    EXISTING=$(cat "$CHANGELOG_FILE")
    # Remove the header, prepend new entry after it
    HEADER="# Changelog"
    REST="${EXISTING#*$HEADER}"
    printf "%s\n\n%b\n%s" "$HEADER" "$ENTRY" "$REST" > "$CHANGELOG_FILE"
else
    printf "# Changelog\n\n%b\n" "$ENTRY" > "$CHANGELOG_FILE"
fi

echo "Updated CHANGELOG.md"

# Commit and tag
git add CHANGELOG.md
git commit -m "Release ${TAG}"
git tag -a "$TAG" -m "Release ${TAG}"

echo ""
echo "Release ${TAG} prepared!"
echo ""
echo "Next steps:"
echo "  git push origin main --tags"
echo ""
echo "GitHub Actions will automatically:"
echo "  1. Cross-compile for all platforms"
echo "  2. Create a GitHub Release with binaries"
echo "  3. Generate SHA-256 checksums"
