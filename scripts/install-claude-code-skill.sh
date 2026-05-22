#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${1:-java-code-intelligence}"
DESTINATION_ROOT="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$REPO_ROOT/skills/$SKILL_NAME"
DESTINATION="$DESTINATION_ROOT/$SKILL_NAME"

if [ ! -d "$SOURCE" ]; then
  echo "Skill source not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$DESTINATION_ROOT"
rm -rf "$DESTINATION"
cp -R "$SOURCE" "$DESTINATION"

echo "Installed Claude Code skill:"
echo "  $DESTINATION"
echo ""
echo "Restart Claude Code if this is the first skill directory created in this session."
echo "Invoke with:"
echo "  /$SKILL_NAME"
