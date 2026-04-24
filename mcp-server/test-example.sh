#!/bin/bash

# Test script to verify temporary configuration handling
# Run from mcp-server directory

set -e

echo "========================================"
echo "Configuration Handling Test"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
PARENT_DIR=".."
REPOS_JSON="$PARENT_DIR/repos.json"
REPOS_BACKUP="$PARENT_DIR/repos.json.backup"
TEST_REPO="$PARENT_DIR/test-java-code"

echo "📁 Test repository: $TEST_REPO"
echo ""

# Test 1: No original config
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: No original repos.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Clean up
rm -f "$REPOS_JSON" "$REPOS_BACKUP"
echo "✓ Cleaned up existing config files"

# Run analysis
echo ""
echo "Running analysis..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code","mode":"security"}}}' | node dist/server.js > /dev/null 2>&1

# Check results
if [ ! -f "$REPOS_JSON" ]; then
    echo -e "${GREEN}✓ PASS: No repos.json left behind${NC}"
else
    echo -e "${RED}✗ FAIL: repos.json exists (should be cleaned up)${NC}"
fi

if [ ! -f "$REPOS_BACKUP" ]; then
    echo -e "${GREEN}✓ PASS: No backup file left behind${NC}"
else
    echo -e "${RED}✗ FAIL: Backup file exists (should be cleaned up)${NC}"
fi

echo ""

# Test 2: With original config
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: With original repos.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create original config
cat > "$REPOS_JSON" <<EOF
[
  {
    "name": "original-repo",
    "path": "/original/path",
    "language": "java",
    "type": "backend"
  }
]
EOF
echo "✓ Created original repos.json"
echo ""

# Save content for comparison
ORIGINAL_CONTENT=$(cat "$REPOS_JSON")

# Run analysis
echo "Running analysis..."
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code","mode":"bugs"}}}' | node dist/server.js > /dev/null 2>&1

# Check results
CURRENT_CONTENT=$(cat "$REPOS_JSON")

if [ "$ORIGINAL_CONTENT" = "$CURRENT_CONTENT" ]; then
    echo -e "${GREEN}✓ PASS: Original repos.json restored exactly${NC}"
else
    echo -e "${RED}✗ FAIL: repos.json content changed${NC}"
    echo "Expected:"
    echo "$ORIGINAL_CONTENT"
    echo ""
    echo "Got:"
    echo "$CURRENT_CONTENT"
fi

if [ ! -f "$REPOS_BACKUP" ]; then
    echo -e "${GREEN}✓ PASS: Backup file cleaned up${NC}"
else
    echo -e "${RED}✗ FAIL: Backup file still exists${NC}"
fi

echo ""

# Test 3: Path normalization (visual check)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Path normalization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Note: This test shows stderr output to see path normalization
echo "Running analysis with debug output..."
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code","mode":"all"}}}' | node dist/server.js 2>&1 | grep "Path normalized" || echo -e "${YELLOW}(No path normalization needed - path already normalized)${NC}"

echo ""

# Test 4: Invalid path (should fail gracefully)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Invalid path (error handling)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Clean up first
rm -f "$REPOS_JSON" "$REPOS_BACKUP"

# Run with invalid path
echo "Running analysis with invalid path..."
RESULT=$(echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"/nonexistent/path/xyz","mode":"all"}}}' | node dist/server.js 2>&1)

# Check for error
if echo "$RESULT" | grep -q "Repository path does not exist"; then
    echo -e "${GREEN}✓ PASS: Error returned for invalid path${NC}"
else
    echo -e "${RED}✗ FAIL: Expected error not found${NC}"
fi

# Check no files left behind
if [ ! -f "$REPOS_JSON" ] && [ ! -f "$REPOS_BACKUP" ]; then
    echo -e "${GREEN}✓ PASS: No config files left behind after error${NC}"
else
    echo -e "${RED}✗ FAIL: Config files exist after error${NC}"
fi

echo ""

# Cleanup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Cleanup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
rm -f "$REPOS_JSON" "$REPOS_BACKUP"
echo "✓ Cleaned up test files"

echo ""
echo "========================================"
echo "Tests Complete"
echo "========================================"
echo ""
echo "Manual verification:"
echo "  1. Check no repos.json.backup exists: ls -la $REPOS_BACKUP"
echo "  2. Run with your own repo to verify"
echo "  3. Check stderr logs for debug messages"
echo ""
